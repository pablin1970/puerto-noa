'use client'
import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { cargarPermisos, esSuperAdmin, puede } from '@/lib/permisos'

const inp = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white'
const chipOn = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border-0 bg-[#1168F8] text-white shadow-sm cursor-pointer hover:bg-[#052698] transition-colors'
const chipOff = 'px-2.5 py-1 rounded-lg text-[11px] border border-gray-300 bg-white text-gray-500 cursor-pointer hover:border-gray-400 hover:bg-gray-50 hover:text-gray-700 transition-colors'
// Sub-pastillas de piso/techo: cuelgan de la forma de cobro "% sobre CIF" (verde para distinguirlas)
const subOn = 'px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#0a9e6e] text-white cursor-pointer hover:bg-[#08855d] transition-colors'
const subOff = 'px-2 py-0.5 rounded-md text-[10px] border border-gray-300 bg-white text-gray-400 cursor-pointer hover:border-gray-400 hover:text-gray-600 transition-colors'

const COMPORTAMIENTO_LABEL: Record<string, string> = {
  cantidad_simple: 'Cantidad × precio',
  por_tiempo: 'Por tiempo (usa días libres)',
  por_hora: 'Por hora (mín. horas)',
  fijo: 'Precio fijo',
  porcentaje: '% sobre CIF',
}

const COMPORTAMIENTOS = [
  { value: 'cantidad_simple', label: 'Cantidad × precio' },
  { value: 'por_tiempo', label: 'Por tiempo (usa días libres)' },
  { value: 'por_hora', label: 'Por hora (mínimo de horas)' },
  { value: 'fijo', label: 'Precio fijo' },
  { value: 'porcentaje', label: '% sobre CIF' },
]

// Label legible para los grupos. Los de depósito tienen nombre propio; el resto se muestra capitalizado.
function grupoLabel(g: string): string {
  if (g === 'operativos') return 'Servicios operativos (tarifa fija)'
  if (g === 'variables') return 'Servicios variables / por uso'
  if (g === 'general' || !g) return 'General'
  return g.charAt(0).toUpperCase() + g.slice(1)
}

export default function ServiciosCatalogo() {
  const supabase = useMemo(() => createClient(), [])
  const [rubros, setRubros] = useState<any[]>([])
  const [rubro, setRubro] = useState('deposito')
  const [servicios, setServicios] = useState<any[]>([])
  const [metricas, setMetricas] = useState<any[]>([])
  const [habSet, setHabSet] = useState<Set<string>>(new Set())
  const [habMinSet, setHabMinSet] = useState<Set<string>>(new Set())  // formas con "mínimo de cobro" tildado
  const [usados, setUsados] = useState<Set<string>>(new Set())
  const [metricasUsadas, setMetricasUsadas] = useState<Set<string>>(new Set())
  const [superAdmin, setSuperAdmin] = useState(false)
  const [puedeVer, setPuedeVer] = useState(true)
  const [puedeCrear, setPuedeCrear] = useState(false)
  const [puedeEditar, setPuedeEditar] = useState(false)
  const [loading, setLoading] = useState(true)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoGrupo, setNuevoGrupo] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editNombre, setEditNombre] = useState('')
  // gestión de formas de cobro (métricas)
  const [showMetricas, setShowMetricas] = useState(false)
  const [nmNombre, setNmNombre] = useState('')
  const [nmComp, setNmComp] = useState('cantidad_simple')
  const [nmUnidad, setNmUnidad] = useState('')
  const [editMetId, setEditMetId] = useState<string | null>(null)
  const [editMetNombre, setEditMetNombre] = useState('')

  // Carga base: permisos, rubros de proveedor, métricas globales, habilitadas, items usados.
  // Los servicios NO se cargan acá: dependen del rubro y los carga loadServicios().
  const loadBase = useCallback(async () => {
    setLoading(true)
    const permisos = await cargarPermisos()
    setSuperAdmin(esSuperAdmin())
    setPuedeVer(puede(permisos, 'cat_servicios', 'ver'))
    setPuedeCrear(puede(permisos, 'cat_servicios', 'crear'))
    setPuedeEditar(puede(permisos, 'cat_servicios', 'editar'))
    const [rRes, mRes, hRes, iRes] = await Promise.all([
      supabase.from('proveedor_rubros').select('codigo,nombre,color,icono,activo,orden').eq('activo', true).order('orden', { ascending: true }),
      supabase.from('servicios_metricas').select('*').order('orden', { ascending: true }),
      supabase.from('servicios_metricas_habilitadas').select('servicio_id,metrica_id,usa_minimo'),
      supabase.from('cotizaciones_proveedor_v2_items').select('servicio_id,metrica_id'),
    ])
    if (rRes.data) setRubros(rRes.data)
    if (mRes.data) setMetricas(mRes.data)
    const hData: any[] = hRes.data || []
    setHabSet(new Set(hData.map((h: any) => h.servicio_id + '|' + h.metrica_id)))
    setHabMinSet(new Set(hData.filter((h: any) => h.usa_minimo).map((h: any) => h.servicio_id + '|' + h.metrica_id)))
    const iData: any[] = iRes.data || []
    setUsados(new Set(iData.filter((r: any) => r.servicio_id).map((r: any) => r.servicio_id)))
    const mU = new Set<string>()
    hData.forEach((h: any) => { if (h.metrica_id) mU.add(h.metrica_id) })
    iData.forEach((r: any) => { if (r.metrica_id) mU.add(r.metrica_id) })
    setMetricasUsadas(mU)
    setLoading(false)
  }, [supabase])

  // Carga los servicios del rubro seleccionado.
  const loadServicios = useCallback(async () => {
    const { data } = await supabase.from('servicios_catalogo').select('*').eq('rubro', rubro).order('orden', { ascending: true })
    setServicios(data || [])
  }, [supabase, rubro])

  useEffect(() => { loadBase() }, [loadBase])
  useEffect(() => { loadServicios() }, [loadServicios])

  // Grupos presentes en los servicios del rubro actual (ordenados; operativos/variables primero, general al final).
  const gruposPresentes = useMemo(() => {
    const set = new Set<string>()
    servicios.forEach(s => set.add(s.grupo || 'general'))
    const prio = ['operativos', 'variables']
    return Array.from(set).sort((a, b) => {
      const ia = prio.indexOf(a), ib = prio.indexOf(b)
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 90 : ia) - (ib === -1 ? 90 : ib)
      if (a === 'general') return 1
      if (b === 'general') return -1
      return a.localeCompare(b)
    })
  }, [servicios])

  const rubroActual = rubros.find(r => r.codigo === rubro)
  const nombreRubro = rubroActual?.nombre || rubro

  async function toggleActivo(s: any) {
    if (!puedeEditar) return
    await (supabase.from('servicios_catalogo') as any).update({ activo: !s.activo }).eq('id', s.id)
    setServicios(prev => prev.map(x => x.id === s.id ? { ...x, activo: !x.activo } : x))
  }

  // Togglea un flag booleano del ítem del catálogo (usa_dias_libres / pct_piso / pct_techo).
  // Son las pastillas de comportamiento: días libres es autónoma; piso/techo cuelgan del "% sobre CIF".
  async function toggleCampoItem(s: any, campo: 'usa_dias_libres' | 'pct_piso' | 'pct_techo') {
    if (!puedeEditar) return
    const nuevo = !s[campo]
    setServicios(prev => prev.map(x => x.id === s.id ? { ...x, [campo]: nuevo } : x))
    await (supabase.from('servicios_catalogo') as any).update({ [campo]: nuevo }).eq('id', s.id)
  }

  async function toggleMetrica(servicioId: string, metricaId: string) {
    if (!puedeEditar) return
    const key = servicioId + '|' + metricaId
    const yaEsta = habSet.has(key)
    setHabSet(prev => {
      const n = new Set(prev)
      if (yaEsta) n.delete(key); else n.add(key)
      return n
    })
    if (yaEsta) {
      // Al quitar la forma, también se va su flag de mínimo (la fila se borra)
      setHabMinSet(prev => { const n = new Set(prev); n.delete(key); return n })
      await supabase.from('servicios_metricas_habilitadas').delete().eq('servicio_id', servicioId).eq('metrica_id', metricaId)
    } else {
      await (supabase.from('servicios_metricas_habilitadas') as any).insert({ servicio_id: servicioId, metrica_id: metricaId })
    }
  }

  // Togglea "mínimo de cobro" de una forma (relación ítem↔forma). Solo formas cantidad × precio.
  async function toggleMinimo(servicioId: string, metricaId: string) {
    if (!puedeEditar) return
    const key = servicioId + '|' + metricaId
    const yaEsta = habMinSet.has(key)
    setHabMinSet(prev => {
      const n = new Set(prev)
      if (yaEsta) n.delete(key); else n.add(key)
      return n
    })
    await (supabase.from('servicios_metricas_habilitadas') as any)
      .update({ usa_minimo: !yaEsta })
      .eq('servicio_id', servicioId).eq('metrica_id', metricaId)
  }

  async function addServicio() {
    if (!puedeCrear) return
    const nombre = nuevoNombre.trim()
    if (!nombre) return
    const maxOrden = servicios.reduce((m, s) => Math.max(m, s.orden || 0), 0)
    const { data } = await (supabase.from('servicios_catalogo') as any)
      .insert({ rubro, grupo: nuevoGrupo.trim() || null, nombre, orden: maxOrden + 10, activo: true })
      .select().single()
    if (data) setServicios(prev => [...prev, data])
    setNuevoNombre('')
  }

  function startEdit(s: any) { if (!puedeEditar) return; setEditId(s.id); setEditNombre(s.nombre) }

  async function saveEdit() {
    if (!editId) return
    const nombre = editNombre.trim()
    if (!nombre) { setEditId(null); return }
    await (supabase.from('servicios_catalogo') as any).update({ nombre }).eq('id', editId)
    setServicios(prev => prev.map(s => s.id === editId ? { ...s, nombre } : s))
    setEditId(null)
  }

  async function delServicio(s: any) {
    if (!superAdmin) return
    if (usados.has(s.id)) {
      alert('Este servicio ya se usó en cotizaciones. No se puede eliminar — podés desactivarlo.')
      return
    }
    if (!confirm(`¿Eliminar "${s.nombre}" del catálogo? Esta acción no se puede deshacer.`)) return
    await supabase.from('servicios_catalogo').delete().eq('id', s.id)
    setServicios(prev => prev.filter(x => x.id !== s.id))
  }

  // ---- formas de cobro (métricas) ----
  async function addMetrica() {
    if (!puedeCrear) return
    const nombre = nmNombre.trim()
    if (!nombre) return
    const codigo = nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') + '_' + Date.now().toString(36)
    const maxOrden = metricas.reduce((m, x) => Math.max(m, x.orden || 0), 0)
    const { data } = await (supabase.from('servicios_metricas') as any)
      .insert({ codigo, nombre, comportamiento: nmComp, unidad_label: nmUnidad.trim() || null, activo: true, orden: maxOrden + 10 })
      .select().single()
    if (data) setMetricas(prev => [...prev, data])
    setNmNombre(''); setNmUnidad(''); setNmComp('cantidad_simple')
  }

  async function toggleMetricaActiva(m: any) {
    if (!puedeEditar) return
    await (supabase.from('servicios_metricas') as any).update({ activo: !m.activo }).eq('id', m.id)
    setMetricas(prev => prev.map(x => x.id === m.id ? { ...x, activo: !x.activo } : x))
  }

  function startEditMetrica(m: any) { if (!puedeEditar) return; setEditMetId(m.id); setEditMetNombre(m.nombre) }

  async function saveEditMetrica() {
    if (!editMetId) return
    const nombre = editMetNombre.trim()
    if (!nombre) { setEditMetId(null); return }
    await (supabase.from('servicios_metricas') as any).update({ nombre }).eq('id', editMetId)
    setMetricas(prev => prev.map(m => m.id === editMetId ? { ...m, nombre } : m))
    setEditMetId(null)
  }

  async function delMetrica(m: any) {
    if (!superAdmin) return
    if (metricasUsadas.has(m.id)) {
      alert('Esta forma de cobro está en uso (tildada en un servicio o usada en cotizaciones). No se puede eliminar — podés desactivarla.')
      return
    }
    if (!confirm(`¿Eliminar la forma de cobro "${m.nombre}"? Esta acción no se puede deshacer.`)) return
    await supabase.from('servicios_metricas').delete().eq('id', m.id)
    setMetricas(prev => prev.filter(x => x.id !== m.id))
  }

  if (loading) return <div className="p-8 text-center text-gray-400 text-sm">Cargando...</div>

  if (!puedeVer) return (
    <div className="p-8 text-center text-gray-400 text-sm">
      No tenés permiso para ver el catálogo de servicios.
    </div>
  )

  const metricasActivas = metricas.filter(m => m.activo !== false)
  const sugerenciasGrupo = Array.from(new Set([...gruposPresentes.filter(g => g !== 'general'), 'operativos', 'variables']))

  return (
    <div className="space-y-4">
      {/* Selector de rubro */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4">
        <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Rubro de proveedor</label>
        <div className="flex items-center gap-3 flex-wrap">
          <select value={rubro} onChange={e => { setRubro(e.target.value); setEditId(null); setNuevoGrupo('') }} className={inp + ' max-w-xs'}>
            {rubros.map(r => (
              <option key={r.codigo} value={r.codigo}>{r.icono ? r.icono + ' ' : ''}{r.nombre}</option>
            ))}
          </select>
          <span className="text-[11px] text-gray-400">Elegí el rubro para gestionar sus servicios y formas de cobro.</span>
        </div>
      </div>

      <div className="mb-2">
        <h2 className="font-bold text-base text-gray-900">Servicios de {nombreRubro}</h2>
        <p className="text-xs text-gray-400 mt-0.5">Activá los servicios que se usan y tildá las formas de cobro que admite cada uno. El operador solo verá los activos.</p>
      </div>
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5 text-[11px] text-blue-700">
        💡 Cada chip habilita una forma de cobro para ese servicio. Un servicio puede admitir varias. Las métricas "por día" usan los días libres; "por hora" admite un mínimo de horas.
      </div>

      {/* Alta de servicio */}
      {puedeCrear && (
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4 flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Nuevo servicio</label>
          <input value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)} className={inp} placeholder="ej. Reembalaje de carga" onKeyDown={e => { if (e.key === 'Enter') addServicio() }} />
        </div>
        <div className="w-64">
          <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Grupo (opcional)</label>
          <input list="grupos-list" value={nuevoGrupo} onChange={e => setNuevoGrupo(e.target.value)} className={inp} placeholder="ej. operativos · variables · o dejalo vacío" />
          <datalist id="grupos-list">
            {sugerenciasGrupo.map(g => <option key={g} value={g} />)}
          </datalist>
        </div>
        <button onClick={addServicio} className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#1168F8] text-white hover:bg-[#052698] transition-all whitespace-nowrap">+ Agregar</button>
      </div>
      )}

      {servicios.length === 0 && (
        <div className="bg-gray-50 border border-gray-100 rounded-2xl px-4 py-8 text-center text-gray-400 text-sm">
          Todavía no hay servicios cargados para {nombreRubro}.{puedeCrear ? ' Agregá el primero arriba.' : ''}
        </div>
      )}

      {/* Tarjetas por grupo */}
      {gruposPresentes.map(g => {
        const items = servicios.filter(s => (s.grupo || 'general') === g)
        if (items.length === 0) return null
        return (
          <div key={g}>
            <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2 mt-1">{grupoLabel(g)}</div>
            <div className="space-y-2">
              {items.map(s => {
                const activo = s.activo !== false
                const fueUsado = usados.has(s.id)
                return (
                  <div key={s.id} className={`bg-[#EFF4FE] border border-[#B9D0F6] rounded-2xl shadow-sm px-4 py-3 ${activo ? '' : 'opacity-60'}`}>
                    <div className="flex items-center gap-3 mb-2.5">
                      {editId === s.id ? (
                        <input value={editNombre} onChange={e => setEditNombre(e.target.value)} onBlur={saveEdit} onKeyDown={e => { if (e.key === 'Enter') saveEdit() }} autoFocus className={inp + ' flex-1'} />
                      ) : puedeEditar ? (
                        <span className="text-sm font-semibold text-gray-800 flex-1 cursor-pointer hover:text-[#1168F8]" onClick={() => startEdit(s)} title="Click para editar el nombre">{s.nombre}</span>
                      ) : (
                        <span className="text-sm font-semibold text-gray-800 flex-1">{s.nombre}</span>
                      )}
                      {puedeEditar ? (
                        <button onClick={() => toggleActivo(s)} className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg transition-colors ${activo ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}>
                          {activo ? 'Activo' : 'Inactivo'}
                        </button>
                      ) : (
                        <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg ${activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                          {activo ? 'Activo' : 'Inactivo'}
                        </span>
                      )}
                      {superAdmin && !fueUsado ? (
                        <button onClick={() => delServicio(s)} className="text-gray-300 hover:text-red-500 text-sm transition-colors" title="Eliminar del catálogo">🗑</button>
                      ) : fueUsado ? (
                        <span className="text-gray-300 text-sm" title="Ya se usó en cotizaciones — no se puede eliminar">🔒</span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-1.5 items-center">
                      <span className="text-[10px] text-gray-400 mr-1">Formas de cobro:</span>
                      {metricasActivas.map(m => {
                        const on = habSet.has(s.id + '|' + m.id)
                        const esPct = m.comportamiento === 'porcentaje'
                        const esCantidad = m.comportamiento === 'cantidad_simple' || m.comportamiento === 'por_tiempo' || m.comportamiento === 'por_hora'
                        const minOn = habMinSet.has(s.id + '|' + m.id)
                        return (
                          <span key={m.id} className="inline-flex items-center gap-1">
                            <button onClick={() => toggleMetrica(s.id, m.id)} className={(on ? chipOn : chipOff) + (puedeEditar ? '' : ' pointer-events-none')} title={COMPORTAMIENTO_LABEL[m.comportamiento] || ''}>
                              {on ? '✓ ' : ''}{m.nombre}
                            </button>
                            {esPct && on && (
                              <span className="inline-flex items-center gap-1 pl-1 pr-1.5 py-0.5 rounded-lg bg-white/70 border border-dashed border-[#0a9e6e]/40">
                                <span className="text-[9px] text-gray-400">admite:</span>
                                <button onClick={() => toggleCampoItem(s, 'pct_piso')} className={(s.pct_piso ? subOn : subOff) + (puedeEditar ? '' : ' pointer-events-none')} title="Al cotizar por %, habilita cargar un piso (mínimo)">
                                  {s.pct_piso ? '✓ ' : ''}Piso
                                </button>
                                <button onClick={() => toggleCampoItem(s, 'pct_techo')} className={(s.pct_techo ? subOn : subOff) + (puedeEditar ? '' : ' pointer-events-none')} title="Al cotizar por %, habilita cargar un techo (máximo)">
                                  {s.pct_techo ? '✓ ' : ''}Techo
                                </button>
                              </span>
                            )}
                            {esCantidad && on && (
                              <span className="inline-flex items-center gap-1 pl-1 pr-1.5 py-0.5 rounded-lg bg-white/70 border border-dashed border-[#0a9e6e]/40">
                                <span className="text-[9px] text-gray-400">admite:</span>
                                <button onClick={() => toggleMinimo(s.id, m.id)} className={(minOn ? subOn : subOff) + (puedeEditar ? '' : ' pointer-events-none')} title="Al cotizar, habilita cargar un mínimo de cobro para esta forma">
                                  {minOn ? '✓ ' : ''}Mín.
                                </button>
                              </span>
                            )}
                          </span>
                        )
                      })}
                      <span className="text-gray-300 mx-0.5">·</span>
                      <button onClick={() => toggleCampoItem(s, 'usa_dias_libres')} className={(s.usa_dias_libres ? chipOn : chipOff) + (puedeEditar ? '' : ' pointer-events-none')} title="Este ítem maneja días libres — el número se carga al cotizar">
                        {s.usa_dias_libres ? '✓ ' : ''}📅 Días libres
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Administrar formas de cobro */}
      <div className="mt-6 border-t border-gray-200 pt-4">
        <button onClick={() => setShowMetricas(v => !v)} className="flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-[#1168F8] transition-colors">
          <span className="text-xs">{showMetricas ? '▼' : '▶'}</span>
          Administrar formas de cobro
          <span className="text-[10px] font-normal text-gray-400">({metricas.length})</span>
        </button>

        {showMetricas && (
          <div className="mt-3 space-y-3">
            <p className="text-xs text-gray-400">Las formas de cobro son los chips que tildás en cada servicio y son compartidas por todos los rubros. Agregá una nueva si un proveedor cobra de una manera que no está en la lista. El comportamiento define qué campos pide después al cotizar.</p>

            {/* Alta de métrica */}
            {puedeCrear && (
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 flex items-end gap-3 flex-wrap">
              <div className="flex-1 min-w-[160px]">
                <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Nueva forma de cobro</label>
                <input value={nmNombre} onChange={e => setNmNombre(e.target.value)} className={inp} placeholder="ej. Por tonelada" onKeyDown={e => { if (e.key === 'Enter') addMetrica() }} />
              </div>
              <div className="w-60">
                <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Comportamiento</label>
                <select value={nmComp} onChange={e => setNmComp(e.target.value)} className={inp}>
                  {COMPORTAMIENTOS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div className="w-40">
                <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Unidad (opcional)</label>
                <input value={nmUnidad} onChange={e => setNmUnidad(e.target.value)} className={inp} placeholder="ej. tonelada" />
              </div>
              <button onClick={addMetrica} className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#1168F8] text-white hover:bg-[#052698] transition-all whitespace-nowrap">+ Agregar</button>
            </div>
            )}

            {/* Lista de métricas */}
            <div className="space-y-1.5">
              {metricas.map(m => {
                const act = m.activo !== false
                const usada = metricasUsadas.has(m.id)
                return (
                  <div key={m.id} className={`bg-white border border-gray-200 rounded-xl px-3 py-2 flex items-center gap-3 ${act ? '' : 'opacity-60'}`}>
                    {editMetId === m.id ? (
                      <input value={editMetNombre} onChange={e => setEditMetNombre(e.target.value)} onBlur={saveEditMetrica} onKeyDown={e => { if (e.key === 'Enter') saveEditMetrica() }} autoFocus className={inp + ' flex-1'} />
                    ) : puedeEditar ? (
                      <span className="text-xs font-semibold text-gray-800 flex-1 cursor-pointer hover:text-[#1168F8]" onClick={() => startEditMetrica(m)} title="Click para editar el nombre">{m.nombre}</span>
                    ) : (
                      <span className="text-xs font-semibold text-gray-800 flex-1">{m.nombre}</span>
                    )}
                    <span className="text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md whitespace-nowrap">{COMPORTAMIENTO_LABEL[m.comportamiento] || m.comportamiento}</span>
                    {puedeEditar ? (
                      <button onClick={() => toggleMetricaActiva(m)} className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg transition-colors ${act ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}>
                        {act ? 'Activa' : 'Inactiva'}
                      </button>
                    ) : (
                      <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg ${act ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                        {act ? 'Activa' : 'Inactiva'}
                      </span>
                    )}
                    {superAdmin && !usada ? (
                      <button onClick={() => delMetrica(m)} className="text-gray-300 hover:text-red-500 text-sm transition-colors" title="Eliminar forma de cobro">🗑</button>
                    ) : usada ? (
                      <span className="text-gray-300 text-sm" title="En uso — no se puede eliminar">🔒</span>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
