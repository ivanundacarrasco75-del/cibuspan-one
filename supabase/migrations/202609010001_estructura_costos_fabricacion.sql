-- CIBUSPAN ONE V10.6
-- Estructura de costos de fabricación por naturaleza y cuenta
-- Historial inicial auditado enero-julio 2026.
-- Esta tabla queda preparada para que el importador contable mensual la alimente
-- posteriormente desde Libro Diario / Libro Mayor.

create table if not exists public.fin_costos_fabricacion_naturaleza (
  periodo date not null,
  naturaleza text not null check (naturaleza in ('MP','MOD','CIF','AJUSTE')),
  rubro_codigo text not null,
  rubro_nombre text not null,
  cuenta_codigo text not null,
  cuenta_nombre text not null,
  valor numeric(18,2) not null default 0,
  fuente text not null,
  observaciones text,
  actualizado_en timestamptz not null default now(),
  primary key (periodo, naturaleza, rubro_codigo)
);

create index if not exists fin_costos_fabricacion_naturaleza_periodo_idx
  on public.fin_costos_fabricacion_naturaleza(periodo);

create index if not exists fin_costos_fabricacion_naturaleza_cuenta_idx
  on public.fin_costos_fabricacion_naturaleza(cuenta_codigo);

alter table public.fin_costos_fabricacion_naturaleza enable row level security;

revoke all on table public.fin_costos_fabricacion_naturaleza from anon;
revoke insert, update, delete on table public.fin_costos_fabricacion_naturaleza from authenticated;
grant select on table public.fin_costos_fabricacion_naturaleza to authenticated;

drop policy if exists c1_fin_costos_fabricacion_naturaleza_lectura
  on public.fin_costos_fabricacion_naturaleza;

create policy c1_fin_costos_fabricacion_naturaleza_lectura
on public.fin_costos_fabricacion_naturaleza
for select
to authenticated
using (
  public.app_puede_alguna(array['Administración', 'Reportes'])
);

