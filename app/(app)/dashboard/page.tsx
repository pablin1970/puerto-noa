'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { fmt } from '@/lib/utils'
import Link from 'next/link'

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), [])
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('')
  const [tc, setTc] = useState<any>({ ars: null, clp: null, cny: null, fecha: null })

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const { data: authData } = await supabase.auth.getUser()
    if (authData.user) {
      const { data: u } = await supabase.from('usuarios').select('nombre').eq('auth_id', authData.user.id).single()
      if (u) setUserName((u as any).nombre?.split(' ')[0] || '')
    }

    const [cotsRes, opsRes, tcRes, facEmitRes, facRecRes] = await Promise.all([
      supabase.from('cotizaciones').select('id,estado,total_landed,total_fob,created_at,cliente').order('created_at', { ascending: false }).limit(100),
      supabase.from('operaciones').select('id,estado,created_at,cotizacion:cotizaciones(num,cliente,total_landed,destino_noa)').order('created_at', { ascending: false }),
      supabase.from('tipos_cambio_eventos').select('ars,clp,cny,fecha,created_at').order('created_at', { ascending: false }).limit(1).single(),
      supabase.from('facturas_emitidas').select('id,total,estado,created_at').order('created_at', { ascending: false }).limit(100),
      supabase.from('facturas_recibidas').select('id,total,estado,created_at').order('created_at', { ascending: false }).limit(100),
    ])

    const cots = cotsRes.data || []
    const ops = opsRes.data || []
    const facEmit = facEmitRes.data || []
    const facRec = facRecRes.data || []

    if (tcRes.data) setTc(tcRes.data)

    // KPIs cotizaciones
    const ahora = Date.now()
    const hace30 = ahora - 30 * 86400000
    const hace7  = ahora - 7  * 86400000

    const cotsAceptadas  = cots.filter((c: any) => c.estado === 'aceptada')
    const cotsEnviadas   = cots.filter((c: any) => c.estado === 'enviada')
    const cotsBorrador   = cots.filter((c: any) => c.estado === 'borrador')
    const cotsUltimas30  = cots.filter((c: any) => new Date(c.created_at).getTime() > hace30)
    const cotsUltimas7   = cots.filter((c: any) => new Date(c.created_at).getTime() > hace7)

    // Tasa de conversión
    const totalCerradas = cotsAceptadas.length + cots.filter((c: any) => c.estado === 'rechazada').length
    const tasaConv = totalCerradas > 0 ? Math.round(cotsAceptadas.length / totalCerradas * 100) : 0

    // Valor pipeline (enviadas)
    const pipeline = cotsEnviadas.reduce((s: number, c: any) => s + (c.total_landed || 0), 0)
    const valorAceptadas = cotsAceptadas.reduce((s: number, c: any) => s + (c.total_landed || 0), 0)

    // Gráfico últimas 8 semanas
    const semanas: { label: string; cots: number; valor: number }[] = []
    for (let i = 7; i >= 0; i--) {
      const desde = ahora - (i + 1) * 7 * 86400000
      const hasta = ahora - i * 7 * 86400000
      const semCots = cots.filter((c: any) => {
        const t = new Date(c.created_at).getTime()
        return t >= desde && t < hasta
      })
      const d = new Date(hasta)
      semanas.push({
        label: `${d.getDate()}/${d.getMonth() + 1}`,
        cots: semCots.length,
        valor: semCots.reduce((s: number, c: any) => s + (c.total_landed || 0), 0),
      })
    }
    const maxValor = Math.max(...semanas.map(s => s.valor), 1)
    const maxCots  = Math.max(...semanas.map(s => s.cots), 1)

    // Facturas
    const facEmitPend = facEmit.filter((f: any) => f.estado === 'pendiente' || f.estado === 'emitida')
    const facRecPend  = facRec.filter((f: any) => f.estado === 'pendiente')
    const cobrar = facEmitPend.reduce((s: number, f: any) => s + (f.total || 0), 0)
    const pagar  = facRecPend.reduce((s: number, f: any) => s + (f.total || 0), 0)

    // Ops activas
    const opsActivas = ops.filter((o: any) => o.estado !== 'cerrada' && o.estado !== 'cancelada')

    // Alertas
    const alertas: { tipo: 'warning'|'danger'|'info'; msg: string; href: string }[] = []
    const enviSinRespuesta = cotsEnviadas.filter((c: any) => new Date(c.created_at).getTime() < hace7)
    if (enviSinRespuesta.length > 0)
      alertas.push({ tipo: 'warning', msg: `${enviSinRespuesta.length} cotización(es) enviada(s) sin respuesta hace más de 7 días`, href: '/registro' })
    if (cotsBorrador.length > 3)
      alertas.push({ tipo: 'info', msg: `${cotsBorrador.length} cotizaciones en borrador sin enviar`, href: '/registro' })
    if (opsActivas.length > 0)
      alertas.push({ tipo: 'info', msg: `${opsActivas.length} operación(es) en curso`, href: '/operaciones' })

    setData({ cots, ops, opsActivas, cotsAceptadas, cotsEnviadas, cotsBorrador, cotsUltimas30, cotsUltimas7, tasaConv, pipeline, valorAceptadas, semanas, maxValor, maxCots, cobrar, pagar, alertas })
    setLoading(false)
  }

  const hora = new Date().getHours()
  const saludo = hora < 12 ? 'Buenos días' : hora < 18 ? 'Buenas tardes' : 'Buenas noches'

  if (loading) return (
    <div className="min-h-screen bg-[#f0f4ff] flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 border-2 border-[#1168F8] border-t-transparent rounded-full animate-spin mx-auto"/>
        <div className="text-sm text-gray-400">Cargando dashboard...</div>
      </div>
    </div>
  )

  const d = data!

  return (
    <div className="min-h-screen bg-[#f0f4ff] p-6">

      {/* ── HEADER ── */}
      <div className="flex items-end justify-between mb-7">
        <div>
          <div className="text-[11px] font-semibold text-[#1168F8]/60 uppercase tracking-widest mb-1">Puerto NOA SpA · Sistema logístico</div>
          <h1 className="text-2xl font-bold text-[#052698]">
            {saludo}{userName ? `, ${userName}` : ''} 👋
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <Link href="/cotizador"
          className="flex items-center gap-2 px-5 py-2.5 bg-[#1168F8] text-white rounded-xl text-sm font-semibold hover:bg-[#0a4fc4] transition-colors shadow-md shadow-blue-200">
          ✦ Nueva cotización
        </Link>
      </div>

      {/* ── ALERTAS ── */}
      {d.alertas.length > 0 && (
        <div className="flex flex-col gap-2 mb-6">
          {d.alertas.map((a: any, i: number) => (
            <Link key={i} href={a.href}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-medium border transition-all hover:shadow-sm ${
                a.tipo === 'danger'  ? 'bg-red-50 border-red-200 text-red-700' :
                a.tipo === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800' :
                'bg-blue-50 border-blue-200 text-blue-700'
              }`}>
              <span>{a.tipo === 'danger' ? '🚨' : a.tipo === 'warning' ? '⚠️' : '💡'}</span>
              <span className="flex-1">{a.msg}</span>
              <span className="opacity-50">→</span>
            </Link>
          ))}
        </div>
      )}

      {/* ── FILA 1: KPIs PRINCIPALES ── */}
      <div className="grid grid-cols-4 gap-4 mb-5">

        {/* Pipeline */}
        <div className="bg-[#052698] rounded-2xl p-5 text-white col-span-1">
          <div className="text-[10px] font-bold uppercase tracking-widest text-blue-300 mb-3">Pipeline activo</div>
          <div className="text-3xl font-black font-mono mb-1">USD {fmt(d.pipeline, 0)}</div>
          <div className="text-[11px] text-blue-300">{d.cotsEnviadas.length} cotiz. enviada(s) esperando respuesta</div>
          <div className="mt-4 pt-4 border-t border-white/10">
            <div className="text-[10px] text-blue-300 mb-1">Tasa de conversión histórica</div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-green-400 rounded-full transition-all" style={{ width: `${d.tasaConv}%` }}/>
              </div>
              <span className="text-sm font-bold text-green-400">{d.tasaConv}%</span>
            </div>
          </div>
        </div>

        {/* Valor aceptadas */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Negocios cerrados</div>
          <div className="text-2xl font-black font-mono text-[#052698] mb-1">USD {fmt(d.valorAceptadas, 0)}</div>
          <div className="text-[11px] text-gray-400">{d.cotsAceptadas.length} cotización(es) aceptada(s)</div>
          <div className="mt-4 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400"/>
            <span className="text-[10px] text-gray-400">{d.cotsUltimas30.length} nuevas en los últimos 30 días</span>
          </div>
        </div>

        {/* Operaciones */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Operaciones en curso</div>
          <div className="text-4xl font-black text-[#1168F8] mb-1">{d.opsActivas.length}</div>
          <div className="text-[11px] text-gray-400">embarques activos</div>
          <div className="mt-4 grid grid-cols-3 gap-1">
            {d.opsActivas.slice(0, 3).map((op: any, i: number) => (
              <div key={i} className="bg-[#f0f4ff] rounded-lg px-2 py-1.5 text-center">
                <div className="text-[9px] font-bold text-[#1168F8] truncate">{op.cotizacion?.num?.slice(-4)}</div>
              </div>
            ))}
            {d.opsActivas.length === 0 && <div className="col-span-3 text-[10px] text-gray-300">Sin operaciones activas</div>}
          </div>
        </div>

        {/* Finanzas rápido */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Posición financiera</div>
          <div className="space-y-3">
            <div>
              <div className="text-[10px] text-gray-400 mb-0.5">Por cobrar</div>
              <div className="text-lg font-bold font-mono text-green-600">USD {fmt(d.cobrar, 0)}</div>
            </div>
            <div className="h-px bg-gray-100"/>
            <div>
              <div className="text-[10px] text-gray-400 mb-0.5">Por pagar</div>
              <div className="text-lg font-bold font-mono text-red-500">USD {fmt(d.pagar, 0)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── FILA 2: GRÁFICO + TC + ESTADO COTIZACIONES ── */}
      <div className="grid grid-cols-3 gap-4 mb-5">

        {/* Gráfico actividad — últimas 8 semanas */}
        <div className="col-span-2 bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Actividad comercial</div>
              <div className="text-sm font-semibold text-gray-700 mt-0.5">Últimas 8 semanas</div>
            </div>
            <div className="flex items-center gap-4 text-[10px] text-gray-400">
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-[#1168F8]"/>Valor USD</div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-[#93B8FC]"/>N° cotiz.</div>
            </div>
          </div>
          <div className="flex items-end gap-1.5 h-36">
            {d.semanas.map((s: any, i: number) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex items-end gap-0.5 h-28">
                  {/* Barra valor */}
                  <div className="flex-1 bg-[#1168F8] rounded-t-md transition-all"
                    style={{ height: `${d.maxValor > 0 ? (s.valor / d.maxValor) * 100 : 0}%`, minHeight: s.valor > 0 ? '4px' : '0' }}
                    title={`USD ${fmt(s.valor, 0)}`}/>
                  {/* Barra cantidad */}
                  <div className="flex-1 bg-[#93B8FC] rounded-t-md transition-all"
                    style={{ height: `${d.maxCots > 0 ? (s.cots / d.maxCots) * 100 : 0}%`, minHeight: s.cots > 0 ? '4px' : '0' }}
                    title={`${s.cots} cotiz.`}/>
                </div>
                <div className="text-[8px] text-gray-300 font-mono">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Panel derecho: TC + estado cotizaciones */}
        <div className="flex flex-col gap-4">

          {/* Tipos de cambio */}
          <div className="bg-[#052698] rounded-2xl p-5 text-white">
            <div className="text-[10px] font-bold uppercase tracking-widest text-blue-300 mb-3">Tipos de cambio</div>
            <div className="space-y-2.5">
              {[
                { flag: '🇦🇷', label: 'USD / ARS', valor: tc.ars, dec: 0 },
                { flag: '🇨🇱', label: 'USD / CLP', valor: tc.clp, dec: 0 },
                { flag: '🇨🇳', label: 'USD / CNY', valor: tc.cny, dec: 4 },
              ].map(t => (
                <div key={t.label} className="flex items-center justify-between">
                  <span className="text-[11px] text-blue-300">{t.flag} {t.label}</span>
                  <span className="font-mono font-bold text-base">
                    {t.valor != null ? (t.dec > 0 ? Number(t.valor).toFixed(t.dec) : Math.round(t.valor).toLocaleString('es-AR')) : '—'}
                  </span>
                </div>
              ))}
            </div>
            {tc.fecha && (
              <div className="mt-3 pt-3 border-t border-white/10 text-[9px] text-blue-300/60">
                Actualizado: {String(tc.fecha).split('-').reverse().join('/')}
              </div>
            )}
          </div>

          {/* Estado cotizaciones — mini donut visual */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-4">Estado cotizaciones</div>
            <div className="space-y-2.5">
              {[
                { label: 'Aceptadas',  n: d.cotsAceptadas.length,  color: 'bg-green-400',  text: 'text-green-600' },
                { label: 'Enviadas',   n: d.cotsEnviadas.length,   color: 'bg-[#1168F8]',  text: 'text-[#1168F8]' },
                { label: 'Borradores', n: d.cotsBorrador.length,   color: 'bg-gray-300',   text: 'text-gray-500' },
                { label: 'Rechazadas', n: (data.cots||[]).filter((c:any)=>c.estado==='rechazada').length, color: 'bg-red-300', text: 'text-red-500' },
              ].map(row => {
                const total = d.cots.length || 1
                const pct = Math.round(row.n / total * 100)
                return (
                  <div key={row.label}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[11px] text-gray-600">{row.label}</span>
                      <span className={`text-[11px] font-bold ${row.text}`}>{row.n}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full ${row.color} rounded-full transition-all`} style={{ width: `${pct}%` }}/>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-4 pt-3 border-t border-gray-100 text-[10px] text-gray-400">
              {d.cots.length} cotizaciones en total · {d.cotsUltimas7.length} esta semana
            </div>
          </div>
        </div>
      </div>

      {/* ── FILA 3: OPERACIONES ACTIVAS ── */}
      {d.opsActivas.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-5">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"/>
              <span className="font-semibold text-sm text-gray-900">Operaciones en curso</span>
            </div>
            <Link href="/operaciones" className="text-xs text-[#1168F8] hover:underline">Ver todas →</Link>
          </div>
          <div className="grid grid-cols-4 divide-x divide-gray-100">
            {d.opsActivas.slice(0, 4).map((op: any) => (
              <Link key={op.id} href={`/operaciones?cot=${op.cotizacion_id}`}
                className="px-5 py-4 hover:bg-[#f0f4ff] transition-colors group">
                <div className="font-mono text-xs font-bold text-[#1168F8] group-hover:underline mb-1">{op.cotizacion?.num}</div>
                <div className="text-sm font-semibold text-gray-800 truncate">{op.cotizacion?.cliente}</div>
                <div className="text-[11px] text-gray-400 mt-0.5">→ {op.cotizacion?.destino_noa}</div>
                <div className="font-mono text-xs font-bold text-gray-700 mt-2">USD {fmt(op.cotizacion?.total_landed || 0, 0)}</div>
              </Link>
            ))}
            {d.opsActivas.length > 4 && (
              <div className="px-5 py-4 flex items-center justify-center">
                <Link href="/operaciones" className="text-xs text-[#1168F8] font-semibold hover:underline">
                  +{d.opsActivas.length - 4} más →
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PIE ── */}
      <div className="flex items-center justify-between text-[10px] text-gray-300 mt-2">
        <span>Puerto NOA SpA · Sistema logístico China → NOA</span>
        <span>San Salvador de Jujuy, Argentina</span>
      </div>

    </div>
  )
}
