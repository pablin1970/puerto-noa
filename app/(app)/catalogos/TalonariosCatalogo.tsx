'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { cargarPermisos, puede } from '@/lib/permisos'

const AZUL = '#1168F8'
const inp = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white'

interface Talonario {
  id: string
  tipo_comprobante_id: string
  nombre: string
  fiscal: boolean
  prefijo: string | null
  serie: string | null
  proximo_numero: number
  longitud: number
  pais: string | null
  moneda: string | null
  monedas_habilitadas: string[] | null
  activo: boolean
  orden: number
  notas: string | null
  tipo?: { nombre: string; categoria: string | null; es_dte: boolean; ambito: string } | null
}

function previewNumero(t: { prefijo: string | null; serie: string | null; proximo_numero: number; longitud: number }) {
  const num = t.longitud > 0 ? String(t.proximo_numero).padStart(t.longitud, '0') : String(t.proximo_numero)
  return [t.prefijo, t.serie, num].filter(Boolean).join('-')
}

const MONEDAS_DISP = ['CLP', 'USD', 'EUR', 'ARS', 'CNY']

// Selector de monedas habilitadas del talonario: se marcan las permitidas y,
// si hay más de una, se elige cuál queda por defecto al emitir. Una sola = fija.
function SelectorMonedas({ habilitadas, porDefecto, onChange }: {
  habilitadas: string[]; porDefecto: string; onChange: (habilitadas: string[], porDefecto: string) => void
}) {
  function toggle(m: string) {
    const tenia = habilitadas.includes(m)
    let nuevas = tenia ? habilitadas.filter(x => x !== m) : [...habilitadas, m]
    nuevas = MONEDAS_DISP.filter(x => nuevas.includes(x)) // mantener orden
    let def = porDefecto
    if (tenia && porDefecto === m) def = nuevas[0] || ''   // saqué la default
    if (!tenia && !porDefecto) def = m                      // primera marcada
    if (def && !nuevas.includes(def)) def = nuevas[0] || ''
    onChange(nuevas, def)
  }
  return (
    <div>
      <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Monedas habilitadas</label>
      <div className="flex flex-wrap gap-1.5 mb-1">
        {MONEDAS_DISP.map(m => (
          <button type="button" key={m} onClick={() => toggle(m)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${habilitadas.includes(m) ? 'bg-[#1168F8] text-white border-[#1168F8]' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>
            {m}
          </button>
        ))}
      </div>
      {habilitadas.length > 1 ? (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-400">Por defecto al emitir:</span>
          <select value={porDefecto} onChange={e => onChange(habilitadas, e.target.value)}
            className="text-[11px] border border-gray-200 rounded-lg px-2 py-1">
            {habilitadas.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      ) : habilitadas.length === 1 ? (
        <div className="text-[10px] text-gray-400">Moneda fija: <span className="font-semibold text-gray-600">{habilitadas[0]}</span></div>
      ) : (
        <div className="text-[10px] text-amber-600">Sin monedas marcadas (no se podrá emitir)</div>
      )}
    </div>
  )
}

export default function TalonariosCatalogo() {
  const supabase = createClient()
  const [permisos, setPermisos] = useState<Record<string, string[]>>({})
  const [talonarios, setTalonarios] = useState<Talonario[]>([])
  const [tipos, setTipos] = useState<any[]>([])
  const [familia, setFamilia] = useState<'no_fiscal' | 'fiscal'>('no_fiscal')
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [draft, setDraft] = useState<any>(null)
  const [creando, setCreando] = useState(false)
  const [nuevo, setNuevo] = useState<any>(null)

  const puedeCrear = puede(permisos, 'talonarios', 'crear')
  const puedeEditar = puede(permisos, 'talonarios', 'editar')
  const puedeEliminar = puede(permisos, 'talonarios', 'eliminar')

  useEffect(() => { cargarPermisos().then(setPermisos); load() }, [])

  async function load() {
    setLoading(true)
    const [tRes, tcRes] = await Promise.all([
      (supabase.from('talonarios') as any).select('*, tipo:tipos_comprobante(nombre,categoria,es_dte,ambito)').order('orden', { ascending: true }),
      supabase.from('tipos_comprobante').select('id,nombre,es_dte,ambito,categoria').eq('activo', true).order('orden', { ascending: true }),
    ])
    if (tRes.data) setTalonarios(tRes.data)
    if (tcRes.data) setTipos(tcRes.data)
    setLoading(false)
  }

  const lista = talonarios.filter(t => familia === 'fiscal' ? t.fiscal : !t.fiscal)

  // Tipos elegibles al crear: no fiscal → internos; fiscal → DTE emitidos/ambos
  const tiposElegibles = (tipos || []).filter((tc: any) =>
    familia === 'fiscal'
      ? tc.es_dte && (tc.ambito === 'emitido' || tc.ambito === 'ambos')
      : tc.categoria === 'interno')

  function empezarEdicion(t: Talonario) {
    setEditId(t.id)
    setDraft({ nombre: t.nombre, prefijo: t.prefijo || '', serie: t.serie || '', proximo_numero: t.proximo_numero, longitud: t.longitud, moneda: t.moneda || '', monedas: t.monedas_habilitadas || [], activo: t.activo, notas: t.notas || '' })
  }

  async function guardarEdicion(id: string) {
    await (supabase.from('talonarios') as any).update({
      nombre: draft.nombre, prefijo: draft.prefijo || null, serie: draft.serie || null,
      proximo_numero: parseInt(draft.proximo_numero) || 1, longitud: parseInt(draft.longitud) || 0,
      moneda: draft.moneda || null,
      monedas_habilitadas: draft.monedas?.length ? draft.monedas : null,
      activo: draft.activo, notas: draft.notas || null,
    }).eq('id', id)
    setEditId(null); setDraft(null)
    await load()
  }

  async function toggleActivo(t: Talonario) {
    await (supabase.from('talonarios') as any).update({ activo: !t.activo }).eq('id', t.id)
    await load()
  }

  async function eliminar(t: Talonario) {
    if (!confirm(`¿Eliminar el talonario "${t.nombre}"? Solo se puede si no emitió comprobantes.`)) return
    const { error } = await supabase.from('talonarios').delete().eq('id', t.id)
    if (error) { alert('No se pudo eliminar (puede tener comprobantes emitidos): ' + error.message); return }
    await load()
  }

  function empezarNuevo() {
    setCreando(true)
    setNuevo({ tipo_comprobante_id: '', nombre: '', prefijo: '', serie: '', proximo_numero: 1, longitud: 6, moneda: familia === 'fiscal' ? 'CLP' : '', monedas: familia === 'fiscal' ? ['CLP'] : [], notas: '' })
  }

  async function guardarNuevo() {
    if (!nuevo.tipo_comprobante_id) { alert('Elegí el tipo de comprobante'); return }
    if (!nuevo.nombre.trim()) { alert('Poné un nombre al talonario'); return }
    const maxOrden = talonarios.reduce((m, t) => Math.max(m, t.orden), 0)
    const { error } = await (supabase.from('talonarios') as any).insert({
      tipo_comprobante_id: nuevo.tipo_comprobante_id, nombre: nuevo.nombre.trim(),
      fiscal: familia === 'fiscal', prefijo: nuevo.prefijo || null, serie: nuevo.serie || null,
      proximo_numero: parseInt(nuevo.proximo_numero) || 1, longitud: parseInt(nuevo.longitud) || 0,
      moneda: nuevo.moneda || null,
      monedas_habilitadas: nuevo.monedas?.length ? nuevo.monedas : null,
      activo: true, orden: maxOrden + 10, notas: nuevo.notas || null,
    })
    if (error) { alert('No se pudo crear: ' + error.message); return }
    setCreando(false); setNuevo(null)
    await load()
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Talonarios y numeración</h2>
          <p className="text-xs text-gray-400 mt-0.5">Series y correlativos de todos los comprobantes. La numeración no fiscal la administrás vos.</p>
        </div>
        {puedeCrear && (
          <button onClick={empezarNuevo} className="px-4 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold hover:bg-[#0a4fc4] shadow-sm">+ Nuevo talonario</button>
        )}
      </div>

      <div className="flex gap-2 mb-4">
        <button onClick={() => { setFamilia('no_fiscal'); setCreando(false) }}
          className={`px-4 py-2 rounded-xl text-xs font-semibold border ${familia === 'no_fiscal' ? 'bg-[#0a9e6e] text-white border-[#0a9e6e]' : 'bg-white text-gray-600 border-gray-200'}`}>
          No fiscales (internos)
        </button>
        <button onClick={() => { setFamilia('fiscal'); setCreando(false) }}
          className={`px-4 py-2 rounded-xl text-xs font-semibold border ${familia === 'fiscal' ? 'bg-[#052698] text-white border-[#052698]' : 'bg-white text-gray-600 border-gray-200'}`}>
          Fiscales (SII)
        </button>
      </div>

      {familia === 'fiscal' && (
        <div className="mb-4 text-[11px] text-gray-500 bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5">
          Los talonarios fiscales corresponden a folios autorizados por el SII (DTE). El número lo asigna la autoridad; acá los registrás para tener la trazabilidad de la serie. Marcá las <b>monedas habilitadas</b> de cada talonario: una sola queda fija; varias se eligen al emitir (siempre sobre el mismo correlativo, el folio no se separa por moneda). Al emitir se fija el tipo de cambio del momento.
        </div>
      )}

      {creando && (
        <div className="mb-4 bg-white border border-[#1168F8]/30 rounded-2xl p-4 shadow-sm">
          <h3 className="font-bold text-sm text-gray-900 mb-3">Nuevo talonario {familia === 'fiscal' ? 'fiscal' : 'no fiscal'}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Tipo de comprobante</label>
              <select value={nuevo.tipo_comprobante_id} onChange={e => setNuevo({ ...nuevo, tipo_comprobante_id: e.target.value })} className={inp}>
                <option value="">— elegí el tipo —</option>
                {tiposElegibles.map((tc: any) => <option key={tc.id} value={tc.id}>{tc.nombre}</option>)}
              </select>
            </div>
            <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Nombre del talonario</label>
              <input value={nuevo.nombre} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} className={inp} placeholder="ej. Recibos caja Chile" /></div>
            <div className="grid grid-cols-3 gap-2">
              <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Prefijo</label>
                <input value={nuevo.prefijo} onChange={e => setNuevo({ ...nuevo, prefijo: e.target.value })} className={inp} placeholder="REC" /></div>
              <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Serie</label>
                <input value={nuevo.serie} onChange={e => setNuevo({ ...nuevo, serie: e.target.value })} className={inp} placeholder="A" /></div>
              <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Dígitos</label>
                <input type="number" value={nuevo.longitud} onChange={e => setNuevo({ ...nuevo, longitud: e.target.value })} className={inp} /></div>
            </div>
            <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Próximo número</label>
              <input type="number" value={nuevo.proximo_numero} onChange={e => setNuevo({ ...nuevo, proximo_numero: e.target.value })} className={inp} /></div>
            <div className="flex items-end">
              <div className="text-[11px] text-gray-500">Vista previa: <span className="font-mono font-bold text-gray-800">{previewNumero({ prefijo: nuevo.prefijo, serie: nuevo.serie, proximo_numero: parseInt(nuevo.proximo_numero) || 1, longitud: parseInt(nuevo.longitud) || 0 })}</span></div>
            </div>
            <div className="col-span-2">
              <SelectorMonedas habilitadas={nuevo.monedas || []} porDefecto={nuevo.moneda || ''}
                onChange={(h, d) => setNuevo({ ...nuevo, monedas: h, moneda: d })} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => { setCreando(false); setNuevo(null) }} className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold hover:bg-gray-50">Cancelar</button>
            <button onClick={guardarNuevo} className="px-5 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold hover:bg-[#0a4fc4]">Crear talonario</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-gray-400 text-sm">Cargando…</div>
      ) : lista.length === 0 ? (
        <div className="p-8 text-center text-gray-400 text-sm border border-dashed border-gray-200 rounded-2xl">
          {familia === 'fiscal' ? 'No hay talonarios fiscales cargados. Agregá los folios SII que uses.' : 'No hay talonarios no fiscales.'}
        </div>
      ) : (
        <div className="space-y-2">
          {lista.map(t => (
            <div key={t.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
              {editId === t.id ? (
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Nombre</label>
                    <input value={draft.nombre} onChange={e => setDraft({ ...draft, nombre: e.target.value })} className={inp} /></div>
                  <div className="grid grid-cols-3 gap-2">
                    <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Prefijo</label>
                      <input value={draft.prefijo} onChange={e => setDraft({ ...draft, prefijo: e.target.value })} className={inp} /></div>
                    <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Serie</label>
                      <input value={draft.serie} onChange={e => setDraft({ ...draft, serie: e.target.value })} className={inp} /></div>
                    <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Dígitos</label>
                      <input type="number" value={draft.longitud} onChange={e => setDraft({ ...draft, longitud: e.target.value })} className={inp} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Próximo número (corregible)</label>
                      <input type="number" value={draft.proximo_numero} onChange={e => setDraft({ ...draft, proximo_numero: e.target.value })} className={inp} /></div>
                    <div className="flex items-end justify-between">
                      <div className="text-[11px] text-gray-500">Próximo: <span className="font-mono font-bold text-gray-800">{previewNumero({ prefijo: draft.prefijo, serie: draft.serie, proximo_numero: parseInt(draft.proximo_numero) || 1, longitud: parseInt(draft.longitud) || 0 })}</span></div>
                      <label className="flex items-center gap-2 text-xs text-gray-600"><input type="checkbox" checked={draft.activo} onChange={e => setDraft({ ...draft, activo: e.target.checked })} />Activo</label>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <SelectorMonedas habilitadas={draft.monedas || []} porDefecto={draft.moneda || ''}
                      onChange={(h, d) => setDraft({ ...draft, monedas: h, moneda: d })} />
                  </div>
                  <div className="col-span-2 flex justify-end gap-2">
                    <button onClick={() => { setEditId(null); setDraft(null) }} className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold hover:bg-gray-50">Cancelar</button>
                    <button onClick={() => guardarEdicion(t.id)} className="px-5 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold hover:bg-[#0a4fc4]">Guardar</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-gray-900">{t.nombre}</span>
                      {!t.activo && <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded">inactivo</span>}
                    </div>
                    <div className="text-[11px] text-gray-400 mt-0.5">{t.tipo?.nombre || 'tipo'}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-gray-400 uppercase">Próximo número{t.monedas_habilitadas?.length ? ` · ${t.monedas_habilitadas.join(' · ')}` : (t.moneda ? ` · ${t.moneda}` : '')}</div>
                    <div className="font-mono font-bold text-sm text-[#1168F8]">{previewNumero(t)}</div>
                  </div>
                  <div className="flex gap-2">
                    {puedeEditar && <button onClick={() => empezarEdicion(t)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:border-[#1168F8] hover:text-[#1168F8]">Editar</button>}
                    {puedeEditar && <button onClick={() => toggleActivo(t)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-500 hover:bg-gray-50">{t.activo ? 'Desactivar' : 'Activar'}</button>}
                    {puedeEliminar && <button onClick={() => eliminar(t)} className="px-2.5 py-1.5 text-gray-300 hover:text-red-500 text-sm">✕</button>}
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
