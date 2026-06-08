'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { fmt } from '@/lib/utils'

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
  tipo_gasto: string
  a_recuperar: boolean
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

  useEffect(() => { loadUser(); loadData() }, [])

  async function loadUser() {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return
    const { data: u } = await supabase.from('usuarios').select('*').eq('auth_id', auth.user.id).single()
    if (u) setCurrentUser(u)
  }

  async function loadData() {
    setLoading(true)
    const [fRes, tRes, oRes] = await Promise.all([
      supabase.from('facturas_recibidas').select('*').order('fecha_emision', { ascending: false }),
      supabase.from('terceros').select('id,razon_social,nro_doc,tipo_doc,pais').contains('tipo', ['proveedor']),
      supabase.from('operaciones').select('id,cotizacion:cotizaciones(num,cliente)').order('created_at', { ascending: false }).limit(50),
    ])
    if (fRes.data) setFacturas(fRes.data as FacturaRecibida[])
    if (tRes.data) setTerceros(tRes.data)
    if (oRes.data) setOperaciones(oRes.data)
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
          {view === 'lista' && (
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
                <button onClick={() => setView('nueva')} className="mt-3 px-4 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold">+ Registrar primera</button>
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
          onSave={async () => { await loadData(); setView('lista') }}
          onCancel={() => setView('lista')}
        />
      )}

      {view === 'detalle' && sel && (
        <DetalleFacturaRecibida
          factura={sel} supabase={supabase}
          onReload={async () => { await loadData() }}
          onBack={() => setView('lista')}
        />
      )}
    </div>
  )
}

