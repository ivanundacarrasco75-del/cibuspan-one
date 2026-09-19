import { supabase } from "../lib/supabase"

export const ROLES = [
  "ADMINISTRADOR",
  "GERENTE",
  "BODEGUERO",
  "GERENTE_OPERACIONES",
  "JEFA_FACTURACION",
  "KAM",
] as const

export type AppRole = (typeof ROLES)[number]

export const ETIQUETAS_ROL: Record<AppRole, string> = {
  ADMINISTRADOR: "Administrador",
  GERENTE: "Gerente",
  BODEGUERO: "Bodeguero",
  GERENTE_OPERACIONES: "Gerente de operaciones",
  JEFA_FACTURACION: "Jefa de facturación",
  KAM: "KAM / Comercial",
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

  KAM: ["KPI KAM"],
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

  return {
    perfil: perfil as PerfilAplicacion,
    pantallasPermitidas,
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
  return invocarAdministracion<{
    usuarios: UsuarioAdministrable[]
    auditoria: RegistroAuditoria[]
  }>("list")
}

export async function crearUsuario(
  input: {
    email: string
    nombre: string
    rol: AppRole
    password: string
  },
) {
  return invocarAdministracion<UsuarioAdministrable>(
    "create",
    input,
  )
}

export async function actualizarUsuario(
  input: {
    userId: string
    nombre: string
    rol: AppRole
    activo: boolean
  },
) {
  return invocarAdministracion<UsuarioAdministrable>(
    "update",
    input,
  )
}

export async function guardarPermisosUsuario(
  userId: string,
  permisos: PermisoUsuario[],
) {
  return invocarAdministracion<
    PermisoUsuario[]
  >(
    "permissions",
    {
      userId,
      permisos,
    },
  )
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
