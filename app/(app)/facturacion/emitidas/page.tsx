'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { fmt, ETAPAS_L, ETAPAS_ORD } from '@/lib/utils'
import Link from 'next/link'
import { cargarPermisos, puede } from '@/lib/permisos'
import ModalAgregarItemCatalogo from '@/components/ModalAgregarItemCatalogo'

// Caracterización tributaria de la venta (RV / SII). Define el tipo de transacción.
const CARACTERIZACIONES_VENTA: { codigo: string; nombre: string }[] = [
  { codigo: 'del_giro',    nombre: 'Del giro' },
  { codigo: 'activo_fijo', nombre: 'Activo fijo' },
  { codigo: 'bien_raiz',   nombre: 'Bien raíz' },
]

interface FacturaEmitida {
  id: string; tipo_doc: string; folio: number | null; estado: string
  fecha_emision: string; fecha_vencimiento: string | null; fecha_pago: string | null
  tercero_id: string | null; cliente_razon_social: string; cliente_rut: string | null
  cliente_direccion: string | null; cliente_ciudad: string | null; cliente_pais: string
  cliente_giro: string | null; operacion_id: string | null; cotizacion_num: string | null
  moneda: string; tc_referencia: number | null; items: any[]
  neto: number; iva_monto: number; exento: number; total: number; total_usd: number | null
  afecta_iva: boolean; iva_pct: number; tipo_cobro: string; discriminar_items: boolean
  glosa: string | null; notas_internas: string | null; creado_por: string | null; created_at: string
  archivo_url?: string; archivo_nombre?: string
}

const TIPO_DOC_L: Record<string, string> = {
  factura: 'Factura afecta', factura_exenta: 'Factura exenta', boleta: 'Boleta',
  nota_credito: 'Nota de crédito', nota_debito: 'Nota de débito',
}
const ESTADO_CLS: Record<string, string> = {
  borrador: 'bg-gray-100 text-gray-600 border-gray-200',
  emitida: 'bg-blue-50 text-[#1168F8] border-blue-200',
  enviada_sii: 'bg-amber-50 text-amber-700 border-amber-200',
  aceptada_sii: 'bg-green-50 text-green-700 border-green-200',
  anulada: 'bg-red-50 text-red-700 border-red-200',
  pagada: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  pendiente_anulacion: 'bg-violet-50 text-[#7C3AED] border-violet-200',
  pendiente_autorizacion: 'bg-violet-50 text-[#7C3AED] border-violet-200',
}
const ESTADO_L: Record<string, string> = {
  borrador: 'Borrador', emitida: 'Emitida', enviada_sii: 'Enviada SII',
  aceptada_sii: 'Aceptada SII', anulada: 'Anulada', pagada: 'Pagada',
  pendiente_anulacion: 'Anulación pendiente', pendiente_autorizacion: 'NC pendiente',
}

