'use client'
import { useEffect, useState, Suspense } from 'react'
import { createClient } from '@/lib/supabase'
import { fmt, ETAPAS_L, ETAPAS_ORD, nowDate, nowStr } from '@/lib/utils'
import type { Cotizacion, Operacion, Gasto, MovimientoCC, MinutaItem, EtapaGasto, Moneda } from '@/types'
import { useSearchParams } from 'next/navigation'

type Tab = 'resumen' | 'gastos' | 'comparativo' | 'cc' | 'minuta'

function OperacionesContent() {
  const searchParams = useSearchParams()
  const cotId = searchParams.get('cot')
  const [ops, setOps] = useState<Array<Operacion & { cotizacion: Cotizacion }>>([])
  const [selId, setSelId] = useState<string>('')
  const [tab, setTab] = useState<Tab>('resumen')
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

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
        <select
          value={selId}
          onChange={e => setSelId(e.target.value)}
          className="ml-auto px-3 py-2 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:border-[#1168F8]"
        >
          {ops.map(o => <option key={o.id} value={o.id}>{o.cotizacion?.num} — {o.cotizacion?.cliente}</option>)}
        </select>
      </div>

      {op && cot && <OperacionDetail op={op} cot={cot} tab={tab} setTab={setTab} reload={loadData} />}
    </div>
  )
}

