import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as catalogo from '../supabase/functions/_shared/catalogoPermisos.ts'
import * as utilPermisos from '../src/utils/permisosAplicacion.ts'
import {
  PANTALLA_ANTICIPAR_COMPRAS, PANTALLA_FACTURAS_COMPRAS, PANTALLA_FACTURAS_SRI, PANTALLA_MENU_COMPRAS,
  PANTALLA_NO_DEDUCIBLES, PANTALLA_NOTAS_VENTA, puedeAbrirPantalla, permisoDePantalla, filtrarModulosPermitidos, permisosCoinciden,
} from '../src/utils/permisosAplicacion.ts'

const root = new URL('../', import.meta.url)
const leer = (path) => fs.readFileSync(new URL(path, root), 'utf8')
const compilar = (source) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText

test('El menú Comercial conserva permisos exactos y antiguos sin conceder opciones hermanas', () => {
  const menu = utilPermisos.PANTALLA_MENU_COMERCIAL
  for (const permiso of ['Comercial · Ventas', 'Pedidos', 'Campo comercial', 'KPI KAM']) {
    const puede = ruta => puedeAbrirPantalla(ruta, 'KAM', [permiso])
    assert.equal(puede(menu), true, permiso)
    assert.deepEqual(filtrarModulosPermitidos([{entrada:menu,items:[]}],puede), [{entrada:menu,items:[]}])
    assert.equal(puedeAbrirPantalla(menu, 'KAM', [permiso], utilPermisos.PANTALLAS_MENU_COMERCIAL), false)
  }
  assert.equal(puedeAbrirPantalla(menu, 'KAM', ['KPI KAM'], [menu]), false)
  assert.equal(puedeAbrirPantalla(menu, 'KAM', []), false)
  assert.equal(puedeAbrirPantalla(menu, 'KAM', ['Dashboard']), false)
  assert.equal(puedeAbrirPantalla('Comercial · Pedidos', 'KAM', ['KPI KAM']), false)
})

test('Impuestos comparte Cuentas por pagar y respeta denegaciones', () => {
  const c=utilPermisos.PANTALLA_CUENTAS_POR_PAGAR,i=utilPermisos.PANTALLA_IMPUESTOS
  for(const rol of ['ADMINISTRADOR','JEFA_FACTURACION','KAM']) {
    assert.equal(puedeAbrirPantalla(i,rol,[c]),true)
    assert.equal(puedeAbrirPantalla(i,rol,[c],[c]),false)
  }
  assert.equal(puedeAbrirPantalla(i,'KAM',[]),false)
})
test('Préstamos comparte Cuentas por pagar sin conceder Pagos semanales', () => {
  const cuentas=utilPermisos.PANTALLA_CUENTAS_POR_PAGAR,prestamos=utilPermisos.PANTALLA_PRESTAMOS
  for(const rol of ['ADMINISTRADOR','JEFA_FACTURACION','KAM']) {
    assert.equal(puedeAbrirPantalla(prestamos,rol,[cuentas]),true)
    assert.equal(puedeAbrirPantalla(prestamos,rol,[cuentas],[cuentas]),false)
    if(rol!=='ADMINISTRADOR') assert.equal(puedeAbrirPantalla(utilPermisos.PANTALLA_PAGOS_SEMANALES,rol,[cuentas]),false)
  }
  assert.equal(puedeAbrirPantalla(prestamos,'KAM',[]),false)
})

test('Reportes financieros hereda lectura de Cuentas por pagar y respeta una denegación explícita', () => {
  const cuentas=utilPermisos.PANTALLA_CUENTAS_POR_PAGAR,reporte=utilPermisos.PANTALLA_REPORTES_FINANZAS
  assert.equal(puedeAbrirPantalla(reporte,'JEFA_FACTURACION',[cuentas]),true)
  assert.equal(puedeAbrirPantalla(reporte,'JEFA_FACTURACION',[cuentas],[cuentas]),false)
  assert.equal(puedeAbrirPantalla(reporte,'KAM',['KPI KAM']),false)
  assert.equal(puedeAbrirPantalla(reporte,'ADMINISTRADOR',[]),true)
})

