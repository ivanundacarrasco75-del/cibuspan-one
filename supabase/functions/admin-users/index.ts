import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const roles = new Set([
  "ADMINISTRADOR",
  "GERENTE",
  "BODEGUERO",
  "GERENTE_OPERACIONES",
  "JEFA_FACTURACION",
])

const pantallas = new Set([
  "Dashboard", "Pedidos", "Inventario", "Producción", "Semielaborados",
  "Despachos", "Historial despachos", "Devoluciones", "Reportes",
  "Documentos", "Hoja de producción", "Hoja de despacho", "Anexo Supermaxi",
  "Administración", "Materias primas", "Preformulación", "Usuarios y permisos",
])

function respuesta(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    const authorization = req.headers.get("Authorization") ?? ""

    if (!authorization) return respuesta(401, { ok: false, error: "Sesión requerida." })

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    })
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: authData, error: authError } = await authClient.auth.getUser()
    if (authError || !authData.user) {
      return respuesta(401, { ok: false, error: "La sesión no es válida." })
    }

    const actor = authData.user
    const { data: perfilActor } = await admin
      .from("app_profiles")
      .select("rol,activo,email")
      .eq("user_id", actor.id)
      .single()

    if (!perfilActor?.activo || perfilActor.rol !== "ADMINISTRADOR") {
      return respuesta(403, {
        ok: false,
        error: "Solo el administrador puede gestionar usuarios y permisos.",
      })
    }

    const body = await req.json()
    const action = String(body.action ?? "")

    async function auditar(
      accion: string,
      targetUserId: string | null,
      detalle: Record<string, unknown>,
    ) {
      await admin.from("app_audit_log").insert({
        actor_user_id: actor.id,
        target_user_id: targetUserId,
        accion,
        detalle,
      })
    }

    if (action === "list") {
      const [{ data: authUsers, error: usersError }, perfiles, permisos, auditoria] =
        await Promise.all([
          admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
          admin.from("app_profiles").select("*").order("nombre"),
          admin.from("app_user_permissions").select("user_id,pantalla,permitido"),
          admin
            .from("app_audit_log")
            .select("id,actor_user_id,target_user_id,accion,detalle,creado_en")
            .order("creado_en", { ascending: false })
            .limit(60),
        ])

      if (usersError || perfiles.error || permisos.error || auditoria.error) {
        throw usersError || perfiles.error || permisos.error || auditoria.error
      }

      const perfilesLista = perfiles.data ?? []
      const permisosLista = permisos.data ?? []
      const auditoriaLista = auditoria.data ?? []
      const usuariosAuth = new Map(authUsers.users.map((u) => [u.id, u]))
      const perfilesPorId = new Map(perfilesLista.map((p) => [p.user_id, p]))
      const emailPorId = new Map(perfilesLista.map((p) => [p.user_id, p.email]))

      const usuarios = Array.from(usuariosAuth.values()).map((u) => {
        const p = perfilesPorId.get(u.id)
        return {
          user_id: u.id,
          email: u.email ?? p?.email ?? "",
          nombre: p?.nombre ?? null,
          rol: p?.rol ?? "BODEGUERO",
          activo: p?.activo ?? false,
          creado_en: p?.creado_en ?? u.created_at,
          actualizado_en: p?.actualizado_en ?? u.updated_at,
          ultimo_acceso: u.last_sign_in_at ?? null,
          permisos_personalizados: permisosLista
            .filter((item) => item.user_id === u.id)
            .map(({ pantalla, permitido }) => ({ pantalla, permitido })),
        }
      })

      const registros = auditoriaLista.map((item) => ({
        ...item,
        actor_email: item.actor_user_id ? emailPorId.get(item.actor_user_id) ?? null : null,
        target_email: item.target_user_id ? emailPorId.get(item.target_user_id) ?? null : null,
      }))

      return respuesta(200, { ok: true, data: { usuarios, auditoria: registros } })
    }

    if (action === "create") {
      const email = String(body.email ?? "").trim().toLowerCase()
      const nombre = String(body.nombre ?? "").trim()
      const rol = String(body.rol ?? "")
      const password = String(body.password ?? "")

      if (!email.includes("@") || !nombre || !roles.has(rol) || password.length < 8) {
        return respuesta(400, {
          ok: false,
          error: "Revisa nombre, correo, rol y contraseña (mínimo 8 caracteres).",
        })
      }

      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { nombre, rol: "BODEGUERO" },
      })
      if (error || !data.user) throw error ?? new Error("No se pudo crear el usuario.")

      const { error: profileError } = await admin.from("app_profiles").upsert({
        user_id: data.user.id,
        email,
        nombre,
        rol,
        activo: true,
        actualizado_en: new Date().toISOString(),
      })
      if (profileError) throw profileError

      await auditar("USUARIO_CREADO", data.user.id, { email, nombre, rol })
      return respuesta(200, {
        ok: true,
        data: { user_id: data.user.id, email, nombre, rol, activo: true, permisos_personalizados: [] },
      })
    }

    if (action === "update") {
      const userId = String(body.userId ?? "")
      const nombre = String(body.nombre ?? "").trim()
      const rol = String(body.rol ?? "")
      const activo = Boolean(body.activo)

      if (!userId || !nombre || !roles.has(rol)) {
        return respuesta(400, { ok: false, error: "Los datos del usuario no son válidos." })
      }
      if (userId === actor.id && !activo) {
        return respuesta(400, { ok: false, error: "No puedes desactivar tu propio usuario." })
      }
      if (userId === actor.id && rol !== "ADMINISTRADOR") {
        return respuesta(400, { ok: false, error: "No puedes retirar tu propio rol de administrador." })
      }

      const { data: anterior } = await admin
        .from("app_profiles")
        .select("nombre,rol,activo,email")
        .eq("user_id", userId)
        .single()

      if (
        anterior?.rol === "ADMINISTRADOR" &&
        (!activo || rol !== "ADMINISTRADOR")
      ) {
        const { count } = await admin
          .from("app_profiles")
          .select("user_id", { count: "exact", head: true })
          .eq("rol", "ADMINISTRADOR")
          .eq("activo", true)

        if ((count ?? 0) <= 1) {
          return respuesta(400, {
            ok: false,
            error: "Debe permanecer al menos un administrador activo.",
          })
        }
      }

      const { data, error } = await admin
        .from("app_profiles")
        .update({ nombre, rol, activo, actualizado_en: new Date().toISOString() })
        .eq("user_id", userId)
        .select("*")
        .single()
      if (error) throw error

      const { error: authUpdateError } = await admin.auth.admin.updateUserById(userId, {
        ban_duration: activo ? "none" : "876000h",
        user_metadata: { nombre, rol: "BODEGUERO" },
      })
      if (authUpdateError) throw authUpdateError

      await auditar("USUARIO_ACTUALIZADO", userId, {
        anterior,
        nuevo: { nombre, rol, activo },
      })
      return respuesta(200, { ok: true, data })
    }

    if (action === "permissions") {
      const userId = String(body.userId ?? "")
      const recibidos = Array.isArray(body.permisos) ? body.permisos : []
      const permisosValidos = recibidos
        .filter((item) => pantallas.has(String(item.pantalla)))
        .map((item) => ({
          user_id: userId,
          pantalla: String(item.pantalla),
          permitido: Boolean(item.permitido),
          actualizado_por: actor.id,
          actualizado_en: new Date().toISOString(),
        }))

      if (!userId) return respuesta(400, { ok: false, error: "Usuario no válido." })

      const { error: deleteError } = await admin
        .from("app_user_permissions")
        .delete()
        .eq("user_id", userId)
      if (deleteError) throw deleteError

      if (permisosValidos.length) {
        const { error: insertError } = await admin
          .from("app_user_permissions")
          .insert(permisosValidos)
        if (insertError) throw insertError
      }

      await auditar("PERMISOS_ACTUALIZADOS", userId, {
        permisos: permisosValidos.map(({ pantalla, permitido }) => ({ pantalla, permitido })),
      })
      return respuesta(200, {
        ok: true,
        data: permisosValidos.map(({ pantalla, permitido }) => ({ pantalla, permitido })),
      })
    }

    if (action === "reset_password") {
      const userId = String(body.userId ?? "")
      const password = String(body.password ?? "")
      if (!userId || password.length < 8) {
        return respuesta(400, { ok: false, error: "La contraseña debe tener mínimo 8 caracteres." })
      }

      const { error } = await admin.auth.admin.updateUserById(userId, { password })
      if (error) throw error
      await auditar("CONTRASENA_RESTABLECIDA", userId, {})
      return respuesta(200, { ok: true })
    }

    return respuesta(400, { ok: false, error: "Acción no reconocida." })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado."
    return respuesta(500, { ok: false, error: message })
  }
})
