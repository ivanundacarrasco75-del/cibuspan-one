import { supabase } from "../lib/supabase"
import { permisosCoinciden } from "../utils/permisosAplicacion"

export const ROLES = [
  "ADMINISTRADOR",
  "GERENTE",
  "BODEGUERO",
  "GERENTE_OPERACIONES",
  "JEFA_FACTURACION",
  "KAM",
  "MERCADERISTA",
] as const

export type AppRole = (typeof ROLES)[number]

export const ETIQUETAS_ROL: Record<AppRole, string> = {
  ADMINISTRADOR: "Administrador",
  GERENTE: "Gerente",
  BODEGUERO: "Bodeguero",
  GERENTE_OPERACIONES: "Gerente de operaciones",
  JEFA_FACTURACION: "Jefa de facturación",
  KAM: "KAM / Comercial",
  MERCADERISTA: "Mercaderista",
}

export const PANTALLAS_APLICACION = [
  "Dashboard",
  "Pedidos",
  "Inventario",
  "Producción",
  "Semielaborados",
  "Despachos",
  "Historial despachos",
  "Devoluciones",
  "Descuentos",
  "Reportes",
  "Documentos",
  "Hoja de producción",
  "Hoja de despacho",
  "Anexo Supermaxi",
  "Administración",
  "Materias primas",
  "Preformulación",
  "Usuarios y permisos",
  "KPI KAM",
  "Campo comercial",
] as const

export type PantallaAplicacion =
  (typeof PANTALLAS_APLICACION)[number]

export const PERMISOS_PREDETERMINADOS: Record<
  AppRole,
  PantallaAplicacion[]
> = {
  ADMINISTRADOR: [...PANTALLAS_APLICACION],

  GERENTE: PANTALLAS_APLICACION.filter(
    (pantalla) => pantalla !== "Usuarios y permisos",
  ),

  BODEGUERO: ["Despachos"],

  GERENTE_OPERACIONES: [
    "Pedidos",
    "Inventario",
    "Despachos",
    "Devoluciones",
    "Documentos",
  ],

  JEFA_FACTURACION: [
    "Reportes",
    "Documentos",
  ],

  KAM: ["KPI KAM", "Campo comercial"],
  MERCADERISTA: ["Campo comercial"],
}

export type PerfilAplicacion = {
  user_id: string
  email: string
  nombre: string | null
  rol: AppRole
  activo: boolean
  creado_en?: string
  actualizado_en?: string
}

export type PermisoUsuario = {
  pantalla: PantallaAplicacion
  permitido: boolean
}

export type UsuarioAdministrable =
  PerfilAplicacion & {
    permisos_personalizados: PermisoUsuario[]
    ultimo_acceso?: string | null
  }

type RespuestaFuncion<T> = {
  ok: boolean
  data?: T
  error?: string
}

export async function obtenerAccesoActual(
  userId: string,
) {
  const {
    data: perfil,
    error: errorPerfil,
  } = await supabase
    .from("app_profiles")
    .select(
      "user_id,email,nombre,rol,activo,creado_en,actualizado_en",
    )
    .eq("user_id", userId)
    .single()

  if (errorPerfil) {
    throw new Error(
      "Falta instalar la configuración de usuarios y permisos en Supabase.",
    )
  }

  const {
    data: permisos,
    error: errorPermisos,
  } = await supabase.rpc(
    "app_mis_permisos",
  )

  if (errorPermisos) {
    throw new Error(
      "No fue posible consultar los permisos del usuario.",
    )
  }

  const pantallasPermitidas =
    (permisos ?? [])
      .filter(
        (item: { permitido: boolean }) =>
          item.permitido,
      )
      .map(
        (item: {
          pantalla: PantallaAplicacion
        }) => item.pantalla,
      )

  // Los roles de gerencia anteriores a Descuentos no tienen esa fila por defecto.
  // Un permiso personalizado explícito (incluido false) siempre tiene prioridad.
  if (["ADMINISTRADOR", "GERENTE"].includes(perfil.rol) &&
    !(permisos ?? []).some((item: { pantalla: string }) => item.pantalla === "Descuentos")) {
    pantallasPermitidas.push("Descuentos")
  }

  return {
    perfil: perfil as PerfilAplicacion,
    pantallasPermitidas: perfil.activo ? pantallasPermitidas : [],
  }
}