test('Reglas de retenciones comparte el permiso exacto de Cuentas por pagar sin habilitar pagos semanales', () => {
  for (const rol of ['ADMINISTRADOR', 'JEFA_FACTURACION', 'KAM']) {
    const cuentas = utilPermisos.PANTALLA_CUENTAS_POR_PAGAR
    assert.equal(puedeAbrirPantalla(utilPermisos.PANTALLA_RETENCIONES, rol, [cuentas]), true)
    assert.equal(puedeAbrirPantalla(utilPermisos.PANTALLA_RETENCIONES, rol, [cuentas], [cuentas]), false)
    if (rol !== 'ADMINISTRADOR') assert.equal(puedeAbrirPantalla(utilPermisos.PANTALLA_PAGOS_SEMANALES, rol, [cuentas]), false)
  }
})

test('Las tarjetas de Producción conservan la entrada para permisos específicos y antiguos', () => {
  const menu = utilPermisos.PANTALLA_MENU_PRODUCCION
  for (const permiso of ['Producción · Planificación', 'Preformulación', 'Semielaborados', 'Hoja de producción']) {
    const puede = ruta => puedeAbrirPantalla(ruta, 'OPERADOR', [permiso])
    assert.equal(puede(menu), true, permiso)
    assert.equal(filtrarModulosPermitidos([{ entrada: menu, items: [] }], puede).length, 1)
  }
  assert.equal(puedeAbrirPantalla(menu, 'OPERADOR', ['Producción · Planificación'], ['Producción · Planificación']), false)
  assert.equal(puedeAbrirPantalla(menu, 'KAM', ['KPI KAM']), false)
  assert.equal(puedeAbrirPantalla('Producción · Producción', 'OPERADOR', ['Producción · Planificación']), false)
})

test('Un KAM con acceso personalizado no ve Pedidos, Dashboard ni Administración', () => {
  const puede = (ruta) => puedeAbrirPantalla(ruta, 'KAM', ['KPI KAM'])
  assert.equal(puede('KPI KAM'), true)
  assert.equal(puede('Comercial · KPI KAM'), true)
  for (const ruta of ['Dashboard', 'Comercial · Pedidos', 'Usuarios y permisos', 'Administración · Usuarios y Permisos', 'Pagos y Finanzas · Pagos']) assert.equal(puede(ruta), false, ruta)
  const modulos = [{ entrada: 'Dashboard', items: [] }, { entrada: 'Comercial · Pedidos', items: [{ pantalla: 'Comercial · Pedidos' }, { pantalla: 'Comercial · KPI KAM' }] }]
  assert.deepEqual(filtrarModulosPermitidos(modulos, puede), [{ entrada: 'Comercial · KPI KAM', items: [{ pantalla: 'Comercial · KPI KAM' }] }])
})

test('Revocar acceso también bloquea aliases y una pantalla guardada de la sesión anterior', () => {
  assert.equal(puedeAbrirPantalla('Comercial · Visitas y rotación', 'MERCADERISTA', ['Campo comercial']), true)
  assert.equal(puedeAbrirPantalla('Campo comercial', 'MERCADERISTA', []), false)
  assert.equal(puedeAbrirPantalla('Comercial · Visitas y rotación', 'MERCADERISTA', []), false)
  assert.equal(puedeAbrirPantalla('Usuarios y permisos', 'GERENTE', ['Usuarios y permisos']), false)
  assert.equal(puedeAbrirPantalla('Usuarios y permisos', 'ADMINISTRADOR', []), true)
})

