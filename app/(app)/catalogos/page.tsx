'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'

type Tab = 'categorias' | 'puertos_china' | 'puertos_chile' | 'pasos' | 'ciudades' | 'contenedores' | 'camiones' | 'fondos' | 'rubros_bloques'

const TABS = [
  { key: 'categorias',    label: 'Categorías de precio', icon: '🏷' },
  { key: 'puertos_china', label: 'Puertos China',        icon: '🇨🇳' },
  { key: 'puertos_chile', label: 'Puertos Chile',        icon: '🇨🇱' },
  { key: 'pasos',         label: 'Pasos fronterizos',    icon: '🛃' },
  { key: 'ciudades',      label: 'Ciudades Argentina',   icon: '🇦🇷' },
  { key: 'contenedores',  label: 'Tipos de contenedor',  icon: '📦' },
  { key: 'camiones',      label: 'Tipos de camión',      icon: '🚛' },
  { key: 'fondos',        label: 'Fondos en custodia',   icon: '🏦' },
  { key: 'rubros_bloques', label: 'Rubros por bloque',    icon: '⚙️' },
] as const

const inp = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white'
const btn = 'px-4 py-2 rounded-xl text-xs font-semibold transition-all'

// ── Componente genérico de ABM ─────────────────────────────────────
interface ColDef {
  key: string
  label: string
  type?: 'text' | 'boolean' | 'number' | 'color' | 'emoji'
  placeholder?: string
  width?: string
}

