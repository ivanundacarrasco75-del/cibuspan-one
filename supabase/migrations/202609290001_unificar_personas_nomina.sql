-- ============================================================
-- CIBUSPAN ONE
-- Unifica sueldo, provisiones, fondos e IESS de una misma persona.
-- Conserva la funcion y la vista anteriores para no afectar otros modulos.
-- ============================================================

begin;

create or replace function public.fin_normalizar_persona_nomina(p_persona text)
returns text
language plpgsql
immutable
as $$
declare
  v_persona text;
  v_anterior text;
begin
  v_persona := upper(trim(regexp_replace(coalesce(p_persona, ''), '[[:space:]]+', ' ', 'g')));

  loop
    v_anterior := v_persona;
    v_persona := trim(regexp_replace(
      v_persona,
      '^(PROVISION(ES)?|PROVISIÓN(ES)?|FONDO(S)?( DE)? RESERVA(S)?|APORTE(S)? PATRONAL(ES)?( IESS)?|IESS|SUELDO(S)?|SALARIO(S)?|DECIMO TERCER(O|A)?|DÉCIMO TERCER(O|A)?|DECIMO CUART(O|A)?|DÉCIMO CUART(O|A)?|VACACION(ES)?)([[:space:]]*[-:/]?[[:space:]]*)',
      '',
      'i'
    ));
    exit when v_persona = v_anterior;
  end loop;

  return v_persona;
end;
$$;

create or replace view public.fin_vw_nomina_personas_clasificacion_unificada
with (security_invoker = true)
as
select
  base.periodo,
  public.fin_normalizar_persona_nomina(base.persona) as persona,
  array_agg(distinct base.persona order by base.persona) as personas_origen,
  sum(base.valor_total)::numeric(18,2) as valor_total,
  sum(base.movimientos)::bigint as movimientos,
  sum(base.movimientos_clasificados)::bigint as movimientos_clasificados,
  case
    when sum(base.movimientos_clasificados) >= sum(base.movimientos)
      then 'CLASIFICADO'
    else 'PENDIENTE'
  end::text as estado
from public.fin_vw_nomina_personas_clasificacion base
where trim(coalesce(base.persona, '')) <> ''
group by
  base.periodo,
  public.fin_normalizar_persona_nomina(base.persona);

grant execute on function public.fin_normalizar_persona_nomina(text) to authenticated;
grant select on public.fin_vw_nomina_personas_clasificacion_unificada to authenticated;

revoke all on public.fin_vw_nomina_personas_clasificacion_unificada from anon;

comment on view public.fin_vw_nomina_personas_clasificacion_unificada is
'Agrupa bajo una sola persona sus movimientos de sueldo, provisiones, fondos, IESS, decimos y vacaciones.';

notify pgrst, 'reload schema';

commit;
