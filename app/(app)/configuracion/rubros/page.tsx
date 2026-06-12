'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'

interface Rubro {
  id: string
  nombre: string
  descripcion: string
  color: string
  icono: string
  activo: boolean
  orden: number
  bloques_cotizador: number[]
  created_at: string
}

const BLOQUES = [
  { num: 1, label: 'Bloque 1 — Freight Forwarder',          color: '#1168F8' },
  { num: 2, label: 'Bloque 2 — Transporte terrestre',       color: '#b45309' },
  { num: 3, label: 'Bloque 3 — Gastos post-entrega Chile',  color: '#0891b2' },
  { num: 4, label: 'Bloque 4 — Gastos Argentina',           color: '#6b21a8' },
]

const COLORES = ['#1168F8','#052698','#0a9e6e','#b45309','#6b21a8','#dc2626','#0891b2','#6b7280','#be185d','#15803d']
const inp = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white'

export default function RubrosPage() {
  const supabase = useMemo(() => createClient(), [])
  const [rubros, setRubros] = useState<Rubro[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<{ type: 'nuevo' | 'editar'; rubro?: Rubro } | null>(null)
  const [form, setForm] = useState({
    nombre: '', descripcion: '', color: '#1168F8', icono: '📦',
    orden: 0, bloques_cotizador: [] as number[]
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadRubros() }, [])

  async function loadRubros() {
    setLoading(true)
    const { data } = await supabase.from('proveedor_rubros').select('*').order('orden').order('nombre')
    console.log('rubros data:', data, data?.length) 
    if (data) setRubros(data as Rubro[])
    setLoading(false)
  }

  function abrirNuevo() {
    setForm({ nombre: '', descripcion: '', color: '#1168F8', icono: '📦', orden: rubros.length + 1, bloques_cotizador: [] })
    setModal({ type: 'nuevo' })
  }

  function abrirEditar(r: Rubro) {
    setForm({ nombre: r.nombre, descripcion: r.descripcion || '', color: r.color, icono: r.icono, orden: r.orden, bloques_cotizador: r.bloques_cotizador || [] })
    setModal({ type: 'editar', rubro: r })
  }

  function toggleBloque(num: number) {
    setForm(f => ({
      ...f,
      bloques_cotizador: f.bloques_cotizador.includes(num)
        ? f.bloques_cotizador.filter(b => b !== num)
        : [...f.bloques_cotizador, num].sort()
    }))
  }

  async function guardar() {
    if (!form.nombre) return
    setSaving(true)
    if (modal?.type === 'nuevo') {
      await (supabase.from('proveedor_rubros') as any).insert(form)
    } else if (modal?.rubro) {
      await (supabase.from('proveedor_rubros') as any).update(form).eq('id', modal.rubro.id)
    }
    await loadRubros()
    setModal(null)
    setSaving(false)
  }

  async function toggleActivo(r: Rubro) {
    await (supabase.from('proveedor_rubros') as any).update({ activo: !r.activo }).eq('id', r.id)
    setRubros(prev => prev.map(x => x.id === r.id ? { ...x, activo: !x.activo } : x))
  }

  async function eliminar(id: string) {
    if (!confirm('Eliminar este rubro? Los proveedores vinculados perderan esta clasificacion.')) return
    await supabase.from('proveedor_rubros').delete().eq('id', id)
    setRubros(prev => prev.filter(r => r.id !== id))
  }

  // Agrupar rubros por bloque para el mapa visual
  const mapaRubros = BLOQUES.map(b => ({
    ...b,
    rubros: rubros.filter(r => r.activo !== false && (r.bloques_cotizador || []).includes(b.num))
  }))

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Rubros de proveedores</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Clasificacion de proveedores — {rubros.filter(r => r.activo).length} activos
          </p>
        </div>
        <button onClick={abrirNuevo}
          className="px-5 py-2.5 bg-[#1168F8] text-white rounded-xl text-sm font-bold hover:bg-[#0a4fc4] shadow-sm">
          + Nuevo rubro
        </button>
      </div>

      {/* Mapa visual de bloques del cotizador */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm mb-5">
        <div className="text-sm font-bold text-gray-900 mb-1">Mapa del cotizador</div>
        <div className="text-[10px] text-gray-400 mb-4">Que rubros aparecen en cada bloque de logistica al cotizar</div>
        <div className="grid grid-cols-4 gap-3">
          {mapaRubros.map(b => (
            <div key={b.num} className="border rounded-xl overflow-hidden" style={{ borderColor: b.color + '40' }}>
              <div className="px-3 py-2 text-[10px] font-bold text-white" style={{ background: b.color }}>
                {b.label}
              </div>
              <div className="p-3 bg-white min-h-16">
                {b.rubros.length === 0 ? (
                  <div className="text-[10px] text-gray-300 italic">Sin rubros asignados</div>
                ) : (
                  <div className="space-y-1">
                    {b.rubros.map(r => (
                      <div key={r.id} className="flex items-center gap-1.5 text-[10px] font-medium" style={{ color: r.color }}>
                        <span>{r.icono}</span>
                        <span>{r.nombre}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabla de rubros */}
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 font-medium text-sm text-gray-900">
          Todos los rubros
        </div>
        {loading ? (
          <div className="p-12 text-center text-gray-400">Cargando...</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Orden', 'Rubro', 'Descripcion', 'Aparece en cotizador', 'Estado', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rubros.map(r => (
                <tr key={r.id} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${!r.activo ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-mono text-gray-400 text-[11px]">{r.orden}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{r.icono}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900">{r.nombre}</span>
                        <span className="w-3 h-3 rounded-full inline-block flex-shrink-0" style={{ background: r.color }}/>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{r.descripcion || '—'}</td>
                  <td className="px-4 py-3">
                    {(r.bloques_cotizador || []).length === 0 ? (
                      <span className="text-[10px] text-gray-300">No aparece</span>
                    ) : (
                      <div className="flex gap-1 flex-wrap">
                        {(r.bloques_cotizador || []).map(b => {
                          const bloque = BLOQUES.find(x => x.num === b)
                          return bloque ? (
                            <span key={b} className="px-2 py-0.5 rounded-full text-[9px] font-bold text-white" style={{ background: bloque.color }}>
                              Bloque {b}
                            </span>
                          ) : null
                        })}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleActivo(r)}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors ${r.activo ? 'bg-green-50 text-green-700 border-green-200 hover:bg-red-50 hover:text-red-700 hover:border-red-200' : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-green-50 hover:text-green-700 hover:border-green-200'}`}>
                      {r.activo ? 'Activo' : 'Inactivo'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      <button onClick={() => abrirEditar(r)}
                        className="px-2.5 py-1 border border-gray-200 rounded-lg hover:bg-[#EBF2FF] hover:border-[#93B8FC] text-gray-500 hover:text-[#1168F8] transition-colors text-[10px] font-medium">
                        Editar
                      </button>
                      <button onClick={() => eliminar(r.id)}
                        className="px-2.5 py-1 border border-red-100 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors text-[10px]">
                        X
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal nuevo/editar */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <span className="font-bold text-sm text-gray-900">{modal.type === 'nuevo' ? 'Nuevo rubro' : 'Editar rubro'}</span>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600">X</button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Nombre *</label>
                  <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} className={inp} placeholder="ej. Freight Forwarder"/>
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Descripcion</label>
                  <input value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} className={inp} placeholder="Descripcion breve del rubro"/>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Icono (emoji)</label>
                  <input value={form.icono} onChange={e => setForm(f => ({ ...f, icono: e.target.value }))} className={inp + ' text-xl'} placeholder="📦"/>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Orden</label>
                  <input type="number" value={form.orden} onChange={e => setForm(f => ({ ...f, orden: parseInt(e.target.value) || 0 }))} className={inp}/>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-2 uppercase">Color</label>
                <div className="flex gap-2 flex-wrap">
                  {COLORES.map(c => (
                    <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                      className={`w-7 h-7 rounded-lg transition-all ${form.color === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-105'}`}
                      style={{ background: c }}/>
                  ))}
                </div>
              </div>

              {/* Bloques del cotizador */}
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-2 uppercase">Aparece en el cotizador</label>
                <div className="space-y-2">
                  {BLOQUES.map(b => {
                    const activo = form.bloques_cotizador.includes(b.num)
                    return (
                      <button key={b.num} onClick={() => toggleBloque(b.num)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 text-left transition-all ${activo ? 'border-transparent' : 'border-gray-200 hover:border-gray-300 bg-gray-50'}`}
                        style={activo ? { background: b.color + '15', borderColor: b.color + '50' } : {}}>
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${activo ? 'border-transparent' : 'border-gray-300'}`}
                          style={activo ? { background: b.color } : {}}>
                          {activo && <span className="text-white text-[9px] font-bold">v</span>}
                        </div>
                        <span className="text-xs font-medium" style={activo ? { color: b.color } : { color: '#374151' }}>
                          {b.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Preview */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: form.color + '15', border: `1px solid ${form.color}30` }}>
                <span className="text-xl">{form.icono}</span>
                <div>
                  <div className="text-xs font-semibold" style={{ color: form.color }}>{form.nombre || 'Nombre del rubro'}</div>
                  {form.bloques_cotizador.length > 0 && (
                    <div className="flex gap-1 mt-0.5">
                      {form.bloques_cotizador.map(b => (
                        <span key={b} className="text-[9px] text-white px-1.5 py-0.5 rounded-full font-bold" style={{ background: BLOQUES.find(x => x.num === b)?.color }}>
                          Bloque {b}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-between">
              <button onClick={() => setModal(null)} className="px-4 py-2 border border-gray-200 rounded-xl text-xs hover:bg-gray-50">Cancelar</button>
              <button onClick={guardar} disabled={saving}
                className="px-5 py-2 text-white rounded-xl text-xs font-bold disabled:opacity-50"
                style={{ background: form.color }}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
