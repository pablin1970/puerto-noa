'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { fmt, ESTADOS_L } from '@/lib/utils'
import type { Cotizacion } from '@/types'
import Link from 'next/link'

export default function DashboardPage() {
  const [cots, setCots] = useState<Cotizacion[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const { data } = await supabase
      .from('cotizaciones')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    if (data) setCots(data as Cotizacion[])
    setLoading(false)
  }

  const stats = {
    total: cots.length,
    borrador: cots.filter(c => c.estado === 'borrador').length,
    enviada: cots.filter(c => c.estado === 'enviada').length,
    aceptada: cots.filter(c => c.estado === 'aceptada').length,
    totalUSD: cots.reduce((s, c) => s + (c.total_landed || 0), 0),
  }

  const recientes = cots.slice(0, 8)

  if (loading) return <PageShell title="Dashboard"><div className="p-8 text-gray-400 text-sm">Cargando...</div></PageShell>

  return (
    <PageShell title="Dashboard" sub="Vista general del sistema">
      {/* Stats */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        {[
          { label: 'Cotizaciones', value: stats.total, color: 'text-gray-900' },
          { label: 'Borrador', value: stats.borrador, color: 'text-gray-500' },
          { label: 'Enviadas', value: stats.enviada, color: 'text-blue-600' },
          { label: 'Aceptadas', value: stats.aceptada, color: 'text-green-700' },
          { label: 'Valor total', value: `USD ${fmt(stats.totalUSD, 0)}`, color: 'text-[#1D9E75]' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-gray-100 rounded-xl p-4">
            <div className={`text-xl font-semibold ${s.color}`}>{s.value}</div>
            <div className="text-[10px] text-gray-400 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Actividad reciente */}
      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <span className="font-medium text-sm text-gray-900">Cotizaciones recientes</span>
          <Link href="/registro" className="text-xs text-[#1D9E75] hover:underline">Ver todas →</Link>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100">
              {['N°', 'Cliente', 'Destino', 'Contenedores', 'Total USD', 'Estado', 'Fecha'].map(h => (
                <th key={h} className="text-left px-4 py-2.5 text-gray-400 font-medium text-[10px] uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recientes.map(c => (
              <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <Link href={`/registro/${c.id}`} className="font-mono text-blue-600 hover:underline text-[11px]">{c.num}</Link>
                </td>
                <td className="px-4 py-3 font-medium text-gray-800">{c.cliente}</td>
                <td className="px-4 py-3 text-gray-500">{c.destino_noa}</td>
                <td className="px-4 py-3 text-gray-500">{Array.isArray(c.tipo_contenedores) ? c.tipo_contenedores.map((x: any) => `${x.cantidad}× ${x.tipo}`).join(', ') : '—'}</td>
                <td className="px-4 py-3 font-mono font-medium">USD {fmt(c.total_landed || 0, 0)}</td>
                <td className="px-4 py-3"><EstadoBadge estado={c.estado} /></td>
                <td className="px-4 py-3 text-gray-400">{c.created_at?.slice(0, 10)}</td>
              </tr>
            ))}
            {!recientes.length && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                No hay cotizaciones aún. <Link href="/cotizador" className="text-[#1D9E75] hover:underline">Crear la primera →</Link>
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </PageShell>
  )
}

function EstadoBadge({ estado }: { estado: string }) {
  const cls: Record<string, string> = {
    borrador: 'bg-gray-100 text-gray-600',
    enviada: 'bg-blue-50 text-blue-700',
    aceptada: 'bg-green-50 text-green-700',
    rechazada: 'bg-red-50 text-red-700',
    vencida: 'bg-amber-50 text-amber-700',
  }
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${cls[estado] || ''}`}>{ESTADOS_L[estado] || estado}</span>
}

function PageShell({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      {children}
    </div>
  )
}
