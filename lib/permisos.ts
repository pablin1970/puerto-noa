import { createClient } from '@/lib/supabase'

// Cache de permisos para no consultar la DB en cada render.
// Endurecido: (1) NO cachea cargas fallidas → reintenta en vez de quedar pegado
// sin permisos; (2) el cache vence pasado un TTL y se recarga solo, de modo que
// un cambio de rol/permisos se refleje SIN tener que cerrar sesión.
let permisosCache: Record<string, string[]> | null = null
let cacheUserId: string | null = null
let cacheEsSuperAdmin: boolean = false
let cacheTimestamp = 0

// Tiempo de vida del cache. Pasado este lapso, la próxima carga vuelve a
// consultar la DB. Subir el número = menos consultas pero permisos menos frescos;
// bajarlo = más frescos pero más consultas. 60s es un buen equilibrio.
const CACHE_TTL_MS = 60_000

/**
 * Carga los permisos del usuario logueado desde rol_permisos.
 * Devuelve un mapa { modulo: ['ver','crear','editar','eliminar','descargar'] }.
 * Detecta además si el rol es Super Administrador (roles.es_super_admin).
 *
 * - Si la carga falla (error de red/DB), NO se cachea: la próxima llamada
 *   reintenta, en lugar de dejar al usuario pegado sin permisos.
 * - El cache vence a los CACHE_TTL_MS y se recarga solo.
 * - `force = true` ignora el cache y recarga ahora (útil tras cambiar permisos).
 */
export async function cargarPermisos(force = false): Promise<Record<string, string[]>> {
  const supabase = createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) { limpiarCachePermisos(); return {} }

  const ahora = Date.now()
  const cacheVigente = !!permisosCache
    && cacheUserId === auth.user.id
    && (ahora - cacheTimestamp) < CACHE_TTL_MS
  if (!force && cacheVigente) return permisosCache as Record<string, string[]>

  // ── Paso 1: fila del usuario (para obtener su rol) ──
  const { data: u, error: uErr } = await supabase
    .from('usuarios')
    .select('roles_ids')
    .eq('auth_id', auth.user.id)
    .single()

  // Fallo real de carga (error o sin fila): NO cachear, reintentar la próxima vez.
  // Devolvemos el cache previo si lo había (mejor permisos viejos que ninguno),
  // o vacío si es la primera carga.
  if (uErr || !u) {
    return permisosCache ?? {}
  }

  const rolId = Array.isArray((u as any)?.roles_ids) && (u as any).roles_ids.length > 0
    ? (u as any).roles_ids[0]
    : null

  // Vacío legítimo: usuario sin rol asignado. Es un estado válido → se cachea.
  if (!rolId) {
    permisosCache = {}
    cacheUserId = auth.user.id
    cacheEsSuperAdmin = false
    cacheTimestamp = ahora
    return {}
  }

  // ── Paso 2: ¿el rol es Super Administrador? ──
  const { data: rol, error: rErr } = await supabase
    .from('roles')
    .select('es_super_admin')
    .eq('id', rolId)
    .single()

  // ── Paso 3: permisos del rol ──
  const { data: perms, error: pErr } = await supabase
    .from('rol_permisos')
    .select('modulo, accion')
    .eq('rol_id', rolId)
    .eq('permitido', true)

  // Fallo al traer rol o permisos: NO cachear, reintentar. Conservamos el cache
  // previo si existía para no dejar al usuario sin nada.
  if (rErr || pErr) {
    return permisosCache ?? {}
  }

  const map: Record<string, string[]> = {}
  for (const p of (perms || []) as any[]) {
    if (!map[p.modulo]) map[p.modulo] = []
    map[p.modulo].push(p.accion)
  }

  permisosCache = map
  cacheUserId = auth.user.id
  cacheEsSuperAdmin = !!(rol as any)?.es_super_admin
  cacheTimestamp = ahora
  return map
}

/** Indica si el usuario en cache es Super Administrador. */
export function esSuperAdmin(): boolean {
  return cacheEsSuperAdmin
}

/**
 * Verifica si el usuario tiene una acción permitida en un módulo.
 * REGLA DE ORO: el Super Administrador puede TODO (incluso módulos nuevos).
 * DENY BY DEFAULT: para el resto, solo se permite lo explícitamente concedido.
 */
export function puede(permisos: Record<string, string[]>, modulo: string, accion: string): boolean {
  // Super Administrador: acceso total, sin excepciones
  if (cacheEsSuperAdmin) return true
  // Resto: denegado por defecto, salvo permiso explícito
  return !!(permisos && permisos[modulo] && permisos[modulo].includes(accion))
}

/** Limpia el cache (útil al cerrar sesión o cambiar de usuario). */
export function limpiarCachePermisos(): void {
  permisosCache = null
  cacheUserId = null
  cacheEsSuperAdmin = false
  cacheTimestamp = 0
}
