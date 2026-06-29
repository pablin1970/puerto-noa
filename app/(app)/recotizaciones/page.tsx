'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { fmt } from '@/lib/utils'
import Link from 'next/link'
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

interface CotChain {
  id: string; num: string; estado: string; cliente: string
  total_landed: number | null; created_at: string
  recotiza_de_id: string | null; recotiza_de_num: string | null
  recotiza_linaje: string[]; recotiza_cambios: { concepto: string; antes: string; despues: string }[]
}

interface Cadena {
  raiz: string
  cliente: string
  list: CotChain[]
  estadoFinal: string
}

const fechaCorta = (s: string) => s ? s.slice(0, 10).split('-').reverse().join('/') : '—'

export default function RecotizacionesPage() {
  const supabase = useMemo(() => createClient(), [])
  const [cots, setCots] = useState<CotChain[]>([])
  const [loading, setLoading] = useState(true)
  const [selRaiz, setSelRaiz] = useState<string | null>(null)
  const [buscar, setBuscar] = useState('')

  const [permisos, setPermisos] = useState<Record<string, string[]>>({})
  const [permListos, setPermListos] = useState(false)
  useEffect(() => { cargarPermisos().then(p => { setPermisos(p); setPermListos(true) }) }, [])

  useEffect(() => {
    let mounted = true
    async function load() {
      const { data } = await supabase.from('cotizaciones')
        .select('id,num,estado,cliente,total_landed,created_at,recotiza_de_id,recotiza_de_num,recotiza_linaje,recotiza_cambios')
        .order('created_at', { ascending: true })
      if (!mounted) return
      if (data) setCots(data as any)
      setLoading(false)
    }
    load()
    return () => { mounted = false }
  }, [supabase])

  // Reconstrucción de cadenas: una cotización participa si tiene padre (es hija) o si alguien la tiene como padre (es madre).
  const { cadenas, idsConHija } = useMemo(() => {
    const conHija = new Set(cots.map(c => c.recotiza_de_id).filter(Boolean) as string[])
    const raizNum = (c: CotChain) => (c.recotiza_linaje && c.recotiza_linaje.length) ? c.recotiza_linaje[0] : c.num
    const grupos: Record<string, CotChain[]> = {}
    for (const c of cots) {
      const participa = c.recotiza_de_id || conHija.has(c.id)
      if (!participa) continue
      const r = raizNum(c)
      ;(grupos[r] ||= []).push(c)
    }
    const out: Cadena[] = Object.entries(grupos)
      .map(([raiz, list]) => {
        const ordered = [...list].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
        const hoja = ordered.find(c => !conHija.has(c.id)) || ordered[ordered.length - 1]
        return { raiz, cliente: ordered[0]?.cliente || '', list: ordered, estadoFinal: hoja?.estado || '' }
      })
      .filter(ch => ch.list.some(c => c.recotiza_de_id))
      .sort((a, b) => (b.list[b.list.length - 1].created_at || '').localeCompare(a.list[a.list.length - 1].created_at || ''))
    return { cadenas: out, idsConHija: conHija }
  }, [cots])

  const cadenasFiltradas = useMemo(() => {
    const b = buscar.toLowerCase().trim()
    if (!b) return cadenas
    return cadenas.filter(ch => ch.cliente.toLowerCase().includes(b) || ch.list.some(c => c.num.toLowerCase().includes(b)))
  }, [cadenas, buscar])

  useEffect(() => {
    if (!selRaiz && cadenasFiltradas.length) setSelRaiz(cadenasFiltradas[0].raiz)
  }, [cadenasFiltradas, selRaiz])

  const sel = cadenas.find(ch => ch.raiz === selRaiz) || null

  if (permListos && !puede(permisos, 'cotizaciones_recotizaciones', 'ver')) {
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Análisis de recotizaciones</h1>
          <p className="text-xs text-gray-400 mt-0.5">Seguimiento de cotizaciones recotizadas y qué cambió en cada versión</p>
        </div>
        <Link href="/registro"
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 bg-white rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
          ← Volver a cotizaciones
        </Link>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 text-sm py-20">Cargando…</div>
      ) : cadenas.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center">
          <div className="text-5xl mb-3">🔄</div>
          <h2 className="text-base font-bold text-gray-700">Todavía no hay recotizaciones</h2>
          <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto">Cuando recotices una cotización, acá vas a poder ver la cadena completa y el detalle de cada cambio.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Lista de cadenas */}
          <div className="lg:col-span-5">
            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-3">Cotizaciones que tuvieron recotizaciones</div>
              <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar por cliente o número…"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8] bg-white mb-3" />
              <div className="space-y-2">
                {cadenasFiltradas.map(ch => {
                  const primera = ch.list[0]
                  const ultima = ch.list[ch.list.length - 1]
                  const activo = ch.raiz === selRaiz
                  return (
                    <button key={ch.raiz} onClick={() => setSelRaiz(ch.raiz)}
                      className={`w-full text-left rounded-xl px-3 py-2.5 border transition-all ${activo ? 'border-[#1168F8] bg-[#EBF2FF]' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-900 truncate">{ch.cliente}</div>
                          <div className="text-[10px] text-gray-400 font-mono">{primera.num} → {ultima.num}</div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[10px] text-gray-500">{ch.list.length} versiones</span>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold ${ESTADO_CLS[ch.estadoFinal] || ''}`}>{ch.estadoFinal}</span>
                        </div>
                      </div>
                    </button>
                  )
                })}
                {cadenasFiltradas.length === 0 && <div className="text-xs text-gray-400 text-center py-6">Sin resultados.</div>}
              </div>
            </div>
          </div>

          {/* Detalle de la cadena */}
          <div className="lg:col-span-7">
            {sel ? (
              <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-sm font-bold text-gray-900">{sel.cliente}</div>
                    <div className="text-[10px] text-gray-400">Evolución de la cadena · {sel.list.length} versiones</div>
                  </div>
                  <Link href={`/registro/${sel.list[sel.list.length - 1].id}`}
                    className="text-[11px] text-[#1168F8] font-semibold hover:underline">Ver la última →</Link>
                </div>

                {sel.list.map((c, i) => {
                  const esUltima = i === sel.list.length - 1
                  const esOriginal = i === 0
                  const cambios = Array.isArray(c.recotiza_cambios) ? c.recotiza_cambios : []
                  return (
                    <div key={c.id}>
                      {/* Tarjeta de la cotización */}
                      <div className={`rounded-xl px-4 py-3 flex items-center justify-between gap-3 ${esUltima ? 'border-2 border-[#1168F8] bg-[#F5F9FF]' : 'border border-gray-200 bg-white'}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <Link href={`/registro/${c.id}`} className="font-mono text-[13px] font-bold text-[#1168F8] hover:underline">{c.num}</Link>
                          {esOriginal
                            ? <span className="bg-gray-100 text-gray-500 rounded px-2 py-0.5 text-[10px]">original</span>
                            : <span className="text-[#7C3AED] text-[10px]">↺ de {c.recotiza_de_num}</span>}
                          {esUltima && <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold ${ESTADO_CLS[c.estado] || ''}`}>última · {c.estado}</span>}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="font-mono text-sm font-semibold text-gray-900">USD {fmt(c.total_landed || 0, 0)}</div>
                          <div className="text-[10px] text-gray-400">{fechaCorta(c.created_at)} · {!esUltima ? c.estado : (c.estado === 'aceptada' ? 'pasó a operación' : c.estado)}</div>
                        </div>
                      </div>

                      {/* Modificaciones hacia la siguiente versión */}
                      {!esUltima && (() => {
                        const sig = sel.list[i + 1]
                        const ch = Array.isArray(sig.recotiza_cambios) ? sig.recotiza_cambios : []
                        return (
                          <div className="ml-4 border-l-2 border-gray-200 pl-4 py-2.5">
                            <div className="text-[10px] text-gray-500 mb-1.5">✏️ de {c.num} a {sig.num} · {ch.length === 0 ? 'sin cambios (solo TC)' : `${ch.length} ${ch.length === 1 ? 'cambio' : 'cambios'}`}</div>
                            {ch.length > 0 && (
                              <div className="space-y-1">
                                {ch.map((m, k) => (
                                  <div key={k} className="bg-gray-50 border border-gray-100 rounded px-2.5 py-1.5 text-[11px] flex items-center gap-2 flex-wrap">
                                    <span className="text-gray-600 flex-1 min-w-0">{m.concepto}</span>
                                    <span className="text-gray-400 line-through">{m.antes}</span>
                                    <span className="text-gray-400">→</span>
                                    <span className="text-[#1168F8] font-semibold">{m.despues}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center text-sm text-gray-400">
                Elegí una cadena de la izquierda para ver su evolución.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
