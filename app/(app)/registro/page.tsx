'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { fmt, ESTADOS_L } from '@/lib/utils'
import type { Cotizacion, EstadoCotizacion } from '@/types'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cargarPermisos, puede } from '@/lib/permisos'

const ESTADO_CLS: Record<string, string> = {
  borrador: 'bg-gray-100 text-gray-600 border border-gray-200',
  enviada: 'bg-blue-50 text-[#1168F8] border border-blue-200',
  aceptada: 'bg-green-50 text-green-700 border border-green-200',
  rechazada: 'bg-red-50 text-red-700 border border-red-200',
  vencida: 'bg-amber-50 text-amber-700 border border-amber-200',
}

const ESTADO_ICON: Record<string, string> = {
  borrador: '✏️', enviada: '📤', aceptada: '✅', rechazada: '❌', vencida: '⏰',
}

export default function RegistroPage() {
  const [cots, setCots] = useState<Cotizacion[]>([])
  const [loading, setLoading] = useState(true)
  const [buscar, setBuscar] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [modal, setModal] = useState<{ type: string; cot?: Cotizacion } | null>(null)
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  const [permisos, setPermisos] = useState<Record<string, string[]>>({})
  const [permListos, setPermListos] = useState(false)
  useEffect(() => { cargarPermisos().then(p => { setPermisos(p); setPermListos(true) }) }, [])

  useEffect(() => {
    let mounted = true
    async function loadData() {
      const { data, error } = await supabase.from('cotizaciones').select('*').order('created_at', { ascending: false })
      if (!mounted) return
      if (error) console.error('Error:', error)
      if (data && data.length >= 0) setCots(data as Cotizacion[])
      setLoading(false)
    }
    loadData()
    return () => { mounted = false }
  }, [supabase])

  async function loadData() {
    const { data } = await supabase.from('cotizaciones').select('*').order('created_at', { ascending: false })
    if (data) setCots(data as Cotizacion[])
  }

  async function cambiarEstado(id: string, estado: EstadoCotizacion) {
    await (supabase.from('cotizaciones') as any).update({ estado, updated_at: new Date().toISOString() }).eq('id', id)
    if (estado === 'aceptada') {
      const { data: opExist } = await supabase.from('operaciones').select('id').eq('cotizacion_id', id).single()
      let opId = (opExist as any)?.id
      if (!opExist) {
        // La operación nace completa: copia cliente, estado inicial y sentido (Impo/Expo) desde la cotización.
        const { data: cotBase } = await supabase.from('cotizaciones').select('tercero_id, estado_cotizador').eq('id', id).single()
        const sentido = (cotBase as any)?.estado_cotizador?.sentido || null
        const { data: newOp } = await (supabase.from('operaciones') as any).insert({
          cotizacion_id: id,
          tercero_id: (cotBase as any)?.tercero_id || null,
          estado: 'activa',
          sentido,
        }).select('id').single()
        opId = newOp?.id
      }
      if (opId) {
        const { data: cot } = await supabase.from('cotizaciones').select('*').eq('id', id).single()
        const proformas = (cot as any)?.proformas || []
        for (const pf of proformas) {
          if (pf.archivo_url) {
            await (supabase.from('operacion_documentos') as any).insert({
              operacion_id: opId, tipo: 'proforma',
              nombre_custom: `Proforma ${pf.numero || pf.proveedor}`,
              referencia: pf.numero || null, fecha: pf.fecha || null,
              archivo_url: pf.archivo_url, archivo_nombre: pf.archivo_nombre || 'proforma.pdf',
              notas: `Proveedor: ${pf.proveedor}`, subido_por: 'Sistema (cotización aceptada)',
            })
          }
        }
      }
    }
    setModal(null)
    loadData()
  }

  const filtradas = cots.filter(c => {
    const b = buscar.toLowerCase()
    const matchB = !b || c.cliente.toLowerCase().includes(b) || c.num.toLowerCase().includes(b) || (c.notas || '').toLowerCase().includes(b)
    const matchE = !filtroEstado || c.estado === filtroEstado
    return matchB && matchE
  })

  const stats = {
    total: cots.length,
    borrador: cots.filter(c => c.estado === 'borrador').length,
    enviada: cots.filter(c => c.estado === 'enviada').length,
    aceptada: cots.filter(c => c.estado === 'aceptada').length,
    totalUSD: cots.filter(c => c.estado === 'aceptada').reduce((s, c) => s + (c.total_landed || 0), 0),
  }

  if (permListos && !puede(permisos, 'cotizaciones', 'ver')) {
    return (
      <div className="p-6 bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-3">🔒</div>
          <h2 className="text-lg font-bold text-gray-700">Sin acceso</h2>
          <p className="text-sm text-gray-400 mt-1">No tenés permiso para ver esta sección. Si creés que es un error, contactá al administrador.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Cotizaciones</h1>
          <p className="text-xs text-gray-400 mt-0.5">Módulo 2 — Historial y gestión de cotizaciones</p>
        </div>
        <Link href="/cotizador"
          className="flex items-center gap-2 px-5 py-2.5 bg-[#1168F8] text-white rounded-xl text-sm font-semibold hover:bg-[#0a4fc4] transition-colors shadow-sm">
          + Nueva cotización
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-5 gap-3 mb-5">
        {[
          { label: 'Total', value: stats.total, icon: '📋', color: 'text-gray-900', bg: 'bg-white', border: 'border-gray-100', action: () => setFiltroEstado('') },
          { label: 'Borradores', value: stats.borrador, icon: '✏️', color: 'text-gray-500', bg: 'bg-white', border: 'border-gray-100', action: () => setFiltroEstado('borrador') },
          { label: 'Enviadas', value: stats.enviada, icon: '📤', color: 'text-[#1168F8]', bg: 'bg-white', border: filtroEstado === 'enviada' ? 'border-[#1168F8]' : 'border-gray-100', action: () => setFiltroEstado('enviada') },
          { label: 'Aceptadas', value: stats.aceptada, icon: '✅', color: 'text-green-700', bg: 'bg-white', border: filtroEstado === 'aceptada' ? 'border-green-500' : 'border-gray-100', action: () => setFiltroEstado('aceptada') },
          { label: 'Valor aceptadas', value: `USD ${fmt(stats.totalUSD, 0)}`, icon: '💰', color: 'text-[#1168F8]', bg: 'bg-[#EBF2FF]', border: 'border-[#93B8FC]', action: () => {} },
        ].map(s => (
          <button key={s.label} onClick={s.action}
            className={`${s.bg} border ${s.border} rounded-2xl p-4 shadow-sm text-left hover:shadow-md transition-all`}>
            <div className="text-xl mb-2">{s.icon}</div>
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-[10px] text-gray-500 mt-1">{s.label}</div>
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <div className="relative flex-1 min-w-64">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🔍</span>
          <input
            value={buscar}
            onChange={e => setBuscar(e.target.value)}
            placeholder="Buscar por cliente, número, notas..."
            className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white shadow-sm"
          />
        </div>
        <select
          value={filtroEstado}
          onChange={e => setFiltroEstado(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white shadow-sm"
        >
          <option value="">Todos los estados</option>
          {Object.entries(ESTADOS_L).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {(buscar || filtroEstado) && (
          <button onClick={() => { setBuscar(''); setFiltroEstado('') }}
            className="px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-500 hover:bg-gray-100 transition-colors">
            ✕ Limpiar
          </button>
        )}
        <span className="text-xs text-gray-400 ml-auto">{filtradas.length} cotización(es)</span>
      </div>

      {/* Tabla */}
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-12 text-center">
            <div className="text-3xl mb-3">⏳</div>
            <div className="text-gray-400 text-sm">Cargando cotizaciones...</div>
          </div>
        ) : filtradas.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-4xl mb-3">📄</div>
            <div className="text-gray-500 text-sm mb-1">{cots.length === 0 ? 'Sin cotizaciones aún' : 'Sin resultados para el filtro'}</div>
            {cots.length === 0 && (
              <Link href="/cotizador" className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-semibold hover:bg-[#0a4fc4] transition-colors">
                + Crear primera cotización
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['N° Cotización', 'Cliente', 'Ruta', 'Mercadería', 'Total USD', 'Estado', 'Fecha', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtradas.map(c => (
                  <tr key={c.id} className="border-b border-gray-50 hover:bg-blue-50/20 transition-colors group">
                    <td className="px-4 py-4">
                      <Link href={`/registro/${c.id}`} className="font-mono text-[#1168F8] hover:underline font-bold text-[11px]">
                        {c.num}
                      </Link>
                      {c.version > 1 && <span className="text-[9px] text-gray-400 ml-1 bg-gray-100 px-1 rounded">v{c.version}</span>}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-[#EBF2FF] flex items-center justify-center text-[#052698] text-[10px] font-bold flex-shrink-0">
                          {c.cliente?.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-gray-900">{c.cliente}</div>
                          {c.cuit && <div className="text-[10px] text-gray-400 font-mono">{c.cuit}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-gray-700 text-[11px]">{c.origen?.split(',')[0]} → {c.destino_noa}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">{c.transito}</div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-gray-700 text-[11px]">
                        {Array.isArray(c.tipo_contenedores) ? c.tipo_contenedores.map((x: any) => `${x.cantidad}× ${x.tipo}`).join(', ') : '—'}
                      </div>
                      <div className="text-[10px] text-gray-400 mt-0.5">{c.incoterm}</div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-mono font-bold text-gray-900">USD {fmt(c.total_landed || 0, 0)}</div>
                      {(c.total_tributos_usd || 0) > 0 && (
                        <div className="text-[10px] text-gray-400 mt-0.5">Tributos: USD {fmt(c.total_tributos_usd || 0, 0)}</div>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold ${ESTADO_CLS[c.estado] || ''}`}>
                        <span>{ESTADO_ICON[c.estado]}</span>
                        {ESTADOS_L[c.estado]}
                      </span>
                    </td>
                    <td className="px-4 py-4 font-mono text-[10px] text-gray-400">
                      {c.created_at ? new Date(c.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link href={`/registro/${c.id}`}
                          className="p-1.5 border border-gray-200 rounded-lg hover:bg-[#EBF2FF] hover:border-[#93B8FC] text-gray-500 hover:text-[#1168F8] transition-colors"
                          title="Ver detalle">👁</Link>
                        <button onClick={() => setModal({ type: 'estado', cot: c })}
                          className="p-1.5 border border-gray-200 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
                          title="Cambiar estado">🏷</button>
                        {c.estado === 'aceptada' && (
                          <button onClick={() => router.push(`/operaciones?cot=${c.id}`)}
                            className="p-1.5 border border-green-200 rounded-lg hover:bg-green-50 text-green-700 transition-colors"
                            title="Ver operación">🚢</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal cambiar estado */}
      {modal?.type === 'estado' && modal.cot && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <span className="font-bold text-sm text-gray-900">Cambiar estado</span>
                <span className="text-xs text-gray-400 ml-2 font-mono">{modal.cot.num}</span>
              </div>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none w-6 h-6 flex items-center justify-center">×</button>
            </div>
            <div className="p-4 space-y-2">
              <div className="text-xs text-gray-500 mb-3 flex items-center gap-2">
                Estado actual:
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${ESTADO_CLS[modal.cot.estado]}`}>
                  {ESTADO_ICON[modal.cot.estado]} {ESTADOS_L[modal.cot.estado]}
                </span>
              </div>
              {(['borrador', 'enviada', 'aceptada', 'rechazada', 'vencida'] as EstadoCotizacion[]).map(e => (
                <button key={e} onClick={() => cambiarEstado(modal.cot!.id, e)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                    e === modal.cot?.estado
                      ? 'border-[#1168F8] bg-[#EBF2FF]'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}>
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${ESTADO_CLS[e]}`}>
                    {ESTADO_ICON[e]} {ESTADOS_L[e]}
                  </span>
                  <span className="text-xs text-gray-500">
                    {{ borrador: 'En preparación', enviada: 'Enviada al cliente', aceptada: 'Confirmada → activa operación', rechazada: 'Rechazada por el cliente', vencida: 'Plazo vencido' }[e]}
                  </span>
                  {e === 'aceptada' && e !== modal.cot?.estado && (
                    <span className="ml-auto text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">🚢 Crea operación</span>
                  )}
                </button>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
              <button onClick={() => setModal(null)} className="px-4 py-2 border border-gray-200 rounded-xl text-xs hover:bg-gray-50 transition-colors">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
