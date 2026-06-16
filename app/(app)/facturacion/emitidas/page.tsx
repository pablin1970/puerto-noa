'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { fmt } from '@/lib/utils'
import Link from 'next/link'

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
}
const ESTADO_L: Record<string, string> = {
  borrador: 'Borrador', emitida: 'Emitida', enviada_sii: 'Enviada SII',
  aceptada_sii: 'Aceptada SII', anulada: 'Anulada', pagada: 'Pagada',
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
      supabase.from('facturas_emitidas').select('*').order('fecha_emision', { ascending: false }),
      supabase.from('terceros').select('id,razon_social,nro_doc,tipo_doc,actividad,dir_fiscal_calle,dir_fiscal_ciudad,pais').contains('tipo', ['cliente']),
      supabase.from('operaciones').select('id,cotizacion:cotizaciones(num,cliente)').order('created_at', { ascending: false }).limit(50),
    ])
    if (fRes.data) setFacturas(fRes.data as FacturaEmitida[])
    if (tRes.data) setTerceros(tRes.data)
    if (oRes.data) setOperaciones(oRes.data)
    setLoading(false)
  }

  const sel = facturas.find(f => f.id === selId)
  const filtradas = facturas.filter(f => {
    const b = buscar.toLowerCase()
    const matchB = !b || f.cliente_razon_social.toLowerCase().includes(b) || String(f.folio || '').includes(b) || (f.cotizacion_num || '').toLowerCase().includes(b)
    return matchB && (!filtroEstado || f.estado === filtroEstado)
  })
  const stats = {
    total: facturas.length,
    emitidas: facturas.filter(f => f.estado === 'emitida').length,
    pendientes: facturas.filter(f => ['emitida','enviada_sii','aceptada_sii'].includes(f.estado)).length,
    totalCLP: facturas.filter(f => f.moneda === 'CLP' && f.estado !== 'anulada').reduce((s, f) => s + f.total, 0),
    totalUSD: facturas.filter(f => f.total_usd && f.estado !== 'anulada').reduce((s, f) => s + (f.total_usd || 0), 0),
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Facturas emitidas</h1>
          <p className="text-xs text-gray-400 mt-0.5">Puerto NOA SpA → Clientes · Modelo SII Chile</p>
        </div>
        <div className="flex gap-2">
          {view !== 'lista' && <button onClick={() => { setView('lista'); setSelId(null) }} className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold hover:bg-gray-100">← Volver</button>}
          {view === 'lista' && <button onClick={() => setView('nueva')} className="px-5 py-2.5 bg-[#1168F8] text-white rounded-xl text-sm font-bold hover:bg-[#0a4fc4] shadow-sm">+ Nueva factura</button>}
          {view === 'detalle' && sel && <button onClick={() => setView('impresion')} className="px-4 py-2 bg-[#052698] text-white rounded-xl text-xs font-bold hover:bg-[#1168F8]">🖨 Imprimir / PDF</button>}
        </div>
      </div>

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
                <button onClick={() => setView('nueva')} className="mt-3 px-4 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold">+ Crear primera factura</button>
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

      {view === 'nueva' && <FormFactura supabase={supabase} currentUser={currentUser} terceros={terceros} operaciones={operaciones} onSave={async () => { await loadData(); setView('lista') }} onCancel={() => setView('lista')} />}
      {view === 'detalle' && sel && <DetalleFactura factura={sel} supabase={supabase} onReload={loadData} onImprimir={() => setView('impresion')} onBack={() => setView('lista')} />}
      {view === 'impresion' && sel && <ImpresionFactura factura={sel} onBack={() => setView('detalle')} />}
    </div>
  )
}

