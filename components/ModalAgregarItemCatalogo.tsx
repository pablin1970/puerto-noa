'use client'
import { useState } from 'react'
import { puede } from '@/lib/permisos'

/**
 * Modal reutilizable para sumar un ítem al catálogo de servicios SIN salir de la factura
 * que se está cargando. Se usa en facturas recibidas y emitidas (botón "Otro ítem…").
 *
 * Props:
 *  - supabase            cliente supabase
 *  - permisos            mapa de permisos del usuario (de cargarPermisos)
 *  - rubrosDisponibles   [{ codigo, nombre }]  rubros en los que se puede crear (del proveedor / del rubro elegido)
 *  - rubroFijo           (opcional) código de rubro preseleccionado y bloqueado
 *  - onCreated(item)     callback con el ítem creado { id, rubro, grupo, nombre }
 *  - onClose()           cerrar sin crear
 */
export default function ModalAgregarItemCatalogo({ supabase, permisos, rubrosDisponibles, rubroFijo, onCreated, onClose }: any) {
  const tienePermiso = puede(permisos, 'cat_servicios', 'crear')
  const rubros: any[] = Array.isArray(rubrosDisponibles) ? rubrosDisponibles : []
  const [rubro, setRubro] = useState<string>(rubroFijo || rubros[0]?.codigo || '')
  const [nombre, setNombre] = useState('')
  const [grupo, setGrupo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const inp = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white'
  const nombreRubro = rubros.find(r => r.codigo === rubro)?.nombre || rubro

  async function guardar() {
    setError('')
    if (!rubro) { setError('Elegí el rubro'); return }
    if (!nombre.trim()) { setError('Poné un nombre para el ítem'); return }
    setGuardando(true)
    try {
      const { data: maxRows } = await supabase
        .from('servicios_catalogo').select('orden')
        .eq('rubro', rubro).order('orden', { ascending: false }).limit(1)
      const maxOrden = maxRows?.[0]?.orden || 0
      const { data, error: e } = await supabase
        .from('servicios_catalogo')
        .insert({ rubro, grupo: grupo.trim() || null, nombre: nombre.trim(), orden: maxOrden + 10, activo: true })
        .select('id, rubro, grupo, nombre').single()
      if (e || !data) { setError('No se pudo crear el ítem: ' + (e?.message || 'error desconocido')); setGuardando(false); return }
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
              <h3 className="font-bold text-sm text-gray-900">No podés agregar ítems al catálogo</h3>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              Para mantener el catálogo ordenado, los ítems se cargan de forma estructurada y necesitás permiso
              para hacerlo. Comunicate con quien administra el <b>Catálogo de servicios</b> para que sume el ítem
              que necesitás{nombreRubro ? <> en el rubro <b>{nombreRubro}</b></> : null}, y después lo vas a poder elegir acá.
            </p>
            <div className="flex justify-end mt-5">
              <button onClick={onClose} className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold hover:bg-gray-50">Entendido</button>
            </div>
          </div>
        ) : (
          <div className="p-6">
            <h3 className="font-bold text-sm text-gray-900 mb-1">Agregar ítem al catálogo</h3>
            <p className="text-[11px] text-gray-400 mb-4">Queda disponible al instante para elegirlo en esta factura y en adelante.</p>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Rubro</label>
                <select value={rubro} onChange={e => setRubro(e.target.value)} className={inp} disabled={!!rubroFijo}>
                  {rubros.length === 0 && <option value="">— sin rubros disponibles —</option>}
                  {rubros.map(r => <option key={r.codigo} value={r.codigo}>{r.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Nombre del ítem</label>
                <input value={nombre} onChange={e => setNombre(e.target.value)} className={inp}
                  placeholder="ej. Reembalaje de carga" autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') guardar() }} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Grupo (opcional)</label>
                <input value={grupo} onChange={e => setGrupo(e.target.value)} className={inp}
                  placeholder="ej. operativos · variables · o dejalo vacío" />
              </div>
              {error && <div className="text-[11px] text-red-600">{error}</div>}
              <p className="text-[10px] text-gray-400 leading-relaxed">
                Las formas de cobro (por día, por contenedor, % CIF, etc.) se configuran después en el Catálogo de servicios.
                Acá podés cargarlo y empezar a usarlo; si no tiene forma de cobro, cargás cantidad y precio igual.
              </p>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={onClose} className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold hover:bg-gray-50">Cancelar</button>
              <button onClick={guardar} disabled={guardando}
                className="px-5 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold hover:bg-[#0a4fc4] disabled:opacity-50">
                {guardando ? 'Guardando…' : 'Agregar ítem'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
