'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { fmt, ESTADOS_L, PUERTOS_L } from '@/lib/utils'
import type { Cotizacion, EstadoCotizacion } from '@/types'
import Link from 'next/link'

const ESTADO_CLS: Record<string, string> = {
  borrador: 'bg-gray-100 text-gray-600',
  enviada: 'bg-blue-50 text-blue-700',
  aceptada: 'bg-green-50 text-green-700',
  rechazada: 'bg-red-50 text-red-700',
  vencida: 'bg-amber-50 text-amber-700',
}

export default function CotizacionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [cot, setCot] = useState<Cotizacion | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    supabase.from('cotizaciones').select('*').eq('id', id).single().then(({ data }) => {
      if (data) setCot(data as Cotizacion)
      setLoading(false)
    })
  }, [id])

  async function cambiarEstado(estado: EstadoCotizacion) {
    await supabase.from('cotizaciones').update({ estado, updated_at: new Date().toISOString() }).eq('id', id)
    if (estado === 'aceptada') {
      const { data: opExist } = await supabase.from('operaciones').select('id').eq('cotizacion_id', id).single()
      if (!opExist) await supabase.from('operaciones').insert({ cotizacion_id: id })
    }
    setCot(c => c ? { ...c, estado } : c)
  }

  if (loading) return <div className="p-8 text-gray-400 text-sm">Cargando...</div>
  if (!cot) return <div className="p-8 text-gray-400 text-sm">Cotización no encontrada.</div>

  const presup = Array.isArray(cot.presupuesto) ? cot.presupuesto : []

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/registro" className="text-xs text-gray-400 hover:text-gray-600">← Cotizaciones</Link>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-gray-900 font-mono">{cot.num}</h1>
            {cot.version > 1 && <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">v{cot.version}</span>}
            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${ESTADO_CLS[cot.estado]}`}>
              {ESTADOS_L[cot.estado]}
            </span>
          </div>
          <p className="text-sm text-gray-600 mt-0.5">{cot.cliente} · {cot.created_at?.slice(0, 10)}</p>
        </div>
        <div className="flex gap-2">
          {cot.estado === 'aceptada' && (
            <button onClick={() => router.push(`/operaciones?cot=${cot.id}`)} className="flex items-center gap-1.5 px-3 py-2 bg-[#1D9E75] text-white rounded-lg text-xs font-medium hover:bg-[#0F6E56] transition-colors">
              🚢 Ver operación
            </button>
          )}
          <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-xs hover:bg-gray-50 transition-colors">
            🖨 Imprimir
          </button>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        {/* Datos cliente */}
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Cliente</div>
          <div className="space-y-2 text-xs">
            <div><span className="text-gray-400">Razón social: </span><span className="font-medium text-gray-800">{cot.cliente}</span></div>
            {cot.cuit && <div><span className="text-gray-400">CUIT: </span><span className="font-mono">{cot.cuit}</span></div>}
            {cot.email_cliente && <div><span className="text-gray-400">Email: </span><span>{cot.email_cliente}</span></div>}
            {cot.telefono_cliente && <div><span className="text-gray-400">Tel: </span><span>{cot.telefono_cliente}</span></div>}
          </div>
        </div>

        {/* Ruta */}
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Ruta de embarque</div>
          <div className="space-y-2 text-xs">
            <div><span className="text-gray-400">Origen: </span><span className="font-medium">{cot.origen}</span></div>
            <div><span className="text-gray-400">Puerto Chile: </span><span>{PUERTOS_L[cot.puerto_chile || ''] || cot.puerto_chile}</span></div>
            <div><span className="text-gray-400">Destino: </span><span>{cot.destino_noa}</span></div>
            <div><span className="text-gray-400">Incoterm: </span><span className="font-mono font-medium">{cot.incoterm}</span></div>
            {cot.transito && <div><span className="text-gray-400">Tránsito: </span><span>{cot.transito}</span></div>}
            {cot.validez && <div><span className="text-gray-400">Validez: </span><span>{cot.validez}</span></div>}
          </div>
        </div>

        {/* Estado */}
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Estado y acciones</div>
          <div className="text-xs text-gray-400 mb-2">Estado actual:</div>
          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium mb-4 ${ESTADO_CLS[cot.estado]}`}>{ESTADOS_L[cot.estado]}</span>
          <div className="text-xs text-gray-400 mb-2">Cambiar a:</div>
          <div className="flex flex-wrap gap-1.5">
            {(['enviada', 'aceptada', 'rechazada', 'vencida'] as EstadoCotizacion[]).filter(e => e !== cot.estado).map(e => (
              <button key={e} onClick={() => cambiarEstado(e)} className={`px-2 py-1 rounded-full text-[10px] font-medium border transition-colors ${ESTADO_CLS[e]}`}>
                {ESTADOS_L[e]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Contenedores & Productos */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Contenedores</div>
          {Array.isArray(cot.tipo_contenedores) && cot.tipo_contenedores.map((c: any, i: number) => (
            <div key={i} className="flex justify-between text-xs py-1 border-b border-gray-50">
              <span className="font-mono font-medium text-gray-700">{c.tipo}</span>
              <span className="text-gray-500">{c.cantidad} unidad(es)</span>
            </div>
          ))}
        </div>

        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Productos</div>
          {Array.isArray(cot.productos) && cot.productos.filter((p: any) => p.subtotal > 0).map((p: any, i: number) => (
            <div key={i} className="flex justify-between text-xs py-1 border-b border-gray-50">
              <div>
                <span className="font-medium text-gray-800">{p.descripcion || 'Sin descripción'}</span>
                {p.ncm && <span className="text-gray-400 ml-2 font-mono text-[10px]">NCM {p.ncm}</span>}
              </div>
              <span className="font-mono text-gray-700">USD {fmt(p.subtotal)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Totales */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          { label: 'FOB China', value: `USD ${fmt(cot.total_fob || 0, 0)}` },
          { label: 'Total logístico', value: `USD ${fmt(cot.total_logistico || 0, 0)}` },
          { label: 'Tributos ARCA', value: `ARS ${Math.round(cot.total_tributos_ars || 0).toLocaleString('es-AR')}` },
          { label: 'TOTAL LANDED', value: `USD ${fmt(cot.total_landed || 0, 0)}`, highlight: true },
        ].map(b => (
          <div key={b.label} className={`rounded-xl p-4 ${b.highlight ? 'bg-[#085041]' : 'bg-white border border-gray-100'}`}>
            <div className={`text-[10px] mb-1 ${b.highlight ? 'text-[#9FE1CB]' : 'text-gray-400'}`}>{b.label}</div>
            <div className={`text-xl font-semibold ${b.highlight ? 'text-white' : 'text-gray-900'}`}>{b.value}</div>
          </div>
        ))}
      </div>

      {/* Presupuesto detallado */}
      {presup.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden mb-4">
          <div className="px-5 py-3.5 border-b border-gray-100 font-medium text-sm text-gray-900">Presupuesto detallado</div>
          <table className="w-full text-xs">
            <thead><tr className="bg-gray-50"><th className="text-left px-4 py-2 text-[10px] text-gray-400 font-medium uppercase tracking-wide">Etapa</th><th className="text-left px-4 py-2 text-[10px] text-gray-400 font-medium uppercase tracking-wide">Concepto</th><th className="text-right px-4 py-2 text-[10px] text-gray-400 font-medium uppercase tracking-wide">USD</th></tr></thead>
            <tbody>
              {presup.map((it: any, i: number) => (
                <tr key={i} className="border-b border-gray-50">
                  <td className="px-4 py-2.5 text-gray-500 capitalize">{it.etapa}</td>
                  <td className="px-4 py-2.5 text-gray-700">{it.concepto}</td>
                  <td className="px-4 py-2.5 font-mono text-right">USD {fmt(it.usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {cot.notas && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
          <strong>Notas: </strong>{cot.notas}
        </div>
      )}
    </div>
  )
}