insert into public.fin_costos_fabricacion_naturaleza (
  periodo,
  naturaleza,
  rubro_codigo,
  rubro_nombre,
  cuenta_codigo,
  cuenta_nombre,
  valor,
  fuente,
  observaciones,
  actualizado_en
)
values
('2026-01-01','MP','MP_CONSUMIDA','Materia prima consumida','1.1.06.1.01.01','Materias primas',26626.11,'Libro Diario - órdenes de producción','Consumo de materias primas derivado de los créditos a inventario en órdenes de producción del mes.',now()),
('2026-01-01','MOD','MOD_SUELDOS','Sueldos y salarios','5.2.02.1.01.01','Sueldos y Salarios',5337.00,'Libro Diario - recálculo de costos de producción M.O.','Costo absorbido por producción según asiento mensual de recálculo M.O.',now()),
('2026-01-01','MOD','MOD_DECIMO_13','Décimo tercer sueldo','5.2.02.1.01.04','Décimo Tercer Sueldo',444.55,'Libro Diario - recálculo de costos de producción M.O.','Costo absorbido por producción según asiento mensual de recálculo M.O.',now()),
('2026-01-01','MOD','MOD_DECIMO_14','Décimo cuarto sueldo','5.2.02.1.01.05','Décimo Cuarto Sueldo',441.87,'Libro Diario - recálculo de costos de producción M.O.','Costo absorbido por producción según asiento mensual de recálculo M.O.',now()),
('2026-01-01','MOD','MOD_FONDOS_RESERVA','Fondos de reserva','5.2.02.1.01.06','Fondos de Reserva',444.55,'Libro Diario - recálculo de costos de producción M.O.','Costo absorbido por producción según asiento mensual de recálculo M.O.',now()),
('2026-01-01','MOD','MOD_APORTE_PATRONAL','Aporte patronal IESS','5.2.02.1.01.08','Aporte Patronal IESS',648.46,'Libro Diario - recálculo de costos de producción M.O.','Costo absorbido por producción según asiento mensual de recálculo M.O.',now()),
('2026-01-01','MOD','MOD_ALIMENTACION','Alimentación MOD','5.2.02.1.01.12','Alimentacion',95.00,'Libro Diario - recálculo de costos de producción M.O.','Costo absorbido por producción según asiento mensual de recálculo M.O.',now()),
('2026-01-01','CIF','CIF_ELECTRICIDAD','Energía eléctrica','5.2.03.1.01.15','Servicios Basicos C',334.97,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F. Se respetan las reclasificaciones contables detectadas en marzo/mayo.',now()),
('2026-01-01','CIF','CIF_ARRENDAMIENTO','Arrendamiento de planta','5.2.03.1.01.03','Arrendamiento de planta',1500.00,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F.',now()),
('2026-01-01','CIF','CIF_OTROS','Otros gastos de fabricación','5.2.03.1.01.08','Otros Gastos',285.00,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F.',now()),
('2026-01-01','CIF','CIF_MANTENIMIENTO','Mantenimiento fábrica','5.2.03.1.01.09','Mantenimiento Fabrica y Adecuaciones',461.59,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F.',now()),
('2026-01-01','CIF','CIF_SUMINISTROS','Suministros y materiales','5.2.03.1.01.10','Suministros y Materiales',206.98,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F. Se respetan las reclasificaciones contables detectadas en marzo/mayo.',now()),
('2026-01-01','CIF','CIF_ALIMENTACION','Alimentación indirecta','5.2.02.1.01.12','Alimentacion',207.50,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F.',now()),
('2026-01-01','CIF','CIF_COMBUSTIBLES','Combustibles y lubricantes','5.2.03.1.01.14','Combustibles y Lubricantes',730.44,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F.',now()),
('2026-01-01','CIF','CIF_DEPRECIACION','Depreciación maquinaria','6.1.01.2.16.05','Depreciación de maquinaria y equipo',1534.94,'Balance / Mayor - depreciación maquinaria','Reclasificación gerencial: depreciación de maquinaria tratada como CIF para análisis.',now()),
('2026-01-01','AJUSTE','AJUSTE_DEVOLUCIONES','Desperdicio por devoluciones','5.2.03.1.01.98','Desperdicio Devoluciones Producto',3591.35,'Balance Comparativo / Libro Diario','Pérdida o ajuste reconocido en fabricación; no forma parte del costo incurrido base MP+MOD+CIF.',now()),
('2026-01-01','AJUSTE','AJUSTE_INVENTARIO','Ajustes de inventario costo','5.2.03.1.01.99','Ajustes de Inventario Costo',1821.10,'Balance Comparativo / Libro Diario','Pérdida o ajuste reconocido en fabricación; no forma parte del costo incurrido base MP+MOD+CIF.',now()),
('2026-02-01','MP','MP_CONSUMIDA','Materia prima consumida','1.1.06.1.01.01','Materias primas',29528.48,'Libro Diario - órdenes de producción','Consumo de materias primas derivado de los créditos a inventario en órdenes de producción del mes.',now()),
('2026-02-01','MOD','MOD_SUELDOS','Sueldos y salarios','5.2.02.1.01.01','Sueldos y Salarios',4851.50,'Libro Diario - recálculo de costos de producción M.O.','Costo absorbido por producción según asiento mensual de recálculo M.O.',now()),
('2026-02-01','MOD','MOD_DECIMO_13','Décimo tercer sueldo','5.2.02.1.01.04','Décimo Tercer Sueldo',404.11,'Libro Diario - recálculo de costos de producción M.O.','Costo absorbido por producción según asiento mensual de recálculo M.O.',now()),
('2026-02-01','MOD','MOD_DECIMO_14','Décimo cuarto sueldo','5.2.02.1.01.05','Décimo Cuarto Sueldo',401.70,'Libro Diario - recálculo de costos de producción M.O.','Costo absorbido por producción según asiento mensual de recálculo M.O.',now()),
('2026-02-01','MOD','MOD_FONDOS_RESERVA','Fondos de reserva','5.2.02.1.01.06','Fondos de Reserva',404.11,'Libro Diario - recálculo de costos de producción M.O.','Costo absorbido por producción según asiento mensual de recálculo M.O.',now()),
('2026-02-01','MOD','MOD_APORTE_PATRONAL','Aporte patronal IESS','5.2.02.1.01.08','Aporte Patronal IESS',589.47,'Libro Diario - recálculo de costos de producción M.O.','Costo absorbido por producción según asiento mensual de recálculo M.O.',now()),
('2026-02-01','MOD','MOD_ALIMENTACION','Alimentación MOD','5.2.02.1.01.12','Alimentacion',210.00,'Libro Diario - recálculo de costos de producción M.O.','Costo absorbido por producción según asiento mensual de recálculo M.O.',now()),
('2026-02-01','CIF','CIF_ELECTRICIDAD','Energía eléctrica','5.2.03.1.01.15','Servicios Basicos C',390.81,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F. Se respetan las reclasificaciones contables detectadas en marzo/mayo.',now()),
('2026-02-01','CIF','CIF_ARRENDAMIENTO','Arrendamiento de planta','5.2.03.1.01.03','Arrendamiento de planta',1500.00,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F.',now()),
('2026-02-01','CIF','CIF_OTROS','Otros gastos de fabricación','5.2.03.1.01.08','Otros Gastos',475.00,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F.',now()),
('2026-02-01','CIF','CIF_MANTENIMIENTO','Mantenimiento fábrica','5.2.03.1.01.09','Mantenimiento Fabrica y Adecuaciones',109.59,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F.',now()),
('2026-02-01','CIF','CIF_SUMINISTROS','Suministros y materiales','5.2.03.1.01.10','Suministros y Materiales',160.45,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F. Se respetan las reclasificaciones contables detectadas en marzo/mayo.',now()),
('2026-02-01','CIF','CIF_ALIMENTACION','Alimentación indirecta','5.2.02.1.01.12','Alimentacion',183.75,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F.',now()),
('2026-02-01','CIF','CIF_COMBUSTIBLES','Combustibles y lubricantes','5.2.03.1.01.14','Combustibles y Lubricantes',730.46,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F.',now()),
('2026-02-01','CIF','CIF_DEPRECIACION','Depreciación maquinaria','6.1.01.2.16.05','Depreciación de maquinaria y equipo',1534.94,'Balance / Mayor - depreciación maquinaria','Reclasificación gerencial: depreciación de maquinaria tratada como CIF para análisis.',now()),
('2026-02-01','AJUSTE','AJUSTE_DEVOLUCIONES','Desperdicio por devoluciones','5.2.03.1.01.98','Desperdicio Devoluciones Producto',2839.12,'Balance Comparativo / Libro Diario','Pérdida o ajuste reconocido en fabricación; no forma parte del costo incurrido base MP+MOD+CIF.',now()),
('2026-02-01','AJUSTE','AJUSTE_INVENTARIO','Ajustes de inventario costo','5.2.03.1.01.99','Ajustes de Inventario Costo',4463.07,'Balance Comparativo / Libro Diario','Pérdida o ajuste reconocido en fabricación; no forma parte del costo incurrido base MP+MOD+CIF.',now()),
('2026-03-01','MP','MP_CONSUMIDA','Materia prima consumida','1.1.06.1.01.01','Materias primas',29025.89,'Libro Diario - órdenes de producción','Consumo de materias primas derivado de los créditos a inventario en órdenes de producción del mes.',now()),
('2026-03-01','MOD','MOD_SUELDOS','Sueldos y salarios','5.2.02.1.01.01','Sueldos y Salarios',4851.50,'Libro Diario - recálculo de costos de producción M.O.','Costo absorbido por producción según asiento mensual de recálculo M.O.',now()),
('2026-03-01','MOD','MOD_DECIMO_13','Décimo tercer sueldo','5.2.02.1.01.04','Décimo Tercer Sueldo',404.11,'Libro Diario - recálculo de costos de producción M.O.','Costo absorbido por producción según asiento mensual de recálculo M.O.',now()),
('2026-03-01','MOD','MOD_DECIMO_14','Décimo cuarto sueldo','5.2.02.1.01.05','Décimo Cuarto Sueldo',401.70,'Libro Diario - recálculo de costos de producción M.O.','Costo absorbido por producción según asiento mensual de recálculo M.O.',now()),
('2026-03-01','MOD','MOD_FONDOS_RESERVA','Fondos de reserva','5.2.02.1.01.06','Fondos de Reserva',404.11,'Libro Diario - recálculo de costos de producción M.O.','Costo absorbido por producción según asiento mensual de recálculo M.O.',now()),
('2026-03-01','MOD','MOD_APORTE_PATRONAL','Aporte patronal IESS','5.2.02.1.01.08','Aporte Patronal IESS',589.47,'Libro Diario - recálculo de costos de producción M.O.','Costo absorbido por producción según asiento mensual de recálculo M.O.',now()),
('2026-03-01','MOD','MOD_ALIMENTACION','Alimentación MOD','5.2.02.1.01.12','Alimentacion',98.00,'Libro Diario - recálculo de costos de producción M.O.','Costo absorbido por producción según asiento mensual de recálculo M.O.',now()),
('2026-03-01','CIF','CIF_ELECTRICIDAD','Energía eléctrica','5.2.03.1.01.15','Servicios Basicos C',373.40,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F. Se respetan las reclasificaciones contables detectadas en marzo/mayo.',now()),
('2026-03-01','CIF','CIF_ARRENDAMIENTO','Arrendamiento de planta','5.2.03.1.01.03','Arrendamiento de planta',1500.00,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F.',now()),
('2026-03-01','CIF','CIF_OTROS','Otros gastos de fabricación','5.2.03.1.01.08','Otros Gastos',475.00,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F.',now()),
('2026-03-01','CIF','CIF_MANTENIMIENTO','Mantenimiento fábrica','5.2.03.1.01.09','Mantenimiento Fabrica y Adecuaciones',581.33,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F.',now()),
('2026-03-01','CIF','CIF_SUMINISTROS','Suministros y materiales','5.2.03.1.01.10','Suministros y Materiales',505.13,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F. Se respetan las reclasificaciones contables detectadas en marzo/mayo.',now()),
('2026-03-01','CIF','CIF_ALIMENTACION','Alimentación indirecta','5.2.02.1.01.12','Alimentacion',148.00,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F.',now()),
('2026-03-01','CIF','CIF_COMBUSTIBLES','Combustibles y lubricantes','5.2.03.1.01.14','Combustibles y Lubricantes',739.29,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F.',now()),
('2026-03-01','CIF','CIF_DEPRECIACION','Depreciación maquinaria','6.1.01.2.16.05','Depreciación de maquinaria y equipo',1534.94,'Balance / Mayor - depreciación maquinaria','Reclasificación gerencial: depreciación de maquinaria tratada como CIF para análisis.',now()),
('2026-03-01','AJUSTE','AJUSTE_DEVOLUCIONES','Desperdicio por devoluciones','5.2.03.1.01.98','Desperdicio Devoluciones Producto',6407.70,'Balance Comparativo / Libro Diario','Pérdida o ajuste reconocido en fabricación; no forma parte del costo incurrido base MP+MOD+CIF.',now()),
('2026-03-01','AJUSTE','AJUSTE_INVENTARIO','Ajustes de inventario costo','5.2.03.1.01.99','Ajustes de Inventario Costo',-1451.57,'Balance Comparativo / Libro Diario','Pérdida o ajuste reconocido en fabricación; no forma parte del costo incurrido base MP+MOD+CIF.',now()),
('2026-04-01','MP','MP_CONSUMIDA','Materia prima consumida','1.1.06.1.01.01','Materias primas',29649.09,'Libro Diario - órdenes de producción','Consumo de materias primas derivado de los créditos a inventario en órdenes de producción del mes.',now()),
('2026-04-01','MOD','MOD_SUELDOS','Sueldos y salarios','5.2.02.1.01.01','Sueldos y Salarios',3880.50,'Libro Diario - recálculo de costos de producción M.O.','Costo absorbido por producción según asiento mensual de recálculo M.O.',now()),
('2026-04-01','MOD','MOD_DECIMO_13','Décimo tercer sueldo','5.2.02.1.01.04','Décimo Tercer Sueldo',363.67,'Libro Diario - recálculo de costos de producción M.O.','Costo absorbido por producción según asiento mensual de recálculo M.O.',now()),
('2026-04-01','MOD','MOD_DECIMO_14','Décimo cuarto sueldo','5.2.02.1.01.05','Décimo Cuarto Sueldo',361.53,'Libro Diario - recálculo de costos de producción M.O.','Costo absorbido por producción según asiento mensual de recálculo M.O.',now()),
('2026-04-01','MOD','MOD_FONDOS_RESERVA','Fondos de reserva','5.2.02.1.01.06','Fondos de Reserva',363.67,'Libro Diario - recálculo de costos de producción M.O.','Costo absorbido por producción según asiento mensual de recálculo M.O.',now()),
('2026-04-01','MOD','MOD_APORTE_PATRONAL','Aporte patronal IESS','5.2.02.1.01.08','Aporte Patronal IESS',530.48,'Libro Diario - recálculo de costos de producción M.O.','Costo absorbido por producción según asiento mensual de recálculo M.O.',now()),
('2026-04-01','MOD','MOD_ALIMENTACION','Alimentación MOD','5.2.02.1.01.12','Alimentacion',70.00,'Libro Diario - recálculo de costos de producción M.O.','Costo absorbido por producción según asiento mensual de recálculo M.O.',now()),
('2026-04-01','CIF','CIF_ELECTRICIDAD','Energía eléctrica','5.2.03.1.01.15','Servicios Basicos C',372.11,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F. Se respetan las reclasificaciones contables detectadas en marzo/mayo.',now()),
('2026-04-01','CIF','CIF_ARRENDAMIENTO','Arrendamiento de planta','5.2.03.1.01.03','Arrendamiento de planta',1500.00,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F.',now()),
('2026-04-01','CIF','CIF_OTROS','Otros gastos de fabricación','5.2.03.1.01.08','Otros Gastos',970.00,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F.',now()),
('2026-04-01','CIF','CIF_MANTENIMIENTO','Mantenimiento fábrica','5.2.03.1.01.09','Mantenimiento Fabrica y Adecuaciones',312.59,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F.',now()),
('2026-04-01','CIF','CIF_SUMINISTROS','Suministros y materiales','5.2.03.1.01.10','Suministros y Materiales',109.25,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F. Se respetan las reclasificaciones contables detectadas en marzo/mayo.',now()),
('2026-04-01','CIF','CIF_ALIMENTACION','Alimentación indirecta','5.2.02.1.01.12','Alimentacion',196.50,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F.',now()),
('2026-04-01','CIF','CIF_COMBUSTIBLES','Combustibles y lubricantes','5.2.03.1.01.14','Combustibles y Lubricantes',478.37,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F.',now()),
('2026-04-01','CIF','CIF_DEPRECIACION','Depreciación maquinaria','6.1.01.2.16.05','Depreciación de maquinaria y equipo',1534.94,'Balance / Mayor - depreciación maquinaria','Reclasificación gerencial: depreciación de maquinaria tratada como CIF para análisis.',now()),
('2026-04-01','AJUSTE','AJUSTE_DEVOLUCIONES','Desperdicio por devoluciones','5.2.03.1.01.98','Desperdicio Devoluciones Producto',3403.48,'Balance Comparativo / Libro Diario','Pérdida o ajuste reconocido en fabricación; no forma parte del costo incurrido base MP+MOD+CIF.',now()),
('2026-04-01','AJUSTE','AJUSTE_INVENTARIO','Ajustes de inventario costo','5.2.03.1.01.99','Ajustes de Inventario Costo',962.31,'Balance Comparativo / Libro Diario','Pérdida o ajuste reconocido en fabricación; no forma parte del costo incurrido base MP+MOD+CIF.',now()),
('2026-05-01','MP','MP_CONSUMIDA','Materia prima consumida','1.1.06.1.01.01','Materias primas',30737.05,'Libro Diario - órdenes de producción','Consumo de materias primas derivado de los créditos a inventario en órdenes de producción del mes.',now()),
('2026-05-01','MOD','MOD_SUELDOS','Sueldos y salarios','5.2.02.1.01.01','Sueldos y Salarios',4366.00,'Libro Diario - recálculo de costos de producción M.O.','Costo absorbido por producción según asiento mensual de recálculo M.O.',now()),
('2026-05-01','MOD','MOD_DECIMO_13','Décimo tercer sueldo','5.2.02.1.01.04','Décimo Tercer Sueldo',363.67,'Libro Diario - recálculo de costos de producción M.O.','Costo absorbido por producción según asiento mensual de recálculo M.O.',now()),
('2026-05-01','MOD','MOD_DECIMO_14','Décimo cuarto sueldo','5.2.02.1.01.05','Décimo Cuarto Sueldo',361.53,'Libro Diario - recálculo de costos de producción M.O.','Costo absorbido por producción según asiento mensual de recálculo M.O.',now()),
('2026-05-01','MOD','MOD_FONDOS_RESERVA','Fondos de reserva','5.2.02.1.01.06','Fondos de Reserva',363.67,'Libro Diario - recálculo de costos de producción M.O.','Costo absorbido por producción según asiento mensual de recálculo M.O.',now()),
('2026-05-01','MOD','MOD_APORTE_PATRONAL','Aporte patronal IESS','5.2.02.1.01.08','Aporte Patronal IESS',530.48,'Libro Diario - recálculo de costos de producción M.O.','Costo absorbido por producción según asiento mensual de recálculo M.O.',now()),
('2026-05-01','MOD','MOD_ALIMENTACION','Alimentación MOD','5.2.02.1.01.12','Alimentacion',190.00,'Libro Diario - recálculo de costos de producción M.O.','Costo absorbido por producción según asiento mensual de recálculo M.O.',now()),
('2026-05-01','CIF','CIF_ELECTRICIDAD','Energía eléctrica','5.2.03.1.01.15','Servicios Basicos C',342.82,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F. Se respetan las reclasificaciones contables detectadas en marzo/mayo.',now()),
('2026-05-01','CIF','CIF_ARRENDAMIENTO','Arrendamiento de planta','5.2.03.1.01.03','Arrendamiento de planta',1500.00,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F.',now()),
('2026-05-01','CIF','CIF_OTROS','Otros gastos de fabricación','5.2.03.1.01.08','Otros Gastos',380.00,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F.',now()),
('2026-05-01','CIF','CIF_MANTENIMIENTO','Mantenimiento fábrica','5.2.03.1.01.09','Mantenimiento Fabrica y Adecuaciones',272.59,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F.',now()),
('2026-05-01','CIF','CIF_SUMINISTROS','Suministros y materiales','5.2.03.1.01.10','Suministros y Materiales',758.46,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F. Se respetan las reclasificaciones contables detectadas en marzo/mayo.',now()),
('2026-05-01','CIF','CIF_ALIMENTACION','Alimentación indirecta','5.2.02.1.01.12','Alimentacion',165.50,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F.',now()),
('2026-05-01','CIF','CIF_COMBUSTIBLES','Combustibles y lubricantes','5.2.03.1.01.14','Combustibles y Lubricantes',730.44,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F.',now()),
('2026-05-01','CIF','CIF_DEPRECIACION','Depreciación maquinaria','6.1.01.2.16.05','Depreciación de maquinaria y equipo',1534.94,'Balance / Mayor - depreciación maquinaria','Reclasificación gerencial: depreciación de maquinaria tratada como CIF para análisis.',now()),
('2026-05-01','AJUSTE','AJUSTE_DEVOLUCIONES','Desperdicio por devoluciones','5.2.03.1.01.98','Desperdicio Devoluciones Producto',2663.44,'Balance Comparativo / Libro Diario','Pérdida o ajuste reconocido en fabricación; no forma parte del costo incurrido base MP+MOD+CIF.',now()),
('2026-05-01','AJUSTE','AJUSTE_INVENTARIO','Ajustes de inventario costo','5.2.03.1.01.99','Ajustes de Inventario Costo',794.87,'Balance Comparativo / Libro Diario','Pérdida o ajuste reconocido en fabricación; no forma parte del costo incurrido base MP+MOD+CIF.',now()),
('2026-06-01','MP','MP_CONSUMIDA','Materia prima consumida','1.1.06.1.01.01','Materias primas',23242.59,'Libro Diario - órdenes de producción','Consumo de materias primas derivado de los créditos a inventario en órdenes de producción del mes.',now()),
('2026-06-01','MOD','MOD_SUELDOS','Sueldos y salarios','5.2.02.1.01.01','Sueldos y Salarios',4366.00,'Libro Diario - recálculo de costos de producción M.O.','Costo absorbido por producción según asiento mensual de recálculo M.O.',now()),
('2026-06-01','MOD','MOD_DECIMO_13','Décimo tercer sueldo','5.2.02.1.01.04','Décimo Tercer Sueldo',363.67,'Libro Diario - recálculo de costos de producción M.O.','Costo absorbido por producción según asiento mensual de recálculo M.O.',now()),
('2026-06-01','MOD','MOD_DECIMO_14','Décimo cuarto sueldo','5.2.02.1.01.05','Décimo Cuarto Sueldo',361.53,'Libro Diario - recálculo de costos de producción M.O.','Costo absorbido por producción según asiento mensual de recálculo M.O.',now()),
('2026-06-01','MOD','MOD_FONDOS_RESERVA','Fondos de reserva','5.2.02.1.01.06','Fondos de Reserva',363.67,'Libro Diario - recálculo de costos de producción M.O.','Costo absorbido por producción según asiento mensual de recálculo M.O.',now()),
('2026-06-01','MOD','MOD_APORTE_PATRONAL','Aporte patronal IESS','5.2.02.1.01.08','Aporte Patronal IESS',530.48,'Libro Diario - recálculo de costos de producción M.O.','Costo absorbido por producción según asiento mensual de recálculo M.O.',now()),
('2026-06-01','MOD','MOD_ALIMENTACION','Alimentación MOD','5.2.02.1.01.12','Alimentacion',70.00,'Libro Diario - recálculo de costos de producción M.O.','Costo absorbido por producción según asiento mensual de recálculo M.O.',now()),
('2026-06-01','CIF','CIF_ELECTRICIDAD','Energía eléctrica','5.2.03.1.01.15','Servicios Basicos C',310.33,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F. Se respetan las reclasificaciones contables detectadas en marzo/mayo.',now()),
('2026-06-01','CIF','CIF_ARRENDAMIENTO','Arrendamiento de planta','5.2.03.1.01.03','Arrendamiento de planta',1500.00,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F.',now()),
('2026-06-01','CIF','CIF_OTROS','Otros gastos de fabricación','5.2.03.1.01.08','Otros Gastos',0.00,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F.',now()),
('2026-06-01','CIF','CIF_MANTENIMIENTO','Mantenimiento fábrica','5.2.03.1.01.09','Mantenimiento Fabrica y Adecuaciones',555.61,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F.',now()),
('2026-06-01','CIF','CIF_SUMINISTROS','Suministros y materiales','5.2.03.1.01.10','Suministros y Materiales',1079.20,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F. Se respetan las reclasificaciones contables detectadas en marzo/mayo.',now()),
('2026-06-01','CIF','CIF_ALIMENTACION','Alimentación indirecta','5.2.02.1.01.12','Alimentacion',187.50,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F.',now()),
('2026-06-01','CIF','CIF_COMBUSTIBLES','Combustibles y lubricantes','5.2.03.1.01.14','Combustibles y Lubricantes',486.96,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F.',now()),
('2026-06-01','CIF','CIF_DEPRECIACION','Depreciación maquinaria','6.1.01.2.16.05','Depreciación de maquinaria y equipo',1534.94,'Balance / Mayor - depreciación maquinaria','Reclasificación gerencial: depreciación de maquinaria tratada como CIF para análisis.',now()),
('2026-06-01','AJUSTE','AJUSTE_DEVOLUCIONES','Desperdicio por devoluciones','5.2.03.1.01.98','Desperdicio Devoluciones Producto',2703.58,'Balance Comparativo / Libro Diario','Pérdida o ajuste reconocido en fabricación; no forma parte del costo incurrido base MP+MOD+CIF.',now()),
('2026-06-01','AJUSTE','AJUSTE_INVENTARIO','Ajustes de inventario costo','5.2.03.1.01.99','Ajustes de Inventario Costo',457.29,'Balance Comparativo / Libro Diario','Pérdida o ajuste reconocido en fabricación; no forma parte del costo incurrido base MP+MOD+CIF.',now()),
('2026-07-01','MP','MP_CONSUMIDA','Materia prima consumida','1.1.06.1.01.01','Materias primas',20169.92,'Libro Diario - órdenes de producción','Consumo de materias primas derivado de los créditos a inventario en órdenes de producción del mes.',now()),
('2026-07-01','MOD','MOD_SUELDOS','Sueldos y salarios','5.2.02.1.01.01','Sueldos y Salarios',4366.00,'Libro Diario - recálculo de costos de producción M.O.','Costo absorbido por producción según asiento mensual de recálculo M.O.',now()),
('2026-07-01','MOD','MOD_DECIMO_13','Décimo tercer sueldo','5.2.02.1.01.04','Décimo Tercer Sueldo',363.67,'Libro Diario - recálculo de costos de producción M.O.','Costo absorbido por producción según asiento mensual de recálculo M.O.',now()),
('2026-07-01','MOD','MOD_DECIMO_14','Décimo cuarto sueldo','5.2.02.1.01.05','Décimo Cuarto Sueldo',361.53,'Libro Diario - recálculo de costos de producción M.O.','Costo absorbido por producción según asiento mensual de recálculo M.O.',now()),
('2026-07-01','MOD','MOD_FONDOS_RESERVA','Fondos de reserva','5.2.02.1.01.06','Fondos de Reserva',404.11,'Libro Diario - recálculo de costos de producción M.O.','Costo absorbido por producción según asiento mensual de recálculo M.O.',now()),
('2026-07-01','MOD','MOD_APORTE_PATRONAL','Aporte patronal IESS','5.2.02.1.01.08','Aporte Patronal IESS',530.48,'Libro Diario - recálculo de costos de producción M.O.','Costo absorbido por producción según asiento mensual de recálculo M.O.',now()),
('2026-07-01','MOD','MOD_ALIMENTACION','Alimentación MOD','5.2.02.1.01.12','Alimentacion',70.00,'Libro Diario - recálculo de costos de producción M.O.','Costo absorbido por producción según asiento mensual de recálculo M.O.',now()),
('2026-07-01','CIF','CIF_ELECTRICIDAD','Energía eléctrica','5.2.03.1.01.15','Servicios Basicos C',292.64,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F. Se respetan las reclasificaciones contables detectadas en marzo/mayo.',now()),
('2026-07-01','CIF','CIF_ARRENDAMIENTO','Arrendamiento de planta','5.2.03.1.01.03','Arrendamiento de planta',1500.00,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F.',now()),
('2026-07-01','CIF','CIF_OTROS','Otros gastos de fabricación','5.2.03.1.01.08','Otros Gastos',380.00,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F.',now()),
('2026-07-01','CIF','CIF_MANTENIMIENTO','Mantenimiento fábrica','5.2.03.1.01.09','Mantenimiento Fabrica y Adecuaciones',1551.57,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F.',now()),
('2026-07-01','CIF','CIF_SUMINISTROS','Suministros y materiales','5.2.03.1.01.10','Suministros y Materiales',418.13,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F. Se respetan las reclasificaciones contables detectadas en marzo/mayo.',now()),
('2026-07-01','CIF','CIF_ALIMENTACION','Alimentación indirecta','5.2.02.1.01.12','Alimentacion',144.00,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F.',now()),
('2026-07-01','CIF','CIF_COMBUSTIBLES','Combustibles y lubricantes','5.2.03.1.01.14','Combustibles y Lubricantes',243.48,'Libro Diario - recálculo de costos de producción C.I.F.','Costo absorbido por producción según asiento mensual de recálculo C.I.F.',now()),
('2026-07-01','CIF','CIF_DEPRECIACION','Depreciación maquinaria','6.1.01.2.16.05','Depreciación de maquinaria y equipo',1534.94,'Balance / Mayor - depreciación maquinaria','Reclasificación gerencial: depreciación de maquinaria tratada como CIF para análisis.',now()),
('2026-07-01','AJUSTE','AJUSTE_DEVOLUCIONES','Desperdicio por devoluciones','5.2.03.1.01.98','Desperdicio Devoluciones Producto',2529.99,'Balance Comparativo / Libro Diario','Pérdida o ajuste reconocido en fabricación; no forma parte del costo incurrido base MP+MOD+CIF.',now()),
('2026-07-01','AJUSTE','AJUSTE_INVENTARIO','Ajustes de inventario costo','5.2.03.1.01.99','Ajustes de Inventario Costo',-825.15,'Balance Comparativo / Libro Diario','Pérdida o ajuste reconocido en fabricación; no forma parte del costo incurrido base MP+MOD+CIF.',now())
on conflict (periodo, naturaleza, rubro_codigo) do update
set
  rubro_nombre = excluded.rubro_nombre,
  cuenta_codigo = excluded.cuenta_codigo,
  cuenta_nombre = excluded.cuenta_nombre,
  valor = excluded.valor,
  fuente = excluded.fuente,
  observaciones = excluded.observaciones,
  actualizado_en = now();

comment on table public.fin_costos_fabricacion_naturaleza is
'Costos mensuales por naturaleza y cuenta para análisis gerencial de eficiencia. MP, MOD y CIF representan costo incurrido/absorbido de fabricación; AJUSTE se muestra aparte para no mezclar pérdidas y ajustes con eficiencia de conversión.';
