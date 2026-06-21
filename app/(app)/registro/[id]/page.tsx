'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { ESTADOS_L } from '@/lib/utils'
import type { Cotizacion, EstadoCotizacion } from '@/types'
import Link from 'next/link'
import CotizacionDoc from '@/components/CotizacionDoc'
import { cargarPermisos, puede } from '@/lib/permisos'

const ESTADO_CLS: Record<string, string> = {
  borrador: 'bg-gray-100 text-gray-600',
  enviada: 'bg-blue-50 text-[#1168F8]',
  aceptada: 'bg-green-50 text-green-700',
  rechazada: 'bg-red-50 text-red-700',
  vencida: 'bg-amber-50 text-amber-700',
}

export default function CotizacionDetailPage({ params }: { params: { id: string } }) {
  const rawId = params?.id
  const [id, setId] = useState<string>(rawId || '')
  const [cot, setCot] = useState<Cotizacion | null>(null)
  const [loading, setLoading] = useState(true)
  const [ejecutivo, setEjecutivo] = useState<any>(null)
  const [condGenerales, setCondGenerales] = useState<string[]>([])
  const [mostrarComparativa, setMostrarComparativa] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  const [permisos, setPermisos] = useState<Record<string, string[]>>({})
  const [permListos, setPermListos] = useState(false)
  useEffect(() => { cargarPermisos().then(p => { setPermisos(p); setPermListos(true) }) }, [])

  useEffect(() => {
    let cotId = rawId || id
    if (!cotId && typeof window !== 'undefined') {
      const parts = window.location.pathname.split('/')
      cotId = parts[parts.length - 1]
      if (cotId) setId(cotId)
    }
    if (!cotId) return
    supabase.from('condiciones_generales').select('texto,orden,activo').eq('activo', true).order('orden')
      .then(({ data }) => { if (data) setCondGenerales((data as any[]).map(c => c.texto)) })
    supabase.from('cotizaciones').select('*').eq('id', cotId).single().then(({ data, error }) => {
      if (error) console.error('Error:', error)
      if (data) {
        setCot(data as Cotizacion)
        if ((data as any).ejecutivo_id) {
          supabase.from('usuarios').select('*').eq('id', (data as any).ejecutivo_id).single().then(({ data: u }) => {
            if (u) setEjecutivo(u)
          })
        }
      }
      setLoading(false)
    })
  }, [rawId, id])

  async function cambiarEstado(estado: EstadoCotizacion) {
    await (supabase.from('cotizaciones') as any).update({ estado, updated_at: new Date().toISOString() }).eq('id', id)
    if (estado === 'aceptada') {
      const { data: opExist } = await supabase.from('operaciones').select('id').eq('cotizacion_id', id).single()
      if (!opExist) await (supabase.from('operaciones') as any).insert({ cotizacion_id: id })
    }
    setCot(c => c ? { ...c, estado } : c)
  }

  if (loading) return <div className="p-8 text-gray-400">Cargando...</div>
  if (!cot) return (
    <div className="p-8">
      <div className="text-gray-400 text-sm mb-2">Cotización no encontrada.</div>
      <div className="text-[10px] text-gray-300 font-mono">ID: {id}</div>
      <a href="/registro" className="text-xs text-[#1168F8] hover:underline mt-2 block">← Volver</a>
    </div>
  )

  const hayComparativa = ((cot as any).precio_arg_equiv || 0) > 0

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
    <>

      {/* CONTROLES */}
      <div className="no-print bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <Link href="/registro" className="text-xs text-gray-400 hover:text-gray-600">← Cotizaciones</Link>
          <span className="text-gray-300">|</span>
          <span className="font-mono font-bold text-gray-800">{cot.num}</span>
          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${ESTADO_CLS[cot.estado]}`}>{ESTADOS_L[cot.estado]}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {hayComparativa && (
            <button onClick={() => setMostrarComparativa(!mostrarComparativa)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold border transition-colors ${mostrarComparativa ? 'bg-[#1168F8] text-white border-[#1168F8]' : 'bg-white border-gray-200 text-gray-600'}`}>
              {mostrarComparativa ? '✓ Con comparativa' : '+ Agregar comparativa'}
            </button>
          )}
          <span className="text-xs text-gray-400">Estado:</span>
          {(['enviada','aceptada','rechazada','vencida'] as EstadoCotizacion[]).filter(e => e !== cot.estado).map(e => (
            <button key={e} onClick={() => cambiarEstado(e)} className={`px-3 py-1.5 rounded-full text-[10px] font-semibold border ${ESTADO_CLS[e]}`}>{ESTADOS_L[e]}</button>
          ))}
          {cot.estado === 'aceptada' && (
            <button onClick={() => router.push(`/operaciones?cot=${cot.id}`)} className="px-3 py-1.5 bg-[#1168F8] text-white rounded-lg text-xs font-medium hover:bg-[#0a4fc4]">🚢 Operación</button>
          )}
          <button onClick={() => {
            const t = document.title
            document.title = `Cotizacion_${cot.num}_${cot.cliente.replace(/\s+/g,'-')}`
            window.print()
            document.title = t
          }} className="px-4 py-2 bg-[#052698] text-white rounded-lg text-xs font-bold hover:bg-[#1168F8] transition-colors">
            🖨 Imprimir / PDF
          </button>
        </div>
      </div>

      {/* Fondo gris que envuelve las páginas en pantalla */}
      <CotizacionDoc cot={cot} ejecutivo={ejecutivo} condGenerales={condGenerales} mostrarComparativa={mostrarComparativa} />
    </>
  )
}
