'use client'
import { useState } from 'react'
import { puede } from '@/lib/permisos'

/**
 * Modal para sumar una categoría al catálogo de gastos fijos sin salir de la factura.
 * Props:
 *  - supabase, permisos
 *  - onCreated(cat)  callback con { id, nombre, codigo }
 *  - onClose()
 */
export default function ModalAgregarCategoriaGasto({ supabase, permisos, onCreated, onClose }: any) {
  const tienePermiso = puede(permisos, 'gastos_fijos', 'crear')
  const [nombre, setNombre] = useState('')
  const [codigo, setCodigo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const inp = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white'

  async function guardar() {
    setError('')
    if (!nombre.trim()) { setError('Poné un nombre para la categoría'); return }
    setGuardando(true)
    try {
      const { data: maxRows } = await supabase
        .from('gastos_fijos_categorias').select('orden')
        .order('orden', { ascending: false }).limit(1)
      const maxOrden = maxRows?.[0]?.orden || 0
      const { data, error: e } = await supabase
        .from('gastos_fijos_categorias')
        .insert({ nombre: nombre.trim(), codigo: codigo.trim() || null, orden: maxOrden + 10, activo: true })
        .select('id, nombre, codigo').single()
      if (e || !data) { setError('No se pudo crear: ' + (e?.message || 'error')); setGuardando(false); return }
      onCreated(data)
    } catch (err: any) {
      setError('Error inesperado: ' + (err?.message || err)); setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onMouseDown={e => e.stopPropagation()}>
        {!tienePermiso ? (
          <div className="p-6">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">🔒</span>
              <h3 className="font-bold text-sm text-gray-900">No podés agregar categorías</h3>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              Necesitás permiso para sumar categorías de gastos fijos. Comunicate con quien administra
              Gastos y costos para que cargue la categoría que necesitás, y después la vas a poder elegir acá.
            </p>
            <div className="flex justify-end mt-5">
              <button onClick={onClose} className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold hover:bg-gray-50">Entendido</button>
            </div>
          </div>
        ) : (
          <div className="p-6">
            <h3 className="font-bold text-sm text-gray-900 mb-1">Nueva categoría de gasto fijo</h3>
            <p className="text-[11px] text-gray-400 mb-4">Queda disponible al instante para imputar esta factura y las próximas.</p>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Nombre</label>
                <input value={nombre} onChange={e => setNombre(e.target.value)} className={inp}
                  placeholder="ej. Seguros / Honorarios contables" autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') guardar() }} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Código (opcional)</label>
                <input value={codigo} onChange={e => setCodigo(e.target.value)} className={inp} placeholder="ej. SEG" />
              </div>
              {error && <div className="text-[11px] text-red-600">{error}</div>}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={onClose} className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold hover:bg-gray-50">Cancelar</button>
              <button onClick={guardar} disabled={guardando}
                className="px-5 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold hover:bg-[#0a4fc4] disabled:opacity-50">
                {guardando ? 'Guardando…' : 'Agregar categoría'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