test('El menú de Compras permite regresar desde cualquier sección autorizada', () => {
  for (const [rol, permitidas, ruta] of [
    ['BODEGUERO', ['Materias primas'], 'Compras · Kardex'],
    ['GERENTE', ['Administración'], 'Compras · Facturas'],
    ['ADMINISTRADOR', [], 'Compras · Facturas del SRI'],
  ]) {
    assert.equal(puedeAbrirPantalla(ruta, rol, permitidas), true)
    assert.equal(puedeAbrirPantalla(PANTALLA_MENU_COMPRAS, rol, permitidas), true)
    assert.equal(puedeAbrirPantalla(PANTALLA_ANTICIPAR_COMPRAS, rol, permitidas), false)
  }
  assert.equal(puedeAbrirPantalla(PANTALLA_MENU_COMPRAS, 'KAM', ['KPI KAM']), false)
  assert.equal(puedeAbrirPantalla(PANTALLA_ANTICIPAR_COMPRAS, 'GERENTE', ['Administración', 'Materias primas']), true)
})

test('Facturas de compras agrupa documentos sin ampliar el acceso al SRI', () => {
  const rutas = [PANTALLA_FACTURAS_COMPRAS, PANTALLA_FACTURAS_SRI, PANTALLA_NOTAS_VENTA, PANTALLA_NO_DEDUCIBLES]
  const accesos = (rol, permisos) => rutas.filter(ruta => puedeAbrirPantalla(ruta, rol, permisos))
  assert.deepEqual(accesos('ADMINISTRADOR', ['Administración']), rutas)
  assert.deepEqual(accesos('ADMINISTRADOR', []), [PANTALLA_FACTURAS_COMPRAS, PANTALLA_FACTURAS_SRI])
  assert.deepEqual(accesos('GERENTE', ['Administración']), [PANTALLA_FACTURAS_COMPRAS, PANTALLA_NOTAS_VENTA, PANTALLA_NO_DEDUCIBLES])
  assert.deepEqual(accesos('BODEGUERO', ['Materias primas']), [])
})

test('Un permiso exacto abre su opción sin conceder los menús hermanos', () => {
  const permitidas = ['Compras · Notas de venta']
  const puede = (ruta) => puedeAbrirPantalla(ruta, 'GERENTE', permitidas)
  assert.equal(puede(PANTALLA_NOTAS_VENTA), true)
  assert.equal(puede(PANTALLA_MENU_COMPRAS), true)
  assert.equal(puede(PANTALLA_FACTURAS_COMPRAS), true)
  assert.equal(puede(PANTALLA_NO_DEDUCIBLES), false)
  assert.equal(puede('Administración · Configuración'), false)
  assert.equal(puedeAbrirPantalla(PANTALLA_FACTURAS_SRI, 'GERENTE', [PANTALLA_FACTURAS_SRI]), true)
})

test('La denegación exacta prevalece sobre el permiso anterior y los aliases', () => {
  assert.equal(puedeAbrirPantalla('Comercial · Pedidos', 'GERENTE', ['Pedidos'], ['Comercial · Pedidos']), false)
  assert.equal(puedeAbrirPantalla('Pedidos', 'GERENTE', ['Pedidos'], ['Comercial · Pedidos']), false)
  assert.equal(puedeAbrirPantalla('Producción · Pedidos', 'GERENTE', ['Pedidos'], ['Comercial · Pedidos']), true)
  assert.equal(puedeAbrirPantalla(PANTALLA_FACTURAS_SRI, 'ADMINISTRADOR', [], [PANTALLA_FACTURAS_SRI]), false)
  assert.equal(puedeAbrirPantalla(PANTALLA_MENU_COMPRAS, 'ADMINISTRADOR', [], [PANTALLA_MENU_COMPRAS]), false)
  const todas = [...catalogo.RUTAS_PERMISOS]
  assert.equal(puedeAbrirPantalla(PANTALLA_MENU_COMPRAS, 'ADMINISTRADOR', [], todas), false)
  assert.equal(puedeAbrirPantalla(PANTALLA_MENU_COMPRAS, 'GERENTE', [PANTALLA_NOTAS_VENTA], [PANTALLA_MENU_COMPRAS, PANTALLA_FACTURAS_COMPRAS]), true)
})

