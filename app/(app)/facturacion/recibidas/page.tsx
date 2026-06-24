'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { fmt, ETAPAS_L, ETAPAS_ORD } from '@/lib/utils'
import { cargarPermisos, puede } from '@/lib/permisos'
import ModalAgregarItemCatalogo from '@/components/ModalAgregarItemCatalogo'
import ModalAgregarCategoriaGasto from '@/components/ModalAgregarCategoriaGasto'

// Caracterización tributaria del documento de compra (RCV / SII).
// Define si la compra da crédito fiscal de IVA y si es gasto para Renta.
const CARACTERIZACIONES: { codigo: string; nombre: string; hint: string }[] = [
  { codigo: 'del_giro',          nombre: 'Del giro',           hint: 'Compra de la actividad. Da crédito fiscal IVA y es gasto para Renta.' },
  { codigo: 'activo_fijo',       nombre: 'Activo fijo',        hint: 'Maquinaria, vehículos, bienes de larga duración.' },
  { codigo: 'iva_no_recuperable',nombre: 'IVA no recuperable', hint: 'Sin derecho a crédito fiscal (ej. registro fuera de plazo).' },
  { codigo: 'no_incluir',        nombre: 'No incluir',         hint: 'No es del giro. No da crédito IVA ni gasto para Renta.' },
]

interface FacturaRecibida {
  id: string
  tipo_doc: string
  folio: string | null
  estado: string
  fecha_emision: string
  fecha_recepcion: string
  fecha_pago: string | null
  fecha_vencimiento: string | null
  tercero_id: string | null
  proveedor_razon_social: string
  proveedor_rut: string | null
  proveedor_pais: string
  operacion_id: string | null
  moneda: string
  tc_referencia: number | null
  items: any[]
  neto: number
  iva_monto: number
  exento: number
  total: number
  total_usd: number | null
  afecta_iva: boolean
  iva_pct: number
  credito_fiscal: number
  a_recuperar: boolean
  refactura_emitida_id: string | null
  facturada_a: string | null
  archivo_url: string | null
  archivo_nombre: string | null
  creado_por: string | null
  created_at: string
}

const TIPO_DOC_L: Record<string, string> = {
  factura: 'Factura afecta',
  factura_exenta: 'Factura exenta',
  boleta: 'Boleta',
  nota_credito: 'Nota de crédito',
  nota_debito: 'Nota de débito',
  otro: 'Otro documento',
}

const ESTADO_CLS: Record<string, string> = {
  recibida: 'bg-blue-50 text-[#1168F8] border-blue-200',
  contabilizada: 'bg-purple-50 text-purple-700 border-purple-200',
  pagada: 'bg-green-50 text-green-700 border-green-200',
  anulada: 'bg-red-50 text-red-700 border-red-200',
}
const ESTADO_L: Record<string, string> = {
  recibida: 'Recibida', contabilizada: 'Contabilizada', pagada: 'Pagada', anulada: 'Anulada',
}