function CatalogoABM({
  tabla, titulo, cols, orden, extra
}: {
  tabla: string
  titulo: string
  cols: ColDef[]
  orden: string
  extra?: React.ReactNode
}) {
  const supabase = useMemo(() => createClient(), [])
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [editData, setEditData] = useState<any>({})
  const [newRow, setNewRow] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [showNew, setShowNew] = useState(false)

  useEffect(() => { load() }, [tabla])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from(tabla).select('*').order(orden, { ascending: true })
    if (error) {
      // Si falla el orden (columna no existe), intentar sin orden
      const { data: data2 } = await supabase.from(tabla).select('*')
      if (data2) setRows(data2)
    } else if (data) {
      setRows(data)
    }
    setLoading(false)
  }

  function startEdit(row: any) {
    setEditId(row.id)
    setEditData({ ...row })
  }

  function cancelEdit() {
    setEditId(null)
    setEditData({})
  }

  async function saveEdit() {
    setSaving(true)
    const payload: any = {}
    cols.forEach(c => { payload[c.key] = editData[c.key] })
    await (supabase.from(tabla) as any).update(payload).eq('id', editId)
    await load()
    setEditId(null)
    setEditData({})
    setSaving(false)
  }

  async function toggleActivo(row: any) {
    await (supabase.from(tabla) as any).update({ activo: !row.activo }).eq('id', row.id)
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, activo: !r.activo } : r))
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar este registro?')) return
    await supabase.from(tabla).delete().eq('id', id)
    setRows(prev => prev.filter(r => r.id !== id))
  }

  async function guardarNuevo() {
    if (!newRow[cols[0].key]) { alert(`Ingresá ${cols[0].label}`); return }
    setSaving(true)
    const payload: any = { activo: true }
    cols.forEach(c => { if (newRow[c.key] !== undefined) payload[c.key] = newRow[c.key] })
    // Orden automático
    if (cols.find(c => c.key === 'orden')) {
      payload.orden = rows.length > 0 ? Math.max(...rows.map((r: any) => r.orden || 0)) + 1 : 1
    }
    const { error } = await (supabase.from(tabla) as any).insert(payload)
    if (error) { alert('Error: ' + error.message); setSaving(false); return }
    await load()
    setNewRow({})
    setShowNew(false)
    setSaving(false)
  }

  const hasActivo = rows.length > 0 && 'activo' in rows[0]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-base text-gray-900">{titulo}</h2>
          <p className="text-xs text-gray-400 mt-0.5">{rows.length} registro(s) · {rows.filter(r => r.activo !== false).length} activos</p>
        </div>
        <button onClick={() => { setShowNew(true); setNewRow({}) }}
          className={`${btn} bg-[#1168F8] text-white hover:bg-[#0a4fc4] shadow-sm`}>
          + Agregar
        </button>
      </div>

      {extra}

      {/* Formulario nuevo */}
      {showNew && (
        <div className="bg-[#EBF2FF] border border-[#93B8FC] rounded-2xl p-4">
          <div className="text-xs font-bold text-[#052698] mb-3">Nuevo registro</div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            {cols.filter(c => c.type !== 'boolean').map(c => (
              <div key={c.key} style={c.width ? { gridColumn: `span ${c.width}` } : {}}>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">{c.label}</label>
                {c.type === 'color' ? (
                  <div className="flex gap-2 items-center">
                    <input type="color" value={newRow[c.key] || '#6b7280'}
                      onChange={e => setNewRow((p: any) => ({ ...p, [c.key]: e.target.value }))}
                      className="w-10 h-8 rounded-lg border border-gray-200 cursor-pointer"/>
                    <input value={newRow[c.key] || ''} onChange={e => setNewRow((p: any) => ({ ...p, [c.key]: e.target.value }))}
                      className={inp} placeholder="#6b7280"/>
                  </div>
                ) : c.type === 'number' ? (
                  <input type="number" value={newRow[c.key] || ''} onChange={e => setNewRow((p: any) => ({ ...p, [c.key]: e.target.value }))}
                    className={inp} placeholder={c.placeholder}/>
                ) : (
                  <input value={newRow[c.key] || ''} onChange={e => setNewRow((p: any) => ({ ...p, [c.key]: e.target.value }))}
                    className={inp} placeholder={c.placeholder || c.label}/>
                )}
              </div>
            ))}
            {cols.filter(c => c.type === 'boolean').map(c => (
              <div key={c.key} className="flex items-center gap-2 pt-4">
                <input type="checkbox" checked={newRow[c.key] || false}
                  onChange={e => setNewRow((p: any) => ({ ...p, [c.key]: e.target.checked }))}
                  className="w-4 h-4 rounded"/>
                <label className="text-xs text-gray-700">{c.label}</label>
              </div>
            ))}
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setShowNew(false); setNewRow({}) }}
              className={`${btn} border border-gray-200 text-gray-600 hover:bg-gray-50`}>Cancelar</button>
            <button onClick={guardarNuevo} disabled={saving}
              className={`${btn} bg-[#1168F8] text-white hover:bg-[#0a4fc4] disabled:opacity-50`}>
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Cargando...</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">Sin registros aún</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {cols.map(c => (
                  <th key={c.key} className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{c.label}</th>
                ))}
                {hasActivo && <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Estado</th>}
                <th className="px-4 py-3"/>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id} className={`border-b border-gray-50 transition-colors group ${row.activo === false ? 'opacity-40' : 'hover:bg-blue-50/20'}`}>
                  {editId === row.id ? (
                    <>
                      {cols.map(c => (
                        <td key={c.key} className="px-4 py-2">
                          {c.type === 'boolean' ? (
                            <input type="checkbox" checked={editData[c.key] || false}
                              onChange={e => setEditData((p: any) => ({ ...p, [c.key]: e.target.checked }))}
                              className="w-4 h-4 rounded"/>
                          ) : c.type === 'color' ? (
                            <div className="flex gap-1 items-center">
                              <input type="color" value={editData[c.key] || '#6b7280'}
                                onChange={e => setEditData((p: any) => ({ ...p, [c.key]: e.target.value }))}
                                className="w-8 h-7 rounded border border-gray-200 cursor-pointer"/>
                              <input value={editData[c.key] || ''} onChange={e => setEditData((p: any) => ({ ...p, [c.key]: e.target.value }))}
                                className="w-24 px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8] bg-white"/>
                            </div>
                          ) : c.type === 'number' ? (
                            <input type="number" value={editData[c.key] || ''} onChange={e => setEditData((p: any) => ({ ...p, [c.key]: e.target.value }))}
                              className="w-20 px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8] bg-white"/>
                          ) : (
                            <input value={editData[c.key] || ''} onChange={e => setEditData((p: any) => ({ ...p, [c.key]: e.target.value }))}
                              className="w-full px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8] bg-white"/>
                          )}
                        </td>
                      ))}
                      {hasActivo && <td className="px-4 py-2"/>}
                      <td className="px-4 py-2">
                        <div className="flex gap-1">
                          <button onClick={saveEdit} disabled={saving}
                            className="px-3 py-1 bg-[#1168F8] text-white rounded-lg text-[10px] font-bold disabled:opacity-50">
                            {saving ? '...' : 'Guardar'}
                          </button>
                          <button onClick={cancelEdit}
                            className="px-3 py-1 border border-gray-200 text-gray-500 rounded-lg text-[10px]">
                            Cancelar
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      {cols.map(c => (
                        <td key={c.key} className="px-4 py-3">
                          {c.type === 'boolean' ? (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${row[c.key] ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                              {row[c.key] ? 'Sí' : 'No'}
                            </span>
                          ) : c.type === 'color' ? (
                            <div className="flex items-center gap-2">
                              <div className="w-5 h-5 rounded-md border border-gray-200" style={{ background: row[c.key] }}/>
                              <span className="font-mono text-[10px] text-gray-500">{row[c.key]}</span>
                            </div>
                          ) : c.key === 'icon' || c.type === 'emoji' ? (
                            <span className="text-lg">{row[c.key]}</span>
                          ) : c.key === 'bg' ? (
                            <div className="w-6 h-6 rounded-md border border-gray-200" style={{ background: row[c.key] }}/>
                          ) : (
                            <span className={`text-gray-800 ${c.key === 'codigo' ? 'font-mono text-[11px] text-[#052698]' : ''}`}>
                              {row[c.key]}
                            </span>
                          )}
                        </td>
                      ))}
                      {hasActivo && (
                        <td className="px-4 py-3">
                          <button onClick={() => toggleActivo(row)}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold cursor-pointer transition-all ${
                              row.activo !== false ? 'bg-green-50 text-green-700 hover:bg-red-50 hover:text-red-600' : 'bg-gray-100 text-gray-400 hover:bg-green-50 hover:text-green-700'
                            }`}>
                            {row.activo !== false ? 'Activo' : 'Inactivo'}
                          </button>
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => startEdit(row)}
                            className="px-3 py-1 border border-gray-200 rounded-lg text-[10px] text-gray-500 hover:bg-[#EBF2FF] hover:text-[#1168F8] hover:border-[#93B8FC] transition-all">
                            Editar
                          </button>
                          <button onClick={() => eliminar(row.id)}
                            className="px-3 py-1 border border-red-100 rounded-lg text-[10px] text-gray-400 hover:bg-red-50 hover:text-red-600 transition-all">
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Página principal ────────────────────────────────────────────────
export default function CatalogosPage() {
  const [tab, setTab] = useState<Tab>('categorias')

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <div className="text-[11px] font-bold text-[#1168F8]/60 uppercase tracking-widest mb-1">Configuración</div>
        <h1 className="text-2xl font-bold text-gray-900">Catálogos del sistema</h1>
        <p className="text-xs text-gray-400 mt-1">Administrá las listas de referencia usadas en todo el sistema</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-white border border-gray-100 rounded-2xl p-1.5 shadow-sm overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key as Tab)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap flex-shrink-0 ${
              tab === t.key ? 'bg-[#1168F8] text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* ── CATEGORÍAS DE PRECIO ── */}
      {tab === 'categorias' && (
        <CatalogoABM
          tabla="categorias_precio"
          titulo="Categorías de precio"
          orden="orden"
          cols={[
            { key: 'orden',  label: 'Orden',   type: 'number', placeholder: '1' },
            { key: 'codigo', label: 'Código',   placeholder: 'flete_maritimo' },
            { key: 'icon',   label: 'Ícono',    type: 'emoji', placeholder: '🚢' },
            { key: 'label',  label: 'Nombre',   placeholder: 'Flete marítimo' },
            { key: 'color',  label: 'Color',    type: 'color' },
            { key: 'bg',     label: 'Fondo',    type: 'color' },
          ]}
          extra={
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-[11px] text-blue-700">
              💡 El <strong>código</strong> es el identificador interno (sin espacios, sin tildes). Se usa para vincular con las cotizaciones de proveedores. No lo cambiés después de crear cotizaciones con esa categoría.
            </div>
          }
        />
      )}

      {/* ── PUERTOS CHINA ── */}
      {tab === 'puertos_china' && (
        <CatalogoABM
          tabla="puertos_china"
          titulo="Puertos de China"
          orden="orden"
          cols={[
            { key: 'orden',  label: 'Orden',   type: 'number', placeholder: '1' },
            { key: 'locode', label: 'LOCODE',   placeholder: 'CNQDG' },
            { key: 'nombre', label: 'Nombre',   placeholder: 'Qingdao' },
            { key: 'ciudad', label: 'Ciudad',   placeholder: 'Qingdao, Shandong' },
          ]}
        />
      )}

      {/* ── PUERTOS CHILE ── */}
      {tab === 'puertos_chile' && (
        <CatalogoABM
          tabla="puertos_chile"
          titulo="Puertos de Chile"
          orden="orden"
          cols={[
            { key: 'orden',  label: 'Orden',   type: 'number', placeholder: '1' },
            { key: 'locode', label: 'LOCODE',   placeholder: 'CLIQQ' },
            { key: 'nombre', label: 'Nombre',   placeholder: 'Puerto Iquique' },
            { key: 'ciudad', label: 'Ciudad',   placeholder: 'Iquique' },
          ]}
        />
      )}

      {/* ── PASOS FRONTERIZOS ── */}
      {tab === 'pasos' && (
        <CatalogoABM
          tabla="pasos_fronterizos"
          titulo="Pasos fronterizos"
          orden="orden"
          cols={[
            { key: 'orden',                  label: 'Orden',             type: 'number', placeholder: '1' },
            { key: 'nombre',                 label: 'Nombre',            placeholder: 'Paso de Jama' },
            { key: 'provincia_argentina',    label: 'Provincia ARG',     placeholder: 'Jujuy' },
            { key: 'restriccion_invierno',   label: 'Restricción invierno', type: 'boolean' },
          ]}
        />
      )}

      {/* ── CIUDADES ARGENTINA ── */}
      {tab === 'ciudades' && (
        <CatalogoABM
          tabla="ciudades_destino_arg"
          titulo="Ciudades destino Argentina"
          orden="orden"
          cols={[
            { key: 'orden',     label: 'Orden',     type: 'number', placeholder: '1' },
            { key: 'ciudad',    label: 'Ciudad',    placeholder: 'San Salvador de Jujuy' },
            { key: 'provincia', label: 'Provincia', placeholder: 'Jujuy' },
          ]}
        />
      )}

      {/* ── TIPOS DE CONTENEDOR ── */}
      {tab === 'contenedores' && (
        <CatalogoABM
          tabla="tipos_contenedor"
          titulo="Tipos de contenedor"
          orden="orden"
          cols={[
            { key: 'orden',  label: 'Orden',  type: 'number', placeholder: '1' },
            { key: 'codigo', label: 'Código', placeholder: '40HC' },
            { key: 'nombre', label: 'Nombre', placeholder: 'High Cube 40 pies' },
          ]}
          extra={
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-[11px] text-blue-700">
              💡 El <strong>código</strong> es el identificador que aparece en las cotizaciones (ej: 20ST, 40HC, 40RF). No lo cambiés si ya hay cotizaciones que lo referencian.
            </div>
          }
        />
      )}

      {/* ── TIPOS DE CAMIÓN ── */}
      {tab === 'camiones' && (
        <CatalogoABM
          tabla="tipos_camion"
          titulo="Tipos de camión"
          orden="orden"
          cols={[
            { key: 'orden',  label: 'Orden',  type: 'number', placeholder: '1' },
            { key: 'icono',  label: 'Ícono',  type: 'emoji',  placeholder: '🚛' },
            { key: 'nombre', label: 'Nombre', placeholder: 'Semi con acoplado' },
          ]}
        />
      )}

      {/* ── FONDOS EN CUSTODIA ── */}
      {tab === 'fondos' && <FondosCuentasABM />}

      {/* ── RUBROS POR BLOQUE ── */}
      {tab === 'rubros_bloques' && <RubrosBloqueABM />}
    </div>
  )
}

// ── ABM especializado para cuentas de fondos en custodia ───────
function FondosCuentasABM() {
  const supabase = useMemo(() => createClient(), [])
  const [cuentas, setCuentas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const vacio = {
    nombre: '', tipo: 'banco', moneda: 'USD', pais: 'Argentina',
    banco: '', nro_cuenta: '', cbu_iban: '', swift: '',
    titular: '', responsable: '', firmantes: '', notas: '', activo: true, orden: 0,
  }
  const [form, setForm] = useState<any>({ ...vacio })
  const inp = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white'

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('fondos_cuentas').select('*').order('orden', { ascending: true })
    if (data) setCuentas(data)
    setLoading(false)
  }

  function startEdit(c: any) {
    setEditId(c.id)
    setForm({ ...c })
    setShowNew(false)
  }

  function cancelEdit() { setEditId(null); setForm({ ...vacio }) }

  async function guardar() {
    if (!form.nombre) { alert('Ingresá el nombre'); return }
    setSaving(true)
    const payload = {
      nombre: form.nombre, tipo: form.tipo, moneda: form.moneda, pais: form.pais,
      banco: form.banco || null, nro_cuenta: form.nro_cuenta || null,
      cbu_iban: form.cbu_iban || null, swift: form.swift || null,
      titular: form.titular || null, responsable: form.responsable || null,
      firmantes: form.firmantes || null, notas: form.notas || null,
      activo: form.activo, orden: parseInt(form.orden) || 0,
    }
    if (editId) {
      await (supabase.from('fondos_cuentas') as any).update(payload).eq('id', editId)
    } else {
      await (supabase.from('fondos_cuentas') as any).insert(payload)
    }
    await load()
    setEditId(null)
    setShowNew(false)
    setForm({ ...vacio })
    setSaving(false)
  }

  async function toggleActivo(c: any) {
    await (supabase.from('fondos_cuentas') as any).update({ activo: !c.activo }).eq('id', c.id)
    setCuentas(prev => prev.map(x => x.id === c.id ? { ...x, activo: !x.activo } : x))
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar esta cuenta? Solo si no tiene movimientos registrados.')) return
    await supabase.from('fondos_cuentas').delete().eq('id', id)
    setCuentas(prev => prev.filter(c => c.id !== id))
  }

  const FormCuenta = () => (
    <div className="bg-[#EBF2FF] border border-[#93B8FC] rounded-2xl p-5 mb-4">
      <div className="text-xs font-bold text-[#052698] mb-4">{editId ? 'Editar cuenta' : 'Nueva cuenta'}</div>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="col-span-2">
          <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Nombre descriptivo *</label>
          <input value={form.nombre} onChange={e => setForm((f: any) => ({ ...f, nombre: e.target.value }))}
            className={inp} placeholder="ej. Caja efectivo Argentina USD"/>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Orden</label>
          <input type="number" value={form.orden} onChange={e => setForm((f: any) => ({ ...f, orden: e.target.value }))}
            className={inp} placeholder="1"/>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Tipo</label>
          <select value={form.tipo} onChange={e => setForm((f: any) => ({ ...f, tipo: e.target.value }))} className={inp}>
            <option value="banco">🏦 Banco</option>
            <option value="caja">💵 Caja efectivo</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Moneda</label>
          <select value={form.moneda} onChange={e => setForm((f: any) => ({ ...f, moneda: e.target.value }))} className={inp}>
            <option value="ARS">ARS — Peso argentino</option>
            <option value="USD">USD — Dólar</option>
            <option value="CLP">CLP — Peso chileno</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">País</label>
          <select value={form.pais} onChange={e => setForm((f: any) => ({ ...f, pais: e.target.value }))} className={inp}>
            <option value="Argentina">🇦🇷 Argentina</option>
            <option value="Chile">🇨🇱 Chile</option>
          </select>
        </div>
      </div>

      {/* Datos bancarios — solo si es banco */}
      {form.tipo === 'banco' && (
        <>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Banco</label>
              <input value={form.banco || ''} onChange={e => setForm((f: any) => ({ ...f, banco: e.target.value }))}
                className={inp} placeholder="ej. Banco Nación Argentina"/>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Titular de la cuenta</label>
              <input value={form.titular || ''} onChange={e => setForm((f: any) => ({ ...f, titular: e.target.value }))}
                className={inp} placeholder="ej. Puerto NOA SpA"/>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">N° de cuenta</label>
              <input value={form.nro_cuenta || ''} onChange={e => setForm((f: any) => ({ ...f, nro_cuenta: e.target.value }))}
                className={inp} placeholder="Número de cuenta bancaria"/>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">CBU / IBAN</label>
              <input value={form.cbu_iban || ''} onChange={e => setForm((f: any) => ({ ...f, cbu_iban: e.target.value }))}
                className={inp} placeholder="CBU o IBAN"/>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">SWIFT / BIC</label>
              <input value={form.swift || ''} onChange={e => setForm((f: any) => ({ ...f, swift: e.target.value }))}
                className={inp} placeholder="Código SWIFT"/>
            </div>
          </div>
        </>
      )}

      {/* Responsable — siempre visible */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">
            {form.tipo === 'caja' ? 'Responsable de la caja' : 'Responsable / Apoderado'}
          </label>
          <input value={form.responsable || ''} onChange={e => setForm((f: any) => ({ ...f, responsable: e.target.value }))}
            className={inp} placeholder="Nombre del responsable"/>
        </div>
        {form.tipo === 'banco' && (
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Usuarios / Firmantes autorizados</label>
            <input value={form.firmantes || ''} onChange={e => setForm((f: any) => ({ ...f, firmantes: e.target.value }))}
              className={inp} placeholder="ej. Pablo Mealla, Rene Mealla"/>
          </div>
        )}
      </div>

      <div className="mb-3">
        <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Notas / observaciones</label>
        <input value={form.notas || ''} onChange={e => setForm((f: any) => ({ ...f, notas: e.target.value }))}
          className={inp} placeholder="Información adicional"/>
      </div>

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.activo} onChange={e => setForm((f: any) => ({ ...f, activo: e.target.checked }))} className="w-4 h-4 rounded"/>
          <span className="text-xs text-gray-600 font-medium">Cuenta activa</span>
        </label>
        <div className="flex gap-2">
          <button onClick={() => { setShowNew(false); cancelEdit() }}
            className="px-4 py-2 border border-gray-200 rounded-xl text-xs text-gray-600 hover:bg-gray-50 bg-white">Cancelar</button>
          <button onClick={guardar} disabled={saving}
            className="px-5 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold hover:bg-[#0a4fc4] disabled:opacity-50">
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-base text-gray-900">Cuentas y cajas — Fondos en custodia</h2>
          <p className="text-xs text-gray-400 mt-0.5">{cuentas.length} cuenta(s) · {cuentas.filter(c => c.activo).length} activas</p>
        </div>
        {!showNew && !editId && (
          <button onClick={() => { setShowNew(true); setForm({ ...vacio, orden: cuentas.length + 1 }) }}
            className="px-4 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-semibold hover:bg-[#0a4fc4] shadow-sm">
            + Agregar cuenta
          </button>
        )}
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-[11px] text-blue-700">
        💡 Estas son las cajas y cuentas bancarias donde Puerto NOA administra <strong>fondos de clientes a rendir</strong>. No corresponden a las finanzas propias de Puerto NOA.
      </div>

      {(showNew || editId) && <FormCuenta />}

      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Cargando...</div>
        ) : cuentas.length === 0 ? (
          <div className="p-8 text-center text-gray-400">Sin cuentas cargadas aún.</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['#','Nombre','País','Tipo','Moneda','Banco','N° Cuenta','CBU/IBAN','SWIFT','Titular','Responsable','Firmantes','Estado',''].map(h => (
                  <th key={h} className="text-left px-3 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cuentas.map(c => (
                <tr key={c.id} className={`border-b border-gray-50 transition-colors ${!c.activo ? 'opacity-40' : 'hover:bg-blue-50/20'}`}>
                  <td className="px-3 py-3 text-gray-400 font-mono text-[10px]">{c.orden}</td>
                  <td className="px-3 py-3 font-semibold text-gray-800">{c.nombre}</td>
                  <td className="px-3 py-3 text-gray-500">{c.pais === 'Argentina' ? '🇦🇷' : '🇨🇱'}</td>
                  <td className="px-3 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${c.tipo === 'banco' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
                      {c.tipo === 'banco' ? '🏦 Banco' : '💵 Caja'}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-mono text-[11px] font-bold text-[#052698]">{c.moneda}</td>
                  <td className="px-3 py-3 text-gray-600">{c.banco || '—'}</td>
                  <td className="px-3 py-3 font-mono text-[10px] text-gray-500">{c.nro_cuenta || '—'}</td>
                  <td className="px-3 py-3 font-mono text-[10px] text-gray-500">{c.cbu_iban || '—'}</td>
                  <td className="px-3 py-3 font-mono text-[10px] text-gray-500">{c.swift || '—'}</td>
                  <td className="px-3 py-3 text-gray-500">{c.titular || '—'}</td>
                  <td className="px-3 py-3 text-gray-500">{c.responsable || '—'}</td>
                  <td className="px-3 py-3 text-gray-400 text-[10px]">{c.firmantes || '—'}</td>
                  <td className="px-3 py-3">
                    <button onClick={() => toggleActivo(c)}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold cursor-pointer transition-all ${
                        c.activo ? 'bg-green-50 text-green-700 hover:bg-red-50 hover:text-red-600' : 'bg-gray-100 text-gray-400 hover:bg-green-50 hover:text-green-700'
                      }`}>
                      {c.activo ? 'Activa' : 'Inactiva'}
                    </button>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => startEdit(c)}
                        className="px-3 py-1 border border-gray-200 rounded-lg text-[10px] text-gray-500 hover:bg-[#EBF2FF] hover:text-[#1168F8] hover:border-[#93B8FC] transition-all">
                        Editar
                      </button>
                      <button onClick={() => eliminar(c.id)}
                        className="px-3 py-1 border border-red-100 rounded-lg text-[10px] text-gray-400 hover:bg-red-50 hover:text-red-600 transition-all">
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Configuración de rubros por bloque del cotizador ─────────────────────────
const BLOQUES_COTIZADOR = [
  { num: 1, label: 'Bloque 1 — ForWarder',            color: '#1168F8', bg: '#EBF2FF', desc: 'Flete marítimo, handling, gastos naviero' },
  { num: 2, label: 'Bloque 2 — Transporte Chile-NOA', color: '#0a9e6e', bg: '#E1F5EE', desc: 'Transporte de carga Chile a Argentina' },
  { num: 3, label: 'Bloque 3 — Flete terrestre',      color: '#b45309', bg: '#FEF3C7', desc: 'Camiones, contenedores, estadías' },
  { num: 4, label: 'Bloque 4 — Gastos Argentina',     color: '#6b21a8', bg: '#F3E8FF', desc: 'Despachante, gastos aduaneros, otros ARG' },
]

function RubrosBloqueABM() {
  const supabase = useMemo(() => createClient(), [])
  const [rubros, setRubros] = useState<any[]>([])
  const [asignaciones, setAsignaciones] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [rubRes, asnRes] = await Promise.all([
      supabase.from('proveedor_rubros').select('id,nombre').order('nombre'),
      supabase.from('cotizador_bloque_rubros').select('*'),
    ])
    if (rubRes.data) setRubros(rubRes.data)
    if (asnRes.data) setAsignaciones(asnRes.data)
    setLoading(false)
  }

  function isAsignado(bloque: number, rubroId: string) {
    return asignaciones.some(a => a.bloque === bloque && a.rubro_id === rubroId && a.activo !== false)
  }

  async function toggleAsignacion(bloque: number, bloqueNombre: string, rubroId: string) {
    const key = `${bloque}-${rubroId}`
    setSaving(key)
    const existente = asignaciones.find(a => a.bloque === bloque && a.rubro_id === rubroId)

    if (existente) {
      // Toggle activo
      const nuevoActivo = !existente.activo
      await (supabase.from('cotizador_bloque_rubros') as any)
        .update({ activo: nuevoActivo })
        .eq('id', existente.id)
      setAsignaciones(prev => prev.map(a =>
        a.id === existente.id ? { ...a, activo: nuevoActivo } : a
      ))
    } else {
      // Crear nueva asignación
      const { data } = await (supabase.from('cotizador_bloque_rubros') as any)
        .insert({ bloque, bloque_nombre: bloqueNombre, rubro_id: rubroId, activo: true })
        .select()
        .single()
      if (data) setAsignaciones(prev => [...prev, data])
    }
    setSaving(null)
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-bold text-base text-gray-900">Rubros por bloque del cotizador</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Configurá qué rubros de proveedores aparecen disponibles en cada bloque al armar un presupuesto
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-[11px] text-blue-700">
        💡 Tildá los rubros que aplican a cada bloque. Al cargar una cotización de proveedor en el cotizador,
        el sistema filtrará proveedores y cotizaciones según esta configuración.
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-400">Cargando...</div>
      ) : rubros.length === 0 ? (
        <div className="p-8 text-center text-gray-400">
          No hay rubros de proveedores cargados. Agregá rubros en el módulo de Clientes y Proveedores primero.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {BLOQUES_COTIZADOR.map(bloque => {
            const asignadosEnBloque = asignaciones
              .filter(a => a.bloque === bloque.num && a.activo !== false)
              .length

            return (
              <div key={bloque.num}
                className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                {/* Header del bloque */}
                <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3"
                  style={{ background: bloque.bg }}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ background: bloque.color }}>
                    {bloque.num}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-sm" style={{ color: bloque.color }}>{bloque.label}</div>
                    <div className="text-[10px] text-gray-500">{bloque.desc}</div>
                  </div>
                  <div className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: bloque.color + '20', color: bloque.color }}>
                    {asignadosEnBloque} rubro(s) asignado(s)
                  </div>
                </div>

                {/* Grid de rubros */}
                <div className="px-5 py-4">
                  <div className="grid grid-cols-3 gap-2">
                    {rubros.map(rubro => {
                      const asignado = isAsignado(bloque.num, rubro.id)
                      const key = `${bloque.num}-${rubro.id}`
                      const guardando = saving === key

                      return (
                        <button
                          key={rubro.id}
                          onClick={() => toggleAsignacion(bloque.num, bloque.label, rubro.id)}
                          disabled={guardando}
                          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border-2 text-left transition-all text-xs font-medium ${
                            asignado
                              ? 'border-current text-white'
                              : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                          } ${guardando ? 'opacity-50' : ''}`}
                          style={asignado ? { background: bloque.color, borderColor: bloque.color } : {}}
                        >
                          {/* Checkbox visual */}
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                            asignado ? 'bg-white border-white' : 'border-gray-300 bg-white'
                          }`}>
                            {asignado && (
                              <div className="w-2 h-1.5 border-l-2 border-b-2 border-current"
                                style={{ color: bloque.color, transform: 'rotate(-45deg) translate(1px,-1px)' }}/>
                            )}
                          </div>
                          <span className="truncate">
                            {guardando ? '...' : rubro.nombre}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  {asignadosEnBloque === 0 && (
                    <div className="mt-3 text-[10px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                      ⚠ Sin rubros asignados — este bloque no mostrará proveedores del sistema al cotizar
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Preview de la configuración actual */}
      {!loading && rubros.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <div className="text-xs font-bold text-gray-700 mb-3">Resumen de configuración actual</div>
          <div className="space-y-2">
            {BLOQUES_COTIZADOR.map(bloque => {
              const rubrosDelBloque = asignaciones
                .filter(a => a.bloque === bloque.num && a.activo !== false)
                .map(a => rubros.find(r => r.id === a.rubro_id)?.nombre)
                .filter(Boolean)

              return (
                <div key={bloque.num} className="flex items-start gap-3 text-xs">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 mt-0.5"
                    style={{ background: bloque.color }}>
                    {bloque.num}
                  </div>
                  <div className="flex-1">
                    <span className="font-medium text-gray-700">{bloque.label.split('—')[1]?.trim()}: </span>
                    {rubrosDelBloque.length > 0 ? (
                      <span className="text-gray-500">{rubrosDelBloque.join(', ')}</span>
                    ) : (
                      <span className="text-amber-500 italic">sin rubros asignados</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
