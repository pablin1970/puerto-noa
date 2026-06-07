'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { fmt, ESTADOS_L } from '@/lib/utils'
import type { Cotizacion } from '@/types'
import Link from 'next/link'
import Image from 'next/image'

interface OpActiva {
  id: string
  cotizacion_id: string
  estado: string
  created_at: string
  cotizacion: {
    num: string
    cliente: string
    destino_noa: string
    tipo_contenedores: any[]
    total_landed: number
  }
}

interface Alerta {
  tipo: 'warning' | 'info' | 'danger'
  mensaje: string
  link?: string
}

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), [])
  const [cots, setCots] = useState<Cotizacion[]>([])
  const [ops, setOps] = useState<OpActiva[]>([])
  const [cotProvs, setCotProvs] = useState<any[]>([])
  const [alertas, setAlertas] = useState<Alerta[]>([])
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const { data: authData } = await supabase.auth.getUser()
    if (authData.user) {
      const { data: u } = await supabase.from('usuarios').select('nombre').eq('auth_id', authData.user.id).single()
      if (u) setUserName((u as any).nombre)
    }
    const [cotsRes, opsRes, cotProvsRes] = await Promise.all([
      supabase.from('cotizaciones').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('operaciones').select('*, cotizacion:cotizaciones(num,cliente,destino_noa,tipo_contenedores,total_landed)').order('created_at', { ascending: false }),
      supabase.from('cotizaciones_proveedor').select('id,proveedor,fecha,estado,tipo').eq('estado','vigente').order('fecha', { ascending: false }),
    ])
    const cotsData = cotsRes.data as Cotizacion[] || []
    const opsData = opsRes.data as OpActiva[] || []
    const cotProvsData = cotProvsRes.data || []
    setCots(cotsData)
    setOps(opsData)
    setCotProvs(cotProvsData)

    // Alertas
    const newAlertas: Alerta[] = []
    const enviadas = cotsData.filter(c => c.estado === 'enviada')
    const viejas7 = enviadas.filter(c => (Date.now() - new Date(c.created_at).getTime()) / 86400000 > 7)
    if (viejas7.length > 0) newAlertas.push({ tipo: 'warning', mensaje: `${viejas7.length} cotización(es) enviada(s) sin respuesta hace más de 7 días`, link: '/registro' })
    const viejasCotProv = cotProvsData.filter((c: any) => (Date.now() - new Date(c.fecha).getTime()) / 86400000 > 90)
    if (viejasCotProv.length > 0) newAlertas.push({ tipo: 'info', mensaje: `${viejasCotProv.length} cotización(es) de proveedores con más de 90 días. Verificar vigencia.`, link: '/tarifas' })
    setAlertas(newAlertas)
    setLoading(false)
  }

  const stats = {
    total: cots.length,
    borrador: cots.filter(c => c.estado === 'borrador').length,
    enviada: cots.filter(c => c.estado === 'enviada').length,
    aceptada: cots.filter(c => c.estado === 'aceptada').length,
    opsActivas: ops.length,
    valorTotal: cots.filter(c => c.estado === 'aceptada').reduce((s, c) => s + (c.total_landed || 0), 0),
  }

  const hora = new Date().getHours()
  const saludo = hora < 12 ? 'Buenos días' : hora < 18 ? 'Buenas tardes' : 'Buenas noches'
  const recientes = cots.slice(0, 6)

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <Image src="/logo.png" alt="Puertonoa" width={160} height={48} style={{ objectFit: 'contain' }} className="mx-auto mb-4 opacity-60" />
        <div className="text-gray-400 text-sm">Cargando dashboard...</div>
      </div>
    </div>
  )

  return (
    <div className="p-6 bg-gray-50 min-h-screen">

      {/* ── HEADER ── */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-5">
          <div className="bg-white border border-gray-100 rounded-2xl px-4 py-2.5 shadow-sm">
            <Image src="/logo.png" alt="Puerto NOA SpA" width={130} height={38} style={{ objectFit: 'contain' }} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{saludo}{userName ? `, ${userName.split(' ')[0]}` : ''}</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · Sistema logístico China → NOA
            </p>
          </div>
        </div>
        <Link href="/cotizador"
          className="flex items-center gap-2 px-5 py-2.5 bg-[#1168F8] text-white rounded-xl text-sm font-semibold hover:bg-[#0a4fc4] transition-colors shadow-sm">
          + Nueva cotización
        </Link>
      </div>

      {/* ── ALERTAS ── */}
      {alertas.length > 0 && (
        <div className="space-y-2 mb-5">
          {alertas.map((a, i) => (
            <div key={i} className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-medium border ${
              a.tipo === 'danger' ? 'bg-red-50 border-red-200 text-red-700' :
              a.tipo === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800' :
              'bg-[#EBF2FF] border-[#93B8FC] text-[#052698]'
            }`}>
              <span className="text-base">{a.tipo === 'danger' ? '🚨' : a.tipo === 'warning' ? '⚠️' : 'ℹ️'}</span>
              <span className="flex-1">{a.mensaje}</span>
              {a.link && <Link href={a.link} className="underline underline-offset-2 hover:opacity-80">Ver →</Link>}
            </div>
          ))}
        </div>
      )}

      {/* ── KPIs ── */}
      <div className="grid grid-cols-6 gap-3 mb-5">
        {[
          { label: 'Total cotizaciones', value: stats.total, icon: '📋', color: 'text-gray-900', bg: 'bg-white', border: 'border-gray-100' },
          { label: 'Borradores', value: stats.borrador, icon: '✏️', color: 'text-gray-500', bg: 'bg-white', border: 'border-gray-100' },
          { label: 'Enviadas', value: stats.enviada, icon: '📤', color: 'text-[#1168F8]', bg: 'bg-white', border: 'border-blue-100' },
          { label: 'Aceptadas', value: stats.aceptada, icon: '✅', color: 'text-green-700', bg: 'bg-white', border: 'border-green-100' },
          { label: 'Operaciones activas', value: stats.opsActivas, icon: '🚢', color: 'text-[#052698]', bg: 'bg-[#EBF2FF]', border: 'border-[#93B8FC]' },
          { label: 'Valor aceptadas', value: `USD ${fmt(stats.valorTotal, 0)}`, icon: '💰', color: 'text-[#1168F8]', bg: 'bg-[#EBF2FF]', border: 'border-[#93B8FC]' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} border ${s.border} rounded-2xl p-4 shadow-sm`}>
            <div className="text-xl mb-2">{s.icon}</div>
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-[10px] text-gray-500 mt-1 leading-tight">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── CONTENIDO PRINCIPAL ── */}
      <div className="grid grid-cols-3 gap-4">

        {/* Columna izquierda */}
        <div className="space-y-4">

          {/* Operaciones activas */}
          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">🚢</span>
                <span className="font-semibold text-sm text-gray-900">Operaciones activas</span>
              </div>
              <Link href="/operaciones" className="text-xs text-[#1168F8] hover:underline font-medium">Ver todas →</Link>
            </div>
            {ops.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <div className="text-2xl mb-2">📦</div>
                <div className="text-gray-400 text-xs">Sin operaciones activas.</div>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {ops.slice(0, 5).map(op => (
                  <Link key={op.id} href={`/operaciones?cot=${op.cotizacion_id}`}
                    className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors">
                    <div className="w-8 h-8 rounded-xl bg-[#052698] flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                      {op.cotizacion?.cliente?.slice(0, 2).toUpperCase() || 'OP'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-[11px] font-bold text-[#1168F8]">{op.cotizacion?.num}</div>
                      <div className="text-xs text-gray-700 truncate">{op.cotizacion?.cliente}</div>
                      <div className="text-[10px] text-gray-400">
                        {Array.isArray(op.cotizacion?.tipo_contenedores)
                          ? op.cotizacion.tipo_contenedores.map((x: any) => `${x.cantidad}× ${x.tipo}`).join(', ')
                          : '—'}
                        {op.cotizacion?.destino_noa && ` → ${op.cotizacion.destino_noa}`}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-mono text-xs font-semibold text-gray-800">USD {fmt(op.cotizacion?.total_landed || 0, 0)}</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Tarifas vigentes */}
          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">📋</span>
                <span className="font-semibold text-sm text-gray-900">Tarifas vigentes</span>
              </div>
              <Link href="/tarifas" className="text-xs text-[#1168F8] hover:underline font-medium">Ver →</Link>
            </div>
            {cotProvs.length === 0 ? (
              <div className="px-5 py-6 text-center">
                <div className="text-gray-400 text-xs">Sin cotizaciones de proveedores.</div>
                <Link href="/tarifas" className="text-xs text-[#1168F8] hover:underline mt-1 block">Cargar primera →</Link>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {cotProvs.slice(0, 5).map((c: any) => {
                  const diasAtras = Math.floor((Date.now() - new Date(c.fecha).getTime()) / 86400000)
                  return (
                    <div key={c.id} className="flex items-center justify-between px-5 py-3">
                      <div>
                        <div className="text-xs font-semibold text-gray-800">{c.proveedor}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          {c.tipo === 'generica' ? '📋 Genérica' : '🎯 Específica'} · {c.fecha}
                        </div>
                      </div>
                      <div className={`text-[9px] px-2 py-1 rounded-full font-medium ${diasAtras > 60 ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'}`}>
                        {diasAtras > 60 ? `${diasAtras}d` : '✓ Vigente'}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Columna derecha — cotizaciones recientes */}
        <div className="col-span-2">
          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">🗂</span>
                <span className="font-semibold text-sm text-gray-900">Cotizaciones recientes</span>
              </div>
              <Link href="/registro" className="text-xs text-[#1168F8] hover:underline font-medium">Ver todas →</Link>
            </div>
            {recientes.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <div className="text-4xl mb-3">📄</div>
                <div className="text-gray-500 text-sm mb-1">Sin cotizaciones aún</div>
                <div className="text-gray-400 text-xs mb-4">Comenzá creando tu primera cotización</div>
                <Link href="/cotizador" className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-semibold hover:bg-[#0a4fc4] transition-colors">
                  + Nueva cotización
                </Link>
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {['N° Cotización', 'Cliente', 'Destino', 'Contenedores', 'Total USD', 'Estado', 'Fecha'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recientes.map(c => (
                    <tr key={c.id} className="border-b border-gray-50 hover:bg-blue-50/30 transition-colors">
                      <td className="px-4 py-3.5">
                        <Link href={`/registro/${c.id}`} className="font-mono text-[#1168F8] hover:underline font-bold text-[11px]">
                          {c.num}
                        </Link>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-gray-900 max-w-36 truncate">{c.cliente}</div>
                      </td>
                      <td className="px-4 py-3.5 text-gray-500">{c.destino_noa}</td>
                      <td className="px-4 py-3.5 text-gray-500">
                        {Array.isArray(c.tipo_contenedores)
                          ? c.tipo_contenedores.map((x: any) => `${x.cantidad}× ${x.tipo}`).join(', ')
                          : '—'}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="font-mono font-semibold text-gray-800">USD {fmt(c.total_landed || 0, 0)}</span>
                      </td>
                      <td className="px-4 py-3.5"><EstadoBadge estado={c.estado} /></td>
                      <td className="px-4 py-3.5 font-mono text-[10px] text-gray-400">{c.created_at?.slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Accesos rápidos */}
          <div className="grid grid-cols-4 gap-3 mt-4">
            {[
              { label: 'Nuevo cotizador', icon: '✦', href: '/cotizador', color: 'bg-[#1168F8] text-white border-[#1168F8]' },
              { label: 'Tarifas base', icon: '📋', href: '/tarifas', color: 'bg-white text-gray-700 border-gray-200' },
              { label: 'Operaciones', icon: '🚢', href: '/operaciones', color: 'bg-white text-gray-700 border-gray-200' },
              { label: 'Tipos de cambio', icon: '💱', href: '/tipos-cambio', color: 'bg-white text-gray-700 border-gray-200' },
            ].map(a => (
              <Link key={a.href} href={a.href}
                className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border font-medium text-xs hover:shadow-sm transition-all ${a.color}`}>
                <span className="text-base">{a.icon}</span>
                {a.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* ── PIE ── */}
      <div className="mt-6 flex items-center justify-between text-[10px] text-gray-300">
        <div className="flex items-center gap-2">
          <Image src="/logo.png" alt="Puertonoa" width={70} height={20} style={{ objectFit: 'contain', opacity: 0.3 }} />
          <span>Sistema logístico China → NOA · Puerto NOA SpA</span>
        </div>
        <span>San Salvador de Jujuy, Argentina</span>
      </div>

    </div>
  )
}

function EstadoBadge({ estado }: { estado: string }) {
  const cls: Record<string, string> = {
    borrador: 'bg-gray-100 text-gray-600 border border-gray-200',
    enviada: 'bg-blue-50 text-[#1168F8] border border-blue-200',
    aceptada: 'bg-green-50 text-green-700 border border-green-200',
    rechazada: 'bg-red-50 text-red-700 border border-red-200',
    vencida: 'bg-amber-50 text-amber-700 border border-amber-200',
  }
  return (
    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${cls[estado] || ''}`}>
      {ESTADOS_L[estado] || estado}
    </span>
  )
}
