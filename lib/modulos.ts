// ── Fuente única de verdad de los módulos y acciones del sistema ──────
// Tanto la matriz de permisos (usuarios/page.tsx) como el sidebar (layout.tsx)
// importan de aquí. Para agregar un módulo nuevo: agregarlo a MODULOS_PERMISOS
// y queda cubierto automáticamente (deny by default para todos, salvo super admin).

export const ACCIONES = ['ver', 'crear', 'editar', 'eliminar', 'descargar'] as const
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
      { modulo: 'cotizaciones',          label: 'Cotizaciones',            acciones: ['ver','crear','editar','eliminar','descargar'] },
      { modulo: 'cotizaciones_estado',   label: '→ Cambiar estado',        acciones: ['ver','editar'], subitem: true },
      { modulo: 'cotizaciones_duplicar', label: '→ Duplicar cotización',   acciones: ['ver','crear'], subitem: true },
      { modulo: 'clientes',              label: 'Clientes',                acciones: ['ver','crear','editar','eliminar','descargar'] },
      { modulo: 'clientes_documentos',   label: '→ Documentos de clientes', acciones: ['ver','crear','eliminar','descargar'], subitem: true },
    ]
  },
  {
    section: 'Operaciones', icono: '🚢',
    items: [
      { modulo: 'operaciones',              label: 'Operaciones activas',       acciones: ['ver','crear','editar','eliminar','descargar'] },
      { modulo: 'operaciones_documentos',   label: '→ Documentos de operación', acciones: ['ver','crear','eliminar','descargar'], subitem: true },
      { modulo: 'cierre',                   label: 'Liquidación y cierre',      acciones: ['ver','editar'] },
      { modulo: 'cotizaciones_proveedores', label: 'Cotiz. proveedores',        acciones: ['ver','crear','editar','eliminar','descargar'] },
      { modulo: 'precios',                  label: 'Inteligencia de precios',   acciones: ['ver'], soloVer: true },
      { modulo: 'proveedores',              label: 'Proveedores',               acciones: ['ver','crear','editar','eliminar'] },
      { modulo: 'proveedores_documentos',   label: '→ Documentos de proveedores', acciones: ['ver','crear','eliminar','descargar'], subitem: true },
    ]
  },
  {
    section: 'Finanzas — Clientes y Proveedores', icono: '🧾',
    items: [
      { modulo: 'facturas_emitidas',        label: 'Facturas emitidas',       acciones: ['ver','crear','editar','eliminar','descargar'] },
      { modulo: 'facturas_emitidas_anular', label: '→ Anular factura',        acciones: ['ver','editar'], subitem: true },
      { modulo: 'facturas_recibidas',       label: 'Facturas recibidas',      acciones: ['ver','crear','editar','eliminar','descargar'] },
      { modulo: 'cte_clientes',             label: 'Cta. cte. clientes',      acciones: ['ver','crear','editar','descargar'] },
      { modulo: 'cte_clientes_cobro',       label: '→ Registrar cobro',       acciones: ['ver','crear'], subitem: true },
      { modulo: 'cte_proveedores',          label: 'Cta. cte. proveedores',   acciones: ['ver','crear','editar','descargar'] },
      { modulo: 'cte_proveedores_pago',     label: '→ Registrar pago',        acciones: ['ver','crear'], subitem: true },
      { modulo: 'fondos_custodia',          label: 'Fondos en custodia',      acciones: ['ver','crear','editar','eliminar','descargar'] },
    ]
  },
  {
    section: 'Tesorería', icono: '🏦',
    items: [
      { modulo: 'flujo_cuentas', label: 'Flujo cuentas ARG↔CHL',     acciones: ['ver','crear','editar','descargar'] },
      { modulo: 'cuentas_abm',   label: '→ Cuentas (caja y bancos)', acciones: ['ver','crear','editar','eliminar'], subitem: true },
      { modulo: 'tipos_cambio',  label: 'Tipos de cambio',           acciones: ['ver','editar'] },
    ]
  },
  {
    section: 'Contabilidad', icono: '📚',
    items: [
      { modulo: 'iva',          label: 'Libro IVA',        acciones: ['ver','editar','descargar'] },
      { modulo: 'gastos_fijos', label: 'Gastos y costos',  acciones: ['ver','crear','editar','eliminar','descargar'] },
      { modulo: 'resultados',   label: 'Resultados',       acciones: ['ver','descargar'] },
    ]
  },
  {
    section: 'Configuración', icono: '⚙️',
    items: [
      { modulo: 'catalogos',             label: 'Catálogos',            acciones: ['ver','crear','editar','eliminar'] },
      { modulo: 'servicios_deposito',    label: '→ Servicios de depósito', acciones: ['ver','crear','editar'], subitem: true },
      { modulo: 'condiciones_generales', label: 'Condiciones generales', acciones: ['ver','crear','editar','eliminar'] },
      { modulo: 'tributos',              label: 'Tributos ARCA',        acciones: ['ver','editar'] },
      { modulo: 'usuarios',              label: 'Usuarios',             acciones: ['ver','crear','editar','eliminar'] },
      { modulo: 'roles',                 label: 'Roles y permisos',     acciones: ['ver','crear','editar','eliminar'] },
    ]
  },
]

// Lista plana de todos los módulos definidos (única fuente de verdad para la matriz)
export const TODOS_LOS_MODULOS: string[] = MODULOS_PERMISOS.flatMap(s => s.items.map(it => it.modulo))
