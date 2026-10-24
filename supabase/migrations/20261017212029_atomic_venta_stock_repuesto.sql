create or replace function public.registrar_venta_producto(
  p_cliente_nombre text,
  p_cliente_cedula text,
  p_cliente_celular text,
  p_total integer,
  p_monto_pagado integer,
  p_notas text,
  p_items jsonb
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
  item jsonb;
begin
  if p_monto_pagado > p_total then
    raise exception 'El pago no puede superar el total de la venta.';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Agrega al menos un producto.';
  end if;
  insert into public.ventas_producto (
    cliente_nombre, cliente_cedula, cliente_celular, total, monto_pagado, notas
  ) values (
    p_cliente_nombre,
    nullif(btrim(p_cliente_cedula), ''),
    p_cliente_celular,
    p_total,
    p_monto_pagado,
    nullif(btrim(p_notas), '')
  ) returning id into v_id;
  for item in select value from jsonb_array_elements(p_items)
  loop
    insert into public.venta_producto_items (
      venta_id, producto_id, cantidad, precio_unitario, subtotal, ubicacion
    ) values (
      v_id,
      (item->>'producto_id')::bigint,
      (item->>'cantidad')::integer,
      (item->>'precio_unitario')::integer,
      (item->>'subtotal')::integer,
      item->>'ubicacion'
    );
    perform public.descontar_stock_ubicacion(
      (item->>'producto_id')::bigint,
      item->>'ubicacion',
      (item->>'cantidad')::integer
    );
  end loop;
  return v_id;
end;
$$;

revoke all on function public.registrar_venta_producto(text, text, text, integer, integer, text, jsonb) from public, anon, authenticated;
grant execute on function public.registrar_venta_producto(text, text, text, integer, integer, text, jsonb) to service_role;

create or replace function public.guardar_stock_sedes(
  p_producto_id bigint,
  p_soluciones integer,
  p_bera integer,
  p_bodega integer,
  p_gaveta text
) returns void
language plpgsql
set search_path = public
as $$
begin
  perform public.ensure_stock_ubicaciones(p_producto_id);
  insert into public.inventario_stock_ubicaciones (producto_id, ubicacion, cantidad, gaveta, updated_at)
  values
    (p_producto_id, 'Soluciones', p_soluciones, null, now()),
    (p_producto_id, 'Bera', p_bera, null, now()),
    (p_producto_id, 'Bodega', p_bodega, case when p_bodega > 0 then nullif(btrim(p_gaveta), '') else null end, now())
  on conflict (producto_id, ubicacion) do update
  set cantidad = excluded.cantidad, gaveta = excluded.gaveta, updated_at = now();
  perform public.sync_producto_stock_total(p_producto_id);
end;
$$;

revoke all on function public.guardar_stock_sedes(bigint, integer, integer, integer, text) from public, anon, authenticated;
grant execute on function public.guardar_stock_sedes(bigint, integer, integer, integer, text) to service_role;

create or replace function public.quitar_repuesto_orden(p_repuesto_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_estado text;
begin
  select estado into v_estado
  from public.orden_taller_repuestos
  where id = p_repuesto_id
  for update;
  if not found then
    raise exception 'Este pedido ya no existe.';
  end if;
  if v_estado = 'aprobado' then
    perform public.taller_revertir_repuesto(p_repuesto_id);
  end if;
  delete from public.orden_taller_repuestos where id = p_repuesto_id;
end;
$$;

revoke all on function public.quitar_repuesto_orden(uuid) from public, anon, authenticated;
grant execute on function public.quitar_repuesto_orden(uuid) to service_role;
