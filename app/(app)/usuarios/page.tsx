// Cache de permisos para no consultar la DB en cada render
let permisosCache: Record<string, string[]> | null = null
let cacheUserId: string | null = null
let cacheEsSuperAdmin: boolean = false

/**
 * Carga los permisos del usuario logueado desde rol_permisos.
 * Devuelve un mapa { modulo: ['ver','crear','editar','eliminar','descargar'] }.
 * Además detecta si el rol del usuario es Super Administrador (columna roles.es_super_admin).
 */
export async function cargarPermisos(): Promise<Record<string, string[]>> {
  const supabase = createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) { permisosCache = {}; cacheEsSuperAdmin = false; return {} }

  // Si ya tenemos cache para este usuario, devolverlo
  if (permisosCache && cacheUserId === auth.user.id) return permisosCache

  const { data: u } = await supabase
    .from('usuarios')
    .select('roles_ids')
    .eq('auth_id', auth.user.id)
    .single()

  const rolId = Array.isArray((u as any)?.roles_ids) && (u as any).roles_ids.length > 0
    ? (u as any).roles_ids[0]
    : null

  cacheUserId = auth.user.id
  cacheEsSuperAdmin = false

  if (!rolId) { permisosCache = {}; return {} }

  // ¿El rol es Super Administrador? (regla de oro: acceso total siempre)
  const { data: rol } = await supabase
    .from('roles')
    .select('es_super_admin')
    .eq('id', rolId)
    .single()
  cacheEsSuperAdmin = !!(rol as any)?.es_super_admin

  const { data: perms } = await supabase
    .from('rol_permisos')
    .select('modulo, accion')
    .eq('rol_id', rolId)
    .eq('permitido', true)

  const map: Record<string, string[]> = {}
  if (perms) {
    for (const p of perms as any[]) {
      if (!map[p.modulo]) map[p.modulo] = []
      map[p.modulo].push(p.accion)
    }
  }

  permisosCache = map
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
}
