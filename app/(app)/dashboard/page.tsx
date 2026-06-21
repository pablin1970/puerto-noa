'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { cargarPermisos, puede } from '@/lib/permisos'

// ── Marca Puerto NOA ──
const C = { azul: '#1168F8', azulOsc: '#052698', verde: '#0a9e6e', ambar: '#ef9f27', violeta: '#7C3AED', rojo: '#E11D48', teal: '#0d9488', coral: '#FB7185' }
const fmt0 = (n: number) => (n || 0).toLocaleString('es-CL', { maximumFractionDigits: 0 })
const fmtUSDk = (n: number) => Math.abs(n) >= 10000 ? `USD ${(n / 1000).toLocaleString('es-CL', { maximumFractionDigits: 1 })}k` : `USD ${fmt0(n)}`
const signoFondo = (m: any) => m.tipo === 'transferencia' ? 0 : (m.tipo === 'ingreso_cliente' ? (m.usd || 0) : -(m.usd || 0))

// Corredor logístico (China ↔ NOA). etapa_actual guarda una de estas claves.
const CORREDOR = [
  { k: 'china', emoji: '🇨🇳', label: 'China' },
  { k: 'maritimo', emoji: '🌊', label: 'Marítimo' },
  { k: 'puerto_chile', emoji: '⚓', label: 'Puerto Chile' },
  { k: 'aduana', emoji: '🛃', label: 'Aduana' },
  { k: 'terrestre', emoji: '🏔️', label: 'Paso Jama' },
  { k: 'destino', emoji: '🇦🇷', label: 'Destino NOA' },
]
const HITO: Record<string, string> = { china: 'Zarpe', maritimo: 'Arribo a puerto', puerto_chile: 'Retiro / aduana', aduana: 'Liberación aduanera', terrestre: 'Cruce Paso de Jama', destino: 'Entrega final' }
const ETAPA_LABEL: Record<string, string> = Object.fromEntries(CORREDOR.map(s => [s.k, `${s.emoji} ${s.label}`]))

