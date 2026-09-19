-- CIBUSPAN ONE
-- Margen bruto contable / gerencial - Fase 1
-- NO modifica importaciones existentes.
-- NO duplica MP, MOD o CIF ya capitalizados por contabilidad.

create or replace view public.fin_vw_margen_bruto_mensual
with (security_invoker = true)
as
with base as (
  select
    resultado.periodo,

    sum(
      case
        when resultado.cuenta_codigo = '4.1.01.1.01.01'
          then -resultado.valor_original
        else 0
      end
    )::numeric(18,2) as ventas_brutas,

    sum(
      case
        when resultado.cuenta_codigo = '4.1.01.1.01.02'
          then resultado.valor_original
        else 0
      end
    )::numeric(18,2) as devoluciones_ventas,

    sum(
      case
        when resultado.cuenta_codigo = '4.1.01.1.01.03'
          then resultado.valor_original
        else 0
      end
    )::numeric(18,2) as descuentos_ventas,

    sum(
      case
        when resultado.cuenta_codigo like '5.2.01.%'
          then resultado.valor_original
        else 0
      end
    )::numeric(18,2) as costo_producto_vendido,

    sum(
      case
        when resultado.cuenta_codigo like '5.2.02.%'
          then resultado.valor_original
        else 0
      end
    )::numeric(18,2) as mod_residual,

    sum(
      case
        when resultado.cuenta_codigo like '5.2.03.%'
          then resultado.valor_original
        else 0
      end
    )::numeric(18,2) as cif_residual,

    sum(
      case
        when resultado.cuenta_codigo = '5.2.03.1.01.97'
          then resultado.valor_original
        else 0
      end
    )::numeric(18,2) as desperdicio_danos_produccion,

    sum(
      case
        when resultado.cuenta_codigo = '5.2.03.1.01.98'
          then resultado.valor_original
        else 0
      end
    )::numeric(18,2) as desperdicio_devoluciones_producto,

    sum(
      case
        when resultado.cuenta_codigo = '5.2.03.1.01.99'
          then resultado.valor_original
        else 0
      end
    )::numeric(18,2) as ajustes_inventario_costo,

    sum(
      case
        when resultado.cuenta_codigo like '5.%'
          then resultado.valor_original
        else 0
      end
    )::numeric(18,2) as costo_ventas_contable,

    sum(
      case
        when resultado.cuenta_codigo = '6.1.01.2.16.05'
          then resultado.valor_original
        else 0
      end
    )::numeric(18,2) as depreciacion_maquinaria,

    max(resultado.actualizado_en) as actualizado_en

  from public.fin_resultados_mensuales resultado
  group by resultado.periodo
),
calculo as (
  select
    base.*,
    (
      base.ventas_brutas
      - base.devoluciones_ventas
      - base.descuentos_ventas
    )::numeric(18,2) as ventas_netas,

    (
      base.costo_ventas_contable
      + base.depreciacion_maquinaria
    )::numeric(18,2) as costo_fabricacion_gerencial
  from base
)
select
  calculo.periodo,
  calculo.ventas_brutas,
  calculo.devoluciones_ventas,
  calculo.descuentos_ventas,
  calculo.ventas_netas,
  calculo.costo_producto_vendido,
  calculo.mod_residual,
  calculo.cif_residual,
  calculo.desperdicio_danos_produccion,
  calculo.desperdicio_devoluciones_producto,
  calculo.ajustes_inventario_costo,
  calculo.costo_ventas_contable,
  calculo.depreciacion_maquinaria,
  calculo.costo_fabricacion_gerencial,
  (
    calculo.ventas_netas
    - calculo.costo_fabricacion_gerencial
  )::numeric(18,2) as margen_bruto,
  (
    (
      calculo.ventas_netas
      - calculo.costo_fabricacion_gerencial
    )
    / nullif(calculo.ventas_netas, 0)
    * 100
  )::numeric(18,4) as margen_bruto_porcentaje,
  calculo.actualizado_en
from calculo;

grant select on public.fin_vw_margen_bruto_mensual to authenticated;
revoke all on public.fin_vw_margen_bruto_mensual from anon;

comment on view public.fin_vw_margen_bruto_mensual is
'Margen bruto mensual reconciliado. El costo de ventas ya incluye MP, MOD y CIF capitalizados; solo reclasifica depreciacion de maquinaria de produccion como CIF gerencial.';