test('Facturas SRI se puede asignar y revocar para cualquier rol sin abrir otras opciones', () => {
  assert.equal(catalogo.RUTAS_SOLO_ADMIN.includes(PANTALLA_FACTURAS_SRI), false)
  for (const rol of ['GERENTE', 'BODEGUERO', 'GERENTE_OPERACIONES', 'JEFA_FACTURACION', 'KAM', 'MERCADERISTA']) {
    const permisos = [PANTALLA_FACTURAS_SRI]
    for (const ruta of [PANTALLA_FACTURAS_SRI, PANTALLA_FACTURAS_COMPRAS, PANTALLA_MENU_COMPRAS]) {
      assert.equal(puedeAbrirPantalla(ruta, rol, permisos), true, `${rol} ${ruta}`)
    }
    assert.equal(puedeAbrirPantalla(PANTALLA_FACTURAS_SRI, rol, [], []), false)
    assert.equal(puedeAbrirPantalla(PANTALLA_FACTURAS_SRI, rol, permisos, permisos), false)
    assert.equal(puedeAbrirPantalla(PANTALLA_NOTAS_VENTA, rol, permisos), false)
    assert.equal(puedeAbrirPantalla('Pagos y Finanzas · Pagos semanales', rol, permisos), false)
    assert.equal(puedeAbrirPantalla('Administración · Usuarios y Permisos', rol, permisos), false)
  }
})

test('El catálogo cubre las rutas del menú y las pantallas antiguas', () => {
  for (const [, ruta] of leer('src/App.tsx').matchAll(/case "([^"]+)":/g)) {
    assert.ok(catalogo.RUTAS_PERMISOS.includes(catalogo.ALIASES_PERMISOS[ruta] ?? ruta), ruta)
  }
  assert.equal(new Set(catalogo.RUTAS_PERMISOS).size, catalogo.RUTAS_PERMISOS.length)
})

test('Cuentas y Pagos semanales se autorizan por permiso exacto para todos los roles', () => {
  for (const rol of ['ADMINISTRADOR','GERENTE','JEFA_FACTURACION','KAM','BODEGUERO']) {
    for (const ruta of ['Pagos y Finanzas · Cuentas por Pagar','Pagos y Finanzas · Pagos semanales']) {
      assert.equal(puedeAbrirPantalla(ruta,rol,[ruta]),true)
      assert.equal(puedeAbrirPantalla(ruta,rol,[ruta],[ruta]),false)
    }
  }
})

test('Anticipos hereda Cuentas por pagar y se abre desde Facturas de compras con cualquier rol autorizado', () => {
  for (const rol of ['ADMINISTRADOR','JEFA_FACTURACION','GERENTE']) {
    const permiso='Pagos y Finanzas · Cuentas por Pagar'
    assert.equal(puedeAbrirPantalla(utilPermisos.PANTALLA_ANTICIPOS,rol,[permiso]),true)
    assert.equal(puedeAbrirPantalla(PANTALLA_FACTURAS_COMPRAS,rol,[permiso]),true)
    assert.equal(puedeAbrirPantalla(PANTALLA_MENU_COMPRAS,rol,[permiso]),true)
    assert.equal(puedeAbrirPantalla(utilPermisos.PANTALLA_ANTICIPOS,rol,[permiso],[permiso]),false)
  }
})

function servicio(responder, error = null) {
  const module = { exports: {} }; const eventos = []
  vm.runInNewContext(compilar(leer('src/services/usuarioService.ts')), {
    module, exports: module.exports, Error, Event,
    window: { dispatchEvent: (event) => eventos.push(event.type) },
    require: (name) => name.includes('permisosAplicacion') ? { permisosCoinciden } : {
      supabase: { functions: { invoke: async (_, { body }) => ({ data: await responder(body), error }) } },
    },
  })
  return { ...module.exports, eventos }
}

