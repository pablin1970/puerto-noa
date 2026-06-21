'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { cargarPermisos, puede } from '@/lib/permisos'

// ── Colores de marca Puerto NOA ──
const C = { azul: '#1168F8', azulOsc: '#052698', verde: '#0a9e6e', ambar: '#ef9f27', violeta: '#7C3AED', rojo: '#E11D48', teal: '#0d9488' }

const fmt0 = (n: number) => (n || 0).toLocaleString('es-CL', { maximumFractionDigits: 0 })
const fmtUSD = (n: number) => `USD ${fmt0(n)}`
const fmtUSDk = (n: number) => Math.abs(n) >= 10000 ? `USD ${(n / 1000).toLocaleString('es-CL', { maximumFractionDigits: 1 })}k` : `USD ${fmt0(n)}`

// Saldo de caja a rendir / custodia: ingreso del cliente suma, el resto resta.
const signoFondo = (m: any) => m.tipo === 'transferencia' ? 0 : (m.tipo === 'ingreso_cliente' ? (m.usd || 0) : -(m.usd || 0))

// ── Dona SVG ──
function Donut({ segments, size = 96, stroke = 15 }: { segments: { value: number; color: string }[]; size?: number; stroke?: number }) {
  const total = segments.reduce((t, s) => t + s.value, 0) || 1
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  let offset = 0
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f7" strokeWidth={stroke} />
        {segments.map((s, i) => {
          const len = (s.value / total) * c
          const el = <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={stroke} strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} />
          offset += len
          return el
        })}
      </g>
    </svg>
  )
}

// ── Barra de progreso ──
function Bar({ pct, color, h = 6 }: { pct: number; color: string; h?: number }) {
  return (
    <div className="w-full bg-gray-100 rounded-full overflow-hidden" style={{ height: h }}>
      <div className="rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: h, background: color }} />
    </div>
  )
}

