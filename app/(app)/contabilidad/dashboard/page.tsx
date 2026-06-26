'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { cargarPermisos, puede } from '@/lib/permisos'

// ── Marca Puerto NOA ──
const C = { azul: '#1168F8', azulOsc: '#052698', verde: '#0a9e6e', ambar: '#ef9f27', violeta: '#7C3AED', rojo: '#E11D48', teal: '#0d9488', coral: '#FB7185' }
const MESES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const fmtCLP = (n: number) => `$ ${(n || 0).toLocaleString('es-CL', { maximumFractionDigits: 0 })}`
const fmtCLPc = (n: number) => Math.abs(n) >= 1e6 ? `$ ${(n / 1e6).toLocaleString('es-CL', { maximumFractionDigits: 2 })}M` : fmtCLP(n)
const fmtUSD = (n: number) => `USD ${(n || 0).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtUSDk = (n: number) => Math.abs(n) >= 10000 ? `USD ${(n / 1000).toLocaleString('es-CL', { maximumFractionDigits: 1 })}k` : `USD ${(n || 0).toLocaleString('es-CL', { maximumFractionDigits: 0 })}`
const signoFondo = (m: any) => m.tipo === 'transferencia' ? 0 : (m.tipo === 'ingreso_cliente' ? (m.usd || 0) : -(m.usd || 0))

function Donut({ segments, size = 120, stroke = 16, track = '#eef2f7' }: { segments: { value: number; color: string }[]; size?: number; stroke?: number; track?: string }) {
  const total = segments.reduce((t, s) => t + s.value, 0) || 1
  const r = (size - stroke) / 2, c = 2 * Math.PI * r
  let off = 0
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        {segments.map((s, i) => {
          const len = (s.value / total) * c
          const el = <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={stroke} strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off} strokeLinecap="round" />
          off += len
          return el
        })}
      </g>
    </svg>
  )
}
function Bar({ pct, color }: { pct: number; color: string }) {
  return <div className="w-full bg-gray-100 rounded-full overflow-hidden" style={{ height: 7 }}><div className="rounded-full" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: 7, background: color }} /></div>
}

function MiniChart({ serie }: { serie: any[] }) {
  const W = 1100, H = 230, padB = 28, padT = 10, plot = H - padB - padT
  const maxV = Math.max(1, ...serie.map(s => Math.max(s.ing, s.cost)))
  const gw = W / 12, bw = 18
  const y = (v: number) => padT + plot - (v / maxV * plot)
  const grid = [0, maxV / 3, maxV * 2 / 3, maxV]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="230" preserveAspectRatio="none" style={{ maxHeight: 230 }}>
      {grid.map((g, i) => (
        <g key={i}><line x1={0} y1={y(g)} x2={W} y2={y(g)} stroke="#eef2f7" /><text x={2} y={y(g) - 3} fontSize={10} fill="#94a3b8">{Math.round(g / 1000)}k</text></g>
      ))}
      {serie.map((s, i) => {
        const cx = i * gw + gw / 2
        return (
          <g key={i}>
            <rect x={cx - bw - 2} y={y(s.ing)} width={bw} height={y(0) - y(s.ing)} rx={4} fill={C.azul} />
            <rect x={cx + 2} y={y(s.cost)} width={bw} height={y(0) - y(s.cost)} rx={4} fill="#c7d2fe" />
            <text x={cx} y={H - 9} fontSize={11} fill="#64748b" textAnchor="middle">{s.mes}</text>
          </g>
        )
      })}
      <polyline fill="none" stroke={C.verde} strokeWidth={2.5} points={serie.map((s, i) => `${i * gw + gw / 2},${y(Math.max(0, s.neto))}`).join(' ')} />
      {serie.map((s, i) => <circle key={i} cx={i * gw + gw / 2} cy={y(Math.max(0, s.neto))} r={3} fill={C.verde} />)}
    </svg>
  )
}

export default function DashboardFinancieroPage() {
  const supabase = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(true)
  const [d, setD] = useState<any>(null)
  const [permisos, setPermisos] = useState<Record<string, string[]>>({})
  const [permListos, setPermListos] = useState(false)
  useEffect(() => { cargarPermisos().then(p => { setPermisos(p); setPermListos(true) }) }, [])
  useEffect(() => { load() }, [])

  const anio = new Date().getFullYear()
  const mes = new Date().getMonth() + 1

  async function load() {
    setLoading(true)
    const hoy = new Date(); const isoHoy = hoy.toISOString().slice(0, 10)
    const [tcRes, utilRes, ivavRes, ivacRes, feRes, frRes, gfRes, gcRes, cpRes, fmRes, terRes, dcRes] = await Promise.all([
      supabase.from('tipos_cambio_eventos').select('clp,ars,created_at').order('created_at', { ascending: false }).limit(1),
      (supabase.from('utilidad_operacion') as any).select('ingresos_usd,costos_proveedor_usd,margen_bruto_usd,fecha_cierre'),
      (supabase.from('libro_iva_ventas') as any).select('iva_clp').eq('anio', anio).eq('mes', mes),
      (supabase.from('libro_iva_compras') as any).select('credito_fiscal_clp').eq('anio', anio).eq('mes', mes),
      supabase.from('facturas_emitidas').select('total_usd,estado,fecha_emision,fecha_vencimiento,tercero_id,tipo_cobro'),
      supabase.from('facturas_recibidas').select('total_usd,estado,fecha_emision,fecha_vencimiento,tercero_id,a_recuperar'),
      (supabase.from('gastos_fijos_pn') as any).select('monto_clp_equiv,categoria_id,periodo_anio,periodo_mes'),
      (supabase.from('gastos_fijos_categorias') as any).select('id,nombre'),
      (supabase.from('cuentas_pn') as any).select('moneda,saldo_actual,activo').eq('activo', true),
      supabase.from('fondos_movimientos').select('tipo,usd'),
      supabase.from('terceros').select('id,razon_social'),
      (supabase.from('notas_diferencia_cambio') as any).select('tipo,monto_clp,fecha').eq('afecta_resultado', true).eq('estado', 'confirmada').gte('fecha', `${anio}-01-01`).lte('fecha', `${anio}-12-31`),
    ])

    const tc = (tcRes.data?.[0] as any) || {}
    const tcClp = tc.clp || 912, tcArs = tc.ars || 1450
    const tcOk = tc.created_at ? new Date(tc.created_at).toDateString() === hoy.toDateString() : false
    const util = (utilRes.data || []) as any[]
    const fe = (feRes.data || []) as any[]
    const fr = (frRes.data || []) as any[]
    const gf = (gfRes.data || []) as any[]
    const cats: Record<string, string> = {}; (gcRes.data || []).forEach((c: any) => cats[c.id] = c.nombre)
    const ter: Record<string, string> = {}; (terRes.data || []).forEach((t: any) => ter[t.id] = t.razon_social)
    const fm = (fmRes.data || []) as any[]

    // YTD desde utilidad_operacion
    const utilYTD = util.filter(u => u.fecha_cierre && u.fecha_cierre >= `${anio}-01-01`)
    const ingresosYTD = utilYTD.reduce((t, u) => t + (u.ingresos_usd || 0), 0)
    const costosYTD = utilYTD.reduce((t, u) => t + (u.costos_proveedor_usd || 0), 0)
    const margenBrutoYTD = utilYTD.reduce((t, u) => t + (u.margen_bruto_usd || 0), 0)
    const opsCerradas = utilYTD.length
    const gastosYTDclp = gf.filter(g => g.periodo_anio === anio).reduce((t, g) => t + (g.monto_clp_equiv || 0), 0)
    const gastosYTDusd = gastosYTDclp / tcClp
    const margenNetoYTD = margenBrutoYTD - gastosYTDusd
    // Diferencia de cambio del ejercicio (resultado financiero): débito suma, crédito resta. CLP→USD.
    const dcYTDclp = ((dcRes.data || []) as any[]).reduce((t: number, n: any) => t + (n.tipo === 'debito' ? 1 : -1) * (Number(n.monto_clp) || 0), 0)
    const difCambioYTD = dcYTDclp / tcClp
    const resultadoEjercicio = margenNetoYTD + difCambioYTD   // alineado con la pantalla Resultados
    const margenPct = ingresosYTD > 0 ? margenNetoYTD / ingresosYTD * 100 : 0
    const margenBrutoPct = ingresosYTD > 0 ? margenBrutoYTD / ingresosYTD * 100 : 0

    // IVA mes
    const ivaVentas = (ivavRes.data || []).reduce((t: number, r: any) => t + (r.iva_clp || 0), 0)
    const ivaCompras = (ivacRes.data || []).reduce((t: number, r: any) => t + (r.credito_fiscal_clp || 0), 0)
    const ivaSaldo = ivaVentas - ivaCompras

    // Por cobrar / pagar
    const pendFE = fe.filter(f => !['pagada', 'anulada'].includes(f.estado))
    const pendFR = fr.filter(f => !['pagada', 'anulada'].includes(f.estado))
    const porCobrar = pendFE.reduce((t, f) => t + (f.total_usd || 0), 0)
    const porPagar = pendFR.reduce((t, f) => t + (f.total_usd || 0), 0)

    // Aging
    const aging = (arr: any[]) => {
      let alDia = 0, d30 = 0, d60 = 0
      arr.forEach(f => {
        const v = f.total_usd || 0
        if (!f.fecha_vencimiento || f.fecha_vencimiento >= isoHoy) { alDia += v; return }
        const od = Math.floor((hoy.getTime() - new Date(f.fecha_vencimiento).getTime()) / 86400000)
        if (od <= 30) d30 += v; else d60 += v
      })
      return { alDia, d30, d60, total: alDia + d30 + d60 }
    }
    const agCobrar = aging(pendFE), agPagar = aging(pendFR)

    // Top deudores
    const deudMap: Record<string, number> = {}
    pendFE.forEach(f => { const k = f.tercero_id || '—'; deudMap[k] = (deudMap[k] || 0) + (f.total_usd || 0) })
    const topDeudores = Object.entries(deudMap).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => [ter[k] || 'Cliente', v])

    // Recupero
    const recCobrado = fe.filter(f => f.tipo_cobro === 'recupero_gastos' && f.estado !== 'anulada' && f.fecha_emision >= `${anio}-01-01`).reduce((t, f) => t + (f.total_usd || 0), 0)
    const recPagado = fr.filter(f => f.a_recuperar === true && f.estado !== 'anulada' && (f.fecha_emision || '') >= `${anio}-01-01`).reduce((t, f) => t + (f.total_usd || 0), 0)
    const markup = recCobrado - recPagado

    // Serie 12 meses
    const serie: { anio: number; mes: number }[] = []
    let yy = anio, mm = mes
    for (let i = 0; i < 12; i++) { serie.unshift({ anio: yy, mes: mm }); mm--; if (mm < 1) { mm = 12; yy-- } }
    const um: Record<string, any> = {}
    util.forEach(u => { if (!u.fecha_cierre) return; const dt = new Date(u.fecha_cierre); const k = `${dt.getFullYear()}-${dt.getMonth() + 1}`; if (!um[k]) um[k] = { ing: 0, cost: 0, mb: 0 }; um[k].ing += u.ingresos_usd || 0; um[k].cost += u.costos_proveedor_usd || 0; um[k].mb += u.margen_bruto_usd || 0 })
    const gm: Record<string, number> = {}
    gf.forEach(g => { const k = `${g.periodo_anio}-${g.periodo_mes}`; gm[k] = (gm[k] || 0) + (g.monto_clp_equiv || 0) })
    const serieData = serie.map(s => { const k = `${s.anio}-${s.mes}`; const u = um[k] || { ing: 0, cost: 0, mb: 0 }; const gUSD = (gm[k] || 0) / tcClp; return { mes: MESES[s.mes], ing: u.ing, cost: u.cost, neto: u.mb - gUSD } })

    // Tesorería
    const saldoMon = (mon: string) => (cpRes.data || []).filter((c: any) => c.moneda === mon).reduce((t: number, c: any) => t + (c.saldo_actual || 0), 0)
    const cuentasCLP = saldoMon('CLP'), cuentasUSD = saldoMon('USD'), cuentasARS = saldoMon('ARS')
    const consolidadoUSD = cuentasUSD + cuentasCLP / tcClp + cuentasARS / tcArs
    const custodiaUSD = fm.reduce((t, m) => t + signoFondo(m), 0)

    // Gastos por categoría (mes)
    const gMes = gf.filter(g => g.periodo_anio === anio && g.periodo_mes === mes)
    const gastosMes = gMes.reduce((t, g) => t + (g.monto_clp_equiv || 0), 0)
    const catMap: Record<string, number> = {}
    gMes.forEach(g => { const k = cats[g.categoria_id] || 'Otros'; catMap[k] = (catMap[k] || 0) + (g.monto_clp_equiv || 0) })
    const gastosCats = Object.entries(catMap).sort((a, b) => b[1] - a[1])

    setD({
      tcClp, tcArs, tcOk,
      ingresosYTD, costosYTD, margenBrutoYTD, margenNetoYTD, margenPct, margenBrutoPct, gastosYTDusd, opsCerradas,
      difCambioYTD, resultadoEjercicio,
      ivaVentas, ivaCompras, ivaSaldo,
      porCobrar, porPagar, posNeta: porCobrar - porPagar, agCobrar, agPagar, topDeudores,
      recCobrado, recPagado, markup,
      serieData, cuentasCLP, cuentasUSD, cuentasARS, consolidadoUSD, custodiaUSD,
      gastosMes, gastosCats,
    })
    setLoading(false)
  }

  if (loading || !d) return <div className="p-12 text-center text-gray-400">Cargando...</div>
  if (permListos && !puede(permisos, 'dashboard_financiero', 'ver')) {
    return <div className="p-6 bg-gray-50 min-h-screen flex items-center justify-center"><div className="text-center max-w-sm"><div className="text-5xl mb-3">🔒</div><h2 className="text-lg font-bold text-gray-700">Sin acceso</h2><p className="text-sm text-gray-400 mt-1">No tenés permiso para ver esta sección.</p></div></div>
  }

  const ivaNeg = d.ivaSaldo < 0
  const agPct = (ag: any, k: string) => ag.total > 0 ? ag[k] / ag.total * 100 : 0
  const maxGasto = Math.max(1, ...d.gastosCats.map((c: any) => c[1]))
  const catColors = [C.azul, C.violeta, C.teal, C.ambar, C.coral, '#94a3b8']

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dashboard financiero 💰</h1>
          <p className="text-xs text-gray-400 mt-0.5">Puerto NOA SpA · {MESES[mes]} {anio} · año en curso · TC USD/CLP {d.tcClp.toLocaleString('es-CL')}{!d.tcOk && ' · TC sin actualizar hoy'}</p>
        </div>
        <div className="flex gap-2">
          {[{ l: 'Libro IVA', h: '/contabilidad/iva' }, { l: 'Gastos', h: '/contabilidad/gastos' }, { l: 'Resultados', h: '/contabilidad/resultados' }].map(x => (
            <Link key={x.h} href={x.h} className="px-3 py-1.5 border border-gray-200 rounded-xl text-xs text-gray-600 hover:border-[#1168F8] hover:text-[#1168F8] bg-white font-semibold">{x.l}</Link>
          ))}
        </div>
      </div>

      {/* HERO Resultado */}
      <div className="rounded-3xl p-6 mb-4 text-white grid gap-5" style={{ gridTemplateColumns: '1.3fr 1fr', background: 'linear-gradient(135deg,#1168F8 0%,#052698 100%)', boxShadow: '0 8px 24px rgba(17,104,248,.22)' }}>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider opacity-75">Resultado del ejercicio · año en curso</div>
          <div className="font-extrabold font-mono" style={{ fontSize: 40, marginTop: 4 }}>{fmtUSDk(d.resultadoEjercicio)}</div>
          <div className="flex gap-2 mt-2 flex-wrap">
            <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: 'rgba(255,255,255,.16)' }}>{d.margenPct >= 0 ? '▲' : '▼'} {Math.abs(d.margenPct).toFixed(1)}% margen</span>
            <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: 'rgba(255,255,255,.16)' }}>{d.opsCerradas} operaciones cerradas</span>
          </div>
          <div className="flex gap-6 mt-5 flex-wrap">
            <div><div className="text-[10px] opacity-70 uppercase tracking-wide">Margen bruto</div><div className="font-extrabold font-mono" style={{ fontSize: 19, marginTop: 2 }}>{fmtUSDk(d.margenBrutoYTD)}</div></div>
            <div><div className="text-[10px] opacity-70 uppercase tracking-wide">Gastos fijos</div><div className="font-extrabold font-mono" style={{ fontSize: 19, marginTop: 2 }}>{fmtUSDk(d.gastosYTDusd)}</div></div>
            <div><div className="text-[10px] opacity-70 uppercase tracking-wide">Margen neto</div><div className="font-extrabold font-mono" style={{ fontSize: 19, marginTop: 2 }}>{fmtUSDk(d.margenNetoYTD)}</div></div>
            <div><div className="text-[10px] opacity-70 uppercase tracking-wide">± Dif. cambio</div><div className="font-extrabold font-mono" style={{ fontSize: 19, marginTop: 2, color: d.difCambioYTD < 0 ? '#FCA5A5' : '#7CF5C4' }}>{d.difCambioYTD < 0 ? '−' : '+'}{fmtUSDk(Math.abs(d.difCambioYTD))}</div></div>
          </div>
        </div>
        <div className="rounded-2xl p-4 flex items-center gap-4" style={{ background: 'rgba(255,255,255,.1)' }}>
          <div className="relative" style={{ width: 120, height: 120, flexShrink: 0 }}>
            <Donut size={120} stroke={16} track="rgba(255,255,255,.18)" segments={[{ value: d.margenBrutoYTD > 0 ? d.margenBrutoYTD : 0, color: '#7CF5C4' }, { value: d.costosYTD > 0 ? d.costosYTD : 0, color: 'rgba(255,255,255,.55)' }]} />
            <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="font-extrabold" style={{ fontSize: 22 }}>{Math.round(d.margenBrutoPct)}%</span><span className="text-[8px] opacity-80 uppercase">margen br.</span></div>
          </div>
          <div className="text-xs">
            <div className="flex items-center gap-2 mb-2"><span style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(255,255,255,.6)' }} /><span className="opacity-85">Costos</span><b className="ml-auto">{fmtUSDk(d.costosYTD)}</b></div>
            <div className="flex items-center gap-2 mb-2"><span style={{ width: 10, height: 10, borderRadius: 3, background: '#7CF5C4' }} /><span className="opacity-85">Margen</span><b className="ml-auto">{fmtUSDk(d.margenBrutoYTD)}</b></div>
            <div className="flex items-center gap-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,.2)' }}><span className="opacity-85">Ingresos</span><b className="ml-auto">{fmtUSDk(d.ingresosYTD)}</b></div>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-5 gap-3 mb-4">
        {[
          { l: 'Ingresos YTD', v: fmtUSDk(d.ingresosYTD), icon: '📈', color: C.azul, bar: 100, barC: C.azul },
          { l: 'Costos YTD', v: fmtUSDk(d.costosYTD), icon: '📉', color: C.violeta, bar: d.ingresosYTD > 0 ? d.costosYTD / d.ingresosYTD * 100 : 0, barC: C.violeta },
          { l: `IVA a pagar · ${MESES[mes]}`, v: fmtCLP(Math.abs(d.ivaSaldo)), icon: '🧾', color: ivaNeg ? C.verde : C.rojo, sub: ivaNeg ? 'remanente CF' : 'F29 línea 48' },
          { l: 'Por cobrar', v: fmtUSDk(d.porCobrar), icon: '📥', color: C.teal, bar: agPct(d.agCobrar, 'alDia'), barC: C.teal, sub: `${Math.round(agPct(d.agCobrar, 'alDia'))}% al día` },
          { l: 'Por pagar', v: fmtUSDk(d.porPagar), icon: '📤', color: C.coral, bar: agPct(d.agPagar, 'alDia'), barC: C.coral, sub: `${Math.round(agPct(d.agPagar, 'alDia'))}% al día` },
        ].map((k, i) => (
          <div key={i} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <div className="flex justify-between items-center mb-1.5"><span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{k.l}</span><span className="text-sm">{k.icon}</span></div>
            <div className="text-lg font-extrabold font-mono" style={{ color: k.color }}>{k.v}</div>
            {k.bar !== undefined ? <div className="mt-2"><Bar pct={k.bar} color={k.barC!} /></div> : null}
            {k.sub ? <div className="text-[9px] text-gray-400 mt-1.5 font-semibold">{k.sub}</div> : null}
          </div>
        ))}
      </div>

      {/* Evolución mensual */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm mb-4">
        <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Evolución mensual · ingresos vs costos · margen neto</span>
          <div className="flex gap-3 text-[11px] text-gray-500">
            <span className="flex items-center gap-1.5"><span style={{ width: 10, height: 10, borderRadius: 3, background: C.azul }} />Ingresos</span>
            <span className="flex items-center gap-1.5"><span style={{ width: 10, height: 10, borderRadius: 3, background: '#c7d2fe' }} />Costos</span>
            <span className="flex items-center gap-1.5"><span style={{ width: 14, height: 3, borderRadius: 3, background: C.verde }} />Margen neto</span>
          </div>
        </div>
        <MiniChart serie={d.serieData} />
      </div>

      {/* IVA F29 + Recupero */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-3">IVA del mes · F29 ({MESES[mes]})</div>
          <div className="space-y-3">
            <div><div className="flex justify-between text-[11px] mb-1"><span className="text-gray-500">Débito fiscal (ventas)</span><b className="font-mono">{fmtCLP(d.ivaVentas)}</b></div><Bar pct={100} color={C.ambar} /></div>
            <div><div className="flex justify-between text-[11px] mb-1"><span className="text-gray-500">Crédito fiscal (compras)</span><b className="font-mono">{fmtCLP(d.ivaCompras)}</b></div><Bar pct={d.ivaVentas > 0 ? d.ivaCompras / d.ivaVentas * 100 : 0} color={C.verde} /></div>
          </div>
          <div className={`mt-4 rounded-2xl p-3.5 flex justify-between items-center ${ivaNeg ? 'bg-green-50' : 'bg-red-50'}`}>
            <div><div className={`text-[10px] font-bold uppercase ${ivaNeg ? 'text-green-700' : 'text-red-700'}`}>{ivaNeg ? 'Remanente crédito fiscal' : 'A pagar al SII'}</div><div className={`text-[9px] mt-0.5 ${ivaNeg ? 'text-green-500' : 'text-red-400'}`}>F29 línea 48</div></div>
            <div className={`text-xl font-extrabold font-mono ${ivaNeg ? 'text-green-700' : 'text-red-600'}`}>{fmtCLP(Math.abs(d.ivaSaldo))}</div>
          </div>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-3">Recupero de gastos (pass-through) · {anio}</div>
          <div className="flex items-center justify-around text-center mb-2">
            <div><div className="text-[10px] text-gray-500">Cobrado a clientes</div><div className="font-extrabold font-mono mt-1" style={{ fontSize: 22, color: C.teal }}>{fmtUSDk(d.recCobrado)}</div></div>
            <div className="text-xl text-gray-300">→</div>
            <div><div className="text-[10px] text-gray-500">Pagado a proveedores</div><div className="font-extrabold font-mono mt-1" style={{ fontSize: 22, color: C.coral }}>{fmtUSDk(d.recPagado)}</div></div>
          </div>
          <div className="mt-3 rounded-2xl p-3.5 flex justify-between items-center" style={{ background: d.markup >= 0 ? '#ecfdf5' : '#fff1f2' }}>
            <span className="text-[11px] font-bold uppercase" style={{ color: d.markup >= 0 ? C.verde : C.rojo }}>Markup recupero</span>
            <span className="font-extrabold font-mono" style={{ fontSize: 20, color: d.markup >= 0 ? C.verde : C.rojo }}>{d.markup >= 0 ? '+ ' : '- '}{fmtUSDk(Math.abs(d.markup))}</span>
          </div>
          <div className="text-[10px] text-gray-400 mt-2.5 leading-relaxed">Lo que se factura de más sobre lo que se paga a proveedores es ganancia real de gestión.</div>
        </div>
      </div>

      {/* Cobranzas + Pagos */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <div className="flex justify-between items-center mb-3"><span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Por cobrar a clientes</span><span className="font-extrabold font-mono" style={{ fontSize: 17, color: C.teal }}>{fmtUSDk(d.porCobrar)}</span></div>
          <div className="flex rounded-full overflow-hidden mb-2.5" style={{ height: 12 }}>
            <div style={{ width: `${agPct(d.agCobrar, 'alDia')}%`, background: C.teal }} /><div style={{ width: `${agPct(d.agCobrar, 'd30')}%`, background: C.ambar }} /><div style={{ width: `${agPct(d.agCobrar, 'd60')}%`, background: C.rojo }} />
          </div>
          <div className="flex gap-3 text-[10px] text-gray-500 mb-3"><span style={{ color: C.teal }}>● <span className="text-gray-500">Al día {fmtUSDk(d.agCobrar.alDia)}</span></span><span style={{ color: C.ambar }}>● <span className="text-gray-500">1-30d {fmtUSDk(d.agCobrar.d30)}</span></span><span style={{ color: C.rojo }}>● <span className="text-gray-500">+30d {fmtUSDk(d.agCobrar.d60)}</span></span></div>
          <div className="text-[11px] text-gray-500 mb-1.5">Top deudores</div>
          {d.topDeudores.length === 0 ? <div className="text-[11px] text-gray-400 py-1">Sin facturas por cobrar</div> : d.topDeudores.map((t: any, i: number) => (
            <div key={i} className="flex justify-between py-1.5 border-b border-gray-50 last:border-0 text-xs"><span className="text-gray-700 truncate">{t[0]}</span><b className="font-mono">{fmtUSDk(t[1])}</b></div>
          ))}
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <div className="flex justify-between items-center mb-3"><span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Por pagar a proveedores</span><span className="font-extrabold font-mono" style={{ fontSize: 17, color: C.coral }}>{fmtUSDk(d.porPagar)}</span></div>
          <div className="flex rounded-full overflow-hidden mb-2.5" style={{ height: 12 }}>
            <div style={{ width: `${agPct(d.agPagar, 'alDia')}%`, background: C.azul }} /><div style={{ width: `${agPct(d.agPagar, 'd30')}%`, background: C.ambar }} /><div style={{ width: `${agPct(d.agPagar, 'd60')}%`, background: C.rojo }} />
          </div>
          <div className="flex gap-3 text-[10px] text-gray-500 mb-3"><span style={{ color: C.azul }}>● <span className="text-gray-500">Al día {fmtUSDk(d.agPagar.alDia)}</span></span><span style={{ color: C.ambar }}>● <span className="text-gray-500">1-30d {fmtUSDk(d.agPagar.d30)}</span></span><span style={{ color: C.rojo }}>● <span className="text-gray-500">+30d {fmtUSDk(d.agPagar.d60)}</span></span></div>
          <div className="rounded-2xl p-3.5 flex justify-between items-center" style={{ background: '#eff6ff' }}>
            <span className="text-[11px] font-bold uppercase" style={{ color: C.azulOsc }}>Posición neta</span>
            <span className="font-extrabold font-mono" style={{ fontSize: 17, color: C.azulOsc }}>{d.posNeta >= 0 ? '+ ' : '- '}{fmtUSDk(Math.abs(d.posNeta))}</span>
          </div>
          <div className="text-[10px] text-gray-400 mt-2">{d.posNeta >= 0 ? 'Cobramos más de lo que debemos: capital de trabajo a favor.' : 'Debemos más de lo que cobramos: atención al capital de trabajo.'}</div>
        </div>
      </div>

      {/* Tesorería + Gastos */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-3">Tesorería · cuentas propias Puerto NOA</div>
          <div className="flex gap-2.5 mb-3.5">
            {[{ f: '🇨🇱', l: 'CLP', v: fmtCLPc(d.cuentasCLP) }, { f: '💵', l: 'USD', v: d.cuentasUSD.toLocaleString('es-CL', { maximumFractionDigits: 0 }) }, { f: '🇦🇷', l: 'ARS', v: `$ ${(d.cuentasARS / 1e6).toLocaleString('es-CL', { maximumFractionDigits: 1 })}M` }].map(r => (
              <div key={r.l} className="flex-1 rounded-2xl p-3" style={{ background: '#f8fafc' }}><div className="text-[10px] text-gray-500">{r.f} {r.l}</div><div className="font-extrabold font-mono mt-1" style={{ fontSize: 15 }}>{r.v}</div></div>
            ))}
          </div>
          <div className="rounded-2xl p-3.5 text-white flex justify-between items-center" style={{ background: 'linear-gradient(135deg,#0d9488,#0f766e)' }}>
            <div><div className="text-[10px] opacity-85 uppercase font-bold">Liquidez consolidada</div><div className="text-[9px] opacity-75">equivalente USD</div></div>
            <div className="font-extrabold font-mono" style={{ fontSize: 21 }}>{fmtUSDk(d.consolidadoUSD)}</div>
          </div>
          <Link href="/fondos" className="flex justify-between items-center mt-3 pt-3 border-t border-dashed border-gray-200 hover:opacity-80">
            <span className="text-[11px] text-gray-500">🏦 Fondos en custodia (clientes)</span>
            <span className="font-extrabold font-mono text-gray-700" style={{ fontSize: 15 }}>{fmtUSDk(d.custodiaUSD)}</span>
          </Link>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <div className="flex justify-between items-center mb-3"><span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Gastos fijos del mes</span><span className="font-extrabold font-mono" style={{ fontSize: 16, color: C.ambar }}>{fmtCLPc(d.gastosMes)}</span></div>
          {d.gastosCats.length === 0 ? <div className="text-xs text-gray-400 py-3 text-center">Sin gastos cargados este mes</div> : d.gastosCats.map((c: any, i: number) => (
            <div key={i} className="mb-3"><div className="flex justify-between text-[11px] mb-1"><span className="text-gray-700">{c[0]}</span><b className="font-mono text-gray-500">{fmtCLPc(c[1])} · {Math.round(c[1] / d.gastosMes * 100)}%</b></div><Bar pct={c[1] / maxGasto * 100} color={catColors[i % catColors.length]} /></div>
          ))}
        </div>
      </div>
    </div>
  )
}
