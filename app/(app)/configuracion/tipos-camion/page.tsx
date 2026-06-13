'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'

interface TipoCamion {
  id: string
  nombre: string
  descripcion: string
  icono: string
  activo: boolean
  orden: number
}

const inp = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white'
const ICONOS = ['🚛','🚚','🚜','📦','🚐','🚌','⛟']

export default function TiposCamionPage() {
  const supabase = useMemo(() => createClient(), [])
  const [tipos, setTipos] = useState<TipoCamion[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<{ type: 'nuevo' | 'editar'; item?: TipoCamion } | null>(null)
  const [form, setForm] = useState({ nombre: '', descripcion: '', icono: '🚛', orden: 0 })
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('tipos_camion').select('*').order('orden').order('nombre')
    if (data) setTipos(data as TipoCamion[])
    setLoading(false)
  }

  function abrirNuevo() {
    setForm({ nombre: '', descripcion: '', icono: '🚛', orden: tipos.length + 1 })
    setModal({ type: 'nuevo' })
  }

  function abrirEditar(t: TipoCamion) {
    setForm({ nombre: t.nombre, descripcion: t.descripcion || '', icono: t.icono, orden: t.orden })
    setModal({ type: 'editar', item: t })
  }

  async function guardar() {
    if (!form.nombre) return
    setSaving(true)
    if (modal?.type === 'nuevo') {
      await (supabase.from('tipos_camion') as any).insert(form)
    } else if (modal?.item) {
      await (supabase.from('tipos_camion') as any).update(form).eq('id', modal.item.id)
    }
    await load()
    setModal(null)
    setSaving(false)
  }

  async function toggleActivo(t: TipoCamion) {
    await (supabase.from('tipos_camion') as any).update({ activo: !t.activo }).eq('id', t.id)
    setTipos(prev => prev.map(x => x.id === t.id ? { ...x, activo: !x.activo } : x))
  }

  async function eliminar(id: string) {
    if (!confirm('Eliminar este tipo de camion?')) return
    await supabase.from('tipos_camion').delete().eq('id', id)
    setTipos(prev => prev.filter(t => t.id !== id))
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Tipos de camion</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Configuracion de tipos de transporte terrestre — {tipos.filter(t => t.activo).length} activos
          </p>
        </div>
        <button onClick={abrirNuevo}
          className="px-5 py-2.5 bg-[#1168F8] text-white rounded-xl text-sm font-bold hover:bg-[#0a4fc4] shadow-sm">
          + Nuevo tipo
        </button>
      </div>

      {/* Info */}
      <div className="bg-[#EBF2FF] border border-[#93B8FC] rounded-2xl px-5 py-4 mb-5">
        <div className="text-xs font-bold text-[#052698] mb-1">Como se usan los tipos de camion</div>
        <div className="text-[11px] text-[#1168F8]">
          Cada contenedor en la cotizacion tiene un tipo de camion asociado. Esto define que transportistas
          pueden cotizar ese tramo y es la base para filtrar ofertas en el bloque de flete terrestre.
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-gray-400">Cargando...</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Orden', 'Tipo de camion', 'Descripcion', 'Estado', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tipos.map(t => (
                <tr key={t.id} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${!t.activo ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-mono text-gray-400 text-[11px]">{t.orden}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{t.icono}</span>
                      <span className="font-semibold text-gray-900">{t.nombre}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{t.descripcion || '—'}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleActivo(t)}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors ${t.activo ? 'bg-green-50 text-green-700 border-green-200 hover:bg-red-50 hover:text-red-700 hover:border-red-200' : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-green-50 hover:text-green-700 hover:border-green-200'}`}>
                      {t.activo ? 'Activo' : 'Inactivo'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      <button onClick={() => abrirEditar(t)}
                        className="px-2.5 py-1 border border-gray-200 rounded-lg hover:bg-[#EBF2FF] hover:border-[#93B8FC] text-gray-500 hover:text-[#1168F8] transition-colors text-[10px] font-medium">
                        Editar
                      </button>
                      <button onClick={() => eliminar(t.id)}
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

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <span className="font-bold text-sm text-gray-900">
                {modal.type === 'nuevo' ? 'Nuevo tipo de camion' : 'Editar tipo de camion'}
              </span>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600">X</button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Nombre *</label>
                <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  className={inp} placeholder="ej. Camion plataforma" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Descripcion</label>
                <input value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                  className={inp} placeholder="Para que tipo de carga aplica" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Icono (emoji)</label>
                  <div className="flex gap-1.5 flex-wrap mt-1">
                    {ICONOS.map(ic => (
                      <button key={ic} onClick={() => setForm(f => ({ ...f, icono: ic }))}
                        className={`w-8 h-8 rounded-lg text-lg flex items-center justify-center transition-all ${form.icono === ic ? 'bg-[#EBF2FF] ring-2 ring-[#1168F8]' : 'bg-gray-100 hover:bg-gray-200'}`}>
                        {ic}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Orden</label>
                  <input type="number" value={form.orden}
                    onChange={e => setForm(f => ({ ...f, orden: parseInt(e.target.value) || 0 }))}
                    className={inp} />
                </div>
              </div>
              {/* Preview */}
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl border border-gray-200">
                <span className="text-xl">{form.icono}</span>
                <span className="text-xs font-semibold text-gray-700">{form.nombre || 'Nombre del tipo'}</span>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-between">
              <button onClick={() => setModal(null)}
                className="px-4 py-2 border border-gray-200 rounded-xl text-xs hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={guardar} disabled={saving}
                className="px-5 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold disabled:opacity-50">
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
