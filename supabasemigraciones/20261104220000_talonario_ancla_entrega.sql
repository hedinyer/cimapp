-- Talonario: el contrato corre desde la entrega en CIM.
-- 1ª cuota = día siguiente a fecha_entrega (no al primer pago / lista_retiro).

CREATE OR REPLACE FUNCTION public.compra_fecha_inicio_tarifas(p_compra_id uuid)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entrega date;
BEGIN
  SELECT c.fecha_entrega
  INTO v_entrega
  FROM public.user_moto_compra c
  WHERE c.id = p_compra_id;

  IF NOT FOUND THEN
    RETURN (now() AT TIME ZONE 'America/Bogota')::date + 1;
  END IF;

  -- Sin entrega aún: sin obligación de canon (evita mora fantasma en lista_retiro).
  IF v_entrega IS NULL THEN
    RETURN DATE '9999-12-31';
  END IF;

  RETURN v_entrega + 1;
END;
$$;

COMMENT ON FUNCTION public.compra_fecha_inicio_tarifas(uuid) IS
  'Vencimiento del periodo 1: día siguiente a fecha_entrega en CIM. Sin entrega → 9999-12-31.';

CREATE OR REPLACE FUNCTION public.realinear_tarifas_por_entrega(p_compra_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new date;
  v_old date;
  v_delta integer;
BEGIN
  v_new := public.compra_fecha_inicio_tarifas(p_compra_id);
  IF v_new >= DATE '9999-01-01' THEN
    RETURN;
  END IF;

  SELECT MIN(t.fecha_vencimiento)
  INTO v_old
  FROM public.tarifas_pagadas t
  WHERE t.user_moto_compra_id = p_compra_id
    AND t.estado IS DISTINCT FROM 'refinanciada';

  IF v_old IS NULL OR v_old = v_new THEN
    RETURN;
  END IF;

  v_delta := v_new - v_old;

  UPDATE public.tarifas_pagadas
  SET
    fecha_vencimiento = fecha_vencimiento + v_delta,
    updated_at = now()
  WHERE user_moto_compra_id = p_compra_id
    AND estado IS DISTINCT FROM 'refinanciada';
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_tarifas_for_compra(p_compra_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_compra record;
  v_total integer;
  v_intervalo integer;
  v_fecha_inicio date;
  v_pago record;
  v_tiene_adelantada boolean;
  v_cobra_adelantada boolean;
  v_cuota_contrato integer;
  v_monto_adelantada integer;
  v_lun_sab boolean;
BEGIN
  SELECT * INTO v_compra FROM public.user_moto_compra WHERE id = p_compra_id;

  -- Solo tras entrega material en CIM.
  IF v_compra IS NULL
     OR v_compra.estado IS DISTINCT FROM 'entregada'
     OR v_compra.fecha_entrega IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tarifas_pagadas WHERE user_moto_compra_id = p_compra_id
  ) THEN
    RETURN;
  END IF;

  IF COALESCE(v_compra.monto_cuota_periodo, 0) <= 0 THEN
    SELECT (dc.contrato_data->>'valor_cuota')::integer
    INTO v_cuota_contrato
    FROM public.digital_contracts dc
    WHERE dc.user_id = v_compra.user_id
      AND dc.status = 'firmado'
    ORDER BY dc.signed_at DESC NULLS LAST
    LIMIT 1;

    IF v_cuota_contrato IS NULL OR v_cuota_contrato <= 0 THEN
      RETURN;
    END IF;

    UPDATE public.user_moto_compra
    SET monto_cuota_periodo = v_cuota_contrato
    WHERE id = p_compra_id;

    v_compra.monto_cuota_periodo := v_cuota_contrato;
  END IF;

  v_lun_sab := public.es_calendario_lun_sab(v_compra.admin_data);
  v_fecha_inicio := public.compra_fecha_inicio_tarifas(p_compra_id);

  IF v_lun_sab THEN
    v_total := COALESCE(
      NULLIF((v_compra.admin_data->>'periodos_contrato')::integer, 0),
      public.periodos_anuales_lun_sab(v_compra.frecuencia_pago)
    );
    PERFORM public.insert_tarifas_lun_sab(
      v_compra.id,
      v_compra.user_id,
      v_compra.frecuencia_pago,
      v_fecha_inicio,
      1,
      v_total,
      v_compra.monto_cuota_periodo
    );
  ELSE
    SELECT total_periodos, dias_intervalo
    INTO v_total, v_intervalo
    FROM public.tarifa_period_config(v_compra.frecuencia_pago);

    INSERT INTO public.tarifas_pagadas (
      user_moto_compra_id,
      user_id,
      numero_periodo,
      fecha_vencimiento,
      monto_esperado,
      monto_pagado,
      estado,
      pagada_at,
      confirmada_por,
      notas
    )
    SELECT
      v_compra.id,
      v_compra.user_id,
      g,
      v_fecha_inicio + ((g - 1) * v_intervalo),
      v_compra.monto_cuota_periodo,
      NULL,
      'pendiente',
      NULL,
      NULL,
      NULL
    FROM generate_series(1, v_total) AS g;
  END IF;

  v_tiene_adelantada := FALSE;
  FOR v_pago IN
    SELECT id
    FROM public.pagos
    WHERE user_moto_compra_id = p_compra_id
      AND estado = 'confirmado'
      AND contexto_pago = 'cuota_adelantada'
    ORDER BY confirmado_at NULLS LAST, created_at
  LOOP
    v_tiene_adelantada := TRUE;
    PERFORM public.aplicar_cuota_adelantada_a_tarifas(v_pago.id);
  END LOOP;

  v_monto_adelantada := COALESCE(v_compra.monto_cuota_adelantada, 0);
  v_cobra_adelantada := COALESCE(
    (v_compra.admin_data->>'cobra_cuota_adelantada')::boolean,
    v_monto_adelantada > 0
  );

  IF NOT v_tiene_adelantada
     AND v_compra.pago_cuota_confirmado
     AND v_monto_adelantada > 0
     AND v_cobra_adelantada
  THEN
    UPDATE public.tarifas_pagadas
    SET
      monto_pagado = monto_esperado,
      estado = 'pagada',
      pagada_at = COALESCE(v_compra.pago_cuota_confirmado_at, now()),
      confirmada_por = 'sistema',
      notas = 'Cuota adelantada al retiro',
      updated_at = now()
    WHERE user_moto_compra_id = p_compra_id
      AND numero_periodo = 1;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_tarifas_on_entrega()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.estado IS DISTINCT FROM 'entregada' OR NEW.fecha_entrega IS NULL THEN
    RETURN NEW;
  END IF;

  -- Primera entrega: descarta talonario prematuro (lista_retiro) si aún no hay pagos aplicados.
  IF OLD.estado IS DISTINCT FROM 'entregada' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.tarifas_pagadas t
      WHERE t.user_moto_compra_id = NEW.id
        AND (
          t.estado IN ('pagada', 'refinanciada')
          OR COALESCE(t.monto_pagado, 0) > 0
        )
    ) THEN
      DELETE FROM public.tarifas_pagadas
      WHERE user_moto_compra_id = NEW.id;
    END IF;

    PERFORM public.generate_tarifas_for_compra(NEW.id);
    RETURN NEW;
  END IF;

  -- Corrección de fecha_entrega con moto ya entregada: desplaza el calendario.
  IF OLD.fecha_entrega IS DISTINCT FROM NEW.fecha_entrega THEN
    IF EXISTS (
      SELECT 1 FROM public.tarifas_pagadas WHERE user_moto_compra_id = NEW.id
    ) THEN
      PERFORM public.realinear_tarifas_por_entrega(NEW.id);
    ELSE
      PERFORM public.generate_tarifas_for_compra(NEW.id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Talonarios creados en lista_retiro sin entrega: se regeneran al entregar.
DELETE FROM public.tarifas_pagadas t
USING public.user_moto_compra c
WHERE t.user_moto_compra_id = c.id
  AND c.estado = 'lista_retiro'
  AND c.fecha_entrega IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.tarifas_pagadas x
    WHERE x.user_moto_compra_id = c.id
      AND (
        x.estado IN ('pagada', 'refinanciada')
        OR COALESCE(x.monto_pagado, 0) > 0
      )
  );
