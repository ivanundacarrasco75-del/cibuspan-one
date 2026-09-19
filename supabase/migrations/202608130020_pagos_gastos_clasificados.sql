-- CIBUSPAN ONE
-- Pagos y gastos: importacion acumulativa, clasificacion gerencial y reportes.
-- La clasificacion de pagos no reemplaza el asiento contable ni el devengo.

create table if not exists public.fin_cuentas_pago (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  grupo text not null check (grupo in (
    'INVENTARIO', 'PERSONAL', 'OPERACION', 'ADMINISTRACION',
    'COMERCIAL', 'OBLIGACIONES', 'FINANCIAMIENTO', 'ACTIVOS',
    'TRANSFERENCIAS', 'OTROS', 'PENDIENTE'
  )),
  naturaleza text not null check (naturaleza in (
    'GASTO_EBITDA', 'INVENTARIO', 'OBLIGACION', 'FINANCIAMIENTO',
    'ACTIVO', 'TRANSFERENCIA', 'OTRO', 'PENDIENTE'
  )),
  cuenta_contable_referencia text,
  impacta_ebitda boolean not null default false,
  activo boolean not null default true,
  orden integer not null default 100,
  creado_en timestamptz not null default now()
);

insert into public.fin_cuentas_pago (
  codigo, nombre, grupo, naturaleza,
  cuenta_contable_referencia, impacta_ebitda, orden
)
values
  ('PENDIENTE', 'Por revisar', 'PENDIENTE', 'PENDIENTE', null, false, 999),
  ('INV-MP', 'Compra de materia prima', 'INVENTARIO', 'INVENTARIO', '5.2.01.1.01.01', false, 10),
  ('INV-EMPAQUE', 'Compra de empaques', 'INVENTARIO', 'INVENTARIO', null, false, 11),
  ('INV-INSUMOS', 'Otros insumos de producción', 'INVENTARIO', 'INVENTARIO', null, false, 12),
  ('6.1.01.1.01.01', 'Sueldos y salarios', 'PERSONAL', 'GASTO_EBITDA', '6.1.01.1.01.01', true, 20),
  ('6.1.01.1.01.04', 'Décimo tercer sueldo', 'PERSONAL', 'GASTO_EBITDA', '6.1.01.1.01.04', true, 21),
  ('6.2.01.1.01.05', 'Décimo cuarto sueldo', 'PERSONAL', 'GASTO_EBITDA', '6.2.01.1.01.05', true, 22),
  ('6.1.01.1.01.06', 'Fondos de reserva', 'PERSONAL', 'GASTO_EBITDA', '6.1.01.1.01.06', true, 23),
  ('6.1.01.1.01.13', 'Indemnizaciones y finiquitos', 'PERSONAL', 'GASTO_EBITDA', '6.1.01.1.01.13', true, 24),
  ('6.1.01.2.01.01', 'Honorarios profesionales', 'ADMINISTRACION', 'GASTO_EBITDA', '6.1.01.2.01.01', true, 30),
  ('6.1.01.2.02.01', 'Materiales y ferretería', 'OPERACION', 'GASTO_EBITDA', '6.1.01.2.02.01', true, 31),
  ('6.1.01.2.02.06', 'Aseo, limpieza y control de plagas', 'OPERACION', 'GASTO_EBITDA', '6.1.01.2.02.06', true, 32),
  ('6.1.01.2.03.01', 'Sistemas y software', 'ADMINISTRACION', 'GASTO_EBITDA', '6.1.01.2.03.01', true, 33),
  ('6.1.01.2.03.03', 'Mantenimiento de instalaciones y equipos', 'OPERACION', 'GASTO_EBITDA', '6.1.01.2.03.03', true, 34),
  ('6.1.01.2.05.01', 'Agua potable', 'OPERACION', 'GASTO_EBITDA', '6.1.01.2.05.01', true, 35),
  ('6.1.01.2.05.02', 'Energía eléctrica', 'OPERACION', 'GASTO_EBITDA', '6.1.01.2.05.02', true, 36),
  ('6.1.01.2.06.01', 'Combustibles', 'OPERACION', 'GASTO_EBITDA', '6.1.01.2.06.01', true, 37),
  ('6.1.01.2.07.01', 'Servicios contables', 'ADMINISTRACION', 'GASTO_EBITDA', '6.1.01.2.07.01', true, 38),
  ('6.1.01.2.07.02', 'Servicios técnicos', 'OPERACION', 'GASTO_EBITDA', '6.1.01.2.07.02', true, 39),
  ('6.1.01.2.10.01', 'Arriendos', 'OPERACION', 'GASTO_EBITDA', '6.1.01.2.10.01', true, 40),
  ('6.1.01.2.11.04', 'Alimentación del personal', 'OPERACION', 'GASTO_EBITDA', '6.1.01.2.11.04', true, 41),
  ('6.1.01.2.12.02', 'Publicidad y mercadeo', 'COMERCIAL', 'GASTO_EBITDA', '6.1.01.2.12.02', true, 42),
  ('6.1.01.2.13.01', 'Transporte y fletes', 'COMERCIAL', 'GASTO_EBITDA', '6.1.01.2.13.01', true, 43),
  ('6.1.01.2.13.02', 'Movilización y peajes', 'COMERCIAL', 'GASTO_EBITDA', '6.1.01.2.13.02', true, 44),
  ('6.1.01.2.14.14', 'Otros gastos operativos', 'OTROS', 'GASTO_EBITDA', '6.1.01.2.14.14', true, 45),
  ('6.2.01.2.01.03', 'Asesorías empresariales', 'ADMINISTRACION', 'GASTO_EBITDA', '6.2.01.2.01.03', true, 46),
  ('6.2.01.2.02.07', 'Mantenimiento de computación', 'ADMINISTRACION', 'GASTO_EBITDA', '6.2.01.2.02.07', true, 47),
  ('6.2.01.2.02.09', 'Suministros de oficina', 'ADMINISTRACION', 'GASTO_EBITDA', '6.2.01.2.02.09', true, 48),
  ('6.2.01.2.05.04', 'Internet y conexiones', 'ADMINISTRACION', 'GASTO_EBITDA', '6.2.01.2.05.04', true, 49),
  ('6.2.01.2.09.02', 'Vigilancia y monitoreo', 'ADMINISTRACION', 'GASTO_EBITDA', '6.2.01.2.09.02', true, 50),
  ('6.2.01.2.14.05', 'Trámites legales y regulatorios', 'ADMINISTRACION', 'GASTO_EBITDA', '6.2.01.2.14.05', true, 51),
  ('6.2.01.2.14.15', 'Cuotas y contribuciones', 'ADMINISTRACION', 'GASTO_EBITDA', '6.2.01.2.14.15', true, 52),
  ('6.2.01.2.14.19', 'Gastos bancarios', 'ADMINISTRACION', 'GASTO_EBITDA', '6.2.01.2.14.19', true, 53),
  ('6.2.01.2.14.23', 'Impuestos municipales y societarios', 'ADMINISTRACION', 'GASTO_EBITDA', '6.2.01.2.14.23', true, 54),
  ('6.2.01.2.14.31', 'Gastos no deducibles', 'OTROS', 'GASTO_EBITDA', '6.2.01.2.14.31', true, 55),
  ('6.2.01.2.20.05', 'Cuentas por liquidar', 'OTROS', 'OTRO', '6.2.01.2.20.05', false, 56),
  ('OBL-IESS', 'Pago de obligaciones IESS', 'OBLIGACIONES', 'OBLIGACION', null, false, 60),
  ('OBL-SRI', 'Pago de obligaciones SRI', 'OBLIGACIONES', 'OBLIGACION', null, false, 61),
  ('ANTICIPO', 'Anticipos y adelantos', 'OBLIGACIONES', 'OBLIGACION', null, false, 62),
  ('FIN-PRESTAMO', 'Cuota de préstamo por separar', 'FINANCIAMIENTO', 'FINANCIAMIENTO', '8.2.01.1.01.03', false, 70),
  ('FIN-TARJETA', 'Pago de tarjeta o financiamiento', 'FINANCIAMIENTO', 'FINANCIAMIENTO', null, false, 71),
  ('ACTIVO', 'Compra de activos y equipos', 'ACTIVOS', 'ACTIVO', null, false, 80),
  ('TRANSFERENCIA', 'Transferencia entre cuentas propias', 'TRANSFERENCIAS', 'TRANSFERENCIA', null, false, 90)
