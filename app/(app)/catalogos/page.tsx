'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'

type Tab = 'categorias' | 'puertos_china' | 'puertos_chile' | 'pasos' | 'ciudades' | 'contenedores' | 'camiones' | 'fondos'

const TABS = [
  { key: 'categorias',    label: 'Categorías de precio', icon: '🏷' },
  { key: 'puertos_china', label: 'Puertos China',        icon: '🇨🇳' },
  { key: 'puertos_chile', label: 'Puertos Chile',        icon: '🇨🇱' },
  { key: 'pasos',         label: 'Pasos fronterizos',    icon: '🛃' },
  { key: 'ciudades',      label: 'Ciudades Argentina',   icon: '🇦🇷' },
  { key: 'contenedores',  label: 'Tipos de contenedor',  icon: '📦' },
  { key: 'camiones',      label: 'Tipos de camión',      icon: '🚛' },
  { key: 'fondos',        label: 'Fondos en custodia',   icon: '🏦' },
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
    titular: '', notas: '', activo: true, orden: 0,
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
      titular: form.titular || null, notas: form.notas || null,
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
                {['#','Nombre','País','Tipo','Moneda','Banco','N° Cuenta','CBU/IBAN','SWIFT','Titular','Estado',''].map(h => (
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
