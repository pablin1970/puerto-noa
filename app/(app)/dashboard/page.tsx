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
  docCount?: number
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

  useEffect(() => {
    loadAll()
  }, [])

  async function loadAll() {
    const [authRes] = await Promise.all([supabase.auth.getUser()])
    if (authRes.data.user) {
      const { data: u } = await supabase.from('usuarios').select('nombre').eq('auth_id', authRes.data.user.id).single()
      if (u) setUserName((u as any).nombre)
    }

    const [cotsRes, opsRes, cotProvsRes] = await Promise.all([
      supabase.from('cotizaciones').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('operaciones').select('*, cotizacion:cotizaciones(num,cliente,destino_noa,tipo_contenedores,total_landed)').eq('estado', 'activa').order('created_at', { ascending: false }),
      supabase.from('cotizaciones_proveedor').select('id,proveedor,fecha,estado,tipo').eq('estado', 'vigente').order('fecha', { ascending: false }),
    ])

    const cotsData = cotsRes.data as Cotizacion[] || []
    const opsData = opsRes.data as OpActiva[] || []
    const cotProvsData = cotProvsRes.data || []

    setCots(cotsData)
    setOps(opsData)
    setCotProvs(cotProvsData)

    // Build alertas
    const newAlertas: Alerta[] = []

    // Cotizaciones enviadas sin respuesta hace más de 7 días
    const enviadas = cotsData.filter(c => c.estado === 'enviada')
    const viejas = enviadas.filter(c => {
      const dias = (Date.now() - new Date(c.created_at).getTime()) / 86400000
      return dias > 7
    })
    if (viejas.length > 0) {
      newAlertas.push({ tipo: 'warning', mensaje: `${viejas.length} cotización(es) enviada(s) sin respuesta hace más de 7 días`, link: '/registro' })
    }

    // Operaciones activas sin documentos
    if (opsData.length > 0) {
      for (const op of opsData) {
        const { data: docs } = await supabase.from('operacion_documentos').select('id').eq('operacion_id', op.id)
        if (!docs?.length) {
          newAlertas.push({ tipo: 'info', mensaje: `Operación ${op.cotizacion?.num} — sin documentos cargados (BL, Packing List, etc.)`, link: '/operaciones' })
        }
      }
    }

    // Cotizaciones de proveedores que vencen pronto (próximos 30 días)
    const hoy = new Date()
    const en30 = new Date(hoy.getTime() + 30 * 86400000)
    // We don't have expiry date, but we can check old ones
    const viejasCotProv = cotProvsData.filter((c: any) => {
      const dias = (Date.now() - new Date(c.fecha).getTime()) / 86400000
      return dias > 90
    })
    if (viejasCotProv.length > 0) {
      newAlertas.push({ tipo: 'warning', mensaje: `${viejasCotProv.length} cotización(es) de proveedores con más de 90 días. Verificar vigencia.`, link: '/tarifas' })
    }

    setAlertas(newAlertas)
    setLoading(false)
  }

  const stats = {
    total: cots.length,
    borrador: cots.filter(c => c.estado === 'borrador').length,
    enviada: cots.filter(c => c.estado === 'enviada').length,
    aceptada: cots.filter(c => c.estado === 'aceptada').length,
    opsActivas: ops.length,
    totalUSD: cots.filter(c => c.estado === 'aceptada').reduce((s, c) => s + (c.total_landed || 0), 0),
  }

  const recientes = cots.slice(0, 6)
  const hora = new Date().getHours()
  const saludo = hora < 12 ? 'Buenos días' : hora < 18 ? 'Buenas tardes' : 'Buenas noches'

  if (loading) return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <Image src="/logo.png" alt="Puertonoa" width={120} height={36} style={{ objectFit: 'contain' }} />
      </div>
      <div className="text-gray-400 text-sm">Cargando dashboard...</div>
    </div>
  )

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Image src="/logo.png" alt="Puertonoa" width={130} height={38} style={{ objectFit: 'contain' }} />
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{saludo}{userName ? `, ${userName.split(' ')[0]}` : ''}</h1>
            <p className="text-xs text-gray-400">Sistema logístico China → NOA · {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
        </div>
        <Link href="/cotizador" className="flex items-center gap-1.5 px-4 py-2 bg-[#1168F8] text-white rounded-lg text-xs font-medium hover:bg-[#0a4fc4] transition-colors">
          + Nueva cotización
        </Link>
      </div>

      {/* Alertas */}
      {alertas.length > 0 && (
        <div className="space-y-2 mb-5">
          {alertas.map((a, i) => (
            <div key={i} className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs ${
              a.tipo === 'danger' ? 'bg-red-50 border border-red-200 text-red-700' :
              a.tipo === 'warning' ? 'bg-amber-50 border border-amber-200 text-amber-700' :
              'bg-blue-50 border border-[#93B8FC] text-[#052698]'
            }`}>
              <span>{a.tipo === 'danger' ? '🚨' : a.tipo === 'warning' ? '⚠' : 'ℹ'}</span>
              <span className="flex-1">{a.mensaje}</span>
              {a.link && <Link href={a.link} className="font-medium hover:underline">Ver →</Link>}
            </div>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-6 gap-3 mb-5">
        {[
          { label: 'Total cotizaciones', value: stats.total, sub: 'en el sistema', color: 'text-gray-900', bg: 'bg-white' },
          { label: 'Borradores', value: stats.borrador, sub: 'en preparación', color: 'text-gray-500', bg: 'bg-white' },
          { label: 'Enviadas', value: stats.enviada, sub: 'esperando respuesta', color: 'text-[#1168F8]', bg: 'bg-white' },
          { label: 'Aceptadas', value: stats.aceptada, sub: 'confirmadas', color: 'text-green-700', bg: 'bg-white' },
          { label: 'Operaciones activas', value: stats.opsActivas, sub: 'en curso', color: 'text-[#052698]', bg: 'bg-[#EBF2FF]' },
          { label: 'Valor operaciones', value: `USD ${fmt(stats.totalUSD, 0)}`, sub: 'cotizaciones aceptadas', color: 'text-[#1168F8]', bg: 'bg-[#EBF2FF]' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} border border-gray-100 rounded-xl p-4`}>
            <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-[10px] font-medium text-gray-600 mt-1">{s.label}</div>
            <div className="text-[9px] text-gray-400 mt-0.5">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Operaciones activas */}
        <div className="col-span-1">
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden mb-4">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
              <span className="font-medium text-sm text-gray-900">Operaciones activas</span>
              <Link href="/operaciones" className="text-xs text-[#1168F8] hover:underline">Ver →</Link>
            </div>
            {ops.length === 0 ? (
              <div className="px-5 py-6 text-center text-gray-400 text-xs">Sin operaciones activas.</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {ops.slice(0, 5).map(op => (
                  <Link key={op.id} href={`/operaciones?cot=${op.cotizacion_id}`} className="block px-5 py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-mono text-[11px] font-semibold text-[#1168F8]">{op.cotizacion?.num}</div>
                        <div className="text-xs text-gray-700 mt-0.5">{op.cotizacion?.cliente}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          {Array.isArray(op.cotizacion?.tipo_contenedores) ? op.cotizacion.tipo_contenedores.map((x: any) => `${x.cantidad}× ${x.tipo}`).join(', ') : '—'}
                          {op.cotizacion?.destino_noa && ` → ${op.cotizacion.destino_noa}`}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-xs font-medium text-gray-800">USD {fmt(op.cotizacion?.total_landed || 0, 0)}</div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Cotizaciones de proveedores vigentes */}
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
              <span className="font-medium text-sm text-gray-900">Tarifas vigentes</span>
              <Link href="/tarifas" className="text-xs text-[#1168F8] hover:underline">Ver →</Link>
            </div>
            {cotProvs.length === 0 ? (
              <div className="px-5 py-4 text-center text-gray-400 text-xs">Sin tarifas cargadas.</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {cotProvs.slice(0, 4).map((c: any) => (
                  <div key={c.id} className="px-5 py-2.5 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-medium text-gray-800">{c.proveedor}</div>
                      <div className="text-[10px] text-gray-400">{c.tipo === 'generica' ? '📋 Genérica' : '🎯 Específica'} · {c.fecha}</div>
                    </div>
                    <span className="text-[9px] bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-medium">Vigente</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Cotizaciones recientes */}
        <div className="col-span-2">
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
              <span className="font-medium text-sm text-gray-900">Cotizaciones recientes</span>
              <Link href="/registro" className="text-xs text-[#1168F8] hover:underline">Ver todas →</Link>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['N°', 'Cliente', 'Destino', 'Total USD', 'Estado', 'Fecha'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-[10px] font-medium text-gray-400 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recientes.map(c => (
                  <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/registro/${c.id}`} className="font-mono text-[#1168F8] hover:underline text-[11px] font-medium">{c.num}</Link>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800 max-w-32 truncate">{c.cliente}</td>
                    <td className="px-4 py-3 text-gray-500">{c.destino_noa}</td>
                    <td className="px-4 py-3 font-mono font-medium text-gray-800">USD {fmt(c.total_landed || 0, 0)}</td>
                    <td className="px-4 py-3"><EstadoBadge estado={c.estado} /></td>
                    <td className="px-4 py-3 text-gray-400 font-mono text-[10px]">{c.created_at?.slice(0, 10)}</td>
                  </tr>
                ))}
                {!recientes.length && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    No hay cotizaciones aún. <Link href="/cotizador" className="text-[#1168F8] hover:underline">Crear la primera →</Link>
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function EstadoBadge({ estado }: { estado: string }) {
  const cls: Record<string, string> = {
    borrador: 'bg-gray-100 text-gray-600',
    enviada: 'bg-blue-50 text-[#1168F8]',
    aceptada: 'bg-green-50 text-green-700',
    rechazada: 'bg-red-50 text-red-700',
    vencida: 'bg-amber-50 text-amber-700',
  }
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${cls[estado] || ''}`}>{ESTADOS_L[estado] || estado}</span>
}