on conflict (codigo) do update
set nombre = excluded.nombre,
    grupo = excluded.grupo,
    naturaleza = excluded.naturaleza,
    cuenta_contable_referencia = excluded.cuenta_contable_referencia,
    impacta_ebitda = excluded.impacta_ebitda,
    orden = excluded.orden,
    activo = true;

create or replace function public.fin_normalizar_texto(p_texto text)
returns text
language sql
immutable
as $$
  select trim(regexp_replace(
    upper(translate(coalesce(p_texto, ''),
      'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNAEIOUUN')),
    '[^A-Z0-9]+', ' ', 'g'
  ));
$$;

create table if not exists public.fin_reglas_clasificacion_pago (
  id uuid primary key default gen_random_uuid(),
  campo text not null check (campo in ('COMBINADO', 'PROVEEDOR', 'DESCRIPCION')),
  patron text not null,
  cuenta_pago_id uuid not null
    references public.fin_cuentas_pago(id) on delete restrict,
  prioridad integer not null default 100,
  confianza numeric(5,4) not null default 0.9000
    check (confianza >= 0 and confianza <= 1),
  origen text not null default 'SISTEMA'
    check (origen in ('SISTEMA', 'USUARIO')),
  activo boolean not null default true,
  creado_por uuid references auth.users(id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (campo, patron)
);

with reglas(campo, patron, codigo, prioridad, confianza) as (
  values
    ('COMBINADO', 'PAGO PRESTAMO', 'FIN-PRESTAMO', 10, 0.9900),
    ('COMBINADO', 'DEBITO CUOTA', 'FIN-PRESTAMO', 11, 0.9800),
    ('COMBINADO', 'PAGO CUOTA', 'FIN-TARJETA', 12, 0.9000),
    ('PROVEEDOR', 'PRODUBANCO', 'FIN-PRESTAMO', 13, 0.9000),
    ('COMBINADO', 'PAGOS CORRIENTES', 'TRANSFERENCIA', 14, 0.9700),
    ('PROVEEDOR', 'CUENTA CORRIENTE', 'TRANSFERENCIA', 15, 0.9700),
    ('PROVEEDOR', 'IESS', 'OBL-IESS', 16, 0.9900),
    ('PROVEEDOR', 'SRI', 'OBL-SRI', 17, 0.9900),
    ('PROVEEDOR', 'IVA', 'OBL-SRI', 17, 0.9500),
    ('COMBINADO', 'ANTICIPO', 'ANTICIPO', 18, 0.9000),
    ('COMBINADO', 'ADELANTO', 'ANTICIPO', 19, 0.8500),
    ('COMBINADO', 'ACTA FINIQUITO', '6.1.01.1.01.13', 20, 0.9700),
    ('COMBINADO', 'LIQUIDACION', '6.1.01.1.01.13', 21, 0.9000),
    ('COMBINADO', 'DECIMO CUARTO', '6.2.01.1.01.05', 22, 0.9900),
    ('COMBINADO', 'DECIMO TERCERO', '6.1.01.1.01.04', 23, 0.9900),
    ('COMBINADO', 'FONDOS DE RESERVA', '6.1.01.1.01.06', 24, 0.9900),
    ('COMBINADO', 'QUINCENA', '6.1.01.1.01.01', 25, 0.9600),
    ('COMBINADO', 'SUELDO', '6.1.01.1.01.01', 26, 0.9500),
    ('COMBINADO', 'ROL DE PAGOS', '6.1.01.1.01.01', 27, 0.9800),
    ('COMBINADO', 'VACACIONES', '6.1.01.1.01.01', 28, 0.8500),
    ('COMBINADO', 'COMPUTADORA', 'ACTIVO', 29, 0.9500),
    ('COMBINADO', 'MAQUINARIA', 'ACTIVO', 30, 0.9000),
    ('COMBINADO', 'EQUIPO NUEVO', 'ACTIVO', 31, 0.9000),
    ('PROVEEDOR', 'OYEMPAQUE', 'INV-EMPAQUE', 35, 0.9900),
    ('PROVEEDOR', 'CARTONERA PICHINCHA', 'INV-EMPAQUE', 36, 0.9900),
    ('COMBINADO', 'FUNDAS', 'INV-EMPAQUE', 37, 0.9600),
    ('COMBINADO', 'CARTONES', 'INV-EMPAQUE', 38, 0.9500),
    ('COMBINADO', 'CAJAS SIN IMPRESION', 'INV-EMPAQUE', 39, 0.9500),
    ('COMBINADO', 'ETIQUETAS', 'INV-EMPAQUE', 40, 0.9000),
    ('COMBINADO', 'CINTA ATADORA', 'INV-EMPAQUE', 41, 0.9500),
    ('COMBINADO', 'GORROS', 'INV-INSUMOS', 42, 0.9000),
    ('PROVEEDOR', 'SUCESORES DE JACOBO PAREDES', 'INV-MP', 45, 0.9900),
    ('PROVEEDOR', 'BAKELS', 'INV-MP', 46, 0.9800),
    ('PROVEEDOR', 'LA FABRIL', 'INV-MP', 47, 0.9800),
    ('PROVEEDOR', 'CORPORACION SUPERIOR', 'INV-MP', 48, 0.9800),
    ('PROVEEDOR', 'INDUSTRIAL DANEC', 'INV-MP', 49, 0.9800),
    ('PROVEEDOR', 'MANCOM', 'INV-MP', 50, 0.9700),
    ('PROVEEDOR', 'MENA NOELIA', 'INV-MP', 51, 0.9700),
    ('PROVEEDOR', 'GRANOTEC', 'INV-MP', 52, 0.9800),
    ('PROVEEDOR', 'MAGICFLAVORS', 'INV-MP', 53, 0.9800),
    ('PROVEEDOR', 'MOLINOS', 'INV-MP', 54, 0.9400),
    ('PROVEEDOR', 'CORDIALSA', 'INV-MP', 55, 0.9700),
    ('PROVEEDOR', 'GUAYASAMIN MARTHA', 'INV-MP', 56, 0.9700),
    ('PROVEEDOR', 'MARTHA GUAYASAMIN', 'INV-MP', 57, 0.9700),
    ('PROVEEDOR', 'EDUEXPRESS', 'INV-MP', 58, 0.9700),
    ('PROVEEDOR', 'FOREIGNCHEM', 'INV-MP', 59, 0.9900),
    ('PROVEEDOR', 'LACTEOS AMYRO', 'INV-MP', 60, 0.9900),
    ('PROVEEDOR', 'DISTRIBUIDORA RECALDE', 'INV-MP', 61, 0.9800),
    ('PROVEEDOR', 'MINERVA SA', 'INV-MP', 61, 0.9900),
    ('PROVEEDOR', 'PRODICEREAL', 'INV-MP', 61, 0.9900),
    ('PROVEEDOR', 'MAGIC FLAVORS', 'INV-MP', 61, 0.9900),
    ('COMBINADO', 'MOHOSORBIC', 'INV-MP', 61, 0.9900),
    ('COMBINADO', 'MOHO SORBIC', 'INV-MP', 61, 0.9900),
    ('COMBINADO', 'PANELA', 'INV-MP', 61, 0.9500),
    ('COMBINADO', 'AVENA MOLIDA', 'INV-MP', 61, 0.9500),
    ('COMBINADO', 'HUEVOS', 'INV-MP', 61, 0.9300),
    ('COMBINADO', 'HARINA', 'INV-MP', 62, 0.9000),
    ('COMBINADO', 'LEVADURA', 'INV-MP', 63, 0.9000),
    ('COMBINADO', 'MANTECA', 'INV-MP', 64, 0.9000),
    ('COMBINADO', 'MARGARINA', 'INV-MP', 65, 0.9000),
    ('COMBINADO', 'CHOCOLATE', 'INV-MP', 66, 0.8800),
    ('COMBINADO', 'YEMA DE HUEVO', 'INV-MP', 67, 0.9500),
    ('COMBINADO', 'PROPIONATO', 'INV-MP', 68, 0.9500),
    ('COMBINADO', 'SORBAT', 'INV-MP', 69, 0.9300),
    ('COMBINADO', 'POLVO DE CACAO', 'INV-MP', 70, 0.9500),
    ('COMBINADO', 'AZUCAR', 'INV-MP', 71, 0.9200),
    ('COMBINADO', 'QUESO', 'INV-MP', 72, 0.9000),
    ('COMBINADO', 'ALCOHOL', 'INV-MP', 73, 0.9000),
    ('COMBINADO', 'VINAGRE', 'INV-MP', 74, 0.9000),
    ('COMBINADO', 'ECOFRESH', 'INV-MP', 75, 0.9500),
    ('COMBINADO', 'FRESHMIX', 'INV-MP', 76, 0.9500),
    ('PROVEEDOR', 'EMPRESA ELECTRICA', '6.1.01.2.05.02', 80, 0.9900),
    ('PROVEEDOR', 'LUZ', '6.1.01.2.05.02', 81, 0.9000),
    ('COMBINADO', 'LUZ PLANTA', '6.1.01.2.05.02', 82, 0.9700),
    ('PROVEEDOR', 'JUNTA DE AGUA', '6.1.01.2.05.01', 83, 0.9900),
    ('PROVEEDOR', 'TELECOMUNICACIONES OPTICOM', '6.2.01.2.05.04', 84, 0.9900),
    ('COMBINADO', 'INTERNET', '6.2.01.2.05.04', 85, 0.9500),
    ('COMBINADO', 'DIESEL', '6.1.01.2.06.01', 86, 0.9500),
    ('COMBINADO', 'GASOLINA', '6.1.01.2.06.01', 87, 0.9500),
    ('PROVEEDOR', 'DANIEL PARRA', '6.1.01.2.13.01', 88, 0.9300),
    ('PROVEEDOR', 'MILTON MOYA', '6.1.01.2.13.01', 89, 0.9000),
    ('PROVEEDOR', 'MOYA MILTON', '6.1.01.2.13.01', 90, 0.9000),
    ('COMBINADO', 'TRANSPORTE', '6.1.01.2.13.01', 91, 0.9000),
    ('COMBINADO', 'MOVILIZACION', '6.1.01.2.13.02', 92, 0.9000),
    ('COMBINADO', 'PEAJE', '6.1.01.2.13.02', 93, 0.9000),
    ('COMBINADO', 'ALMUERZO', '6.1.01.2.11.04', 94, 0.9500),
    ('COMBINADO', 'ALIMENTACION', '6.1.01.2.11.04', 95, 0.9200),
    ('COMBINADO', 'CONTROL DE PLAGAS', '6.1.01.2.02.06', 96, 0.9700),
    ('COMBINADO', 'LIMPIEZA', '6.1.01.2.02.06', 97, 0.9000),
    ('COMBINADO', 'ASEO', '6.1.01.2.02.06', 98, 0.9000),
    ('COMBINADO', 'LIMPION', '6.1.01.2.02.06', 98, 0.9300),
    ('COMBINADO', 'LAVAVAJILLAS', '6.1.01.2.02.06', 98, 0.9300),
    ('COMBINADO', 'MANTENIMIENTO COMPUT', '6.2.01.2.02.07', 99, 0.9500),
    ('COMBINADO', 'ARREGLO IMPRESORA', '6.2.01.2.02.07', 100, 0.9500),
    ('COMBINADO', 'MANTENIMIENTO', '6.1.01.2.03.03', 101, 0.8800),
    ('COMBINADO', 'REPARACION', '6.1.01.2.03.03', 102, 0.8500),
    ('PROVEEDOR', 'IMESI CIA LTDA', '6.1.01.2.03.03', 102, 0.9000),
    ('PROVEEDOR', 'LUIS GUALLICHICO', '6.1.01.2.03.03', 102, 0.8500),
    ('COMBINADO', 'SOPORTE SISTEMA', '6.1.01.2.03.01', 103, 0.9500),
    ('COMBINADO', 'SISTEMA', '6.1.01.2.03.01', 104, 0.8200),
    ('COMBINADO', 'SERVICIO CONTABLE', '6.1.01.2.07.01', 105, 0.9600),
    ('PROVEEDOR', 'GALLARDO ASOCIADOS', '6.1.01.2.07.01', 105, 0.9900),
    ('COMBINADO', 'CONTABILIDAD', '6.1.01.2.07.01', 105, 0.9700),
    ('COMBINADO', 'RENTA', '6.1.01.2.10.01', 106, 0.8500),
    ('COMBINADO', 'ARRIENDO', '6.1.01.2.10.01', 107, 0.9500),
    ('COMBINADO', 'ASESORIA', '6.2.01.2.01.03', 108, 0.9000),
    ('COMBINADO', 'PLAN DE MARKETING', '6.1.01.2.12.02', 109, 0.9500),
    ('COMBINADO', 'PUBLICIDAD', '6.1.01.2.12.02', 110, 0.9500),
    ('COMBINADO', 'MARKETING', '6.1.01.2.12.02', 110, 0.9500),
    ('COMBINADO', 'PLAN DE MKT', '6.1.01.2.12.02', 110, 0.9500),
    ('COMBINADO', 'REDES SOCIALES', '6.1.01.2.12.02', 110, 0.9500),
    ('COMBINADO', 'MANEJO REDES', '6.1.01.2.12.02', 110, 0.9500),
    ('COMBINADO', 'INFLUENCERS', '6.1.01.2.12.02', 110, 0.9000),
    ('COMBINADO', 'MERCADERISTA', '6.1.01.2.12.02', 110, 0.9000),
    ('COMBINADO', 'PERCHAS', '6.1.01.2.12.02', 110, 0.8500),
    ('COMBINADO', 'MONITOREO', '6.2.01.2.09.02', 111, 0.9500),
    ('COMBINADO', 'ARCSA', '6.2.01.2.14.05', 112, 0.9500),
    ('COMBINADO', 'REGISTRO SANITARIO', '6.2.01.2.14.05', 113, 0.9500),
    ('COMBINADO', 'REGISTRO MERCANTIL', '6.2.01.2.14.05', 113, 0.9500),
    ('PROVEEDOR', 'MEYTHALER Y ZAMBRANO', '6.1.01.2.01.01', 113, 0.9500),
    ('COMBINADO', 'TRAMITE', '6.2.01.2.14.05', 114, 0.8000),
    ('COMBINADO', 'COMISION BANCARIA', '6.2.01.2.14.19', 115, 0.9500),
    ('COMBINADO', 'FERRETERIA', '6.1.01.2.02.01', 116, 0.9000),
    ('COMBINADO', 'DEVOKUCION PRESTAMO', 'FIN-PRESTAMO', 9, 0.9900),
    ('COMBINADO', 'DEVOLUCION PRESTAMO', 'FIN-PRESTAMO', 9, 0.9900),
    ('COMBINADO', 'HONORARIOS PROFESIONALES', '6.1.01.2.01.01', 106, 0.9500),
    ('COMBINADO', 'CONSULTORIA COMERCIAL', '6.2.01.2.01.03', 108, 0.9300),
    ('PROVEEDOR', 'CUMBAL SILVIA', '6.1.01.2.10.01', 106, 0.9500)
)
insert into public.fin_reglas_clasificacion_pago (
  campo, patron, cuenta_pago_id, prioridad, confianza, origen
)
select
  reglas.campo,
  public.fin_normalizar_texto(reglas.patron),
  cuenta.id,
  reglas.prioridad,
  reglas.confianza,
  'SISTEMA'
from reglas
join public.fin_cuentas_pago cuenta on cuenta.codigo = reglas.codigo
on conflict (campo, patron) do update
set cuenta_pago_id = excluded.cuenta_pago_id,
    prioridad = excluded.prioridad,
    confianza = excluded.confianza,
    activo = true,
    actualizado_en = now();

create table if not exists public.fin_importaciones_pagos (
  id uuid primary key default gen_random_uuid(),
  archivo_nombre text not null,
  archivo_hash text not null,
  hoja_origen text not null,
  fecha_desde date not null,
  fecha_hasta date not null,
  movimientos_archivo integer not null check (movimientos_archivo > 0),
  movimientos_nuevos integer not null default 0,
  movimientos_actualizados integer not null default 0,
  movimientos_pendientes integer not null default 0,
  total_pagado numeric(18,2) not null default 0,
  creado_por uuid references auth.users(id) on delete set null,
  creado_en timestamptz not null default now()
);

create table if not exists public.fin_pagos (
  id uuid primary key default gen_random_uuid(),
  clave_origen text not null unique,
  fecha_pago date not null,
  semana_inicio date not null,
  fecha_emision date,
  estado_pago text not null default 'PAGADO'
    check (estado_pago in ('PAGADO', 'PROGRAMADO', 'ANULADO')),
  factura text,
  proveedor text not null,
  proveedor_normalizado text not null,
  descripcion text,
  valor_total numeric(18,2),
  iva numeric(18,2),
  retencion_referencia text,
  valor_pagado numeric(18,2) not null check (valor_pagado > 0),
  documento text,
  cuenta_pago_id uuid not null
    references public.fin_cuentas_pago(id) on delete restrict,
  estado_clasificacion text not null default 'PENDIENTE'
    check (estado_clasificacion in ('AUTOMATICA', 'REVISADA', 'PENDIENTE')),
  confianza numeric(5,4) not null default 0
    check (confianza >= 0 and confianza <= 1),
  importacion_id uuid not null
    references public.fin_importaciones_pagos(id) on delete restrict,
  archivo_origen text not null,
  hoja_origen text not null,
  fila_origen integer not null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists fin_pagos_fecha_idx
  on public.fin_pagos (fecha_pago desc);
create index if not exists fin_pagos_semana_idx
  on public.fin_pagos (semana_inicio desc);
create index if not exists fin_pagos_proveedor_idx
  on public.fin_pagos (proveedor_normalizado, fecha_pago desc);
create index if not exists fin_pagos_cuenta_idx
  on public.fin_pagos (cuenta_pago_id, fecha_pago desc);
create index if not exists fin_pagos_clasificacion_idx
  on public.fin_pagos (estado_clasificacion, fecha_pago desc);

alter table public.fin_cuentas_pago enable row level security;
alter table public.fin_reglas_clasificacion_pago enable row level security;
alter table public.fin_importaciones_pagos enable row level security;
alter table public.fin_pagos enable row level security;

revoke all on table public.fin_cuentas_pago from anon;
revoke all on table public.fin_reglas_clasificacion_pago from anon;
revoke all on table public.fin_importaciones_pagos from anon;
revoke all on table public.fin_pagos from anon;
revoke insert, update, delete on table public.fin_cuentas_pago from authenticated;
revoke insert, update, delete on table public.fin_reglas_clasificacion_pago from authenticated;
revoke insert, update, delete on table public.fin_importaciones_pagos from authenticated;
revoke insert, update, delete on table public.fin_pagos from authenticated;
grant select on table public.fin_cuentas_pago to authenticated;
grant select on table public.fin_reglas_clasificacion_pago to authenticated;
grant select on table public.fin_importaciones_pagos to authenticated;
grant select on table public.fin_pagos to authenticated;

drop policy if exists fin_cuentas_pago_lectura on public.fin_cuentas_pago;
create policy fin_cuentas_pago_lectura
  on public.fin_cuentas_pago for select to authenticated
  using (public.app_puede_alguna(
    array['Administración', 'Reportes', 'Dashboard']
  ));

drop policy if exists fin_reglas_pago_lectura on public.fin_reglas_clasificacion_pago;
create policy fin_reglas_pago_lectura
  on public.fin_reglas_clasificacion_pago for select to authenticated
  using (public.app_puede_alguna(array['Administración']));

drop policy if exists fin_importaciones_pagos_lectura on public.fin_importaciones_pagos;
create policy fin_importaciones_pagos_lectura
  on public.fin_importaciones_pagos for select to authenticated
  using (public.app_puede_alguna(
    array['Administración', 'Reportes', 'Dashboard']
  ));

drop policy if exists fin_pagos_lectura on public.fin_pagos;
create policy fin_pagos_lectura
  on public.fin_pagos for select to authenticated
  using (public.app_puede_alguna(
    array['Administración', 'Reportes', 'Dashboard']
  ));

create or replace function public.fin_importar_pagos(
  p_archivo_nombre text,
  p_archivo_hash text,
  p_hoja_origen text,
  p_lineas jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_importacion_id uuid;
  v_fecha_desde date;
  v_fecha_hasta date;
  v_movimientos integer;
  v_nuevos integer;
  v_actualizados integer;
  v_pendientes integer;
  v_total numeric(18,2);
begin
  if auth.uid() is null then
    raise exception 'No existe una sesion valida.';
  end if;

  if not public.app_puede_alguna(array['Administración']) then
    raise exception 'No tienes permiso para importar pagos.'
      using errcode = '42501';
  end if;

  if trim(coalesce(p_archivo_nombre, '')) = ''
     or trim(coalesce(p_archivo_hash, '')) = ''
     or trim(coalesce(p_hoja_origen, '')) = '' then
    raise exception 'El archivo, su huella y la hoja de origen son obligatorios.';
  end if;

  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array'
     or jsonb_array_length(p_lineas) = 0 then
    raise exception 'El archivo no contiene pagos para importar.';
  end if;

  if jsonb_array_length(p_lineas) > 5000 then
    raise exception 'El archivo supera el máximo de 5000 pagos por importación.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_lineas) as linea(
      clave_origen text,
      fecha_pago text,
      semana_inicio text,
      proveedor text,
      proveedor_normalizado text,
      valor_pagado numeric,
      cuenta_codigo text,
      estado_clasificacion text,
      confianza numeric,
      fila_origen integer
    )
    where nullif(trim(coalesce(linea.clave_origen, '')), '') is null
       or linea.fecha_pago !~ '^20[0-9]{2}-(0[1-9]|1[0-2])-([0-2][0-9]|3[0-1])$'
       or linea.semana_inicio !~ '^20[0-9]{2}-(0[1-9]|1[0-2])-([0-2][0-9]|3[0-1])$'
       or nullif(trim(coalesce(linea.proveedor, '')), '') is null
       or nullif(trim(coalesce(linea.proveedor_normalizado, '')), '') is null
       or linea.valor_pagado is null or linea.valor_pagado <= 0
       or linea.estado_clasificacion not in ('AUTOMATICA', 'REVISADA', 'PENDIENTE')
       or linea.confianza is null or linea.confianza < 0 or linea.confianza > 1
       or linea.fila_origen is null or linea.fila_origen < 1
  ) then
    raise exception 'Existen fechas, proveedores, valores o clasificaciones inválidas.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_lineas) as linea(clave_origen text)
    group by trim(linea.clave_origen)
    having count(*) > 1
  ) then
    raise exception 'El archivo contiene pagos duplicados.';
  end if;

  select
    min(linea.fecha_pago::date),
    max(linea.fecha_pago::date),
    count(*)::integer,
    coalesce(sum(linea.valor_pagado), 0)::numeric(18,2)
  into v_fecha_desde, v_fecha_hasta, v_movimientos, v_total
  from jsonb_to_recordset(p_lineas) as linea(
    fecha_pago text,
    valor_pagado numeric
  );

  select count(*)::integer
  into v_actualizados
  from jsonb_to_recordset(p_lineas) as linea(clave_origen text)
  join public.fin_pagos pago
    on pago.clave_origen = trim(linea.clave_origen);

  v_nuevos := v_movimientos - v_actualizados;

  insert into public.fin_importaciones_pagos (
    archivo_nombre, archivo_hash, hoja_origen,
    fecha_desde, fecha_hasta, movimientos_archivo,
    movimientos_nuevos, movimientos_actualizados,
    movimientos_pendientes, total_pagado, creado_por
  )
  values (
    trim(p_archivo_nombre), trim(p_archivo_hash), trim(p_hoja_origen),
    v_fecha_desde, v_fecha_hasta, v_movimientos,
    v_nuevos, v_actualizados, 0, v_total, auth.uid()
  )
  returning id into v_importacion_id;

  insert into public.fin_pagos as existente (
    clave_origen, fecha_pago, semana_inicio, fecha_emision,
    estado_pago, factura, proveedor, proveedor_normalizado,
    descripcion, valor_total, iva, retencion_referencia,
    valor_pagado, documento, cuenta_pago_id,
    estado_clasificacion, confianza, importacion_id,
    archivo_origen, hoja_origen, fila_origen
  )
  select
    trim(linea.clave_origen),
    linea.fecha_pago::date,
    linea.semana_inicio::date,
    nullif(linea.fecha_emision, '')::date,
    coalesce(nullif(upper(trim(linea.estado_pago)), ''), 'PAGADO'),
    nullif(trim(linea.factura), ''),
    trim(linea.proveedor),
    trim(linea.proveedor_normalizado),
    nullif(trim(linea.descripcion), ''),
    round(linea.valor_total, 2),
    round(linea.iva, 2),
    nullif(trim(linea.retencion_referencia), ''),
    round(linea.valor_pagado, 2),
    nullif(trim(linea.documento), ''),
    coalesce(cuenta.id, pendiente.id),
    case when cuenta.id is null then 'PENDIENTE'
      else linea.estado_clasificacion end,
    case when cuenta.id is null then 0 else linea.confianza end,
    v_importacion_id,
    trim(p_archivo_nombre),
    trim(p_hoja_origen),
    linea.fila_origen
  from jsonb_to_recordset(p_lineas) as linea(
    clave_origen text,
    fecha_pago text,
    semana_inicio text,
    fecha_emision text,
    estado_pago text,
    factura text,
    proveedor text,
    proveedor_normalizado text,
    descripcion text,
    valor_total numeric,
    iva numeric,
    retencion_referencia text,
    valor_pagado numeric,
    documento text,
    cuenta_codigo text,
    estado_clasificacion text,
    confianza numeric,
    fila_origen integer
  )
  left join public.fin_cuentas_pago cuenta
    on cuenta.codigo = trim(linea.cuenta_codigo) and cuenta.activo
  cross join lateral (
    select id from public.fin_cuentas_pago where codigo = 'PENDIENTE'
  ) pendiente
  on conflict (clave_origen) do update
  set fecha_pago = excluded.fecha_pago,
      semana_inicio = excluded.semana_inicio,
      fecha_emision = excluded.fecha_emision,
      estado_pago = excluded.estado_pago,
      factura = excluded.factura,
      proveedor = excluded.proveedor,
      proveedor_normalizado = excluded.proveedor_normalizado,
      descripcion = excluded.descripcion,
      valor_total = excluded.valor_total,
      iva = excluded.iva,
      retencion_referencia = excluded.retencion_referencia,
      valor_pagado = excluded.valor_pagado,
      documento = excluded.documento,
      cuenta_pago_id = case
        when existente.estado_clasificacion = 'REVISADA'
          then existente.cuenta_pago_id
        else excluded.cuenta_pago_id
      end,
      estado_clasificacion = case
        when existente.estado_clasificacion = 'REVISADA'
          then existente.estado_clasificacion
        else excluded.estado_clasificacion
      end,
      confianza = case
        when existente.estado_clasificacion = 'REVISADA'
          then existente.confianza
        else excluded.confianza
      end,
      importacion_id = excluded.importacion_id,
      archivo_origen = excluded.archivo_origen,
      hoja_origen = excluded.hoja_origen,
      fila_origen = excluded.fila_origen,
      actualizado_en = now();

  select count(*)::integer
  into v_pendientes
  from public.fin_pagos pago
  join jsonb_to_recordset(p_lineas) as linea(clave_origen text)
    on trim(linea.clave_origen) = pago.clave_origen
  where pago.estado_clasificacion = 'PENDIENTE';

  update public.fin_importaciones_pagos
  set movimientos_pendientes = v_pendientes
  where id = v_importacion_id;

  return jsonb_build_object(
    'importacion_id', v_importacion_id,
    'fecha_desde', v_fecha_desde,
    'fecha_hasta', v_fecha_hasta,
    'movimientos_archivo', v_movimientos,
    'movimientos_nuevos', v_nuevos,
    'movimientos_actualizados', v_actualizados,
    'movimientos_pendientes', v_pendientes,
    'total_pagado', v_total
  );