test('Un fallo de red conserva su mensaje cuando el contexto no es Response', async () => {
  const api = servicio(() => null, { message: 'No se pudo conectar con usuarios', context: new Error('red') })
  await assert.rejects(api.listarUsuarios(), /No se pudo conectar con usuarios/)
})

test('La administración muestra el error JSON del servidor y tolera cuerpos ilegibles', async () => {
  const api = servicio(() => null, { message: 'HTTP 403', context: { clone: () => ({ json: async () => ({ error: 'Solo administrador' }) }) } })
  await assert.rejects(api.listarUsuarios(), /Solo administrador/)
  const ilegible = servicio(() => null, { message: 'HTTP 502', context: { clone: () => ({ json: async () => { throw new Error('JSON inválido') } }) } })
  await assert.rejects(ilegible.listarUsuarios(), /HTTP 502/)
})

test('Todas las rutas existentes mantienen una categoría de permisos, sin alterar Dashboard ni Roles de pago', () => {
  const { PANTALLAS_APLICACION } = servicio(() => {})
  for (const [, ruta] of leer('src/App.tsx').matchAll(/case "([^"]+)":/g)) assert.ok(PANTALLAS_APLICACION.includes(permisoDePantalla(ruta)), ruta)
  assert.equal(permisoDePantalla('Dashboard · Rentabilidad'), 'Dashboard')
  assert.equal(permisoDePantalla('Dashboard · Visitas y rotación'), 'Campo comercial')
  assert.equal(permisoDePantalla('Pagos y Finanzas · Roles de pago'), 'Administración')
})

const usuario = { user_id: 'target', email: 'kam@example.com', nombre: 'KAM', rol: 'KAM', activo: true, permisos_personalizados: [] }
const lista = (usuarios) => ({ ok: true, data: { usuarios, auditoria: [] } })

test('No confirma creación si la función responde éxito pero el usuario no aparece guardado', async () => {
  const s = servicio((body) => body.action === 'create' ? { ok: true, data: usuario } : lista([]))
  await assert.rejects(s.crearUsuario({ email: usuario.email, nombre: usuario.nombre, rol: usuario.rol, password: 'temporal-test' }), /verificar/)
  assert.equal(s.eventos.length, 0)
})

test('No confirma permisos parciales ni un éxito que no corresponde a los datos persistidos', async () => {
  const permisos = [{ pantalla: 'KPI KAM', permitido: true }, { pantalla: 'Descuentos', permitido: false }]
  for (const datos of [permisos.slice(0, 1), permisos]) {
    const s = servicio((body) => body.action === 'permissions' ? { ok: true, data: datos } : lista([usuario]))
    await assert.rejects(s.guardarPermisosUsuario('target', permisos), /no confirmó/)
    assert.equal(s.eventos.length, 0)
  }
})

test('El guardado y la restauración se confirman tras leerlos y notifican el acceso de la sesión', async () => {
  const permisos = [{ pantalla: 'KPI KAM', permitido: true }]
  let guardados = permisos
  const s = servicio((body) => body.action === 'permissions' ? (guardados = body.permisos, { ok: true, data: guardados }) : lista([{ ...usuario, permisos_personalizados: guardados }]))
  await s.guardarPermisosUsuario('target', permisos)
  await s.guardarPermisosUsuario('target', [])
  assert.deepEqual(s.eventos, ['cibuspan:acceso-actualizado', 'cibuspan:acceso-actualizado'])
})