function Donut({ segments, size = 84, stroke = 13 }: { segments: { value: number; color: string }[]; size?: number; stroke?: number }) {
  const total = segments.reduce((t, s) => t + s.value, 0) || 1
  const r = (size - stroke) / 2, c = 2 * Math.PI * r
  let off = 0
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f7" strokeWidth={stroke} />
        {segments.map((s, i) => {
          const len = (s.value / total) * c
          const el = <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={stroke} strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off} />
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
    const hoy = new Date(), en30 = new Date(); en30.setDate(hoy.getDate() + 30)
    const isoHoy = hoy.toISOString().slice(0, 10)

    const [opsRes, cotsRes, tcRes, feRes, frRes, fmRes, cpRes, pchRes] = await Promise.all([
      supabase.from('operaciones').select('id,estado,tipo,sentido,etapa_actual,created_at,fecha_cierre,pasos,cotizacion:cotizaciones(num,cliente,total_landed,sentido,presupuesto,destino_noa,puerto_china_id,tipo_contenedores)').order('created_at', { ascending: false }),
      supabase.from('cotizaciones').select('id,num,cliente,estado,total_landed,sentido,created_at').order('created_at', { ascending: false }),
      supabase.from('tipos_cambio_eventos').select('ars,clp,cny,created_at').order('created_at', { ascending: false }).limit(1),
      supabase.from('facturas_emitidas').select('id,total_usd,estado,fecha_vencimiento,operacion_id').not('operacion_id', 'is', null),
      supabase.from('facturas_recibidas').select('id,total_usd,estado,fecha_vencimiento,operacion_id').not('operacion_id', 'is', null),
      supabase.from('fondos_movimientos').select('tipo,usd,operacion_id'),
      supabase.from('cotizaciones_proveedor_v2').select('id,proveedor_nombre,fecha_vencimiento,estado').eq('estado', 'vigente'),
      supabase.from('puertos_china').select('id,nombre'),
    ])

    const ops = (opsRes.data || []) as any[]
    const cots = (cotsRes.data || []) as any[]
    const tc = tcRes.data?.[0] as any
    const fe = (feRes.data || []) as any[]
    const fr = (frRes.data || []) as any[]
    const fm = (fmRes.data || []) as any[]
    const cotsProv = (cpRes.data || []) as any[]
    const ptosChina: Record<string, string> = {}; (pchRes.data || []).forEach((p: any) => ptosChina[p.id] = p.nombre)

    const opsActivas = ops.filter(o => o.estado !== 'cerrada' && o.estado !== 'cancelada')

    // Por operación
    const recByOp: Record<string, { gasto: number; pend: number }> = {}
    fr.forEach(f => { const k = f.operacion_id; if (!recByOp[k]) recByOp[k] = { gasto: 0, pend: 0 }; if (f.estado !== 'anulada') recByOp[k].gasto += (f.total_usd || 0); if (!['pagada', 'anulada'].includes(f.estado)) recByOp[k].pend += 1 })
    const cajaByOp: Record<string, number> = {}
    fm.forEach(m => { if (m.operacion_id) cajaByOp[m.operacion_id] = (cajaByOp[m.operacion_id] || 0) + signoFondo(m) })

    const diasDe = (iso: string) => Math.max(0, Math.floor((hoy.getTime() - new Date(iso).getTime()) / 86400000))

    const opsCards = opsActivas.map(o => {
      const cot = o.cotizacion || {}
      const presup = Array.isArray(cot.presupuesto) ? cot.presupuesto : []
      const presupTerceros = presup.filter((i: any) => i.etapa !== 'fee').reduce((t: number, i: any) => t + (i.usd || 0), 0)
      const gasto = recByOp[o.id]?.gasto || 0
      const pasos = Array.isArray(o.pasos) ? o.pasos : []
      const avance = pasos.length ? Math.round(pasos.filter(Boolean).length / pasos.length * 100) : 0
      const etapa = o.etapa_actual || 'china'
      const dias = diasDe(o.created_at)
      return {
        id: o.id, num: cot.num || '—', cliente: cot.cliente || '—',
        sentido: o.sentido || cot.sentido || '', tipo: o.tipo === 'propia' ? 'propia' : 'gestion',
        etapa, etapaLabel: ETAPA_LABEL[etapa] || '🇨🇳 China', hito: HITO[etapa] || 'Zarpe',
        avance, dias, caja: cajaByOp[o.id] || 0, gasto, presupTerceros,
        ejecPct: presupTerceros > 0 ? gasto / presupTerceros * 100 : 0, sobrecosto: presupTerceros > 0 && gasto > presupTerceros,
      }
    })

    // Corredor
    const corr: Record<string, number> = {}; CORREDOR.forEach(s => corr[s.k] = 0)
    opsCards.forEach(o => { corr[o.etapa] = (corr[o.etapa] || 0) + 1 })
    const enTransito = corr['maritimo'] + corr['puerto_chile'] + corr['aduana'] + corr['terrestre']
    const demoradas = opsCards.filter(o => o.dias > 45 && o.etapa !== 'destino').length

    // Contenedores en tránsito
    const contenedores = opsActivas.reduce((t, o) => { const cs = Array.isArray(o.cotizacion?.tipo_contenedores) ? o.cotizacion.tipo_contenedores : []; return t + cs.reduce((s: number, c: any) => s + (c.cantidad || 1), 0) }, 0)

    // Distribuciones
    const impo = opsCards.filter(o => o.sentido === 'importacion').length
    const expo = opsCards.filter(o => o.sentido === 'exportacion').length
    const propia = opsCards.filter(o => o.tipo === 'propia').length
    const gestion = opsCards.filter(o => o.tipo === 'gestion').length

    // Embudo + conversión
    const cnt = (e: string) => cots.filter(c => c.estado === e).length
    const valc = (e: string) => cots.filter(c => c.estado === e).reduce((t, c) => t + (c.total_landed || 0), 0)
    const funnel = { borrador: cnt('borrador'), enviada: cnt('enviada'), aceptada: cnt('aceptada'), rechazada: cnt('rechazada'), vencida: cnt('vencida'), vEnv: valc('enviada'), vBor: valc('borrador'), vAcc: valc('aceptada') }
    const ganadas = funnel.aceptada, perdidas = funnel.rechazada + funnel.vencida
    const winRate = (ganadas + perdidas) > 0 ? Math.round(ganadas / (ganadas + perdidas) * 100) : 0

    // Finanzas operativas
    const custodiaUSD = fm.reduce((t, m) => t + signoFondo(m), 0)
    const porCobrar = fe.filter(f => !['pagada', 'anulada'].includes(f.estado)).reduce((t, f) => t + (f.total_usd || 0), 0)

    // Destinos NOA + puertos origen
    const grp = (arr: any[], key: (o: any) => string) => {
      const m: Record<string, number> = {}; arr.forEach(o => { const k = key(o); if (k) m[k] = (m[k] || 0) + 1 }); return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5)
    }
    const destinos = grp(opsActivas, o => o.cotizacion?.destino_noa)
    const puertos = grp(opsActivas, o => ptosChina[o.cotizacion?.puerto_china_id] || '')

    // Tránsito promedio (operaciones cerradas)
    const cerradas = ops.filter(o => o.estado === 'cerrada' && o.fecha_cierre && o.created_at)
    const transitoProm = cerradas.length ? Math.round(cerradas.reduce((t, o) => t + Math.max(0, (new Date(o.fecha_cierre).getTime() - new Date(o.created_at).getTime()) / 86400000), 0) / cerradas.length) : 0

    // Vencimientos proveedor
    const provVenc = cotsProv.filter(c => c.fecha_vencimiento && new Date(c.fecha_vencimiento) >= hoy && new Date(c.fecha_vencimiento) <= en30)
      .sort((a, b) => new Date(a.fecha_vencimiento).getTime() - new Date(b.fecha_vencimiento).getTime()).slice(0, 5)
    const factVencidas = [...fe, ...fr].filter(f => f.fecha_vencimiento && f.fecha_vencimiento < isoHoy && !['pagada', 'anulada'].includes(f.estado)).length

    const tcOk = tc?.created_at ? new Date(tc.created_at).toDateString() === hoy.toDateString() : false

    // Alertas
    const alertas: any[] = []
    const nSobre = opsCards.filter(o => o.sobrecosto).length
    if (nSobre) alertas.push(['rojo', '⛔', `${nSobre} operación(es) con gasto sobre el presupuesto`, '/operaciones'])
    const nCajaNeg = opsCards.filter(o => o.caja < -0.01).length
    if (nCajaNeg) alertas.push(['rojo', '⛔', `${nCajaNeg} operación(es) con caja a rendir en rojo (a cobrar)`, '/fondos'])
    if (factVencidas) alertas.push(['rojo', '⛔', `${factVencidas} factura(s) vencida(s) sin pagar`, '/facturacion/recibidas'])
    if (demoradas) alertas.push(['rojo', '⛔', `${demoradas} operación(es) demorada(s) (+45 días en curso)`, '/operaciones'])
    if (provVenc.length) alertas.push(['ambar', '⚠️', `${provVenc.length} cotización(es) de proveedor vencen en 30 días`, '/cotizaciones-proveedores'])
    if (funnel.enviada) alertas.push(['azul', 'ℹ️', `${funnel.enviada} cotización(es) esperando respuesta del cliente`, '/registro'])
    if (funnel.borrador) alertas.push(['azul', 'ℹ️', `${funnel.borrador} cotización(es) en borrador sin enviar`, '/registro'])
    if (!tcOk) alertas.push(['ambar', '⚠️', 'Tipo de cambio no actualizado hoy', '/tipos-cambio'])

    setD({
      opsCards, corr, enTransito, demoradas, contenedores, transitoProm,
      impo, expo, propia, gestion, funnel, winRate, ganadas, perdidas,
      custodiaUSD, porCobrar, destinos, puertos, provVenc, alertas,
      cotsRecientes: cots.slice(0, 6),
      tcARS: tc?.ars, tcCLP: tc?.clp, tcCNY: tc?.cny, tcOk, total: opsCards.length,
    })
    setLoading(false)
  }

  const hora = new Date().getHours()
  const saludo = hora < 12 ? 'Buenos días' : hora < 20 ? 'Buenas tardes' : 'Buenas noches'

  if (loading || !d) return <div className="p-12 text-center text-gray-400">Cargando...</div>
  if (permListos && !puede(permisos, 'dashboard', 'ver')) {
    return <div className="p-6 bg-gray-50 min-h-screen flex items-center justify-center"><div className="text-center max-w-sm"><div className="text-5xl mb-3">🔒</div><h2 className="text-lg font-bold text-gray-700">Sin acceso</h2><p className="text-sm text-gray-400 mt-1">No tenés permiso para ver esta sección.</p></div></div>
  }

  const AL: any = { rojo: ['#fef2f2', '#b91c1c'], ambar: ['#fffbeb', '#b45309'], azul: ['#eff6ff', '#1d4ed8'] }
  const sentPill = (s: string) => s === 'importacion' ? { background: '#EBF2FF', color: C.azul } : { background: '#F3E8FF', color: C.violeta }
  const tipoPill = (t: string) => t === 'propia' ? { background: '#dcfce7', color: C.verde } : { background: '#f1f5f9', color: '#64748b' }
  const fStep = [
    { label: 'Borrador', n: d.funnel.borrador, v: d.funnel.vBor, color: '#94a3b8' },
    { label: 'Enviadas', n: d.funnel.enviada, v: d.funnel.vEnv, color: C.ambar },
    { label: 'Aceptadas', n: d.funnel.aceptada, v: d.funnel.vAcc, color: C.verde },
    { label: 'Operaciones', n: d.total, v: 0, color: C.azul },
  ]
  const maxF = Math.max(1, ...fStep.map(s => s.n))
  const maxDest = Math.max(1, ...d.destinos.map((x: any) => x[1]))
  const maxPto = Math.max(1, ...d.puertos.map((x: any) => x[1]))

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{saludo}{usuario ? `, ${usuario}` : ''} 🚢</h1>
          <p className="text-xs text-gray-400 mt-0.5">Puerto NOA SpA · Centro de operaciones · {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <div className="flex items-center gap-2">
          {[{ l: 'ARS', v: d.tcARS }, { l: 'CLP', v: d.tcCLP }, { l: 'CNY', v: d.tcCNY }].map(t => (
            <div key={t.l} className={`px-3 py-1.5 rounded-xl border text-xs font-mono ${d.tcOk ? 'bg-white border-gray-200' : 'bg-amber-50 border-amber-200'}`}><span className="text-gray-400 mr-1">{t.l}</span><span className="font-bold text-gray-900">{t.v ? Number(t.v).toLocaleString('es-CL', { maximumFractionDigits: t.l === 'CNY' ? 2 : 0 }) : '—'}</span></div>
          ))}
        </div>
      </div>

      {/* HERO Corredor */}
      <div className="rounded-3xl p-6 mb-4 text-white" style={{ background: 'linear-gradient(120deg,#052698 0%,#1168F8 60%,#1a74ff 100%)', boxShadow: '0 8px 24px rgba(17,104,248,.22)' }}>
        <div className="flex justify-between items-start mb-5 flex-wrap gap-2">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider opacity-75">Corredor en tránsito · China → Chile → Paso de Jama → NOA</div>
            <div className="text-3xl font-extrabold mt-1">{d.total} operacion{d.total !== 1 ? 'es' : ''} activa{d.total !== 1 ? 's' : ''}</div>
          </div>
          <div className="flex gap-2">
            <span className="rounded-full px-3 py-1.5 text-xs font-bold" style={{ background: 'rgba(255,255,255,.16)' }}>📦 {d.contenedores} contenedores</span>
            {d.transitoProm > 0 && <span className="rounded-full px-3 py-1.5 text-xs font-bold" style={{ background: 'rgba(255,255,255,.16)' }}>⏱ {d.transitoProm} días prom.</span>}
          </div>
        </div>
        <div className="relative">
          <div className="absolute rounded-full" style={{ top: 24, left: '8%', right: '8%', height: 3, background: 'rgba(255,255,255,.25)' }} />
          <div className="flex justify-between relative" style={{ zIndex: 1 }}>
            {CORREDOR.map(s => {
              const n = d.corr[s.k] || 0
              return (
                <div key={s.k} className="flex flex-col items-center" style={{ width: '16%' }}>
                  <div className="rounded-full flex items-center justify-center relative" style={{ width: 48, height: 48, fontSize: 22, background: n > 0 ? 'rgba(255,255,255,.92)' : 'rgba(255,255,255,.2)', boxShadow: n > 0 ? '0 2px 8px rgba(0,0,0,.15)' : 'none' }}>
                    {s.emoji}
                    {n > 0 && <span className="absolute font-extrabold flex items-center justify-center" style={{ top: -6, right: -6, background: '#7CF5C4', color: '#053a2c', fontSize: 11, minWidth: 20, height: 20, borderRadius: 999, padding: '0 5px' }}>{n}</span>}
                  </div>
                  <div className="text-[10px] font-bold mt-2 opacity-90 text-center">{s.label}</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-5 gap-3 mb-4">
        {[
          { label: 'En tránsito', val: d.enTransito, sub: d.demoradas ? `${d.demoradas} demoradas` : 'en movimiento', color: C.azul, icon: '🚢', href: '/operaciones' },
          { label: 'Esperando respuesta', val: d.funnel.enviada, sub: `${fmtUSDk(d.funnel.vEnv)} en juego`, color: C.ambar, icon: '📤', href: '/registro' },
          { label: 'Conversión', val: `${d.winRate}%`, sub: `${d.ganadas} ganadas · ${d.perdidas} perdidas`, color: C.verde, icon: '🎯', href: '/registro' },
          { label: 'Custodia (caja)', val: fmtUSDk(d.custodiaUSD), sub: 'caja a rendir', color: C.teal, icon: '🏦', href: '/fondos' },
          { label: 'Por cobrar', val: fmtUSDk(d.porCobrar), sub: 'facturas emitidas', color: C.violeta, icon: '📄', href: '/facturacion/emitidas' },
        ].map((k, i) => (
          <Link key={i} href={k.href} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-center mb-1.5"><span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{k.label}</span><span className="text-sm">{k.icon}</span></div>
            <div className="text-lg font-extrabold font-mono" style={{ color: k.color }}>{k.val}</div>
            <div className="text-[9px] text-gray-400 mt-1.5 font-semibold">{k.sub}</div>
          </Link>
        ))}
      </div>

      {/* Embudo + Donas */}
      <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: '1.5fr 1fr 1fr' }}>
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-4">Embudo comercial</div>
          <div className="space-y-3">
            {fStep.map(s => (
              <div key={s.label} className="flex items-center gap-3">
                <div className="w-20 text-[11px] font-semibold text-gray-500 text-right">{s.label}</div>
                <div className="flex-1 bg-gray-50 rounded-lg h-6 overflow-hidden"><div className="h-6 rounded-lg flex items-center px-2" style={{ width: `${Math.max(10, s.n / maxF * 100)}%`, background: s.color }}><span className="text-white text-xs font-extrabold">{s.n}</span></div></div>
                <div className="w-16 text-[10px] text-gray-400 font-mono text-right">{s.v > 0 ? fmtUSDk(s.v) : ''}</div>
              </div>
            ))}
          </div>
        </div>
        {[
          { t: 'Por sentido', segs: [{ value: d.impo, color: C.azul }, { value: d.expo, color: C.violeta }], leg: [['Impo', d.impo, C.azul], ['Expo', d.expo, C.violeta]] },
          { t: 'Por tipo', segs: [{ value: d.propia, color: C.verde }, { value: d.gestion, color: '#94a3b8' }], leg: [['Propia', d.propia, C.verde], ['Gestión', d.gestion, '#94a3b8']] },
        ].map((dn, i) => (
          <div key={i} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-2">{dn.t}</div>
            <div className="flex items-center gap-3">
              <div className="relative" style={{ width: 84, height: 84 }}>
                <Donut segments={dn.segs} />
                <div className="absolute inset-0 flex items-center justify-center"><span className="font-extrabold text-base text-gray-900">{d.total}</span></div>
              </div>
              <div className="text-xs space-y-1.5">
                {dn.leg.map((l: any, j: number) => (
                  <div key={j} className="flex items-center gap-1.5"><span className="rounded-full" style={{ width: 9, height: 9, background: l[2] }} /><span className="text-gray-500">{l[0]}</span><b className="text-gray-900">{l[1]}</b></div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Operaciones en curso */}
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Operaciones en curso</div>
        <Link href="/operaciones" className="text-[10px] text-[#1168F8] hover:underline">Ver todas →</Link>
      </div>
      {d.opsCards.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center text-gray-400 text-sm shadow-sm mb-4">Sin operaciones activas</div>
      ) : (
        <div className="grid grid-cols-3 gap-3 mb-4">
          {d.opsCards.slice(0, 6).map((o: any) => (
            <Link key={o.id} href="/operaciones" className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex justify-between items-center mb-2"><span className="font-mono font-extrabold text-[#052698] text-sm">{o.num}</span><span className="text-[10px] text-gray-400 font-semibold">{o.dias}d en curso</span></div>
              <div className="flex gap-1.5 mb-2">
                {o.sentido && <span className="rounded-full text-[9px] font-extrabold px-2 py-0.5" style={sentPill(o.sentido)}>{o.sentido === 'importacion' ? 'IMPO' : 'EXPO'}</span>}
                <span className="rounded-full text-[9px] font-extrabold px-2 py-0.5" style={tipoPill(o.tipo)}>{o.tipo === 'propia' ? 'PROPIA' : 'GESTIÓN'}</span>
              </div>
              <div className="text-xs text-gray-700 font-medium truncate">{o.cliente}</div>
              <div className="text-xs font-bold text-[#052698] mb-2.5 mt-0.5">{o.etapaLabel}</div>
              <div className="flex justify-between text-[10px] text-gray-400 mb-1"><span>Avance</span><b className="text-gray-600">{o.avance}%</b></div>
              <div className="mb-2"><Bar pct={o.avance} color={C.azul} /></div>
              <div className="flex justify-between text-[10px] text-gray-400 mb-1"><span>Gasto vs ppto.</span><b style={{ color: o.sobrecosto ? C.rojo : '#64748b' }}>{fmtUSDk(o.gasto)}/{fmtUSDk(o.presupTerceros)}</b></div>
              <div className="mb-2.5"><Bar pct={o.ejecPct} color={o.sobrecosto ? C.rojo : C.verde} /></div>
              <div className="flex justify-between items-center pt-2 border-t border-gray-50">
                <span className="text-[10px] text-gray-400 truncate">→ {o.hito}</span>
                <span className="text-[11px] font-bold font-mono" style={{ color: Math.abs(o.caja) < 0.01 ? '#64748b' : o.caja > 0 ? C.verde : C.rojo }}>{fmtUSDk(o.caja)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Alertas + Vencimientos */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-3">Alertas operativas</div>
          {d.alertas.length === 0 ? <div className="flex items-center gap-2 text-green-700 text-xs py-2"><span className="text-lg">✅</span> Todo al día</div> : d.alertas.map((a: any, i: number) => (
            <Link key={i} href={a[3]} className="flex items-center gap-2 py-2 px-2 rounded-lg mb-1 hover:opacity-80" style={{ background: AL[a[0]][0] }}><span>{a[1]}</span><span className="text-xs font-medium" style={{ color: AL[a[0]][1] }}>{a[2]}</span></Link>
          ))}
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-3">Cotizaciones de proveedor por vencer</div>
          {d.provVenc.length === 0 ? <div className="text-xs text-gray-400 py-2">Sin vencimientos en 30 días</div> : d.provVenc.map((c: any) => {
            const dias = Math.ceil((new Date(c.fecha_vencimiento).getTime() - Date.now()) / 86400000)
            return <div key={c.id} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0"><span className="text-xs text-gray-700 font-medium truncate">{c.proveedor_nombre}</span><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${dias <= 7 ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{dias}d</span></div>
          })}
        </div>
      </div>

      {/* Destinos + Puertos + Tiempos */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-3">Destinos NOA 🇦🇷</div>
          {d.destinos.length === 0 ? <div className="text-xs text-gray-400 py-2">Sin datos</div> : d.destinos.map((x: any, i: number) => (
            <div key={i} className="mb-2.5"><div className="flex justify-between text-[11px] mb-1"><span className="text-gray-700 truncate">{x[0]}</span><b className="font-mono text-gray-500">{x[1]}</b></div><Bar pct={x[1] / maxDest * 100} color={[C.azul, C.teal, C.violeta, C.ambar, C.coral][i] || C.azul} /></div>
          ))}
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-3">Puertos de origen 🇨🇳</div>
          {d.puertos.length === 0 ? <div className="text-xs text-gray-400 py-2">Sin datos</div> : d.puertos.map((x: any, i: number) => (
            <div key={i} className="mb-2.5"><div className="flex justify-between text-[11px] mb-1"><span className="text-gray-700 truncate">{x[0]}</span><b className="font-mono text-gray-500">{x[1]}</b></div><Bar pct={x[1] / maxPto * 100} color={C.azul} /></div>
          ))}
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-3">Tiempos de tránsito</div>
          <div className="rounded-2xl p-4 text-white text-center mb-3" style={{ background: 'linear-gradient(135deg,#0d9488,#0f766e)' }}>
            <div className="text-[10px] opacity-85 uppercase font-bold">Promedio China → NOA</div>
            <div className="text-2xl font-extrabold font-mono mt-0.5">{d.transitoProm > 0 ? `${d.transitoProm} días` : '—'}</div>
          </div>
          <div className="text-[11px] text-gray-500 leading-relaxed">{d.transitoProm > 0 ? 'Promedio de operaciones ya cerradas (apertura a cierre).' : 'Se calcula con las operaciones cerradas. Cuando cierres tu primera operación aparece acá.'}</div>
        </div>
      </div>
    </div>
  )
}
