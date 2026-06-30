'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { cargarPermisos, puede } from '@/lib/permisos'

const inp = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white'

interface Entidad {
  id: string
  pais: string
  tipo: string
  codigo: string | null
  nombre: string
  nombre_corto: string | null
  activo: boolean
  orden: number
}

const PAISES = [
  { code: 'AR', label: 'Argentina', flag: '🇦🇷' },
  { code: 'CL', label: 'Chile', flag: '🇨🇱' },
  { code: 'CN', label: 'China', flag: '🇨🇳' },
  { code: 'US', label: 'Estados Unidos', flag: '🇺🇸' },
]

export default function EntidadesFinancierasCatalogo() {
  const supabase = createClient()
  const [permisos, setPermisos] = useState<Record<string, string[]>>({})
  const [lista, setLista] = useState<Entidad[]>([])
  const [pais, setPais] = useState('AR')
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [draft, setDraft] = useState<any>(null)
  const [creando, setCreando] = useState(false)
  const [nuevo, setNuevo] = useState<any>(null)

  useEffect(() => { (async () => setPermisos(await cargarPermisos()))() }, [])
  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await (supabase.from('entidades_financieras') as any)
      .select('*').order('pais', { ascending: true }).order('tipo', { ascending: true }).order('orden', { ascending: true })
    setLista(data || [])
    setLoading(false)
  }

  const puedeCrear = puede(permisos, 'catalogos', 'crear')
  const puedeEditar = puede(permisos, 'catalogos', 'editar')
  const puedeEliminar = puede(permisos, 'catalogos', 'eliminar')

  const delPais = lista.filter(e => e.pais === pais)
  const bancos = delPais.filter(e => e.tipo === 'banco')
  const fintechs = delPais.filter(e => e.tipo === 'fintech')
  const alycs = delPais.filter(e => e.tipo === 'alyc')

  function empezarNuevo() {
    setEditId(null); setDraft(null)
    setCreando(true)
    setNuevo({ pais, tipo: 'banco', codigo: '', nombre: '', nombre_corto: '' })
  }

  async function guardarNuevo() {
    if (!nuevo.nombre.trim()) { alert('Poné el nombre de la entidad'); return }
    const maxOrden = lista.filter(e => e.pais === nuevo.pais && e.tipo === nuevo.tipo).reduce((m, e) => Math.max(m, e.orden), 0)
    const { error } = await (supabase.from('entidades_financieras') as any).insert({
      pais: nuevo.pais, tipo: nuevo.tipo, codigo: nuevo.codigo?.trim() || null,
      nombre: nuevo.nombre.trim(), nombre_corto: nuevo.nombre_corto?.trim() || null,
      activo: true, orden: maxOrden + 1,
    })
    if (error) { alert('No se pudo crear: ' + error.message); return }
    setCreando(false); setNuevo(null); await load()
  }

  function empezarEdicion(e: Entidad) {
    setCreando(false); setNuevo(null)
    setEditId(e.id)
    setDraft({ pais: e.pais, tipo: e.tipo, codigo: e.codigo || '', nombre: e.nombre, nombre_corto: e.nombre_corto || '', activo: e.activo })
  }

  async function guardarEdicion(id: string) {
    if (!draft.nombre.trim()) { alert('El nombre no puede quedar vacío'); return }
    await (supabase.from('entidades_financieras') as any).update({
      pais: draft.pais, tipo: draft.tipo, codigo: draft.codigo?.trim() || null,
      nombre: draft.nombre.trim(), nombre_corto: draft.nombre_corto?.trim() || null, activo: draft.activo,
    }).eq('id', id)
    setEditId(null); setDraft(null); await load()
  }

  async function toggleActivo(e: Entidad) {
    await (supabase.from('entidades_financieras') as any).update({ activo: !e.activo }).eq('id', e.id)
    await load()
  }

  async function eliminar(e: Entidad) {
    if (!confirm(`¿Eliminar "${e.nombre}"? Si ya hay cuentas que lo usan, conviene desactivarlo en vez de borrarlo.`)) return
    const { error } = await supabase.from('entidades_financieras').delete().eq('id', e.id)
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
        <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Tipo</label>
          <select value={d.tipo} onChange={e => set({ ...d, tipo: e.target.value })} className={inp}>
            <option value="banco">Banco</option>
            <option value="fintech">Fintech / billetera</option>
            <option value="alyc">ALyC / Agente de inversión</option>
          </select></div>
        <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Código oficial</label>
          <input value={d.codigo} onChange={e => set({ ...d, codigo: e.target.value })} className={inp} placeholder="ej. 011 (BCRA) / 001 (CMF)" /></div>
        <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Nombre corto</label>
          <input value={d.nombre_corto} onChange={e => set({ ...d, nombre_corto: e.target.value })} className={inp} placeholder="ej. Nación" /></div>
        <div className="col-span-2"><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Nombre completo</label>
          <input value={d.nombre} onChange={e => set({ ...d, nombre: e.target.value })} className={inp} placeholder="ej. Banco de la Nación Argentina" /></div>
      </div>
    )
  }

  function Tabla({ titulo, filas }: { titulo: string; filas: Entidad[] }) {
    if (filas.length === 0) return null
    return (
      <div className="mb-5">
        <h3 className="text-xs font-bold text-gray-700 mb-2">{titulo} <span className="text-gray-400 font-normal">({filas.length})</span></h3>
        <div className="space-y-1.5">
          {filas.map(e => (
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
                  <span className="font-mono text-[11px] text-gray-500 w-12 flex-shrink-0">{e.codigo || '—'}</span>
                  <div className="flex-1 min-w-0">
                    <span className={`text-sm ${e.activo ? 'text-gray-900' : 'text-gray-400 line-through'}`}>{e.nombre}</span>
                    {e.nombre_corto && <span className="text-[11px] text-gray-400 ml-2">{e.nombre_corto}</span>}
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
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-bold text-base text-gray-900">Entidades financieras</h2>
        {puedeCrear && <button onClick={empezarNuevo} className="px-4 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold hover:bg-[#0a4fc4]">+ Agregar entidad</button>}
      </div>
      <p className="text-xs text-gray-400 mb-3">Bancos, fintech y ALyC / agentes de inversión por país. Las que estén activas aparecen al cargar una cuenta del país correspondiente.</p>

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
          <h3 className="font-bold text-sm text-gray-900 mb-3">Nueva entidad financiera</h3>
          {campos(nuevo, setNuevo)}
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => { setCreando(false); setNuevo(null) }} className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold hover:bg-gray-50">Cancelar</button>
            <button onClick={guardarNuevo} className="px-5 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold hover:bg-[#0a4fc4]">Crear entidad</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-gray-400 text-sm">Cargando…</div>
      ) : delPais.length === 0 ? (
        <div className="p-8 text-center text-gray-400 text-sm border border-dashed border-gray-200 rounded-2xl">No hay entidades cargadas para este país.</div>
      ) : (
        <>
          <Tabla titulo="🏦 Bancos" filas={bancos} />
          <Tabla titulo="📱 Fintech / billeteras" filas={fintechs} />
          <Tabla titulo="📈 ALyC / Agentes de inversión" filas={alycs} />
        </>
      )}
    </div>
  )
}
