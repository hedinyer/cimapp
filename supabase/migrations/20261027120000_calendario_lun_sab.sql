-- Talonario lunes a sábado: nuevas asignaciones y reediciones.
-- Compras sin calendario_cobro = lun_sab siguen el calendario histórico.

CREATE OR REPLACE FUNCTION public.skip_domingo(p_fecha date)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN EXTRACT(ISODOW FROM p_fecha) = 7 THEN p_fecha + 1 ELSE p_fecha END;
$$;

CREATE OR REPLACE FUNCTION public.siguiente_dia_cobro(p_fecha date)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.skip_domingo(p_fecha + 1);
$$;

CREATE OR REPLACE FUNCTION public.dias_cobro_periodo_lun_sab(p_frecuencia text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_frecuencia
    WHEN 'diario' THEN 1
    WHEN 'semanal' THEN 6
    WHEN 'quincenal' THEN 12
    WHEN 'mensual' THEN 24
    ELSE 1
  END;
$$;

CREATE OR REPLACE FUNCTION public.periodos_anuales_lun_sab(p_frecuencia text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_frecuencia
    WHEN 'diario' THEN 312
    WHEN 'semanal' THEN 52
    WHEN 'quincenal' THEN 26
    WHEN 'mensual' THEN 13
    ELSE 312
  END;
$$;

CREATE OR REPLACE FUNCTION public.es_calendario_lun_sab(p_admin_data jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_admin_data->>'calendario_cobro', '') = 'lun_sab';
$$;

CREATE OR REPLACE FUNCTION public.insert_tarifas_lun_sab(
  p_compra_id uuid,
  p_user_id bigint,
  p_frecuencia text,
  p_ancla date,
  p_from_numero integer,
  p_to_numero integer,
  p_monto integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_size integer;
  v_count integer;
  v_ancla date;
BEGIN
  IF p_to_numero < p_from_numero OR p_from_numero < 1 THEN
    RETURN;
  END IF;
  IF COALESCE(p_monto, 0) <= 0 THEN
    RETURN;
  END IF;

  v_size := public.dias_cobro_periodo_lun_sab(p_frecuencia);
  v_count := p_to_numero - p_from_numero + 1;
  v_ancla := public.skip_domingo(p_ancla);

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
    p_compra_id,
    p_user_id,
    p_from_numero - 1 + (n.rn / v_size),
    n.dia,
    p_monto,
    NULL,
    'pendiente',
    NULL,
    NULL,
    NULL
  FROM (
    SELECT
      cobro.dia,
      row_number() OVER (ORDER BY cobro.dia) AS rn
    FROM (
      SELECT d::date AS dia
      FROM generate_series(
        v_ancla,
        v_ancla + ((v_count * v_size * 2)),
        interval '1 day'
      ) AS d
      WHERE EXTRACT(ISODOW FROM d) BETWEEN 1 AND 6
    ) cobro
  ) n
  WHERE n.rn % v_size = 0
    AND n.rn / v_size <= v_count;
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

  IF v_compra IS NULL OR v_compra.estado NOT IN ('lista_retiro', 'entregada') THEN
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

CREATE OR REPLACE FUNCTION public.rehacer_tarifas_pendientes_compra(p_compra_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_compra record;
  v_aplicadas integer;
  v_nuevo_total integer;
  v_max_numero integer;
  v_max_fecha date;
  v_start date;
BEGIN
  SELECT * INTO v_compra FROM public.user_moto_compra WHERE id = p_compra_id;
  IF v_compra IS NULL THEN
    RAISE EXCEPTION 'Compra no encontrada.';
  END IF;

  IF NOT public.es_calendario_lun_sab(v_compra.admin_data) THEN
    RAISE EXCEPTION 'Solo se rehace el talonario de contratos lunes a sábado.';
  END IF;

  SELECT COUNT(*) INTO v_aplicadas
  FROM public.tarifas_pagadas
  WHERE user_moto_compra_id = p_compra_id
    AND (
      estado IN ('pagada', 'refinanciada')
      OR (estado = 'vencida' AND COALESCE(monto_pagado, 0) > 0)
    );

  v_nuevo_total := COALESCE(
    NULLIF((v_compra.admin_data->>'periodos_contrato')::integer, 0),
    public.periodos_anuales_lun_sab(v_compra.frecuencia_pago)
  );

  IF v_nuevo_total <= v_aplicadas THEN
    RAISE EXCEPTION
      'No se puede reducir el plazo: ya hay % cuotas aplicadas.',
      v_aplicadas;
  END IF;

  DELETE FROM public.tarifas_pagadas
  WHERE user_moto_compra_id = p_compra_id
    AND (
      estado = 'pendiente'
      OR (estado = 'vencida' AND COALESCE(monto_pagado, 0) = 0)
    );

  SELECT COALESCE(MAX(numero_periodo), 0), MAX(fecha_vencimiento)
  INTO v_max_numero, v_max_fecha
  FROM public.tarifas_pagadas
  WHERE user_moto_compra_id = p_compra_id
    AND estado IS DISTINCT FROM 'refinanciada';

  IF v_max_fecha IS NULL THEN
    v_start := public.compra_fecha_inicio_tarifas(p_compra_id);
    v_max_numero := 0;
  ELSE
    v_start := public.siguiente_dia_cobro(v_max_fecha);
  END IF;

  PERFORM public.insert_tarifas_lun_sab(
    v_compra.id,
    v_compra.user_id,
    v_compra.frecuencia_pago,
    v_start,
    v_max_numero + 1,
    v_nuevo_total,
    v_compra.monto_cuota_periodo
  );
END;
$$;

CREATE OR REPLACE VIEW public.atrasos
WITH (security_invoker = true) AS
SELECT
  c.id                    AS user_moto_compra_id,
  c.user_id,
  c.frecuencia_pago,
  base.fecha_inicio,
  cfg.dias_intervalo,
  calc.periodos_debidos,
  calc.periodos_pagados,
  calc.monto_esperado,
  calc.monto_pagado,
  calc.monto_adeudado,
  calc.fecha_desde_atraso,
  calc.dias_atraso,
  calc.tarifa_vencida_id,
  CASE
    WHEN calc.monto_adeudado <= 0 THEN 'al_dia'
    WHEN calc.dias_atraso >= 3 THEN 'moroso'
    WHEN calc.monto_adeudado > 0 THEN 'vencido'
    ELSE 'al_dia'
  END AS estado
FROM public.user_moto_compra c
LEFT JOIN LATERAL (
  SELECT dc.signed_at
  FROM public.digital_contracts dc
  WHERE dc.user_id = c.user_id
    AND dc.status = 'firmado'
  ORDER BY dc.signed_at DESC NULLS LAST
  LIMIT 1
) dc ON true
CROSS JOIN LATERAL (
  SELECT (now() AT TIME ZONE 'America/Bogota')::date AS v_today
) tz
CROSS JOIN LATERAL (
  SELECT COALESCE(
    (
      SELECT MIN(t.fecha_vencimiento)
      FROM public.tarifas_pagadas t
      WHERE t.user_moto_compra_id = c.id
        AND t.estado IS DISTINCT FROM 'refinanciada'
        AND (
          NOT EXISTS (
            SELECT 1
            FROM public.tarifas_pagadas x
            WHERE x.user_moto_compra_id = c.id
              AND x.estado = 'refinanciada'
          )
          OR t.estado IN ('pendiente', 'vencida')
          OR (
            t.estado = 'pagada'
            AND t.notas ~~* 'Contrato refinanciado%'
          )
        )
    ),
    public.compra_fecha_inicio_tarifas(c.id)
  ) AS fecha_inicio
) base
CROSS JOIN LATERAL (
  SELECT
    tpc.dias_intervalo,
    tpc.total_periodos
  FROM public.tarifa_period_config(c.frecuencia_pago) tpc
) cfg
CROSS JOIN LATERAL (
  SELECT
    COALESCE((
      SELECT SUM(
        LEAST(
          cc.dias,
          GREATEST(
            0,
            tz.v_today - (cc.created_at AT TIME ZONE 'America/Bogota')::date
          )
        )
      )
      FROM public.congelamientos_cuotas cc
      WHERE cc.user_moto_compra_id = c.id
    ), 0)::integer AS dias_congelados,
    (
      SELECT MAX(
        (cc.created_at AT TIME ZONE 'America/Bogota')::date + cc.dias
      )
      FROM public.congelamientos_cuotas cc
      WHERE cc.user_moto_compra_id = c.id
    ) AS freeze_end
) frz
CROSS JOIN LATERAL (
  SELECT (
    EXISTS (
      SELECT 1
      FROM public.tarifas_pagadas t
      WHERE t.user_moto_compra_id = c.id
        AND t.estado = 'refinanciada'
    )
  ) AS tiene_refinanciacion
) refi
CROSS JOIN LATERAL (
  SELECT public.es_calendario_lun_sab(c.admin_data) AS lun_sab
) cal
CROSS JOIN LATERAL (
  SELECT
    GREATEST(0, LEAST(
      CASE
        WHEN cal.lun_sab THEN COALESCE(
          NULLIF((c.admin_data->>'periodos_contrato')::integer, 0),
          cfg.total_periodos
        )
        ELSE cfg.total_periodos
      END,
      CASE
        WHEN cal.lun_sab THEN (
          SELECT COUNT(*)::integer
          FROM public.tarifas_pagadas t
          WHERE t.user_moto_compra_id = c.id
            AND t.estado IS DISTINCT FROM 'refinanciada'
            AND t.fecha_vencimiento <= (tz.v_today - frz.dias_congelados)
        )
        WHEN tz.v_today < base.fecha_inicio THEN 0
        ELSE (
          (tz.v_today - base.fecha_inicio - frz.dias_congelados)
            / NULLIF(cfg.dias_intervalo, 0)
        )::integer + 1
      END
    )) AS periodos_debidos,
    (
      COALESCE((
        SELECT SUM(
          CASE
            WHEN t.estado = 'pagada'
              THEN COALESCE(t.monto_pagado, t.monto_esperado, 0)
            ELSE COALESCE(t.monto_pagado, 0)
          END
        )
        FROM public.tarifas_pagadas t
        WHERE t.user_moto_compra_id = c.id
          AND t.estado IS DISTINCT FROM 'refinanciada'
          AND (
            NOT refi.tiene_refinanciacion
            OR t.estado IN ('pendiente', 'vencida')
            OR (
              t.estado = 'pagada'
              AND t.notas ~~* 'Contrato refinanciado%'
            )
          )
      ), 0)
      + CASE
          WHEN NOT EXISTS (
            SELECT 1
            FROM public.tarifas_pagadas t
            WHERE t.user_moto_compra_id = c.id
              AND t.estado IS DISTINCT FROM 'refinanciada'
          )
          AND c.pago_cuota_confirmado
          THEN c.monto_cuota_periodo
          ELSE 0
        END
      + COALESCE((
        SELECT SUM(p.monto)
        FROM public.pagos p
        WHERE p.user_moto_compra_id = c.id
          AND p.estado = 'confirmado'
          AND COALESCE(p.contexto_pago, 'tarifa') NOT IN (
            'inicial', 'visita', 'cuota_adelantada',
            'producto_inicial', 'producto_cuota', 'liquidacion'
          )
          AND NOT EXISTS (
            SELECT 1
            FROM public.pago_tarifa_aplicaciones pta
            WHERE pta.pago_id = p.id
          )
          AND (
            NOT refi.tiene_refinanciacion
            OR COALESCE(p.confirmado_at, p.created_at)
              >= COALESCE(
                ((c.admin_data -> 'refinanciacion') ->> 'at')::timestamptz,
                '-infinity'::timestamptz
              )
          )
      ), 0)
    )::bigint AS monto_pagado_raw
) paid
CROSS JOIN LATERAL (
  SELECT
    paid.periodos_debidos,
    GREATEST(
      0,
      FLOOR(
        paid.monto_pagado_raw::numeric
          / NULLIF(c.monto_cuota_periodo, 0)::numeric
      )::integer
    ) AS periodos_pagados,
    (paid.periodos_debidos * c.monto_cuota_periodo) AS monto_esperado,
    paid.monto_pagado_raw AS monto_pagado,
    GREATEST(
      0,
      (paid.periodos_debidos * c.monto_cuota_periodo) - paid.monto_pagado_raw
    ) AS monto_adeudado,
    CASE
      WHEN GREATEST(
        0,
        (paid.periodos_debidos * c.monto_cuota_periodo) - paid.monto_pagado_raw
      ) <= 0 THEN NULL
      WHEN cal.lun_sab THEN GREATEST(
        (
          SELECT MIN(t.fecha_vencimiento)
          FROM public.tarifas_pagadas t
          WHERE t.user_moto_compra_id = c.id
            AND t.estado IN ('pendiente', 'vencida')
            AND t.fecha_vencimiento <= tz.v_today
        ),
        frz.freeze_end
      )
      ELSE GREATEST(
        base.fecha_inicio + frz.dias_congelados + (
          GREATEST(
            0,
            FLOOR(
              paid.monto_pagado_raw::numeric
                / NULLIF(c.monto_cuota_periodo, 0)::numeric
            )::integer
          )
        ) * cfg.dias_intervalo,
        frz.freeze_end
      )
    END AS fecha_desde_atraso,
    CASE
      WHEN GREATEST(
        0,
        (paid.periodos_debidos * c.monto_cuota_periodo) - paid.monto_pagado_raw
      ) <= 0 THEN 0
      WHEN frz.freeze_end IS NOT NULL AND tz.v_today < frz.freeze_end THEN 0
      WHEN cal.lun_sab THEN GREATEST(0,
        (tz.v_today - GREATEST(
          COALESCE(
            (
              SELECT MIN(t.fecha_vencimiento)
              FROM public.tarifas_pagadas t
              WHERE t.user_moto_compra_id = c.id
                AND t.estado IN ('pendiente', 'vencida')
                AND t.fecha_vencimiento <= tz.v_today
            ),
            tz.v_today
          ),
          frz.freeze_end
        )) + 1
      )
      ELSE GREATEST(0,
        (tz.v_today - GREATEST(
          base.fecha_inicio + frz.dias_congelados + (
            GREATEST(
              0,
              FLOOR(
                paid.monto_pagado_raw::numeric
                  / NULLIF(c.monto_cuota_periodo, 0)::numeric
              )::integer
            )
          ) * cfg.dias_intervalo,
          frz.freeze_end
        )) + 1
      )
    END AS dias_atraso,
    (
      SELECT t.id
      FROM public.tarifas_pagadas t
      WHERE t.user_moto_compra_id = c.id
        AND t.estado IN ('pendiente', 'vencida')
        AND t.fecha_vencimiento <= tz.v_today
      ORDER BY t.fecha_vencimiento ASC
      LIMIT 1
    ) AS tarifa_vencida_id
) calc
WHERE c.estado = 'entregada';

GRANT SELECT ON public.atrasos TO anon, authenticated;
