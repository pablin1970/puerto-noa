'use client'
import { useEffect, useState, Suspense, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { fmt, ETAPAS_L, ETAPAS_ORD, nowDate } from '@/lib/utils'
import type { Cotizacion, Operacion, Gasto, MinutaItem, EtapaGasto, Moneda } from '@/types'
import { useSearchParams } from 'next/navigation'

type Tab = 'resumen' | 'gastos' | 'comparativo' | 'cc' | 'minuta' | 'documentos'

const TIPOS_MOV_CC = [
  { key: 'ingreso_cliente',      label: 'Ingreso cliente',       icon: '⬇', color: 'text-green-700', bg: 'bg-green-50',  border: 'border-green-200' },
  { key: 'pago_proveedor',       label: 'Pago proveedor',        icon: '⬆', color: 'text-red-600',   bg: 'bg-red-50',    border: 'border-red-200' },
  { key: 'honorarios_puertonoa', label: 'Honorarios Puerto NOA', icon: '★', color: 'text-[#052698]', bg: 'bg-[#EBF2FF]', border: 'border-[#93B8FC]' },
]

function OperacionesContent() {
  const searchParams = useSearchParams()
  const cotId = searchParams.get('cot')
  const [ops, setOps] = useState<Array<Operacion & { cotizacion: Cotizacion }>>([])
  const [selId, setSelId] = useState<string>('')
  const [tab, setTab] = useState<Tab>('resumen')
  const [loading, setLoading] = useState(true)
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data } = await supabase
      .from('operaciones')
      .select('*, cotizacion:cotizaciones(*)')
      .order('created_at', { ascending: false })
    if (data && data.length) {
      setOps(data as any)
      const preferred = cotId ? data.find((o: any) => o.cotizacion_id === cotId) : null
      setSelId(preferred ? (preferred as any).id : (data[0] as any).id)
    }
    setLoading(false)
  }

  const op = ops.find(o => o.id === selId)
  const cot = op?.cotizacion

  if (loading) return <div className="p-8 text-gray-400 text-sm">Cargando...</div>
  if (!ops.length) return (
    <div className="p-8 text-center">
      <p className="text-gray-500 text-sm mb-3">No hay operaciones activas.</p>
      <p className="text-xs text-gray-400">Las operaciones se crean automáticamente cuando una cotización pasa a estado <strong>Aceptada</strong>.</p>
    </div>
  )

  return (
    <div className="p-6">
      <div className="mb-5 flex items-center gap-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Seguimiento de operaciones</h1>
          <p className="text-xs text-gray-400 mt-0.5">Módulo 3 — Costos reales y cuenta corriente</p>
        </div>
        <select value={selId} onChange={e => setSelId(e.target.value)}
          className="ml-auto px-3 py-2 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:border-[#1168F8]">
          {ops.map(o => <option key={o.id} value={o.id}>{o.cotizacion?.num} — {o.cotizacion?.cliente}</option>)}
        </select>
      </div>
      {op && cot && <OperacionDetail op={op} cot={cot} tab={tab} setTab={setTab} reload={loadData} />}
    </div>
  )
}

