'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'

const inp = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white'

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

function FilaGrupo({ label, colSpan }: { label: string; colSpan: number }) {
  return (
    <tr className="bg-gray-50/60">
      <td colSpan={colSpan} className="px-4 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider">{label}</td>
    </tr>
  )
}

export default function ServiciosCatalogo() {
  const supabase = useMemo(() => createClient(), [])
  const [servicios, setServicios] = useState<any[]>([])
  const [metricas, setMetricas] = useState<any[]>([])
  const [habSet, setHabSet] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoGrupo, setNuevoGrupo] = useState('operativos')
  const [editId, setEditId] = useState<string | null>(null)
  const [editNombre, setEditNombre] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [sRes, mRes, hRes] = await Promise.all([
      supabase.from('servicios_catalogo').select('*').eq('rubro', 'deposito').order('orden', { ascending: true }),
      supabase.from('servicios_metricas').select('*').eq('activo', true).order('orden', { ascending: true }),
      supabase.from('servicios_metricas_habilitadas').select('servicio_id,metrica_id'),
    ])
    if (sRes.data) setServicios(sRes.data)
    if (mRes.data) setMetricas(mRes.data)
    if (hRes.data) setHabSet(new Set(hRes.data.map((h: any) => h.servicio_id + '|' + h.metrica_id)))
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
    if (!confirm(`¿Eliminar "${s.nombre}" del catálogo?`)) return
    await supabase.from('servicios_catalogo').delete().eq('id', s.id)
    setServicios(prev => prev.filter(x => x.id !== s.id))
  }

  if (loading) return <div className="p-8 text-center text-gray-400 text-sm">Cargando...</div>

  const colSpan = metricas.length + 3

  return (
    <div className="space-y-4">
      <div className="mb-2">
        <h2 className="font-bold text-base text-gray-900">Servicios de depósito fiscal</h2>
        <p className="text-xs text-gray-400 mt-0.5">Activá los servicios que se usan y tildá las formas de cobro que admite cada uno. El operador solo verá los activos.</p>
      </div>
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5 text-[11px] text-blue-700">
        💡 Cada tilde habilita una forma de cobro para ese servicio. Un servicio puede admitir varias. Las métricas "por día" usan los días libres; "por hora" admite un mínimo de horas.
      </div>

      {/* Alta de servicio */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4 flex items-end gap-3">
        <div className="flex-1">
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

      {/* Matriz servicio × métrica */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider sticky left-0 bg-gray-50 min-w-[240px]">Servicio</th>
                <th className="px-2 py-3 text-[10px] font-semibold text-gray-400 uppercase text-center">Activo</th>
                {metricas.map(m => (
                  <th key={m.id} className="px-2 py-3 text-[10px] font-semibold text-gray-400 text-center whitespace-nowrap" title={COMPORTAMIENTO_LABEL[m.comportamiento] || ''}>
                    {m.nombre}
                  </th>
                ))}
                <th className="px-2 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {GRUPOS.map(g => {
                const items = servicios.filter(s => s.grupo === g.key)
                if (items.length === 0) return null
                return (
                  <>
                    <FilaGrupo key={'g-' + g.key} label={g.label} colSpan={colSpan} />
                    {items.map(s => (
                      <tr key={s.id} className={`border-b border-gray-50 ${s.activo === false ? 'opacity-50' : ''}`}>
                        <td className="px-4 py-2.5 sticky left-0 bg-white">
                          {editId === s.id ? (
                            <input value={editNombre} onChange={e => setEditNombre(e.target.value)} onBlur={saveEdit} onKeyDown={e => { if (e.key === 'Enter') saveEdit() }} autoFocus className={inp} />
                          ) : (
                            <span className="text-gray-800 font-medium cursor-pointer hover:text-[#1168F8]" onClick={() => startEdit(s)}>{s.nombre}</span>
                          )}
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <button onClick={() => toggleActivo(s)} className={`px-2 py-1 rounded-lg text-[10px] font-semibold ${s.activo !== false ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                            {s.activo !== false ? 'Activo' : 'Inactivo'}
                          </button>
                        </td>
                        {metricas.map(m => {
                          const on = habSet.has(s.id + '|' + m.id)
                          return (
                            <td key={m.id} className="px-2 py-2.5 text-center">
                              <input type="checkbox" checked={on} onChange={() => toggleMetrica(s.id, m.id)} className="w-4 h-4 accent-[#1168F8] cursor-pointer" />
                            </td>
                          )
                        })}
                        <td className="px-2 py-2.5 text-center">
                          <button onClick={() => delServicio(s)} className="text-gray-300 hover:text-red-500 text-sm" title="Eliminar">✕</button>
                        </td>
                      </tr>
                    ))}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