function FormFactura({ supabase, currentUser, terceros, operaciones, onSave, onCancel }: any) {
  const [form, setForm] = useState({
    tipo_doc: 'factura', fecha_emision: new Date().toISOString().slice(0, 10),
    fecha_vencimiento: '', tercero_id: '', cliente_razon_social: '', cliente_rut: '',
    cliente_direccion: '', cliente_ciudad: '', cliente_pais: 'Chile', cliente_giro: '',
    operacion_id: '', cotizacion_num: '', moneda: 'CLP', tc_referencia: '',
    afecta_iva: true, iva_pct: 19, tipo_cobro: 'servicio', discriminar_items: true, glosa: '', notas_internas: '',
  })
  const [items, setItems] = useState([{ descripcion: '', cantidad: 1, precio_unit: 0, descuento: 0, exento: false }])
  const [buscarTercero, setBuscarTercero] = useState('')
  const [showTerceroDD, setShowTerceroDD] = useState(false)
  const [saving, setSaving] = useState(false)
  const [compFile, setCompFile] = useState<File|null>(null)
  const inp = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white'

  function selectTercero(t: any) {
    setForm(f => ({ ...f, tercero_id: t.id, cliente_razon_social: t.razon_social, cliente_rut: t.nro_doc || '', cliente_direccion: t.dir_fiscal_calle || '', cliente_ciudad: t.dir_fiscal_ciudad || '', cliente_pais: t.pais || 'Chile', cliente_giro: t.actividad || '' }))
    setBuscarTercero(t.razon_social); setShowTerceroDD(false)
  }

  function calcItem(item: any) {
    const subtotal = item.cantidad * item.precio_unit * (1 - (item.descuento || 0) / 100)
    const iva = item.exento ? 0 : subtotal * (form.afecta_iva ? form.iva_pct / 100 : 0)
    return { neto: item.exento ? 0 : subtotal, exento: item.exento ? subtotal : 0, iva, total: subtotal + iva }
  }

  const totales = items.reduce((acc, item) => { const c = calcItem(item); return { neto: acc.neto + c.neto, exento: acc.exento + c.exento, iva: acc.iva + c.iva, total: acc.total + c.total } }, { neto: 0, exento: 0, iva: 0, total: 0 })

  async function guardar() {
    if (!form.cliente_razon_social) { alert('Ingresá el cliente'); return }
    if (items.filter(i => i.descripcion && i.precio_unit > 0).length === 0) { alert('Agregá al menos un ítem'); return }
    setSaving(true)
    const itemsLimpios = items.filter(i => i.descripcion).map(i => { const c = calcItem(i); return { ...i, neto: c.neto, iva_monto: c.iva, exento_monto: c.exento, total: c.total } })
    const tcRef = parseFloat(form.tc_referencia as any) || null
    const { data: factData } = await (supabase.from('facturas_emitidas') as any).insert({
      ...form, tc_referencia: tcRef, iva_pct: form.iva_pct, items: itemsLimpios,
      neto: Math.round(totales.neto), iva_monto: Math.round(totales.iva),
      exento: Math.round(totales.exento), total: Math.round(totales.total),
      total_usd: tcRef ? totales.total / tcRef : null, estado: 'borrador',
      creado_por: currentUser?.nombre, creado_por_id: currentUser?.id,
    }).select('id').single()
    if (factData && compFile) {
      const ext = compFile.name.split('.').pop()
      const path = `facturas-emitidas/${factData.id}.${ext}`
      await supabase.storage.from('comprobantes').upload(path, compFile, { upsert: true })
      const { data: urlData } = supabase.storage.from('comprobantes').getPublicUrl(path)
      if (urlData?.publicUrl) {
        await (supabase.from('facturas_emitidas') as any).update({ archivo_url: urlData.publicUrl, archivo_nombre: compFile.name }).eq('id', factData.id)
      }
    }
    setCompFile(null)
    await onSave(); setSaving(false)
  }

  const fmtCLP = (n: number) => Math.round(n).toLocaleString('es-CL')

  return (
    <div className="max-w-4xl space-y-4">
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <h3 className="font-bold text-sm text-gray-900 mb-4">Datos del documento</h3>
        <div className="grid grid-cols-4 gap-3">
          <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Tipo documento</label>
            <select value={form.tipo_doc} onChange={e => setForm(f => ({ ...f, tipo_doc: e.target.value, afecta_iva: e.target.value !== 'factura_exenta' }))} className={inp}>
              {Object.entries(TIPO_DOC_L).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></div>
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
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <h3 className="font-bold text-sm text-gray-900 mb-4">Cliente</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 relative">
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Razón social *</label>
            <input value={buscarTercero || form.cliente_razon_social}
              onChange={e => { setBuscarTercero(e.target.value); setForm(f => ({ ...f, cliente_razon_social: e.target.value, tercero_id: '' })); setShowTerceroDD(e.target.value.length > 1) }}
              onFocus={() => { if ((buscarTercero || form.cliente_razon_social).length > 1) setShowTerceroDD(true) }}
              className={inp} placeholder="Buscar o ingresar cliente..." />
            {showTerceroDD && (
              <div className="absolute z-50 top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl max-h-40 overflow-y-auto mt-1">
                {terceros.filter((t: any) => t.razon_social.toLowerCase().includes((buscarTercero || form.cliente_razon_social).toLowerCase())).slice(0, 6).map((t: any) => (
                  <button key={t.id} onMouseDown={() => selectTercero(t)} className="w-full text-left px-4 py-2.5 hover:bg-[#EBF2FF] border-b border-gray-50 last:border-0">
                    <div className="font-semibold text-xs text-gray-900">{t.razon_social}</div>
                    {t.nro_doc && <div className="text-[10px] text-gray-400 font-mono">{t.tipo_doc}: {t.nro_doc}</div>}
                  </button>
                ))}
              </div>
            )}
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
            {form.tipo_doc !== 'factura_exenta' && (
              <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" checked={form.afecta_iva} onChange={e => setForm(f => ({ ...f, afecta_iva: e.target.checked }))} />
                Aplica IVA {form.iva_pct}%
              </label>
            )}
          </div>
        </div>
        <table className="w-full text-xs mb-3">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {['Descripción','Cant.','Precio unit.','Desc. %','Exento','Total',''].map(h => (
                <th key={h} className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => {
              const c = calcItem(item)
              return (
                <tr key={i} className="border-b border-gray-50">
                  <td className="px-2 py-2"><input value={item.descripcion} onChange={e => { const n = [...items]; n[i] = { ...n[i], descripcion: e.target.value }; setItems(n) }} className="w-full px-2 py-1.5 border border-transparent rounded-lg hover:border-gray-200 focus:border-[#1168F8] focus:outline-none text-xs" placeholder="Descripción..." /></td>
                  <td className="px-2 py-2"><input type="number" value={item.cantidad} onChange={e => { const n = [...items]; n[i] = { ...n[i], cantidad: parseFloat(e.target.value) || 1 }; setItems(n) }} className="w-full px-2 py-1.5 border border-transparent rounded-lg hover:border-gray-200 focus:border-[#1168F8] focus:outline-none text-xs text-right" /></td>
                  <td className="px-2 py-2"><input type="text" inputMode="decimal" value={item.precio_unit || ''} onFocus={e => e.target.select()} onChange={e => { const n = [...items]; n[i] = { ...n[i], precio_unit: parseFloat(e.target.value.replace(/\./g, '').replace(',', '.')) || 0 }; setItems(n) }} className="w-full px-2 py-1.5 border border-transparent rounded-lg hover:border-gray-200 focus:border-[#1168F8] focus:outline-none text-xs text-right font-mono" /></td>
                  <td className="px-2 py-2"><input type="number" value={item.descuento} onChange={e => { const n = [...items]; n[i] = { ...n[i], descuento: parseFloat(e.target.value) || 0 }; setItems(n) }} className="w-full px-2 py-1.5 border border-transparent rounded-lg hover:border-gray-200 focus:border-[#1168F8] focus:outline-none text-xs text-right" min="0" max="100" /></td>
                  <td className="px-2 py-2 text-center"><input type="checkbox" checked={item.exento} onChange={e => { const n = [...items]; n[i] = { ...n[i], exento: e.target.checked }; setItems(n) }} /></td>
                  <td className="px-2 py-2 text-right font-mono font-bold text-gray-800">{fmtCLP(c.total)}</td>
                  <td className="px-2 py-2">{items.length > 1 && <button onClick={() => setItems(items.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-500 text-xs">✕</button>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <button onClick={() => setItems([...items, { descripcion: '', cantidad: 1, precio_unit: 0, descuento: 0, exento: false }])} className="text-xs text-[#1168F8] hover:underline">+ Agregar ítem</button>
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
    </div>
  )
}

function DetalleFactura({ factura, supabase, onReload, onImprimir, onBack }: any) {
  const [editandoFolio, setEditandoFolio] = useState(false)
  const [folio, setFolio] = useState(String(factura.folio || ''))
  const [saving, setSaving] = useState(false)

  async function guardarFolio() {
    setSaving(true)
    await (supabase.from('facturas_emitidas') as any).update({ folio: parseInt(folio) || null, estado: parseInt(folio) ? 'emitida' : factura.estado }).eq('id', factura.id)
    await onReload(); setEditandoFolio(false); setSaving(false)
  }

  async function cambiarEstado(estado: string) {
    await (supabase.from('facturas_emitidas') as any).update({ estado }).eq('id', factura.id)
    await onReload()
  }

  const fmtCLP = (n: number) => Math.round(n).toLocaleString('es-CL')
  const items = Array.isArray(factura.items) ? factura.items : []

  return (
    <div className="max-w-3xl space-y-4">
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="text-xl font-black font-mono text-[#052698]">{factura.folio ? `#${factura.folio}` : <span className="text-gray-300 text-sm">Sin folio SII</span>}</div>
              <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${ESTADO_CLS[factura.estado]}`}>{ESTADO_L[factura.estado]}</span>
            </div>
            <div className="text-sm font-semibold text-gray-900">{factura.cliente_razon_social}</div>
            {factura.cliente_rut && <div className="text-xs text-gray-400 font-mono">{factura.cliente_rut}</div>}
            <div className="text-xs text-gray-500 mt-1">{TIPO_DOC_L[factura.tipo_doc]} · {factura.fecha_emision}</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-black font-mono text-[#052698]">{factura.moneda} {Math.round(factura.total).toLocaleString('es-CL')}</div>
            {factura.total_usd && <div className="text-xs text-gray-400 font-mono mt-0.5">USD {fmt(factura.total_usd, 0)}</div>}
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 font-semibold">Folio SII:</span>
            {editandoFolio ? (
              <div className="flex items-center gap-2">
                <input value={folio} onChange={e => setFolio(e.target.value)} type="number" className="w-24 px-2 py-1 border border-[#1168F8] rounded-lg text-xs font-mono text-center focus:outline-none" />
                <button onClick={guardarFolio} disabled={saving} className="px-3 py-1 bg-[#1168F8] text-white rounded-lg text-xs font-bold">{saving ? '...' : '✓'}</button>
                <button onClick={() => setEditandoFolio(false)} className="px-2 py-1 border border-gray-200 rounded-lg text-xs text-gray-500">✕</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-gray-900">{factura.folio || '—'}</span>
                <button onClick={() => setEditandoFolio(true)} className="text-[10px] text-[#1168F8] hover:underline">{factura.folio ? '✏ Editar' : '+ Ingresar folio SII'}</button>
              </div>
            )}
          </div>
          {!factura.folio && <div className="text-[10px] text-amber-600 mt-1.5">⚠ Ingresá el folio una vez que hayas emitido la factura en el portal SII</div>}
        </div>
        <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100 flex-wrap">
          <span className="text-[10px] text-gray-400 self-center">Cambiar estado:</span>
          {(['emitida','enviada_sii','aceptada_sii','pagada','anulada'] as string[]).filter(e => e !== factura.estado).map(e => (
            <button key={e} onClick={() => cambiarEstado(e)} className={`px-3 py-1 rounded-full text-[10px] font-semibold border ${ESTADO_CLS[e]} hover:opacity-80`}>{ESTADO_L[e]}</button>
          ))}
        </div>
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
      {factura.archivo_url && (
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">📄</span>
            <div>
              <div className="text-xs font-semibold text-gray-800">{factura.archivo_nombre || 'Comprobante adjunto'}</div>
              <div className="text-[10px] text-gray-400">Factura / comprobante PDF</div>
            </div>
          </div>
          <div className="flex gap-2">
            <a href={factura.archivo_url} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-[#EBF2FF] text-[#1168F8] rounded-lg text-xs font-medium hover:bg-[#93B8FC]">📄 Ver</a>
            <a href={factura.archivo_url} download={factura.archivo_nombre || 'factura'} className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50">⬇ Descargar</a>
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