function FormFacturaRecibida({ supabase, currentUser, terceros, operaciones, onSave, onCancel }: any) {
  const [form, setForm] = useState({
    tipo_doc: 'factura',
    folio: '',
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
    tipo_gasto: 'operacional',
    a_recuperar: true,
  })
  const [items, setItems] = useState([{ descripcion: '', cantidad: 1, precio_unit: 0, exento: false }])
  const [buscarProv, setBuscarProv] = useState('')
  const [showProvDD, setShowProvDD] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [docUrl, setDocUrl] = useState('')
  const [docNombre, setDocNombre] = useState('')
  const inp = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white'
  const fmtCLP = (n: number) => Math.round(n).toLocaleString('es-CL')

  function selectProveedor(t: any) {
    setForm(f => ({ ...f, tercero_id: t.id, proveedor_razon_social: t.razon_social, proveedor_rut: t.nro_doc || '', proveedor_pais: t.pais || 'Chile' }))
    setBuscarProv(t.razon_social); setShowProvDD(false)
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
    const { data } = supabase.storage.from('facturas').getPublicUrl(path)
    if (data?.publicUrl) { setDocUrl(data.publicUrl); setDocNombre(file.name) }
    setUploadingDoc(false)
  }

  async function guardar() {
    if (!form.proveedor_razon_social) { alert('Ingresá el proveedor'); return }
    setSaving(true)
    const tcRef = parseFloat(form.tc_referencia as any) || null
    const itemsLimpios = items.filter(i => i.descripcion).map(i => { const c = calcItem(i); return { ...i, neto: c.neto, iva_monto: c.iva, total: c.total } })
    await (supabase.from('facturas_recibidas') as any).insert({
      ...form, tc_referencia: tcRef,
      items: itemsLimpios,
      neto: Math.round(totales.neto), iva_monto: Math.round(totales.iva),
      exento: Math.round(totales.exento), total: Math.round(totales.total),
      credito_fiscal: form.afecta_iva ? Math.round(totales.iva) : 0,
      total_usd: tcRef ? totales.total / tcRef : null,
      estado: 'recibida',
      archivo_url: docUrl || null, archivo_nombre: docNombre || null,
      creado_por: currentUser?.nombre, creado_por_id: currentUser?.id,
    })
    await onSave()
    setSaving(false)
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <h3 className="font-bold text-sm text-gray-900 mb-4">Datos del documento recibido</h3>
        <div className="grid grid-cols-4 gap-3">
          <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Tipo</label>
            <select value={form.tipo_doc} onChange={e => setForm(f => ({ ...f, tipo_doc: e.target.value, afecta_iva: e.target.value !== 'factura_exenta' }))} className={inp}>
              {Object.entries(TIPO_DOC_L).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Folio proveedor</label>
            <input value={form.folio} onChange={e => setForm(f => ({ ...f, folio: e.target.value }))} className={inp} placeholder="N° factura" />
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
              onChange={e => { setBuscarProv(e.target.value); setForm(f => ({ ...f, proveedor_razon_social: e.target.value, tercero_id: '' })); setShowProvDD(e.target.value.length > 1) }}
              className={inp} placeholder="Buscar o ingresar proveedor..." />
            {showProvDD && (
              <div className="absolute z-50 top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl max-h-40 overflow-y-auto mt-1">
                {terceros.filter((t: any) => t.razon_social.toLowerCase().includes((buscarProv || form.proveedor_razon_social).toLowerCase())).slice(0, 6).map((t: any) => (
                  <button key={t.id} onMouseDown={() => selectProveedor(t)} className="w-full text-left px-4 py-2.5 hover:bg-[#EBF2FF] border-b border-gray-50 last:border-0">
                    <div className="font-semibold text-xs text-gray-900">{t.razon_social}</div>
                    {t.nro_doc && <div className="text-[10px] text-gray-400 font-mono">{t.tipo_doc}: {t.nro_doc}</div>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">RUT / CUIT</label>
            <input value={form.proveedor_rut} onChange={e => setForm(f => ({ ...f, proveedor_rut: e.target.value }))} className={inp} />
          </div>
          <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">País emisor</label>
            <select value={form.proveedor_pais} onChange={e => setForm(f => ({ ...f, proveedor_pais: e.target.value }))} className={inp}>
              {['Chile', 'Argentina', 'China', 'Bolivia', 'Perú', 'Otro'].map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Operación vinculada</label>
            <select value={form.operacion_id} onChange={e => setForm(f => ({ ...f, operacion_id: e.target.value }))} className={inp}>
              <option value="">Sin vincular</option>
              {operaciones.map((o: any) => <option key={o.id} value={o.id}>{o.cotizacion?.num} · {o.cotizacion?.cliente}</option>)}
            </select>
          </div>
          <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Tipo de gasto</label>
            <select value={form.tipo_gasto} onChange={e => setForm(f => ({ ...f, tipo_gasto: e.target.value }))} className={inp}>
              <option value="operacional">Operacional (logística)</option>
              <option value="recupero">Recupero al cliente</option>
              <option value="administrativo">Administrativo</option>
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer pb-2">
              <input type="checkbox" checked={form.a_recuperar} onChange={e => setForm(f => ({ ...f, a_recuperar: e.target.checked }))} className="w-4 h-4 rounded" />
              <span className="text-xs text-gray-600 font-medium">Se refactura al cliente</span>
            </label>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-sm text-gray-900">Detalle</h3>
          {form.tipo_doc !== 'factura_exenta' && (
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
              <input type="checkbox" checked={form.afecta_iva} onChange={e => setForm(f => ({ ...f, afecta_iva: e.target.checked }))} />
              Aplica IVA {form.iva_pct}% (crédito fiscal)
            </label>
          )}
        </div>
        <table className="w-full text-xs mb-3">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {['Descripción', 'Cant.', 'Precio unit.', 'Exento', 'Total'].map(h => (
                <th key={h} className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase">{h}</th>
              ))}
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => {
              const c = calcItem(item)
              return (
                <tr key={i} className="border-b border-gray-50">
                  <td className="px-2 py-2">
                    <input value={item.descripcion} onChange={e => { const n = [...items]; n[i] = { ...n[i], descripcion: e.target.value }; setItems(n) }}
                      className="w-full px-2 py-1.5 border border-transparent rounded-lg hover:border-gray-200 focus:border-[#1168F8] focus:outline-none text-xs" placeholder="Descripción..." />
                  </td>
                  <td className="px-2 py-2 w-16">
                    <input type="number" value={item.cantidad} onChange={e => { const n = [...items]; n[i] = { ...n[i], cantidad: parseFloat(e.target.value) || 1 }; setItems(n) }}
                      className="w-full px-2 py-1.5 border border-transparent rounded-lg hover:border-gray-200 focus:border-[#1168F8] focus:outline-none text-xs text-right" />
                  </td>
                  <td className="px-2 py-2 w-28">
                    <input type="text" inputMode="decimal" value={item.precio_unit || ''} onFocus={e => e.target.select()}
                      onChange={e => { const n = [...items]; n[i] = { ...n[i], precio_unit: parseFloat(e.target.value.replace(/\./g, '').replace(',', '.')) || 0 }; setItems(n) }}
                      className="w-full px-2 py-1.5 border border-transparent rounded-lg hover:border-gray-200 focus:border-[#1168F8] focus:outline-none text-xs text-right font-mono" />
                  </td>
                  <td className="px-2 py-2 w-16 text-center">
                    <input type="checkbox" checked={item.exento} onChange={e => { const n = [...items]; n[i] = { ...n[i], exento: e.target.checked }; setItems(n) }} />
                  </td>
                  <td className="px-2 py-2 w-28 text-right font-mono font-bold text-gray-800">{fmtCLP(c.total)}</td>
                  <td className="px-2 py-2">
                    {items.length > 1 && <button onClick={() => setItems(items.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-500 text-xs">✕</button>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <button onClick={() => setItems([...items, { descripcion: '', cantidad: 1, precio_unit: 0, exento: false }])} className="text-xs text-[#1168F8] hover:underline">+ Agregar ítem</button>
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
        {docUrl ? (
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-700">📎 {docNombre}</span>
            <a href={docUrl} target="_blank" className="text-xs text-[#1168F8] hover:underline">Ver</a>
            <button onClick={() => { setDocUrl(''); setDocNombre('') }} className="text-xs text-red-500">✕ Quitar</button>
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
    </div>
  )
}

function DetalleFacturaRecibida({ factura, supabase, onReload, onBack }: any) {
  const fmtCLP = (n: number) => Math.round(n).toLocaleString('es-CL')
  const items = Array.isArray(factura.items) ? factura.items : []

  async function cambiarEstado(estado: string) {
    await (supabase.from('facturas_recibidas') as any).update({ estado }).eq('id', factura.id)
    await onReload()
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
            </div>
            <div className="text-sm font-semibold text-gray-900">{factura.proveedor_razon_social}</div>
            <div className="text-xs text-gray-500 mt-1">{TIPO_DOC_L[factura.tipo_doc]} · {factura.fecha_emision} · {factura.proveedor_pais}</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-black font-mono text-gray-900">{factura.moneda} {fmtCLP(factura.total)}</div>
            {factura.credito_fiscal > 0 && (
              <div className="text-xs text-green-700 font-semibold mt-1">CF IVA: $ {fmtCLP(factura.credito_fiscal)}</div>
            )}
          </div>
        </div>
        <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100 flex-wrap">
          <span className="text-[10px] text-gray-400 self-center">Estado:</span>
          {(['recibida', 'contabilizada', 'pagada', 'anulada'] as string[]).filter(e => e !== factura.estado).map(e => (
            <button key={e} onClick={() => cambiarEstado(e)}
              className={`px-3 py-1 rounded-full text-[10px] font-semibold border ${ESTADO_CLS[e]} hover:opacity-80`}>
              {ESTADO_L[e]}
            </button>
          ))}
        </div>
      </div>

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
      {factura.archivo_url && (
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex items-center gap-3">
          <span className="text-xs text-gray-600 font-medium">📎 Documento adjunto:</span>
          <a href={factura.archivo_url} target="_blank" className="text-xs text-[#1168F8] hover:underline font-medium">{factura.archivo_nombre || 'Ver archivo'}</a>
        </div>
      )}
    </div>
  )
}