function servidor({ fallaEscritura = false, fallaPerfil = false } = {}) {
  let handler; const mutaciones = []; let permisos = [{ user_id: 'target', pantalla: 'Pedidos', permitido: true }]
  const perfiles = new Map([['admin', { user_id: 'admin', rol: 'ADMINISTRADOR', activo: true }], ['target', usuario]])
  const admin = {
    auth: { admin: {
      createUser: async () => { perfiles.set('nuevo', { user_id: 'nuevo', rol: 'BODEGUERO', activo: true }); return { data: { user: { id: 'nuevo' } }, error: null } },
      deleteUser: async (id) => { mutaciones.push(['deleteUser', id]); perfiles.delete(id); return { error: null } },
    } },
    from(tabla) {
      let operacion = 'select', contenido, userId, excluidos
      const ejecutar = () => {
        if (tabla === 'app_profiles') {
          if (operacion === 'upsert') return { error: fallaPerfil ? { message: 'Perfil inválido' } : null }
          return { data: perfiles.get(userId) ?? null, error: null }
        }
        if (tabla === 'app_audit_log') return { error: null }
        if (operacion === 'upsert') {
          if (fallaEscritura) return { error: { message: 'Escritura fallida' } }
          mutaciones.push(['upsert', contenido])
          for (const item of contenido) { permisos = permisos.filter((p) => p.pantalla !== item.pantalla); permisos.push(item) }
        }
        if (operacion === 'delete') { mutaciones.push(['delete']); permisos = excluidos ? permisos.filter((p) => excluidos.includes(p.pantalla)) : [] }
        return { data: permisos.map(({ pantalla, permitido }) => ({ pantalla, permitido })), error: null }
      }
      const q = {
        select() { return q }, eq(_, value) { userId = value; return q },
        single() { return Promise.resolve(ejecutar()) },
        delete() { operacion = 'delete'; return q },
        upsert(data) { operacion = 'upsert'; contenido = data; return q },
        insert() { return q },
        not(_, __, value) { excluidos = JSON.parse(`[${value.slice(1, -1)}]`); return q },
        then(resolve, reject) { return Promise.resolve(ejecutar()).then(resolve, reject) },
      }
      return q
    },
  }
  const auth = { auth: { getUser: async () => ({ data: { user: { id: 'admin' } }, error: null }) } }
  vm.runInNewContext(compilar(leer('supabase/functions/admin-users/index.ts')), {
    exports: {},
    Deno: { env: { get: (name) => name }, serve: (f) => handler = f }, Error, Response,
    require: (name) => name.includes('catalogoPermisos') ? catalogo : ({ createClient: (_, key) => key === 'SUPABASE_SERVICE_ROLE_KEY' ? admin : auth }),
  })
  return {
    llamar: (body) => handler(new Request('https://example.com', { method: 'POST', headers: { Authorization: 'Bearer prueba', 'Content-Type': 'application/json' }, body: JSON.stringify(body) })),
    mutaciones, perfiles, permisos: () => permisos,
  }
}

test('El servidor rechaza listas malformadas antes de borrar permisos anteriores', async () => {
  for (const permisos of [undefined, [{ pantalla: 'No existe', permitido: true }], [{ pantalla: 'KPI KAM', permitido: 'false' }], [{ pantalla: 'KPI KAM', permitido: true }, { pantalla: 'KPI KAM', permitido: false }]]) {
    const s = servidor(); const response = await s.llamar({ action: 'permissions', userId: 'target', permisos })
    assert.equal(response.status, 400)
    assert.equal(s.mutaciones.length, 0)
  }
})

test('El servidor admite Descuentos y confirma los permisos realmente guardados', async () => {
  const s = servidor(); const permisos = [{ pantalla: 'Descuentos', permitido: false }, { pantalla: 'KPI KAM', permitido: true }]
  const response = await s.llamar({ action: 'permissions', userId: 'target', permisos })
  assert.equal(response.status, 200)
  assert.equal(permisosCoinciden(permisos, (await response.json()).data), true)
})

test('El servidor persiste opciones anidadas permitidas y denegadas', async () => {
  const s = servidor()
  const permisos = [
    { pantalla: 'Compras · Resumen', permitido: false },
    { pantalla: 'Compras · Facturas de compras', permitido: false },
    { pantalla: 'Compras · Notas de venta', permitido: true },
    { pantalla: 'Compras · Gastos no deducibles', permitido: false },
  ]
  const response = await s.llamar({ action: 'permissions', userId: 'target', permisos })
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(permisosCoinciden(permisos, body.data), true)
  assert.equal(permisosCoinciden(permisos, s.permisos()), true)
})