export default function FacturasRecibidasPage() {
  const supabase = useMemo(() => createClient(), [])
  const [facturas, setFacturas] = useState<FacturaRecibida[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'lista' | 'nueva' | 'detalle'>('lista')
  const [selId, setSelId] = useState<string | null>(null)
  const [filtroEstado, setFiltroEstado] = useState('')
  const [buscar, setBuscar] = useState('')
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [terceros, setTerceros] = useState<any[]>([])
  const [operaciones, setOperaciones] = useState<any[]>([])
  const [catalogo, setCatalogo] = useState<any[]>([])           // servicios_catalogo + formas de cobro
  const [tiposComp, setTiposComp] = useState<any[]>([])         // catálogo de comprobantes
  const [gastoCats, setGastoCats] = useState<any[]>([])         // categorías de gastos fijos
  const [tcGasto, setTcGasto] = useState<{ usd: number; ars: number }>({ usd: 908, ars: 0 })
  const [tcSnap, setTcSnap] = useState<any>(null)   // snapshot completo de TC vigentes al momento de cargar
  const [permisos, setPermisos] = useState<Record<string, string[]>>({})

  const [permListos, setPermListos] = useState(false)
  useEffect(() => { loadUser(); loadData(); cargarPermisos().then(p => { setPermisos(p); setPermListos(true) }) }, [])

  async function loadUser() {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return
    const { data: u } = await supabase.from('usuarios').select('*').eq('auth_id', auth.user.id).single()
    if (u) setCurrentUser(u)
  }

  async function loadData() {
    setLoading(true)
    const [fRes, tRes, oRes, cRes, tcRes, gcRes, tceRes] = await Promise.all([
      supabase.from('facturas_recibidas').select('*').order('fecha_emision', { ascending: false }),
      supabase.from('terceros').select('id,razon_social,nro_doc,tipo_doc,pais').contains('tipo', ['proveedor']),
      supabase.from('operaciones').select('id,cotizacion:cotizaciones(num,cliente)').order('created_at', { ascending: false }).limit(50),
      supabase.from('servicios_catalogo')
        .select('id,rubro,grupo,nombre,orden,formas:servicios_metricas_habilitadas(metrica:servicios_metricas(id,nombre,unidad_label,comportamiento))')
        .eq('activo', true).order('orden', { ascending: true }),
      supabase.from('tipos_comprobante').select('*').eq('activo', true)
        .in('ambito', ['recibido', 'ambos']).order('orden', { ascending: true }),
      supabase.from('gastos_fijos_categorias').select('id,nombre,codigo,orden').eq('activo', true).order('orden', { ascending: true }),
      (supabase.from('tipos_cambio_eventos') as any).select('fecha, fuente, ars, clp, cny').order('created_at', { ascending: false }).limit(1),
    ])
    if (fRes.data) setFacturas(fRes.data as FacturaRecibida[])
    if (tRes.data) setTerceros(tRes.data)
    if (oRes.data) setOperaciones(oRes.data)
    if (cRes.data) setCatalogo(cRes.data)
    if (tcRes.data) setTiposComp(tcRes.data)
    if (gcRes.data) setGastoCats(gcRes.data)
    if (tceRes.data?.[0]) {
      const tce: any = tceRes.data[0]
      setTcGasto({ usd: tce.clp || 908, ars: tce.ars || 0 })
      setTcSnap({ fecha: tce.fecha, fuente: tce.fuente || null, USD: 1, ARS: Number(tce.ars) || null, CLP: Number(tce.clp) || null, CNY: Number(tce.cny) || null })
    }
    setLoading(false)
  }

  const sel = facturas.find(f => f.id === selId)

  const filtradas = facturas.filter(f => {
    const b = buscar.toLowerCase()
    const matchB = !b || f.proveedor_razon_social.toLowerCase().includes(b) || (f.folio || '').includes(b)
    const matchE = !filtroEstado || f.estado === filtroEstado
    return matchB && matchE
  })

  const stats = {
    total: facturas.length,
    pendientes: facturas.filter(f => f.estado === 'recibida').length,
    creditoFiscal: facturas.filter(f => f.estado !== 'anulada').reduce((s, f) => s + (f.credito_fiscal || 0), 0),
    totalCLP: facturas.filter(f => f.moneda === 'CLP' && f.estado !== 'anulada').reduce((s, f) => s + f.total, 0),
    aRecuperar: facturas.filter(f => f.a_recuperar && f.estado !== 'anulada').reduce((s, f) => s + f.total, 0),
  }

  const inp = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white'
  const fmtCLP = (n: number) => Math.round(n).toLocaleString('es-CL')

  if (permListos && !puede(permisos,'facturas_recibidas','ver')) {
    return (<div className="p-6 bg-gray-50 min-h-screen flex items-center justify-center"><div className="text-center max-w-sm"><div className="text-5xl mb-3">🔒</div><h2 className="text-lg font-bold text-gray-700">Sin acceso</h2><p className="text-sm text-gray-400 mt-1">No tenés permiso para ver esta sección. Si creés que es un error, contactá al administrador.</p></div></div>)
  }
  const puedeCrearFR = puede(permisos,'facturas_recibidas','crear')

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Facturas recibidas</h1>
          <p className="text-xs text-gray-400 mt-0.5">Proveedores → Puerto NOA SpA · Crédito fiscal IVA</p>
        </div>
        <div className="flex gap-2">
          {view !== 'lista' && (
            <button onClick={() => { setView('lista'); setSelId(null) }} className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold hover:bg-gray-100">← Volver</button>
          )}
          {view === 'lista' && puedeCrearFR && (
            <button onClick={() => setView('nueva')} className="px-5 py-2.5 bg-[#1168F8] text-white rounded-xl text-sm font-bold hover:bg-[#0a4fc4] shadow-sm">
              + Registrar factura
            </button>
          )}
        </div>
      </div>

      {view === 'lista' && (
        <>
          <div className="grid grid-cols-5 gap-3 mb-5">
            {[
              { label: 'Total registradas', value: stats.total, icon: '📥', color: 'text-gray-900' },
              { label: 'Pendientes pago', value: stats.pendientes, icon: '⏳', color: 'text-amber-700' },
              { label: 'Crédito fiscal IVA', value: `$ ${fmtCLP(stats.creditoFiscal)}`, icon: '💰', color: 'text-green-700' },
              { label: 'Total CLP recibido', value: `$ ${fmtCLP(stats.totalCLP)}`, icon: '🇨🇱', color: 'text-[#052698]' },
              { label: 'A recuperar cliente', value: `$ ${fmtCLP(stats.aRecuperar)}`, icon: '🔄', color: 'text-purple-700' },
            ].map(s => (
              <div key={s.label} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                <div className="text-xl mb-1">{s.icon}</div>
                <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-[10px] text-gray-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="flex gap-3 mb-4 flex-wrap items-center">
            <div className="relative flex-1 min-w-60">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🔍</span>
              <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar proveedor, folio..."
                className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white shadow-sm" />
            </div>
            <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:border-[#1168F8] shadow-sm">
              <option value="">Todos los estados</option>
              {Object.entries(ESTADO_L).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            {(buscar || filtroEstado) && <button onClick={() => { setBuscar(''); setFiltroEstado('') }} className="px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-500">✕</button>}
            <span className="text-xs text-gray-400 ml-auto">{filtradas.length} factura(s)</span>
          </div>

          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
            {loading ? <div className="p-8 text-center text-gray-400">Cargando...</div> :
            filtradas.length === 0 ? (
              <div className="p-12 text-center">
                <div className="text-4xl mb-3">📥</div>
                <div className="text-gray-500 text-sm mb-1">Sin facturas recibidas</div>
                {puedeCrearFR && <button onClick={() => setView('nueva')} className="mt-3 px-4 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold">+ Registrar primera</button>}
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {['Folio', 'Proveedor', 'Operación', 'Fecha', 'Total', 'CF IVA', 'Recuperar', 'Estado', ''].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map(f => (
                    <tr key={f.id} className="border-b border-gray-50 hover:bg-blue-50/20 transition-colors group cursor-pointer"
                      onClick={() => { setSelId(f.id); setView('detalle') }}>
                      <td className="px-4 py-3.5 font-mono font-bold text-gray-900">{f.folio || '—'}</td>
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-gray-900">{f.proveedor_razon_social}</div>
                        {f.proveedor_rut && <div className="text-[10px] text-gray-400 font-mono">{f.proveedor_rut}</div>}
                      </td>
                      <td className="px-4 py-3.5">
                        {f.operacion_id ? <span className="font-mono text-[11px] text-[#1168F8]">Op. vinculada</span> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-[11px] text-gray-600">{f.fecha_emision}</td>
                      <td className="px-4 py-3.5">
                        <div className="font-mono font-bold text-gray-900">{f.moneda} {f.moneda === 'CLP' ? fmtCLP(f.total) : fmt(f.total, 2)}</div>
                        {f.total_usd && <div className="text-[10px] text-gray-400 font-mono">USD {fmt(f.total_usd, 0)}</div>}
                      </td>
                      <td className="px-4 py-3.5">
                        {f.credito_fiscal > 0 ? <span className="text-green-700 font-mono font-bold">$ {fmtCLP(f.credito_fiscal)}</span> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        {f.a_recuperar ? <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full text-[10px] font-semibold border border-purple-200">Sí</span>
                          : <span className="text-gray-400">No</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${ESTADO_CLS[f.estado]}`}>{ESTADO_L[f.estado]}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <button onClick={e => { e.stopPropagation(); setSelId(f.id); setView('detalle') }}
                          className="opacity-0 group-hover:opacity-100 p-1.5 border border-gray-200 rounded-lg hover:bg-[#EBF2FF] text-gray-500 hover:text-[#1168F8] text-xs transition-all">👁</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {view === 'nueva' && (
        <FormFacturaRecibida
          supabase={supabase} currentUser={currentUser} terceros={terceros} operaciones={operaciones}
          catalogo={catalogo} tiposComp={tiposComp} permisos={permisos} facturas={facturas}
          gastoCats={gastoCats} tcGasto={tcGasto} tcSnap={tcSnap}
          onSave={async () => { await loadData(); setView('lista') }}
          onCancel={() => setView('lista')}
        />
      )}

      {view === 'detalle' && sel && (
        <DetalleFacturaRecibida
          factura={sel} supabase={supabase} permisos={permisos}
          onReload={async () => { await loadData() }}
          onBack={() => setView('lista')}
        />
      )}
    </div>
  )
}

function FormFacturaRecibida({ supabase, currentUser, terceros, operaciones, catalogo, tiposComp, permisos, facturas, gastoCats, tcGasto, tcSnap, onSave, onCancel }: any) {
  const [form, setForm] = useState({
    tipo_comprobante_id: '',
    tipo_doc: 'factura',
    folio: '',
    nro_ingreso: '' as any,
    caracterizacion: 'del_giro',
    ref_tipo: '',
    ref_folio: '',
    fecha_emision: new Date().toISOString().slice(0, 10),
    fecha_recepcion: new Date().toISOString().slice(0, 10),
    fecha_vencimiento: '',
    tercero_id: '',
    proveedor_razon_social: '',
    proveedor_rut: '',
    proveedor_pais: 'Chile',
    operacion_id: '',
    moneda: 'CLP',
    tc_referencia: '',
    afecta_iva: true,
    iva_pct: 19,
    a_recuperar: true,
    etapa: '',
    facturada_a: 'puerto_noa',
  })
  const itemVacio = { servicio_id: '', metrica_id: '', descripcion: '', rubro: '', unidad: '', nota: '', cantidad: 1, precio_unit: 0, exento: false }
  const [items, setItems] = useState<any[]>([{ ...itemVacio }])
  const [destino, setDestino] = useState<'operacion' | 'gasto_fijo'>('operacion')
  const [gastoCategoriaId, setGastoCategoriaId] = useState('')
  const [modalCategoria, setModalCategoria] = useState(false)
  const [rubrosProv, setRubrosProv] = useState<any[]>([])   // [{codigo,nombre}] rubros del proveedor elegido
  const [modalItem, setModalItem] = useState(false)         // abre modal "Otro ítem"
  const [buscarProv, setBuscarProv] = useState('')
  const [showProvDD, setShowProvDD] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [docPath, setDocPath] = useState('')   // guarda el PATH en el bucket privado (no URL pública)
  const [docNombre, setDocNombre] = useState('')
  const inp = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white'
  const fmtCLP = (n: number) => Math.round(n).toLocaleString('es-CL')

  // Comprobante elegido (del catálogo de comprobantes)
  const comp = tiposComp?.find((c: any) => c.id === form.tipo_comprobante_id) || null

  // Catálogo filtrado por los rubros del proveedor, agrupado por rubro (para el selector de ítems)
  const rubrosCodigos = rubrosProv.map(r => r.codigo)
  const catalogoFiltrado = (catalogo || []).filter((c: any) => rubrosCodigos.includes(c.rubro))
  const catalogoPorRubro = rubrosProv.map(r => ({
    codigo: r.codigo, nombre: r.nombre,
    items: catalogoFiltrado.filter((c: any) => c.rubro === r.codigo),
  })).filter(g => g.items.length > 0)

  // Formas de cobro (métricas) de un ítem del catálogo
  function formasDeItem(servicioId: string) {
    const it = (catalogo || []).find((c: any) => c.id === servicioId)
    if (!it) return []
    return (it.formas || []).map((f: any) => f.metrica).filter(Boolean)
  }

  // Carga los rubros del proveedor cuando cambia el tercero elegido
  useEffect(() => {
    let activo = true
    async function cargarRubros() {
      if (!form.tercero_id) { setRubrosProv([]); return }
      const { data } = await supabase.from('tercero_rubros')
        .select('rubro:proveedor_rubros(codigo,nombre)').eq('tercero_id', form.tercero_id)
      if (!activo) return
      const rs = (data || []).map((x: any) => x.rubro).filter(Boolean)
      setRubrosProv(rs)
    }
    cargarRubros()
    return () => { activo = false }
  }, [form.tercero_id, supabase])

  // Próximo correlativo de ingreso interno (max + 1)
  useEffect(() => {
    const maxIng = (facturas || []).reduce((m: number, f: any) => Math.max(m, f.nro_ingreso || 0), 0)
    setForm(f => ({ ...f, nro_ingreso: maxIng + 1 }))
  }, [facturas])

  // El IVA lo define el comprobante + país (no es manual): factura afecta chilena → IVA; exenta/exterior → sin IVA
  useEffect(() => {
    const c = tiposComp?.find((x: any) => x.id === form.tipo_comprobante_id)
    const aplica = !!c?.afecta_iva && !c?.es_exterior && form.proveedor_pais === 'Chile'
    setForm(f => (f.afecta_iva === aplica ? f : { ...f, afecta_iva: aplica }))
  }, [form.tipo_comprobante_id, form.proveedor_pais, tiposComp])

  function selectProveedor(t: any) {
    setForm(f => {
      const pais = t.pais || 'Chile'
      return { ...f, tercero_id: t.id, proveedor_razon_social: t.razon_social, proveedor_rut: t.nro_doc || '', proveedor_pais: pais }
    })
    setBuscarProv(t.razon_social); setShowProvDD(false)
  }

  // Elegir comprobante del catálogo: setea afecta IVA según el tipo + país
  function selectComprobante(id: string) {
    const c = tiposComp.find((x: any) => x.id === id)
    setForm(f => ({
      ...f,
      tipo_comprobante_id: id,
      tipo_doc: c?.nombre || f.tipo_doc,
      afecta_iva: !!c?.afecta_iva && !c?.es_exterior && f.proveedor_pais === 'Chile',
    }))
  }

  // Al elegir un ítem del catálogo en una fila: autoselecciona la forma si hay una sola
  function setItemServicio(i: number, servicioId: string) {
    const it = (catalogo || []).find((c: any) => c.id === servicioId)
    const formas = formasDeItem(servicioId)
    const unaForma = formas.length === 1 ? formas[0] : null
    const n = [...items]
    n[i] = {
      ...n[i],
      servicio_id: servicioId,
      descripcion: it?.nombre || '',
      rubro: it?.rubro || '',
      metrica_id: unaForma?.id || '',
      unidad: unaForma?.unidad_label || '',
    }
    setItems(n)
  }

  function setItemForma(i: number, metricaId: string) {
    const formas = formasDeItem(items[i].servicio_id)
    const m = formas.find((f: any) => f.id === metricaId)
    const n = [...items]
    n[i] = { ...n[i], metrica_id: metricaId, unidad: m?.unidad_label || '' }
    setItems(n)
  }

  function calcItem(item: any) {
    const subtotal = item.cantidad * item.precio_unit
    const iva = item.exento ? 0 : (form.afecta_iva ? subtotal * form.iva_pct / 100 : 0)
    return { neto: item.exento ? 0 : subtotal, exento: item.exento ? subtotal : 0, iva, total: subtotal + iva }
  }

  const totales = items.reduce((acc, item) => {
    const c = calcItem(item)
    return { neto: acc.neto + c.neto, exento: acc.exento + c.exento, iva: acc.iva + c.iva, total: acc.total + c.total }
  }, { neto: 0, exento: 0, iva: 0, total: 0 })

  async function subirDocumento(file: File) {
    setUploadingDoc(true)
    const ext = file.name.split('.').pop()
    const path = `recibidas/${Date.now()}.${ext}`
    await supabase.storage.from('facturas').upload(path, file, { upsert: true })
    // Bucket privado: guardamos el PATH, no una URL pública (que no funciona). La firma se genera al vuelo.
    setDocPath(path); setDocNombre(file.name)
    setUploadingDoc(false)
  }

  // Abre el adjunto recién subido generando una signed URL temporal desde el path
  async function verPreview() {
    if (!docPath) return
    const { data } = await supabase.storage.from('facturas').createSignedUrl(docPath, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function guardar() {
    if (!form.tipo_comprobante_id) { alert('Elegí el tipo de comprobante'); return }
    if (!form.proveedor_razon_social) { alert('Ingresá el proveedor'); return }
    if (comp?.requiere_referencia && !form.ref_folio) { alert('Este comprobante (nota de crédito/débito) requiere el folio del documento que modifica'); return }
    if (destino === 'gasto_fijo' && !gastoCategoriaId) { alert('Elegí la categoría de gasto fijo'); return }
    setSaving(true)
    const tcRef = parseFloat(form.tc_referencia as any) || null
    const itemsLimpios = items.filter(i => i.servicio_id || i.descripcion).map(i => {
      const c = calcItem(i)
      return {
        servicio_id: i.servicio_id || null, metrica_id: i.metrica_id || null,
        descripcion: i.descripcion, rubro: i.rubro || null, unidad: i.unidad || null, nota: i.nota || null,
        cantidad: i.cantidad, precio_unit: i.precio_unit, exento: i.exento,
        neto: c.neto, iva_monto: c.iva, total: c.total,
      }
    })
    const esGasto = destino === 'gasto_fijo'
    const totalRedondeado = Math.round(totales.total)

    // Si es gasto fijo, generamos primero el registro en gastos_fijos_pn (espejo) y lo vinculamos.
    let gastoFijoId: string | null = null
    if (esGasto) {
      const fechaFact = form.fecha_emision || new Date().toISOString().slice(0, 10)
      const m = (form.moneda || 'CLP').toUpperCase()
      const clpEquiv = m === 'CLP' ? totalRedondeado
        : m === 'USD' ? totalRedondeado * (tcGasto?.usd || 0)
        : m === 'ARS' ? ((tcGasto?.ars || 0) > 0 ? (totalRedondeado / tcGasto.ars) * (tcGasto?.usd || 0) : 0)
        : totalRedondeado
      const gastoPayload: any = {
        categoria_id: gastoCategoriaId,
        descripcion: (itemsLimpios[0]?.descripcion || form.proveedor_razon_social) + (form.folio ? ` · ${form.folio}` : ''),
        moneda: m,
        [`monto_${m.toLowerCase()}`]: totalRedondeado,
        monto_clp_equiv: Math.round(clpEquiv) || null,
        tipo_cambio_ref: m === 'CLP' ? null : m === 'USD' ? (tcGasto?.usd || null) : (tcGasto?.ars || null),
        tc_snapshot: tcSnap || null,
        fecha: fechaFact,
        periodo_anio: parseInt(fechaFact.slice(0, 4)),
        periodo_mes: parseInt(fechaFact.slice(5, 7)),
        es_recurrente: false,
        notas: 'Generado desde factura recibida',
        comprobante_ref: form.folio || null,
        created_by: currentUser?.id || null,
        archivo_url: docPath || null, archivo_nombre: docNombre || null,
      }
      const { data: gasto } = await (supabase.from('gastos_fijos_pn') as any).insert(gastoPayload).select('id').single()
      gastoFijoId = gasto?.id || null
    }

    const { tipo_comprobante_id, caracterizacion, ref_tipo, ref_folio, nro_ingreso, ...formRest } = form
    await (supabase.from('facturas_recibidas') as any).insert({
      ...formRest, tc_referencia: tcRef,
      tc_snapshot: tcSnap || null,
      tipo_comprobante_id, caracterizacion,
      destino,
      operacion_id: esGasto ? null : (formRest.operacion_id || null),
      etapa: esGasto ? null : formRest.etapa,
      a_recuperar: esGasto ? false : formRest.a_recuperar,
      gasto_categoria_id: esGasto ? gastoCategoriaId : null,
      gasto_fijo_id: gastoFijoId,
      nro_ingreso: parseInt(nro_ingreso as any) || null,
      ref_tipo: comp?.requiere_referencia ? (ref_tipo || comp?.nombre || null) : null,
      ref_folio: comp?.requiere_referencia ? (ref_folio || null) : null,
      items: itemsLimpios,
      neto: Math.round(totales.neto), iva_monto: Math.round(totales.iva),
      exento: Math.round(totales.exento), total: totalRedondeado,
      credito_fiscal: (form.afecta_iva && caracterizacion !== 'iva_no_recuperable' && caracterizacion !== 'no_incluir') ? Math.round(totales.iva) : 0,
      total_usd: tcRef ? totales.total / tcRef : null,
      estado: 'recibida',
      archivo_url: docPath || null, archivo_nombre: docNombre || null,
      creado_por: currentUser?.nombre, creado_por_id: currentUser?.id,
    })
    await onSave()
    setSaving(false)
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
        <label className="block text-[10px] font-semibold text-gray-500 mb-2 uppercase">¿A qué imputás esta factura?</label>
        <div className="flex gap-2">
          <button onClick={() => setDestino('operacion')}
            className={`flex-1 px-4 py-2.5 rounded-xl text-xs font-semibold border transition-colors ${destino === 'operacion' ? 'bg-[#1168F8] text-white border-[#1168F8]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#1168F8]'}`}>
            🚢 A una operación
          </button>
          <button onClick={() => setDestino('gasto_fijo')}
            className={`flex-1 px-4 py-2.5 rounded-xl text-xs font-semibold border transition-colors ${destino === 'gasto_fijo' ? 'bg-[#0a9e6e] text-white border-[#0a9e6e]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#0a9e6e]'}`}>
            🏢 Gasto fijo de Puerto NOA
          </button>
        </div>
      </div>
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <h3 className="font-bold text-sm text-gray-900 mb-4">¿Qué comprobante estás cargando?</h3>
        <div className="grid grid-cols-4 gap-3">
          <div className="col-span-2"><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Tipo de comprobante *</label>
            <select value={form.tipo_comprobante_id} onChange={e => selectComprobante(e.target.value)} className={inp}>
              <option value="">— elegí el comprobante —</option>
              {tiposComp.map((c: any) => (
                <option key={c.id} value={c.id}>{c.codigo_sii ? `(${c.codigo_sii}) ` : ''}{c.nombre}{c.es_exterior ? ' · exterior' : ''}</option>
              ))}
            </select>
            {comp && (
              <div className="text-[10px] mt-1 flex gap-2 flex-wrap">
                <span className={comp.afecta_iva ? 'text-green-700' : 'text-gray-400'}>{comp.afecta_iva ? '● Afecto a IVA' : '○ No afecto a IVA'}</span>
                {comp.efecto === 'resta' && <span className="text-red-600">● Resta (nota de crédito)</span>}
                {comp.es_exterior && <span className="text-amber-600">● Exterior · afecta Renta, no IVA chileno</span>}
              </div>
            )}
          </div>
          <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">N° ingreso interno</label>
            <input value={form.nro_ingreso} onChange={e => setForm(f => ({ ...f, nro_ingreso: e.target.value }))} className={inp + ' font-mono'} placeholder="auto" />
          </div>
          <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Folio del proveedor</label>
            <input value={form.folio} onChange={e => setForm(f => ({ ...f, folio: e.target.value }))} className={inp} placeholder="N° del comprobante" />
          </div>
          {comp?.requiere_referencia && (
            <div className="col-span-2"><label className="block text-[10px] font-semibold text-amber-600 mb-1 uppercase">Folio del documento que modifica *</label>
              <input value={form.ref_folio} onChange={e => setForm(f => ({ ...f, ref_folio: e.target.value }))} className={inp} placeholder="Folio de la factura original (obligatorio para NC/ND)" />
            </div>
          )}
          <div className={comp?.requiere_referencia ? 'col-span-2' : 'col-span-2'}><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Caracterización tributaria (IVA / Renta)</label>
            <select value={form.caracterizacion} onChange={e => setForm(f => ({ ...f, caracterizacion: e.target.value }))} className={inp}>
              {CARACTERIZACIONES.map(c => <option key={c.codigo} value={c.codigo}>{c.nombre}</option>)}
            </select>
            <div className="text-[10px] text-gray-400 mt-1">{CARACTERIZACIONES.find(c => c.codigo === form.caracterizacion)?.hint}</div>
          </div>
          <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Fecha emisión</label>
            <input type="date" value={form.fecha_emision} onChange={e => setForm(f => ({ ...f, fecha_emision: e.target.value }))} className={inp} />
          </div>
          <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Fecha recepción</label>
            <input type="date" value={form.fecha_recepcion} onChange={e => setForm(f => ({ ...f, fecha_recepcion: e.target.value }))} className={inp} />
          </div>
          <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Moneda</label>
            <select value={form.moneda} onChange={e => setForm(f => ({ ...f, moneda: e.target.value }))} className={inp}>
              {['CLP', 'USD', 'ARS', 'CNY'].map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
          {form.moneda !== 'CLP' && (
            <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">TC referencia</label>
              <input value={form.tc_referencia} onChange={e => setForm(f => ({ ...f, tc_referencia: e.target.value }))} className={inp} placeholder="ej. 950" />
            </div>
          )}
          <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Vencimiento</label>
            <input type="date" value={form.fecha_vencimiento} onChange={e => setForm(f => ({ ...f, fecha_vencimiento: e.target.value }))} className={inp} />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <h3 className="font-bold text-sm text-gray-900 mb-4">Proveedor</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 relative">
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Razón social *</label>
            <input value={buscarProv || form.proveedor_razon_social}
              onChange={e => { setBuscarProv(e.target.value); setForm(f => ({ ...f, proveedor_razon_social: e.target.value, tercero_id: '' })); setShowProvDD(true) }}
              onFocus={() => setShowProvDD(true)}
              onBlur={() => setTimeout(() => setShowProvDD(false), 150)}
              className={inp} placeholder="Buscar o ingresar proveedor..." />
            {showProvDD && (() => {
              const q = (buscarProv || form.proveedor_razon_social || '').trim().toLowerCase()
              const lista = terceros.filter((t: any) => !q || t.razon_social.toLowerCase().includes(q)).slice(0, 8)
              return lista.length > 0 ? (
                <div className="absolute z-50 top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl max-h-52 overflow-y-auto mt-1">
                  {lista.map((t: any) => (
                    <button key={t.id} onMouseDown={() => selectProveedor(t)} className="w-full text-left px-4 py-2.5 hover:bg-[#EBF2FF] border-b border-gray-50 last:border-0">
                      <div className="font-semibold text-xs text-gray-900">{t.razon_social}</div>
                      {t.nro_doc && <div className="text-[10px] text-gray-400 font-mono">{t.tipo_doc}: {t.nro_doc}</div>}
                    </button>
                  ))}
                </div>
              ) : null
            })()}
          </div>
          <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">RUT / CUIT</label>
            <input value={form.proveedor_rut} onChange={e => setForm(f => ({ ...f, proveedor_rut: e.target.value }))} className={inp} />
          </div>
          <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">País emisor</label>
            <select value={form.proveedor_pais} onChange={e => setForm(f => ({ ...f, proveedor_pais: e.target.value, afecta_iva: e.target.value === 'Chile' && f.tipo_doc !== 'factura_exenta' }))} className={inp}>
              {['Chile', 'Argentina', 'China', 'Bolivia', 'Perú', 'Otro'].map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          {destino === 'operacion' ? (<>
          <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Operación vinculada</label>
            <select value={form.operacion_id} onChange={e => setForm(f => ({ ...f, operacion_id: e.target.value }))} className={inp}>
              <option value="">Sin vincular</option>
              {operaciones.map((o: any) => <option key={o.id} value={o.id}>{o.cotizacion?.num} · {o.cotizacion?.cliente}</option>)}
            </select>
          </div>
          <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Etapa (imputación)</label>
            <select value={form.etapa} onChange={e => setForm(f => ({ ...f, etapa: e.target.value }))} className={inp}>
              <option value="">Sin imputar</option>
              {ETAPAS_ORD.map(e => <option key={e} value={e}>{ETAPAS_L[e] || e}</option>)}
            </select>
          </div>
          <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Factura a nombre de</label>
            <select value={form.facturada_a} onChange={e => setForm(f => ({ ...f, facturada_a: e.target.value }))} className={inp}>
              <option value="puerto_noa">Puerto NOA (deuda de PN, se refactura)</option>
              <option value="cliente">Cliente (directo, solo control)</option>
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer pb-2">
              <input type="checkbox" checked={form.a_recuperar} onChange={e => setForm(f => ({ ...f, a_recuperar: e.target.checked }))} className="w-4 h-4 rounded" />
              <span className="text-xs text-gray-600 font-medium">Se refactura al cliente</span>
            </label>
          </div>
          </>) : (
          <div className="col-span-2">
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Categoría de gasto fijo *</label>
            <div className="flex gap-2">
              <select value={gastoCategoriaId} onChange={e => setGastoCategoriaId(e.target.value)} className={inp}>
                <option value="">— elegí la categoría —</option>
                {(gastoCats || []).map((g: any) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
              </select>
              <button type="button" onClick={() => setModalCategoria(true)} className="px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-500 hover:text-[#0a9e6e] hover:border-[#0a9e6e] whitespace-nowrap">+ Otra</button>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">Esta factura no se asocia a ninguna operación. Queda registrada como gasto fijo de Puerto NOA.</p>
          </div>
          )}
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-sm text-gray-900">Detalle</h3>
          {comp && (
            <span className={`text-[11px] font-semibold ${comp.afecta_iva && form.proveedor_pais === 'Chile' ? 'text-green-700' : 'text-gray-400'}`}>
              {comp.afecta_iva && form.proveedor_pais === 'Chile'
                ? `IVA ${form.iva_pct}% · crédito fiscal`
                : comp.es_exterior ? 'Sin IVA · afecta Renta (exterior)' : 'Sin IVA'}
            </span>
          )}
        </div>
        {destino === 'gasto_fijo' ? (
          <div className="space-y-2 mb-3">
            {items.map((item, i) => {
              const c = calcItem(item)
              return (
                <div key={i} className="grid grid-cols-12 gap-2 items-center border border-gray-200 rounded-xl p-2">
                  <input value={item.descripcion} onChange={e => { const n = [...items]; n[i] = { ...n[i], descripcion: e.target.value }; setItems(n) }}
                    className="col-span-5 px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#0a9e6e]" placeholder="ej. Alquiler oficina junio…" />
                  <input type="number" value={item.cantidad} onChange={e => { const n = [...items]; n[i] = { ...n[i], cantidad: parseFloat(e.target.value) || 1 }; setItems(n) }}
                    className="col-span-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-right focus:outline-none focus:border-[#0a9e6e]" />
                  <input type="text" inputMode="decimal" value={item.precio_unit || ''} onFocus={e => e.target.select()}
                    onChange={e => { const n = [...items]; n[i] = { ...n[i], precio_unit: parseFloat(e.target.value.replace(/\./g, '').replace(',', '.')) || 0 }; setItems(n) }}
                    className="col-span-2 px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-right font-mono focus:outline-none focus:border-[#0a9e6e]" placeholder="precio" />
                  <label className="col-span-1 flex items-center justify-center gap-1 text-[9px] text-gray-400">
                    <input type="checkbox" checked={item.exento} onChange={e => { const n = [...items]; n[i] = { ...n[i], exento: e.target.checked }; setItems(n) }} />Exe
                  </label>
                  <span className="col-span-2 text-right font-mono font-bold text-xs text-gray-800">{fmtCLP(c.total)}</span>
                  <div className="col-span-1 text-right">
                    {items.length > 1 && <button onClick={() => setItems(items.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-500 text-sm">✕</button>}
                  </div>
                </div>
              )
            })}
            <button onClick={() => setItems([...items, { ...itemVacio }])} className="text-xs text-[#0a9e6e] hover:underline">+ Agregar línea</button>
          </div>
        ) : !form.tercero_id ? (
          <div className="text-center py-8 text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl">
            Elegí primero el proveedor para traer los ítems de su catálogo.
          </div>
        ) : catalogoPorRubro.length === 0 ? (
          <div className="text-center py-8 text-xs text-amber-600 border border-dashed border-amber-200 rounded-xl">
            Este proveedor no tiene rubros con ítems en el catálogo. Usá "Otro ítem" para agregar uno, o asignale rubros en su ficha.
          </div>
        ) : (
          <div className="space-y-3 mb-3">
            {items.map((item, i) => {
              const c = calcItem(item)
              const formas = formasDeItem(item.servicio_id)
              return (
                <div key={i} className="border border-gray-200 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <select value={item.servicio_id} onChange={e => setItemServicio(i, e.target.value)}
                      className="flex-1 px-2.5 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8] bg-white">
                      <option value="">— elegí un ítem del catálogo —</option>
                      {catalogoPorRubro.map((g: any) => (
                        <optgroup key={g.codigo} label={g.nombre}>
                          {g.items.map((it: any) => <option key={it.id} value={it.id}>{it.nombre}</option>)}
                        </optgroup>
                      ))}
                    </select>
                    {item.rubro && (
                      <span className="text-[10px] bg-violet-50 text-violet-700 px-2 py-1 rounded-md whitespace-nowrap border border-violet-100">
                        {rubrosProv.find(r => r.codigo === item.rubro)?.nombre || item.rubro}
                      </span>
                    )}
                    {items.length > 1 && <button onClick={() => setItems(items.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-500 text-sm px-1">✕</button>}
                  </div>
                  <div className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-4">
                      <label className="block text-[9px] text-gray-400 mb-0.5 uppercase">Forma de cobro</label>
                      {formas.length > 0 ? (
                        <select value={item.metrica_id} onChange={e => setItemForma(i, e.target.value)}
                          className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8] bg-white">
                          <option value="">— forma —</option>
                          {formas.map((f: any) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                        </select>
                      ) : (
                        <div className="text-[10px] text-gray-300 py-1.5">sin forma definida</div>
                      )}
                    </div>
                    <div className="col-span-3">
                      <label className="block text-[9px] text-gray-400 mb-0.5 uppercase">Cantidad</label>
                      <div className="flex items-center gap-1">
                        <input type="number" value={item.cantidad} onChange={e => { const n = [...items]; n[i] = { ...n[i], cantidad: parseFloat(e.target.value) || 1 }; setItems(n) }}
                          className="w-14 px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-right focus:outline-none focus:border-[#1168F8]" />
                        {item.unidad && <span className="text-[9px] text-gray-400 truncate">{item.unidad}</span>}
                      </div>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[9px] text-gray-400 mb-0.5 uppercase">Precio unit.</label>
                      <input type="text" inputMode="decimal" value={item.precio_unit || ''} onFocus={e => e.target.select()}
                        onChange={e => { const n = [...items]; n[i] = { ...n[i], precio_unit: parseFloat(e.target.value.replace(/\./g, '').replace(',', '.')) || 0 }; setItems(n) }}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-right font-mono focus:outline-none focus:border-[#1168F8]" />
                    </div>
                    <div className="col-span-1 text-center">
                      <label className="block text-[9px] text-gray-400 mb-0.5 uppercase">Exe.</label>
                      <input type="checkbox" checked={item.exento} onChange={e => { const n = [...items]; n[i] = { ...n[i], exento: e.target.checked }; setItems(n) }} className="mt-1.5" />
                    </div>
                    <div className="col-span-2 text-right">
                      <label className="block text-[9px] text-gray-400 mb-0.5 uppercase">Total</label>
                      <span className="font-mono font-bold text-xs text-gray-800">{fmtCLP(c.total)}</span>
                    </div>
                  </div>
                  <input value={item.nota} onChange={e => { const n = [...items]; n[i] = { ...n[i], nota: e.target.value }; setItems(n) }}
                    className="w-full mt-2 px-2 py-1.5 border border-dashed border-gray-200 rounded-lg text-[11px] text-gray-600 focus:outline-none focus:border-[#1168F8]" placeholder="nota aclaratoria (opcional)…" />
                </div>
              )
            })}
          </div>
        )}
        {destino === 'operacion' && form.tercero_id && (
          <div className="flex gap-4">
            <button onClick={() => setItems([...items, { ...itemVacio }])} className="text-xs text-[#1168F8] hover:underline">+ Agregar ítem</button>
            <button onClick={() => setModalItem(true)} className="text-xs text-gray-500 hover:text-[#1168F8] hover:underline">+ Otro ítem (al catálogo)</button>
          </div>
        )}
        <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end">
          <div className="w-64 space-y-1.5 text-xs">
            {totales.neto > 0 && <div className="flex justify-between"><span className="text-gray-500">Neto afecto</span><span className="font-mono">{fmtCLP(totales.neto)}</span></div>}
            {totales.exento > 0 && <div className="flex justify-between"><span className="text-gray-500">Exento</span><span className="font-mono">{fmtCLP(totales.exento)}</span></div>}
            {form.afecta_iva && totales.iva > 0 && (
              <div className="flex justify-between text-green-700 font-semibold">
                <span>IVA {form.iva_pct}% (crédito fiscal)</span>
                <span className="font-mono">{fmtCLP(totales.iva)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-sm pt-2 border-t border-gray-200">
              <span>TOTAL {form.moneda}</span>
              <span className="font-mono text-[#052698]">{fmtCLP(totales.total)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <h3 className="font-bold text-sm text-gray-900 mb-3">Adjuntar documento</h3>
        {docPath ? (
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-700">📎 {docNombre}</span>
            <button onClick={verPreview} className="text-xs text-[#1168F8] hover:underline">Ver</button>
            <button onClick={() => { setDocPath(''); setDocNombre('') }} className="text-xs text-red-500">✕ Quitar</button>
          </div>
        ) : (
          <label className={`flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-[#93B8FC] rounded-xl text-xs text-[#1168F8] hover:bg-[#EBF2FF] cursor-pointer w-fit ${uploadingDoc ? 'opacity-60' : ''}`}>
            📎 {uploadingDoc ? 'Subiendo...' : 'Adjuntar PDF de la factura'}
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" disabled={uploadingDoc}
              onChange={e => { const f = e.target.files?.[0]; if (f) subirDocumento(f) }} />
          </label>
        )}
      </div>

      <div className="flex justify-between">
        <button onClick={onCancel} className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold hover:bg-gray-50">Cancelar</button>
        <button onClick={guardar} disabled={saving} className="px-6 py-2.5 bg-[#1168F8] text-white rounded-xl text-xs font-bold hover:bg-[#0a4fc4] disabled:opacity-50 shadow-sm">
          {saving ? 'Guardando...' : '✓ Registrar factura'}
        </button>
      </div>

      {modalItem && (
        <ModalAgregarItemCatalogo
          supabase={supabase} permisos={permisos}
          rubrosDisponibles={rubrosProv}
          onClose={() => setModalItem(false)}
          onCreated={(nuevo: any) => {
            // sumamos el ítem nuevo al catálogo en memoria y lo dejamos elegido en la primera fila vacía
            const itemCat = { ...nuevo, formas: [] }
            catalogo.push(itemCat)
            const idx = items.findIndex(it => !it.servicio_id)
            const target = idx >= 0 ? idx : items.length
            const base = idx >= 0 ? items : [...items, { ...itemVacio }]
            const n = [...base]
            n[target] = { ...n[target], servicio_id: nuevo.id, descripcion: nuevo.nombre, rubro: nuevo.rubro, metrica_id: '', unidad: '' }
            setItems(n)
            setModalItem(false)
          }}
        />
      )}

      {modalCategoria && (
        <ModalAgregarCategoriaGasto
          supabase={supabase} permisos={permisos}
          onClose={() => setModalCategoria(false)}
          onCreated={(nueva: any) => {
            gastoCats.push(nueva)
            setGastoCategoriaId(nueva.id)
            setModalCategoria(false)
          }}
        />
      )}
    </div>
  )
}

function DetalleFacturaRecibida({ factura, supabase, permisos, onReload, onBack }: any) {
  const puedeEditarFR = puede(permisos,'facturas_recibidas','editar')
  const fmtCLP = (n: number) => Math.round(n).toLocaleString('es-CL')
  const items = Array.isArray(factura.items) ? factura.items : []
  const [abriendo, setAbriendo] = useState(false)
  const [refacturando, setRefacturando] = useState(false)

  async function cambiarEstado(estado: string) {
    await (supabase.from('facturas_recibidas') as any).update({ estado }).eq('id', factura.id)
    await onReload()
  }

  // Refactura al cliente: genera una factura emitida (borrador) de recupero y la vincula a esta recibida.
  async function refacturar() {
    if (refacturando) return
    if (!puede(permisos, 'facturas_emitidas', 'crear')) { alert('No tenés permiso para crear facturas emitidas.'); return }
    if (factura.refactura_emitida_id) { alert('Esta factura ya fue refacturada al cliente.'); return }
    if (!factura.operacion_id) { alert('Asigná la factura a una operación antes de refacturar.'); return }
    if (!confirm('Se creará una factura emitida al cliente (en BORRADOR) para recuperar este gasto. ¿Continuar?')) return
    setRefacturando(true)
    try {
      const { data: op } = await supabase.from('operaciones')
        .select('id, tercero_id, cotizacion:cotizaciones(num, tercero_id, cliente, cuit)')
        .eq('id', factura.operacion_id).single()
      const cot: any = (op as any)?.cotizacion
      const clienteId = (op as any)?.tercero_id || cot?.tercero_id || null
      let cliRazon = cot?.cliente || ''
      let cliRut = cot?.cuit || ''
      if (clienteId) {
        const { data: cli } = await supabase.from('terceros').select('razon_social, nro_doc').eq('id', clienteId).single()
        if (cli) { cliRazon = (cli as any).razon_social || cliRazon; cliRut = (cli as any).nro_doc || cliRut }
      }
      const moneda = factura.moneda
      const payload: any = {
        tipo_doc: 'factura', tipo_documento: 'factura', estado: 'borrador',
        fecha_emision: new Date().toISOString().slice(0, 10),
        tercero_id: clienteId,
        cliente_razon_social: cliRazon || factura.proveedor_razon_social,
        cliente_rut: cliRut, rut_cliente: cliRut,
        operacion_id: factura.operacion_id, cotizacion_num: cot?.num || null,
        moneda, tc_referencia: factura.tc_referencia,
        items: Array.isArray(factura.items) ? factura.items : [],
        neto: factura.neto, iva_monto: factura.iva_monto, exento: factura.exento,
        total: factura.total, total_usd: factura.total_usd,
        neto_clp: (factura as any).neto_clp ?? (moneda === 'CLP' ? factura.neto : null),
        total_clp: (factura as any).total_clp ?? (moneda === 'CLP' ? factura.total : null),
        neto_usd: (factura as any).neto_usd ?? null,
        afecta_iva: factura.afecta_iva, iva_pct: factura.iva_pct ?? 19,
        tipo_cobro: 'recupero_gastos',
        ref_tipo: 'recupero_factura_recibida', ref_folio: factura.folio || null,
        glosa: `Recupero de gastos · ${factura.proveedor_razon_social}${factura.folio ? ' #' + factura.folio : ''}`,
      }
      const { data: emi, error } = await (supabase.from('facturas_emitidas') as any).insert(payload).select('id').single()
      if (error || !emi) { alert('Error al refacturar: ' + (error?.message || 'desconocido')); return }
      await (supabase.from('facturas_recibidas') as any).update({ refactura_emitida_id: emi.id }).eq('id', factura.id)
      alert('Factura de recupero creada en BORRADOR. Revisala y finalizala en Facturación › Emitidas.')
      await onReload()
    } catch (e: any) {
      alert('Error inesperado: ' + (e?.message || e))
    } finally { setRefacturando(false) }
  }

  // Bucket privado: la signed URL se genera al vuelo desde el PATH guardado en archivo_url.
  async function abrirArchivo(descargar: boolean) {
    if (!factura.archivo_url || abriendo) return
    setAbriendo(true)
    try {
      const opts = descargar ? { download: factura.archivo_nombre || 'factura' } : undefined
      const { data, error } = await supabase.storage.from('facturas').createSignedUrl(factura.archivo_url, 3600, opts)
      if (error || !data?.signedUrl) { alert('No se pudo abrir el archivo'); return }
      window.open(data.signedUrl, '_blank')
    } finally { setAbriendo(false) }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="text-xl font-black font-mono text-gray-900">{factura.folio ? `#${factura.folio}` : '—'}</div>
              <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${ESTADO_CLS[factura.estado]}`}>{ESTADO_L[factura.estado]}</span>
              {factura.a_recuperar && <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full text-[10px] font-semibold border border-purple-200">A recuperar</span>}
              {factura.refactura_emitida_id && <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded-full text-[10px] font-semibold border border-green-200">Refacturada</span>}
            </div>
            <div className="text-sm font-semibold text-gray-900">{factura.proveedor_razon_social}</div>
            <div className="text-xs text-gray-500 mt-1">{TIPO_DOC_L[factura.tipo_doc] || factura.tipo_doc} · {factura.fecha_emision} · {factura.proveedor_pais}</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-black font-mono text-gray-900">{factura.moneda} {fmtCLP(factura.total)}</div>
            {factura.credito_fiscal > 0 && (
              <div className="text-xs text-green-700 font-semibold mt-1">CF IVA: $ {fmtCLP(factura.credito_fiscal)}</div>
            )}
          </div>
        </div>
        <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100 flex-wrap">
          {puedeEditarFR && <span className="text-[10px] text-gray-400 self-center">Estado:</span>}
          {puedeEditarFR && (['recibida', 'contabilizada', 'pagada', 'anulada'] as string[]).filter(e => e !== factura.estado).map(e => (
            <button key={e} onClick={() => cambiarEstado(e)}
              className={`px-3 py-1 rounded-full text-[10px] font-semibold border ${ESTADO_CLS[e]} hover:opacity-80`}>
              {ESTADO_L[e]}
            </button>
          ))}
        </div>
      </div>

      {factura.a_recuperar && (
        <div className="bg-white border border-purple-100 rounded-2xl p-4 shadow-sm flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-purple-800">Recupero al cliente</div>
            <div className="text-[11px] text-gray-500 mt-0.5">
              {factura.refactura_emitida_id
                ? 'Ya refacturada. La factura emitida está en Facturación › Emitidas (borrador hasta que la finalices).'
                : factura.operacion_id
                  ? 'Generá la factura emitida al cliente para recuperar este gasto.'
                  : 'Asigná esta factura a una operación para poder refacturar.'}
            </div>
          </div>
          {factura.refactura_emitida_id
            ? <span className="px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-semibold border border-green-200 whitespace-nowrap">✓ Refacturada</span>
            : puede(permisos, 'facturas_emitidas', 'crear') && (
              <button onClick={refacturar} disabled={refacturando || !factura.operacion_id}
                className="px-4 py-2 bg-[#7C3AED] text-white rounded-lg text-xs font-bold hover:bg-[#6D28D9] disabled:opacity-40 whitespace-nowrap">
                {refacturando ? 'Generando…' : 'Refacturar al cliente'}
              </button>)}
        </div>
      )}

      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-3.5 border-b border-gray-100 font-semibold text-sm text-gray-900">Detalle</div>
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {['Descripción', 'Cant.', 'Precio unit.', 'Neto/Exento', 'IVA (CF)', 'Total'].map(h => (
                <th key={h} className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item: any, i: number) => (
              <tr key={i} className="border-b border-gray-50">
                <td className="px-4 py-2.5 text-gray-800">{item.descripcion}</td>
                <td className="px-4 py-2.5 text-gray-500">{item.cantidad}</td>
                <td className="px-4 py-2.5 font-mono text-gray-600">{fmtCLP(item.precio_unit || 0)}</td>
                <td className="px-4 py-2.5 font-mono text-gray-600">{fmtCLP(item.neto || 0)}</td>
                <td className="px-4 py-2.5 font-mono text-green-700">{fmtCLP(item.iva_monto || 0)}</td>
                <td className="px-4 py-2.5 font-mono font-bold text-gray-900">{fmtCLP(item.total || 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Documento adjunto */}
      {factura.archivo_url && (puede(permisos, 'facturas_recibidas', 'ver') || puede(permisos, 'facturas_recibidas', 'descargar')) && (
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">📄</span>
            <div>
              <div className="text-xs font-semibold text-gray-800">{factura.archivo_nombre || 'Documento adjunto'}</div>
              <div className="text-[10px] text-gray-400">Factura / comprobante del proveedor</div>
            </div>
          </div>
          <div className="flex gap-2">
            {puede(permisos, 'facturas_recibidas', 'ver') && (
              <button onClick={() => abrirArchivo(false)} disabled={abriendo} className="px-3 py-1.5 bg-[#EBF2FF] text-[#1168F8] rounded-lg text-xs font-medium hover:bg-[#93B8FC] disabled:opacity-50">📄 Ver</button>
            )}
            {puede(permisos, 'facturas_recibidas', 'descargar') && (
              <button onClick={() => abrirArchivo(true)} disabled={abriendo} className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50 disabled:opacity-50">⬇ Descargar</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
