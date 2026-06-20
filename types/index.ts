// ─── DATABASE TYPES ────────────────────────────────────────────────────────

export type Database = {
  public: {
    Tables: {
      usuarios: { Row: Usuario; Insert: UsuarioInsert; Update: Partial<UsuarioInsert> }
      cotizaciones: { Row: Cotizacion; Insert: CotizacionInsert; Update: Partial<CotizacionInsert> }
      operaciones: { Row: Operacion; Insert: OperacionInsert; Update: Partial<OperacionInsert> }
      minuta_items: { Row: MinutaItem; Insert: MinutaItemInsert; Update: Partial<MinutaItemInsert> }
      tarifas: { Row: Tarifa; Insert: TarifaInsert; Update: Partial<TarifaInsert> }
    }
  }
}

// ─── APP TYPES ──────────────────────────────────────────────────────────────

export type Rol = 'admin' | 'ejecutivo' | 'operaciones' | 'gerencia'
export type EstadoCotizacion = 'borrador' | 'enviada' | 'aceptada' | 'rechazada' | 'vencida'
export type EstadoOp = 'activa' | 'cerrada'
export type Moneda = 'USD' | 'ARS' | 'CLP' | 'CNY'
export type Regimen = 'A' | 'B' | 'C' | 'D'
export type OpcionTransporte = 'desconsolidar' | 'contenedor' | 'A' | 'B1' | 'B2'
export type TipoTarifa = 'maritima' | 'terrestre' | 'puerto' | 'argentina'
export type ModalidadCarga = 'contenedor' | 'bulk' | 'mixta'

export type EtapaGasto =
  | 'china' | 'maritimo' | 'chile' | 'terrestre'
  | 'argentina' | 'tributos' | 'fee' | 'otro'

// ─── USUARIOS ───────────────────────────────────────────────────────────────

export interface Usuario {
  id: string
  auth_id: string | null
  nombre: string
  email: string
  rol: Rol
  iniciales: string
  activo: boolean
  created_at: string
}

export interface UsuarioInsert {
  auth_id?: string | null
  nombre: string
  email: string
  rol: Rol
  iniciales: string
  activo?: boolean
}

// ─── COTIZACIONES ───────────────────────────────────────────────────────────

export interface ProductoCot {
  descripcion: string
  ncm: string
  cantidad: number
  precio_unit: number
  subtotal: number
  peso_unit: number
  vol_unit: number
  incoterm: string
  proformaId?: string
}

export interface ContenedorCot {
  tipo: string
  cantidad: number
  tipoCamionId?: string
}

export interface ItemPresupuesto {
  etapa: EtapaGasto
  tipo: string
  concepto: string
  usd: number
}

export interface Cotizacion {
  id: string
  num: string
  version: number
  cliente: string
  cuit: string
  email_cliente: string
  telefono_cliente: string
  origen: string
  puerto_chile: string
  destino_noa: string
  incoterm: string
  transito: string
  ref_naviero: string
  tipo_contenedores: ContenedorCot[]
  productos: ProductoCot[]
  total_fob: number
  total_logistico: number
  total_tributos_usd: number
  total_tributos_ars: number
  total_landed: number
  precio_arg_equiv: number | null
  regimen: Regimen
  tc_ars: number
  derechos_pct: number
  opcion_transporte: OpcionTransporte
  validez: string
  notas: string
  estado: EstadoCotizacion
  ejecutivo_id: string
  creado_por: string
  modificado_por: string
  created_at: string
  updated_at: string
  presupuesto: ItemPresupuesto[]
  // joined
  ejecutivo?: Usuario
  creado_por_usuario?: Usuario
}

export interface CotizacionInsert {
  num: string
  version?: number
  cliente: string
  cuit?: string
  email_cliente?: string
  telefono_cliente?: string
  origen?: string
  puerto_chile?: string
  destino_noa?: string
  incoterm?: string
  transito?: string
  ref_naviero?: string
  tipo_contenedores?: ContenedorCot[]
  productos?: ProductoCot[]
  total_fob?: number
  total_logistico?: number
  total_tributos_usd?: number
  total_tributos_ars?: number
  total_landed?: number
  precio_arg_equiv?: number | null
  regimen?: Regimen
  tc_ars?: number
  derechos_pct?: number
  opcion_transporte?: OpcionTransporte
  validez?: string
  notas?: string
  estado?: EstadoCotizacion
  ejecutivo_id: string
  creado_por: string
  modificado_por: string
  presupuesto?: ItemPresupuesto[]
}

// ─── OPERACIONES ────────────────────────────────────────────────────────────

export interface Operacion {
  id: string
  cotizacion_id: string
  estado: EstadoOp
  pasos: boolean[]
  fecha_cierre: string | null
  hist_cierre: { fecha: string; accion: string }[]
  created_at: string
  updated_at: string
  // joined
  cotizacion?: Cotizacion
}

export interface OperacionInsert {
  cotizacion_id: string
  estado?: EstadoOp
  pasos?: boolean[]
  fecha_cierre?: string | null
  hist_cierre?: { fecha: string; accion: string }[]
}

// ─── MINUTA ─────────────────────────────────────────────────────────────────

export interface MinutaItem {
  id: string
  operacion_id: string
  proveedor: string
  concepto: string
  moneda: Moneda
  monto: number
  fecha_vto: string
  banco: string
  cuenta: string
  swift: string
  notas: string
  created_at: string
}

export interface MinutaItemInsert {
  operacion_id: string
  proveedor: string
  concepto: string
  moneda: Moneda
  monto: number
  fecha_vto?: string
  banco?: string
  cuenta?: string
  swift?: string
  notas?: string
}

// ─── TARIFAS ────────────────────────────────────────────────────────────────

export interface Tarifa {
  id: string
  tipo: TipoTarifa
  ruta: string
  tipo_contenedor: string
  valor: number
  naviera: string
  iva_chile: string
  obs: string
  activo: boolean
  created_at: string
}

export interface TarifaInsert {
  tipo: TipoTarifa
  ruta: string
  tipo_contenedor?: string
  valor: number
  naviera?: string
  iva_chile?: string
  obs?: string
  activo?: boolean
}

// ─── UI HELPERS ─────────────────────────────────────────────────────────────

export interface CalcCotResult {
  fob: number
  subA: number
  seguro: number
  subC: number
  subD: number
  subE: number
  fee: number
  cif: number
  cifARS: number
  tributos: TributoRow[]
  totalARS: number
  totalTribUSD: number
  totalLogistico: number
  totalLanded: number
  nc: number
}

export interface TributoRow {
  cod: string
  con: string
  tasa: string
  base: number
  imp: number
}

export interface CapVerifResult {
  pctKg: number
  pctM3: number
  totalKg: number
  totalM3: number
  capKg: number
  capM3: number
  status: 'ok' | 'warn' | 'over'
}
