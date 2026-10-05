import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { puedeAbrirPantalla, permisoDePantalla, filtrarModulosPermitidos, permisosCoinciden } from '../src/utils/permisosAplicacion.ts'

const root = new URL('../', import.meta.url)
const leer = (path) => fs.readFileSync(new URL(path, root), 'utf8')
const compilar = (source) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText

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

function servicio(responder) {
  const module = { exports: {} }; const eventos = []
  vm.runInNewContext(compilar(leer('src/services/usuarioService.ts')), {
    module, exports: module.exports, Error, Event,
    window: { dispatchEvent: (event) => eventos.push(event.type) },
    require: (name) => name.includes('permisosAplicacion') ? { permisosCoinciden } : {
      supabase: { functions: { invoke: async (_, { body }) => ({ data: await responder(body), error: null }) } },
    },
  })
  return { ...module.exports, eventos }
}

test('Todas las rutas existentes mantienen una categoría de permisos, sin alterar Dashboard ni Roles de pago', () => {
  const { PANTALLAS_APLICACION } = servicio(() => {})
  for (const [, ruta] of leer('src/App.tsx').matchAll(/case "([^"]+)":/g)) assert.ok(PANTALLAS_APLICACION.includes(permisoDePantalla(ruta)), ruta)
  assert.equal(permisoDePantalla('Dashboard · Rentabilidad'), 'Dashboard')
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
    require: () => ({ createClient: (_, key) => key === 'SUPABASE_SERVICE_ROLE_KEY' ? admin : auth }),
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
    } : { ...servicio(() => {}), guardarPermisosUsuario: guardar },
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
  const checkbox = e.render().find((n) => n.type === 'label' && n.props.children?.[1]?.props.children === 'KPI KAM').props.children[0]
  checkbox.props.onChange()
  assert.equal(e.render().find((n) => n.type === 'label' && n.props.children?.[1]?.props.children === 'KPI KAM').props.children[0].props.checked, false)
  e.render().find((n) => n.type === 'button' && n.props.children === 'Restaurar permisos del rol').props.onClick()
  await e.terminado
  assert.equal(e.render().find((n) => n.type === 'label' && n.props.children?.[1]?.props.children === 'KPI KAM').props.children[0].props.checked, true)
})