function OperacionDetail({
  op, cot, tab, setTab, reload
}: {
  op: Operacion & { cotizacion: Cotizacion }
  cot: Cotizacion
  tab: Tab
  setTab: (t: Tab) => void
  reload: () => void
}) {
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [movs, setMovs] = useState<MovimientoCC[]>([])
  const [minuta, setMinuta] = useState<MinutaItem[]>([])
  const [loadingDetail, setLoadingDetail] = useState(true)
  const supabase = createClient()

  useEffect(() => { loadDetail() }, [op.id])

  async function loadDetail() {
    setLoadingDetail(true)
    const [g, m, mi] = await Promise.all([
      supabase.from('gastos').select('*').eq('operacion_id', op.id).order('fecha'),
      supabase.from('movimientos_cc').select('*').eq('operacion_id', op.id).order('fecha'),
      supabase.from('minuta_items').select('*').eq('operacion_id', op.id),
    ])
    if (g.data) setGastos(g.data as Gasto[])
    if (m.data) setMovs(m.data as MovimientoCC[])
    if (mi.data) setMinuta(mi.data as MinutaItem[])
    setLoadingDetail(false)
  }

  const presup = Array.isArray(cot.presupuesto) ? cot.presupuesto : []
  const totalPresup = presup.reduce((s: number, i: any) => s + i.usd, 0)
  const totalReal = gastos.reduce((s, g) => s + g.usd, 0)
  const totalIng = movs.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.usd, 0)
  const totalEg = movs.filter(m => m.tipo === 'egreso').reduce((s, m) => s + m.usd, 0)
  const saldo = totalIng - totalEg
  const diff = totalReal - totalPresup
  const pct = totalPresup > 0 ? Math.min(totalReal / totalPresup * 100, 150) : 0

  const TABS: { key: Tab; label: string }[] = [
    { key: 'resumen', label: 'Resumen' },
    { key: 'gastos', label: 'Gastos reales' },
    { key: 'comparativo', label: 'Presup. vs. Real' },
    { key: 'cc', label: 'Cuenta corriente' },
    { key: 'minuta', label: 'Minuta de pago' },
  ]

  return (
    <>
      {/* Tabs */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${tab === t.key ? 'bg-[#1168F8] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'resumen' && (
        <div>
          <div className="grid grid-cols-4 gap-3 mb-5">
            {[
              { label: 'Presupuestado', value: `USD ${fmt(totalPresup, 0)}`, color: 'text-gray-900' },
              { label: 'Gastado real', value: `USD ${fmt(totalReal, 0)}`, color: pct > 110 ? 'text-red-600' : 'text-gray-900' },
              { label: 'Saldo cliente', value: `USD ${fmt(saldo, 0)}`, color: saldo >= 0 ? 'text-green-700' : 'text-red-600' },
              { label: 'Pendiente pago', value: `USD ${fmt(gastos.filter(g => g.estado !== 'pagado').reduce((s, g) => s + g.usd, 0), 0)}`, color: 'text-amber-600' },
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
            <div className={`border rounded-xl p-4 ${saldo >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <div className={`text-[10px] font-medium mb-1 ${saldo >= 0 ? 'text-green-700' : 'text-red-700'}`}>Saldo cuenta cliente</div>
              <div className={`text-lg font-semibold ${saldo >= 0 ? 'text-green-800' : 'text-red-700'}`}>USD {fmt(saldo, 0)}</div>
              <div className={`text-[10px] mt-1 ${saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>{saldo > 0 ? 'Fondos disponibles' : saldo < 0 ? '⚠ Solicitar fondos al cliente' : 'Exacto'}</div>
            </div>
          </div>
        </div>
      )}

      {tab === 'gastos' && (
        <GastosTab opId={op.id} gastos={gastos} reload={loadDetail} />
      )}

      {tab === 'comparativo' && (
        <ComparativoTab presup={presup} gastos={gastos} />
      )}

      {tab === 'cc' && (
        <CCTab opId={op.id} movs={movs} reload={loadDetail} />
      )}

      {tab === 'minuta' && (
        <MinutaTab opId={op.id} cotNum={cot.num || ''} cliente={cot.cliente} minuta={minuta} reload={loadDetail} />
      )}
    </>
  )
}

function GastosTab({ opId, gastos, reload }: { opId: string; gastos: Gasto[]; reload: () => void }) {
  const [form, setForm] = useState({ etapa: 'maritimo', concepto: '', fecha: nowDate(), estado: 'pendiente', moneda: 'USD', monto: '', tc: '', ref: '', notas: '' })
  const supabase = createClient()

  async function cargar() {
    if (!form.monto) return
    const monto = parseFloat(form.monto)
    const tc = parseFloat(form.tc) || 1
    const usd = form.moneda === 'USD' ? monto : monto / tc
    await (supabase.from('gastos') as any).insert({ operacion_id: opId, fecha: form.fecha, etapa: form.etapa as EtapaGasto, concepto: form.concepto || 'Sin descripción', moneda: form.moneda as Moneda, monto, tc, usd, estado: form.estado as any, ref: form.ref, notas: form.notas })
    setForm(f => ({ ...f, monto: '', concepto: '', ref: '' }))
    reload()
  }

  async function togglePago(g: Gasto) {
    await (((supabase.from('gastos') as any)) as any).update({ estado: g.estado === 'pagado' ? 'pendiente' : 'pagado' }).eq('id', g.id)
    reload()
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar?')) return
    await (supabase.from('gastos') as any).delete().eq('id', id)
    reload()
  }

  return (
    <div>
      <div className="bg-white border border-gray-100 rounded-xl p-5 mb-4">
        <h3 className="font-medium text-sm text-gray-900 mb-4">Cargar gasto real</h3>
        <div className="grid grid-cols-4 gap-3 mb-3">
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Etapa</label><select value={form.etapa} onChange={e => setForm(f => ({ ...f, etapa: e.target.value }))} className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8] bg-white"><option value="maritimo">Flete marítimo</option><option value="chile">Puerto Chile</option><option value="terrestre">Transporte terrestre</option><option value="argentina">Argentina</option><option value="tributos">Tributos ARCA</option><option value="fee">Fee Puerto NOA</option><option value="otro">Otro</option></select></div>
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Concepto / proveedor</label><input value={form.concepto} onChange={e => setForm(f => ({ ...f, concepto: e.target.value }))} className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8]" placeholder="ej. Hellmann" /></div>
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Fecha</label><input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8]" /></div>
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Estado</label><select value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value }))} className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8] bg-white"><option value="pendiente">Pendiente</option><option value="pagado">Pagado</option></select></div>
        </div>
        <div className="grid grid-cols-4 gap-3 mb-3">
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Moneda</label><select value={form.moneda} onChange={e => setForm(f => ({ ...f, moneda: e.target.value }))} className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8] bg-white"><option>USD</option><option>ARS</option><option>CLP</option><option>CNY</option></select></div>
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Monto moneda local</label><input type="text" inputMode="decimal" onFocus={(e)=>e.target.select()} value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8] text-right" placeholder="0.00" /></div>
          {form.moneda !== 'USD' && <div><label className="block text-[10px] text-gray-500 font-medium mb-1">TC (moneda/USD)</label><input type="text" inputMode="decimal" onFocus={(e)=>e.target.select()} value={form.tc} onChange={e => setForm(f => ({ ...f, tc: e.target.value }))} className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8] text-right" placeholder="1000" /></div>}
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Equivalente USD</label><div className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-right font-mono">{form.monto ? fmt(form.moneda === 'USD' ? parseFloat(form.monto) : parseFloat(form.monto) / (parseFloat(form.tc) || 1)) : '—'}</div></div>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">N° factura / ref.</label><input value={form.ref} onChange={e => setForm(f => ({ ...f, ref: e.target.value }))} className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8]" placeholder="Nro. documento" /></div>
        </div>
        <div className="flex justify-end"><button onClick={cargar} className="bg-[#1168F8] text-white px-4 py-2 rounded-lg text-xs font-medium hover:bg-[#0a4fc4] transition-colors">✓ Registrar gasto</button></div>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <span className="font-medium text-sm text-gray-900">Gastos registrados</span>
          <span className="text-xs text-gray-400 font-mono">Total: USD {fmt(gastos.reduce((s, g) => s + g.usd, 0))}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="bg-gray-50 border-b border-gray-100"><th className="text-left px-4 py-2 text-[10px] text-gray-400 font-medium uppercase tracking-wide">Fecha</th><th className="text-left px-4 py-2 text-[10px] text-gray-400 font-medium uppercase tracking-wide">Etapa</th><th className="text-left px-4 py-2 text-[10px] text-gray-400 font-medium uppercase tracking-wide">Concepto</th><th className="text-right px-4 py-2 text-[10px] text-gray-400 font-medium uppercase tracking-wide">Monto local</th><th className="text-right px-4 py-2 text-[10px] text-gray-400 font-medium uppercase tracking-wide">TC</th><th className="text-right px-4 py-2 text-[10px] text-gray-400 font-medium uppercase tracking-wide">USD</th><th className="px-4 py-2 text-[10px] text-gray-400 font-medium uppercase tracking-wide">Estado</th><th className="px-4 py-2 text-[10px] text-gray-400 font-medium uppercase tracking-wide">Ref.</th><th className="px-4 py-2"></th></tr></thead>
            <tbody>
              {gastos.map(g => (
                <tr key={g.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-[10px] text-gray-500">{g.fecha}</td>
                  <td className="px-4 py-3 text-[11px] text-gray-500">{ETAPAS_L[g.etapa] || g.etapa}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{g.concepto}</td>
                  <td className="px-4 py-3 font-mono text-right text-gray-600">{g.moneda} {fmt(g.monto)}</td>
                  <td className="px-4 py-3 font-mono text-right text-gray-400 text-[10px]">{g.moneda === 'USD' ? '—' : fmt(g.tc, 0)}</td>
                  <td className="px-4 py-3 font-mono text-right font-medium">USD {fmt(g.usd)}</td>
                  <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${g.estado === 'pagado' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>{g.estado === 'pagado' ? 'Pagado' : 'Pendiente'}</span></td>
                  <td className="px-4 py-3 text-[10px] text-gray-400">{g.ref || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      <button onClick={() => togglePago(g)} className="p-1.5 border border-gray-200 rounded-md hover:bg-gray-100 text-gray-500 transition-colors text-[10px]">{g.estado === 'pagado' ? '○' : '✓'}</button>
                      <button onClick={() => eliminar(g.id)} className="p-1.5 border border-gray-200 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors text-[10px]">🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!gastos.length && <tr><td colSpan={9} className="px-4 py-6 text-center text-gray-400">Sin gastos registrados aún.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

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
    const d = r - p
    rows.push(
      <tr key={e + '-grp'} className="bg-gray-50"><td colSpan={5} className="px-4 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{ETAPAS_L[e] || e}</td></tr>
    )
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
          <thead><tr className="bg-gray-50 border-b border-gray-100"><th className="text-left px-4 py-2.5 text-[10px] text-gray-400 font-medium uppercase tracking-wide">Concepto</th><th className="text-right px-4 py-2.5 text-[10px] text-gray-400 font-medium uppercase tracking-wide">Presupuestado</th><th className="text-right px-4 py-2.5 text-[10px] text-gray-400 font-medium uppercase tracking-wide">Real</th><th className="text-right px-4 py-2.5 text-[10px] text-gray-400 font-medium uppercase tracking-wide">Diferencia</th><th className="px-4 py-2.5 text-[10px] text-gray-400 font-medium uppercase tracking-wide">%</th></tr></thead>
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

function CCTab({ opId, movs, reload }: { opId: string; movs: MovimientoCC[]; reload: () => void }) {
  const [form, setForm] = useState({ tipo: 'ingreso', concepto: '', moneda: 'USD', monto: '', tc: '', fecha: nowDate(), ref: '' })
  const supabase = createClient()
  const totalIng = movs.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.usd, 0)
  const totalEg = movs.filter(m => m.tipo === 'egreso').reduce((s, m) => s + m.usd, 0)
  const saldo = totalIng - totalEg

  async function cargar() {
    if (!form.monto) return
    const monto = parseFloat(form.monto), tc = parseFloat(form.tc) || 1
    const usd = form.moneda === 'USD' ? monto : monto / tc
    await (supabase.from('movimientos_cc') as any).insert({ operacion_id: opId, tipo: form.tipo as any, concepto: form.concepto || 'Sin descripción', moneda: form.moneda as Moneda, monto, tc, usd, fecha: form.fecha, ref: form.ref })
    setForm(f => ({ ...f, monto: '', concepto: '', ref: '' }))
    reload()
  }

  let saldoAcum = 0

  return (
    <div>
      <div className="bg-white border border-gray-100 rounded-xl p-5 mb-4">
        <h3 className="font-medium text-sm text-gray-900 mb-4">Registrar movimiento de fondos</h3>
        <div className="grid grid-cols-4 gap-3 mb-3">
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Tipo</label><select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))} className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8] bg-white"><option value="ingreso">Ingreso (fondo cliente)</option><option value="egreso">Egreso (pago proveedor)</option></select></div>
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Concepto</label><input value={form.concepto} onChange={e => setForm(f => ({ ...f, concepto: e.target.value }))} className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8]" placeholder="ej. Anticipo operación" /></div>
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Fecha</label><input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8]" /></div>
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Moneda</label><select value={form.moneda} onChange={e => setForm(f => ({ ...f, moneda: e.target.value }))} className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8] bg-white"><option>USD</option><option>ARS</option><option>CLP</option><option>CNY</option></select></div>
        </div>
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Monto moneda local</label><input type="text" inputMode="decimal" onFocus={(e)=>e.target.select()} value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8] text-right" placeholder="0.00" /></div>
          {form.moneda !== 'USD' && <div><label className="block text-[10px] text-gray-500 font-medium mb-1">TC</label><input type="text" inputMode="decimal" onFocus={(e)=>e.target.select()} value={form.tc} onChange={e => setForm(f => ({ ...f, tc: e.target.value }))} className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8] text-right" placeholder="1000" /></div>}
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">USD</label><div className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-right font-mono">{form.monto ? fmt(form.moneda === 'USD' ? parseFloat(form.monto) : parseFloat(form.monto) / (parseFloat(form.tc) || 1)) : '—'}</div></div>
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Ref. / comprobante</label><input value={form.ref} onChange={e => setForm(f => ({ ...f, ref: e.target.value }))} className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8]" placeholder="N° transferencia" /></div>
        </div>
        <div className="flex justify-end"><button onClick={cargar} className="bg-[#1168F8] text-white px-4 py-2 rounded-lg text-xs font-medium hover:bg-[#0a4fc4] transition-colors">✓ Registrar movimiento</button></div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4"><div className="text-[10px] font-medium text-green-700 mb-1">Fondos recibidos</div><div className="text-xl font-semibold text-green-800">USD {fmt(totalIng)}</div></div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4"><div className="text-[10px] font-medium text-red-700 mb-1">Pagado a proveedores</div><div className="text-xl font-semibold text-red-700">USD {fmt(totalEg)}</div></div>
        <div className={`border rounded-xl p-4 ${saldo >= 0 ? 'bg-[#EBF2FF] border-[#93B8FC]' : 'bg-red-50 border-red-200'}`}><div className={`text-[10px] font-medium mb-1 ${saldo >= 0 ? 'text-[#052698]' : 'text-red-700'}`}>Saldo disponible</div><div className={`text-xl font-semibold ${saldo >= 0 ? 'text-[#052698]' : 'text-red-700'}`}>USD {fmt(saldo)}</div><div className={`text-[10px] mt-1 ${saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>{saldo < 0 ? '⚠ Solicitar fondos al cliente' : 'Fondos disponibles'}</div></div>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100"><span className="font-medium text-sm text-gray-900">Movimientos</span></div>
        <div>
          {movs.map(m => {
            saldoAcum += m.tipo === 'ingreso' ? m.usd : -m.usd
            return (
              <div key={m.id} className="flex items-center gap-3 px-5 py-3 border-b border-gray-50 text-xs">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${m.tipo === 'ingreso' ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="font-mono text-[10px] text-gray-400 w-20">{m.fecha}</span>
                <span className="flex-1 text-gray-800">{m.concepto}</span>
                <span className="text-[10px] text-gray-400">{m.moneda !== 'USD' ? `${m.moneda} ${fmt(m.monto)} · TC ${fmt(m.tc, 0)} · ` : ''}{m.ref || ''}</span>
                <span className={`font-mono font-medium min-w-24 text-right ${m.tipo === 'ingreso' ? 'text-green-700' : 'text-red-600'}`}>{m.tipo === 'ingreso' ? '+' : '−'} USD {fmt(m.usd)}</span>
                <span className={`font-mono text-[10px] min-w-24 text-right ${saldoAcum >= 0 ? 'text-green-700' : 'text-red-600'}`}>= USD {fmt(saldoAcum)}</span>
              </div>
            )
          })}
          {!movs.length && <div className="px-5 py-6 text-center text-gray-400 text-xs">Sin movimientos registrados.</div>}
        </div>
      </div>
    </div>
  )
}

function MinutaTab({ opId, cotNum, cliente, minuta, reload }: { opId: string; cotNum: string; cliente: string; minuta: MinutaItem[]; reload: () => void }) {
  const [form, setForm] = useState({ prov: '', concepto: '', moneda: 'USD', monto: '', fecha: nowDate(), banco: '', cuenta: '', swift: '', notas: '' })
  const supabase = createClient()

  async function agregar() {
    if (!form.prov || !form.monto) { alert('Completá proveedor y monto.'); return }
    await (supabase.from('minuta_items') as any).insert({ operacion_id: opId, proveedor: form.prov, concepto: form.concepto, moneda: form.moneda as Moneda, monto: parseFloat(form.monto), fecha_vto: form.fecha, banco: form.banco, cuenta: form.cuenta, swift: form.swift, notas: form.notas })
    setForm({ prov: '', concepto: '', moneda: 'USD', monto: '', fecha: nowDate(), banco: '', cuenta: '', swift: '', notas: '' })
    reload()
  }

  async function eliminar(id: string) {
    await (supabase.from('minuta_items') as any).delete().eq('id', id)
    reload()
  }

  return (
    <div>
      <div className="bg-white border border-gray-100 rounded-xl p-5 mb-4">
        <h3 className="font-medium text-sm text-gray-900 mb-4">Agregar ítem a la minuta</h3>
        <div className="grid grid-cols-4 gap-3 mb-3">
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Proveedor</label><input value={form.prov} onChange={e => setForm(f => ({ ...f, prov: e.target.value }))} className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8]" placeholder="ej. Hellmann Logistics" /></div>
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Concepto</label><input value={form.concepto} onChange={e => setForm(f => ({ ...f, concepto: e.target.value }))} className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8]" placeholder="ej. Flete marítimo" /></div>
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Moneda</label><select value={form.moneda} onChange={e => setForm(f => ({ ...f, moneda: e.target.value }))} className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8] bg-white"><option>USD</option><option>ARS</option><option>CLP</option></select></div>
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Monto</label><input type="text" inputMode="decimal" onFocus={(e)=>e.target.select()} value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8] text-right" placeholder="0.00" /></div>
        </div>
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Fecha vencimiento</label><input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8]" /></div>
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Banco / entidad</label><input value={form.banco} onChange={e => setForm(f => ({ ...f, banco: e.target.value }))} className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8]" placeholder="ej. Banco BCI Chile" /></div>
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">N° cuenta / CBU / IBAN</label><input value={form.cuenta} onChange={e => setForm(f => ({ ...f, cuenta: e.target.value }))} className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8]" /></div>
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Swift / CLABE / alias</label><input value={form.swift} onChange={e => setForm(f => ({ ...f, swift: e.target.value }))} className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8]" /></div>
        </div>
        <div className="mb-4"><label className="block text-[10px] text-gray-500 font-medium mb-1">Notas / instrucciones</label><input value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8]" placeholder="Referencia a incluir en la transferencia" /></div>
        <div className="flex justify-end"><button onClick={agregar} className="bg-[#1168F8] text-white px-4 py-2 rounded-lg text-xs font-medium hover:bg-[#0a4fc4] transition-colors">+ Agregar a minuta</button></div>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <div><span className="font-medium text-sm text-gray-900">Minuta de pago — {cotNum}</span><span className="text-xs text-gray-400 ml-2">{cliente}</span></div>
          <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs hover:bg-gray-50 transition-colors">🖨 Imprimir</button>
        </div>
        <div className="divide-y divide-gray-50">
          {minuta.map(it => (
            <div key={it.id} className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div><div className="font-semibold text-sm text-gray-900">{it.proveedor}</div><div className="text-xs text-gray-500 mt-0.5">{it.concepto}</div></div>
                <div className="text-right"><div className="text-lg font-semibold text-[#052698]">{it.moneda} {fmt(it.monto)}</div><div className="text-[10px] text-gray-400 mt-0.5">Vence: {it.fecha_vto || '—'}</div></div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs border-t border-gray-100 pt-3">
                <div><span className="text-gray-400">Banco: </span><span className="text-gray-700">{it.banco || '—'}</span></div>
                <div><span className="text-gray-400">Cuenta/CBU: </span><span className="font-mono text-gray-700">{it.cuenta || '—'}</span></div>
                <div><span className="text-gray-400">Swift/CLABE: </span><span className="font-mono text-gray-700">{it.swift || '—'}</span></div>
                <div><span className="text-gray-400">Notas: </span><span className="text-gray-700">{it.notas || '—'}</span></div>
              </div>
              <div className="flex justify-end mt-2">
                <button onClick={() => eliminar(it.id)} className="text-gray-400 hover:text-red-500 text-xs transition-colors">🗑 Quitar</button>
              </div>
            </div>
          ))}
          {!minuta.length && <div className="px-5 py-6 text-center text-gray-400 text-xs">Agregá ítems a la minuta para presentar al cliente.</div>}
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
