'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

interface Tercero {
  id: string
  tipo: string[]
  activo: boolean
  razon_social: string
  nombre_fantasia: string
  pais: string
  tipo_doc: string
  nro_doc: string
  condicion_iva: string
  actividad: string
  nro_importador: string
  dir_fiscal_ciudad: string
  dir_fiscal_pais: string
  banco: string
  notas: string
  created_at: string
  contactos?: Contacto[]
}

interface Contacto {
  id: string
  nombre: string
  cargo: string
  email: string
  telefono: string
  whatsapp: string
  principal: boolean
}

const PAISES = ['Argentina', 'Chile', 'China', 'Bolivia', 'Perú', 'Uruguay', 'Brasil', 'Colombia', 'México', 'España', 'Estados Unidos', 'Otro']
const TIPO_DOC_POR_PAIS: Record<string, string[]> = {
  Argentina: ['CUIT', 'CUIL', 'DNI', 'Pasaporte'],
  Chile: ['RUT', 'RUN', 'Pasaporte'],
  China: ['Unified Social Credit Code', 'Pasaporte'],
  Bolivia: ['NIT', 'CI', 'Pasaporte'],
  Perú: ['RUC', 'DNI', 'Pasaporte'],
  default: ['NIF', 'RUT', 'Tax ID', 'Pasaporte', 'Otro'],
}
const CONDICION_IVA = ['Responsable Inscripto', 'Exento', 'Monotributo', 'No inscripto', 'Consumidor Final', 'No aplica']