export default function FacturasEmitidasPage() {
  const supabase = useMemo(() => createClient(), [])
  const [facturas, setFacturas] = useState<FacturaEmitida[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'lista'|'nueva'|'detalle'|'impresion'>('lista')
  const [selId, setSelId] = useState<string|null>(null)
  const [filtroEstado, setFiltroEstado] = useState('')
  const [buscar, setBuscar] = useState('')
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [terceros, setTerceros] = useState<any[]>([])
  const [operaciones, setOperaciones] = useState<any[]>([])
  const [catalogo, setCatalogo] = useState<any[]>([])       // servicios_catalogo + formas
  const [rubrosCat, setRubrosCat] = useState<any[]>([])     // proveedor_rubros (PN factura como proveedor)
  const [tiposComp, setTiposComp] = useState<any[]>([])     // catálogo de comprobantes (emitido/ambos)
  const [tcSnap, setTcSnap] = useState<any>(null)           // snapshot completo de TC vigentes al momento de cargar
  const [permisos, setPermisos] = useState<Record<string,string[]>>({})

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
    const [fRes, tRes, oRes, cRes, rRes, tcRes, tceRes] = await Promise.all([
      supabase.from('facturas_emitidas').select('*').order('fecha_emision', { ascending: false }),
      supabase.from('terceros').select('id,razon_social,nro_doc,tipo_doc,actividad,dir_fiscal_calle,dir_fiscal_ciudad,pais').contains('tipo', ['cliente']),
      supabase.from('operaciones').select('id,cotizacion:cotizaciones(num,cliente)').order('created_at', { ascending: false }).limit(50),
      supabase.from('servicios_catalogo')
        .select('id,rubro,grupo,nombre,orden,formas:servicios_metricas_habilitadas(metrica:servicios_metricas(id,nombre,unidad_label,comportamiento))')
        .eq('activo', true).order('orden', { ascending: true }),
      supabase.from('proveedor_rubros').select('codigo,nombre').order('codigo', { ascending: true }),
      supabase.from('tipos_comprobante').select('*').eq('activo', true)
        .in('ambito', ['emitido', 'ambos']).order('orden', { ascending: true }),
      (supabase.from('tipos_cambio_eventos') as any).select('fecha, fuente, ars, clp, cny').order('created_at', { ascending: false }).limit(1),
    ])
    if (fRes.data) setFacturas(fRes.data as FacturaEmitida[])
    if (tRes.data) setTerceros(tRes.data)
    if (oRes.data) setOperaciones(oRes.data)
    if (cRes.data) setCatalogo(cRes.data)
    if (rRes.data) setRubrosCat(rRes.data)
    if (tcRes.data) setTiposComp(tcRes.data)
    if (tceRes.data?.[0]) {
      const tce: any = tceRes.data[0]
      setTcSnap({ fecha: tce.fecha, fuente: tce.fuente || null, USD: 1, ARS: Number(tce.ars) || null, CLP: Number(tce.clp) || null, CNY: Number(tce.cny) || null })
    }
    setLoading(false)
  }

  const sel = facturas.find(f => f.id === selId)
  const filtradas = facturas.filter(f => {
    const b = buscar.toLowerCase()
    const matchB = !b || f.cliente_razon_social.toLowerCase().includes(b) || String(f.folio || '').includes(b) || (f.cotizacion_num || '').toLowerCase().includes(b)
    return matchB && (!filtroEstado || (filtroEstado === 'pendientes' ? (f.estado === 'pendiente_anulacion' || f.estado === 'pendiente_autorizacion') : f.estado === filtroEstado))
  })
  const stats = {
    total: facturas.length,
    emitidas: facturas.filter(f => f.estado === 'emitida').length,
    pendientes: facturas.filter(f => ['emitida','enviada_sii','aceptada_sii'].includes(f.estado)).length,
    totalCLP: facturas.filter(f => f.moneda === 'CLP' && f.estado !== 'anulada').reduce((s, f) => s + f.total, 0),
    totalUSD: facturas.filter(f => f.total_usd && f.estado !== 'anulada').reduce((s, f) => s + (f.total_usd || 0), 0),
  }

  if (permListos && !puede(permisos,'facturas_emitidas','ver')) {
    return (<div className="p-6 bg-gray-50 min-h-screen flex items-center justify-center"><div className="text-center max-w-sm"><div className="text-5xl mb-3">🔒</div><h2 className="text-lg font-bold text-gray-700">Sin acceso</h2><p className="text-sm text-gray-400 mt-1">No tenés permiso para ver esta sección. Si creés que es un error, contactá al administrador.</p></div></div>)
  }
  const puedeCrearFE = puede(permisos,'facturas_emitidas','crear')
  const puedeDescargarFE = puede(permisos,'facturas_emitidas','descargar')
  const puedeAutorizar = puede(permisos,'facturas_emitidas_autorizar','autorizar')
  const puedeVerPendientes = puedeAutorizar || puede(permisos,'facturas_emitidas_autorizar','ver')
  const pendientesAutorizar = facturas.filter(f => f.estado === 'pendiente_anulacion' || f.estado === 'pendiente_autorizacion').length

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Facturas emitidas</h1>
          <p className="text-xs text-gray-400 mt-0.5">Puerto NOA SpA → Clientes · Modelo SII Chile</p>
        </div>
        <div className="flex gap-2">
          {view !== 'lista' && <button onClick={() => { setView('lista'); setSelId(null) }} className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold hover:bg-gray-100">← Volver</button>}
          {view === 'lista' && puedeCrearFE && <button onClick={() => setView('nueva')} className="px-5 py-2.5 bg-[#1168F8] text-white rounded-xl text-sm font-bold hover:bg-[#0a4fc4] shadow-sm">+ Nueva factura</button>}
          {view === 'detalle' && sel && puedeDescargarFE && <button onClick={() => setView('impresion')} className="px-4 py-2 bg-[#052698] text-white rounded-xl text-xs font-bold hover:bg-[#1168F8]">🖨 Imprimir / PDF</button>}
        </div>
      </div>

      {view === 'lista' && puedeVerPendientes && pendientesAutorizar > 0 && (
        <div className="mb-4 bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-[#7C3AED] font-semibold">⏳ Tenés {pendientesAutorizar} documento(s) esperando autorización.</div>
          <button onClick={() => setFiltroEstado('pendientes')} className="px-3 py-1.5 bg-[#7C3AED] text-white rounded-lg text-xs font-semibold hover:opacity-90">Ver pendientes</button>
        </div>
      )}

      {view === 'lista' && (
        <>
          <div className="grid grid-cols-5 gap-3 mb-5">
            {[
              { label: 'Total facturas', value: stats.total, icon: '📄', color: 'text-gray-900', bg: 'bg-white' },
              { label: 'Emitidas', value: stats.emitidas, icon: '📤', color: 'text-[#1168F8]', bg: 'bg-white' },
              { label: 'Pendientes cobro', value: stats.pendientes, icon: '⏳', color: 'text-amber-700', bg: 'bg-white' },
              { label: 'Total CLP', value: `$ ${Math.round(stats.totalCLP).toLocaleString('es-CL')}`, icon: '🇨🇱', color: 'text-[#052698]', bg: 'bg-[#EBF2FF]' },
              { label: 'Ref. USD', value: `USD ${fmt(stats.totalUSD, 0)}`, icon: '💵', color: 'text-green-700', bg: 'bg-green-50' },
            ].map(s => (
              <div key={s.label} className={`${s.bg} border border-gray-100 rounded-2xl p-4 shadow-sm`}>
                <div className="text-xl mb-1">{s.icon}</div>
                <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-[10px] text-gray-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="flex gap-3 mb-4 flex-wrap items-center">
            <div className="relative flex-1 min-w-60">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🔍</span>
              <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar cliente, folio, operación..." className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white shadow-sm" />
            </div>
            <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:border-[#1168F8] shadow-sm">
              <option value="">Todos los estados</option>
              {Object.entries(ESTADO_L).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            {(buscar || filtroEstado) && <button onClick={() => { setBuscar(''); setFiltroEstado('') }} className="px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-500 hover:bg-gray-50">✕</button>}
            <span className="text-xs text-gray-400 ml-auto">{filtradas.length} factura(s)</span>
          </div>
          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
            {loading ? <div className="p-8 text-center text-gray-400">Cargando...</div>
            : filtradas.length === 0 ? (
              <div className="p-12 text-center">
                <div className="text-4xl mb-3">📄</div>
                <div className="text-gray-500 text-sm mb-1">Sin facturas aún</div>
                {puedeCrearFE && <button onClick={() => setView('nueva')} className="mt-3 px-4 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold">+ Crear primera factura</button>}
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {['Folio','Tipo','Cliente','Operación','Fecha','Total','Estado',''].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map(f => (
                    <tr key={f.id} className="border-b border-gray-50 hover:bg-blue-50/20 transition-colors group cursor-pointer" onClick={() => { setSelId(f.id); setView('detalle') }}>
                      <td className="px-4 py-3.5"><div className="font-mono font-bold text-gray-900">{f.folio ? `#${f.folio}` : <span className="text-gray-300">Sin folio</span>}</div></td>
                      <td className="px-4 py-3.5"><span className="text-xs text-gray-600">{TIPO_DOC_L[f.tipo_doc] || f.tipo_doc}</span></td>
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-gray-900">{f.cliente_razon_social}</div>
                        {f.cliente_rut && <div className="text-[10px] text-gray-400 font-mono">{f.cliente_rut}</div>}
                      </td>
                      <td className="px-4 py-3.5">{f.cotizacion_num ? <span className="font-mono text-[11px] text-[#1168F8]">{f.cotizacion_num}</span> : <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3.5 font-mono text-[11px] text-gray-600">{f.fecha_emision}</td>
                      <td className="px-4 py-3.5">
                        <div className="font-mono font-bold text-gray-900">{f.moneda} {f.moneda === 'CLP' ? Math.round(f.total).toLocaleString('es-CL') : fmt(f.total, 2)}</div>
                        {f.total_usd && <div className="text-[10px] text-gray-400 font-mono">USD {fmt(f.total_usd, 0)}</div>}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${ESTADO_CLS[f.estado]}`}>{ESTADO_L[f.estado]}</span>
                          {f.archivo_url && <span className="text-[10px] text-[#1168F8]">📎</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3.5"><div className="opacity-0 group-hover:opacity-100 flex gap-1"><button className="p-1.5 border border-gray-200 rounded-lg hover:bg-[#EBF2FF] text-gray-500 hover:text-[#1168F8] text-xs">👁</button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {view === 'nueva' && <FormFactura supabase={supabase} currentUser={currentUser} terceros={terceros} operaciones={operaciones} catalogo={catalogo} rubrosCat={rubrosCat} tiposComp={tiposComp} tcSnap={tcSnap} permisos={permisos} onSave={async () => { await loadData(); setView('lista') }} onCancel={() => setView('lista')} />}
      {view === 'detalle' && sel && <DetalleFactura factura={sel} supabase={supabase} permisos={permisos} currentUser={currentUser} onReload={loadData} onImprimir={() => setView('impresion')} onBack={() => setView('lista')} />}
      {view === 'impresion' && sel && <ImpresionFactura factura={sel} onBack={() => setView('detalle')} />}
    </div>
  )
}

function FormFactura({ supabase, currentUser, terceros, operaciones, catalogo, rubrosCat, tiposComp, tcSnap, permisos, onSave, onCancel }: any) {
  const [form, setForm] = useState({
    tipo_comprobante_id: '', tipo_doc: 'factura', folio_sii: '', caracterizacion: 'del_giro',
    ref_tipo: '', ref_folio: '',
    fecha_emision: new Date().toISOString().slice(0, 10),
    fecha_vencimiento: '', tercero_id: '', cliente_razon_social: '', cliente_rut: '',
    cliente_direccion: '', cliente_ciudad: '', cliente_pais: 'Chile', cliente_giro: '',
    operacion_id: '', cotizacion_num: '', moneda: 'CLP', tc_referencia: '',
    afecta_iva: true, iva_pct: 19, tipo_cobro: 'servicio', discriminar_items: true, glosa: '', notas_internas: '', etapa: '',
  })
  const itemVacio = { servicio_id: '', metrica_id: '', descripcion: '', rubro: '', unidad: '', nota: '', cantidad: 1, precio_unit: 0, descuento: 0, exento: false }
  const [items, setItems] = useState<any[]>([{ ...itemVacio }])
  const [rubroFactura, setRubroFactura] = useState('')      // PN actúa como proveedor de este rubro
  const [modalItem, setModalItem] = useState(false)
  const [buscarTercero, setBuscarTercero] = useState('')
  const [showTerceroDD, setShowTerceroDD] = useState(false)
  const [saving, setSaving] = useState(false)
  const [compFile, setCompFile] = useState<File|null>(null)
  const [recibidasRef, setRecibidasRef] = useState<any[]>([])   // recibidas de la operación para refacturar
  const [cargandoRec, setCargandoRec] = useState(false)
  const inp = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white'

  const comp = tiposComp?.find((c: any) => c.id === form.tipo_comprobante_id) || null
  const nombreRubro = (cod: string) => rubrosCat?.find((r: any) => r.codigo === cod)?.nombre || cod
  // Ítems del catálogo del rubro elegido para esta factura
  const itemsDelRubro = (catalogo || []).filter((c: any) => c.rubro === rubroFactura)

  function formasDeItem(servicioId: string) {
    const it = (catalogo || []).find((c: any) => c.id === servicioId)
    if (!it) return []
    return (it.formas || []).map((f: any) => f.metrica).filter(Boolean)
  }

  function selectTercero(t: any) {
    setForm(f => ({ ...f, tercero_id: t.id, cliente_razon_social: t.razon_social, cliente_rut: t.nro_doc || '', cliente_direccion: t.dir_fiscal_calle || '', cliente_ciudad: t.dir_fiscal_ciudad || '', cliente_pais: t.pais || 'Chile', cliente_giro: t.actividad || '' }))
    setBuscarTercero(t.razon_social); setShowTerceroDD(false)
  }

  function selectComprobante(id: string) {
    const c = tiposComp.find((x: any) => x.id === id)
    setForm(f => ({ ...f, tipo_comprobante_id: id, tipo_doc: c?.nombre || f.tipo_doc, afecta_iva: !!c?.afecta_iva }))
  }

  function setItemServicio(i: number, servicioId: string) {
    const it = (catalogo || []).find((c: any) => c.id === servicioId)
    const formas = formasDeItem(servicioId)
    const unaForma = formas.length === 1 ? formas[0] : null
    const n = [...items]
    n[i] = { ...n[i], servicio_id: servicioId, descripcion: it?.nombre || '', rubro: it?.rubro || rubroFactura, metrica_id: unaForma?.id || '', unidad: unaForma?.unidad_label || '' }
    setItems(n)
  }

  function setItemForma(i: number, metricaId: string) {
    const m = formasDeItem(items[i].servicio_id).find((f: any) => f.id === metricaId)
    const n = [...items]
    n[i] = { ...n[i], metrica_id: metricaId, unidad: m?.unidad_label || '' }
    setItems(n)
  }

  function calcItem(item: any) {
    const subtotal = item.cantidad * item.precio_unit * (1 - (item.descuento || 0) / 100)
    const iva = item.exento ? 0 : subtotal * (form.afecta_iva ? form.iva_pct / 100 : 0)
    return { neto: item.exento ? 0 : subtotal, exento: item.exento ? subtotal : 0, iva, total: subtotal + iva }
  }

  // ---- Refacturación (recupero de gastos / mixto) ----
  const usaRecupero = form.tipo_cobro === 'recupero_gastos' || form.tipo_cobro === 'mixto'
  const usaCatalogo = form.tipo_cobro !== 'recupero_gastos'

  // Trae las recibidas de la operación marcadas "a recuperar" y aún no refacturadas
  useEffect(() => {
    if (!usaRecupero || !form.operacion_id) { setRecibidasRef([]); return }
    let cancel = false
    ;(async () => {
      setCargandoRec(true)
      const { data } = await (supabase.from('facturas_recibidas') as any)
        .select('id, folio, nro_ingreso, proveedor_razon_social, moneda, items, neto')
        .eq('operacion_id', form.operacion_id)
        .eq('a_recuperar', true)
        .is('refactura_emitida_id', null)
        .neq('estado', 'anulada')
      if (cancel) return
      const lista = (data || []).map((r: any) => ({
        id: r.id, folio: r.folio, nro_ingreso: r.nro_ingreso,
        proveedor_razon_social: r.proveedor_razon_social, moneda: r.moneda, neto: r.neto,
        _sel: true, _open: true,
        _items: (Array.isArray(r.items) ? r.items : []).map((it: any) => {
          const costo = Number(it.precio_unit) || 0
          return {
            descripcion: it.descripcion || '', rubro: it.rubro || null, unidad: it.unidad || null,
            cantidad: Number(it.cantidad) || 1, exento: !!it.exento, costo,
            _sel: true, _mkTipo: 'pct', _mkVal: 0, _precio: costo, nota: '',
          }
        }),
      }))
      setRecibidasRef(lista)
      setCargandoRec(false)
    })()
    return () => { cancel = true }
  }, [usaRecupero, form.operacion_id])

  // Recalcula el precio unitario de un ítem refacturado según el markup (editable luego a mano)
  function recalcPrecio(it: any) {
    if (it._mkTipo === 'monto') return Math.max(0, (it.costo || 0) + (Number(it._mkVal) || 0))
    return Math.max(0, (it.costo || 0) * (1 + (Number(it._mkVal) || 0) / 100))
  }
  function updRecItem(ri: number, ii: number, patch: any) {
    setRecibidasRef(rs => rs.map((r, x) => x !== ri ? r : {
      ...r, _items: r._items.map((it: any, y: number) => {
        if (y !== ii) return it
        const merged = { ...it, ...patch }
        if ('_mkTipo' in patch || '_mkVal' in patch) merged._precio = recalcPrecio(merged)
        return merged
      })
    }))
  }
  function updRecibida(ri: number, patch: any) {
    setRecibidasRef(rs => rs.map((r, x) => x === ri ? { ...r, ...patch } : r))
  }

  // Ítems refacturados derivados (formato compatible con calcItem y el guardado)
  const itemsRefacturados = recibidasRef.filter(r => r._sel).flatMap(r =>
    (r._items || []).filter((it: any) => it._sel && (Number(it._precio) > 0)).map((it: any) => ({
      servicio_id: null, metrica_id: null,
      descripcion: it.descripcion, rubro: it.rubro || null, unidad: it.unidad || null, nota: it.nota || null,
      cantidad: it.cantidad, precio_unit: Number(it._precio) || 0, descuento: 0, exento: it.exento,
      origen_recibida_id: r.id, origen_folio: r.folio || null, costo_origen: it.costo,
    })))

  // Ítems efectivos de la factura = catálogo (si aplica) + refacturados (si aplica)
  const itemsEfectivos = [
    ...(usaCatalogo ? items.filter(i => i.servicio_id || i.descripcion) : []),
    ...(usaRecupero ? itemsRefacturados : []),
  ]

  const totales = itemsEfectivos.reduce((acc, item) => { const c = calcItem(item); return { neto: acc.neto + c.neto, exento: acc.exento + c.exento, iva: acc.iva + c.iva, total: acc.total + c.total } }, { neto: 0, exento: 0, iva: 0, total: 0 })

  async function guardar() {
    if (!form.tipo_comprobante_id) { alert('Elegí el tipo de comprobante'); return }
    if (!form.cliente_razon_social) { alert('Ingresá el cliente'); return }
    if (usaRecupero && !form.operacion_id) { alert('Para refacturar un recupero, elegí primero la operación'); return }
    if (itemsEfectivos.filter(i => (i.servicio_id || i.descripcion) && i.precio_unit > 0).length === 0) { alert('Agregá al menos un ítem'); return }
    if (comp?.requiere_referencia && !form.ref_folio) { alert('Este comprobante (nota de crédito/débito) requiere el folio del documento que modifica'); return }
    setSaving(true)
    const itemsLimpios = itemsEfectivos.filter(i => i.servicio_id || i.descripcion).map(i => {
      const c = calcItem(i)
      return {
        servicio_id: i.servicio_id || null, metrica_id: i.metrica_id || null,
        descripcion: i.descripcion, rubro: i.rubro || null, unidad: i.unidad || null, nota: i.nota || null,
        cantidad: i.cantidad, precio_unit: i.precio_unit, descuento: i.descuento || 0, exento: i.exento,
        neto: c.neto, iva_monto: c.iva, exento_monto: c.exento, total: c.total,
        origen_recibida_id: (i as any).origen_recibida_id || null, origen_folio: (i as any).origen_folio || null, costo_origen: (i as any).costo_origen ?? null,
      }
    })
    const tcRef = parseFloat(form.tc_referencia as any) || null
    const { ref_tipo, ref_folio, ...formRest } = form
    const { data: factData } = await (supabase.from('facturas_emitidas') as any).insert({
      ...formRest, tc_referencia: tcRef, tc_snapshot: tcSnap || null, iva_pct: form.iva_pct, items: itemsLimpios,
      ref_tipo: comp?.requiere_referencia ? (ref_tipo || comp?.nombre || null) : null,
      ref_folio: comp?.requiere_referencia ? (parseInt(ref_folio as any) || null) : null,
      neto: Math.round(totales.neto), iva_monto: Math.round(totales.iva),
      exento: Math.round(totales.exento), total: Math.round(totales.total),
      total_usd: tcRef ? totales.total / tcRef : null, estado: comp?.efecto === 'resta' ? 'pendiente_autorizacion' : 'borrador',
      creado_por: currentUser?.nombre, creado_por_id: currentUser?.id,
      ...(comp?.efecto === 'resta' ? { solicitado_por: currentUser?.nombre, solicitado_por_id: currentUser?.id, solicitado_at: new Date().toISOString(), motivo_anulacion: form.glosa || null } : {}),
    }).select('id').single()
    // Vincula las recibidas refacturadas a esta emitida (quedan marcadas como refacturadas)
    if (factData && usaRecupero) {
      const ids = recibidasRef.filter(r => r._sel && (r._items || []).some((it: any) => it._sel && Number(it._precio) > 0)).map(r => r.id)
      if (ids.length > 0) {
        await (supabase.from('facturas_recibidas') as any).update({ refactura_emitida_id: factData.id }).in('id', ids)
      }
    }
    if (factData && compFile) {
      const ext = compFile.name.split('.').pop()
      const path = `facturas-emitidas/${factData.id}.${ext}`
      await supabase.storage.from('comprobantes').upload(path, compFile, { upsert: true })
      await (supabase.from('facturas_emitidas') as any).update({ archivo_url: path, archivo_nombre: compFile.name }).eq('id', factData.id)
    }
    setCompFile(null)
    await onSave(); setSaving(false)
  }

  const fmtCLP = (n: number) => Math.round(n).toLocaleString('es-CL')

  return (
    <div className="max-w-4xl space-y-4">
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <h3 className="font-bold text-sm text-gray-900 mb-4">¿Qué comprobante vas a emitir?</h3>
        <div className="grid grid-cols-4 gap-3">
          <div className="col-span-2"><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Tipo de comprobante *</label>
            <select value={form.tipo_comprobante_id} onChange={e => selectComprobante(e.target.value)} className={inp}>
              <option value="">— elegí el comprobante —</option>
              {tiposComp.map((c: any) => (
                <option key={c.id} value={c.id}>{c.codigo_sii ? `(${c.codigo_sii}) ` : ''}{c.nombre}</option>
              ))}
            </select>
            {comp && (
              <div className="text-[10px] mt-1 flex gap-2 flex-wrap">
                <span className={comp.afecta_iva ? 'text-green-700' : 'text-gray-400'}>{comp.afecta_iva ? '● Afecto a IVA' : '○ No afecto a IVA'}</span>
                {comp.efecto === 'resta' && <span className="text-red-600">● Resta (nota de crédito)</span>}
                {comp.categoria === 'exportacion' && <span className="text-[#1168F8]">● Exportación</span>}
              </div>
            )}
          </div>
          <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Folio SII (cód. que devuelve el SII)</label>
            <input value={form.folio_sii} onChange={e => setForm(f => ({ ...f, folio_sii: e.target.value }))} className={inp + ' font-mono'} placeholder="se carga al replicar en SII" />
          </div>
          <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Caracterización (venta)</label>
            <select value={form.caracterizacion} onChange={e => setForm(f => ({ ...f, caracterizacion: e.target.value }))} className={inp}>
              {CARACTERIZACIONES_VENTA.map(c => <option key={c.codigo} value={c.codigo}>{c.nombre}</option>)}
            </select>
          </div>
          {comp?.requiere_referencia && (
            <div className="col-span-2"><label className="block text-[10px] font-semibold text-amber-600 mb-1 uppercase">Folio del documento que modifica *</label>
              <input value={form.ref_folio} onChange={e => setForm(f => ({ ...f, ref_folio: e.target.value }))} className={inp} placeholder="Folio de la factura original (obligatorio para NC/ND)" />
            </div>
          )}
          <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Fecha emisión</label>
            <input type="date" value={form.fecha_emision} onChange={e => setForm(f => ({ ...f, fecha_emision: e.target.value }))} className={inp} /></div>
          <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Fecha vencimiento</label>
            <input type="date" value={form.fecha_vencimiento} onChange={e => setForm(f => ({ ...f, fecha_vencimiento: e.target.value }))} className={inp} /></div>
          <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Moneda</label>
            <select value={form.moneda} onChange={e => setForm(f => ({ ...f, moneda: e.target.value }))} className={inp}>
              {['CLP','USD','ARS','CNY'].map(m => <option key={m}>{m}</option>)}
            </select></div>
          {form.moneda !== 'CLP' && <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">TC referencia</label>
            <input type="text" value={form.tc_referencia} onChange={e => setForm(f => ({ ...f, tc_referencia: e.target.value }))} className={inp} placeholder="ej. 950" /></div>}
        </div>
        <p className="text-[10px] text-gray-400 mt-2">El folio propio correlativo se asigna al confirmar la emisión. El folio SII podés cargarlo ahora o después (cuando repliques la factura impresa en el portal del SII).</p>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <h3 className="font-bold text-sm text-gray-900 mb-4">Cliente</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 relative">
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Razón social *</label>
            <input value={buscarTercero || form.cliente_razon_social}
              onChange={e => { setBuscarTercero(e.target.value); setForm(f => ({ ...f, cliente_razon_social: e.target.value, tercero_id: '' })); setShowTerceroDD(true) }}
              onFocus={() => setShowTerceroDD(true)}
              onBlur={() => setTimeout(() => setShowTerceroDD(false), 150)}
              className={inp} placeholder="Buscar o ingresar cliente..." />
            {showTerceroDD && (() => {
              const q = (buscarTercero || form.cliente_razon_social || '').trim().toLowerCase()
              const lista = terceros.filter((t: any) => !q || t.razon_social.toLowerCase().includes(q)).slice(0, 8)
              return lista.length > 0 ? (
                <div className="absolute z-50 top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl max-h-52 overflow-y-auto mt-1">
                  {lista.map((t: any) => (
                    <button key={t.id} onMouseDown={() => selectTercero(t)} className="w-full text-left px-4 py-2.5 hover:bg-[#EBF2FF] border-b border-gray-50 last:border-0">
                      <div className="font-semibold text-xs text-gray-900">{t.razon_social}</div>
                      {t.nro_doc && <div className="text-[10px] text-gray-400 font-mono">{t.tipo_doc}: {t.nro_doc}</div>}
                    </button>
                  ))}
                </div>
              ) : null
            })()}
          </div>
          <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">RUT / CUIT</label>
            <input value={form.cliente_rut} onChange={e => setForm(f => ({ ...f, cliente_rut: e.target.value }))} className={inp} placeholder="XX.XXX.XXX-X" /></div>
          <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Giro</label>
            <input value={form.cliente_giro} onChange={e => setForm(f => ({ ...f, cliente_giro: e.target.value }))} className={inp} placeholder="Actividad comercial" /></div>
          <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Dirección</label>
            <input value={form.cliente_direccion} onChange={e => setForm(f => ({ ...f, cliente_direccion: e.target.value }))} className={inp} /></div>
          <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Ciudad</label>
            <input value={form.cliente_ciudad} onChange={e => setForm(f => ({ ...f, cliente_ciudad: e.target.value }))} className={inp} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-gray-100">
          <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Operación vinculada</label>
            <select value={form.operacion_id} onChange={e => { const op = operaciones.find((o: any) => o.id === e.target.value); setForm(f => ({ ...f, operacion_id: e.target.value, cotizacion_num: op?.cotizacion?.num || '' })) }} className={inp}>
              <option value="">Sin vincular</option>
              {operaciones.map((o: any) => <option key={o.id} value={o.id}>{o.cotizacion?.num} · {o.cotizacion?.cliente}</option>)}
            </select></div>
          <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Tipo de cobro</label>
            <select value={form.tipo_cobro} onChange={e => setForm(f => ({ ...f, tipo_cobro: e.target.value }))} className={inp}>
              <option value="servicio">Servicio propio</option>
              <option value="recupero_gastos">Recupero de gastos</option>
              <option value="fee">Fee Puerto NOA</option>
              <option value="mixto">Mixto</option>
            </select></div>
          <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Etapa (imputación)</label>
            <select value={form.etapa} onChange={e => setForm(f => ({ ...f, etapa: e.target.value }))} className={inp}>
              <option value="">Sin imputar</option>
              {ETAPAS_ORD.map(et => <option key={et} value={et}>{ETAPAS_L[et] || et}</option>)}
            </select></div>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-sm text-gray-900">Detalle de ítems</h3>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
              <input type="checkbox" checked={form.discriminar_items} onChange={e => setForm(f => ({ ...f, discriminar_items: e.target.checked }))} />
              Discriminar ítems en impresión
            </label>
            {comp && (
              <span className={`text-[11px] font-semibold ${comp.afecta_iva ? 'text-green-700' : 'text-gray-400'}`}>
                {comp.afecta_iva ? `IVA ${form.iva_pct}%` : comp.categoria === 'exportacion' ? 'Exportación · sin IVA' : 'Sin IVA'}
              </span>
            )}
          </div>
        </div>
        {usaCatalogo && (<>
        <div className="mb-4">
          <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Rubro de la factura (Puerto NOA actúa como proveedor)</label>
          <select value={rubroFactura} onChange={e => { setRubroFactura(e.target.value); setItems([{ ...itemVacio }]) }}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white">
            <option value="">— elegí el rubro para traer sus ítems —</option>
            {(rubrosCat || []).map((r: any) => <option key={r.codigo} value={r.codigo}>{r.nombre}</option>)}
          </select>
        </div>
        {!rubroFactura ? (
          <div className="text-center py-8 text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl">
            Elegí el rubro arriba para traer los ítems del catálogo.
          </div>
        ) : itemsDelRubro.length === 0 ? (
          <div className="text-center py-8 text-xs text-amber-600 border border-dashed border-amber-200 rounded-xl">
            El rubro <b>{nombreRubro(rubroFactura)}</b> no tiene ítems en el catálogo. Usá "Otro ítem" para agregar uno.
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
                      <option value="">— elegí un ítem de {nombreRubro(rubroFactura)} —</option>
                      {itemsDelRubro.map((it: any) => <option key={it.id} value={it.id}>{it.grupo ? `${it.grupo} · ` : ''}{it.nombre}</option>)}
                    </select>
                    {items.length > 1 && <button onClick={() => setItems(items.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-500 text-sm px-1">✕</button>}
                  </div>
                  <div className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-3">
                      <label className="block text-[9px] text-gray-400 mb-0.5 uppercase">Forma de cobro</label>
                      {formas.length > 0 ? (
                        <select value={item.metrica_id} onChange={e => setItemForma(i, e.target.value)}
                          className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8] bg-white">
                          <option value="">— forma —</option>
                          {formas.map((f: any) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                        </select>
                      ) : <div className="text-[10px] text-gray-300 py-1.5">sin forma</div>}
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
                    <div className="col-span-1">
                      <label className="block text-[9px] text-gray-400 mb-0.5 uppercase">Desc%</label>
                      <input type="number" value={item.descuento} onChange={e => { const n = [...items]; n[i] = { ...n[i], descuento: parseFloat(e.target.value) || 0 }; setItems(n) }}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-right focus:outline-none focus:border-[#1168F8]" min="0" max="100" />
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
        {rubroFactura && (
          <div className="flex gap-4">
            <button onClick={() => setItems([...items, { ...itemVacio }])} className="text-xs text-[#1168F8] hover:underline">+ Agregar ítem</button>
            <button onClick={() => setModalItem(true)} className="text-xs text-gray-500 hover:text-[#1168F8] hover:underline">+ Otro ítem (al catálogo)</button>
          </div>
        )}
        </>)}

        {usaRecupero && (
          <div className={usaCatalogo ? 'mt-5 pt-5 border-t border-gray-100' : ''}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-bold text-[#7C3AED]">Recupero de gastos</span>
              <span className="text-[11px] text-gray-400">— elegí las facturas recibidas de la operación y los ítems a refacturar</span>
            </div>
            {!form.operacion_id ? (
              <div className="text-center py-8 text-xs text-amber-600 border border-dashed border-amber-200 rounded-xl">
                Elegí arriba la <b>operación vinculada</b> para traer sus facturas recibidas.
              </div>
            ) : cargandoRec ? (
              <div className="text-center py-8 text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl">Cargando recibidas…</div>
            ) : recibidasRef.length === 0 ? (
              <div className="text-center py-8 text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl">
                No hay facturas recibidas pendientes de refacturar en esta operación.<br/>
                <span className="text-[10px]">(deben estar marcadas "se refactura al cliente" y no haber sido refacturadas antes)</span>
              </div>
            ) : (
              <div className="space-y-2">
                {recibidasRef.map((r, ri) => (
                  <div key={r.id} className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50">
                      <input type="checkbox" checked={r._sel} onChange={e => updRecibida(ri, { _sel: e.target.checked })} />
                      <button onClick={() => updRecibida(ri, { _open: !r._open })} className="flex-1 text-left">
                        <span className="text-xs font-semibold text-gray-900">{r.proveedor_razon_social}</span>
                        {r.folio && <span className="text-[11px] text-gray-400 font-mono"> · {r.folio}</span>}
                        <span className="text-[11px] text-gray-400"> · {r.moneda} {fmtCLP(r.neto || 0)} neto</span>
                      </button>
                      <span className="text-[10px] text-gray-400">{r._open ? '▲' : '▼'}</span>
                    </div>
                    {r._sel && r._open && (
                      <div className="p-2 space-y-2">
                        {(r._items || []).length === 0 && <div className="text-[11px] text-gray-400 px-2 py-3">Esta factura no tiene ítems detallados.</div>}
                        {(r._items || []).map((it: any, ii: number) => {
                          const total = (Number(it._precio) || 0) * (Number(it.cantidad) || 0)
                          return (
                            <div key={ii} className={`border rounded-lg p-2 ${it._sel ? 'border-gray-200' : 'border-gray-100 opacity-50'}`}>
                              <div className="flex items-center gap-2 mb-2">
                                <input type="checkbox" checked={it._sel} onChange={e => updRecItem(ri, ii, { _sel: e.target.checked })} />
                                <span className="text-xs font-medium flex-1">{it.descripcion || 'ítem sin descripción'}</span>
                                {it.rubro && <span className="text-[10px] bg-[#EEEDFE] text-[#3C3489] px-2 py-0.5 rounded">{nombreRubro(it.rubro)}</span>}
                              </div>
                              {it._sel && (
                                <div className="grid grid-cols-12 gap-2 items-end">
                                  <div className="col-span-3">
                                    <label className="block text-[9px] text-gray-400 mb-0.5 uppercase">Costo unit.</label>
                                    <div className="text-xs font-mono py-1.5">{fmtCLP(it.costo)}</div>
                                  </div>
                                  <div className="col-span-4">
                                    <label className="block text-[9px] text-gray-400 mb-0.5 uppercase">Markup</label>
                                    <div className="flex items-center gap-1">
                                      <div className="flex border border-gray-200 rounded-lg overflow-hidden">
                                        <button onClick={() => updRecItem(ri, ii, { _mkTipo: 'pct' })} className={`px-2 py-1 text-[11px] ${it._mkTipo === 'pct' ? 'bg-[#0a9e6e] text-white' : 'text-gray-500'}`}>%</button>
                                        <button onClick={() => updRecItem(ri, ii, { _mkTipo: 'monto' })} className={`px-2 py-1 text-[11px] ${it._mkTipo === 'monto' ? 'bg-[#0a9e6e] text-white' : 'text-gray-500'}`}>$</button>
                                      </div>
                                      <input type="number" value={it._mkVal} onFocus={e => e.target.select()}
                                        onChange={e => updRecItem(ri, ii, { _mkVal: parseFloat(e.target.value) || 0 })}
                                        className="w-16 px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-right font-mono focus:outline-none focus:border-[#0a9e6e]" />
                                    </div>
                                  </div>
                                  <div className="col-span-2">
                                    <label className="block text-[9px] text-gray-400 mb-0.5 uppercase">Precio unit.</label>
                                    <input type="text" inputMode="decimal" value={it._precio || ''} onFocus={e => e.target.select()}
                                      onChange={e => updRecItem(ri, ii, { _precio: parseFloat(e.target.value.replace(/\./g, '').replace(',', '.')) || 0 })}
                                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-right font-mono text-[#0F6E56] focus:outline-none focus:border-[#0a9e6e]" />
                                  </div>
                                  <div className="col-span-1">
                                    <label className="block text-[9px] text-gray-400 mb-0.5 uppercase">Cant.</label>
                                    <div className="text-xs font-mono py-1.5 text-center">{it.cantidad}</div>
                                  </div>
                                  <div className="col-span-2 text-right">
                                    <label className="block text-[9px] text-gray-400 mb-0.5 uppercase">Total</label>
                                    <span className="font-mono font-bold text-xs text-gray-800">{fmtCLP(total)}</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end">
          <div className="w-64 space-y-1.5 text-xs">
            {totales.neto > 0 && <div className="flex justify-between"><span className="text-gray-500">Neto afecto</span><span className="font-mono">{fmtCLP(totales.neto)}</span></div>}
            {totales.exento > 0 && <div className="flex justify-between"><span className="text-gray-500">Exento</span><span className="font-mono">{fmtCLP(totales.exento)}</span></div>}
            {form.afecta_iva && totales.iva > 0 && <div className="flex justify-between text-amber-700"><span>IVA {form.iva_pct}%</span><span className="font-mono">{fmtCLP(totales.iva)}</span></div>}
            <div className="flex justify-between font-bold text-sm pt-2 border-t border-gray-200"><span>TOTAL {form.moneda}</span><span className="font-mono text-[#052698]">{fmtCLP(totales.total)}</span></div>
            {form.tc_referencia && <div className="flex justify-between text-[10px] text-gray-400"><span>Ref. USD (TC {form.tc_referencia})</span><span className="font-mono">USD {fmt(totales.total / parseFloat(form.tc_referencia as any), 0)}</span></div>}
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Glosa (aparece en factura)</label>
            <textarea value={form.glosa} onChange={e => setForm(f => ({ ...f, glosa: e.target.value }))} className={inp + ' resize-none'} rows={2} placeholder="Observaciones que aparecen en el documento impreso..." />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Notas internas (no aparecen)</label>
            <textarea value={form.notas_internas} onChange={e => setForm(f => ({ ...f, notas_internas: e.target.value }))} className={inp + ' resize-none'} rows={2} placeholder="Uso interno..." />
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Comprobante / Factura PDF (opcional)</label>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 px-3 py-2 border border-dashed border-gray-300 rounded-xl text-xs text-gray-500 hover:border-[#1168F8] hover:text-[#1168F8] cursor-pointer flex-1">
              📎 {compFile ? compFile.name : 'Adjuntar PDF oficial SII o comprobante de factura'}
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => setCompFile(e.target.files?.[0] || null)} />
            </label>
            {compFile && <button onClick={() => setCompFile(null)} className="text-gray-400 hover:text-red-500 text-xs">✕</button>}
          </div>
          <p className="text-[10px] text-gray-400 mt-1">Podés adjuntar la factura oficial emitida en SII o cualquier comprobante relacionado.</p>
        </div>
      </div>

      <div className="flex justify-between">
        <button onClick={onCancel} className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold hover:bg-gray-50">Cancelar</button>
        <button onClick={guardar} disabled={saving} className="px-6 py-2.5 bg-[#1168F8] text-white rounded-xl text-xs font-bold hover:bg-[#0a4fc4] disabled:opacity-50 shadow-sm">
          {saving ? 'Guardando...' : '✓ Guardar borrador'}
        </button>
      </div>

      {modalItem && (
        <ModalAgregarItemCatalogo
          supabase={supabase} permisos={permisos}
          rubrosDisponibles={rubrosCat} rubroFijo={rubroFactura}
          onClose={() => setModalItem(false)}
          onCreated={(nuevo: any) => {
            catalogo.push({ ...nuevo, formas: [] })
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
    </div>
  )
}

function DetalleFactura({ factura, supabase, permisos, currentUser, onReload, onImprimir, onBack }: any) {
  const puedeEditarFE = puede(permisos,'facturas_emitidas','editar')
  const puedeAnular = puede(permisos,'facturas_emitidas_anular','solicitar')
  const puedeAutorizar = puede(permisos,'facturas_emitidas_autorizar','autorizar')
  const [editandoFolio, setEditandoFolio] = useState(false)
  const [folio, setFolio] = useState(String(factura.folio || ''))
  const [editandoSii, setEditandoSii] = useState(false)
  const [folioSii, setFolioSii] = useState(String(factura.folio_sii || ''))
  const [saving, setSaving] = useState(false)
  const [abriendo, setAbriendo] = useState(false)
  const [mostrarMotivo, setMostrarMotivo] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [procesando, setProcesando] = useState(false)

  const enPendiente = factura.estado === 'pendiente_anulacion' || factura.estado === 'pendiente_autorizacion'
  const declaradaSii = !!factura.folio_sii   // ya replicada en el portal del SII → no se anula internamente, va NC
  const quien = currentUser?.nombre || currentUser?.email || 'usuario'

  async function guardarFolio() {
    setSaving(true)
    await (supabase.from('facturas_emitidas') as any).update({ folio: parseInt(folio) || null, estado: parseInt(folio) ? 'emitida' : factura.estado }).eq('id', factura.id)
    await onReload(); setEditandoFolio(false); setSaving(false)
  }

  async function guardarFolioSii() {
    setSaving(true)
    await (supabase.from('facturas_emitidas') as any).update({ folio_sii: folioSii.trim() || null }).eq('id', factura.id)
    await onReload(); setEditandoSii(false); setSaving(false)
  }

  async function cambiarEstado(estado: string) {
    await (supabase.from('facturas_emitidas') as any).update({ estado }).eq('id', factura.id)
    await onReload()
  }

  async function solicitarAnulacion() {
    if (!motivo.trim()) { alert('Indicá el motivo de la anulación.'); return }
    setProcesando(true)
    await (supabase.from('facturas_emitidas') as any).update({
      estado: 'pendiente_anulacion', motivo_anulacion: motivo.trim(),
      solicitado_por: quien, solicitado_por_id: currentUser?.id || null, solicitado_at: new Date().toISOString(),
    }).eq('id', factura.id)
    await onReload(); setMostrarMotivo(false); setMotivo(''); setProcesando(false)
  }

  async function autorizar() {
    setProcesando(true)
    // anulación aprobada → anulada ; NC aprobada → emitida (recién ahí impacta CC e IVA)
    const nuevo = factura.estado === 'pendiente_anulacion' ? 'anulada' : 'emitida'
    await (supabase.from('facturas_emitidas') as any).update({
      estado: nuevo, autorizado_por: quien, autorizado_por_id: currentUser?.id || null, autorizado_at: new Date().toISOString(),
    }).eq('id', factura.id)
    await onReload(); setProcesando(false)
  }

  async function rechazar() {
    setProcesando(true)
    // anulación rechazada → vuelve a emitida ; NC rechazada → se descarta (anulada)
    const nuevo = factura.estado === 'pendiente_anulacion' ? 'emitida' : 'anulada'
    await (supabase.from('facturas_emitidas') as any).update({
      estado: nuevo, autorizado_por: quien, autorizado_por_id: currentUser?.id || null, autorizado_at: new Date().toISOString(),
    }).eq('id', factura.id)
    await onReload(); setProcesando(false)
  }

  // Genera la signed URL al vuelo desde el PATH guardado (las firmadas expiran a 1h, por eso no se guardan).
  async function abrirArchivo(descargar: boolean) {
    if (!factura.archivo_url || abriendo) return
    setAbriendo(true)
    try {
      const opts = descargar ? { download: factura.archivo_nombre || 'factura' } : undefined
      const { data, error } = await supabase.storage.from('comprobantes').createSignedUrl(factura.archivo_url, 3600, opts)
      if (error || !data?.signedUrl) { alert('No se pudo abrir el archivo'); return }
      window.open(data.signedUrl, '_blank')
    } finally { setAbriendo(false) }
  }

  const fmtCLP = (n: number) => Math.round(n).toLocaleString('es-CL')
  const items = Array.isArray(factura.items) ? factura.items : []

  return (
    <div className="max-w-3xl space-y-4">
      {mostrarMotivo && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setMostrarMotivo(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-sm text-gray-900 mb-1">Solicitar anulación</h3>
            <p className="text-[11px] text-gray-400 mb-3">La factura queda pendiente hasta que un usuario con permiso de autorización la apruebe. No se modifica la cuenta corriente ni el IVA hasta entonces.</p>
            <label className="block text-[10px] text-gray-500 font-medium mb-1">Motivo</label>
            <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8]" placeholder="Ej.: error en el monto · cliente equivocado · operación cancelada" />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setMostrarMotivo(false)} className="px-4 py-2 text-xs text-gray-500 hover:text-gray-700">Cancelar</button>
              <button onClick={solicitarAnulacion} disabled={procesando} className="bg-[#E11D48] text-white px-4 py-2 rounded-lg text-xs font-semibold hover:opacity-90 disabled:opacity-40">{procesando ? 'Enviando…' : 'Solicitar anulación'}</button>
            </div>
          </div>
        </div>
      )}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="text-xl font-black font-mono text-[#052698]">{factura.folio ? `#${factura.folio}` : <span className="text-gray-300 text-sm">Sin folio</span>}</div>
              <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${ESTADO_CLS[factura.estado]}`}>{ESTADO_L[factura.estado]}</span>
            </div>
            <div className="text-sm font-semibold text-gray-900">{factura.cliente_razon_social}</div>
            {factura.cliente_rut && <div className="text-xs text-gray-400 font-mono">{factura.cliente_rut}</div>}
            <div className="text-xs text-gray-500 mt-1">{TIPO_DOC_L[factura.tipo_doc] || factura.tipo_doc} · {factura.fecha_emision}</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-black font-mono text-[#052698]">{factura.moneda} {Math.round(factura.total).toLocaleString('es-CL')}</div>
            {factura.total_usd && <div className="text-xs text-gray-400 font-mono mt-0.5">USD {fmt(factura.total_usd, 0)}</div>}
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-4">
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 font-semibold whitespace-nowrap">Folio propio:</span>
            {editandoFolio ? (
              <div className="flex items-center gap-2">
                <input value={folio} onChange={e => setFolio(e.target.value)} type="number" className="w-24 px-2 py-1 border border-[#1168F8] rounded-lg text-xs font-mono text-center focus:outline-none" />
                <button onClick={guardarFolio} disabled={saving} className="px-3 py-1 bg-[#1168F8] text-white rounded-lg text-xs font-bold">{saving ? '...' : '✓'}</button>
                <button onClick={() => setEditandoFolio(false)} className="px-2 py-1 border border-gray-200 rounded-lg text-xs text-gray-500">✕</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-gray-900">{factura.folio || '—'}</span>
                {puedeEditarFE && <button onClick={() => setEditandoFolio(true)} className="text-[10px] text-[#1168F8] hover:underline">{factura.folio ? '✏ Editar' : '+ Asignar folio'}</button>}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 font-semibold whitespace-nowrap">Folio SII:</span>
            {editandoSii ? (
              <div className="flex items-center gap-2">
                <input value={folioSii} onChange={e => setFolioSii(e.target.value)} className="w-32 px-2 py-1 border border-[#1168F8] rounded-lg text-xs font-mono text-center focus:outline-none" placeholder="cód. SII" />
                <button onClick={guardarFolioSii} disabled={saving} className="px-3 py-1 bg-[#1168F8] text-white rounded-lg text-xs font-bold">{saving ? '...' : '✓'}</button>
                <button onClick={() => setEditandoSii(false)} className="px-2 py-1 border border-gray-200 rounded-lg text-xs text-gray-500">✕</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-gray-900">{factura.folio_sii || '—'}</span>
                {puedeEditarFE && <button onClick={() => setEditandoSii(true)} className="text-[10px] text-[#1168F8] hover:underline">{factura.folio_sii ? '✏ Editar' : '+ Cargar folio SII'}</button>}
              </div>
            )}
          </div>
        </div>
        {!factura.folio_sii && <div className="text-[10px] text-amber-600 mt-1.5">⚠ Cargá el folio SII cuando repliques la factura impresa en el portal del SII (carga posterior).</div>}
        {enPendiente && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
              <div className="flex items-center gap-2 text-[#7C3AED] font-semibold text-sm">⏳ {factura.estado === 'pendiente_anulacion' ? 'Anulación pendiente de autorización' : 'Nota de crédito pendiente de autorización'}</div>
              {factura.motivo_anulacion && <div className="text-xs text-violet-700 mt-1">Motivo: {factura.motivo_anulacion}</div>}
              {factura.solicitado_por && <div className="text-[10px] text-violet-500 mt-0.5">Solicitado por {factura.solicitado_por}{factura.solicitado_at ? ` · ${new Date(factura.solicitado_at).toLocaleString('es-AR')}` : ''}</div>}
              {puedeAutorizar ? (
                <div className="flex gap-2 mt-3">
                  <button onClick={autorizar} disabled={procesando} className="bg-[#0a9e6e] text-white px-4 py-2 rounded-lg text-xs font-semibold hover:opacity-90 disabled:opacity-40">✓ Autorizar</button>
                  <button onClick={rechazar} disabled={procesando} className="border-2 border-[#E11D48] text-[#E11D48] px-4 py-2 rounded-lg text-xs font-semibold hover:bg-red-50 disabled:opacity-40">✕ Rechazar</button>
                </div>
              ) : (
                <div className="text-[10px] text-violet-500 mt-2">Un usuario con permiso de autorización debe aprobarla. Hasta entonces no impacta la cuenta corriente ni el IVA.</div>
              )}
            </div>
          </div>
        )}
        {!enPendiente && (
          <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100 flex-wrap">
            {(puedeEditarFE || puedeAnular) && <span className="text-[10px] text-gray-400 self-center">Cambiar estado:</span>}
            {(['emitida','enviada_sii','aceptada_sii','pagada'] as string[]).filter(e => e !== factura.estado).map(e => (
              puedeEditarFE ? <button key={e} onClick={() => cambiarEstado(e)} className={`px-3 py-1 rounded-full text-[10px] font-semibold border ${ESTADO_CLS[e]} hover:opacity-80`}>{ESTADO_L[e]}</button> : null
            ))}
            {factura.estado !== 'anulada' && puedeAnular && !declaradaSii && (
              <button onClick={() => setMostrarMotivo(true)} className="px-3 py-1 rounded-full text-[10px] font-semibold border bg-red-50 text-red-700 border-red-200 hover:opacity-80">Solicitar anulación</button>
            )}
          </div>
        )}
        {!enPendiente && factura.estado !== 'anulada' && declaradaSii && (
          <div className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
            ⚠ Esta factura ya tiene folio SII (declarada). No se anula internamente: emití una <b>nota de crédito</b> que la referencie desde “+ Nueva factura”.
          </div>
        )}
        {factura.estado === 'anulada' && factura.autorizado_por && (
          <div className="text-[10px] text-gray-400 mt-2">Anulada · autorizó {factura.autorizado_por}{factura.autorizado_at ? ` · ${new Date(factura.autorizado_at).toLocaleString('es-AR')}` : ''}{factura.motivo_anulacion ? ` · ${factura.motivo_anulacion}` : ''}</div>
        )}
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-3.5 border-b border-gray-100 font-semibold text-sm text-gray-900">Detalle</div>
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {['Descripción','Cant.','Precio unit.','Neto','IVA','Total'].map(h => (
                <th key={h} className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item: any, i: number) => (
              <tr key={i} className="border-b border-gray-50">
                <td className="px-4 py-2.5 text-gray-800">{item.descripcion}</td>
                <td className="px-4 py-2.5 text-gray-500">{item.cantidad}</td>
                <td className="px-4 py-2.5 font-mono text-gray-600">{Math.round(item.precio_unit || 0).toLocaleString('es-CL')}</td>
                <td className="px-4 py-2.5 font-mono text-gray-600">{Math.round(item.neto || 0).toLocaleString('es-CL')}</td>
                <td className="px-4 py-2.5 font-mono text-amber-700">{Math.round(item.iva_monto || 0).toLocaleString('es-CL')}</td>
                <td className="px-4 py-2.5 font-mono font-bold text-gray-900">{Math.round(item.total || 0).toLocaleString('es-CL')}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 border-t border-gray-200">
              <td colSpan={3} className="px-4 py-2.5 text-xs text-gray-500">
                {factura.neto > 0 && <span>Neto: {Math.round(factura.neto).toLocaleString('es-CL')} · </span>}
                {factura.exento > 0 && <span>Exento: {Math.round(factura.exento).toLocaleString('es-CL')} · </span>}
                {factura.iva_monto > 0 && <span>IVA: {Math.round(factura.iva_monto).toLocaleString('es-CL')}</span>}
              </td>
              <td colSpan={3} className="px-4 py-2.5 text-right">
                <span className="font-mono font-black text-[#052698] text-sm">{factura.moneda} {Math.round(factura.total).toLocaleString('es-CL')}</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {factura.glosa && <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800"><span className="font-semibold">Glosa: </span>{factura.glosa}</div>}

      {/* Comprobante adjunto */}
      {factura.archivo_url && (puede(permisos,'facturas_emitidas','ver') || puede(permisos,'facturas_emitidas','descargar')) && (
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">📄</span>
            <div>
              <div className="text-xs font-semibold text-gray-800">{factura.archivo_nombre || 'Comprobante adjunto'}</div>
              <div className="text-[10px] text-gray-400">Factura / comprobante PDF</div>
            </div>
          </div>
          <div className="flex gap-2">
            {puede(permisos,'facturas_emitidas','ver') && (
              <button onClick={() => abrirArchivo(false)} disabled={abriendo} className="px-3 py-1.5 bg-[#EBF2FF] text-[#1168F8] rounded-lg text-xs font-medium hover:bg-[#93B8FC] disabled:opacity-50">📄 Ver</button>
            )}
            {puede(permisos,'facturas_emitidas','descargar') && (
              <button onClick={() => abrirArchivo(true)} disabled={abriendo} className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50 disabled:opacity-50">⬇ Descargar</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ImpresionFactura({ factura, onBack }: any) {
  const items = Array.isArray(factura.items) ? factura.items : []
  const fmtCLP = (n: number) => Math.round(n).toLocaleString('es-CL')

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #factura-print, #factura-print * { visibility: visible; }
          #factura-print { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          @page { margin: 0; size: A4 portrait; }
          #factura-print * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .factura-page { width: 210mm; min-height: 297mm; padding: 15mm 18mm; box-sizing: border-box; }
        }
      `}</style>
      <div className="no-print flex items-center justify-between mb-4">
        <button onClick={onBack} className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold hover:bg-gray-50">← Volver</button>
        <button onClick={() => { const t = document.title; document.title = `Factura_${factura.folio || 'borrador'}`; window.print(); document.title = t }}
          className="px-5 py-2.5 bg-[#052698] text-white rounded-xl text-sm font-bold hover:bg-[#1168F8]">🖨 Imprimir / Guardar PDF</button>
      </div>
      <div id="factura-print">
        <div className="factura-page bg-white">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',paddingBottom:'12px',marginBottom:'16px',borderBottom:'3px solid #1168F8'}}>
            <div>
              <img src="/logo.png" alt="Puerto NOA SpA" style={{height:'46px',objectFit:'contain'}}/>
              <div style={{marginTop:'8px',fontSize:'10px',color:'#9ca3af',lineHeight:'1.6'}}>Puerto NOA SpA<br/>Logística de importaciones China → NOA<br/>San Salvador de Jujuy, Argentina</div>
            </div>
            <div style={{textAlign:'right',border:'2px solid #1168F8',borderRadius:'8px',padding:'12px 20px',minWidth:'200px'}}>
              <div style={{fontSize:'11px',fontWeight:700,color:'#9ca3af',textTransform:'uppercase',letterSpacing:'1px',marginBottom:'4px'}}>{TIPO_DOC_L[factura.tipo_doc]}</div>
              <div style={{fontSize:'28px',fontWeight:900,fontFamily:'monospace',color:'#052698'}}>N° {factura.folio || '______'}</div>
              <div style={{fontSize:'11px',color:'#6b7280',marginTop:'6px'}}>{factura.fecha_emision}</div>
              {factura.fecha_vencimiento && <div style={{fontSize:'10px',color:'#b45309',marginTop:'2px'}}>Vence: {factura.fecha_vencimiento}</div>}
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px',marginBottom:'20px'}}>
            <div style={{border:'1px solid #e5e7eb',borderRadius:'8px',overflow:'hidden'}}>
              <div style={{padding:'6px 12px',background:'#052698',color:'white',fontSize:'10px',fontWeight:700,letterSpacing:'1px',textTransform:'uppercase'}}>Emisor</div>
              <div style={{padding:'10px 12px',fontSize:'11px'}}>
                <div style={{fontWeight:700,color:'#111827',marginBottom:'4px'}}>Puerto NOA SpA</div>
                <div style={{color:'#6b7280',lineHeight:'1.6'}}>Logística de importaciones<br/>Chile</div>
              </div>
            </div>
            <div style={{border:'1px solid #e5e7eb',borderRadius:'8px',overflow:'hidden'}}>
              <div style={{padding:'6px 12px',background:'#1168F8',color:'white',fontSize:'10px',fontWeight:700,letterSpacing:'1px',textTransform:'uppercase'}}>Cliente / Receptor</div>
              <div style={{padding:'10px 12px',fontSize:'11px'}}>
                <div style={{fontWeight:700,color:'#111827',marginBottom:'4px'}}>{factura.cliente_razon_social}</div>
                <div style={{color:'#6b7280',lineHeight:'1.6'}}>
                  {factura.cliente_rut && <div>RUT/CUIT: <span style={{fontFamily:'monospace'}}>{factura.cliente_rut}</span></div>}
                  {factura.cliente_giro && <div>{factura.cliente_giro}</div>}
                  {factura.cliente_direccion && <div>{factura.cliente_direccion}</div>}
                  {factura.cliente_ciudad && <div>{factura.cliente_ciudad}, {factura.cliente_pais}</div>}
                </div>
              </div>
            </div>
          </div>
          {factura.cotizacion_num && <div style={{background:'#EBF2FF',border:'1px solid #93B8FC',borderRadius:'8px',padding:'8px 12px',marginBottom:'16px',fontSize:'11px',color:'#052698'}}><span style={{fontWeight:700}}>Referencia operación: </span><span style={{fontFamily:'monospace',fontWeight:700}}>{factura.cotizacion_num}</span></div>}
          <div style={{border:'1px solid #e5e7eb',borderRadius:'8px',overflow:'hidden',marginBottom:'16px'}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead>
                <tr style={{background:'#f8fafc'}}>
                  {['N°','Descripción','Cant.','Precio unit.','Descuento',factura.afecta_iva?'Neto':'Exento',factura.afecta_iva?'IVA':'','Total'].filter(Boolean).map(h=>(
                    <th key={h} style={{padding:'8px 10px',fontSize:'9px',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.5px',color:'#9ca3af',borderBottom:'1px solid #e5e7eb',textAlign:h==='Descripción'?'left':'right'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item: any, i: number) => (
                  <tr key={i} style={{borderBottom:'1px solid #f1f5f9'}}>
                    <td style={{padding:'7px 10px',fontSize:'11px',color:'#6b7280',textAlign:'right',width:'30px'}}>{i+1}</td>
                    <td style={{padding:'7px 10px',fontSize:'11px',color:'#111827',fontWeight:500}}>{item.descripcion}</td>
                    <td style={{padding:'7px 10px',fontSize:'11px',color:'#6b7280',textAlign:'right'}}>{item.cantidad}</td>
                    <td style={{padding:'7px 10px',fontSize:'11px',fontFamily:'monospace',color:'#6b7280',textAlign:'right'}}>{fmtCLP(item.precio_unit||0)}</td>
                    <td style={{padding:'7px 10px',fontSize:'11px',color:'#6b7280',textAlign:'right'}}>{item.descuento?`${item.descuento}%`:'—'}</td>
                    <td style={{padding:'7px 10px',fontSize:'11px',fontFamily:'monospace',color:'#374151',textAlign:'right'}}>{fmtCLP(item.exento?(item.exento_monto||0):(item.neto||0))}</td>
                    {factura.afecta_iva&&<td style={{padding:'7px 10px',fontSize:'11px',fontFamily:'monospace',color:'#b45309',textAlign:'right'}}>{fmtCLP(item.iva_monto||0)}</td>}
                    <td style={{padding:'7px 10px',fontSize:'11px',fontFamily:'monospace',fontWeight:700,color:'#111827',textAlign:'right'}}>{fmtCLP(item.total||0)}</td>
                  </tr>
                ))}
                {items.length < 5 && Array.from({length:5-items.length}).map((_,i)=>(
                  <tr key={`e${i}`} style={{borderBottom:'1px solid #f8fafc'}}><td colSpan={8} style={{padding:'7px 10px',color:'#f1f5f9',fontSize:'11px'}}>—</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{display:'flex',justifyContent:'flex-end',marginBottom:'20px'}}>
            <div style={{width:'260px',border:'1px solid #e5e7eb',borderRadius:'8px',overflow:'hidden'}}>
              {factura.neto>0&&<div style={{display:'flex',justifyContent:'space-between',padding:'6px 12px',borderBottom:'1px solid #f1f5f9',fontSize:'11px'}}><span style={{color:'#6b7280'}}>Neto afecto</span><span style={{fontFamily:'monospace',color:'#374151'}}>{fmtCLP(factura.neto)}</span></div>}
              {factura.exento>0&&<div style={{display:'flex',justifyContent:'space-between',padding:'6px 12px',borderBottom:'1px solid #f1f5f9',fontSize:'11px'}}><span style={{color:'#6b7280'}}>Exento</span><span style={{fontFamily:'monospace',color:'#374151'}}>{fmtCLP(factura.exento)}</span></div>}
              {factura.iva_monto>0&&<div style={{display:'flex',justifyContent:'space-between',padding:'6px 12px',borderBottom:'1px solid #f1f5f9',fontSize:'11px',background:'#fffbeb'}}><span style={{color:'#b45309',fontWeight:600}}>IVA {factura.iva_pct}%</span><span style={{fontFamily:'monospace',color:'#b45309',fontWeight:600}}>{fmtCLP(factura.iva_monto)}</span></div>}
              <div style={{display:'flex',justifyContent:'space-between',padding:'10px 12px',background:'#052698',fontSize:'13px',fontWeight:900}}><span style={{color:'white'}}>TOTAL {factura.moneda}</span><span style={{fontFamily:'monospace',color:'white'}}>{fmtCLP(factura.total)}</span></div>
              {factura.total_usd&&<div style={{display:'flex',justifyContent:'space-between',padding:'5px 12px',background:'#EBF2FF',fontSize:'10px'}}><span style={{color:'#052698'}}>Ref. USD</span><span style={{fontFamily:'monospace',color:'#052698',fontWeight:700}}>USD {fmt(factura.total_usd,0)}</span></div>}
            </div>
          </div>
          {factura.glosa&&<div style={{border:'1px solid #fde68a',background:'#fffbeb',borderRadius:'8px',padding:'8px 12px',marginBottom:'16px',fontSize:'11px',color:'#78350f'}}><span style={{fontWeight:700}}>Observaciones: </span>{factura.glosa}</div>}
          <div style={{border:'1px solid #e5e7eb',borderRadius:'8px',padding:'10px 14px',marginBottom:'16px',fontSize:'10px',color:'#6b7280',background:'#f8fafc'}}>
            <div style={{fontWeight:700,color:'#374151',marginBottom:'4px'}}>⚠ Documento modelo para transcripción al portal SII Chile</div>
            Este documento es un borrador de referencia. El documento tributario válido debe ser emitido a través del portal SII Chile.
            {factura.folio&&<div style={{marginTop:'4px',color:'#1168F8',fontWeight:600}}>Folio SII asignado: {factura.folio}</div>}
          </div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',paddingTop:'10px',borderTop:'2px solid #1168F8'}}>
            <img src="/logo.png" alt="Puerto NOA SpA" style={{height:'26px',objectFit:'contain',opacity:0.5}}/>
            <div style={{textAlign:'center',fontSize:'9px',color:'#9ca3af'}}><div style={{fontWeight:700,color:'#374151'}}>Puerto NOA SpA</div><div>Logística China → NOA Argentino</div></div>
            <div style={{textAlign:'right',fontSize:'9px',color:'#9ca3af',fontFamily:'monospace'}}>{factura.folio?`N° ${factura.folio}`:'Borrador'}<br/>{factura.fecha_emision}</div>
          </div>
        </div>
      </div>
    </>
  )
}
