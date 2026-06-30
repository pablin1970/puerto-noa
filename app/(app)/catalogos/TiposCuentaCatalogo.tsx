'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { cargarPermisos, puede } from '@/lib/permisos'

const inp = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white'

interface TipoCuenta {
  id: string
  pais: string
  codigo: string
  nombre: string
  orden: number
  activo: boolean
}

const PAISES = [
  { code: 'CL', label: 'Chile', flag: '🇨🇱' },
  { code: 'AR', label: 'Argentina', flag: '🇦🇷' },
  { code: 'US', label: 'Estados Unidos', flag: '🇺🇸' },
]

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '_')

export default function TiposCuentaCatalogo() {
  const supabase = createClient()
  const [permisos, setPermisos] = useState<Record<string, string[]>>({})
  const [lista, setLista] = useState<TipoCuenta[]>([])
  const [pais, setPais] = useState('CL')
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [draft, setDraft] = useState<any>(null)
  const [creando, setCreando] = useState(false)
  const [nuevo, setNuevo] = useState<any>(null)

  useEffect(() => { (async () => setPermisos(await cargarPermisos()))() }, [])
  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await (supabase.from('tipos_cuenta_bancaria') as any)
      .select('*').order('pais', { ascending: true }).order('orden', { ascending: true })
    setLista(data || [])
    setLoading(false)
  }

  const puedeCrear = puede(permisos, 'cat_finanzas', 'crear')
  const puedeEditar = puede(permisos, 'cat_finanzas', 'editar')
  const puedeEliminar = puede(permisos, 'cat_finanzas', 'eliminar')

  const delPais = lista.filter(e => e.pais === pais)

  function empezarNuevo() {
    setEditId(null); setDraft(null)
    setCreando(true)
    setNuevo({ pais, codigo: '', nombre: '' })
  }

  async function guardarNuevo() {
    if (!nuevo.nombre.trim()) { alert('Poné el nombre del tipo de cuenta'); return }
    if (!nuevo.codigo.trim()) { alert('Poné un código corto (ej. corriente)'); return }
    const maxOrden = lista.filter(e => e.pais === nuevo.pais).reduce((m, e) => Math.max(m, e.orden), 0)
    const { error } = await (supabase.from('tipos_cuenta_bancaria') as any).insert({
      pais: nuevo.pais, codigo: norm(nuevo.codigo),
      nombre: nuevo.nombre.trim(), activo: true, orden: maxOrden + 1,
    })
    if (error) { alert('No se pudo crear: ' + error.message); return }
    setCreando(false); setNuevo(null); await load()
  }

  function empezarEdicion(e: TipoCuenta) {
    setCreando(false); setNuevo(null)
    setEditId(e.id)
    setDraft({ pais: e.pais, codigo: e.codigo, nombre: e.nombre, activo: e.activo })
  }

  async function guardarEdicion(id: string) {
    if (!draft.nombre.trim()) { alert('El nombre no puede quedar vacío'); return }
    if (!draft.codigo.trim()) { alert('El código no puede quedar vacío'); return }
    const { error } = await (supabase.from('tipos_cuenta_bancaria') as any).update({
      pais: draft.pais, codigo: norm(draft.codigo),
      nombre: draft.nombre.trim(), activo: draft.activo,
    }).eq('id', id)
    if (error) { alert('No se pudo guardar: ' + error.message); return }
    setEditId(null); setDraft(null); await load()
  }

  async function toggleActivo(e: TipoCuenta) {
    await (supabase.from('tipos_cuenta_bancaria') as any).update({ activo: !e.activo }).eq('id', e.id)
    await load()
  }

  async function eliminar(e: TipoCuenta) {
    if (!confirm(`¿Eliminar "${e.nombre}"? Si ya hay cuentas que lo usan, conviene desactivarlo en vez de borrarlo.`)) return
    const { error } = await supabase.from('tipos_cuenta_bancaria').delete().eq('id', e.id)
    if (error) { alert('No se pudo eliminar: ' + error.message); return }
    await load()
  }

  function campos(d: any, set: (x: any) => void) {
    return (
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">País</label>
          <select value={d.pais} onChange={e => set({ ...d, pais: e.target.value })} className={inp}>
            {PAISES.map(p => <option key={p.code} value={p.code}>{p.flag} {p.label}</option>)}
          </select></div>
        <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Código corto</label>
          <input value={d.codigo} onChange={e => set({ ...d, codigo: e.target.value })} className={inp} placeholder="ej. corriente" />
          <p className="text-[10px] text-gray-400 mt-1">Identificador interno (sin espacios). Se guarda en la cuenta.</p></div>
        <div className="col-span-2"><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Nombre visible</label>
          <input value={d.nombre} onChange={e => set({ ...d, nombre: e.target.value })} className={inp} placeholder="ej. Cuenta corriente" /></div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-bold text-base text-gray-900">Tipos de cuenta bancaria</h2>
        {puedeCrear && <button onClick={empezarNuevo} className="px-4 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold hover:bg-[#0a4fc4]">+ Agregar tipo</button>}
      </div>
      <p className="text-xs text-gray-400 mb-3">Tipos de cuenta por país. Aparecen al cargar una cuenta del país correspondiente — Chile: corriente / vista / ahorro · Argentina: corriente / caja de ahorro · EE.UU.: checking / savings.</p>

      {/* Tabs de país */}
      <div className="flex gap-2 mb-4">
        {PAISES.map(p => {
          const n = lista.filter(e => e.pais === p.code).length
          return (
            <button key={p.code} onClick={() => { setPais(p.code); setCreando(false); setEditId(null) }}
              className={`px-4 py-2 rounded-xl text-xs font-semibold border ${pais === p.code ? 'bg-[#052698] text-white border-[#052698]' : 'bg-white text-gray-600 border-gray-200'}`}>
              {p.flag} {p.label} <span className={pais === p.code ? 'text-white/70' : 'text-gray-400'}>{n}</span>
            </button>
          )
        })}
      </div>

      {creando && (
        <div className="mb-4 bg-white border border-[#1168F8]/30 rounded-2xl p-4 shadow-sm">
          <h3 className="font-bold text-sm text-gray-900 mb-3">Nuevo tipo de cuenta</h3>
          {campos(nuevo, setNuevo)}
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => { setCreando(false); setNuevo(null) }} className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold hover:bg-gray-50">Cancelar</button>
            <button onClick={guardarNuevo} className="px-5 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold hover:bg-[#0a4fc4]">Crear tipo</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-gray-400 text-sm">Cargando…</div>
      ) : delPais.length === 0 ? (
        <div className="p-8 text-center text-gray-400 text-sm border border-dashed border-gray-200 rounded-2xl">No hay tipos de cuenta cargados para este país.</div>
      ) : (
        <div className="space-y-1.5">
          {delPais.map(e => (
            <div key={e.id} className="bg-white border border-gray-100 rounded-xl px-3 py-2 shadow-sm">
              {editId === e.id ? (
                <div>
                  {campos(draft, setDraft)}
                  <div className="flex items-center justify-between mt-3">
                    <label className="flex items-center gap-2 text-xs text-gray-600"><input type="checkbox" checked={draft.activo} onChange={ev => setDraft({ ...draft, activo: ev.target.checked })} />Activo</label>
                    <div className="flex gap-2">
                      <button onClick={() => { setEditId(null); setDraft(null) }} className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold hover:bg-gray-50">Cancelar</button>
                      <button onClick={() => guardarEdicion(e.id)} className="px-5 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold hover:bg-[#0a4fc4]">Guardar</button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[11px] text-gray-500 w-28 flex-shrink-0">{e.codigo}</span>
                  <div className="flex-1 min-w-0">
                    <span className={`text-sm ${e.activo ? 'text-gray-900' : 'text-gray-400 line-through'}`}>{e.nombre}</span>
                  </div>
                  {!e.activo && <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded">inactivo</span>}
                  <div className="flex gap-1.5 flex-shrink-0">
                    {puedeEditar && <button onClick={() => empezarEdicion(e)} className="px-2.5 py-1 border border-gray-200 rounded-lg text-[11px] text-gray-600 hover:border-[#1168F8] hover:text-[#1168F8]">Editar</button>}
                    {puedeEditar && <button onClick={() => toggleActivo(e)} className="px-2.5 py-1 border border-gray-200 rounded-lg text-[11px] text-gray-500 hover:bg-gray-50">{e.activo ? 'Desactivar' : 'Activar'}</button>}
                    {puedeEliminar && <button onClick={() => eliminar(e)} className="px-2 py-1 text-gray-300 hover:text-red-500 text-sm">✕</button>}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
