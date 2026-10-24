-- Historial del chat AI test. El anon no lee la tabla: solo vía RPC con secreto de servidor.

create schema if not exists private;

create table if not exists private.ai_test_secret (
  id int primary key default 1 check (id = 1),
  valor text not null
);

revoke all on schema private from public, anon, authenticated;
revoke all on table private.ai_test_secret from public, anon, authenticated;

create table if not exists public.ai_test_transcripts (
  user_id bigint primary key references public.users (id),
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.ai_test_transcripts enable row level security;
revoke all on table public.ai_test_transcripts from public, anon, authenticated;

create or replace function public.ai_test_leer(p_secret text, p_user_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  esperado text;
begin
  select valor into esperado from private.ai_test_secret where id = 1;
  if esperado is null or p_secret is distinct from esperado then
    raise exception 'no autorizado';
  end if;
  return (
    select payload from public.ai_test_transcripts where user_id = p_user_id
  );
end;
$$;

create or replace function public.ai_test_guardar(
  p_secret text,
  p_user_id bigint,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  esperado text;
begin
  select valor into esperado from private.ai_test_secret where id = 1;
  if esperado is null or p_secret is distinct from esperado then
    raise exception 'no autorizado';
  end if;
  if p_user_id is null or jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'payload inválido';
  end if;
  insert into public.ai_test_transcripts (user_id, payload)
  values (p_user_id, p_payload)
  on conflict (user_id) do update
    set payload = excluded.payload,
        updated_at = now();
end;
$$;

revoke all on function public.ai_test_leer(text, bigint) from public;
revoke all on function public.ai_test_guardar(text, bigint, jsonb) from public;
grant execute on function public.ai_test_leer(text, bigint) to anon, authenticated;
grant execute on function public.ai_test_guardar(text, bigint, jsonb) to anon, authenticated;