function OperacionDetail({ op, cot, tab, setTab, reload }: {
  op: Operacion & { cotizacion: Cotizacion }
  cot: Cotizacion
  tab: Tab
  setTab: (t: Tab) => void
  reload: () => void
}) {
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [movs, setMovs] = useState<any[]>([])
  const [minuta, setMinuta] = useState<MinutaItem[]>([])
  const [docs, setDocs] = useState<any[]>([])
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => { loadDetail() }, [op.id])

  async function loadDetail() {
    const [g, m, mi, d] = await Promise.all([
      supabase.from('gastos').select('*').eq('operacion_id', op.id).order('fecha'),
      // ── OPCION A: leer de fondos_movimientos filtrado por operacion_id ──
      supabase.from('fondos_movimientos')
        .select('*, cuenta:fondos_cuentas!fondos_movimientos_cuenta_id_fkey(nombre,tipo,moneda,pais)')
        .eq('operacion_id', op.id)
        .neq('tipo', 'transferencia')
        .order('fecha'),
      supabase.from('minuta_items').select('*').eq('operacion_id', op.id),
      supabase.from('operacion_documentos').select('*').eq('operacion_id', op.id).order('created_at'),
    ])
    if (g.data) setGastos(g.data as Gasto[])
    if (m.data) setMovs(m.data)
    if (mi.data) setMinuta(mi.data as MinutaItem[])
    if (d.data) setDocs(d.data as any[])
  }

  const presup = Array.isArray(cot.presupuesto) ? cot.presupuesto : []
  const totalPresup = presup.reduce((s: number, i: any) => s + i.usd, 0)
  const totalReal = gastos.reduce((s, g) => s + g.usd, 0)
  const totalIng = movs.filter(m => m.tipo === 'ingreso_cliente').reduce((s, m) => s + m.usd, 0)
  const totalEg = movs.filter(m => m.tipo !== 'ingreso_cliente').reduce((s, m) => s + m.usd, 0)
  const saldo = totalIng - totalEg
  const diff = totalReal - totalPresup
  const pct = totalPresup > 0 ? Math.min(totalReal / totalPresup * 100, 150) : 0

  const TABS: { key: Tab; label: string }[] = [
    { key: 'resumen',     label: 'Resumen' },
    { key: 'gastos',      label: 'Gastos reales' },
    { key: 'comparativo', label: 'Presup. vs. Real' },
    { key: 'cc',          label: 'Cuenta corriente' },
    { key: 'minuta',      label: 'Minuta de pago' },
    { key: 'documentos',  label: '📁 Documentos' },
  ]

  return (
    <>
      <div className="flex gap-2 mb-5 flex-wrap">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${tab === t.key ? 'bg-[#1168F8] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'resumen' && (
        <div>
          <div className="grid grid-cols-4 gap-3 mb-5">
            {[
              { label: 'Presupuestado',   value: `USD ${fmt(totalPresup, 0)}`, color: 'text-gray-900' },
              { label: 'Gastado real',    value: `USD ${fmt(totalReal, 0)}`,   color: pct > 110 ? 'text-red-600' : 'text-gray-900' },
              { label: 'Saldo cliente',   value: `USD ${fmt(saldo, 0)}`,       color: saldo >= 0 ? 'text-green-700' : 'text-red-600' },
              { label: 'Pendiente pago',  value: `USD ${fmt(gastos.filter(g => g.estado !== 'pagado').reduce((s, g) => s + g.usd, 0), 0)}`, color: 'text-amber-600' },
            ].map(s => (
              <div key={s.label} className="bg-white border border-gray-100 rounded-xl p-4">
                <div className={`text-xl font-semibold ${s.color}`}>{s.value}</div>
                <div className="text-[10px] text-gray-400 mt-1">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-5 mb-4">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
              <span>Ejecución presupuestaria</span><span>{fmt(pct, 1)}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-4">
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: pct > 110 ? '#A32D2D' : pct > 90 ? '#EF9F27' : '#1168F8' }} />
            </div>
            <div className={`text-xs px-3 py-2 rounded-lg ${pct > 110 ? 'bg-red-50 text-red-700' : pct > 90 ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'}`}>
              {pct > 110 ? `⚠ Los costos reales superan el presupuesto en USD ${fmt(Math.abs(diff), 0)} (${fmt(pct, 1)}% ejecutado)` :
                pct > 90 ? `Los costos están cerca del presupuesto (${fmt(pct, 1)}% ejecutado). Monitorear.` :
                  `✓ Operación dentro del presupuesto (${fmt(pct, 1)}% ejecutado).`}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <div className="text-[10px] text-gray-400 mb-1">Variación vs presupuesto</div>
              <div className={`text-lg font-semibold ${diff > 0 ? 'text-red-600' : diff < 0 ? 'text-green-700' : 'text-gray-900'}`}>
                {diff > 0 ? '+ ' : ''}USD {fmt(diff, 0)}
              </div>
              <div className={`text-[10px] mt-1 ${diff > 0 ? 'text-red-500' : diff < 0 ? 'text-green-600' : 'text-gray-400'}`}>
                {diff > 0 ? 'por encima del presupuesto' : diff < 0 ? 'por debajo del presupuesto' : 'en presupuesto'}
              </div>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <div className="text-[10px] text-gray-400 mb-1">Gastos registrados</div>
              <div className="text-lg font-semibold text-gray-900">{gastos.length}</div>
              <div className="text-[10px] text-gray-400 mt-1">{gastos.filter(g => g.estado === 'pagado').length} pagados · {gastos.filter(g => g.estado !== 'pagado').length} pendientes</div>
            </div>
            <div className={`border rounded-xl p-4 ${saldo >= 0 ? 'bg-[#EBF2FF] border-[#93B8FC]' : 'bg-red-50 border-red-200'}`}>
              <div className={`text-[10px] font-medium mb-1 ${saldo >= 0 ? 'text-[#052698]' : 'text-red-700'}`}>Saldo fondos cliente</div>
              <div className={`text-lg font-semibold ${saldo >= 0 ? 'text-[#052698]' : 'text-red-700'}`}>USD {fmt(saldo, 0)}</div>
              <div className={`text-[10px] mt-1 ${saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>{saldo < 0 ? '⚠ Solicitar fondos al cliente' : saldo === 0 ? 'Exacto' : 'Fondos disponibles'}</div>
            </div>
          </div>
        </div>
      )}

      {tab === 'gastos'      && <GastosTab opId={op.id} cot={cot} gastos={gastos} reload={loadDetail} />}
      {tab === 'comparativo' && <ComparativoTab presup={presup} gastos={gastos} />}
      {tab === 'cc'          && <CCTab opId={op.id} cot={cot} movs={movs} reload={loadDetail} />}
      {tab === 'minuta'      && <MinutaTab opId={op.id} cotNum={cot.num || ''} cliente={cot.cliente} minuta={minuta} reload={loadDetail} />}
      {tab === 'documentos'  && <DocumentosTab opId={op.id} docs={docs} reload={loadDetail} />}
    </>
  )
}

// ── GASTOS TAB ─────────────────────────────────────────────────
function GastosTab({ opId, cot, gastos, reload }: { opId: string; cot: Cotizacion; gastos: Gasto[]; reload: () => void }) {
  const supabase = useMemo(() => createClient(), [])
  const [form, setForm] = useState({ etapa: 'maritimo', fecha: nowDate(), estado: 'pendiente', moneda: 'USD', monto: '', tc: '', ref: '', notas: '', factura_a_nombre_cliente: false })
  const [modoProveedor, setModoProveedor] = useState<'base' | 'externo'>('base')
  const [buscarProv, setBuscarProv] = useState('')
  const [terceros, setTerceros] = useState<any[]>([])
  const [provSelId, setProvSelId] = useState<string | null>(null)
  const [provSelNombre, setProvSelNombre] = useState('')
  const [showDrop, setShowDrop] = useState(false)
  const [provExterno, setProvExterno] = useState('')
  const [facturasPropia, setFacturasPropia] = useState<any[]>([])
  const [showImportarFac, setShowImportarFac] = useState(false)
  const [compFile, setCompFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [previewModal, setPreviewModal] = useState<{ url: string; nombre: string; tipo: string } | null>(null)

  useEffect(() => { loadTerceros(); loadFacturasPropia() }, [])

  async function loadTerceros() {
    const { data } = await supabase.from('terceros').select('id,razon_social,nombre_fantasia').eq('activo', 'true').contains('tipo', ['proveedor']).order('razon_social')
    if (data) setTerceros(data)
  }

  async function loadFacturasPropia() {
    const { data } = await supabase.from('facturas_emitidas').select('id,numero,fecha,total,estado').eq('operacion_id', opId).order('fecha', { ascending: false })
    if (data) setFacturasPropia(data)
  }

  const provsFiltrados = terceros.filter(t =>
    !buscarProv || t.razon_social.toLowerCase().includes(buscarProv.toLowerCase()) ||
    (t.nombre_fantasia || '').toLowerCase().includes(buscarProv.toLowerCase())
  ).slice(0, 8)

  function seleccionarProv(t: any) { setProvSelId(t.id); setProvSelNombre(t.razon_social); setBuscarProv(t.razon_social); setShowDrop(false) }
  function limpiarProv() { setProvSelId(null); setProvSelNombre(''); setBuscarProv('') }

  async function cargar() {
    if (!form.monto) return
    const nombreProv = modoProveedor === 'base' ? provSelNombre : provExterno
    if (!nombreProv) { alert('Ingresá el proveedor'); return }
    setUploading(true)
    const monto = parseFloat(form.monto), tc = parseFloat(form.tc) || 1
    const usd = form.moneda === 'USD' ? monto : monto / tc
    const { data: gastoData } = await (supabase.from('gastos') as any).insert({
      operacion_id: opId, fecha: form.fecha, etapa: form.etapa as EtapaGasto,
      concepto: nombreProv, moneda: form.moneda as Moneda, monto, tc, usd,
      estado: form.estado as any, ref: form.ref, notas: form.notas,
      tercero_id: modoProveedor === 'base' ? provSelId : null,
      proveedor_externo: modoProveedor === 'externo' ? provExterno : null,
      factura_a_nombre_cliente: form.factura_a_nombre_cliente, es_factura_propia: false,
    }).select('id').single()
    if (gastoData && compFile) {
      const ext = compFile.name.split('.').pop()
      const path = `gastos/${gastoData.id}.${ext}`
      await supabase.storage.from('comprobantes').upload(path, compFile, { upsert: true })
      const { data } = supabase.storage.from('comprobantes').getPublicUrl(path)
      if (data?.publicUrl) await (supabase.from('gastos') as any).update({ comprobante_url: data.publicUrl, comprobante_nombre: compFile.name }).eq('id', gastoData.id)
    }
    setForm(f => ({ ...f, monto: '', ref: '', notas: '', factura_a_nombre_cliente: false }))
    limpiarProv(); setProvExterno(''); setCompFile(null); setUploading(false); reload()
  }

  async function importarFactura(fac: any) {
    await (supabase.from('gastos') as any).insert({
      operacion_id: opId, fecha: fac.fecha, etapa: 'fee',
      concepto: `Factura Puerto NOA #${fac.numero}`, moneda: 'USD',
      monto: fac.total, tc: 1, usd: fac.total, estado: 'pendiente',
      ref: fac.numero, es_factura_propia: true, factura_emitida_id: fac.id, factura_a_nombre_cliente: false,
    })
    setShowImportarFac(false); reload()
  }

  async function togglePago(g: Gasto) {
    await (supabase.from('gastos') as any).update({ estado: g.estado === 'pagado' ? 'pendiente' : 'pagado' }).eq('id', g.id)
    reload()
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar?')) return
    await (supabase.from('gastos') as any).delete().eq('id', id)
    reload()
  }

  const inp = 'w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8] bg-white'
  const gastosPropios = gastos.filter(g => !(g as any).es_factura_propia)
  const facturasPropias = gastos.filter(g => (g as any).es_factura_propia)

  return (
    <div>
      <div className="bg-white border border-gray-100 rounded-xl p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium text-sm text-gray-900">Cargar gasto real</h3>
          <button onClick={() => setShowImportarFac(true)} className="flex items-center gap-1.5 px-3 py-1.5 border border-[#1168F8] text-[#1168F8] rounded-lg text-xs font-semibold hover:bg-[#EBF2FF]">
            📄 Importar factura Puerto NOA
          </button>
        </div>
        <div className="grid grid-cols-4 gap-3 mb-3">
          <div>
            <label className="block text-[10px] text-gray-500 font-medium mb-1">Etapa</label>
            <select value={form.etapa} onChange={e => setForm(f => ({ ...f, etapa: e.target.value }))} className={inp}>
              <option value="maritimo">Flete marítimo</option><option value="chile">Puerto Chile</option>
              <option value="terrestre">Transporte terrestre</option><option value="argentina">Argentina</option>
              <option value="tributos">Tributos ARCA</option><option value="fee">Fee Puerto NOA</option><option value="otro">Otro</option>
            </select>
          </div>
          <div className="col-span-2">
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] text-gray-500 font-medium">Proveedor</label>
              <div className="flex gap-1">
                <button onClick={() => { setModoProveedor('base'); limpiarProv(); setProvExterno('') }}
                  className={`px-2 py-0.5 rounded text-[9px] font-semibold ${modoProveedor === 'base' ? 'bg-[#1168F8] text-white' : 'bg-gray-100 text-gray-500'}`}>De mi base</button>
                <button onClick={() => { setModoProveedor('externo'); limpiarProv() }}
                  className={`px-2 py-0.5 rounded text-[9px] font-semibold ${modoProveedor === 'externo' ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-500'}`}>Externo / ad-hoc</button>
              </div>
            </div>
            {modoProveedor === 'base' ? (
              <div className="relative">
                <input value={provSelId ? provSelNombre : buscarProv}
                  onChange={e => { setBuscarProv(e.target.value); setProvSelId(null); setProvSelNombre(''); setShowDrop(true) }}
                  onFocus={() => setShowDrop(true)} className={inp + (provSelId ? ' bg-green-50 border-green-200' : '')} placeholder="Buscar proveedor..." />
                {provSelId && <div className="flex items-center gap-1 mt-1"><span className="text-[9px] bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-semibold">✓ De mi base</span><button onClick={limpiarProv} className="text-[9px] text-gray-400 hover:text-red-500">× cambiar</button></div>}
                {showDrop && !provSelId && provsFiltrados.length > 0 && (
                  <div className="absolute z-50 top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl mt-1 max-h-48 overflow-y-auto">
                    {provsFiltrados.map(t => <button key={t.id} onMouseDown={() => seleccionarProv(t)} className="w-full text-left px-4 py-2.5 hover:bg-[#EBF2FF] text-xs border-b border-gray-50 last:border-0"><span className="font-semibold text-gray-900">{t.razon_social}</span>{t.nombre_fantasia && <span className="text-gray-400 ml-2 text-[10px]">{t.nombre_fantasia}</span>}</button>)}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <input value={provExterno} onChange={e => setProvExterno(e.target.value)} className={inp + ' border-amber-200 bg-amber-50/30'} placeholder="Nombre del proveedor (texto libre)..." />
                <div className="text-[9px] text-amber-600 mt-1">No se crea en tu base de terceros</div>
              </div>
            )}
          </div>
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Fecha</label><input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} className={inp} /></div>
        </div>
        <div className="grid grid-cols-4 gap-3 mb-3">
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Estado</label><select value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value }))} className={inp}><option value="pendiente">Pendiente</option><option value="pagado">Pagado</option></select></div>
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Moneda</label><select value={form.moneda} onChange={e => setForm(f => ({ ...f, moneda: e.target.value }))} className={inp}><option>USD</option><option>ARS</option><option>CLP</option><option>CNY</option></select></div>
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Monto</label><input type="text" inputMode="decimal" onFocus={e => e.target.select()} value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} className={inp + ' text-right'} placeholder="0.00" /></div>
          {form.moneda !== 'USD' ? (
            <div><label className="block text-[10px] text-gray-500 font-medium mb-1">TC</label><input type="text" inputMode="decimal" onFocus={e => e.target.select()} value={form.tc} onChange={e => setForm(f => ({ ...f, tc: e.target.value }))} className={inp + ' text-right'} placeholder="1000" /></div>
          ) : (
            <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Equiv. USD</label><div className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-right font-mono">{form.monto ? fmt(parseFloat(form.monto) || 0) : '—'}</div></div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">N° factura / ref.</label><input value={form.ref} onChange={e => setForm(f => ({ ...f, ref: e.target.value }))} className={inp} placeholder="Nro. documento" /></div>
          <div>
            <label className="block text-[10px] text-gray-500 font-medium mb-1">Comprobante</label>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-gray-300 rounded-lg text-xs text-gray-500 hover:border-[#1168F8] cursor-pointer">
                📎 {compFile ? compFile.name : 'Adjuntar archivo'}
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => setCompFile(e.target.files?.[0] || null)} />
              </label>
              {compFile && <button onClick={() => setCompFile(null)} className="text-gray-400 hover:text-red-500 text-xs">✕</button>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 mb-4 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
          <input type="checkbox" id="fac_cliente" checked={form.factura_a_nombre_cliente} onChange={e => setForm(f => ({ ...f, factura_a_nombre_cliente: e.target.checked }))} className="w-4 h-4 rounded accent-amber-500" />
          <label htmlFor="fac_cliente" className="text-xs text-amber-800 font-medium cursor-pointer flex-1">Factura emitida a nombre de <strong>{cot.cliente}</strong><span className="text-amber-600 font-normal ml-1">— El gasto corresponde al cliente, no a Puerto NOA</span></label>
        </div>
        <div className="flex justify-end"><button onClick={cargar} disabled={uploading} className="bg-[#1168F8] text-white px-4 py-2 rounded-lg text-xs font-medium hover:bg-[#0a4fc4] disabled:opacity-60">{uploading ? 'Guardando...' : '✓ Registrar gasto'}</button></div>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden mb-4">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <span className="font-medium text-sm text-gray-900">Gastos de la operación</span>
          <span className="text-xs text-gray-400 font-mono">Total: USD {fmt(gastosPropios.reduce((s, g) => s + g.usd, 0))}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="bg-gray-50 border-b border-gray-100">{['Fecha','Etapa','Proveedor','Monto','USD','Estado','Ref.','Docs',''].map(h => <th key={h} className="text-left px-4 py-2 text-[10px] text-gray-400 font-medium uppercase tracking-wide">{h}</th>)}</tr></thead>
            <tbody>
              {gastosPropios.map(g => (
                <tr key={g.id} className={`border-b border-gray-50 hover:bg-gray-50 ${(g as any).factura_a_nombre_cliente ? 'bg-amber-50/30' : ''}`}>
                  <td className="px-4 py-3 font-mono text-[10px] text-gray-500">{g.fecha}</td>
                  <td className="px-4 py-3 text-[11px] text-gray-500">{ETAPAS_L[g.etapa] || g.etapa}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">{g.concepto}</div>
                    {(g as any).factura_a_nombre_cliente && <span className="text-[9px] bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full font-semibold">Fac. a nombre de {cot.cliente}</span>}
                    {(g as any).tercero_id && <span className="text-[9px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded-full font-semibold ml-1">✓ En mi base</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-right text-gray-600 text-[11px]">{g.moneda !== 'USD' ? `${g.moneda} ${fmt(g.monto)}` : '—'}</td>
                  <td className="px-4 py-3 font-mono text-right font-medium">USD {fmt(g.usd)}</td>
                  <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${g.estado === 'pagado' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>{g.estado === 'pagado' ? 'Pagado' : 'Pendiente'}</span></td>
                  <td className="px-4 py-3 text-[10px] text-gray-400">{g.ref || '—'}</td>
                  <td className="px-4 py-3">
                    {(g as any).comprobante_url ? (
                      <button onClick={() => setPreviewModal({ url: (g as any).comprobante_url, nombre: (g as any).comprobante_nombre || 'comprobante', tipo: (g as any).comprobante_nombre?.endsWith('.pdf') ? 'pdf' : 'img' })} className="px-1.5 py-0.5 bg-green-50 text-green-700 rounded text-[9px]">📄 Ver</button>
                    ) : (
                      <label className="px-1.5 py-0.5 border border-dashed border-gray-200 rounded text-[9px] text-gray-400 hover:border-green-500 cursor-pointer">📎
                        <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={async e => {
                          const f = e.target.files?.[0]; if (!f) return
                          const ext = f.name.split('.').pop(); const path = `gastos/${g.id}.${ext}`
                          await supabase.storage.from('comprobantes').upload(path, f, { upsert: true })
                          const { data } = supabase.storage.from('comprobantes').getPublicUrl(path)
                          if (data?.publicUrl) { await (supabase.from('gastos') as any).update({ comprobante_url: data.publicUrl, comprobante_nombre: f.name }).eq('id', g.id); reload() }
                        }} />
                      </label>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      <button onClick={() => togglePago(g)} className="p-1.5 border border-gray-200 rounded-md hover:bg-gray-100 text-gray-500 text-[10px]">{g.estado === 'pagado' ? '○' : '✓'}</button>
                      <button onClick={() => eliminar(g.id)} className="p-1.5 border border-gray-200 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500 text-[10px]">🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!gastosPropios.length && <tr><td colSpan={9} className="px-4 py-6 text-center text-gray-400">Sin gastos registrados aún.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {facturasPropias.length > 0 && (
        <div className="bg-[#EBF2FF] border border-[#93B8FC] rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#93B8FC] flex items-center justify-between">
            <div><span className="font-medium text-sm text-[#052698]">Facturas emitidas por Puerto NOA</span><span className="text-[10px] text-[#1168F8] ml-2">— No afectan la caja de la operación</span></div>
            <span className="text-xs text-[#052698] font-mono">Total: USD {fmt(facturasPropias.reduce((s, g) => s + g.usd, 0))}</span>
          </div>
          <table className="w-full text-xs">
            <thead><tr className="border-b border-[#93B8FC]">{['Fecha','Concepto','Ref.','USD','Estado',''].map(h => <th key={h} className="text-left px-4 py-2 text-[10px] text-[#052698] font-semibold uppercase">{h}</th>)}</tr></thead>
            <tbody>
              {facturasPropias.map(g => (
                <tr key={g.id} className="border-b border-[#93B8FC]/30">
                  <td className="px-4 py-3 font-mono text-[10px] text-[#052698]">{g.fecha}</td>
                  <td className="px-4 py-3 font-medium text-[#052698]">{g.concepto}</td>
                  <td className="px-4 py-3 font-mono text-[10px] text-[#1168F8]">{g.ref || '—'}</td>
                  <td className="px-4 py-3 font-mono font-bold text-[#052698]">USD {fmt(g.usd)}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${g.estado === 'pagado' ? 'bg-green-100 text-green-800' : 'bg-white text-amber-700 border border-amber-200'}`}>{g.estado === 'pagado' ? 'Pagado' : 'Pendiente'}</span></td>
                  <td className="px-4 py-3"><button onClick={() => eliminar(g.id)} className="text-[#1168F8]/40 hover:text-red-500 text-[10px]">🗑</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showImportarFac && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100"><span className="font-bold text-sm text-gray-900">Importar factura de Puerto NOA</span><button onClick={() => setShowImportarFac(false)} className="text-gray-400 text-xl">×</button></div>
            <div className="px-5 py-4">
              {facturasPropia.length === 0 ? <div className="text-center py-6 text-gray-400 text-sm">Sin facturas emitidas vinculadas a esta operación</div> : (
                <div className="space-y-2">
                  {facturasPropia.map(fac => (
                    <button key={fac.id} onClick={() => importarFactura(fac)} className="w-full flex items-center justify-between px-4 py-3 border border-gray-200 rounded-xl hover:border-[#1168F8] hover:bg-[#EBF2FF] text-left">
                      <div><div className="font-mono font-bold text-[#052698]">#{fac.numero}</div><div className="text-[10px] text-gray-400">{fac.fecha}</div></div>
                      <div className="text-right"><div className="font-mono font-bold text-gray-800">USD {fmt(fac.total)}</div><div className={`text-[10px] ${fac.estado === 'pagada' ? 'text-green-600' : 'text-amber-600'}`}>{fac.estado}</div></div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end"><button onClick={() => setShowImportarFac(false)} className="px-4 py-2 border border-gray-200 rounded-xl text-xs">Cerrar</button></div>
          </div>
        </div>
      )}

      {previewModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setPreviewModal(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <span className="font-medium text-sm truncate">{previewModal.nombre}</span>
              <div className="flex gap-2"><a href={previewModal.url} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-[#1168F8] text-white rounded-lg text-xs">🔗 Abrir</a><button onClick={() => setPreviewModal(null)} className="text-gray-400 text-xl px-1">×</button></div>
            </div>
            <div className="overflow-auto max-h-[75vh] p-2">{previewModal.tipo === 'pdf' ? <iframe src={previewModal.url} className="w-full h-[70vh] border-0" title={previewModal.nombre} /> : <img src={previewModal.url} alt={previewModal.nombre} className="max-w-full mx-auto rounded" />}</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── CC TAB — ahora usa fondos_movimientos ──────────────────────
function CCTab({ opId, cot, movs, reload }: { opId: string; cot: Cotizacion; movs: any[]; reload: () => void }) {
  const supabase = useMemo(() => createClient(), [])
  const [cuentas, setCuentas] = useState<any[]>([])
  const [tcActual, setTcActual] = useState<{ ARS: number; CLP: number }>({ ARS: 1450, CLP: 910 })
  const [form, setForm] = useState({
    tipo: 'ingreso_cliente', concepto: '', fecha: nowDate(),
    moneda: 'USD', monto: '', tc_usd: '',
    cuenta_id: '',
    banco_origen: '', cuenta_origen: '',
    banco_destino: '', cuenta_destino_texto: '',
    nro_referencia: '', notas: '',
  })
  const [compFile, setCompFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [previewModal, setPreviewModal] = useState<{ url: string; nombre: string; tipo: string } | null>(null)
  const [currentUser, setCurrentUser] = useState<any>(null)

  useEffect(() => { loadCuentas(); loadTC(); loadUser() }, [])

  async function loadUser() {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return
    const { data: u } = await supabase.from('usuarios').select('nombre').eq('auth_id', auth.user.id).single()
    if (u) setCurrentUser(u)
  }

  async function loadCuentas() {
    const { data } = await supabase.from('fondos_cuentas').select('*').eq('activo', true).order('orden')
    if (data) setCuentas(data)
  }

  async function loadTC() {
    const { data } = await supabase.from('tipos_cambio_eventos').select('ars,clp').order('created_at', { ascending: false }).limit(1)
    if (data && data.length > 0) {
      const tc = data[0] as any
      setTcActual({ ARS: tc.ars || 1450, CLP: tc.clp || 910 })
    }
  }

  const tcAuto = form.moneda === 'USD' ? 1 : form.moneda === 'ARS' ? tcActual.ARS : tcActual.CLP
  const tcEfectivo = parseFloat(form.tc_usd) || tcAuto
  const montoNum = parseFloat(form.monto) || 0
  const usdEquiv = form.moneda === 'USD' ? montoNum : montoNum / tcEfectivo
  const cuentasCompatibles = cuentas.filter(c => c.moneda === form.moneda)

  const totalIng = movs.filter(m => m.tipo === 'ingreso_cliente').reduce((s, m) => s + m.usd, 0)
  const totalEg = movs.filter(m => m.tipo !== 'ingreso_cliente').reduce((s, m) => s + m.usd, 0)
  const saldo = totalIng - totalEg

  async function guardar() {
    if (!form.monto || !form.cuenta_id || !form.concepto) { alert('Completá cuenta, concepto y monto'); return }
    setSaving(true)
    const payload: any = {
      fecha: form.fecha, tipo: form.tipo, concepto: form.concepto,
      operacion_id: opId, cuenta_id: form.cuenta_id,
      banco_origen: form.banco_origen || null, cuenta_origen: form.cuenta_origen || null,
      banco_destino: form.banco_destino || null, cuenta_destino_texto: form.cuenta_destino_texto || null,
      nro_referencia: form.nro_referencia || null,
      moneda: form.moneda, monto: montoNum, tc_usd: tcEfectivo, usd: usdEquiv,
      notas: form.notas || null, creado_por: currentUser?.nombre || null,
    }
    const { data: movData } = await (supabase.from('fondos_movimientos') as any).insert(payload).select('id').single()
    if (movData && compFile) {
      const ext = compFile.name.split('.').pop()
      const path = `fondos/${movData.id}.${ext}`
      await supabase.storage.from('comprobantes').upload(path, compFile, { upsert: true })
      const { data: urlData } = supabase.storage.from('comprobantes').getPublicUrl(path)
      if (urlData?.publicUrl) await (supabase.from('fondos_movimientos') as any).update({ comprobante_url: urlData.publicUrl, comprobante_nombre: compFile.name }).eq('id', movData.id)
    }
    setForm(f => ({ ...f, monto: '', concepto: '', nro_referencia: '', notas: '', banco_origen: '', cuenta_origen: '', banco_destino: '', cuenta_destino_texto: '' }))
    setCompFile(null); setSaving(false); reload()
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar este movimiento?')) return
    await (supabase.from('fondos_movimientos') as any).delete().eq('id', id)
    reload()
  }

  let saldoAcum = 0
  const inp = 'w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8] bg-white'
  const tipoActual = TIPOS_MOV_CC.find(t => t.key === form.tipo)

  return (
    <div>
      {/* Formulario */}
      <div className="bg-white border border-gray-100 rounded-xl p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium text-sm text-gray-900">Registrar movimiento de fondos</h3>
          <div className="text-[10px] text-gray-400">Los movimientos se sincronizan con <span className="font-semibold text-[#1168F8]">Fondos en custodia</span></div>
        </div>

        {/* Tipo */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {TIPOS_MOV_CC.map(t => (
            <button key={t.key} onClick={() => setForm(f => ({ ...f, tipo: t.key }))}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-left transition-all ${form.tipo === t.key ? `${t.bg} ${t.border} ${t.color}` : 'border-gray-200 hover:bg-gray-50 text-gray-600'}`}>
              <span className="text-sm">{t.icon}</span>
              <span className="text-[11px] font-semibold">{t.label}</span>
            </button>
          ))}
        </div>

        {form.tipo === 'honorarios_puertonoa' && (
          <div className="mb-4 px-4 py-3 bg-[#EBF2FF] border border-[#93B8FC] rounded-xl text-[11px] text-[#052698]">
            💡 Este egreso saldrá de los fondos del cliente. Recordá registrar el ingreso correspondiente en la caja propia de Puerto NOA.
          </div>
        )}

        <div className="grid grid-cols-4 gap-3 mb-3">
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Fecha</label><input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} className={inp} /></div>
          <div className="col-span-2"><label className="block text-[10px] text-gray-500 font-medium mb-1">Concepto *</label>
            <input value={form.concepto} onChange={e => setForm(f => ({ ...f, concepto: e.target.value }))} className={inp}
              placeholder={form.tipo === 'ingreso_cliente' ? 'ej. Anticipo operación' : form.tipo === 'pago_proveedor' ? 'ej. Pago flete Triunfo SRL' : 'ej. Honorarios Puerto NOA'} /></div>
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Moneda</label>
            <select value={form.moneda} onChange={e => setForm(f => ({ ...f, moneda: e.target.value, cuenta_id: '' }))} className={inp}>
              <option>USD</option><option>ARS</option><option>CLP</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3 mb-3">
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Monto *</label><input type="text" inputMode="decimal" onFocus={e => e.target.select()} value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} className={inp + ' text-right font-mono'} placeholder="0.00" /></div>
          {form.moneda !== 'USD' && (
            <div><label className="block text-[10px] text-gray-500 font-medium mb-1">TC {form.moneda}/USD <span className="text-gray-300 font-normal">(auto: {Math.round(tcAuto).toLocaleString('es-AR')})</span></label>
              <input type="text" inputMode="decimal" onFocus={e => e.target.select()} value={form.tc_usd} onChange={e => setForm(f => ({ ...f, tc_usd: e.target.value }))} className={inp + ' text-right font-mono'} placeholder={Math.round(tcAuto).toString()} /></div>
          )}
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Equiv. USD</label>
            <div className="px-2.5 py-1.5 bg-[#EBF2FF] border border-[#93B8FC] rounded-lg text-xs text-right font-mono font-bold text-[#052698]">USD {fmt(usdEquiv, 2)}</div></div>
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Cuenta *</label>
            <select value={form.cuenta_id} onChange={e => setForm(f => ({ ...f, cuenta_id: e.target.value }))} className={inp}>
              <option value="">— Seleccionar —</option>
              {cuentasCompatibles.map(c => <option key={c.id} value={c.id}>{c.pais === 'Argentina' ? '🇦🇷' : '🇨🇱'} {c.nombre} ({c.moneda})</option>)}
            </select>
          </div>
        </div>

        {/* Datos bancarios */}
        <div className="grid grid-cols-4 gap-3 mb-3">
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Banco origen</label><input value={form.banco_origen} onChange={e => setForm(f => ({ ...f, banco_origen: e.target.value }))} className={inp} placeholder="Banco remitente" /></div>
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Cuenta / CBU origen</label><input value={form.cuenta_origen} onChange={e => setForm(f => ({ ...f, cuenta_origen: e.target.value }))} className={inp} /></div>
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Banco destino</label><input value={form.banco_destino} onChange={e => setForm(f => ({ ...f, banco_destino: e.target.value }))} className={inp} placeholder="Banco receptor" /></div>
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Cuenta / CBU destino</label><input value={form.cuenta_destino_texto} onChange={e => setForm(f => ({ ...f, cuenta_destino_texto: e.target.value }))} className={inp} /></div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">N° referencia / transferencia</label><input value={form.nro_referencia} onChange={e => setForm(f => ({ ...f, nro_referencia: e.target.value }))} className={inp} placeholder="N° operación bancaria" /></div>
          <div>
            <label className="block text-[10px] text-gray-500 font-medium mb-1">Comprobante (PDF / imagen)</label>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-gray-300 rounded-lg text-xs text-gray-500 hover:border-[#1168F8] cursor-pointer">
                📎 {compFile ? compFile.name : 'Adjuntar archivo'}
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => setCompFile(e.target.files?.[0] || null)} />
              </label>
              {compFile && <button onClick={() => setCompFile(null)} className="text-gray-400 hover:text-red-500 text-xs">✕</button>}
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button onClick={guardar} disabled={saving} className="bg-[#1168F8] text-white px-4 py-2 rounded-lg text-xs font-medium hover:bg-[#0a4fc4] disabled:opacity-60">
            {saving ? 'Guardando...' : '✓ Registrar movimiento'}
          </button>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4"><div className="text-[10px] font-medium text-green-700 mb-1">Fondos recibidos</div><div className="text-xl font-semibold text-green-800">USD {fmt(totalIng)}</div></div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4"><div className="text-[10px] font-medium text-red-700 mb-1">Fondos utilizados</div><div className="text-xl font-semibold text-red-700">USD {fmt(totalEg)}</div></div>
        <div className={`border rounded-xl p-4 ${saldo >= 0 ? 'bg-[#EBF2FF] border-[#93B8FC]' : 'bg-red-50 border-red-200'}`}>
          <div className={`text-[10px] font-medium mb-1 ${saldo >= 0 ? 'text-[#052698]' : 'text-red-700'}`}>Saldo disponible</div>
          <div className={`text-xl font-semibold ${saldo >= 0 ? 'text-[#052698]' : 'text-red-700'}`}>USD {fmt(saldo)}</div>
          <div className={`text-[10px] mt-1 ${saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>{saldo < 0 ? '⚠ Solicitar fondos al cliente' : 'Fondos disponibles'}</div>
        </div>
      </div>

      {/* Tabla movimientos */}
      <style>{`@media print { body * { visibility: hidden; } #cc-print, #cc-print * { visibility: visible; } #cc-print { position: absolute; left: 0; top: 0; width: 100%; } .no-print { display: none !important; } @page { margin: 10mm 12mm; size: A4 portrait; } }`}</style>
      <div className="no-print flex justify-end mb-3">
        <button onClick={() => { const t = document.title; document.title = `CC_${opId}`; window.print(); document.title = t }}
          className="flex items-center gap-1.5 px-4 py-2 border-2 border-[#1168F8] text-[#1168F8] rounded-lg text-xs font-semibold hover:bg-[#EBF2FF]">🖨 Imprimir / PDF</button>
      </div>

      <div id="cc-print" className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <div className="flex items-start justify-between px-5 py-4 border-b-2 border-[#1168F8]">
          <div><img src="/logo.png" alt="Puerto NOA SpA" style={{ height: '32px', objectFit: 'contain' }} /><div className="text-[10px] text-gray-400 mt-1">Puerto NOA SpA — Estado de fondos en custodia · {cot.cliente}</div></div>
          <div className="text-right"><div className="text-[10px] text-gray-400 uppercase tracking-wider">Estado de cuenta</div><div className="text-xs font-mono font-bold text-[#052698] mt-0.5">{new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}</div></div>
        </div>
        <div className="grid grid-cols-3 gap-3 px-5 py-3 bg-gray-50 border-b border-gray-100">
          <div className="text-center"><div className="text-[9px] text-gray-400 uppercase">Fondos recibidos</div><div className="font-mono font-bold text-green-700 text-sm">USD {fmt(totalIng)}</div></div>
          <div className="text-center"><div className="text-[9px] text-gray-400 uppercase">Fondos utilizados</div><div className="font-mono font-bold text-red-600 text-sm">USD {fmt(totalEg)}</div></div>
          <div className="text-center"><div className="text-[9px] text-gray-400 uppercase">Saldo disponible</div><div className={`font-mono font-bold text-sm ${saldo >= 0 ? 'text-[#052698]' : 'text-red-600'}`}>USD {fmt(saldo)}</div></div>
        </div>
        <div className="px-5 py-3.5 border-b border-gray-100"><span className="font-medium text-sm text-gray-900">Movimientos</span></div>
        <div>
          {movs.map(m => {
            const esIngreso = m.tipo === 'ingreso_cliente'
            saldoAcum += esIngreso ? m.usd : -m.usd
            const tipoInfo = TIPOS_MOV_CC.find(t => t.key === m.tipo)
            return (
              <div key={m.id} className="flex items-center gap-3 px-5 py-3 border-b border-gray-50 text-xs">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${esIngreso ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="font-mono text-[10px] text-gray-400 w-20">{m.fecha}</span>
                <div className="flex-1">
                  <div className="text-gray-800">{m.concepto}</div>
                  <div className="text-[9px] text-gray-400 flex gap-2 mt-0.5">
                    {m.cuenta?.nombre && <span>{m.cuenta.nombre}</span>}
                    {m.nro_referencia && <span>Ref: {m.nro_referencia}</span>}
                    {m.moneda !== 'USD' && <span>{m.moneda} {fmt(m.monto)} · TC {fmt(m.tc_usd, 0)}</span>}
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold ${tipoInfo?.bg} ${tipoInfo?.color}`}>{tipoInfo?.icon} {tipoInfo?.label}</span>
                <span className={`font-mono font-medium min-w-24 text-right ${esIngreso ? 'text-green-700' : 'text-red-600'}`}>{esIngreso ? '+' : '−'} USD {fmt(m.usd)}</span>
                <span className={`font-mono text-[10px] min-w-24 text-right ${saldoAcum >= 0 ? 'text-green-700' : 'text-red-600'}`}>= USD {fmt(saldoAcum)}</span>
                {m.comprobante_url ? (
                  <button onClick={() => setPreviewModal({ url: m.comprobante_url, nombre: m.comprobante_nombre || 'comprobante', tipo: m.comprobante_nombre?.endsWith('.pdf') ? 'pdf' : 'img' })} className="px-2 py-0.5 bg-[#EBF2FF] text-[#1168F8] rounded text-[10px]">📄 Ver</button>
                ) : <span className="w-12" />}
                <button onClick={() => eliminar(m.id)} className="text-gray-300 hover:text-red-500 text-[10px] no-print">🗑</button>
              </div>
            )
          })}
          {!movs.length && <div className="px-5 py-6 text-center text-gray-400 text-xs">Sin movimientos registrados para esta operación.</div>}
        </div>
        <div className="flex items-center justify-between px-5 py-2.5 border-t border-gray-100 bg-gray-50">
          <div className="text-[9px] text-gray-400">Puerto NOA SpA — Rendición al cliente · {cot.cliente}</div>
          <img src="/logo.png" alt="Puerto NOA" style={{ height: '18px', objectFit: 'contain', opacity: 0.5 }} />
        </div>
      </div>

      {previewModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setPreviewModal(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <span className="font-medium text-sm truncate">{previewModal.nombre}</span>
              <div className="flex gap-2"><a href={previewModal.url} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-[#1168F8] text-white rounded-lg text-xs">🔗 Abrir</a><button onClick={() => setPreviewModal(null)} className="text-gray-400 text-xl px-1">×</button></div>
            </div>
            <div className="overflow-auto max-h-[75vh] p-2">{previewModal.tipo === 'pdf' ? <iframe src={previewModal.url} className="w-full h-[70vh] border-0" title={previewModal.nombre} /> : <img src={previewModal.url} alt={previewModal.nombre} className="max-w-full mx-auto rounded" />}</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── COMPARATIVO TAB ────────────────────────────────────────────
function ComparativoTab({ presup, gastos }: { presup: any[]; gastos: Gasto[] }) {
  let totP = 0, totR = 0
  const rows: React.ReactNode[] = []
  ETAPAS_ORD.forEach(e => {
    const pi = presup.filter((i: any) => i.etapa === e)
    const ri = gastos.filter(g => g.etapa === e)
    const p = pi.reduce((s: number, i: any) => s + i.usd, 0)
    const r = ri.reduce((s, g) => s + g.usd, 0)
    if (!p && !r) return
    totP += p; totR += r
    rows.push(<tr key={e + '-grp'} className="bg-gray-50"><td colSpan={5} className="px-4 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{ETAPAS_L[e] || e}</td></tr>)
    pi.forEach((i: any, idx: number) => {
      const dv = r - i.usd
      rows.push(
        <tr key={e + idx} className="border-b border-gray-50 hover:bg-gray-50">
          <td className="px-4 py-2.5 pl-8 text-xs text-gray-700">{i.concepto}</td>
          <td className="px-4 py-2.5 font-mono text-xs text-right">USD {fmt(i.usd)}</td>
          <td className="px-4 py-2.5 font-mono text-xs text-right">{r > 0 ? `USD ${fmt(r)}` : '—'}</td>
          <td className={`px-4 py-2.5 font-mono text-xs text-right font-medium ${dv > 0 ? 'text-red-600' : dv < 0 ? 'text-green-700' : 'text-gray-400'}`}>{dv !== 0 ? `${dv > 0 ? '+ ' : ''}USD ${fmt(dv)}` : '—'}</td>
          <td className="px-4 py-2.5 w-24"><div className="h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(i.usd > 0 && r ? r / i.usd * 100 : 0, 100)}%`, background: dv / i.usd > 0.1 ? '#A32D2D' : dv / i.usd > 0 ? '#EF9F27' : '#1168F8' }} /></div></td>
        </tr>
      )
    })
  })
  const dTot = totR - totP
  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100"><span className="font-medium text-sm text-gray-900">Presupuestado vs. Real</span></div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="bg-gray-50 border-b border-gray-100">{['Concepto','Presupuestado','Real','Diferencia','%'].map(h => <th key={h} className={`px-4 py-2.5 text-[10px] text-gray-400 font-medium uppercase tracking-wide ${h !== 'Concepto' ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
          <tbody>
            {rows}
            <tr className="bg-gray-50 font-semibold border-t-2 border-gray-200">
              <td className="px-4 py-3 text-sm">TOTAL</td>
              <td className="px-4 py-3 font-mono text-right">USD {fmt(totP)}</td>
              <td className="px-4 py-3 font-mono text-right">USD {fmt(totR)}</td>
              <td className={`px-4 py-3 font-mono text-right ${dTot > 0 ? 'text-red-600' : dTot < 0 ? 'text-green-700' : 'text-gray-400'}`}>{dTot !== 0 ? `${dTot > 0 ? '+ ' : ''}USD ${fmt(dTot)}` : '—'}</td>
              <td className="px-4 py-3 text-xs">{totP ? `${fmt(totR / totP * 100, 1)}%` : '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── MINUTA TAB ─────────────────────────────────────────────────
function MinutaTab({ opId, cotNum, cliente, minuta, reload }: { opId: string; cotNum: string; cliente: string; minuta: MinutaItem[]; reload: () => void }) {
  const [form, setForm] = useState({ prov: '', concepto: '', moneda: 'USD', monto: '', fecha: nowDate(), banco: '', cuenta: '', swift: '', notas: '' })
  const supabase = useMemo(() => createClient(), [])
  const fecha = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })
  const totalUSD = minuta.filter(i => i.moneda === 'USD').reduce((s, i) => s + i.monto, 0)
  const totalARS = minuta.filter(i => i.moneda === 'ARS').reduce((s, i) => s + i.monto, 0)
  const inp = 'w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8]'

  async function agregar() {
    if (!form.prov || !form.monto) { alert('Completá proveedor y monto.'); return }
    await (supabase.from('minuta_items') as any).insert({ operacion_id: opId, proveedor: form.prov, concepto: form.concepto, moneda: form.moneda as Moneda, monto: parseFloat(form.monto), fecha_vto: form.fecha, banco: form.banco, cuenta: form.cuenta, swift: form.swift, notas: form.notas })
    setForm({ prov: '', concepto: '', moneda: 'USD', monto: '', fecha: nowDate(), banco: '', cuenta: '', swift: '', notas: '' }); reload()
  }

  async function eliminar(id: string) { await (supabase.from('minuta_items') as any).delete().eq('id', id); reload() }

  return (
    <div>
      <style>{`@media print { body * { visibility: hidden; } #minuta-print, #minuta-print * { visibility: visible; } #minuta-print { position: absolute; left: 0; top: 0; width: 100%; } .no-print { display: none !important; } @page { margin: 10mm 12mm; size: A4 portrait; } }`}</style>
      <div className="no-print bg-white border border-gray-100 rounded-xl p-5 mb-4">
        <h3 className="font-medium text-sm text-gray-900 mb-4">Agregar ítem a la minuta</h3>
        <div className="grid grid-cols-4 gap-3 mb-3">
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Proveedor</label><input value={form.prov} onChange={e => setForm(f => ({ ...f, prov: e.target.value }))} className={inp} /></div>
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Concepto</label><input value={form.concepto} onChange={e => setForm(f => ({ ...f, concepto: e.target.value }))} className={inp} /></div>
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Moneda</label><select value={form.moneda} onChange={e => setForm(f => ({ ...f, moneda: e.target.value }))} className={inp + ' bg-white'}><option>USD</option><option>ARS</option><option>CLP</option></select></div>
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Monto</label><input type="text" inputMode="decimal" onFocus={e => e.target.select()} value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} className={inp + ' text-right'} placeholder="0.00" /></div>
        </div>
        <div className="grid grid-cols-4 gap-3 mb-3">
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Fecha vto.</label><input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} className={inp} /></div>
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Banco</label><input value={form.banco} onChange={e => setForm(f => ({ ...f, banco: e.target.value }))} className={inp} /></div>
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">N° cuenta / CBU</label><input value={form.cuenta} onChange={e => setForm(f => ({ ...f, cuenta: e.target.value }))} className={inp} /></div>
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Swift / alias</label><input value={form.swift} onChange={e => setForm(f => ({ ...f, swift: e.target.value }))} className={inp} /></div>
        </div>
        <div className="mb-4"><label className="block text-[10px] text-gray-500 font-medium mb-1">Notas</label><input value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} className={inp} /></div>
        <div className="flex justify-end"><button onClick={agregar} className="bg-[#1168F8] text-white px-4 py-2 rounded-lg text-xs font-medium hover:bg-[#0a4fc4]">+ Agregar a minuta</button></div>
      </div>
      <div className="no-print flex items-center justify-between mb-3">
        <span className="text-xs text-gray-500">{minuta.length} ítem(s) · {totalUSD > 0 ? `USD ${fmt(totalUSD)}` : ''}{totalARS > 0 ? ` · ARS ${Math.round(totalARS).toLocaleString('es-AR')}` : ''}</span>
        <button onClick={() => { const t = document.title; document.title = `Minuta_${opId}`; window.print(); document.title = t }} className="flex items-center gap-1.5 px-4 py-2 border-2 border-[#1168F8] text-[#1168F8] rounded-lg text-xs font-semibold hover:bg-[#EBF2FF]">🖨 Imprimir / PDF</button>
      </div>
      <div id="minuta-print" className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <div className="flex items-start justify-between px-6 py-5 border-b-2 border-[#1168F8]">
          <div><img src="/logo.png" alt="Puerto NOA SpA" style={{ height: '36px', objectFit: 'contain' }} /><div className="mt-2 text-[10px] text-gray-400">Puerto NOA SpA — Logística de importaciones China → NOA<br />San Salvador de Jujuy, Argentina</div></div>
          <div className="text-right"><div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Minuta de pago</div><div className="text-xl font-bold font-mono text-[#052698]">{cotNum}</div><div className="text-xs text-gray-500 mt-1">{fecha}</div></div>
        </div>
        <div className="px-6 py-4 bg-[#EBF2FF] border-b border-[#93B8FC]">
          <div className="text-[10px] text-[#052698] uppercase tracking-wider font-bold mb-1">Estimado cliente</div>
          <div className="text-sm font-semibold text-[#052698]">{cliente}</div>
          <div className="text-xs text-[#1168F8] mt-1">Le solicitamos efectuar las siguientes transferencias para continuar con el proceso de importación correspondiente a la operación {cotNum}.</div>
        </div>
        <div className="divide-y divide-gray-100">
          {minuta.map((it, idx) => (
            <div key={it.id} className="px-6 py-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3"><div className="w-6 h-6 rounded-full bg-[#1168F8] text-white text-[10px] font-bold flex items-center justify-center">{idx + 1}</div><div><div className="font-semibold text-sm text-gray-900">{it.proveedor}</div><div className="text-xs text-gray-500">{it.concepto}</div></div></div>
                <div className="text-right"><div className="text-xl font-bold text-[#052698] font-mono">{it.moneda} {fmt(it.monto)}</div>{it.fecha_vto && <div className="text-[10px] text-amber-600 mt-0.5 font-medium">⏱ Vence: {it.fecha_vto}</div>}</div>
              </div>
              {(it.banco || it.cuenta || it.swift) && (
                <div className="grid grid-cols-3 gap-3 bg-gray-50 rounded-lg p-3 text-xs">
                  {it.banco && <div><div className="text-[9px] text-gray-400 uppercase mb-0.5">Banco</div><div className="font-medium text-gray-700">{it.banco}</div></div>}
                  {it.cuenta && <div><div className="text-[9px] text-gray-400 uppercase mb-0.5">Cuenta / CBU</div><div className="font-mono text-gray-700">{it.cuenta}</div></div>}
                  {it.swift && <div><div className="text-[9px] text-gray-400 uppercase mb-0.5">Swift / Alias</div><div className="font-mono text-gray-700">{it.swift}</div></div>}
                </div>
              )}
              {it.notas && <div className="mt-2 text-[10px] text-amber-700 bg-amber-50 rounded px-3 py-1.5">📌 {it.notas}</div>}
              <div className="no-print flex justify-end mt-2"><button onClick={() => eliminar(it.id)} className="text-gray-400 hover:text-red-500 text-xs">🗑 Quitar</button></div>
            </div>
          ))}
          {!minuta.length && <div className="px-6 py-8 text-center text-gray-400 text-xs">Agregá ítems a la minuta para presentar al cliente.</div>}
        </div>
        {minuta.length > 0 && (
          <div className="px-6 py-4 bg-gray-50 border-t-2 border-[#1168F8]">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-gray-700">TOTAL A TRANSFERIR</div>
              <div className="text-right space-y-0.5">
                {totalUSD > 0 && <div className="font-mono font-bold text-[#052698] text-base">USD {fmt(totalUSD)}</div>}
                {totalARS > 0 && <div className="font-mono font-bold text-[#052698] text-base">ARS {Math.round(totalARS).toLocaleString('es-AR')}</div>}
              </div>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100">
          <div className="text-[9px] text-gray-400">Ante cualquier consulta comuníquese con Puerto NOA SpA · San Salvador de Jujuy, Argentina</div>
          <img src="/logo.png" alt="Puerto NOA" style={{ height: '20px', objectFit: 'contain', opacity: 0.5 }} />
        </div>
      </div>
    </div>
  )
}

export default function OperacionesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">Cargando...</div>}>
      <OperacionesContent />
    </Suspense>
  )
}

// ── DOCUMENTOS TAB ─────────────────────────────────────────────
const TIPOS_DOC = [
  { key: 'proforma',    label: 'Proforma del proveedor' },
  { key: 'bl',         label: 'BL — Bill of Lading' },
  { key: 'packing',    label: 'Packing List' },
  { key: 'crt',        label: 'CRT — Carta de Porte' },
  { key: 'liquidacion',label: 'Liquidación de impuestos (SIM)' },
  { key: 'otro',       label: 'Otro (definir nombre)' },
]

function DocumentosTab({ opId, docs, reload }: { opId: string; docs: any[]; reload: () => void }) {
  const supabase = useMemo(() => createClient(), [])
  const [form, setForm] = useState({ tipo: 'bl', nombre_custom: '', referencia: '', fecha: '', notas: '' })
  const [uploading, setUploading] = useState(false)
  const [previewModal, setPreviewModal] = useState<{ url: string; nombre: string; tipo: string } | null>(null)
  const [currentUser, setCurrentUser] = useState<{ id: string; nombre: string } | null>(null)
  const inp = 'w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8]'

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return
      supabase.from('usuarios').select('id, nombre').eq('auth_id', data.user.id).single().then(({ data: u }) => { if (u) setCurrentUser(u as any) })
    })
  }, [])

  async function subirDocumento(file: File) {
    if (!currentUser) return
    setUploading(true)
    const { data: docData } = await (supabase.from('operacion_documentos') as any).insert({
      operacion_id: opId, tipo: form.tipo,
      nombre_custom: form.tipo === 'otro' ? form.nombre_custom : null,
      referencia: form.referencia || null, fecha: form.fecha || null, notas: form.notas || null,
      subido_por: currentUser.nombre, subido_por_id: currentUser.id, archivo_nombre: file.name,
    }).select('id').single()
    if (docData) {
      const ext = file.name.split('.').pop(); const path = `documentos/${opId}/${docData.id}.${ext}`
      await supabase.storage.from('comprobantes').upload(path, file, { upsert: true })
      const { data: urlData } = supabase.storage.from('comprobantes').getPublicUrl(path)
      if (urlData?.publicUrl) await (supabase.from('operacion_documentos') as any).update({ archivo_url: urlData.publicUrl }).eq('id', docData.id)
    }
    setForm({ tipo: 'bl', nombre_custom: '', referencia: '', fecha: '', notas: '' }); setUploading(false); reload()
  }

  async function eliminar(id: string) { if (!confirm('¿Eliminar?')) return; await supabase.from('operacion_documentos').delete().eq('id', id); reload() }

  const grouped = docs.reduce((acc: Record<string, any[]>, d) => {
    const key = d.tipo === 'otro' ? (d.nombre_custom || 'Otro') : d.tipo
    if (!acc[key]) acc[key] = []; acc[key].push(d); return acc
  }, {})

  const getLabel = (tipo: string, nombre_custom?: string) => tipo === 'otro' ? (nombre_custom || 'Otro') : (TIPOS_DOC.find(t => t.key === tipo)?.label || tipo)

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-100 rounded-xl p-5">
        <h3 className="font-medium text-sm text-gray-900 mb-4">Agregar documento</h3>
        <div className="grid grid-cols-4 gap-3 mb-3">
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Tipo</label><select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))} className={inp + ' bg-white'}>{TIPOS_DOC.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}</select></div>
          {form.tipo === 'otro' && <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Nombre *</label><input value={form.nombre_custom} onChange={e => setForm(f => ({ ...f, nombre_custom: e.target.value }))} className={inp} /></div>}
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">N° referencia</label><input value={form.referencia} onChange={e => setForm(f => ({ ...f, referencia: e.target.value }))} className={inp} /></div>
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Fecha</label><input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} className={inp} /></div>
        </div>
        <label className={`flex items-center gap-2 px-4 py-2 border-2 border-dashed border-[#93B8FC] rounded-lg text-xs text-[#1168F8] hover:bg-[#EBF2FF] cursor-pointer w-fit ${uploading ? 'opacity-60' : ''}`}>
          📎 {uploading ? 'Subiendo...' : 'Seleccionar y subir archivo'}
          <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" disabled={uploading || (form.tipo === 'otro' && !form.nombre_custom)} onChange={e => { const f = e.target.files?.[0]; if (f) subirDocumento(f) }} />
        </label>
      </div>
      {Object.keys(grouped).length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl p-8 text-center text-gray-400 text-sm">Sin documentos cargados aún.</div>
      ) : Object.entries(grouped).map(([key, items]: [string, any[]]) => (
        <div key={key} className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between"><span className="font-medium text-sm text-gray-900">{getLabel(items[0].tipo, items[0].nombre_custom)}</span><span className="text-xs text-gray-400">{items.length} archivo(s)</span></div>
          <div className="divide-y divide-gray-50">
            {items.map((doc: any) => (
              <div key={doc.id} className="flex items-center gap-4 px-5 py-3 text-xs">
                <div className="flex-1"><div className="font-medium text-gray-800">{doc.archivo_nombre}</div><div className="text-[10px] text-gray-400 mt-0.5 flex gap-3">{doc.referencia && <span>Ref: {doc.referencia}</span>}{doc.fecha && <span>{doc.fecha}</span>}{doc.subido_por && <span>por {doc.subido_por}</span>}</div></div>
                <div className="flex gap-2">
                  {doc.archivo_url && <button onClick={() => setPreviewModal({ url: doc.archivo_url, nombre: doc.archivo_nombre, tipo: doc.archivo_nombre?.toLowerCase().endsWith('.pdf') ? 'pdf' : 'img' })} className="px-2.5 py-1.5 bg-[#EBF2FF] text-[#1168F8] rounded-lg text-[10px] font-medium">📄 Ver</button>}
                  <button onClick={() => eliminar(doc.id)} className="p-1.5 border border-gray-200 rounded-lg text-gray-400 hover:text-red-500 text-[10px]">🗑</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {previewModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setPreviewModal(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100"><span className="font-medium text-sm truncate">{previewModal.nombre}</span><div className="flex gap-2"><a href={previewModal.url} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-[#1168F8] text-white rounded-lg text-xs">🔗 Abrir</a><button onClick={() => setPreviewModal(null)} className="text-gray-400 text-xl px-1">×</button></div></div>
            <div className="overflow-auto max-h-[80vh] p-2">{previewModal.tipo === 'pdf' ? <iframe src={previewModal.url} className="w-full h-[75vh] border-0" title={previewModal.nombre} /> : <img src={previewModal.url} alt={previewModal.nombre} className="max-w-full mx-auto rounded" />}</div>
          </div>
        </div>
      )}
    </div>
  )
}
