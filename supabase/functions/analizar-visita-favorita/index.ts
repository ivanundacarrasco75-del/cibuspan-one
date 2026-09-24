import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

function respuesta(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

const nullableNumber = { anyOf: [{ type: "number" }, { type: "null" }] }
const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] }

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    local_nombre: nullableString,
    codigo_barras: nullableString,
    codigo_referencia: nullableString,
    nombre_producto: nullableString,
    fecha_fuente: nullableString,
    precio_comercio: nullableNumber,
    precio_afiliado: nullableNumber,
    rotacion_diaria_unidades: nullableNumber,
    venta_diaria_valor: nullableNumber,
    prediccion_venta_unidades: nullableNumber,
    participacion_clase: nullableNumber,
    participacion_subclase: nullableNumber,
    stock_local_unidades: nullableNumber,
    dias_inventario_local: nullableNumber,
    stock_cd_cajas: nullableNumber,
    unidades_por_caja: nullableNumber,
    dias_inventario_cd: nullableNumber,
    fecha_ultimo_pedido: nullableString,
    cantidad_ultimo_pedido: nullableNumber,
    fecha_ultimo_despacho: nullableString,
    cantidad_ultimo_despacho: nullableNumber,
    confianza: { type: "number", minimum: 0, maximum: 1 },
    advertencias: { type: "array", items: { type: "string" } },
  },
  required: [
    "local_nombre", "codigo_barras", "codigo_referencia", "nombre_producto",
    "fecha_fuente", "precio_comercio", "precio_afiliado",
    "rotacion_diaria_unidades", "venta_diaria_valor",
    "prediccion_venta_unidades", "participacion_clase",
    "participacion_subclase", "stock_local_unidades",
    "dias_inventario_local", "stock_cd_cajas", "unidades_por_caja",
    "dias_inventario_cd", "fecha_ultimo_pedido", "cantidad_ultimo_pedido",
    "fecha_ultimo_despacho", "cantidad_ultimo_despacho", "confianza",
    "advertencias",
  ],
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const authorization = req.headers.get("Authorization") ?? ""
    if (!authorization) return respuesta(401, { ok: false, error: "Sesión requerida." })

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    const openaiKey = Deno.env.get("OPENAI_API_KEY") ?? ""
    if (!openaiKey) {
      return respuesta(503, {
        ok: false,
        error: "Falta configurar OPENAI_API_KEY en los secretos de Supabase.",
      })
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    })
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: authData, error: authError } = await authClient.auth.getUser()
    if (authError || !authData.user) {
      return respuesta(401, { ok: false, error: "La sesión no es válida." })
    }
    const { data: puede } = await authClient.rpc("app_puede", {
      p_pantalla: "Campo comercial",
      p_user_id: authData.user.id,
    })
    if (!puede) return respuesta(403, { ok: false, error: "No tienes permiso para trabajo de campo." })

    const body = await req.json()
    const rutas = Array.isArray(body.rutas)
      ? body.rutas.map(String).filter(Boolean).slice(0, 3)
      : []
    if (rutas.length === 0) {
      return respuesta(400, { ok: false, error: "Selecciona al menos una captura." })
    }
    if (rutas.some((ruta: string) => !ruta.startsWith(`${authData.user.id}/`))) {
      return respuesta(403, { ok: false, error: "Una captura no pertenece al usuario actual." })
    }

    const imagenes = await Promise.all(rutas.map(async (ruta: string) => {
      const { data, error } = await admin.storage
        .from("visitas-campo")
        .createSignedUrl(ruta, 300)
      if (error || !data?.signedUrl) throw error ?? new Error("No se pudo abrir la captura.")
      return { type: "input_image", image_url: data.signedUrl, detail: "high" }
    }))

    const instruccion = [
      "Analiza estas capturas desplazadas de la app de inventario de Corporación Favorita.",
      "Todas pertenecen al mismo SKU y local; combina los campos repetidos y complementarios.",
      "Transcribe únicamente valores visibles. No inventes datos faltantes: usa null.",
      "Convierte monedas y cantidades a números sin símbolos; porcentajes se devuelven como el número visible.",
      "Las fechas deben ser ISO YYYY-MM-DD y fecha_fuente ISO 8601 cuando incluya hora.",
      "Si 'EXISTENCIA EN CD' dice '0 cajas de 5 unidades', stock_cd_cajas=0 y unidades_por_caja=5.",
      "La captura acredita codificación digital, pero no presencia física en percha.",
      "Agrega advertencias cuando las imágenes parezcan de distintos SKU/local o un valor sea ambiguo.",
    ].join(" ")

    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_VISION_MODEL") || "gpt-4.1-mini",
        input: [{
          role: "user",
          content: [{ type: "input_text", text: instruccion }, ...imagenes],
        }],
        text: {
          format: {
            type: "json_schema",
            name: "lectura_favorita",
            strict: true,
            schema,
          },
        },
      }),
    })

    const resultado = await openaiResponse.json()
    if (!openaiResponse.ok) {
      const detalle = resultado?.error?.message || "El servicio de IA rechazó la lectura."
      return respuesta(502, { ok: false, error: detalle })
    }

    const texto = extraerTexto(resultado)
    if (!texto) return respuesta(502, { ok: false, error: "La IA no devolvió datos legibles." })
    const lectura = JSON.parse(texto)
    return respuesta(200, { ok: true, data: lectura })
  } catch (error) {
    return respuesta(500, {
      ok: false,
      error: error instanceof Error ? error.message : "No se pudieron analizar las capturas.",
    })
  }
})

function extraerTexto(resultado: Record<string, unknown>) {
  if (typeof resultado.output_text === "string") return resultado.output_text
  const output = Array.isArray(resultado.output) ? resultado.output : []
  for (const item of output) {
    if (!item || typeof item !== "object") continue
    const content = Array.isArray((item as { content?: unknown[] }).content)
      ? (item as { content: unknown[] }).content
      : []
    for (const bloque of content) {
      if (!bloque || typeof bloque !== "object") continue
      const texto = (bloque as { text?: unknown }).text
      if (typeof texto === "string") return texto
    }
  }
  return ""
}