export default function ClientesPage() {
  const supabase = useMemo(() => createClient(), [])
  const [terceros, setTerceros] = useState<Tercero[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'lista' | 'nuevo' | 'detalle'>('lista')
  const [selId, setSelId] = useState<string | null>(null)
  const [buscar, setBuscar] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroPais, setFiltroPais] = useState('')
  const [currentUser, setCurrentUser] = useState<any>(null)

  useEffect(() => { loadUser(); loadData() }, [])

  async function loadUser() {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return
    const { data: u } = await supabase.from('usuarios').select('*').eq('auth_id', auth.user.id).single()
    if (u) setCurrentUser(u)
  }

  async function loadData() {
    setLoading(true)
    const { data } = await supabase
      .from('terceros')
      .select('*, contactos:tercero_contactos(*)')
      .order('razon_social')
    if (data) setTerceros(data as Tercero[])
    setLoading(false)
  }

  const sel = terceros.find(t => t.id === selId)

  const filtrados = terceros.filter(t => {
    const b = buscar.toLowerCase()
    const matchB = !b || t.razon_social.toLowerCase().includes(b) || (t.nombre_fantasia || '').toLowerCase().includes(b) || (t.nro_doc || '').includes(b)
    const matchT = !filtroTipo || t.tipo?.includes(filtroTipo)
    const matchP = !filtroPais || t.pais === filtroPais
    return matchB && matchT && matchP
  })

  const paises = [...new Set(terceros.map(t => t.pais))].sort()

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Clientes y Proveedores</h1>
          <p className="text-xs text-gray-400 mt-0.5">Base de terceros · {terceros.filter(t=>t.activo).length} activos</p>
        </div>
        <div className="flex gap-2">
          {view !== 'lista' && (
            <button onClick={() => setView('lista')} className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold hover:bg-gray-100 transition-colors">← Volver</button>
          )}
          {view === 'lista' && (
            <button onClick={() => setView('nuevo')} className="px-5 py-2.5 bg-[#1168F8] text-white rounded-xl text-sm font-bold hover:bg-[#0a4fc4] transition-colors shadow-sm">+ Nuevo</button>
          )}
        </div>
      </div>

      {view === 'lista' && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-4 gap-3 mb-5">
            {[
              { label: 'Total', value: terceros.length, icon: '🏢', color: 'text-gray-900' },
              { label: 'Clientes', value: terceros.filter(t => t.tipo?.includes('cliente')).length, icon: '🤝', color: 'text-[#1168F8]' },
              { label: 'Proveedores', value: terceros.filter(t => t.tipo?.includes('proveedor')).length, icon: '📦', color: 'text-green-700' },
              { label: 'Ambos', value: terceros.filter(t => t.tipo?.includes('cliente') && t.tipo?.includes('proveedor')).length, icon: '↔️', color: 'text-amber-700' },
            ].map(s => (
              <div key={s.label} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                <div className="text-xl mb-1">{s.icon}</div>
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-[10px] text-gray-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Filtros */}
          <div className="flex gap-3 mb-4 flex-wrap items-center">
            <div className="relative flex-1 min-w-60">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🔍</span>
              <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar por nombre, documento..."
                className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white shadow-sm" />
            </div>
            <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:border-[#1168F8] shadow-sm">
              <option value="">Clientes + Proveedores</option>
              <option value="cliente">Solo clientes</option>
              <option value="proveedor">Solo proveedores</option>
            </select>
            <select value={filtroPais} onChange={e => setFiltroPais(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:border-[#1168F8] shadow-sm">
              <option value="">Todos los países</option>
              {paises.map(p => <option key={p}>{p}</option>)}
            </select>
            {(buscar || filtroTipo || filtroPais) && (
              <button onClick={() => { setBuscar(''); setFiltroTipo(''); setFiltroPais('') }}
                className="px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-500 hover:bg-gray-50">✕ Limpiar</button>
            )}
            <span className="text-xs text-gray-400 ml-auto">{filtrados.length} registro(s)</span>
          </div>

          {/* Lista */}
          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
            {loading ? (
              <div className="p-12 text-center text-gray-400">Cargando...</div>
            ) : filtrados.length === 0 ? (
              <div className="p-12 text-center">
                <div className="text-4xl mb-3">🏢</div>
                <div className="text-gray-500 text-sm mb-1">{terceros.length === 0 ? 'Sin clientes ni proveedores aún' : 'Sin resultados'}</div>
                {terceros.length === 0 && (
                  <button onClick={() => setView('nuevo')} className="mt-3 px-4 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold">+ Agregar primero</button>
                )}
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {['Razón social', 'País', 'Documento', 'Tipo', 'Contacto principal', 'Ciudad', ''].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map(t => {
                    const contactoPpal = t.contactos?.find(c => c.principal) || t.contactos?.[0]
                    return (
                      <tr key={t.id} className="border-b border-gray-50 hover:bg-blue-50/20 transition-colors group cursor-pointer"
                        onClick={() => { setSelId(t.id); setView('detalle') }}>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-[#EBF2FF] flex items-center justify-center text-[#052698] text-[10px] font-bold flex-shrink-0">
                              {t.razon_social.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-semibold text-gray-900">{t.razon_social}</div>
                              {t.nombre_fantasia && <div className="text-[10px] text-gray-400">{t.nombre_fantasia}</div>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-gray-600">{t.pais}</td>
                        <td className="px-4 py-3.5">
                          {t.nro_doc && <div className="font-mono text-[11px] text-gray-700">{t.tipo_doc}: {t.nro_doc}</div>}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex gap-1 flex-wrap">
                            {t.tipo?.includes('cliente') && <span className="px-2 py-0.5 bg-[#EBF2FF] text-[#052698] rounded-full text-[9px] font-bold">Cliente</span>}
                            {t.tipo?.includes('proveedor') && <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded-full text-[9px] font-bold">Proveedor</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          {contactoPpal && (
                            <div>
                              <div className="font-medium text-gray-700">{contactoPpal.nombre}</div>
                              <div className="text-[10px] text-gray-400">{contactoPpal.email || contactoPpal.telefono}</div>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-gray-500">{t.dir_fiscal_ciudad || '—'}</td>
                        <td className="px-4 py-3.5">
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                            <button onClick={e => { e.stopPropagation(); setSelId(t.id); setView('detalle') }}
                              className="p-1.5 border border-gray-200 rounded-lg hover:bg-[#EBF2FF] text-gray-500 hover:text-[#1168F8] transition-colors">✏</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {view === 'nuevo' && (
        <FormTercero
          supabase={supabase} currentUser={currentUser}
          onSave={async (data) => {
            await (supabase.from('terceros') as any).insert({ ...data, creado_por: currentUser?.nombre, creado_por_id: currentUser?.id })
            await loadData()
            setView('lista')
          }}
          onCancel={() => setView('lista')}
        />
      )}

      {view === 'detalle' && sel && (
        <DetalleTercero
          tercero={sel} supabase={supabase} currentUser={currentUser}
          onReload={async () => { await loadData(); const updated = terceros.find(t => t.id === sel.id); if (updated) setSelId(updated.id) }}
          onBack={() => setView('lista')}
        />
      )}
    </div>
  )
}

// ── FORMULARIO NUEVO TERCERO ────────────────────────────────
function FormTercero({ supabase, currentUser, onSave, onCancel }: any) {
  const [form, setForm] = useState({
    razon_social: '', nombre_fantasia: '', pais: 'Argentina',
    tipo_doc: 'CUIT', nro_doc: '', condicion_iva: 'Responsable Inscripto',
    actividad: '', nro_importador: '',
    dir_fiscal_calle: '', dir_fiscal_ciudad: '', dir_fiscal_provincia: '', dir_fiscal_cp: '',
    banco: '', cuenta: '', cbu_iban: '', swift: '', moneda_cuenta: 'USD',
    notas: '', activo: true,
    tipo: ['cliente'] as string[],
  })
  const [saving, setSaving] = useState(false)
  const inp = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white'
  const tiposDocs = TIPO_DOC_POR_PAIS[form.pais] || TIPO_DOC_POR_PAIS.default

  function toggleTipo(t: string) {
    setForm(f => ({
      ...f,
      tipo: f.tipo.includes(t) ? f.tipo.filter(x => x !== t) : [...f.tipo, t]
    }))
  }

  async function handleSave() {
    if (!form.razon_social) { alert('La razón social es obligatoria'); return }
    if (form.tipo.length === 0) { alert('Seleccioná al menos un tipo'); return }
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  return (
    <div className="max-w-3xl space-y-4">
      {/* Tipo */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <h3 className="font-bold text-sm text-gray-900 mb-4">Tipo de tercero</h3>
        <div className="flex gap-3">
          {[
            { key: 'cliente', label: 'Cliente', icon: '🤝', desc: 'Empresa o persona que contrata servicios' },
            { key: 'proveedor', label: 'Proveedor', icon: '📦', desc: 'Empresa que presta servicios a Puerto NOA' },
          ].map(o => (
            <button key={o.key} onClick={() => toggleTipo(o.key)}
              className={`flex-1 px-4 py-3 rounded-xl border-2 text-left transition-all ${form.tipo.includes(o.key) ? 'border-[#1168F8] bg-[#EBF2FF]' : 'border-gray-200 hover:bg-gray-50'}`}>
              <div className="text-base mb-1">{o.icon}</div>
              <div className="font-bold text-sm text-gray-900">{o.label}</div>
              <div className="text-[10px] text-gray-400">{o.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Datos generales */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <h3 className="font-bold text-sm text-gray-900 mb-4">Datos generales</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Razón social *</label>
            <input value={form.razon_social} onChange={e => setForm(f => ({ ...f, razon_social: e.target.value }))} className={inp} placeholder="Nombre legal completo" />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Nombre fantasía</label>
            <input value={form.nombre_fantasia} onChange={e => setForm(f => ({ ...f, nombre_fantasia: e.target.value }))} className={inp} placeholder="Nombre comercial" />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">País *</label>
            <select value={form.pais} onChange={e => setForm(f => ({ ...f, pais: e.target.value, tipo_doc: (TIPO_DOC_POR_PAIS[e.target.value] || TIPO_DOC_POR_PAIS.default)[0] }))}
              className={inp}>
              {PAISES.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Actividad comercial</label>
            <input value={form.actividad} onChange={e => setForm(f => ({ ...f, actividad: e.target.value }))} className={inp} placeholder="ej. Importación de maquinaria" />
          </div>
        </div>
      </div>

      {/* Datos fiscales */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <h3 className="font-bold text-sm text-gray-900 mb-4">Datos fiscales</h3>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Tipo documento</label>
            <select value={form.tipo_doc} onChange={e => setForm(f => ({ ...f, tipo_doc: e.target.value }))} className={inp}>
              {tiposDocs.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Número</label>
            <input value={form.nro_doc} onChange={e => setForm(f => ({ ...f, nro_doc: e.target.value }))} className={inp} placeholder="ej. 20-12345678-9" />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Condición IVA</label>
            <select value={form.condicion_iva} onChange={e => setForm(f => ({ ...f, condicion_iva: e.target.value }))} className={inp}>
              {CONDICION_IVA.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">N° importador / exportador</label>
            <input value={form.nro_importador} onChange={e => setForm(f => ({ ...f, nro_importador: e.target.value }))} className={inp} placeholder="Registro aduanero" />
          </div>
        </div>
      </div>

      {/* Dirección fiscal */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <h3 className="font-bold text-sm text-gray-900 mb-4">Dirección fiscal</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Calle y número</label>
            <input value={form.dir_fiscal_calle} onChange={e => setForm(f => ({ ...f, dir_fiscal_calle: e.target.value }))} className={inp} placeholder="ej. Av. Corrientes 1234" />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Ciudad</label>
            <input value={form.dir_fiscal_ciudad} onChange={e => setForm(f => ({ ...f, dir_fiscal_ciudad: e.target.value }))} className={inp} />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Provincia / Estado / Región</label>
            <input value={form.dir_fiscal_provincia} onChange={e => setForm(f => ({ ...f, dir_fiscal_provincia: e.target.value }))} className={inp} />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Código postal</label>
            <input value={form.dir_fiscal_cp} onChange={e => setForm(f => ({ ...f, dir_fiscal_cp: e.target.value }))} className={inp} />
          </div>
        </div>
      </div>

      {/* Datos bancarios */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <h3 className="font-bold text-sm text-gray-900 mb-4">Datos bancarios</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Banco</label>
            <input value={form.banco} onChange={e => setForm(f => ({ ...f, banco: e.target.value }))} className={inp} placeholder="ej. Banco Nación Argentina" />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Moneda de la cuenta</label>
            <select value={form.moneda_cuenta} onChange={e => setForm(f => ({ ...f, moneda_cuenta: e.target.value }))} className={inp}>
              {['USD', 'ARS', 'CLP', 'CNY', 'EUR'].map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">N° cuenta</label>
            <input value={form.cuenta} onChange={e => setForm(f => ({ ...f, cuenta: e.target.value }))} className={inp} />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">CBU / IBAN</label>
            <input value={form.cbu_iban} onChange={e => setForm(f => ({ ...f, cbu_iban: e.target.value }))} className={inp} />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">SWIFT / BIC</label>
            <input value={form.swift} onChange={e => setForm(f => ({ ...f, swift: e.target.value }))} className={inp} />
          </div>
        </div>
      </div>

      {/* Notas */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <h3 className="font-bold text-sm text-gray-900 mb-3">Notas</h3>
        <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
          className={inp + ' resize-none'} rows={3} placeholder="Observaciones generales..." />
      </div>

      <div className="flex justify-between">
        <button onClick={onCancel} className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold hover:bg-gray-50">Cancelar</button>
        <button onClick={handleSave} disabled={saving}
          className="px-6 py-2.5 bg-[#1168F8] text-white rounded-xl text-xs font-bold hover:bg-[#0a4fc4] disabled:opacity-50 transition-colors shadow-sm">
          {saving ? 'Guardando...' : '✓ Guardar tercero'}
        </button>
      </div>
    </div>
  )
}

// ── DETALLE TERCERO ─────────────────────────────────────────
function DetalleTercero({ tercero, supabase, currentUser, onReload, onBack }: any) {
  const [tab, setTab] = useState<'datos' | 'contactos' | 'documentos' | 'operaciones'>('datos')
  const [contactos, setContactos] = useState<Contacto[]>(tercero.contactos || [])
  const [docs, setDocs] = useState<any[]>([])
  const [ops, setOps] = useState<any[]>([])
  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState({ ...tercero })
  const [newContacto, setNewContacto] = useState({ nombre: '', cargo: '', email: '', telefono: '', whatsapp: '', principal: false })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [docForm, setDocForm] = useState({ tipo: 'estatuto', nombre_custom: '', referencia: '', fecha: '', notas: '' })
  const inp = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white'

  useEffect(() => { loadDocs(); loadOps() }, [])

  async function loadDocs() {
    const { data } = await supabase.from('tercero_documentos').select('*').eq('tercero_id', tercero.id).order('created_at', { ascending: false })
    if (data) setDocs(data)
  }

  async function loadOps() {
    const { data } = await supabase.from('cotizaciones').select('num, cliente, estado, created_at').eq('tercero_id', tercero.id).order('created_at', { ascending: false })
    if (data) setOps(data)
  }

  async function saveData() {
    setSaving(true)
    await (supabase.from('terceros') as any).update({ ...form, updated_at: new Date().toISOString() }).eq('id', tercero.id)
    await onReload()
    setEditando(false)
    setSaving(false)
  }

  async function addContacto() {
    if (!newContacto.nombre) return
    await (supabase.from('tercero_contactos') as any).insert({ ...newContacto, tercero_id: tercero.id })
    const { data } = await supabase.from('tercero_contactos').select('*').eq('tercero_id', tercero.id)
    if (data) setContactos(data as Contacto[])
    setNewContacto({ nombre: '', cargo: '', email: '', telefono: '', whatsapp: '', principal: false })
  }

  async function deleteContacto(id: string) {
    if (!confirm('¿Eliminar contacto?')) return
    await supabase.from('tercero_contactos').delete().eq('id', id)
    setContactos(c => c.filter(x => x.id !== id))
  }

  async function subirDoc(file: File) {
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `${tercero.id}/${Date.now()}.${ext}`
    await supabase.storage.from('terceros').upload(path, file, { upsert: true })
    const { data: urlData } = supabase.storage.from('terceros').getPublicUrl(path)
    if (urlData?.publicUrl) {
      await (supabase.from('tercero_documentos') as any).insert({
        tercero_id: tercero.id,
        tipo: docForm.tipo,
        nombre_custom: docForm.tipo === 'otro' ? docForm.nombre_custom : null,
        referencia: docForm.referencia || null,
        fecha: docForm.fecha || null,
        notas: docForm.notas || null,
        archivo_url: urlData.publicUrl,
        archivo_nombre: file.name,
        subido_por: currentUser?.nombre,
      })
      await loadDocs()
    }
    setUploading(false)
  }

  const TIPOS_DOC_LABEL: Record<string, string> = {
    estatuto: 'Estatuto / Acta constitutiva',
    poder: 'Poder notarial',
    certificado: 'Certificado / Habilitación',
    rut: 'RUT / CUIT / Constancia fiscal',
    contrato: 'Contrato marco',
    otro: 'Otro',
  }

  const tiposDocs = TIPO_DOC_POR_PAIS[form.pais] || TIPO_DOC_POR_PAIS.default

  return (
    <div>
      {/* Header tercero */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm mb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[#EBF2FF] flex items-center justify-center text-[#052698] text-lg font-black">
              {tercero.razon_social.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-gray-900">{tercero.razon_social}</h2>
                {tercero.tipo?.includes('cliente') && <span className="px-2.5 py-0.5 bg-[#EBF2FF] text-[#052698] rounded-full text-[10px] font-bold">Cliente</span>}
                {tercero.tipo?.includes('proveedor') && <span className="px-2.5 py-0.5 bg-green-50 text-green-700 rounded-full text-[10px] font-bold">Proveedor</span>}
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${tercero.activo ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {tercero.activo ? '● Activo' : '○ Inactivo'}
                </span>
              </div>
              {tercero.nombre_fantasia && <div className="text-xs text-gray-400 mt-0.5">{tercero.nombre_fantasia}</div>}
              <div className="flex gap-4 mt-1 text-xs text-gray-500">
                <span>{tercero.pais}</span>
                {tercero.nro_doc && <span className="font-mono">{tercero.tipo_doc}: {tercero.nro_doc}</span>}
                {tercero.dir_fiscal_ciudad && <span>{tercero.dir_fiscal_ciudad}</span>}
              </div>
            </div>
          </div>
          <button onClick={() => setEditando(!editando)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-colors ${editando ? 'bg-gray-100 border-gray-200 text-gray-600' : 'border-[#1168F8] text-[#1168F8] hover:bg-[#EBF2FF]'}`}>
            {editando ? '✕ Cancelar' : '✏ Editar'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {[
          { key: 'datos', label: 'Datos generales' },
          { key: 'contactos', label: `Contactos (${contactos.length})` },
          { key: 'documentos', label: `Documentos (${docs.length})` },
          { key: 'operaciones', label: `Operaciones (${ops.length})` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all shadow-sm ${tab === t.key ? 'bg-[#1168F8] text-white shadow-md' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Datos */}
      {tab === 'datos' && (
        <div className="space-y-4">
          {editando ? (
            <>
              <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                <h3 className="font-bold text-sm text-gray-900 mb-4">Datos generales</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Razón social</label>
                    <input value={form.razon_social} onChange={e => setForm((f: any) => ({ ...f, razon_social: e.target.value }))} className={inp} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Nombre fantasía</label>
                    <input value={form.nombre_fantasia || ''} onChange={e => setForm((f: any) => ({ ...f, nombre_fantasia: e.target.value }))} className={inp} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">País</label>
                    <select value={form.pais} onChange={e => setForm((f: any) => ({ ...f, pais: e.target.value }))} className={inp}>
                      {PAISES.map(p => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Tipo documento</label>
                    <select value={form.tipo_doc || ''} onChange={e => setForm((f: any) => ({ ...f, tipo_doc: e.target.value }))} className={inp}>
                      {tiposDocs.map(d => <option key={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Número</label>
                    <input value={form.nro_doc || ''} onChange={e => setForm((f: any) => ({ ...f, nro_doc: e.target.value }))} className={inp} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Condición IVA</label>
                    <select value={form.condicion_iva || ''} onChange={e => setForm((f: any) => ({ ...f, condicion_iva: e.target.value }))} className={inp}>
                      {CONDICION_IVA.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">N° importador</label>
                    <input value={form.nro_importador || ''} onChange={e => setForm((f: any) => ({ ...f, nro_importador: e.target.value }))} className={inp} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Actividad</label>
                    <input value={form.actividad || ''} onChange={e => setForm((f: any) => ({ ...f, actividad: e.target.value }))} className={inp} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Ciudad fiscal</label>
                    <input value={form.dir_fiscal_ciudad || ''} onChange={e => setForm((f: any) => ({ ...f, dir_fiscal_ciudad: e.target.value }))} className={inp} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Dirección fiscal</label>
                    <input value={form.dir_fiscal_calle || ''} onChange={e => setForm((f: any) => ({ ...f, dir_fiscal_calle: e.target.value }))} className={inp} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Banco</label>
                    <input value={form.banco || ''} onChange={e => setForm((f: any) => ({ ...f, banco: e.target.value }))} className={inp} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">CBU / IBAN</label>
                    <input value={form.cbu_iban || ''} onChange={e => setForm((f: any) => ({ ...f, cbu_iban: e.target.value }))} className={inp} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Notas</label>
                    <textarea value={form.notas || ''} onChange={e => setForm((f: any) => ({ ...f, notas: e.target.value }))}
                      className={inp + ' resize-none'} rows={2} />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setEditando(false)} className="px-4 py-2 border border-gray-200 rounded-xl text-xs">Cancelar</button>
                <button onClick={saveData} disabled={saving} className="px-5 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold disabled:opacity-50">
                  {saving ? 'Guardando...' : '✓ Guardar cambios'}
                </button>
              </div>
            </>
          ) : (
            <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
              <div className="grid grid-cols-3 gap-x-8 gap-y-4">
                {[
                  { l: 'País', v: tercero.pais },
                  { l: 'Actividad', v: tercero.actividad },
                  { l: 'Condición IVA', v: tercero.condicion_iva },
                  { l: tercero.tipo_doc || 'Documento', v: tercero.nro_doc },
                  { l: 'N° importador', v: tercero.nro_importador },
                  { l: 'Dirección fiscal', v: [tercero.dir_fiscal_calle, tercero.dir_fiscal_ciudad, tercero.dir_fiscal_provincia].filter(Boolean).join(', ') },
                  { l: 'Banco', v: tercero.banco },
                  { l: 'CBU / IBAN', v: tercero.cbu_iban },
                  { l: 'SWIFT', v: tercero.swift },
                ].filter(r => r.v).map(r => (
                  <div key={r.l}>
                    <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-0.5">{r.l}</div>
                    <div className="text-sm text-gray-800 font-medium">{r.v}</div>
                  </div>
                ))}
              </div>
              {tercero.notas && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1">Notas</div>
                  <div className="text-xs text-gray-600">{tercero.notas}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab: Contactos */}
      {tab === 'contactos' && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
            <h3 className="font-bold text-sm text-gray-900 mb-4">Agregar contacto</h3>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Nombre *</label>
                <input value={newContacto.nombre} onChange={e => setNewContacto(f => ({ ...f, nombre: e.target.value }))} className={inp} placeholder="Nombre completo" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Cargo</label>
                <input value={newContacto.cargo} onChange={e => setNewContacto(f => ({ ...f, cargo: e.target.value }))} className={inp} placeholder="ej. Gerente de compras" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Email</label>
                <input type="email" value={newContacto.email} onChange={e => setNewContacto(f => ({ ...f, email: e.target.value }))} className={inp} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Teléfono</label>
                <input value={newContacto.telefono} onChange={e => setNewContacto(f => ({ ...f, telefono: e.target.value }))} className={inp} placeholder="+54 9 388..." />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">WhatsApp</label>
                <input value={newContacto.whatsapp} onChange={e => setNewContacto(f => ({ ...f, whatsapp: e.target.value }))} className={inp} placeholder="+54 9 388..." />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer pb-2">
                  <input type="checkbox" checked={newContacto.principal} onChange={e => setNewContacto(f => ({ ...f, principal: e.target.checked }))}
                    className="w-4 h-4 rounded" />
                  <span className="text-xs text-gray-600 font-medium">Contacto principal</span>
                </label>
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={addContacto} className="px-4 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold hover:bg-[#0a4fc4]">+ Agregar</button>
            </div>
          </div>

          {contactos.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {['Nombre', 'Cargo', 'Email', 'Teléfono', 'WhatsApp', ''].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {contactos.map(c => (
                    <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3 font-semibold text-gray-800">
                        {c.nombre}
                        {c.principal && <span className="ml-1.5 px-1.5 py-0.5 bg-[#EBF2FF] text-[#052698] rounded text-[9px] font-bold">Principal</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{c.cargo || '—'}</td>
                      <td className="px-4 py-3 text-[#1168F8]">{c.email || '—'}</td>
                      <td className="px-4 py-3 font-mono text-[10px]">{c.telefono || '—'}</td>
                      <td className="px-4 py-3 font-mono text-[10px] text-green-700">{c.whatsapp || '—'}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => deleteContacto(c.id)} className="text-gray-400 hover:text-red-500 transition-colors">🗑</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: Documentos */}
      {tab === 'documentos' && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
            <h3 className="font-bold text-sm text-gray-900 mb-4">Agregar documento</h3>
            <div className="grid grid-cols-4 gap-3 mb-3">
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Tipo</label>
                <select value={docForm.tipo} onChange={e => setDocForm(f => ({ ...f, tipo: e.target.value }))} className={inp}>
                  {Object.entries(TIPOS_DOC_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              {docForm.tipo === 'otro' && (
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Nombre *</label>
                  <input value={docForm.nombre_custom} onChange={e => setDocForm(f => ({ ...f, nombre_custom: e.target.value }))} className={inp} />
                </div>
              )}
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Referencia</label>
                <input value={docForm.referencia} onChange={e => setDocForm(f => ({ ...f, referencia: e.target.value }))} className={inp} placeholder="N° o código" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Fecha</label>
                <input type="date" value={docForm.fecha} onChange={e => setDocForm(f => ({ ...f, fecha: e.target.value }))} className={inp} />
              </div>
            </div>
            <label className={`flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-[#93B8FC] rounded-xl text-xs text-[#1168F8] hover:bg-[#EBF2FF] cursor-pointer transition-colors ${uploading ? 'opacity-60' : ''} w-fit`}>
              📎 {uploading ? 'Subiendo...' : 'Seleccionar y subir archivo (PDF / imagen)'}
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" disabled={uploading}
                onChange={e => { const f = e.target.files?.[0]; if (f) subirDoc(f) }} />
            </label>
          </div>

          {docs.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
              <div className="divide-y divide-gray-50">
                {docs.map((d: any) => (
                  <div key={d.id} className="flex items-center gap-4 px-5 py-3.5">
                    <div className="flex-1">
                      <div className="font-medium text-sm text-gray-800">{TIPOS_DOC_LABEL[d.tipo] || d.nombre_custom}</div>
                      <div className="text-[10px] text-gray-400 flex gap-3 mt-0.5">
                        {d.referencia && <span className="font-mono">Ref: {d.referencia}</span>}
                        {d.fecha && <span>{d.fecha}</span>}
                        {d.subido_por && <span>por {d.subido_por}</span>}
                      </div>
                    </div>
                    {d.archivo_url && (
                      <a href={d.archivo_url} target="_blank" rel="noreferrer"
                        className="px-3 py-1.5 bg-[#EBF2FF] text-[#1168F8] rounded-lg text-xs font-medium hover:bg-[#93B8FC]">📄 Ver</a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Operaciones */}
      {tab === 'operaciones' && (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
          {ops.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">Sin operaciones vinculadas aún.</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['N° Cotización', 'Cliente', 'Estado', 'Fecha'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ops.map((o: any) => (
                  <tr key={o.num} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/registro/${o.id}`} className="font-mono text-[#1168F8] hover:underline font-bold">{o.num}</Link>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{o.cliente}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600">{o.estado}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 font-mono text-[10px]">{o.created_at?.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
