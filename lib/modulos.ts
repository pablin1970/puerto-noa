// ── Fuente única de verdad de los módulos y acciones del sistema ──────
// Tanto la matriz de permisos (usuarios/page.tsx) como el sidebar (layout.tsx)
// importan de aquí. Para agregar un módulo nuevo: agregarlo a MODULOS_PERMISOS
// y queda cubierto automáticamente (deny by default para todos, salvo super admin).

export const ACCIONES = ['ver', 'crear', 'editar', 'eliminar', 'descargar', 'solicitar', 'autorizar'] as const
export type Accion = typeof ACCIONES[number]

export interface ModuloItem {
  modulo: string
  label: string
  acciones: Accion[]        // cuáles aplican
  subitem?: boolean
  soloVer?: boolean         // para módulos de solo lectura
}

export interface ModuloSeccion {
  section: string
  icono?: string
  items: ModuloItem[]
}

export const MODULOS_PERMISOS: ModuloSeccion[] = [
  {
    section: 'General', icono: '📊',
    items: [
      { modulo: 'dashboard',            label: 'Dashboard logístico',   acciones: ['ver'], soloVer: true },
      { modulo: 'dashboard_financiero', label: 'Dashboard financiero',  acciones: ['ver'], soloVer: true },
      { modulo: 'ayuda',                label: 'Ayuda / Documentación', acciones: ['ver','descargar'] },
    ]
  },
  {
    section: 'Comercial — Cotizaciones y Clientes', icono: '💼',
    items: [
      { modulo: 'cotizaciones',          label: 'Cotizaciones a clientes', acciones: ['ver','crear','editar','eliminar','descargar'] },
      { modulo: 'cotizaciones_estado',   label: '→ Cambiar estado',        acciones: ['ver','editar'], subitem: true },
      { modulo: 'cotizaciones_recotizaciones', label: '→ Análisis de recotizaciones', acciones: ['ver'], subitem: true },
      { modulo: 'clientes',              label: 'Clientes',                acciones: ['ver','crear','editar','eliminar','descargar'] },
      { modulo: 'clientes_documentos',   label: '→ Documentos de clientes', acciones: ['ver','crear','eliminar','descargar'], subitem: true },
    ]
  },
  {
    section: 'Operaciones', icono: '🚢',
    items: [
      { modulo: 'operaciones',              label: 'Operaciones activas',       acciones: ['ver','crear','editar','eliminar','descargar'] },
      { modulo: 'operaciones_documentos',   label: '→ Documentos de operación', acciones: ['ver','crear','eliminar','descargar'], subitem: true },
      { modulo: 'cierre',                   label: 'Liquidación y cierre',      acciones: ['ver','editar','descargar'] },
      { modulo: 'cotizaciones_proveedores', label: 'Cotizaciones de proveedores', acciones: ['ver','crear','editar','eliminar','descargar'] },
      { modulo: 'cotizaciones_proveedores_duplicar', label: '→ Duplicar cotización', acciones: ['ver','crear'], subitem: true },
      { modulo: 'precios',                  label: 'Inteligencia de precios',   acciones: ['ver','descargar'] },
      { modulo: 'proveedores',              label: 'Proveedores',               acciones: ['ver','crear','editar','eliminar'] },
      { modulo: 'proveedores_documentos',   label: '→ Documentos de proveedores', acciones: ['ver','crear','eliminar','descargar'], subitem: true },
    ]
  },
  {
    section: 'Finanzas — Clientes y Proveedores', icono: '🧾',
    items: [
      { modulo: 'facturas_emitidas',        label: 'Facturas emitidas',       acciones: ['ver','crear','editar','eliminar','descargar'] },
      { modulo: 'facturas_emitidas_anular', label: '→ Solicitar anulación / NC', acciones: ['solicitar'], subitem: true },
      { modulo: 'facturas_emitidas_autorizar', label: '→ Autorizar anulaciones / NC', acciones: ['ver','autorizar'], subitem: true },
      { modulo: 'facturas_recibidas',       label: 'Facturas recibidas',      acciones: ['ver','crear','editar','eliminar','descargar'] },
      { modulo: 'cte_clientes',             label: 'Cta. cte. clientes',      acciones: ['ver','crear','editar','eliminar','descargar'] },
      { modulo: 'cte_clientes_cobro',       label: '→ Registrar cobro',       acciones: ['ver','crear'], subitem: true },
      { modulo: 'cte_proveedores',          label: 'Cta. cte. proveedores',   acciones: ['ver','crear','editar','eliminar','descargar'] },
      { modulo: 'cte_proveedores_pago',     label: '→ Registrar pago',        acciones: ['ver','crear'], subitem: true },
      { modulo: 'fondos_custodia',          label: 'Fondos en custodia',      acciones: ['ver','crear','editar','eliminar','descargar'] },
    ]
  },
  {
    section: 'Tesorería', icono: '🏦',
    items: [
      { modulo: 'recibos',       label: 'Recibos',                   acciones: ['ver','crear','editar','eliminar','descargar'] },
      { modulo: 'ordenes_pago',  label: 'Órdenes de pago',           acciones: ['ver','crear','editar','eliminar','descargar'] },
      { modulo: 'aplicaciones_pago', label: 'Aplic. pago de tercero',  acciones: ['ver','crear','editar','eliminar','descargar'] },
      { modulo: 'movimientos_cuentas', label: 'Movim. entre cuentas',    acciones: ['ver','crear','editar','eliminar','descargar'] },
      { modulo: 'tipos_cambio',  label: 'Tipos de cambio',           acciones: ['ver','editar'] },
    ]
  },
  {
    section: 'Contabilidad', icono: '📚',
    items: [
      { modulo: 'iva',          label: 'Libro IVA',        acciones: ['ver','editar','descargar'] },
      { modulo: 'gastos_fijos',      label: 'Gastos y costos',        acciones: ['ver','crear','editar','eliminar','descargar'] },
      { modulo: 'resultados',   label: 'Resultados',       acciones: ['ver','descargar'] },
    ]
  },
  {
    section: 'Configuración', icono: '⚙️',
    items: [
      { modulo: 'catalogos',             label: 'Catálogos',            acciones: ['ver','crear','editar','eliminar'] },
      { modulo: 'cat_servicios',  label: '→ Catálogo de servicios',  acciones: ['ver','crear','editar','eliminar'], subitem: true },
      { modulo: 'cat_cotizador',  label: '→ Cotizador',              acciones: ['ver','crear','editar','eliminar'], subitem: true },
      { modulo: 'cat_geografia',  label: '→ Geografía y rutas',      acciones: ['ver','crear','editar','eliminar'], subitem: true },
      { modulo: 'cat_logistica',  label: '→ Logística',              acciones: ['ver','crear','editar','eliminar'], subitem: true },
      { modulo: 'cat_finanzas',   label: '→ Finanzas',               acciones: ['ver','crear','editar','eliminar'], subitem: true },
      { modulo: 'cat_empresa',    label: '→ Empresa',                acciones: ['ver','editar'], subitem: true },
      { modulo: 'tributos',       label: '→ Tributos ARCA',          acciones: ['ver','crear','editar','eliminar'], subitem: true },
      { modulo: 'talonarios',     label: '→ Talonarios',             acciones: ['ver','crear','editar','eliminar'], subitem: true },
      { modulo: 'usuarios',              label: 'Usuarios',             acciones: ['ver','crear','editar','eliminar'] },
      { modulo: 'usuarios_imagenes',     label: '→ Foto y firma',       acciones: ['ver','crear','eliminar','descargar'], subitem: true },
      { modulo: 'usuarios_historial',    label: '→ Historial de conexiones', acciones: ['ver'], subitem: true },
      { modulo: 'roles',                 label: 'Roles y permisos',     acciones: ['ver','crear','editar','eliminar'] },
    ]
  },
]

// Lista plana de todos los módulos definidos (única fuente de verdad para la matriz)
export const TODOS_LOS_MODULOS: string[] = MODULOS_PERMISOS.flatMap(s => s.items.map(it => it.modulo))

// Mapa módulo → acciones definidas hoy (fuente de verdad para detectar acciones nuevas)
export const ACCIONES_POR_MODULO: Record<string, string[]> =
  Object.fromEntries(MODULOS_PERMISOS.flatMap(s => s.items.map(it => [it.modulo, it.acciones])))

/**
 * Devuelve el conjunto de módulos "pendientes de configurar" comparando contra
 * lo ya revisado. Un módulo está pendiente si:
 *   - nunca fue revisado (módulo nuevo), o
 *   - tiene al menos una acción que no estaba cuando se revisó (acción nueva).
 * `revisados` mapea modulo → acciones que tenía al momento de revisarse.
 */
export function modulosPendientesSet(revisados: Map<string, string[]>): Set<string> {
  const pend = new Set<string>()
  for (const s of MODULOS_PERMISOS) {
    for (const it of s.items) {
      const rev = revisados.get(it.modulo)
      if (!rev || it.acciones.some(a => !rev.includes(a))) pend.add(it.modulo)
    }
  }
  return pend
}
