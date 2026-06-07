'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { fmt, ESTADOS_L, nowDate } from '@/lib/utils'
import type { Cotizacion, EstadoCotizacion } from '@/types'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const ESTADO_CLS: Record<string, string> = {
  borrador: 'bg-gray-100 text-gray-600',
  enviada: 'bg-blue-50 text-blue-700',
  aceptada: 'bg-green-50 text-green-700',
  rechazada: 'bg-red-50 text-red-700',
  vencida: 'bg-amber-50 text-amber-700',
}

export default function RegistroPage() {
  const [cots, setCots] = useState<Cotizacion[]>([])
  const [loading, setLoading] = useState(true)
  const [buscar, setBuscar] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [modal, setModal] = useState<{ type: string; cot?: Cotizacion } | null>(null)
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  useEffect(() => {
    let mounted = true
    async function loadData() {
      const { data, error } = await supabase
        .from('cotizaciones')
        .select('*')
        .order('created_at', { ascending: false })
      if (!mounted) return
      if (error) console.error('Error cargando cotizaciones:', error)
      if (data && data.length >= 0) setCots(data as Cotizacion[])
      setLoading(false)
    }
    loadData()
    return () => { mounted = false }
  }, [supabase])

  async function loadData() {
    const { data, error } = await supabase
      .from('cotizaciones')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) console.error('Error cargando cotizaciones:', error)
    if (data) setCots(data as Cotizacion[])
    setLoading(false)
  }

  async function cambiarEstado(id: string, estado: EstadoCotizacion) {
    await (supabase.from('cotizaciones') as any).update({ estado, updated_at: new Date().toISOString() }).eq('id', id)
    if (estado === 'aceptada') {
      // Crear operación si no existe
      const { data: opExist } = await supabase.from('operaciones').select('id').eq('cotizacion_id', id).single()
      let opId = (opExist as any)?.id
      if (!opExist) {
        const { data: newOp } = await (supabase.from('operaciones') as any).insert({ cotizacion_id: id }).select('id').single()
        opId = newOp?.id
      }
      // Copiar proformas a documentos de la operación
      if (opId) {
        const { data: cot } = await supabase.from('cotizaciones').select('*').eq('id', id).single()
        const proformas = (cot as any)?.proformas || []
        for (const pf of proformas) {
          if (pf.archivo_url) {
            await (supabase.from('operacion_documentos') as any).insert({
              operacion_id: opId,
              tipo: 'proforma',
              nombre_custom: `Proforma ${pf.numero || pf.proveedor}`,
              referencia: pf.numero || null,
              fecha: pf.fecha || null,
              archivo_url: pf.archivo_url,
              archivo_nombre: pf.archivo_nombre || 'proforma.pdf',
              notas: `Proveedor: ${pf.proveedor}`,
              subido_por: 'Sistema (cotización aceptada)',
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
    const matchB = !b || c.cliente.toLowerCase().includes(b) || c.num.toLowerCase().includes(b) || c.notas.toLowerCase().includes(b)
    const matchE = !filtroEstado || c.estado === filtroEstado
    return matchB && matchE
  })

  const stats = {
    total: cots.length,
    borrador: cots.filter(c => c.estado === 'borrador').length,
    enviada: cots.filter(c => c.estado === 'enviada').length,
    aceptada: cots.filter(c => c.estado === 'aceptada').length,
    totalUSD: cots.reduce((s, c) => s + (c.total_landed || 0), 0),
  }

  return (
    <div className="p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Registro de cotizaciones</h1>
          <p className="text-xs text-gray-400 mt-0.5">Módulo 2 — Historial y gestión</p>
        </div>
        <Link href="/cotizador" className="flex items-center gap-1.5 bg-[#1168F8] text-white px-4 py-2 rounded-lg text-xs font-medium hover:bg-[#0a4fc4] transition-colors">
          + Nueva cotización
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-3 mb-5">
        {[
          { label: 'Total', value: stats.total, color: 'text-gray-900' },
          { label: 'Borrador', value: stats.borrador, color: 'text-gray-500' },
          { label: 'Enviadas', value: stats.enviada, color: 'text-blue-600' },
          { label: 'Aceptadas', value: stats.aceptada, color: 'text-green-700' },
          { label: 'Valor total', value: `USD ${fmt(stats.totalUSD, 0)}`, color: 'text-[#1168F8]' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-gray-100 rounded-xl p-3.5">
            <div className={`text-lg font-semibold ${s.color}`}>{s.value}</div>
            <div className="text-[10px] text-gray-400 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <input
          value={buscar}
          onChange={e => setBuscar(e.target.value)}
          placeholder="Buscar por cliente, número, mercadería..."
          className="flex-1 min-w-48 px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8]"
        />
        <select
          value={filtroEstado}
          onChange={e => setFiltroEstado(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8] bg-white"
        >
          <option value="">Todos los estados</option>
          {Object.entries(ESTADOS_L).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {/* Tabla */}
      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Cargando...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['N° Cotización', 'Cliente', 'Ruta', 'Contenedores', 'Total USD', 'Estado', 'Ejecutivo', 'Fecha', 'Acciones'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-gray-400 font-medium text-[10px] uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtradas.map(c => (
                  <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/registro/${c.id}`} className="font-mono text-blue-600 hover:underline text-[11px] font-medium">{c.num}</Link>
                      {c.version > 1 && <span className="text-[9px] text-gray-400 ml-1">v{c.version}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{c.cliente}</div>
                      <div className="text-[10px] text-gray-400">{c.cuit}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-[11px]">
                      {c.origen?.split(',')[0]} → {c.destino_noa}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-[11px]">
                      {Array.isArray(c.tipo_contenedores) ? c.tipo_contenedores.map((x: any) => `${x.cantidad}× ${x.tipo}`).join(', ') : '—'}
                    </td>
                    <td className="px-4 py-3 font-mono font-medium text-right">USD {fmt(c.total_landed || 0)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${ESTADO_CLS[c.estado] || ''}`}>
                        {ESTADOS_L[c.estado]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-[11px]">{c.ejecutivo_id?.slice(0, 8) || '—'}</td>
                    <td className="px-4 py-3 text-gray-400 text-[10px]">{c.created_at?.slice(0, 10)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        <Link href={`/registro/${c.id}`} className="p-1.5 border border-gray-200 rounded-md hover:bg-gray-100 text-gray-500 transition-colors" title="Ver detalle">👁</Link>
                        <button onClick={() => setModal({ type: 'estado', cot: c })} className="p-1.5 border border-gray-200 rounded-md hover:bg-gray-100 text-gray-500 transition-colors" title="Cambiar estado">🏷</button>
                        {c.estado === 'aceptada' && (
                          <button onClick={() => router.push(`/operaciones?cot=${c.id}`)} className="p-1.5 border border-green-200 rounded-md hover:bg-green-50 text-green-700 transition-colors" title="Ver operación">🚢</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!filtradas.length && (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">Sin resultados.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal cambiar estado */}
      {modal?.type === 'estado' && modal.cot && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <span className="font-medium text-sm">Cambiar estado — {modal.cot.num}</span>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
            </div>
            <div className="p-5 space-y-2">
              <p className="text-xs text-gray-500 mb-3">Estado actual: <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${ESTADO_CLS[modal.cot.estado]}`}>{ESTADOS_L[modal.cot.estado]}</span></p>
              {(['borrador', 'enviada', 'aceptada', 'rechazada', 'vencida'] as EstadoCotizacion[]).map(e => (
                <button
                  key={e}
                  onClick={() => cambiarEstado(modal.cot!.id, e)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${e === modal.cot?.estado ? 'border-[#1168F8] bg-green-50' : 'border-gray-200 hover:bg-gray-50'}`}
                >
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${ESTADO_CLS[e]}`}>{ESTADOS_L[e]}</span>
                  <span className="text-xs text-gray-500">{{ borrador: 'En preparación', enviada: 'Enviada al cliente', aceptada: 'Confirmada — activa operación', rechazada: 'Rechazada por el cliente', vencida: 'Plazo vencido' }[e]}</span>
                </button>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
              <button onClick={() => setModal(null)} className="px-4 py-2 border border-gray-200 rounded-lg text-xs hover:bg-gray-50">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
