import { createClient } from '@/lib/supabase'

// Cache de permisos para no consultar la DB en cada render
let permisosCache: Record<string, string[]> | null = null
let cacheUserId: string | null = null

/**
 * Carga los permisos del usuario logueado desde rol_permisos.
 * Devuelve un mapa { modulo: ['ver','crear','editar','eliminar','descargar'] }
 */
export async function cargarPermisos(): Promise<Record<string, string[]>> {
  const supabase = createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return {}

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

  if (!rolId) return {}

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
  cacheUserId = auth.user.id
  return map
}

/**
 * Verifica si el usuario tiene una acción permitida en un módulo.
 * Si no hay permisos cargados (admin sin restricciones), devuelve true por defecto.
 */
export function puede(permisos: Record<string, string[]>, modulo: string, accion: string): boolean {
  // Si no hay permisos cargados en absoluto, permitir (admin/super admin sin restricciones)
  if (!permisos || Object.keys(permisos).length === 0) return true
  return !!(permisos[modulo] && permisos[modulo].includes(accion))
}