end;
$$;

revoke all on function public.fin_importar_pagos(text, text, text, jsonb)
  from public, anon;
grant execute on function public.fin_importar_pagos(text, text, text, jsonb)
  to authenticated;

create or replace function public.fin_actualizar_clasificacion_pago(
  p_pago_id uuid,
  p_cuenta_codigo text,
  p_recordar_proveedor boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cuenta_id uuid;
  v_proveedor_normalizado text;
begin
  if auth.uid() is null then
    raise exception 'No existe una sesion valida.';
  end if;

  if not public.app_puede_alguna(array['Administración']) then
    raise exception 'No tienes permiso para clasificar pagos.'
      using errcode = '42501';
  end if;

  select id into v_cuenta_id
  from public.fin_cuentas_pago
  where codigo = trim(p_cuenta_codigo) and activo;

  if v_cuenta_id is null then
    raise exception 'La cuenta seleccionada no existe o está inactiva.';
  end if;

  update public.fin_pagos
  set cuenta_pago_id = v_cuenta_id,
      estado_clasificacion = case
        when trim(p_cuenta_codigo) = 'PENDIENTE' then 'PENDIENTE'
        else 'REVISADA' end,
      confianza = case
        when trim(p_cuenta_codigo) = 'PENDIENTE' then 0 else 1 end,
      actualizado_en = now()
  where id = p_pago_id
  returning proveedor_normalizado into v_proveedor_normalizado;

  if v_proveedor_normalizado is null then
    raise exception 'El pago seleccionado no existe.';
  end if;

  if coalesce(p_recordar_proveedor, false)
     and trim(p_cuenta_codigo) <> 'PENDIENTE'
     and v_proveedor_normalizado <> '' then
    insert into public.fin_reglas_clasificacion_pago (
      campo, patron, cuenta_pago_id, prioridad,
      confianza, origen, creado_por
    )
    values (
      'PROVEEDOR', v_proveedor_normalizado, v_cuenta_id, 34,
      1, 'USUARIO', auth.uid()
    )
    on conflict (campo, patron) do update
    set cuenta_pago_id = excluded.cuenta_pago_id,
        prioridad = excluded.prioridad,
        confianza = excluded.confianza,
        origen = 'USUARIO',
        activo = true,
        actualizado_en = now();
  end if;
end;
$$;

revoke all on function public.fin_actualizar_clasificacion_pago(uuid, text, boolean)
  from public, anon;
grant execute on function public.fin_actualizar_clasificacion_pago(uuid, text, boolean)
  to authenticated;

create or replace view public.fin_vw_pagos_detalle
with (security_invoker = true)
as
select
  pago.id,
  pago.clave_origen,
  pago.fecha_pago,
  pago.semana_inicio,
  extract(week from pago.fecha_pago)::integer as semana_numero,
  pago.fecha_emision,
  pago.estado_pago,
  pago.factura,
  pago.proveedor,
  pago.descripcion,
  pago.valor_total,
  pago.iva,
  pago.retencion_referencia,
  pago.valor_pagado,
  pago.documento,
  pago.estado_clasificacion,
  pago.confianza,
  cuenta.codigo as cuenta_codigo,
  cuenta.nombre as cuenta_nombre,
  cuenta.grupo,
  cuenta.naturaleza,
  cuenta.cuenta_contable_referencia,
  cuenta.impacta_ebitda,
  pago.archivo_origen,
  pago.hoja_origen,
  pago.fila_origen,
  pago.actualizado_en
from public.fin_pagos pago
join public.fin_cuentas_pago cuenta on cuenta.id = pago.cuenta_pago_id;

create or replace view public.fin_vw_pagos_semanales
with (security_invoker = true)
as
select
  pago.semana_inicio,
  extract(week from pago.semana_inicio)::integer as semana_numero,
  cuenta.codigo as cuenta_codigo,
  cuenta.nombre as cuenta_nombre,
  cuenta.grupo,
  cuenta.naturaleza,
  cuenta.impacta_ebitda,
  count(*)::integer as movimientos,
  sum(pago.valor_pagado)::numeric(18,2) as total_pagado,
  max(pago.actualizado_en) as actualizado_en
from public.fin_pagos pago
join public.fin_cuentas_pago cuenta on cuenta.id = pago.cuenta_pago_id
where pago.estado_pago = 'PAGADO'
group by
  pago.semana_inicio,
  cuenta.codigo,
  cuenta.nombre,
  cuenta.grupo,
  cuenta.naturaleza,
  cuenta.impacta_ebitda;

grant select on public.fin_vw_pagos_detalle to authenticated;
grant select on public.fin_vw_pagos_semanales to authenticated;
revoke all on public.fin_vw_pagos_detalle from anon;
revoke all on public.fin_vw_pagos_semanales from anon;

comment on table public.fin_pagos is
  'Pagos importados y clasificados para análisis gerencial de caja. No reemplaza el registro contable por devengo.';