test('Una escritura fallida conserva los permisos anteriores y devuelve el error real', async () => {
  const s = servidor({ fallaEscritura: true })
  const response = await s.llamar({ action: 'permissions', userId: 'target', permisos: [{ pantalla: 'KPI KAM', permitido: true }] })
  assert.equal(response.status, 500)
  assert.equal((await response.json()).error, 'Escritura fallida')
  assert.equal(s.permisos()[0].pantalla, 'Pedidos')
  assert.equal(s.mutaciones.length, 0)
})

test('Si falla la configuración inicial, se elimina únicamente el usuario recién creado', async () => {
  const s = servidor({ fallaPerfil: true })
  const response = await s.llamar({ action: 'create', email: 'nuevo@example.com', nombre: 'Nuevo', rol: 'KAM', password: 'temporal-test' })
  assert.equal(response.status, 500)
  assert.equal(s.perfiles.has('nuevo'), false)
  assert.equal(s.perfiles.has('admin'), true)
  assert.deepEqual(s.mutaciones, [['deleteUser', 'nuevo']])
})

function editor({ recargar = async () => [], guardar = async () => [] } = {}) {
  const module = { exports: {} }; const estados = []; let cursor = 0, terminar
  const confirmado = [], errores = []
  const terminado = new Promise((resolve) => terminar = resolve)
  const jsx = (type, props) => ({ type, props })
  vm.runInNewContext(compilar(`${leer('src/pages/UsuariosPermisos.tsx')}\nexport { EditorUsuario }`), {
    module, exports: module.exports, Error, Set,
    require: (name) => name === 'react/jsx-runtime' ? { jsx, jsxs: jsx } : name === 'react' ? {
      useState: (inicial) => {
        const i = cursor++
        if (!(i in estados)) estados[i] = inicial
        return [estados[i], (value) => { estados[i] = typeof value === 'function' ? value(estados[i]) : value }]
      },
      useMemo: (fn) => fn(),
    } : name.includes('catalogoPermisos') ? catalogo
      : name.includes('permisosAplicacion') ? utilPermisos
      : { ...servicio(() => {}), guardarPermisosUsuario: guardar },
  })
  const props = { usuario, guardando: false, error: '', mensaje: '', recargar,
    onGuardando: (value) => { if (!value) terminar() },
    onError: (value) => { props.error = value; errores.push(value) },
    onConfirmar: (value) => confirmado.push(value) }
  const render = () => { cursor = 0; return module.exports.EditorUsuario(props) }
  function elementos(node) {
    if (!node || typeof node !== 'object') return []
    if (Array.isArray(node)) return node.flatMap(elementos)
    return [node, ...elementos(node.props?.children)]
  }
  return { render: () => elementos(render()), terminado, confirmado, errores }
}

test('El formulario muestra el error dentro del modal y no anuncia éxito si falla la recarga', async () => {
  const e = editor({ recargar: async () => { throw new Error('No se pudo recargar') } })
  e.render().find((n) => n.type === 'button' && n.props.children === 'Guardar permisos').props.onClick()
  await e.terminado
  assert.equal(e.confirmado.filter(Boolean).length, 0)
  assert.equal(e.errores.at(-1), 'No se pudo recargar')
  assert.equal(e.render().find((n) => n.props?.role === 'alert').props.children, 'No se pudo recargar')
})

test('Restaurar permisos borra cambios locales incluso si el usuario ya tenía los valores del rol', async () => {
  const e = editor()
  const arbol = () => e.render().find((n) => typeof n.props?.cambiar === 'function' && n.props?.seleccionadas)
  arbol().props.cambiar(['Comercial · KPI KAM'], false)
  assert.equal(arbol().props.seleccionadas.has('Comercial · KPI KAM'), false)
  e.render().find((n) => n.type === 'button' && n.props.children === 'Restaurar permisos del rol').props.onClick()
  await e.terminado
  assert.equal(arbol().props.seleccionadas.has('Comercial · KPI KAM'), true)
})
