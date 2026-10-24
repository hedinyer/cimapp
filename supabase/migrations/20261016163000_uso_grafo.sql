-- Grafo de uso del panel. Cada sesión es un camino de aristas.
-- El secreto lo usa solo el servidor.

create table if not exists public.uso_sesiones (
  id uuid primary key,
  user_id integer,
  username text not null,
  started_at timestamptz not null default now()
);

create table if not exists public.uso_nodos (
  id text primary key,
  tipo text not null,
  nombre text not null
);

create table if not exists public.uso_aristas (
  id bigint generated always as identity primary key,
  sesion_id uuid not null references public.uso_sesiones (id),
  user_id integer,
  username text not null,
  orden integer not null,
  desde_id text references public.uso_nodos (id),
  hasta_id text not null references public.uso_nodos (id),
  tipo text not null,
  ok boolean,
  texto text not null,
  detalle jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);

create index if not exists uso_aristas_sesion_orden_idx
  on public.uso_aristas (sesion_id, orden);

create index if not exists uso_aristas_username_at_idx
  on public.uso_aristas (username, at desc);

alter table public.uso_sesiones enable row level security;
alter table public.uso_nodos enable row level security;
alter table public.uso_aristas enable row level security;

revoke all on table public.uso_sesiones from anon, authenticated;
revoke all on table public.uso_nodos from anon, authenticated;
revoke all on table public.uso_aristas from anon, authenticated;

create or replace function public.registrar_uso_lote(
  p_secret text,
  p_sesion uuid,
  p_user_id integer,
  p_username text,
  p_eventos jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  evento jsonb;
  nodo text;
  nodo_tipo text;
  nodo_nombre text;
  previo text;
  n integer;
begin
  if p_secret is distinct from 'all4cfl-uso-grafo' then
    raise exception 'no autorizado';
  end if;
  if p_sesion is null or p_username is null or jsonb_typeof(p_eventos) is distinct from 'array' then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext(p_sesion::text));

  insert into public.uso_sesiones (id, user_id, username)
  values (p_sesion, p_user_id, left(p_username, 80))
  on conflict (id) do nothing;

  for evento in select value from jsonb_array_elements(p_eventos) loop
    nodo := left(coalesce(evento->>'nodo', ''), 160);
    nodo_tipo := left(coalesce(evento->>'nodoTipo', 'paso'), 40);
    nodo_nombre := left(coalesce(evento->>'nodoNombre', nodo), 160);
    if nodo = '' then
      continue;
    end if;

    insert into public.uso_nodos (id, tipo, nombre)
    values (nodo, nodo_tipo, nodo_nombre)
    on conflict (id) do nothing;

    select hasta_id, orden into previo, n
    from public.uso_aristas
    where sesion_id = p_sesion
    order by orden desc
    limit 1;

    insert into public.uso_aristas (
      sesion_id, user_id, username, orden, desde_id, hasta_id, tipo, ok, texto, detalle
    ) values (
      p_sesion,
      p_user_id,
      left(p_username, 80),
      coalesce(n, 0) + 1,
      previo,
      nodo,
      left(coalesce(evento->>'tipo', 'paso'), 40),
      case when evento ? 'ok' then (evento->>'ok')::boolean else null end,
      left(coalesce(evento->>'texto', nodo_nombre), 500),
      coalesce(evento->'detalle', '{}'::jsonb)
    );
  end loop;
end;
$$;

create or replace function public.exportar_uso_trayectorias(
  p_secret text,
  p_limit integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if p_secret is distinct from 'all4cfl-uso-grafo' then
    raise exception 'no autorizado';
  end if;

  select coalesce(jsonb_agg(trayectoria order by started_at desc), '[]'::jsonb)
  into result
  from (
    select
      s.started_at,
      jsonb_build_object(
        'sesion_id', s.id,
        'username', s.username,
        'started_at', s.started_at,
        'nodos', (
          select coalesce(jsonb_agg(a.hasta_id order by a.orden), '[]'::jsonb)
          from public.uso_aristas a
          where a.sesion_id = s.id
        ),
        'aristas', (
          select coalesce(jsonb_agg(
            jsonb_build_object(
              'desde', a.desde_id,
              'hasta', a.hasta_id,
              'tipo', a.tipo,
              'ok', a.ok,
              'texto', a.texto
            ) order by a.orden
          ), '[]'::jsonb)
          from public.uso_aristas a
          where a.sesion_id = s.id
        ),
        'recorrido', (
          select coalesce(string_agg(a.orden || '. ' || a.texto, E'\n' order by a.orden), '')
          from public.uso_aristas a
          where a.sesion_id = s.id
        )
      ) as trayectoria
    from public.uso_sesiones s
    order by s.started_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
  ) filas;

  return result;
end;
$$;

revoke all on function public.registrar_uso_lote(text, uuid, integer, text, jsonb) from public;
revoke all on function public.exportar_uso_trayectorias(text, integer) from public;
grant execute on function public.registrar_uso_lote(text, uuid, integer, text, jsonb) to anon, authenticated, service_role;
grant execute on function public.exportar_uso_trayectorias(text, integer) to anon, authenticated, service_role;
