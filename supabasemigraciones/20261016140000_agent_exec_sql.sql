-- SQL del agente All4CFL. El secreto lo conoce solo el servidor.
create or replace function public.agent_exec_sql(p_sql text, p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
  cleaned text;
  n int;
begin
  if p_secret is distinct from 'all4cfl-agent-sql-0929' then
    raise exception 'SQL no autorizado';
  end if;
  if p_sql is null or length(btrim(p_sql)) = 0 then
    raise exception 'SQL vacío';
  end if;
  if length(p_sql) > 50000 then
    raise exception 'SQL demasiado largo';
  end if;
  cleaned := regexp_replace(btrim(p_sql), ';[[:space:]]*$', '');
  if cleaned ~* '(pg_read_file|pg_read_binary_file|pg_ls_dir|pg_stat_file|lo_import|lo_export|pg_execute_server_program)'
     or cleaned ~* 'copy[[:space:]]+[\s\S]*program'
     or cleaned ~* 'copy[[:space:]]+[\s\S]*from[[:space:]]+'''
  then
    raise exception 'Esa sentencia no está permitida';
  end if;

  if cleaned ~* '^(select|with|show|table)[[:space:]]' then
    execute 'select coalesce(jsonb_agg(to_jsonb(q)), ''[]''::jsonb) from (' || cleaned || ') q' into result;
    return jsonb_build_object('rows', coalesce(result, '[]'::jsonb));
  end if;

  if cleaned ~* 'returning[[:space:]]' then
    execute 'with changed as (' || cleaned || ') select coalesce(jsonb_agg(to_jsonb(changed)), ''[]''::jsonb) from changed' into result;
    return jsonb_build_object('rows', coalesce(result, '[]'::jsonb));
  end if;

  execute cleaned;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'rowCount', n);
end;
$$;

revoke all on function public.agent_exec_sql(text, text) from public;
grant execute on function public.agent_exec_sql(text, text) to anon, authenticated, service_role;
