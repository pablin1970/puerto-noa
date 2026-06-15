'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'

type Tab = 'categorias' | 'puertos_china' | 'puertos_chile' | 'pasos' | 'ciudades' | 'contenedores' | 'camiones' | 'fondos' | 'rubros_bloques' | 'rubros_proveedor'

const TABS = [
  { key: 'categorias',    label: 'Categorías de precio', icon: '🏷' },
  { key: 'puertos_china', label: 'Puertos China',        icon: '🇨🇳' },
  { key: 'puertos_chile', label: 'Puertos Chile',        icon: '🇨🇱' },
  { key: 'pasos',         label: 'Pasos fronterizos',    icon: '🛃' },
  { key: 'ciudades',      label: 'Ciudades Argentina',   icon: '🇦🇷' },
  { key: 'contenedores',  label: 'Tipos de contenedor',  icon: '📦' },
  { key: 'camiones',      label: 'Tipos de camión',      icon: '🚛' },
  { key: 'fondos',        label: 'Fondos en custodia',   icon: '🏦' },
  { key: 'rubros_bloques',   label: 'Rubros por bloque',    icon: '⚙️' },
  { key: 'rubros_proveedor', label: 'Rubros de proveedor',  icon: '🏷️' },
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

      {/* ── RUBROS DE PROVEEDOR ── */}
      {tab === 'rubros_proveedor' && <RubrosProveedorABM />}
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
  const [guardando, setGuardando] = useState(false)
  // Set de keys "bloque-rubroId" que están activos localmente
  const [activosLocal, setActivosLocal] = useState<Set<string>>(new Set())
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [rubRes, asnRes] = await Promise.all([
      supabase.from('proveedor_rubros').select('id,nombre').order('nombre'),
      supabase.from('cotizador_bloque_rubros').select('*').eq('activo', true),
    ])
    if (rubRes.data) setRubros(rubRes.data)
    if (asnRes.data) {
      setAsignaciones(asnRes.data)
      const keys = new Set<string>(asnRes.data.map((a: any) => `${a.bloque}|${a.rubro_id}`))
      setActivosLocal(keys)
    }
    setDirty(false)
    setLoading(false)
  }

  function toggleLocal(bloque: number, rubroId: string) {
    const key = `${bloque}|${rubroId}`
    setActivosLocal(prev => {
      const next = new Set(prev)
      if (next.has(key)) { next.delete(key) } else { next.add(key) }
      return next
    })
    setDirty(true)
  }

  async function guardarCambios() {
    setSaving(true)
    // Calcular diferencias
    const existentes = new Set<string>(asignaciones.map((a: any) => `${a.bloque}|${a.rubro_id}`))
    const agregar = Array.from(activosLocal).filter(k => !existentes.has(k))
    const quitar  = Array.from(existentes).filter(k => !activosLocal.has(k))

    // Insertar nuevos
    if (agregar.length > 0) {
      const rows = agregar.map(k => {
        const sepIdx = k.indexOf('|')
        const bloqueNum = parseInt(k.substring(0, sepIdx))
        const rubroId = k.substring(sepIdx + 1)
        const bloqueNombre = BLOQUES_COTIZADOR.find(b => b.num === bloqueNum)?.label || ''
        return { bloque: bloqueNum, bloque_nombre: bloqueNombre, rubro_id: rubroId, activo: true }
      })
      await (supabase.from('cotizador_bloque_rubros') as any).insert(rows)
    }

    // Eliminar los que se quitaron
    if (quitar.length > 0) {
      for (const k of quitar) {
        const asnExistente = asignaciones.find((a: any) => `${a.bloque}|${a.rubro_id}` === k)
        if (asnExistente) {
          await supabase.from('cotizador_bloque_rubros').delete().eq('id', asnExistente.id)
        }
      }
    }

    await load()
    setSaving(false)
    setDirty(false)
  }

  function cancelarCambios() {
    // Restaurar desde asignaciones actuales
    const keys = new Set<string>(asignaciones.map((a: any) => `${a.bloque}-${a.rubro_id}`))
    setActivosLocal(keys)
    setDirty(false)
  }

  const countBloque = (num: number) =>
    Array.from(activosLocal).filter(k => k.startsWith(`${num}|`)).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-base text-gray-900">Rubros por bloque del cotizador</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Tildá los rubros que aplican a cada bloque. Los cambios se guardan con el botón "Guardar cambios".
          </p>
        </div>
        {dirty && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-amber-600 font-medium">Cambios sin guardar</span>
            <button onClick={cancelarCambios}
              className="px-3 py-1.5 border border-gray-200 rounded-xl text-xs text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
            <button onClick={guardarCambios} disabled={saving}
              className="px-4 py-1.5 bg-[#1168F8] text-white rounded-xl text-xs font-bold hover:bg-[#0a4fc4] disabled:opacity-50">
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        )}
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-[11px] text-blue-700">
        💡 Tildá los rubros que aplican a cada bloque y presioná <strong>Guardar cambios</strong>.
        Podés modificar la configuración cuando quieras volviendo a este tab.
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
            const cant = countBloque(bloque.num)
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
                    {cant} rubro(s)
                  </div>
                </div>

                {/* Grid de rubros */}
                <div className="px-5 py-4">
                  <div className="grid grid-cols-3 gap-2">
                    {rubros.map(rubro => {
                      const key = `${bloque.num}|${rubro.id}`
                      const activo = activosLocal.has(key)

                      return (
                        <button
                          key={rubro.id}
                          onClick={() => toggleLocal(bloque.num, rubro.id)}
                          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border-2 text-left transition-all text-xs font-medium cursor-pointer ${
                            activo
                              ? 'text-white'
                              : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                          style={activo
                            ? { background: bloque.color, borderColor: bloque.color }
                            : {}}
                        >
                          {/* Checkbox visual */}
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                            activo ? 'bg-white' : 'border-gray-300 bg-white'
                          }`}
                            style={activo ? { borderColor: 'white' } : {}}>
                            {activo && (
                              <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                <path d="M1 4L3.5 6.5L9 1" stroke={bloque.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </div>
                          <span className="truncate">{rubro.nombre}</span>
                        </button>
                      )
                    })}
                  </div>
                  {cant === 0 && (
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

      {/* Botón guardar también al pie si hay cambios */}
      {dirty && (
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={cancelarCambios}
            className="px-4 py-2 border border-gray-200 rounded-xl text-xs text-gray-600 hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={guardarCambios} disabled={saving}
            className="px-5 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold hover:bg-[#0a4fc4] disabled:opacity-50">
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      )}

      {/* Resumen */}
      {!loading && rubros.length > 0 && !dirty && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <div className="text-xs font-bold text-gray-700 mb-3">Configuración actual</div>
          <div className="space-y-2">
            {BLOQUES_COTIZADOR.map(bloque => {
              const rubrosDelBloque = Array.from(activosLocal)
                .filter(k => k.startsWith(`${bloque.num}|`))
                .map(k => {
                  const rubroId = k.substring(k.indexOf('|') + 1)
                  return rubros.find(r => r.id === rubroId)?.nombre
                })
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

// ── Formulario de rubro (FUERA del componente para evitar re-mount en cada keystroke) ──
const ICONOS_RUBRO = [
  { icono: '🚢', label: 'Barco' },
  { icono: '🚛', label: 'Camión' },
  { icono: '🏭', label: 'Depósito' },
  { icono: '📋', label: 'Trámite' },
  { icono: '⚓', label: 'Ancla' },
  { icono: '🛡',  label: 'Escudo' },
  { icono: '📦', label: 'Caja' },
  { icono: '✈️', label: 'Avión' },
  { icono: '🏗',  label: 'Grúa' },
  { icono: '🔧', label: 'Herramienta' },
  { icono: '📄', label: 'Documento' },
  { icono: '🏦', label: 'Banco' },
  { icono: '💼', label: 'Maletín' },
  { icono: '🌐', label: 'Global' },
  { icono: '⚖️', label: 'Balanza' },
  { icono: '🔍', label: 'Lupa' },
]

interface FormRubroProps {
  form: any
  setForm: (fn: (f: any) => any) => void
  editId: string | null
  saving: boolean
  onGuardar: () => void
  onCancelar: () => void
}

function FormRubro({ form, setForm, editId, saving, onGuardar, onCancelar }: FormRubroProps) {
  const inpCls = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white'
  return (
    <div className="bg-[#EBF2FF] border border-[#93B8FC] rounded-2xl p-5 mb-4">
      <div className="text-xs font-bold text-[#052698] mb-4">{editId ? 'Editar rubro' : 'Nuevo rubro'}</div>

      {/* Selector de ícono */}
      <div className="mb-3">
        <label className="block text-[10px] font-semibold text-gray-500 mb-2 uppercase">Ícono del rubro</label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {ICONOS_RUBRO.map(op => (
            <button key={op.icono} type="button"
              onClick={() => setForm(f => ({ ...f, icono: op.icono }))}
              title={op.label}
              className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center transition-all border-2 ${
                form.icono === op.icono
                  ? 'border-[#1168F8] bg-[#1168F8]/10 shadow-sm'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
              }`}>
              {op.icono}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-400">O escribí uno personalizado:</span>
          <input
            value={form.icono}
            onChange={e => setForm(f => ({ ...f, icono: e.target.value }))}
            className="w-16 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:border-[#1168F8] bg-white"
            placeholder="🚢"
            maxLength={4}
          />
          {form.icono && (
            <span className="text-2xl">{form.icono}</span>
          )}
        </div>
      </div>

      {/* Nombre y color */}
      <div className="grid grid-cols-4 gap-3 mb-3">
        <div className="col-span-3">
          <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Nombre del rubro *</label>
          <input
            value={form.nombre}
            onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
            className={inpCls}
            placeholder="ej. Freight Forwarder"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Color</label>
          <div className="flex gap-1.5 items-center">
            <input type="color" value={form.color || '#6b7280'}
              onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
              className="w-9 h-9 rounded-lg border border-gray-200 cursor-pointer flex-shrink-0"/>
            <input
              value={form.color || ''}
              onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
              className={inpCls}
              placeholder="#6b7280"
            />
          </div>
        </div>
      </div>

      {/* Descripción */}
      <div className="mb-4">
        <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Descripción — se muestra en la ficha del proveedor</label>
        <input
          value={form.descripcion}
          onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
          className={inpCls}
          placeholder="ej. Agentes de carga marítima internacional"
        />
      </div>

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.activo}
            onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))}
            className="w-4 h-4 rounded"/>
          <span className="text-xs text-gray-600 font-medium">Rubro activo</span>
        </label>
        <div className="flex gap-2">
          <button type="button" onClick={onCancelar}
            className="px-4 py-2 border border-gray-200 rounded-xl text-xs text-gray-600 hover:bg-gray-50 bg-white">
            Cancelar
          </button>
          <button type="button" onClick={onGuardar} disabled={saving}
            className="px-5 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold hover:bg-[#0a4fc4] disabled:opacity-50">
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── ABM de rubros de proveedores ──────────────────────────────────────────────
const RUBROS_DEFAULT = [
  { icono: '🚢', nombre: 'Freight Forwarder',       descripcion: 'Agentes de carga marítima internacional', color: '#1168F8' },
  { icono: '🚛', nombre: 'Transporte terrestre',     descripcion: 'Empresas de transporte Chile - NOA',       color: '#b45309' },
  { icono: '🏭', nombre: 'Deposito fiscal',          descripcion: 'Depósitos fiscales y almacenes en Chile',  color: '#0891b2' },
  { icono: '📋', nombre: 'Despachante de aduana',    descripcion: 'Despachantes aduaneros en Argentina',      color: '#6b21a8' },
  { icono: '⚓', nombre: 'Naviera',                  descripcion: 'Líneas navieras y agencias marítimas',     color: '#0a9e6e' },
  { icono: '🛡',  nombre: 'Seguro de carga',          descripcion: 'Aseguradoras de mercadería en tránsito',  color: '#be185d' },
  { icono: '📦', nombre: 'Otro',                     descripcion: 'Otros servicios relacionados',             color: '#6b7280' },
]