async function invocarAdministracion<T>(
  action: string,
  payload: Record<string, unknown> = {},
) {
  const {
    data,
    error,
  } =
    await supabase.functions.invoke<
      RespuestaFuncion<T>
    >(
      "admin-users",
      {
        body: {
          action,
          ...payload,
        },
      },
    )

  if (error) {
    const contexto =
      (
        error as {
          context?: Response
        }
      ).context

    if (contexto) {
      try {
        const body =
          await contexto
            .clone()
            .json() as {
              error?: string
            }

        if (body.error) {
          throw new Error(body.error)
        }
      } catch (contextError) {
        if (
          contextError instanceof Error &&
          !contextError.name.includes(
            "Syntax",
          )
        ) {
          throw contextError
        }
      }
    }

    throw new Error(
      error.message ||
        "No fue posible completar la operación.",
    )
  }

  if (!data?.ok) {
    throw new Error(
      data?.error ||
        "No fue posible completar la operación.",
    )
  }

  return data.data as T
}

export async function listarUsuarios() {
  const resultado = await invocarAdministracion<{
    usuarios: UsuarioAdministrable[]
    auditoria: RegistroAuditoria[]
  }>("list")
  if (!Array.isArray(resultado?.usuarios) || !Array.isArray(resultado?.auditoria)) {
    throw new Error("Supabase devolvió una lista de usuarios incompleta. No se puede confirmar el guardado.")
  }
  return resultado
}

async function verificarUsuario(userId: string, esperado: { nombre: string; rol: AppRole; activo: boolean; email?: string }) {
  const { usuarios } = await listarUsuarios()
  const guardado = usuarios.find((usuario) => usuario.user_id === userId)
  if (!guardado || guardado.nombre !== esperado.nombre.trim() || guardado.rol !== esperado.rol || guardado.activo !== esperado.activo ||
    (esperado.email && guardado.email.toLowerCase() !== esperado.email.trim().toLowerCase())) {
    throw new Error("No se pudieron verificar los datos guardados del usuario. Actualiza la lista antes de volver a intentar.")
  }
  window.dispatchEvent(new Event("cibuspan:acceso-actualizado"))
  return guardado
}

export async function crearUsuario(
  input: {
    email: string
    nombre: string
    rol: AppRole
    password: string
  },
) {
  const creado = await invocarAdministracion<UsuarioAdministrable>(
    "create",
    input,
  )
  if (!creado?.user_id) throw new Error("Supabase no confirmó la creación del usuario.")
  return verificarUsuario(creado.user_id, { ...input, activo: true })
}

export async function actualizarUsuario(
  input: {
    userId: string
    nombre: string
    rol: AppRole
    activo: boolean
  },
) {
  await invocarAdministracion<UsuarioAdministrable>(
    "update",
    input,
  )
  return verificarUsuario(input.userId, input)
}

export async function guardarPermisosUsuario(
  userId: string,
  permisos: PermisoUsuario[],
) {
  const respuesta = await invocarAdministracion<
    PermisoUsuario[]
  >(
    "permissions",
    {
      userId,
      permisos,
    },
  )
  const { usuarios } = await listarUsuarios()
  const usuario = usuarios.find((item) => item.user_id === userId)
  if (!Array.isArray(respuesta) || !permisosCoinciden(permisos, respuesta) || !usuario ||
    !permisosCoinciden(permisos, usuario.permisos_personalizados)) {
    throw new Error("Supabase no confirmó todos los permisos solicitados. No se consideran guardados; actualiza la lista.")
  }
  window.dispatchEvent(new Event("cibuspan:acceso-actualizado"))
  return respuesta
}

export async function restablecerPassword(
  userId: string,
  password: string,
) {
  return invocarAdministracion<void>(
    "reset_password",
    {
      userId,
      password,
    },
  )
}

export type RegistroAuditoria = {
  id: number
  actor_email: string | null
  target_email: string | null
  accion: string
  detalle: Record<string, unknown> | null
  creado_en: string
}
