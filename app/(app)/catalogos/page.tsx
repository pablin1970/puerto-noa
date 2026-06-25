'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import ServiciosCatalogo from './ServiciosCatalogo'
import TributosConfig from './TributosConfig'
import TalonariosCatalogo from './TalonariosCatalogo'
import EntidadesFinancierasCatalogo from './EntidadesFinancierasCatalogo'
import SelectorBanco from './SelectorBanco'
import { cargarPermisos, puede } from '@/lib/permisos'

type Tab = 'puertos_china' | 'puertos_chile' | 'pasos' | 'ciudades' | 'contenedores' | 'camiones' | 'fondos' | 'bloques_cotizacion' | 'rubros_proveedor' | 'gastos_categorias' | 'cuentas_abm' | 'empresa' | 'condiciones_cotizacion' | 'servicios_deposito' | 'tributos' | 'talonarios' | 'entidades_financieras'

const TABS = [
  { key: 'puertos_china', label: 'Puertos China',        icon: '🇨🇳' },
  { key: 'puertos_chile', label: 'Puertos Chile',        icon: '🇨🇱' },
  { key: 'pasos',         label: 'Pasos fronterizos',    icon: '🛃' },
  { key: 'ciudades',      label: 'Ciudades Argentina',   icon: '🇦🇷' },
  { key: 'contenedores',  label: 'Tipos de contenedor',  icon: '📦' },
  { key: 'camiones',      label: 'Tipos de camión',      icon: '🚛' },
  { key: 'fondos',        label: 'Fondos en custodia',   icon: '🏦' },
  { key: 'bloques_cotizacion', label: 'Bloques cotización',   icon: '📋' },
  { key: 'rubros_proveedor',   label: 'Rubros de proveedor',  icon: '🏷️' },
  { key: 'servicios_deposito', label: 'Catálogo de servicios',   icon: '📋' },
  { key: 'condiciones_cotizacion', label: 'Condiciones cotización', icon: '📜' },
  { key: 'gastos_categorias',  label: 'Cat. gastos fijos',    icon: '💸' },
  { key: 'cuentas_abm',        label: 'Cuentas (caja y bancos)', icon: '🏦' },
  { key: 'entidades_financieras', label: 'Entidades financieras', icon: '🏛️' },
  { key: 'empresa',             label: 'Datos de la empresa',    icon: '🏢' },
  { key: 'tributos',            label: 'Tributos ARCA',          icon: '🏛️' },
  { key: 'talonarios',          label: 'Talonarios',             icon: '🧾' },
] as const

// Agrupación en árbol por categoría superior, con color por grupo
const GRUPOS = [
  { titulo:'Catálogo de servicios', icon:'📋', color:'#1168F8', claro:'#E7F0FE', texto:'#0a3d8f', keys:['rubros_proveedor','servicios_deposito'] },
  { titulo:'Cotizador',             icon:'🧾', color:'#7C3AED', claro:'#F1EBFD', texto:'#5B21B6', keys:['bloques_cotizacion','condiciones_cotizacion'] },
  { titulo:'Geografía y rutas',     icon:'📍', color:'#0a9e6e', claro:'#E3F6EF', texto:'#07614A', keys:['puertos_china','puertos_chile','pasos','ciudades'] },
  { titulo:'Logística',             icon:'🚛', color:'#ef9f27', claro:'#FDF3E2', texto:'#92610C', keys:['contenedores','camiones'] },
  { titulo:'Finanzas',              icon:'💰', color:'#0d9488', claro:'#E0F5F2', texto:'#0A5F58', keys:['fondos','cuentas_abm','entidades_financieras','gastos_categorias','tributos','talonarios'] },
  { titulo:'Empresa',               icon:'🏢', color:'#64748b', claro:'#EEF1F5', texto:'#475569', keys:['empresa'] },
] as const
const labelDe = (k:string) => TABS.find(t=>t.key===k)?.label || k

const inp = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white'
const btn = 'px-4 py-2 rounded-xl text-xs font-semibold transition-all'

// ── Componente genérico de ABM ─────────────────────────────────────
interface ColDef {
  key: string
  label: string
  type?: 'text' | 'boolean' | 'number' | 'color' | 'emoji' | 'select'
  placeholder?: string
  width?: string
  options?: { value: string; label: string }[]
}

const TIPOS_CALCULO_LABELS: Record<string,string> = {
  fijo_usd:        'Fijo USD',
  por_contenedor:  'Por contenedor',
  por_m3:          'Por m³',
  pct_cif:         '% CIF',
  fijo_ars:        'Fijo ARS',
}