const RUBRO_VACIO = { icono: '', nombre: '', descripcion: '', color: '#6b7280', activo: true }

function RubrosProveedorABM() {
  const supabase = useMemo(() => createClient(), [])
  const [rubros, setRubros] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<any>({ ...RUBRO_VACIO })

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('proveedor_rubros').select('*').order('orden', { ascending: true })
    if (data) setRubros(data)
    setLoading(false)
  }

  async function poblarDefaults() {
    if (!confirm('¿Cargar los rubros predeterminados? Solo agrega los que no existen.')) return
    setSaving(true)
    for (let i = 0; i < RUBROS_DEFAULT.length; i++) {
      const r = RUBROS_DEFAULT[i]
      const existe = rubros.find(x => x.nombre.toLowerCase() === r.nombre.toLowerCase())
      if (!existe) {
        await (supabase.from('proveedor_rubros') as any).insert({ ...r, activo: true, orden: rubros.length + i + 1 })
      }
    }
    await load()
    setSaving(false)
  }

  function startEdit(r: any) {
    setEditId(r.id)
    setForm({ icono: r.icono || '', nombre: r.nombre || '', descripcion: r.descripcion || '', color: r.color || '#6b7280', activo: r.activo !== false })
    setShowNew(false)
  }

  function cancelForm() { setEditId(null); setShowNew(false); setForm({ ...RUBRO_VACIO }) }

  async function guardar() {
    if (!form.nombre.trim()) { alert('Ingresá el nombre del rubro'); return }
    setSaving(true)
    const payload: any = {
      icono: form.icono || null,
      nombre: form.nombre.trim(),
      descripcion: form.descripcion || null,
      color: form.color || '#6b7280',
      activo: form.activo,
    }
    if (!editId) payload.orden = rubros.length + 1
    if (editId) {
      await (supabase.from('proveedor_rubros') as any).update(payload).eq('id', editId)
    } else {
      await (supabase.from('proveedor_rubros') as any).insert(payload)
    }
    await load()
    cancelForm()
    setSaving(false)
  }

  async function toggleActivo(r: any) {
    await (supabase.from('proveedor_rubros') as any).update({ activo: !r.activo }).eq('id', r.id)
    setRubros(prev => prev.map(x => x.id === r.id ? { ...x, activo: !x.activo } : x))
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar este rubro? Verificá que no esté asignado a proveedores o bloques del cotizador.')) return
    const { error } = await supabase.from('proveedor_rubros').delete().eq('id', id)
    if (error) { alert('No se puede eliminar: ' + error.message); return }
    setRubros(prev => prev.filter(r => r.id !== id))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-base text-gray-900">Rubros de proveedores</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Determina en qué bloque del cotizador aparece cada proveedor ·{' '}
            {rubros.length} rubro(s) · {rubros.filter(r => r.activo !== false).length} activos
          </p>
        </div>
        <div className="flex gap-2">
          {rubros.length === 0 && !showNew && (
            <button onClick={poblarDefaults} disabled={saving}
              className="px-4 py-2 border border-[#1168F8] text-[#1168F8] rounded-xl text-xs font-semibold hover:bg-[#EBF2FF] disabled:opacity-50">
              {saving ? 'Cargando...' : '+ Cargar predeterminados'}
            </button>
          )}
          {!showNew && !editId && (
            <button onClick={() => { setShowNew(true); setForm({ ...RUBRO_VACIO }) }}
              className="px-4 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-semibold hover:bg-[#0a4fc4] shadow-sm">
              + Nuevo rubro
            </button>
          )}
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-[11px] text-blue-700">
        💡 Asignás estos rubros a cada proveedor en <strong>Clientes y Proveedores</strong>.
        Luego en <strong>Rubros por bloque</strong> configurás en qué bloque del cotizador aparece cada rubro.
      </div>

      {(showNew || editId) && (
        <FormRubro
          form={form}
          setForm={setForm}
          editId={editId}
          saving={saving}
          onGuardar={guardar}
          onCancelar={cancelForm}
        />
      )}

      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Cargando...</div>
        ) : rubros.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-2xl mb-2">🏷️</div>
            <div className="text-gray-500 text-sm mb-1 font-medium">Sin rubros cargados</div>
            <div className="text-gray-400 text-xs mb-4">Podés cargar los rubros predeterminados o crear uno nuevo</div>
            <button onClick={poblarDefaults} disabled={saving}
              className="px-4 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold hover:bg-[#0a4fc4] disabled:opacity-50">
              + Cargar rubros predeterminados
            </button>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['', 'Rubro', 'Descripción', 'Color', 'Estado', ''].map((h, i) => (
                  <th key={i} className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rubros.map(r => (
                <tr key={r.id} className={`border-b border-gray-50 transition-colors group ${r.activo === false ? 'opacity-40' : 'hover:bg-blue-50/20'}`}>
                  <td className="px-4 py-3 text-xl w-12">{r.icono || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold"
                      style={{ background: (r.color || '#6b7280') + '20', color: r.color || '#6b7280' }}>
                      {r.nombre}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{r.descripcion || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-md border border-gray-200 flex-shrink-0" style={{ background: r.color || '#6b7280' }}/>
                      <span className="font-mono text-[10px] text-gray-400">{r.color || '—'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleActivo(r)}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold cursor-pointer transition-all ${
                        r.activo !== false
                          ? 'bg-green-50 text-green-700 hover:bg-red-50 hover:text-red-600'
                          : 'bg-gray-100 text-gray-400 hover:bg-green-50 hover:text-green-700'
                      }`}>
                      {r.activo !== false ? 'Activo' : 'Inactivo'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => startEdit(r)}
                        className="px-3 py-1 border border-gray-200 rounded-lg text-[10px] text-gray-500 hover:bg-[#EBF2FF] hover:text-[#1168F8] hover:border-[#93B8FC] transition-all">
                        Editar
                      </button>
                      <button onClick={() => eliminar(r.id)}
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
