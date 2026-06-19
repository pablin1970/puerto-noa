'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { cargarPermisos, esSuperAdmin } from '@/lib/permisos'

const inp = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white'
const chipOn = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border border-blue-300 bg-blue-50 text-blue-700 shadow-sm cursor-pointer hover:bg-blue-100 hover:border-blue-400 transition-colors'
const chipOff = 'px-2.5 py-1 rounded-lg text-[11px] border border-gray-300 bg-gray-50 text-gray-500 shadow-sm cursor-pointer hover:border-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors'

const COMPORTAMIENTO_LABEL: Record<string, string> = {
  cantidad_simple: 'Cantidad × precio',
  por_tiempo: 'Por tiempo (usa días libres)',
  por_hora: 'Por hora (mín. horas)',
  fijo: 'Precio fijo',
}

const GRUPOS = [
  { key: 'operativos', label: 'Servicios operativos (tarifa fija)' },
  { key: 'variables', label: 'Servicios variables / por uso' },
]

export default function ServiciosCatalogo() {
  const supabase = useMemo(() => createClient(), [])
  const [servicios, setServicios] = useState<any[]>([])
  const [metricas, setMetricas] = useState<any[]>([])
  const [habSet, setHabSet] = useState<Set<string>>(new Set())
  const [usados, setUsados] = useState<Set<string>>(new Set())
  const [superAdmin, setSuperAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoGrupo, setNuevoGrupo] = useState('operativos')
  const [editId, setEditId] = useState<string | null>(null)
  const [editNombre, setEditNombre] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    await cargarPermisos()
    setSuperAdmin(esSuperAdmin())
    const [sRes, mRes, hRes, uRes] = await Promise.all([
      supabase.from('servicios_catalogo').select('*').eq('rubro', 'deposito').order('orden', { ascending: true }),
      supabase.from('servicios_metricas').select('*').eq('activo', true).order('orden', { ascending: true }),
      supabase.from('servicios_metricas_habilitadas').select('servicio_id,metrica_id'),
      supabase.from('cotizaciones_proveedor_v2_items').select('servicio_id').not('servicio_id', 'is', null),
    ])
    if (sRes.data) setServicios(sRes.data)
    if (mRes.data) setMetricas(mRes.data)
    if (hRes.data) setHabSet(new Set(hRes.data.map((h: any) => h.servicio_id + '|' + h.metrica_id)))
    if (uRes.data) setUsados(new Set(uRes.data.map((r: any) => r.servicio_id)))
    setLoading(false)
  }

  async function toggleActivo(s: any) {
    await (supabase.from('servicios_catalogo') as any).update({ activo: !s.activo }).eq('id', s.id)
    setServicios(prev => prev.map(x => x.id === s.id ? { ...x, activo: !x.activo } : x))
  }

  async function toggleMetrica(servicioId: string, metricaId: string) {
    const key = servicioId + '|' + metricaId
    const yaEsta = habSet.has(key)
    setHabSet(prev => {
      const n = new Set(prev)
      if (yaEsta) n.delete(key); else n.add(key)
      return n
    })
    if (yaEsta) {
      await supabase.from('servicios_metricas_habilitadas').delete().eq('servicio_id', servicioId).eq('metrica_id', metricaId)
    } else {
      await (supabase.from('servicios_metricas_habilitadas') as any).insert({ servicio_id: servicioId, metrica_id: metricaId })
    }
  }

  async function addServicio() {
    const nombre = nuevoNombre.trim()
    if (!nombre) return
    const maxOrden = servicios.reduce((m, s) => Math.max(m, s.orden || 0), 0)
    const { data } = await (supabase.from('servicios_catalogo') as any)
      .insert({ rubro: 'deposito', grupo: nuevoGrupo, nombre, orden: maxOrden + 10, activo: true })
      .select().single()
    if (data) setServicios(prev => [...prev, data])
    setNuevoNombre('')
  }

  function startEdit(s: any) { setEditId(s.id); setEditNombre(s.nombre) }

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

  if (loading) return <div className="p-8 text-center text-gray-400 text-sm">Cargando...</div>

  return (
    <div className="space-y-4">
      <div className="mb-2">
        <h2 className="font-bold text-base text-gray-900">Servicios de depósito fiscal</h2>
        <p className="text-xs text-gray-400 mt-0.5">Activá los servicios que se usan y tildá las formas de cobro que admite cada uno. El operador solo verá los activos.</p>
      </div>
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5 text-[11px] text-blue-700">
        💡 Cada chip habilita una forma de cobro para ese servicio. Un servicio puede admitir varias. Las métricas "por día" usan los días libres; "por hora" admite un mínimo de horas.
      </div>

      {/* Alta de servicio */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4 flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Nuevo servicio</label>
          <input value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)} className={inp} placeholder="ej. Reembalaje de carga" onKeyDown={e => { if (e.key === 'Enter') addServicio() }} />
        </div>
        <div className="w-64">
          <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Grupo</label>
          <select value={nuevoGrupo} onChange={e => setNuevoGrupo(e.target.value)} className={inp}>
            <option value="operativos">Servicios operativos (tarifa fija)</option>
            <option value="variables">Servicios variables / por uso</option>
          </select>
        </div>
        <button onClick={addServicio} className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#1168F8] text-white hover:bg-[#052698] transition-all whitespace-nowrap">+ Agregar</button>
      </div>

      {/* Tarjetas por grupo */}
      {GRUPOS.map(g => {
        const items = servicios.filter(s => s.grupo === g.key)
        if (items.length === 0) return null
        return (
          <div key={g.key}>
            <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2 mt-1">{g.label}</div>
            <div className="space-y-2">
              {items.map(s => {
                const activo = s.activo !== false
                const fueUsado = usados.has(s.id)
                return (
                  <div key={s.id} className={`bg-white border border-gray-300 rounded-2xl shadow-md px-4 py-3 ${activo ? '' : 'opacity-60'}`}>
                    <div className="flex items-center gap-3 mb-2.5">
                      {editId === s.id ? (
                        <input value={editNombre} onChange={e => setEditNombre(e.target.value)} onBlur={saveEdit} onKeyDown={e => { if (e.key === 'Enter') saveEdit() }} autoFocus className={inp + ' flex-1'} />
                      ) : (
                        <span className="text-sm font-semibold text-gray-800 flex-1 cursor-pointer hover:text-[#1168F8]" onClick={() => startEdit(s)} title="Click para editar el nombre">{s.nombre}</span>
                      )}
                      <button onClick={() => toggleActivo(s)} className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg transition-colors ${activo ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}>
                        {activo ? 'Activo' : 'Inactivo'}
                      </button>
                      {superAdmin && !fueUsado ? (
                        <button onClick={() => delServicio(s)} className="text-gray-300 hover:text-red-500 text-sm transition-colors" title="Eliminar del catálogo">🗑</button>
                      ) : fueUsado ? (
                        <span className="text-gray-300 text-sm" title="Ya se usó en cotizaciones — no se puede eliminar">🔒</span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-1.5 items-center">
                      <span className="text-[10px] text-gray-400 mr-1">Formas de cobro:</span>
                      {metricas.map(m => {
                        const on = habSet.has(s.id + '|' + m.id)
                        return (
                          <button key={m.id} onClick={() => toggleMetrica(s.id, m.id)} className={on ? chipOn : chipOff} title={COMPORTAMIENTO_LABEL[m.comportamiento] || ''}>
                            {on ? '✓ ' : ''}{m.nombre}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