function CatalogoABM({
  tabla, titulo, cols, orden, extra, modulo
}: {
  tabla: string
  titulo: string
  cols: ColDef[]
  orden: string
  extra?: React.ReactNode
  modulo: string
}) {
  const supabase = useMemo(() => createClient(), [])
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [editData, setEditData] = useState<any>({})
  const [newRow, setNewRow] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [showNew, setShowNew] = useState(false)

  const [permisos, setPermisos] = useState<Record<string, string[]>>({})
  const [permListos, setPermListos] = useState(false)
  useEffect(() => { cargarPermisos().then(p => { setPermisos(p); setPermListos(true) }) }, [])
  const pCrear = puede(permisos, modulo, 'crear')
  const pEditar = puede(permisos, modulo, 'editar')
  const pEliminar = puede(permisos, modulo, 'eliminar')

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
    if (!pEditar) return
    setEditId(row.id)
    setEditData({ ...row })
  }

  function cancelEdit() {
    setEditId(null)
    setEditData({})
  }

  async function saveEdit() {
    if (!pEditar) return
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
    if (!pEditar) return
    await (supabase.from(tabla) as any).update({ activo: !row.activo }).eq('id', row.id)
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, activo: !r.activo } : r))
  }

  async function eliminar(id: string) {
    if (!pEliminar) return
    if (!confirm('¿Eliminar este registro?')) return
    await supabase.from(tabla).delete().eq('id', id)
    setRows(prev => prev.filter(r => r.id !== id))
  }

  async function guardarNuevo() {
    if (!pCrear) return
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

  if (permListos && !puede(permisos, 'catalogos', 'ver')) {
    return (
      <div className="p-6 bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-3">🔒</div>
          <h2 className="text-lg font-bold text-gray-700">Sin acceso</h2>
          <p className="text-sm text-gray-400 mt-1">No tenés permiso para ver esta sección. Si creés que es un error, contactá al administrador.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-base text-gray-900">{titulo}</h2>
          <p className="text-xs text-gray-400 mt-0.5">{rows.length} registro(s) · {rows.filter(r => r.activo !== false).length} activos</p>
        </div>
        {pCrear && (
        <button onClick={() => { setShowNew(true); setNewRow({}) }}
          className={`${btn} bg-[#1168F8] text-white hover:bg-[#0a4fc4] shadow-sm`}>
          + Agregar
        </button>
        )}
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
                ) : c.type === 'select' ? (
                  <select value={newRow[c.key] || ''} onChange={e => setNewRow((p: any) => ({ ...p, [c.key]: e.target.value }))} className={inp}>
                    <option value="">— Elegí —</option>
                    {(c.options || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
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
                          ) : c.type === 'select' ? (
                            <select value={editData[c.key] || ''} onChange={e => setEditData((p: any) => ({ ...p, [c.key]: e.target.value }))}
                              className="px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8] bg-white">
                              <option value="">— Elegí —</option>
                              {(c.options || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
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
                          ) : c.type === 'select' ? (
                            <span className="text-gray-800">{(c.options || []).find(o => o.value === row[c.key])?.label || row[c.key]}</span>
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
  const [tab, setTab] = useState<Tab>('servicios_deposito')
  const [permisos, setPermisos] = useState<Record<string, string[]>>({})
  useEffect(() => { cargarPermisos().then(setPermisos) }, [])
  const verTributos = puede(permisos, 'tributos', 'ver')
  const grupoActivo = GRUPOS.find(g => (g.keys as readonly string[]).includes(tab)) || GRUPOS[0]

  return (
    <div className="p-6 bg-gray-50 min-h-screen lg:min-h-0 lg:h-full lg:flex lg:flex-col lg:overflow-hidden">
      {/* Header */}
      <div className="mb-6 lg:flex-shrink-0">
        <div className="text-[11px] font-bold text-[#1168F8]/60 uppercase tracking-widest mb-1">Configuración</div>
        <h1 className="text-2xl font-bold text-gray-900">Catálogos del sistema</h1>
        <p className="text-xs text-gray-400 mt-1">Administrá las listas de referencia usadas en todo el sistema</p>
      </div>

      {/* Layout en árbol: sidebar de categorías + panel de contenido */}
      <div className="grid grid-cols-1 lg:grid-cols-[224px_1fr] gap-5 items-start lg:items-stretch lg:flex-1 lg:min-h-0">
        {/* Árbol de categorías */}
        <aside className="bg-white border border-gray-100 rounded-2xl p-3 shadow-sm lg:h-full lg:overflow-y-auto scrollbar-thin">
          <div className="flex items-center gap-2 px-2 pb-3">
            <span className="text-base">📚</span>
            <span className="text-sm font-bold text-gray-800">Catálogos</span>
          </div>
          <nav className="flex flex-col gap-3">
            {GRUPOS.map(g => (
              <div key={g.titulo}>
                <div className="flex items-center gap-1.5 px-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: g.texto }}>
                  <span className="text-xs">{g.icon}</span>{g.titulo}
                </div>
                <div className="flex flex-col gap-0.5" style={{ borderLeft: `2px solid ${g.color}`, marginLeft: '7px', paddingLeft: '6px' }}>
                  {g.keys.filter(k => k !== 'tributos' || verTributos).map(k => {
                    const activo = tab === k
                    return (
                      <button key={k} onClick={() => setTab(k as Tab)}
                        className="text-left py-1.5 text-[12px] font-medium transition-colors flex items-center gap-1.5"
                        style={activo
                          ? { background: g.claro, color: g.texto, borderLeft: `3px solid ${g.color}`, marginLeft: '-8px', paddingLeft: '9px', paddingRight: '8px', borderRadius: '0 8px 8px 0' }
                          : { color: '#6b7280', paddingLeft: '9px', paddingRight: '8px' }}>
                        <span>{labelDe(k)}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        {/* Panel de contenido */}
        <div className="min-w-0 lg:h-full lg:overflow-y-auto lg:pr-1">
          {/* Encabezado con el color de la categoría activa */}
          <div className="rounded-xl px-4 py-2.5 mb-4 flex items-center gap-2 text-[12px] flex-wrap" style={{ background: grupoActivo.claro }}>
            <span className="font-semibold flex items-center gap-1.5" style={{ color: grupoActivo.texto }}><span>{grupoActivo.icon}</span>{grupoActivo.titulo}</span>
            <span style={{ color: grupoActivo.texto, opacity: 0.45 }}>›</span>
            <span style={{ color: grupoActivo.texto, opacity: 0.85 }}>{labelDe(tab)}</span>
          </div>


      {/* ── SERVICIOS DEPÓSITO ── */}
      {tab === 'servicios_deposito' && <ServiciosCatalogo />}

      {/* ── TRIBUTOS ARCA ── */}
      {tab === 'tributos' && <TributosConfig />}
      {tab === 'talonarios' && <TalonariosCatalogo />}

      {/* ── PUERTOS CHINA ── */}
      {tab === 'puertos_china' && (
        <CatalogoABM
          modulo="cat_geografia"
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
          modulo="cat_geografia"
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
          modulo="cat_geografia"
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
          modulo="cat_geografia"
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
          modulo="cat_logistica"
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
          modulo="cat_logistica"
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
      {tab === 'bloques_cotizacion' && <BloquesCotizacionABM />}
      {tab === 'gastos_categorias' && <GastosCatABM />}
      {tab === 'cuentas_abm' && <CuentasABM />}
      {tab === 'entidades_financieras' && <EntidadesFinancierasCatalogo />}
      {tab === 'empresa' && <EmpresaABM />}

      {/* ── RUBROS DE PROVEEDOR ── */}
      {tab === 'rubros_proveedor' && <RubrosProveedorABM />}

      {/* ── CONDICIONES DE COTIZACIÓN ── */}
      {tab === 'condiciones_cotizacion' && <CondicionesCotizacionABM />}
        </div>
      </div>
    </div>
  )
}

// ── ABM especializado para cuentas de fondos en custodia ───────
function FondosCuentasABM() {
  const [permisos, setPermisos] = useState<Record<string, string[]>>({})
  useEffect(() => { cargarPermisos().then(setPermisos) }, [])
  const pCrear = puede(permisos, 'cat_finanzas', 'crear')
  const pEditar = puede(permisos, 'cat_finanzas', 'editar')
  const pEliminar = puede(permisos, 'cat_finanzas', 'eliminar')
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
    if (!pEditar) return
    setEditId(c.id)
    setForm({ ...c })
    setShowNew(false)
  }

  function cancelEdit() { setEditId(null); setForm({ ...vacio }) }

  async function guardar() {
    if (editId ? !pEditar : !pCrear) return
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
    if (!pEditar) return
    await (supabase.from('fondos_cuentas') as any).update({ activo: !c.activo }).eq('id', c.id)
    setCuentas(prev => prev.map(x => x.id === c.id ? { ...x, activo: !x.activo } : x))
  }

  async function eliminar(id: string) {
    if (!pEliminar) return
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
              <SelectorBanco pais={form.pais} value={form.banco || ''} onChange={(n) => setForm((f: any) => ({ ...f, banco: n }))} className={inp} />
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
        {!showNew && !editId && pCrear && (
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


// ── ABM Categorías de Gastos Fijos ────────────────────────────────

// ── ABM Cuentas bancarias (propias PN + custodia terceros) ───────
function CuentasABM() {
  const [permisos, setPermisos] = useState<Record<string, string[]>>({})
  useEffect(() => { cargarPermisos().then(setPermisos) }, [])
  const pCrear = puede(permisos, 'cat_finanzas', 'crear')
  const pEditar = puede(permisos, 'cat_finanzas', 'editar')
  const pEliminar = puede(permisos, 'cat_finanzas', 'eliminar')
  const supabase = useMemo(() => createClient(), [])
  const [propias, setPropias] = useState<any[]>([])
  const [custodia, setCustodia] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string|null>(null)
  const [editTipo, setEditTipo] = useState<'propia'|'custodia'>('propia')
  const [editData, setEditData] = useState<any>({})
  const [showNew, setShowNew] = useState(false)
  const [tipoCuenta, setTipoCuenta] = useState<'propia'|'custodia'>('propia')
  const [newData, setNewData] = useState<any>({ nombre:'', tipo:'banco', pais:'CL', moneda:'CLP', banco:'', nro_cuenta:'', titular:'', notas:'' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [pRes, cRes] = await Promise.all([
      (supabase.from('cuentas_pn') as any).select('*').order('pais').order('moneda'),
      (supabase.from('fondos_cuentas') as any).select('*').order('pais').order('nombre'),
    ])
    if (pRes.data) setPropias(pRes.data)
    if (cRes.data) setCustodia(cRes.data)
    setLoading(false)
  }

  async function saveNew() {
    if (!pCrear) return
    if (!newData.nombre || !newData.moneda) { alert('Nombre y moneda son obligatorios'); return }
    setSaving(true)
    if (tipoCuenta === 'propia') {
      await (supabase.from('cuentas_pn') as any).insert({
        nombre: newData.nombre, tipo: newData.tipo||'banco',
        pais: newData.pais, moneda: newData.moneda,
        banco: newData.banco||null, nro_cuenta: newData.nro_cuenta||null,
        notas: newData.notas||null, saldo_inicial: 0, saldo_actual: 0, activo: true,
      })
    } else {
      await (supabase.from('fondos_cuentas') as any).insert({
        nombre: newData.nombre, tipo: newData.tipo||'banco',
        pais: newData.pais, moneda: newData.moneda,
        banco: newData.banco||null, nro_cuenta: newData.nro_cuenta||null,
        titular: newData.titular||null, notas: newData.notas||null, activo: true,
      })
    }
    setShowNew(false)
    setNewData({ nombre:'', tipo:'banco', pais:'CL', moneda:'CLP', banco:'', nro_cuenta:'', titular:'', notas:'' })
    await load()
    setSaving(false)
  }

  async function saveEdit() {
    if (!pEditar) return
    setSaving(true)
    const tabla = editTipo === 'propia' ? 'cuentas_pn' : 'fondos_cuentas'
    await (supabase.from(tabla) as any).update({
      nombre: editData.nombre, tipo: editData.tipo,
      pais: editData.pais, moneda: editData.moneda,
      banco: editData.banco||null, nro_cuenta: editData.nro_cuenta||null,
      titular: editData.titular||null, notas: editData.notas||null,
    }).eq('id', editId)
    setEditId(null)
    await load()
    setSaving(false)
  }

  async function toggleActivo(id: string, tipo: 'propia'|'custodia', activo: boolean) {
    if (!pEditar) return
    const tabla = tipo === 'propia' ? 'cuentas_pn' : 'fondos_cuentas'
    await (supabase.from(tabla) as any).update({ activo: !activo }).eq('id', id)
    await load()
  }

  async function eliminar(id: string, tipo: 'propia'|'custodia') {
    if (!pEliminar) return
    if (!confirm('¿Eliminar esta cuenta? Solo si no tiene movimientos asociados.')) return
    const tabla = tipo === 'propia' ? 'cuentas_pn' : 'fondos_cuentas'
    await (supabase.from(tabla) as any).delete().eq('id', id)
    await load()
  }

  const inp2 = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white'

  function FormCuenta({ data, setData, onSave, onCancel }: any) {
    return (
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Nombre *</label>
          <input value={data.nombre||''} onChange={e => setData((p:any)=>({...p,nombre:e.target.value}))} className={inp2} placeholder="ej. Banco Itaú CLP Chile"/>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Tipo</label>
          <select value={data.tipo||'banco'} onChange={e => setData((p:any)=>({...p,tipo:e.target.value, banco: e.target.value==='caja' ? '' : p.banco, nro_cuenta: e.target.value==='caja' ? '' : p.nro_cuenta}))} className={inp2}>
            <option value="banco">Banco</option>
            <option value="caja">Caja / efectivo</option>
            <option value="inversion">Inversión (fondos / custodia)</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">País</label>
          <select value={data.pais||'CL'} onChange={e => setData((p:any)=>({...p,pais:e.target.value}))} className={inp2}>
            <option value="CL">🇨🇱 Chile</option>
            <option value="AR">🇦🇷 Argentina</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Moneda</label>
          <select value={data.moneda||'CLP'} onChange={e => setData((p:any)=>({...p,moneda:e.target.value}))} className={inp2}>
            <option value="CLP">CLP — Peso chileno</option>
            <option value="ARS">ARS — Peso argentino</option>
            <option value="USD">USD — Dólar</option>
          </select>
        </div>
        {(data.tipo||'banco') !== 'caja' && (
        <>
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">{data.tipo === 'inversion' ? 'ALyC / Agente (custodia)' : 'Banco / Entidad'}</label>
          <SelectorBanco pais={data.pais} value={data.banco||''} onChange={(n)=>setData((p:any)=>({...p,banco:n}))} className={inp2} />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">{data.tipo === 'inversion' ? 'N° de cuenta comitente / custodia' : 'N° Cuenta / CBU / IBAN'}</label>
          <input value={data.nro_cuenta||''} onChange={e => setData((p:any)=>({...p,nro_cuenta:e.target.value}))} className={inp2} placeholder={data.tipo === 'inversion' ? 'Número de cuenta comitente' : 'Número de cuenta'}/>
        </div>
        </>
        )}
        <div className="col-span-2">
          <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Titular (para cuentas de custodia)</label>
          <input value={data.titular||''} onChange={e => setData((p:any)=>({...p,titular:e.target.value}))} className={inp2} placeholder="Nombre del titular"/>
        </div>
        <div className="col-span-2">
          <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Notas</label>
          <input value={data.notas||''} onChange={e => setData((p:any)=>({...p,notas:e.target.value}))} className={inp2} placeholder="Observaciones"/>
        </div>
        <div className="col-span-2 flex justify-end gap-2 mt-1">
          <button onClick={onCancel} className="px-4 py-2 border border-gray-200 rounded-xl text-xs hover:bg-gray-50">Cancelar</button>
          <button onClick={onSave} disabled={saving} className="px-5 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold disabled:opacity-50">
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    )
  }

  function RowCuenta({ row, tipo }: { row: any, tipo: 'propia'|'custodia' }) {
    const paisFlag = row.pais === 'CL' ? '🇨🇱' : row.pais === 'AR' ? '🇦🇷' : '🌐'
    return editId === row.id ? (
      <div className="p-4 bg-white border border-[#1168F8] rounded-2xl mb-2">
        <FormCuenta data={editData} setData={setEditData} onSave={saveEdit} onCancel={() => setEditId(null)} />
      </div>
    ) : (
      <div className={`bg-white border border-gray-100 rounded-2xl px-4 py-3 mb-2 shadow-sm flex items-center gap-3 ${!row.activo?'opacity-50':''}`}>
        <div className="text-xl flex-shrink-0">{paisFlag}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-gray-900">{row.nombre}</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${row.moneda==='CLP'?'bg-blue-50 text-blue-700':row.moneda==='ARS'?'bg-sky-50 text-sky-700':'bg-green-50 text-green-700'}`}>{row.moneda}</span>
            <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-[10px]">{row.tipo}</span>
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5 flex gap-3">
            {row.banco && <span>{row.banco}</span>}
            {row.nro_cuenta && <span className="font-mono">{row.nro_cuenta}</span>}
            {row.titular && <span>Titular: {row.titular}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => toggleActivo(row.id, tipo, row.activo)}
            className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border ${row.activo?'bg-green-50 text-green-700 border-green-200':'bg-gray-100 text-gray-400 border-gray-200'}`}>
            {row.activo ? 'Activa' : 'Inactiva'}
          </button>
          <button onClick={() => { setEditId(row.id); setEditTipo(tipo); setEditData({...row}) }}
            className="px-3 py-1.5 border border-gray-200 rounded-xl text-xs text-gray-600 hover:border-[#1168F8] hover:text-[#1168F8]">Editar</button>
          <button onClick={() => eliminar(row.id, tipo)}
            className="px-3 py-1.5 border border-red-100 rounded-xl text-xs text-red-500 hover:bg-red-50">Eliminar</button>
        </div>
      </div>
    )
  }

  if (loading) return <div className="p-8 text-center text-gray-400 text-sm">Cargando...</div>

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-bold text-base text-gray-900">Cuentas (caja y bancos)</h2>
          <p className="text-xs text-gray-400 mt-0.5">Cuentas propias de Puerto NOA y cuentas de custodia de clientes</p>
        </div>
        {pCrear && <button onClick={() => setShowNew(true)} className="px-4 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold hover:bg-[#0a4fc4]">+ Nueva cuenta</button>}
      </div>

      {showNew && (
        <div className="bg-[#EBF2FF] border border-[#93B8FC] rounded-2xl p-4 mb-4">
          <div className="flex gap-3 mb-4">
            <h3 className="font-bold text-sm text-gray-900 mr-2">Nueva cuenta —</h3>
            {[['propia','Propia Puerto NOA'],['custodia','Custodia de cliente']].map(([k,l]) => (
              <button key={k} onClick={() => setTipoCuenta(k as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border-2 transition-all ${tipoCuenta===k?'border-[#1168F8] bg-[#1168F8] text-white':'border-gray-200 text-gray-600'}`}>
                {l}
              </button>
            ))}
          </div>
          <FormCuenta data={newData} setData={setNewData} onSave={saveNew} onCancel={() => setShowNew(false)} />
        </div>
      )}

      {/* Cuentas propias PN — agrupadas por subtipo */}
      <div className="mb-4">
        <div className="text-[10px] font-semibold text-gray-400 uppercase mb-3 flex items-center gap-2">
          <span>Cuentas propias Puerto NOA</span>
          <span className="px-2 py-0.5 bg-[#EBF2FF] text-[#052698] rounded-full font-bold">{propias.length}</span>
        </div>
        {propias.length === 0 ? <div className="text-xs text-gray-400 py-3">Sin cuentas propias registradas</div> : (
          <>
            {(['banco','caja','inversion'] as const).map(subtipo => {
              const grupo = propias.filter(r => r.tipo === subtipo)
              if (grupo.length === 0) return null
              const labels: Record<string,string> = { banco:'🏛 Cuentas bancarias', caja:'💵 Cajas / efectivo', inversion:'📈 Inversiones' }
              return (
                <div key={subtipo} className="mb-3">
                  <div className="text-[10px] font-semibold text-gray-500 mb-1.5 pl-1">{labels[subtipo]}</div>
                  {grupo.map(r => <RowCuenta key={r.id} row={r} tipo="propia" />)}
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* Cuentas custodia — agrupadas por subtipo */}
      <div>
        <div className="text-[10px] font-semibold text-gray-400 uppercase mb-3 flex items-center gap-2">
          <span>Cuentas de custodia (clientes)</span>
          <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full font-bold">{custodia.length}</span>
        </div>
        {custodia.length === 0 ? <div className="text-xs text-gray-400 py-3">Sin cuentas de custodia registradas</div> : (
          <>
            {(['banco','caja','inversion'] as const).map(subtipo => {
              const grupo = custodia.filter(r => r.tipo === subtipo)
              if (grupo.length === 0) return null
              const labels: Record<string,string> = { banco:'🏛 Cuentas bancarias', caja:'💵 Cajas / efectivo', inversion:'📈 Inversiones' }
              return (
                <div key={subtipo} className="mb-3">
                  <div className="text-[10px] font-semibold text-gray-500 mb-1.5 pl-1">{labels[subtipo]}</div>
                  {grupo.map(r => <RowCuenta key={r.id} row={r} tipo="custodia" />)}
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}

function GastosCatABM() {
  const [permisos, setPermisos] = useState<Record<string, string[]>>({})
  useEffect(() => { cargarPermisos().then(setPermisos) }, [])
  const pCrear = puede(permisos, 'cat_finanzas', 'crear')
  const pEditar = puede(permisos, 'cat_finanzas', 'editar')
  const pEliminar = puede(permisos, 'cat_finanzas', 'eliminar')
  const supabase = useMemo(() => createClient(), [])
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string|null>(null)
  const [editData, setEditData] = useState<any>({})
  const [showNew, setShowNew] = useState(false)
  const [newData, setNewData] = useState({ nombre:'', codigo:'', orden:0 })
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await (supabase.from('gastos_fijos_categorias') as any).select('*').order('orden', { ascending: true })
    if (data) setRows(data)
    setLoading(false)
  }

  async function saveEdit() {
    if (!pEditar) return
    setSaving(true)
    await (supabase.from('gastos_fijos_categorias') as any).update({
      nombre: editData.nombre,
      codigo: editData.codigo,
      orden: editData.orden || 0,
    }).eq('id', editId)
    setEditId(null)
    await load()
    setSaving(false)
  }

  async function saveNew() {
    if (!pCrear) return
    if (!newData.nombre || !newData.codigo) { alert('Nombre y código son obligatorios'); return }
    setSaving(true)
    await (supabase.from('gastos_fijos_categorias') as any).insert({
      nombre: newData.nombre,
      codigo: newData.codigo.toLowerCase().replace(/ /g,'_'),
      orden: newData.orden || rows.length + 1,
      activo: true,
    })
    setShowNew(false)
    setNewData({ nombre:'', codigo:'', orden:0 })
    await load()
    setSaving(false)
  }

  async function toggleActivo(row: any) {
    if (!pEditar) return
    await (supabase.from('gastos_fijos_categorias') as any).update({ activo: !row.activo }).eq('id', row.id)
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, activo: !r.activo } : r))
  }

  async function eliminar(id: string) {
    if (!pEliminar) return
    if (!confirm('¿Eliminar esta categoría? Solo si no tiene gastos asociados.')) return
    await (supabase.from('gastos_fijos_categorias') as any).delete().eq('id', id)
    setRows(prev => prev.filter(r => r.id !== id))
  }

  if (loading) return <div className="p-8 text-center text-gray-400 text-sm">Cargando...</div>

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-bold text-base text-gray-900">Categorías de gastos fijos</h2>
          <p className="text-xs text-gray-400 mt-0.5">Se usan en el módulo Gastos y costos de Puerto NOA</p>
        </div>
        {pCrear && <button onClick={() => setShowNew(true)} className="px-4 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold hover:bg-[#0a4fc4]">+ Nueva categoría</button>}
      </div>

      {showNew && (
        <div className="bg-[#EBF2FF] border border-[#93B8FC] rounded-2xl p-4 mb-4">
          <h3 className="font-bold text-sm text-gray-900 mb-3">Nueva categoría</h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Nombre *</label>
              <input value={newData.nombre} onChange={e => setNewData(p => ({...p, nombre: e.target.value}))}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white" placeholder="ej. Seguros"/>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Código *</label>
              <input value={newData.codigo} onChange={e => setNewData(p => ({...p, codigo: e.target.value.toLowerCase().replace(/ /g,'_')}))}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white font-mono" placeholder="ej. seguros"/>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Orden</label>
              <input type="number" value={newData.orden} onChange={e => setNewData(p => ({...p, orden: Number(e.target.value)}))}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white"/>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button onClick={() => setShowNew(false)} className="px-4 py-2 border border-gray-200 rounded-xl text-xs hover:bg-gray-50">Cancelar</button>
            <button onClick={saveNew} disabled={saving} className="px-5 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold disabled:opacity-50">
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

      {rows.map(row => (
        <div key={row.id} className={`bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm ${!row.activo?'opacity-50':''}`}>
          {editId === row.id ? (
            <div className="p-4">
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="col-span-1">
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Nombre</label>
                  <input value={editData.nombre||''} onChange={e => setEditData((p:any) => ({...p, nombre: e.target.value}))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white"/>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Código</label>
                  <input value={editData.codigo||''} onChange={e => setEditData((p:any) => ({...p, codigo: e.target.value}))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white font-mono"/>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Orden</label>
                  <input type="number" value={editData.orden||0} onChange={e => setEditData((p:any) => ({...p, orden: Number(e.target.value)}))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white"/>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setEditId(null)} className="px-4 py-2 border border-gray-200 rounded-xl text-xs hover:bg-gray-50">Cancelar</button>
                <button onClick={saveEdit} disabled={saving} className="px-5 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold disabled:opacity-50">
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-900">{row.nombre}</span>
                  <span className="text-[10px] text-gray-400 font-mono">{row.codigo}</span>
                  <span className="text-[10px] text-gray-300">· orden {row.orden}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => toggleActivo(row)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border ${row.activo?'bg-green-50 text-green-700 border-green-200':'bg-gray-100 text-gray-400 border-gray-200'}`}>
                  {row.activo ? 'Activo' : 'Inactivo'}
                </button>
                <button onClick={() => { setEditId(row.id); setEditData({...row}) }}
                  className="px-3 py-1.5 border border-gray-200 rounded-xl text-xs text-gray-600 hover:border-[#1168F8] hover:text-[#1168F8]">Editar</button>
                <button onClick={() => eliminar(row.id)}
                  className="px-3 py-1.5 border border-red-100 rounded-xl text-xs text-red-500 hover:bg-red-50">Eliminar</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function BloquesCotizacionABM() {
  const [permisos, setPermisos] = useState<Record<string, string[]>>({})
  useEffect(() => { cargarPermisos().then(setPermisos) }, [])
  const pCrear = puede(permisos, 'cat_cotizador', 'crear')
  const pEditar = puede(permisos, 'cat_cotizador', 'editar')
  const pEliminar = puede(permisos, 'cat_cotizador', 'eliminar')
  const supabase = createClient()
  const [bloques, setBloques] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string|null>(null)
  const [form, setForm] = useState({numero:'',nombre:'',descripcion:''})
  const [saving, setSaving] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [newForm, setNewForm] = useState({numero:'',nombre:'',descripcion:''})

  useEffect(()=>{ load() },[])

  async function load(){
    setLoading(true)
    const {data}=await supabase.from('cotizador_bloques').select('*').order('numero')
    if(data) setBloques(data)
    setLoading(false)
  }

  async function guardar(id:string){
    if (!pEditar) return
    setSaving(true)
    await (supabase.from('cotizador_bloques') as any).update({
      numero: parseInt(form.numero)||0,
      nombre: form.nombre,
      descripcion: form.descripcion||null,
    }).eq('id',id)
    await load()
    setEditId(null)
    setSaving(false)
  }

  async function agregar(){
    if (!pCrear) return
    if(!newForm.nombre.trim()||!newForm.numero) return
    setSaving(true)
    await (supabase.from('cotizador_bloques') as any).insert({
      numero: parseInt(newForm.numero)||0,
      nombre: newForm.nombre,
      descripcion: newForm.descripcion||null,
      activo: true,
    })
    await load()
    setNewForm({numero:'',nombre:'',descripcion:''})
    setShowNew(false)
    setSaving(false)
  }

  async function toggleActivo(id:string, activo:boolean){
    if (!pEditar) return
    await (supabase.from('cotizador_bloques') as any).update({activo:!activo}).eq('id',id)
    setBloques(prev=>prev.map(b=>b.id===id?{...b,activo:!activo}:b))
  }

  async function eliminar(id:string){
    if (!pEliminar) return
    if(!confirm('¿Eliminar este bloque? Las cotizaciones vinculadas perderán su bloque asignado.')) return
    await supabase.from('cotizador_bloques').delete().eq('id',id)
    setBloques(prev=>prev.filter(b=>b.id!==id))
  }

  if(loading) return <div className="p-8 text-center text-gray-400 text-sm">Cargando...</div>

  return (
    <div className="max-w-2xl space-y-3">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-sm font-semibold text-gray-700">Bloques de cotización</div>
          <div className="text-[11px] text-gray-400 mt-0.5">Corresponden a los bloques de la hoja de logística. Se usan para clasificar cotizaciones de proveedores.</div>
        </div>
        {pCrear && (
        <button onClick={()=>setShowNew(true)}
          className="px-4 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold hover:bg-[#0a4fc4]">
          + Agregar bloque
        </button>
        )}
      </div>

      {/* Formulario nuevo */}
      {showNew&&(
        <div className="bg-[#EBF2FF] border border-[#93B8FC] rounded-2xl p-4">
          <div className="text-xs font-bold text-[#052698] mb-3">Nuevo bloque</div>
          <div className="grid grid-cols-4 gap-2 mb-2">
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">N° bloque</label>
              <input type="number" value={newForm.numero} onChange={e=>setNewForm(p=>({...p,numero:e.target.value}))}
                className={inp} placeholder="5"/>
            </div>
            <div className="col-span-3">
              <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Nombre *</label>
              <input value={newForm.nombre} onChange={e=>setNewForm(p=>({...p,nombre:e.target.value}))}
                className={inp} placeholder="ej. Bloque 5 — Depósito fiscal"/>
            </div>
          </div>
          <div className="mb-3">
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Descripción</label>
            <input value={newForm.descripcion} onChange={e=>setNewForm(p=>({...p,descripcion:e.target.value}))}
              className={inp} placeholder="Descripción breve del bloque"/>
          </div>
          <div className="flex gap-2">
            <button onClick={()=>{setShowNew(false);setNewForm({numero:'',nombre:'',descripcion:''})}}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-500 hover:bg-gray-50">Cancelar</button>
            <button onClick={agregar} disabled={saving||!newForm.nombre.trim()||!newForm.numero}
              className="px-4 py-1.5 bg-[#1168F8] text-white rounded-lg text-xs font-bold disabled:opacity-40">
              {saving?'Guardando...':'Guardar'}
            </button>
          </div>
        </div>
      )}

      {/* Lista de bloques */}
      {bloques.map(b=>(
        <div key={b.id} className={`bg-white border rounded-2xl p-4 shadow-sm transition-all ${!b.activo?'opacity-50':''}`}>
          {editId===b.id ? (
            <div>
              <div className="grid grid-cols-4 gap-2 mb-2">
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">N° bloque</label>
                  <input type="number" value={form.numero} onChange={e=>setForm(p=>({...p,numero:e.target.value}))}
                    className={inp}/>
                </div>
                <div className="col-span-3">
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Nombre</label>
                  <input value={form.nombre} onChange={e=>setForm(p=>({...p,nombre:e.target.value}))}
                    className={inp}/>
                </div>
              </div>
              <div className="mb-3">
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Descripción</label>
                <input value={form.descripcion} onChange={e=>setForm(p=>({...p,descripcion:e.target.value}))}
                  className={inp}/>
              </div>
              <div className="flex gap-2">
                <button onClick={()=>setEditId(null)}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-500 hover:bg-gray-50">Cancelar</button>
                <button onClick={()=>guardar(b.id)} disabled={saving}
                  className="px-4 py-1.5 bg-[#1168F8] text-white rounded-lg text-xs font-bold disabled:opacity-40">
                  {saving?'Guardando...':'Guardar'}
                </button>
              </div>
            </div>
          ):(
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-[#EBF2FF] flex items-center justify-center text-[#052698] text-sm font-black flex-shrink-0">
                {b.numero}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-gray-900">{b.nombre}</div>
                {b.descripcion&&<div className="text-[11px] text-gray-400 mt-0.5">{b.descripcion}</div>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={()=>toggleActivo(b.id,b.activo)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-all ${b.activo?'bg-green-50 text-green-700 border-green-200':'bg-gray-100 text-gray-400 border-gray-200'}`}>
                  {b.activo?'Activo':'Inactivo'}
                </button>
                <button onClick={()=>{setEditId(b.id);setForm({numero:String(b.numero),nombre:b.nombre,descripcion:b.descripcion||''})}}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:border-[#1168F8] hover:text-[#1168F8] transition-all">
                  Editar
                </button>
                <button onClick={()=>eliminar(b.id)}
                  className="px-3 py-1.5 border border-red-100 rounded-lg text-xs text-red-400 hover:bg-red-50 transition-all">
                  Eliminar
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {bloques.length===0&&!showNew&&(
        <div className="text-center py-8 text-gray-400 text-sm">Sin bloques configurados.</div>
      )}
    </div>
  )
}


const RUBRO_VACIO = { nombre: '', codigo: '', descripcion: '', icono: '', color: '#6b7280', tiene_lugares_prestacion: false }

const ICONOS_RUBRO = ['🚢','🚛','🏭','📋','🛡','⚓','🏦','🏷️','·','📦','🔧','💼']

function FormRubro({ form, setForm, editId, saving, onGuardar, onCancelar }: any) {
  const inp2 = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white'
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm mb-4">
      <div className="text-sm font-bold text-gray-900 mb-4">{editId ? 'Editar rubro' : 'Nuevo rubro'}</div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Nombre *</label>
          <input value={form.nombre} onChange={e => setForm((f: any) => ({ ...f, nombre: e.target.value }))}
            className={inp2} placeholder="ej. Freight Forwarder" />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Código</label>
          <input value={form.codigo} onChange={e => setForm((f: any) => ({ ...f, codigo: e.target.value }))}
            className={inp2} placeholder="ej. forwarder" />
        </div>
        <div className="col-span-2">
          <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Descripción</label>
          <input value={form.descripcion} onChange={e => setForm((f: any) => ({ ...f, descripcion: e.target.value }))}
            className={inp2} placeholder="Descripción breve" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 mb-2 uppercase">Ícono</label>
          <div className="flex gap-1.5 flex-wrap">
            {ICONOS_RUBRO.map(ic => (
              <button key={ic} onClick={() => setForm((f: any) => ({ ...f, icono: ic }))}
                className={`w-8 h-8 rounded-lg border-2 text-base flex items-center justify-center transition-all ${form.icono === ic ? 'border-[#1168F8] bg-[#EBF2FF]' : 'border-gray-200 hover:border-gray-300'}`}>
                {ic}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 mb-2 uppercase">Color</label>
          <div className="flex items-center gap-2">
            <input type="color" value={form.color || '#6b7280'}
              onChange={e => setForm((f: any) => ({ ...f, color: e.target.value }))}
              className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5 bg-white" />
            <input value={form.color} onChange={e => setForm((f: any) => ({ ...f, color: e.target.value }))}
              className="flex-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-mono focus:outline-none focus:border-[#1168F8]"
              placeholder="#6b7280" />
            <div className="w-8 h-8 rounded-lg border border-gray-200 flex-shrink-0"
              style={{ background: form.color || '#6b7280' }} />
          </div>
        </div>
      </div>
      <div className="mb-4 flex items-center gap-2.5 p-3 rounded-xl bg-gray-50 border border-gray-100">
        <button type="button" onClick={() => setForm((f: any) => ({ ...f, tiene_lugares_prestacion: !f.tiene_lugares_prestacion }))}
          className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${form.tiene_lugares_prestacion ? 'bg-[#1168F8]' : 'bg-gray-300'}`}>
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${form.tiene_lugares_prestacion ? 'left-[18px]' : 'left-0.5'}`} />
        </button>
        <div>
          <div className="text-xs font-semibold text-gray-700">Maneja lugares de prestación</div>
          <div className="text-[10px] text-gray-400">Si está activo, al cargar un proveedor de este rubro podrás indicar en qué ciudades/puertos presta (ej. agente, despachante, depósito fiscal).</div>
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <button onClick={onCancelar}
          className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold hover:bg-gray-50">Cancelar</button>
        <button onClick={onGuardar} disabled={saving || !form.nombre}
          className="px-5 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold hover:bg-[#0a4fc4] disabled:opacity-50">
          {saving ? 'Guardando...' : editId ? 'Guardar cambios' : 'Crear rubro'}
        </button>
      </div>
    </div>
  )
}

const RUBROS_DEFAULT = [
  { nombre: 'Freight Forwarder',    codigo: 'forwarder',            icono: '🚢', color: '#1168F8', descripcion: 'Flete marítimo, handling, gastos naviero' },
  { nombre: 'Agente',               codigo: 'agente',     icono: '🏭', color: '#0a9e6e', descripcion: 'Transporte Chile-NOA' },
  { nombre: 'Transporte terrestre', codigo: 'transporte_terrestre', icono: '🚛', color: '#b45309', descripcion: 'Flete terrestre Argentina' },
  { nombre: 'Despachante de aduana',codigo: 'despachante',     icono: '📋', color: '#6b21a8', descripcion: 'Honorarios y gastos de despacho' },
  { nombre: 'Deposito fiscal',      codigo: 'deposito',             icono: '🏭', color: '#0891b2', descripcion: 'Almacenaje en depósito fiscal' },
  { nombre: 'Naviera',              codigo: 'naviera',              icono: '⚓', color: '#0e7490', descripcion: 'Línea naviera' },
  { nombre: 'Seguro de carga',      codigo: 'seguro',               icono: '🛡', color: '#15803d', descripcion: 'Seguro de mercadería' },
  { nombre: 'Otro',                 codigo: 'otro',                 icono: '·',  color: '#6b7280', descripcion: 'Otro proveedor de servicios' },
]

function RubrosProveedorABM() {
  const [permisos, setPermisos] = useState<Record<string, string[]>>({})
  useEffect(() => { cargarPermisos().then(setPermisos) }, [])
  const pCrear = puede(permisos, 'cat_servicios', 'crear')
  const pEditar = puede(permisos, 'cat_servicios', 'editar')
  const pEliminar = puede(permisos, 'cat_servicios', 'eliminar')
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
    if (!pEditar) return
    setEditId(r.id)
    setForm({ icono: r.icono || '', nombre: r.nombre || '', codigo: r.codigo || '', descripcion: r.descripcion || '', color: r.color || '#6b7280', activo: r.activo !== false, tiene_lugares_prestacion: r.tiene_lugares_prestacion === true })
    setShowNew(false)
  }

  function cancelForm() { setEditId(null); setShowNew(false); setForm({ ...RUBRO_VACIO }) }

  async function guardar() {
    if (editId ? !pEditar : !pCrear) return
    if (!form.nombre.trim()) { alert('Ingresá el nombre del rubro'); return }
    setSaving(true)
    const payload: any = {
      icono: form.icono || null,
      nombre: form.nombre.trim(),
      descripcion: form.descripcion || null,
      color: form.color || '#6b7280',
      activo: form.activo,
      tiene_lugares_prestacion: !!form.tiene_lugares_prestacion,
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
    if (!pEditar) return
    await (supabase.from('proveedor_rubros') as any).update({ activo: !r.activo }).eq('id', r.id)
    setRubros(prev => prev.map(x => x.id === r.id ? { ...x, activo: !x.activo } : x))
  }

  async function eliminar(id: string) {
    if (!pEliminar) return
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
          {!showNew && !editId && pCrear && (
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
                {['', 'Rubro', 'Descripción', 'Color', 'Lugares', 'Estado', ''].map((h, i) => (
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
                    {r.tiene_lugares_prestacion
                      ? <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#EBF2FF] text-[#1168F8]" title="Maneja lugares de prestación">📍 Sí</span>
                      : <span className="text-gray-300 text-[11px]">—</span>}
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

// ── Ficha empresa Puerto NOA SpA ──────────────────────────────
function EmpresaABM() {
  const [permisos, setPermisos] = useState<Record<string, string[]>>({})
  useEffect(() => { cargarPermisos().then(setPermisos) }, [])
  const pEditar = puede(permisos, 'cat_empresa', 'editar')
  const supabase = useMemo(() => createClient(), [])
  const [data, setData] = useState<any>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState<any>({})

  const inp2 = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white'

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: d } = await (supabase.from('empresa_config') as any).select('*').limit(1).single()
    if (d) { setData(d); setForm(d) }
    setLoading(false)
  }

  async function save() {
    if (!pEditar) return
    setSaving(true)
    // Excluir campos de sistema del update
    const { id: _id, created_at: _ca, updated_at: _ua, ...payload } = form
    if (data.id) {
      const { error } = await (supabase.from('empresa_config') as any)
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', data.id)
      if (error) { alert('Error al guardar: ' + error.message); setSaving(false); return }
    } else {
      const { error } = await (supabase.from('empresa_config') as any).insert(payload)
      if (error) { alert('Error al guardar: ' + error.message); setSaving(false); return }
    }
    await load()
    setEditando(false)
    setSaving(false)
  }

  const setF = (k: string, v: string) => setForm((p: any) => ({...p, [k]: v}))

  const REGIMENES = [
    'Pro Pyme General',
    'Pro Pyme Transparente',
    'Régimen General Semi Integrado',
    'Microempresa Familiar',
  ]

  if (loading) return <div className="p-8 text-center text-gray-400 text-sm">Cargando...</div>

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="font-bold text-base text-gray-900">Datos de la empresa</h2>
          <p className="text-xs text-gray-400 mt-0.5">Se usan en facturas, Libro IVA y declaraciones SII</p>
        </div>
        {!editando && (
          <button onClick={() => setEditando(true)}
            className="px-4 py-2 border border-[#1168F8] text-[#1168F8] rounded-xl text-xs font-bold hover:bg-[#EBF2FF]">
            Editar
          </button>
        )}
      </div>

      {!editando ? (
        /* Vista */
        <div className="space-y-4">
          {/* Identificación */}
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
            <div className="text-[10px] font-semibold text-gray-400 uppercase mb-4">Identificación legal</div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label:'Razón social', val: data.razon_social },
                { label:'RUT Chile', val: data.rut },
                { label:'Giro SII', val: data.giro },
                { label:'Régimen tributario', val: data.regimen_tributario },
                { label:'Año fiscal inicio', val: data.anio_fiscal_inicio ? `${data.anio_fiscal_inicio}° mes` : '—' },
                { label:'Año fiscal fin', val: data.anio_fiscal_fin ? `${data.anio_fiscal_fin}° mes` : '—' },
              ].map(r => (
                <div key={r.label}>
                  <div className="text-[10px] text-gray-400 mb-0.5">{r.label}</div>
                  <div className="text-xs font-semibold text-gray-800">{r.val || '—'}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Dirección */}
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
            <div className="text-[10px] font-semibold text-gray-400 uppercase mb-4">Domicilio Chile</div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label:'Dirección', val: data.direccion },
                { label:'Ciudad', val: data.ciudad },
                { label:'Región', val: data.region },
                { label:'País', val: data.pais || 'Chile' },
              ].map(r => (
                <div key={r.label}>
                  <div className="text-[10px] text-gray-400 mb-0.5">{r.label}</div>
                  <div className="text-xs font-semibold text-gray-800">{r.val || '—'}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Representante y contacto */}
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
            <div className="text-[10px] font-semibold text-gray-400 uppercase mb-4">Representante y contacto</div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label:'Representante legal', val: data.representante_legal },
                { label:'RUT representante', val: data.rut_representante },
                { label:'Email', val: data.email },
                { label:'Teléfono', val: data.telefono },
                { label:'Sitio web', val: data.web },
                { label:'Logotipo URL', val: data.logo_url },
              ].map(r => (
                <div key={r.label}>
                  <div className="text-[10px] text-gray-400 mb-0.5">{r.label}</div>
                  <div className="text-xs font-semibold text-gray-800">{r.val || '—'}</div>
                </div>
              ))}
            </div>
          </div>

          {/* SII */}
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
            <div className="text-[10px] font-semibold text-gray-400 uppercase mb-4">Datos SII y tributarios</div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label:'Clave SII', val: data.clave_sii ? '••••••••' : '—' },
                { label:'Resolución SII', val: data.resolucion_sii },
                { label:'Fecha resolución', val: data.fecha_resolucion },
                { label:'Moneda contable', val: data.moneda_contable || 'CLP' },
              ].map(r => (
                <div key={r.label}>
                  <div className="text-[10px] text-gray-400 mb-0.5">{r.label}</div>
                  <div className="text-xs font-semibold text-gray-800">{r.val || '—'}</div>
                </div>
              ))}
            </div>
          </div>

          {!data.rut && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-[11px] text-amber-700">
              ⚠ Los datos de la empresa no están configurados. Hacé click en Editar para completarlos.
            </div>
          )}
        </div>
      ) : (
        /* Edición */
        <div className="space-y-4">
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
            <div className="text-[10px] font-semibold text-gray-400 uppercase mb-4">Identificación legal</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Razón social *</label>
                <input value={form.razon_social||''} onChange={e=>setF('razon_social',e.target.value)} className={inp2} placeholder="Puerto NOA SpA"/>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">RUT Chile *</label>
                <input value={form.rut||''} onChange={e=>setF('rut',e.target.value)} className={inp2} placeholder="12.345.678-9"/>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Giro SII *</label>
                <input value={form.giro||''} onChange={e=>setF('giro',e.target.value)} className={inp2} placeholder="Servicios logísticos de importación"/>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Régimen tributario</label>
                <select value={form.regimen_tributario||''} onChange={e=>setF('regimen_tributario',e.target.value)} className={inp2}>
                  <option value="">— Seleccionar —</option>
                  {REGIMENES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Moneda contable</label>
                <select value={form.moneda_contable||'CLP'} onChange={e=>setF('moneda_contable',e.target.value)} className={inp2}>
                  <option value="CLP">CLP — Peso chileno</option>
                  <option value="USD">USD — Dólar</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Mes inicio año fiscal</label>
                <select value={form.anio_fiscal_inicio||'1'} onChange={e=>setF('anio_fiscal_inicio',e.target.value)} className={inp2}>
                  {['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'].map((m,i) => (
                    <option key={i+1} value={String(i+1)}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Mes fin año fiscal</label>
                <select value={form.anio_fiscal_fin||'12'} onChange={e=>setF('anio_fiscal_fin',e.target.value)} className={inp2}>
                  {['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'].map((m,i) => (
                    <option key={i+1} value={String(i+1)}>{m}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
            <div className="text-[10px] font-semibold text-gray-400 uppercase mb-4">Domicilio Chile</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Dirección</label>
                <input value={form.direccion||''} onChange={e=>setF('direccion',e.target.value)} className={inp2} placeholder="Av. Ejemplo 1234, Of. 5"/>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Ciudad</label>
                <input value={form.ciudad||''} onChange={e=>setF('ciudad',e.target.value)} className={inp2} placeholder="Santiago"/>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Región</label>
                <input value={form.region||''} onChange={e=>setF('region',e.target.value)} className={inp2} placeholder="Región Metropolitana"/>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
            <div className="text-[10px] font-semibold text-gray-400 uppercase mb-4">Representante y contacto</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Representante legal</label>
                <input value={form.representante_legal||''} onChange={e=>setF('representante_legal',e.target.value)} className={inp2} placeholder="Nombre completo"/>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">RUT representante</label>
                <input value={form.rut_representante||''} onChange={e=>setF('rut_representante',e.target.value)} className={inp2} placeholder="12.345.678-9"/>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Email</label>
                <input value={form.email||''} onChange={e=>setF('email',e.target.value)} className={inp2} placeholder="contacto@puertonoa.com"/>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Teléfono</label>
                <input value={form.telefono||''} onChange={e=>setF('telefono',e.target.value)} className={inp2} placeholder="+56 9 1234 5678"/>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Sitio web</label>
                <input value={form.web||''} onChange={e=>setF('web',e.target.value)} className={inp2} placeholder="www.puertonoa.com"/>
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">URL del logotipo</label>
                <input value={form.logo_url||''} onChange={e=>setF('logo_url',e.target.value)} className={inp2} placeholder="https://... o /logo.png"/>
                {form.logo_url && (
                  <img src={form.logo_url} alt="Logo" className="mt-2 h-10 object-contain rounded border border-gray-100 p-1"/>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
            <div className="text-[10px] font-semibold text-gray-400 uppercase mb-4">Datos SII</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Resolución SII N°</label>
                <input value={form.resolucion_sii||''} onChange={e=>setF('resolucion_sii',e.target.value)} className={inp2} placeholder="Ex. 45"/>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Fecha resolución</label>
                <input type="date" value={form.fecha_resolucion||''} onChange={e=>setF('fecha_resolucion',e.target.value)} className={inp2}/>
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Notas internas</label>
                <input value={form.notas||''} onChange={e=>setF('notas',e.target.value)} className={inp2} placeholder="Observaciones internas"/>
              </div>
            </div>
          </div>

          <div className="flex justify-between">
            <button onClick={() => { setEditando(false); setForm(data) }}
              className="px-4 py-2 border border-gray-200 rounded-xl text-xs hover:bg-gray-50">Cancelar</button>
            <button onClick={save} disabled={saving}
              className="px-6 py-2.5 bg-[#1168F8] text-white rounded-xl text-xs font-bold disabled:opacity-50">
              {saving ? 'Guardando...' : 'Guardar datos'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── ABM de condiciones generales de cotización ───────────────────────
function CondicionesCotizacionABM() {
  const [permisos, setPermisos] = useState<Record<string, string[]>>({})
  useEffect(() => { cargarPermisos().then(setPermisos) }, [])
  const pCrear = puede(permisos, 'cat_cotizador', 'crear')
  const pEditar = puede(permisos, 'cat_cotizador', 'editar')
  const pEliminar = puede(permisos, 'cat_cotizador', 'eliminar')
  const supabase = useMemo(() => createClient(), [])
  const [condiciones, setCondiciones] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<{ type: 'nuevo' | 'editar'; cond?: any } | null>(null)
  const [form, setForm] = useState({ texto: '', orden: 0 })
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('condiciones_generales').select('*').order('orden')
    if (data) setCondiciones(data)
    setLoading(false)
  }

  function abrirNuevo() {
    setForm({ texto: '', orden: condiciones.length + 1 })
    setModal({ type: 'nuevo' })
  }
  function abrirEditar(c: any) {
    setForm({ texto: c.texto, orden: c.orden })
    setModal({ type: 'editar', cond: c })
  }
  async function guardar() {
    if (modal?.type === 'nuevo' ? !pCrear : !pEditar) return
    if (!form.texto.trim()) return
    setSaving(true)
    if (modal?.type === 'nuevo') {
      await (supabase.from('condiciones_generales') as any).insert({ texto: form.texto.trim(), orden: form.orden, activo: true })
    } else if (modal?.cond) {
      await (supabase.from('condiciones_generales') as any).update({ texto: form.texto.trim(), orden: form.orden }).eq('id', modal.cond.id)
    }
    await load()
    setModal(null)
    setSaving(false)
  }
  async function toggleActivo(c: any) {
    if (!pEditar) return
    await (supabase.from('condiciones_generales') as any).update({ activo: !c.activo }).eq('id', c.id)
    setCondiciones(prev => prev.map(x => x.id === c.id ? { ...x, activo: !x.activo } : x))
  }
  async function eliminar(id: string) {
    if (!pEliminar) return
    if (!confirm('¿Eliminar esta condición? Dejará de aparecer en las cotizaciones.')) return
    await supabase.from('condiciones_generales').delete().eq('id', id)
    setCondiciones(prev => prev.filter(c => c.id !== id))
  }
  async function mover(c: any, dir: 'arriba' | 'abajo') {
    const ord = [...condiciones].sort((a, b) => a.orden - b.orden)
    const idx = ord.findIndex(x => x.id === c.id)
    const swapIdx = dir === 'arriba' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= ord.length) return
    const vecino = ord[swapIdx]
    const ordenC = c.orden, ordenV = vecino.orden
    setCondiciones(prev => prev.map(x =>
      x.id === c.id ? { ...x, orden: ordenV } : x.id === vecino.id ? { ...x, orden: ordenC } : x
    ).sort((a, b) => a.orden - b.orden))
    await (supabase.from('condiciones_generales') as any).update({ orden: ordenV }).eq('id', c.id)
    await (supabase.from('condiciones_generales') as any).update({ orden: ordenC }).eq('id', vecino.id)
  }

  const ordenadas = [...condiciones].sort((a, b) => a.orden - b.orden)
  const activas = condiciones.filter(c => c.activo).length
  const inp2 = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white'

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-sm font-bold text-gray-900">Condiciones generales de cotización</div>
          <div className="text-[11px] text-gray-400 mt-0.5">
            Aparecen al pie de toda cotización. Las condiciones particulares de cada operación se cargan en el generador. — {activas} activas
          </div>
        </div>
        {pCrear && (
        <button onClick={abrirNuevo} className="px-4 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold hover:bg-[#0a4fc4] shadow-sm">
          + Nueva condición
        </button>
        )}
      </div>

      {loading ? (
        <div className="p-12 text-center text-gray-400">Cargando...</div>
      ) : ordenadas.length === 0 ? (
        <div className="p-12 text-center text-gray-400 text-sm bg-white border border-gray-100 rounded-2xl">
          Sin condiciones cargadas. Hacé click en <strong>+ Nueva condición</strong> para agregar la primera.
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
          {ordenadas.map((c, i) => (
            <div key={c.id} className={`flex items-start gap-3 px-5 py-3.5 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors ${!c.activo ? 'opacity-50' : ''}`}>
              <div className="flex flex-col gap-0.5 pt-0.5">
                <button onClick={() => mover(c, 'arriba')} disabled={i === 0}
                  className="text-gray-300 hover:text-[#1168F8] disabled:opacity-30 text-xs leading-none">▲</button>
                <button onClick={() => mover(c, 'abajo')} disabled={i === ordenadas.length - 1}
                  className="text-gray-300 hover:text-[#1168F8] disabled:opacity-30 text-xs leading-none">▼</button>
              </div>
              <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-[11px] font-bold text-gray-500 flex-shrink-0 mt-0.5">
                {i + 1}
              </div>
              <div className="flex-1 text-xs text-gray-700 leading-relaxed pt-0.5">{c.texto}</div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => toggleActivo(c)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${c.activo ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                  {c.activo ? 'Activa' : 'Inactiva'}
                </button>
                <button onClick={() => abrirEditar(c)}
                  className="px-2.5 py-1 border border-gray-200 rounded-lg text-[10px] font-semibold text-gray-600 hover:bg-gray-100">Editar</button>
                <button onClick={() => eliminar(c.id)}
                  className="px-2.5 py-1 border border-red-100 rounded-lg text-[10px] font-semibold text-red-500 hover:bg-red-50">Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => !saving && setModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50">
              <span className="font-semibold text-sm text-gray-900">
                {modal.type === 'nuevo' ? 'Nueva condición general' : 'Editar condición'}
              </span>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Texto de la condición *</label>
                <textarea value={form.texto} onChange={e => setForm(f => ({ ...f, texto: e.target.value }))}
                  className={inp2 + ' min-h-24 resize-y'} placeholder="Ej: Los valores en USD se convertirán según el tipo de cambio vigente..." autoFocus />
                <div className="text-[10px] text-gray-400 mt-1">Aparecerá tal cual en la sección de condiciones generales de la cotización impresa.</div>
              </div>
              <div className="w-32">
                <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Orden</label>
                <input type="number" value={form.orden} onChange={e => setForm(f => ({ ...f, orden: parseInt(e.target.value) || 0 }))} className={inp2} />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setModal(null)} disabled={saving}
                className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold hover:bg-gray-50 disabled:opacity-50">Cancelar</button>
              <button onClick={guardar} disabled={saving || !form.texto.trim()}
                className="px-5 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold hover:bg-[#0a4fc4] disabled:opacity-50">
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