export default function DashboardLogisticoPage() {
  const supabase = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(true)
  const [usuario, setUsuario] = useState('')
  const [d, setD] = useState<any>(null)

  const [permisos, setPermisos] = useState<Record<string, string[]>>({})
  const [permListos, setPermListos] = useState(false)
  useEffect(() => { cargarPermisos().then(p => { setPermisos(p); setPermListos(true) }) }, [])
  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: auth } = await supabase.auth.getUser()
    if (auth?.user) {
      const { data: u } = await supabase.from('usuarios').select('nombre').eq('auth_id', auth.user.id).single()
      setUsuario((u as any)?.nombre?.split(' ')[0] || '')
    }
    const hoy = new Date()
    const en30 = new Date(hoy); en30.setDate(hoy.getDate() + 30)
    const isoHoy = hoy.toISOString().slice(0, 10)

    const [opsRes, cotsRes, tcRes, feRes, frRes, fmRes, cpRes] = await Promise.all([
      supabase.from('operaciones').select('id,estado,tipo,sentido,created_at,pasos,cotizacion:cotizaciones(num,cliente,total_landed,sentido,presupuesto)').order('created_at', { ascending: false }),
      supabase.from('cotizaciones').select('id,num,cliente,estado,total_landed,sentido,created_at').order('created_at', { ascending: false }),
      supabase.from('tipos_cambio_eventos').select('ars,clp,cny,fecha,created_at').order('created_at', { ascending: false }).limit(1),
      supabase.from('facturas_emitidas').select('id,total_usd,estado,fecha_vencimiento,operacion_id').not('operacion_id', 'is', null),
      supabase.from('facturas_recibidas').select('id,total_usd,estado,fecha_vencimiento,operacion_id').not('operacion_id', 'is', null),
      supabase.from('fondos_movimientos').select('tipo,usd,operacion_id'),
      supabase.from('cotizaciones_proveedor_v2').select('id,proveedor_nombre,fecha_vencimiento,estado').eq('estado', 'vigente'),
    ])

    const ops = (opsRes.data || []) as any[]
    const cots = (cotsRes.data || []) as any[]
    const tc = tcRes.data?.[0] as any
    const fe = (feRes.data || []) as any[]
    const fr = (frRes.data || []) as any[]
    const fm = (fmRes.data || []) as any[]
    const cotsProv = (cpRes.data || []) as any[]

    const opsActivas = ops.filter(o => o.estado !== 'cerrada' && o.estado !== 'cancelada')

    // Agrupaciones por operación
    const recByOp: Record<string, { gasto: number; pend: number }> = {}
    fr.forEach(f => {
      const k = f.operacion_id; if (!recByOp[k]) recByOp[k] = { gasto: 0, pend: 0 }
      if (f.estado !== 'anulada') recByOp[k].gasto += (f.total_usd || 0)
      if (!['pagada', 'anulada'].includes(f.estado)) recByOp[k].pend += 1
    })
    const cajaByOp: Record<string, number> = {}
    fm.forEach(m => { if (m.operacion_id) cajaByOp[m.operacion_id] = (cajaByOp[m.operacion_id] || 0) + signoFondo(m) })

    // Tarjetas de operaciones activas
    const opsCards = opsActivas.map(o => {
      const cot = o.cotizacion || {}
      const presup = Array.isArray(cot.presupuesto) ? cot.presupuesto : []
      const presupTerceros = presup.filter((i: any) => i.etapa !== 'fee').reduce((t: number, i: any) => t + (i.usd || 0), 0)
      const gasto = recByOp[o.id]?.gasto || 0
      const pend = recByOp[o.id]?.pend || 0
      const pasos = Array.isArray(o.pasos) ? o.pasos : []
      const avance = pasos.length ? Math.round(pasos.filter(Boolean).length / pasos.length * 100) : 0
      const caja = cajaByOp[o.id] || 0
      const sentido = o.sentido || cot.sentido || ''
      const tipo = o.tipo === 'propia' ? 'propia' : 'gestion'
      const ejecPct = presupTerceros > 0 ? (gasto / presupTerceros) * 100 : 0
      return { id: o.id, num: cot.num || '—', cliente: cot.cliente || '—', sentido, tipo, avance, caja, gasto, presupTerceros, ejecPct, pend, sobrecosto: presupTerceros > 0 && gasto > presupTerceros }
    })

    // Embudo comercial
    const cnt = (e: string) => cots.filter(c => c.estado === e).length
    const val = (e: string) => cots.filter(c => c.estado === e).reduce((t, c) => t + (c.total_landed || 0), 0)
    const funnel = {
      borrador: cnt('borrador'), enviada: cnt('enviada'), aceptada: cnt('aceptada'), rechazada: cnt('rechazada'), vencida: cnt('vencida'),
      valBorrador: val('borrador'), valEnviada: val('enviada'), valAceptada: val('aceptada'),
    }
    const ganadas = funnel.aceptada, perdidas = funnel.rechazada + funnel.vencida
    const winRate = (ganadas + perdidas) > 0 ? Math.round(ganadas / (ganadas + perdidas) * 100) : 0

    // Distribución
    const impo = opsCards.filter(o => o.sentido === 'importacion').length
    const expo = opsCards.filter(o => o.sentido === 'exportacion').length
    const propia = opsCards.filter(o => o.tipo === 'propia').length
    const gestion = opsCards.filter(o => o.tipo === 'gestion').length

    // Custodia total (USD)
    const custodiaUSD = fm.reduce((t, m) => t + signoFondo(m), 0)
    // Por cobrar (emitidas no pagadas)
    const porCobrar = fe.filter(f => !['pagada', 'anulada'].includes(f.estado)).reduce((t, f) => t + (f.total_usd || 0), 0)

    // Vencimientos de cotizaciones de proveedor
    const provVenc = cotsProv.filter(c => c.fecha_vencimiento && new Date(c.fecha_vencimiento) >= hoy && new Date(c.fecha_vencimiento) <= en30)
      .sort((a, b) => new Date(a.fecha_vencimiento).getTime() - new Date(b.fecha_vencimiento).getTime()).slice(0, 5)

    // Facturas vencidas (emitidas + recibidas, no pagadas, fecha_vto pasada)
    const factVencidas = [...fe, ...fr].filter(f => f.fecha_vencimiento && f.fecha_vencimiento < isoHoy && !['pagada', 'anulada'].includes(f.estado)).length

    // TC fresco
    const tcOk = tc?.created_at ? new Date(tc.created_at).toDateString() === hoy.toDateString() : false

    // Alertas
    const alertas: any[] = []
    const sobrecostoOps = opsCards.filter(o => o.sobrecosto)
    if (sobrecostoOps.length) alertas.push({ t: 'rojo', m: `${sobrecostoOps.length} operación(es) con gasto sobre el presupuesto`, href: '/operaciones' })
    const cajaNeg = opsCards.filter(o => o.caja < -0.01)
    if (cajaNeg.length) alertas.push({ t: 'rojo', m: `${cajaNeg.length} operación(es) con caja a rendir en rojo (a cobrar al cliente)`, href: '/fondos' })
    if (factVencidas > 0) alertas.push({ t: 'rojo', m: `${factVencidas} factura(s) vencida(s) sin pagar`, href: '/facturacion/recibidas' })
    if (provVenc.length) alertas.push({ t: 'ambar', m: `${provVenc.length} cotización(es) de proveedor vencen en 30 días`, href: '/cotizaciones-proveedores' })
    if (funnel.enviada > 0) alertas.push({ t: 'azul', m: `${funnel.enviada} cotización(es) esperando respuesta del cliente`, href: '/registro' })
    if (funnel.borrador > 0) alertas.push({ t: 'azul', m: `${funnel.borrador} cotización(es) en borrador sin enviar`, href: '/registro' })
    if (!tcOk) alertas.push({ t: 'ambar', m: 'Tipo de cambio no actualizado hoy', href: '/tipos-cambio' })

    setD({
      opsCards, funnel, winRate, ganadas, perdidas, impo, expo, propia, gestion,
      custodiaUSD, porCobrar, provVenc, alertas,
      cotsRecientes: cots.slice(0, 7),
      tcARS: tc?.ars, tcCLP: tc?.clp, tcCNY: tc?.cny, tcOk,
    })
    setLoading(false)
  }

  const hora = new Date().getHours()
  const saludo = hora < 12 ? 'Buenos días' : hora < 20 ? 'Buenas tardes' : 'Buenas noches'

  if (loading || !d) return <div className="p-12 text-center text-gray-400">Cargando...</div>
  if (permListos && !puede(permisos, 'dashboard', 'ver')) {
    return (
      <div className="p-6 bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-center max-w-sm"><div className="text-5xl mb-3">🔒</div>
          <h2 className="text-lg font-bold text-gray-700">Sin acceso</h2>
          <p className="text-sm text-gray-400 mt-1">No tenés permiso para ver esta sección.</p></div>
      </div>
    )
  }

  const AL = { rojo: { bg: 'bg-red-50', tx: 'text-red-700', ic: '⛔' }, ambar: { bg: 'bg-amber-50', tx: 'text-amber-700', ic: '⚠️' }, azul: { bg: 'bg-blue-50', tx: 'text-blue-700', ic: 'ℹ️' } } as any
  const fStep = [
    { k: 'borrador', label: 'Borrador', n: d.funnel.borrador, v: d.funnel.valBorrador, color: '#94a3b8' },
    { k: 'enviada', label: 'Enviadas', n: d.funnel.enviada, v: d.funnel.valEnviada, color: C.ambar },
    { k: 'aceptada', label: 'Aceptadas', n: d.funnel.aceptada, v: d.funnel.valAceptada, color: C.verde },
    { k: 'ops', label: 'Operaciones', n: d.opsCards.length, v: 0, color: C.azul },
  ]
  const maxF = Math.max(1, ...fStep.map(s => s.n))

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{saludo}{usuario ? `, ${usuario}` : ''} 👋</h1>
          <p className="text-xs text-gray-400 mt-0.5">Puerto NOA SpA · Tablero de operaciones · {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <div className="flex items-center gap-2">
          {[{ l: 'ARS', v: d.tcARS }, { l: 'CLP', v: d.tcCLP }, { l: 'CNY', v: d.tcCNY }].map(t => (
            <div key={t.l} className={`px-3 py-1.5 rounded-xl border text-xs font-mono ${d.tcOk ? 'bg-white border-gray-200' : 'bg-amber-50 border-amber-200'}`}>
              <span className="text-gray-400 mr-1">{t.l}</span><span className="font-bold text-gray-900">{t.v ? Number(t.v).toLocaleString('es-CL', { maximumFractionDigits: t.l === 'CNY' ? 2 : 0 }) : '—'}</span>
            </div>
          ))}
          {!d.tcOk && <span className="text-[10px] text-amber-600 font-semibold">⚠ desactualizado</span>}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-5 gap-3 mb-5">
        {[
          { label: 'Operaciones activas', val: d.opsCards.length, sub: `${d.impo} impo · ${d.expo} expo`, color: C.azul, bg: 'bg-[#EBF2FF]', icon: '🚢', href: '/operaciones' },
          { label: 'Esperando respuesta', val: d.funnel.enviada, sub: fmtUSDk(d.funnel.valEnviada), color: C.ambar, bg: 'bg-amber-50', icon: '📤', href: '/registro' },
          { label: 'Tasa de conversión', val: `${d.winRate}%`, sub: `${d.ganadas} ganadas · ${d.perdidas} perdidas`, color: C.verde, bg: 'bg-green-50', icon: '🎯', href: '/registro' },
          { label: 'Fondos en custodia', val: fmtUSDk(d.custodiaUSD), sub: 'caja a rendir', color: C.teal, bg: 'bg-teal-50', icon: '🏦', href: '/fondos' },
          { label: 'Por cobrar', val: fmtUSDk(d.porCobrar), sub: 'facturas emitidas', color: C.violeta, bg: 'bg-purple-50', icon: '📄', href: '/facturacion/emitidas' },
        ].map((k, i) => (
          <Link key={i} href={k.href} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow group">
            <div className="flex items-center justify-between mb-2">
              <div className={`w-8 h-8 rounded-xl ${k.bg} flex items-center justify-center text-sm`}>{k.icon}</div>
              <span className="text-[9px] text-gray-300 group-hover:text-gray-500">→</span>
            </div>
            <div className="text-xl font-bold font-mono" style={{ color: k.color }}>{k.val}</div>
            <div className="text-[10px] text-gray-400 mt-0.5">{k.label}</div>
            <div className="text-[10px] text-gray-400 mt-1 font-medium">{k.sub}</div>
          </Link>
        ))}
      </div>

      {/* Embudo + Donas */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="col-span-2 bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <div className="text-[10px] font-semibold text-gray-400 uppercase mb-4">Embudo comercial</div>
          <div className="space-y-3">
            {fStep.map(s => (
              <div key={s.k} className="flex items-center gap-3">
                <div className="w-20 text-[11px] font-semibold text-gray-600 text-right">{s.label}</div>
                <div className="flex-1 bg-gray-50 rounded-lg h-7 overflow-hidden relative">
                  <div className="h-7 rounded-lg flex items-center px-2 transition-all" style={{ width: `${Math.max(8, s.n / maxF * 100)}%`, background: s.color }}>
                    <span className="text-white text-xs font-bold">{s.n}</span>
                  </div>
                </div>
                <div className="w-20 text-[10px] text-gray-400 font-mono text-right">{s.v > 0 ? fmtUSDk(s.v) : ''}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <div className="text-[10px] font-semibold text-gray-400 uppercase mb-3">Operaciones activas</div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Donut segments={[{ value: d.impo, color: C.azul }, { value: d.expo, color: C.violeta }]} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-bold text-gray-900">{d.opsCards.length}</span>
                <span className="text-[8px] text-gray-400 uppercase">activas</span>
              </div>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: C.azul }} /><span className="text-gray-600">Impo</span><span className="font-bold text-gray-900">{d.impo}</span></div>
              <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: C.violeta }} /><span className="text-gray-600">Expo</span><span className="font-bold text-gray-900">{d.expo}</span></div>
              <div className="pt-1 border-t border-gray-100 flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: C.verde }} /><span className="text-gray-600">Propia</span><span className="font-bold text-gray-900">{d.propia}</span></div>
              <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#94a3b8' }} /><span className="text-gray-600">Gestión</span><span className="font-bold text-gray-900">{d.gestion}</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* Operaciones activas — tarjetas */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] font-semibold text-gray-400 uppercase">Operaciones en curso</div>
          <Link href="/operaciones" className="text-[10px] text-[#1168F8] hover:underline">Ver todas →</Link>
        </div>
        {d.opsCards.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center text-gray-400 text-sm shadow-sm">Sin operaciones activas</div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {d.opsCards.slice(0, 6).map((o: any) => (
              <Link key={o.id} href="/operaciones" className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-[#052698] text-sm">{o.num}</span>
                    {o.sentido && <span className="px-2 py-0.5 rounded-full text-[9px] font-bold border" style={{ background: o.sentido === 'importacion' ? '#EBF2FF' : '#F3E8FF', color: o.sentido === 'importacion' ? C.azul : C.violeta, borderColor: 'transparent' }}>{o.sentido === 'importacion' ? 'IMPO' : 'EXPO'}</span>}
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold" style={{ background: o.tipo === 'propia' ? '#dcfce7' : '#f1f5f9', color: o.tipo === 'propia' ? C.verde : '#64748b' }}>{o.tipo === 'propia' ? 'PROPIA' : 'GESTIÓN'}</span>
                  </div>
                  {o.pend > 0 && <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">{o.pend} fact. pend.</span>}
                </div>
                <div className="text-xs text-gray-700 font-medium mb-3 truncate">{o.cliente}</div>
                {/* Avance */}
                <div className="flex items-center justify-between text-[10px] text-gray-400 mb-1"><span>Avance operativo</span><span className="font-bold text-gray-600">{o.avance}%</span></div>
                <div className="mb-3"><Bar pct={o.avance} color={C.azul} /></div>
                {/* Presupuesto vs gasto */}
                <div className="flex items-center justify-between text-[10px] text-gray-400 mb-1">
                  <span>Gasto vs presupuesto</span>
                  <span className="font-bold" style={{ color: o.sobrecosto ? C.rojo : '#64748b' }}>{fmtUSDk(o.gasto)} / {fmtUSDk(o.presupTerceros)}</span>
                </div>
                <div className="mb-3"><Bar pct={o.ejecPct} color={o.sobrecosto ? C.rojo : C.verde} /></div>
                {/* Caja */}
                <div className="flex items-center justify-between pt-2 border-t border-gray-50">
                  <span className="text-[10px] text-gray-400">Caja a rendir</span>
                  <span className="text-xs font-bold font-mono" style={{ color: Math.abs(o.caja) < 0.01 ? '#64748b' : o.caja > 0 ? C.verde : C.rojo }}>
                    {fmtUSD(o.caja)} {Math.abs(o.caja) < 0.01 ? '' : o.caja > 0 ? '↓ devolver' : '↑ cobrar'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Alertas + Vencimientos */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <div className="text-[10px] font-semibold text-gray-400 uppercase mb-3">Alertas y pendientes</div>
          {d.alertas.length === 0 ? (
            <div className="flex items-center gap-2 text-green-700 text-xs py-2"><span className="text-lg">✅</span> Todo al día — sin alertas</div>
          ) : d.alertas.map((a: any, i: number) => (
            <Link key={i} href={a.href} className={`flex items-center gap-2 py-2 px-2 rounded-lg mb-1 ${AL[a.t].bg} hover:opacity-80`}>
              <span>{AL[a.t].ic}</span><span className={`text-xs font-medium ${AL[a.t].tx}`}>{a.m}</span>
            </Link>
          ))}
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <div className="text-[10px] font-semibold text-gray-400 uppercase mb-3">Cotizaciones de proveedor por vencer</div>
          {d.provVenc.length === 0 ? (
            <div className="text-xs text-gray-400 py-2">Sin vencimientos en 30 días</div>
          ) : d.provVenc.map((c: any) => {
            const dias = Math.ceil((new Date(c.fecha_vencimiento).getTime() - Date.now()) / 86400000)
            return (
              <div key={c.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <span className="text-xs text-gray-700 font-medium truncate">{c.proveedor_nombre}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${dias <= 7 ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{dias}d</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Cotizaciones recientes */}
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <span className="font-bold text-sm text-gray-900">Cotizaciones recientes</span>
          <Link href="/registro" className="text-[10px] text-[#1168F8] hover:underline">Ver todas →</Link>
        </div>
        <table className="w-full text-xs">
          <tbody>
            {d.cotsRecientes.length === 0 ? (
              <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-400">Sin cotizaciones</td></tr>
            ) : d.cotsRecientes.map((c: any) => (
              <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-5 py-3 font-mono font-bold text-[#052698]">{c.num}</td>
                <td className="px-4 py-3 font-medium text-gray-800">
                  {c.cliente}
                  {c.sentido && <span className="ml-2 text-[9px] font-bold" style={{ color: c.sentido === 'importacion' ? C.azul : C.violeta }}>{c.sentido === 'importacion' ? 'IMPO' : 'EXPO'}</span>}
                </td>
                <td className="px-4 py-3 font-mono text-gray-500">{c.total_landed ? fmtUSD(c.total_landed) : '—'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${c.estado === 'aceptada' ? 'bg-green-50 text-green-700' : c.estado === 'enviada' ? 'bg-blue-50 text-blue-700' : c.estado === 'rechazada' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-500'}`}>{c.estado}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
