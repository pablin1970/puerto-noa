'use client'
import { useEffect, useState, useMemo, Suspense } from 'react'
import { createClient } from '@/lib/supabase'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { cargarPermisos, puede } from '@/lib/permisos'
import { abrirConMarca } from '@/lib/documentos'

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
  dir_fiscal_calle: string
  dir_fiscal_ciudad: string
  dir_fiscal_provincia: string
  dir_fiscal_pais: string
  dir_fiscal_cp: string
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

interface CuentaBancaria {
  id: string
  tercero_id: string
  banco: string
  cuenta: string
  cbu_iban: string
  swift: string
  moneda: string
  principal: boolean
  notas: string
}

const PAISES = ['Argentina', 'Chile', 'China', 'Bolivia', 'Peru', 'Uruguay', 'Brasil', 'Colombia', 'Mexico', 'Espana', 'Estados Unidos', 'Otro']
const TIPO_DOC_POR_PAIS: Record<string, string[]> = {
  Argentina: ['CUIT', 'CUIL', 'DNI', 'Pasaporte'],
  Chile: ['RUT', 'RUN', 'Pasaporte'],
  China: ['Unified Social Credit Code', 'Pasaporte'],
  Bolivia: ['NIT', 'CI', 'Pasaporte'],
  Peru: ['RUC', 'DNI', 'Pasaporte'],
  default: ['NIF', 'RUT', 'Tax ID', 'Pasaporte', 'Otro'],
}
const CONDICION_IVA = ['Responsable Inscripto', 'Exento', 'Monotributo', 'No inscripto', 'Consumidor Final', 'No aplica']
const MONEDAS = ['USD', 'ARS', 'CLP', 'CNY', 'EUR']

// ── Domicilios ───────────────────────────────────────────────────────────────
// Hay dos domicilios en `terceros`: comercial (estatutario) y fiscal (ARCA/SII).
// No siempre difieren, así que el form usa un toggle "el fiscal es igual al comercial".
// Estos helpers detectan vacíos / igualdad y dan compatibilidad con registros viejos
// que solo cargaron la dirección fiscal.
const DIR_CAMPOS = ['calle', 'ciudad', 'provincia', 'pais', 'cp']
function dirVacia(o: any, pref: string): boolean {
  return DIR_CAMPOS.every(c => !((o?.[`${pref}_${c}`] || '').toString().trim()))
}
function dirIguales(o: any, a: string, b: string): boolean {
  return DIR_CAMPOS.every(c => ((o?.[`${a}_${c}`] || '').toString().trim()) === ((o?.[`${b}_${c}`] || '').toString().trim()))
}
// Prepara un tercero para edición: si el comercial está vacío pero hay fiscal (registro
// viejo), toma el fiscal como comercial. Devuelve la base ya normalizada y si son iguales.
function prepararDomicilios(t: any): { base: any; igual: boolean } {
  const base: any = { ...t }
  const comVacio = dirVacia(base, 'dir_comercial')
  const fisVacio = dirVacia(base, 'dir_fiscal')
  if (comVacio && !fisVacio) {
    DIR_CAMPOS.forEach(c => { base[`dir_comercial_${c}`] = base[`dir_fiscal_${c}`] })
  }
  const igual = dirVacia(base, 'dir_fiscal') || dirIguales(base, 'dir_comercial', 'dir_fiscal')
  return { base, igual }
}

// La pantalla de terceros es una sola, pero se comporta según el contexto de entrada:
// /clientes => vista Clientes ; /clientes?ver=proveedores => vista Proveedores.
// Los permisos (ver/crear/editar/eliminar) se evalúan contra el módulo del contexto,
// de modo que un usuario de un área no ve ni toca los terceros del otro.
export default function ClientesPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-400">Cargando…</div>}>
      <TercerosContent />
    </Suspense>
  )
}

function TercerosContent() {
  const supabase = useMemo(() => createClient(), [])
  const searchParams = useSearchParams()
  const ctx = searchParams.get('ver') === 'proveedores' ? 'proveedores' : 'clientes'
  const tipoCtx = ctx === 'proveedores' ? 'proveedor' : 'cliente'
  const [terceros, setTerceros] = useState<Tercero[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'lista' | 'nuevo' | 'detalle'>('lista')
  const [selId, setSelId] = useState<string | null>(null)
  const [buscar, setBuscar] = useState('')
  const [filtroPais, setFiltroPais] = useState('')
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [permisos, setPermisos] = useState<Record<string, string[]>>({})
  const [permListos, setPermListos] = useState(false)

  useEffect(() => { loadUser(); loadData(); cargarPermisos().then(p => { setPermisos(p); setPermListos(true) }) }, [])

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
    // Universo del contexto: los marcados como "ambos" aparecen en las dos vistas
    if (!t.tipo?.includes(tipoCtx)) return false
    const b = buscar.toLowerCase()
    const matchB = !b || t.razon_social.toLowerCase().includes(b) || (t.nombre_fantasia || '').toLowerCase().includes(b) || (t.nro_doc || '').includes(b)
    const matchP = !filtroPais || t.pais === filtroPais
    return matchB && matchP
  })

  const paises = Array.from(new Set(terceros.map(t => t.pais))).sort()

  // Gate de acceso: sin permiso de 'ver' no se muestra la sección
  if (permListos && !puede(permisos, ctx, 'ver')) {
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
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{ctx === 'proveedores' ? 'Proveedores' : 'Clientes'}</h1>
          <p className="text-xs text-gray-400 mt-0.5">{terceros.filter(t=>t.tipo?.includes(tipoCtx) && t.activo).length} activos · incluye los marcados como cliente y proveedor</p>
        </div>
        <div className="flex gap-2">
          {view !== 'lista' && (
            <button onClick={() => setView('lista')} className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold hover:bg-gray-100 transition-colors">Volver</button>
          )}
          {view === 'lista' && puede(permisos, ctx, 'crear') && (
            <button onClick={() => setView('nuevo')} className="px-5 py-2.5 bg-[#1168F8] text-white rounded-xl text-sm font-bold hover:bg-[#0a4fc4] transition-colors shadow-sm">+ Nuevo</button>
          )}
        </div>
      </div>

      {view === 'lista' && (
        <>

          <div className="flex gap-3 mb-4 flex-wrap items-center">
            <div className="relative flex-1 min-w-60">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🔍</span>
              <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar por nombre, documento..."
                className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white shadow-sm" />
            </div>
            <select value={filtroPais} onChange={e => setFiltroPais(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:border-[#1168F8] shadow-sm">
              <option value="">Todos los paises</option>
              {paises.map(p => <option key={p}>{p}</option>)}
            </select>
            {(buscar || filtroPais) && (
              <button onClick={() => { setBuscar(''); setFiltroPais('') }}
                className="px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-500 hover:bg-gray-50">✕ Limpiar</button>
            )}
            <span className="text-xs text-gray-400 ml-auto">{filtrados.length} registro(s)</span>
          </div>

          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
            {loading ? (
              <div className="p-12 text-center text-gray-400">Cargando...</div>
            ) : filtrados.length === 0 ? (
              <div className="p-12 text-center">
                <div className="text-4xl mb-3">🏢</div>
                <div className="text-gray-500 text-sm mb-1">{terceros.length === 0 ? 'Sin clientes ni proveedores aun' : 'Sin resultados'}</div>
                {terceros.length === 0 && puede(permisos, ctx, 'crear') && (
                  <button onClick={() => setView('nuevo')} className="mt-3 px-4 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold">+ Agregar primero</button>
                )}
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {['Razon social', 'Pais', 'Documento', 'Tipo', 'Contacto principal', 'Ciudad', ''].map(h => (
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
                        <td className="px-4 py-3.5 text-gray-500">{t.dir_fiscal_ciudad || '-'}</td>
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
          supabase={supabase} currentUser={currentUser} ctxTipo={tipoCtx}
          onSave={async () => { await loadData(); setView('lista') }}
          onCancel={() => setView('lista')}
        />
      )}

      {view === 'detalle' && sel && (
        <DetalleTercero
          tercero={sel} supabase={supabase} currentUser={currentUser} ctx={ctx}
          onReload={async () => { await loadData() }}
          onBack={() => setView('lista')}
        />
      )}
    </div>
  )
}

function FormTercero({ supabase, currentUser, onSave, onCancel, ctxTipo }: any) {
  const [form, setForm] = useState({
    razon_social: '', nombre_fantasia: '', pais: 'Argentina',
    tipo_doc: 'CUIT', nro_doc: '', condicion_iva: 'Responsable Inscripto',
    actividad: '', nro_importador: '',
    dir_comercial_calle: '', dir_comercial_ciudad: '', dir_comercial_provincia: '', dir_comercial_pais: 'Argentina', dir_comercial_cp: '',
    dir_fiscal_calle: '', dir_fiscal_ciudad: '', dir_fiscal_provincia: '', dir_fiscal_pais: 'Argentina', dir_fiscal_cp: '',
    notas: '', activo: true,
    tipo: [ctxTipo || 'cliente'] as string[],
  })
  const [fiscalIgual, setFiscalIgual] = useState(true)
  const [saving, setSaving] = useState(false)
  const inp = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white'
  const tiposDocs = TIPO_DOC_POR_PAIS[form.pais] || TIPO_DOC_POR_PAIS.default

  function toggleTipo(t: string) {
    setForm(f => ({ ...f, tipo: f.tipo.includes(t) ? f.tipo.filter(x => x !== t) : [...f.tipo, t] }))
  }

  async function handleSave() {
    if (!form.razon_social) { alert('La razon social es obligatoria'); return }
    if (form.tipo.length === 0) { alert('Selecciona al menos un tipo'); return }
    setSaving(true)
    const esChile = form.pais === 'Chile'
    const payload: any = { ...form, creado_por: currentUser?.nombre, creado_por_id: currentUser?.id }
    // Chile: no aplica condición de IVA ni N importador/exportador (van con el RUT).
    if (esChile) { payload.condicion_iva = null; payload.nro_importador = null }
    // Si el domicilio fiscal es igual al comercial, se copia del comercial.
    if (fiscalIgual) {
      DIR_CAMPOS.forEach(c => { payload[`dir_fiscal_${c}`] = (form as any)[`dir_comercial_${c}`] })
    }
    // Los datos bancarios NO se cargan en el alta: se agregan después desde el tab
    // "Cuentas bancarias" de la ficha (igual que los documentos).
    await (supabase.from('terceros') as any).insert(payload).select().single()
    await onSave()
    setSaving(false)
  }

  return (
    <div className="max-w-3xl space-y-4">
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

      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <h3 className="font-bold text-sm text-gray-900 mb-4">Datos generales</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Razon social *</label>
            <input value={form.razon_social} onChange={e => setForm(f => ({ ...f, razon_social: e.target.value }))} className={inp} placeholder="Nombre legal completo" />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Nombre fantasia</label>
            <input value={form.nombre_fantasia} onChange={e => setForm(f => ({ ...f, nombre_fantasia: e.target.value }))} className={inp} placeholder="Nombre comercial" />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Pais *</label>
            <select value={form.pais} onChange={e => setForm(f => ({ ...f, pais: e.target.value, tipo_doc: (TIPO_DOC_POR_PAIS[e.target.value] || TIPO_DOC_POR_PAIS.default)[0] }))} className={inp}>
              {PAISES.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">{form.pais === 'Chile' ? 'Actividad principal según SII' : 'Actividad principal según ARCA'}</label>
            <input value={form.actividad} onChange={e => setForm(f => ({ ...f, actividad: e.target.value }))} className={inp} placeholder="ej. Importacion de maquinaria" />
          </div>
        </div>
      </div>

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
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Numero</label>
            <input value={form.nro_doc} onChange={e => setForm(f => ({ ...f, nro_doc: e.target.value }))} className={inp} placeholder="ej. 20-12345678-9" />
          </div>
          {form.pais !== 'Chile' && (
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Condicion IVA</label>
            <select value={form.condicion_iva} onChange={e => setForm(f => ({ ...f, condicion_iva: e.target.value }))} className={inp}>
              {CONDICION_IVA.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          )}
          {form.pais !== 'Chile' && (
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">N importador / exportador</label>
            <input value={form.nro_importador} onChange={e => setForm(f => ({ ...f, nro_importador: e.target.value }))} className={inp} placeholder="Registro aduanero" />
          </div>
          )}
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <h3 className="font-bold text-sm text-gray-900 mb-1">Domicilio comercial</h3>
        <p className="text-[11px] text-gray-400 mb-4">El fijado por el estatuto / contrato social.</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Calle y numero</label>
            <input value={form.dir_comercial_calle} onChange={e => setForm(f => ({ ...f, dir_comercial_calle: e.target.value }))} className={inp} placeholder="ej. Av. Corrientes 1234" />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Ciudad</label>
            <input value={form.dir_comercial_ciudad} onChange={e => setForm(f => ({ ...f, dir_comercial_ciudad: e.target.value }))} className={inp} />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Provincia / Estado / Region</label>
            <input value={form.dir_comercial_provincia} onChange={e => setForm(f => ({ ...f, dir_comercial_provincia: e.target.value }))} className={inp} />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Pais</label>
            <select value={form.dir_comercial_pais} onChange={e => setForm(f => ({ ...f, dir_comercial_pais: e.target.value }))} className={inp}>
              {PAISES.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Codigo postal</label>
            <input value={form.dir_comercial_cp} onChange={e => setForm(f => ({ ...f, dir_comercial_cp: e.target.value }))} className={inp} />
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer mt-4 pt-4 border-t border-gray-100">
          <input type="checkbox" checked={fiscalIgual} onChange={e => setFiscalIgual(e.target.checked)} className="w-4 h-4 rounded" />
          <span className="text-xs text-gray-700 font-medium">El domicilio fiscal es igual al comercial</span>
        </label>

        {!fiscalIgual && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <h3 className="font-bold text-sm text-gray-900 mb-1">Domicilio fiscal</h3>
            <p className="text-[11px] text-gray-400 mb-4">{form.pais === 'Chile' ? 'El registrado en el SII.' : 'El registrado en ARCA / AFIP.'}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Calle y numero</label>
                <input value={form.dir_fiscal_calle} onChange={e => setForm(f => ({ ...f, dir_fiscal_calle: e.target.value }))} className={inp} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Ciudad</label>
                <input value={form.dir_fiscal_ciudad} onChange={e => setForm(f => ({ ...f, dir_fiscal_ciudad: e.target.value }))} className={inp} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Provincia / Estado / Region</label>
                <input value={form.dir_fiscal_provincia} onChange={e => setForm(f => ({ ...f, dir_fiscal_provincia: e.target.value }))} className={inp} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Pais</label>
                <select value={form.dir_fiscal_pais} onChange={e => setForm(f => ({ ...f, dir_fiscal_pais: e.target.value }))} className={inp}>
                  {PAISES.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Codigo postal</label>
                <input value={form.dir_fiscal_cp} onChange={e => setForm(f => ({ ...f, dir_fiscal_cp: e.target.value }))} className={inp} />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <h3 className="font-bold text-sm text-gray-900 mb-3">Notas</h3>
        <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
          className={inp + ' resize-none'} rows={3} placeholder="Observaciones generales..." />
      </div>

      <div className="bg-[#EBF2FF] border border-[#93B8FC] rounded-xl px-4 py-3 text-[11px] text-[#052698]">
        📎 Las <strong>cuentas bancarias</strong> y la <strong>documentación</strong> (estatuto, poderes, AFIP/SII, etc.) se cargan una vez guardado el tercero, desde los tabs <strong>Cuentas bancarias</strong> y <strong>Documentos</strong> de su ficha.
      </div>
      <div className="flex justify-between">
        <button onClick={onCancel} className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold hover:bg-gray-50">Cancelar</button>
        <button onClick={handleSave} disabled={saving}
          className="px-6 py-2.5 bg-[#1168F8] text-white rounded-xl text-xs font-bold hover:bg-[#0a4fc4] disabled:opacity-50 transition-colors shadow-sm">
          {saving ? 'Guardando...' : 'Guardar tercero'}
        </button>
      </div>
    </div>
  )
}

function DetalleTercero({ tercero, supabase, currentUser, onReload, onBack, ctx }: any) {
  const [tab, setTab] = useState<'datos' | 'contactos' | 'bancario' | 'documentos' | 'operaciones' | 'rubros'>('datos')
  const [guardadoMsg, setGuardadoMsg] = useState('')
  const [guardadoErr, setGuardadoErr] = useState(false)
  function flashGuardado(msg = 'Guardado ✓', esError = false) { setGuardadoMsg(msg); setGuardadoErr(esError); window.setTimeout(() => setGuardadoMsg(''), 1800) }
  const [contactos, setContactos] = useState<Contacto[]>(tercero.contactos || [])
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([])
  const [docs, setDocs] = useState<any[]>([])
  const [ops, setOps] = useState<any[]>([])
  const [rubros, setRubros] = useState<any[]>([])
  const [todosRubros, setTodosRubros] = useState<any[]>([])
  const [ciudades, setCiudades] = useState<any[]>([])
  const [lugares, setLugares] = useState<Set<string>>(new Set())  // "rubro_id|ciudad_id" donde el proveedor presta
  const [permisos, setPermisos] = useState<Record<string, string[]>>({})
  const [editando, setEditando] = useState(false)
  const [fiscalIgual, setFiscalIgual] = useState<boolean>(() => prepararDomicilios(tercero).igual)
  const [form, setForm] = useState<any>(() => ({
    ...prepararDomicilios(tercero).base,
    tipo: Array.isArray(tercero.tipo) ? [...tercero.tipo] : [tercero.tipo].filter(Boolean),
  }))
  const [newContacto, setNewContacto] = useState({ nombre: '', cargo: '', email: '', telefono: '', whatsapp: '', principal: false })
  const [newCuenta, setNewCuenta] = useState({ banco: '', cuenta: '', cbu_iban: '', swift: '', moneda: 'USD', principal: false, notas: '' })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [docForm, setDocForm] = useState({ tipo: 'estatuto', nombre_custom: '', referencia: '', fecha: '', notas: '' })
  const inp = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white'
  // Rubros que prestan en una ciudad concreta (Chile o Argentina). Forwarder/terrestre/seguro no cargan lugar.
  const PAISES_LUGAR = [{ code: 'AR', label: 'Argentina' }, { code: 'CL', label: 'Chile' }, { code: 'CN', label: 'China' }]

  useEffect(() => {
    loadDocs(); loadOps(); loadCuentas()
    cargarPermisos().then(setPermisos)
    if (tercero.tipo?.includes('proveedor')) loadRubros()
  }, [])

  async function loadCuentas() {
    const { data } = await supabase.from('tercero_cuentas_bancarias').select('*').eq('tercero_id', tercero.id).order('created_at')
    if (data) setCuentas(data)
  }

  async function loadRubros() {
    const [rubrosTercero, todosRes, pChileRes, pChinaRes, ciuArgRes, lugRes] = await Promise.all([
      supabase.from('tercero_rubros').select('rubro_id, rubro:proveedor_rubros(id,nombre,codigo,color,icono,descripcion,tiene_lugares_prestacion)').eq('tercero_id', tercero.id),
      supabase.from('proveedor_rubros').select('*').eq('activo', true).order('orden'),
      supabase.from('puertos_chile').select('id,ciudad,region').eq('activo', true).order('orden'),
      supabase.from('puertos_china').select('id,ciudad,region').eq('activo', true).order('orden'),
      supabase.from('ciudades_destino_arg').select('id,ciudad,provincia').eq('activo', true).order('orden'),
      supabase.from('tercero_lugares_prestacion').select('rubro_id,lugar_tipo,lugar_id').eq('tercero_id', tercero.id),
    ])
    if (rubrosTercero.data) setRubros((rubrosTercero.data as any[]).map(r => (r as any).rubro).filter(Boolean))
    if (todosRes.data) setTodosRubros(todosRes.data)
    // Lugares = unión de las tablas estables, con su tipo polimórfico. Una sola fuente de verdad.
    const lugaresUnificados: any[] = [
      ...((pChileRes.data as any[]) || []).map(c => ({ lugar_tipo: 'puerto_chile', id: c.id, ciudad: c.ciudad, pais: 'CL', region: c.region })),
      ...((pChinaRes.data as any[]) || []).map(c => ({ lugar_tipo: 'puerto_china', id: c.id, ciudad: c.ciudad, pais: 'CN', region: c.region })),
      ...((ciuArgRes.data as any[]) || []).map(c => ({ lugar_tipo: 'ciudad_arg', id: c.id, ciudad: c.ciudad, pais: 'AR', region: c.provincia })),
    ]
    setCiudades(lugaresUnificados)
    if (lugRes.data) setLugares(new Set((lugRes.data as any[]).map(l => l.rubro_id + '|' + l.lugar_tipo + ':' + l.lugar_id)))
  }

  // Togglea un lugar (puerto/ciudad estable) como lugar de prestación de un rubro del proveedor.
  async function toggleLugar(rubroId: string, lugarTipo: string, lugarId: string) {
    const key = rubroId + '|' + lugarTipo + ':' + lugarId
    const ya = lugares.has(key)
    setLugares(prev => { const n = new Set(prev); if (ya) n.delete(key); else n.add(key); return n })
    const { error } = ya
      ? await supabase.from('tercero_lugares_prestacion').delete().eq('tercero_id', tercero.id).eq('rubro_id', rubroId).eq('lugar_tipo', lugarTipo).eq('lugar_id', lugarId)
      : await (supabase.from('tercero_lugares_prestacion') as any).insert({ tercero_id: tercero.id, rubro_id: rubroId, lugar_tipo: lugarTipo, lugar_id: lugarId })
    if (error) {
      // Revertir el cambio optimista si la base lo rechazó
      setLugares(prev => { const n = new Set(prev); if (ya) n.add(key); else n.delete(key); return n })
      flashGuardado('No se pudo guardar', true)
    } else {
      flashGuardado()
    }
  }

  async function toggleRubro(rubroId: string) {
    const yaAsignado = rubros.some((r: any) => r.id === rubroId)
    if (yaAsignado) {
      await supabase.from('tercero_rubros').delete().eq('tercero_id', tercero.id).eq('rubro_id', rubroId)
      // Los lugares de prestación cuelgan del rubro asignado: si se desasigna, se limpian.
      await supabase.from('tercero_lugares_prestacion').delete().eq('tercero_id', tercero.id).eq('rubro_id', rubroId)
      setRubros(prev => prev.filter((r: any) => r.id !== rubroId))
      setLugares(prev => { const n = new Set<string>(); prev.forEach(k => { if (!k.startsWith(rubroId + '|')) n.add(k) }); return n })
    } else {
      await (supabase.from('tercero_rubros') as any).insert({ tercero_id: tercero.id, rubro_id: rubroId })
      const nuevo = todosRubros.find(r => r.id === rubroId)
      if (nuevo) setRubros(prev => [...prev, nuevo])
    }
    flashGuardado()
  }

  async function loadDocs() {
    const { data } = await supabase.from('tercero_documentos').select('*').eq('tercero_id', tercero.id).order('created_at', { ascending: false })
    if (data) setDocs(data)
  }

  async function loadOps() {
    const { data } = await supabase.from('cotizaciones').select('id, num, cliente, estado, created_at').eq('tercero_id', tercero.id).order('created_at', { ascending: false })
    if (data) setOps(data)
  }

  function iniciarEdicion() {
    const { base, igual } = prepararDomicilios(tercero)
    setForm({ ...base, tipo: Array.isArray(tercero.tipo) ? [...tercero.tipo] : [tercero.tipo].filter(Boolean) })
    setFiscalIgual(igual)
  }

  // ── FIX: guardar tipo como array explícito ──
  async function saveData() {
    setSaving(true)
    const tipoArray = Array.isArray(form.tipo) ? form.tipo : [form.tipo].filter(Boolean)
    const esChile = form.pais === 'Chile'
    // Domicilio fiscal: si está marcado "igual al comercial", se copia del comercial.
    const fis: any = {}
    DIR_CAMPOS.forEach(c => { fis[c] = fiscalIgual ? (form[`dir_comercial_${c}`] || null) : (form[`dir_fiscal_${c}`] || null) })
    const { error } = await (supabase.from('terceros') as any).update({
      razon_social:        form.razon_social,
      nombre_fantasia:     form.nombre_fantasia    || null,
      pais:                form.pais,
      tipo:                tipoArray,
      tipo_doc:            form.tipo_doc            || null,
      nro_doc:             form.nro_doc             || null,
      // Chile no usa condición de IVA ni N importador/exportador (van con el RUT).
      condicion_iva:       esChile ? null : (form.condicion_iva || null),
      actividad:           form.actividad           || null,
      nro_importador:      esChile ? null : (form.nro_importador || null),
      dir_comercial_calle:    form.dir_comercial_calle    || null,
      dir_comercial_ciudad:   form.dir_comercial_ciudad   || null,
      dir_comercial_provincia:form.dir_comercial_provincia|| null,
      dir_comercial_pais:     form.dir_comercial_pais     || null,
      dir_comercial_cp:       form.dir_comercial_cp       || null,
      dir_fiscal_calle:    fis.calle,
      dir_fiscal_ciudad:   fis.ciudad,
      dir_fiscal_provincia:fis.provincia,
      dir_fiscal_pais:     fis.pais,
      dir_fiscal_cp:       fis.cp,
      notas:               form.notas               || null,
      activo:              form.activo,
    }).eq('id', tercero.id)
    if (error) console.error('Error guardando tercero:', error)
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
    if (!confirm('Eliminar contacto?')) return
    await supabase.from('tercero_contactos').delete().eq('id', id)
    setContactos(c => c.filter(x => x.id !== id))
  }

  async function addCuenta() {
    if (!newCuenta.banco && !newCuenta.cuenta && !newCuenta.cbu_iban) return
    await (supabase.from('tercero_cuentas_bancarias') as any).insert({ ...newCuenta, tercero_id: tercero.id })
    await loadCuentas()
    setNewCuenta({ banco: '', cuenta: '', cbu_iban: '', swift: '', moneda: 'USD', principal: false, notas: '' })
  }

  async function deleteCuenta(id: string) {
    if (!confirm('Eliminar cuenta bancaria?')) return
    await supabase.from('tercero_cuentas_bancarias').delete().eq('id', id)
    setCuentas(c => c.filter(x => x.id !== id))
  }

  async function subirDoc(file: File) {
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `${tercero.id}/${Date.now()}.${ext}`
    await supabase.storage.from('terceros').upload(path, file, { upsert: true })
    const { data: urlData } = await supabase.storage.from('terceros').createSignedUrl(path, 3600)
    if (urlData?.signedUrl) {
      await (supabase.from('tercero_documentos') as any).insert({
        tercero_id: tercero.id,
        tipo: docForm.tipo,
        nombre_custom: docForm.tipo === 'otro' ? docForm.nombre_custom : null,
        referencia: docForm.referencia || null,
        fecha: docForm.fecha || null,
        notas: docForm.notas || null,
        archivo_url: path,  // guardamos el path para generar signed URL al mostrar
        archivo_nombre: file.name,
        subido_por: currentUser?.nombre,
      })
      await loadDocs()
    }
    setUploading(false)
  }

  const TIPOS_DOC_LABEL: Record<string, string> = {
    estatuto:          'Estatuto / Acta constitutiva',
    acta_autoridades:  'Acta designación de autoridades',
    poder:             'Poder notarial',
    afip:              'Constancia inscripción AFIP',
    ib:                'Formulario Ingresos Brutos (IIBB)',
    rut_cuit:          'RUT / CUIT / Constancia fiscal',
    certificado:       'Certificado / Habilitación',
    dni_pasaporte:     'DNI / Pasaporte representante',
    contrato:          'Contrato marco',
    factura_proforma:  'Factura proforma',
    otro:              'Otro',
  }

  const tiposDocs = TIPO_DOC_POR_PAIS[form.pais] || TIPO_DOC_POR_PAIS.default

  // Permisos de archivos: esta pantalla es la de terceros (ruta /clientes); el control de
  // Documentos del tercero: permiso PROPIO y separado de ver/editar el cliente o proveedor.
  const ctxDoc = ctx === 'proveedores' ? 'proveedores_documentos' : 'clientes_documentos'
  const puedeVerDoc = puede(permisos, ctxDoc, 'ver')
  const puedeDescargarDoc = puede(permisos, ctxDoc, 'descargar')
  const puedeSubirDoc = puede(permisos, ctxDoc, 'crear')
  const puedeEditar = puede(permisos, ctx, 'editar')
  const puedeEliminar = puede(permisos, ctx, 'eliminar')

  return (
    <div>
      {guardadoMsg && (
        <div className={`fixed bottom-6 right-6 z-50 text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg ${guardadoErr ? 'bg-red-600 text-white' : 'bg-green-600 text-white'}`}>
          {guardadoMsg}
        </div>
      )}
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
                  {tercero.activo ? 'Activo' : 'Inactivo'}
                </span>
              </div>
              {tercero.nombre_fantasia && <div className="text-xs text-gray-400 mt-0.5">{tercero.nombre_fantasia}</div>}
              <div className="flex gap-4 mt-1 text-xs text-gray-500">
                <span>{tercero.pais}</span>
                {tercero.nro_doc && <span className="font-mono">{tercero.tipo_doc}: {tercero.nro_doc}</span>}
                {tercero.dir_fiscal_ciudad && <span>{tercero.dir_fiscal_ciudad}</span>}
              </div>
              {rubros.length > 0 && (
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {rubros.map((r: any) => (
                    <span key={r.id} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white" style={{ background: r.color }}>
                      {r.icono} {r.nombre}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          {puedeEditar && tab === 'datos' && (
          <button onClick={() => { if (editando) { setEditando(false) } else { iniciarEdicion(); setEditando(true) } }}
            className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-colors ${editando ? 'bg-gray-100 border-gray-200 text-gray-600' : 'border-[#1168F8] text-[#1168F8] hover:bg-[#EBF2FF]'}`}>
            {editando ? 'Cancelar' : 'Editar'}
          </button>
          )}
        </div>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {[
          { key: 'datos', label: 'Datos generales' },
          { key: 'contactos', label: `Contactos (${contactos.length})` },
          { key: 'bancario', label: `Cuentas bancarias (${cuentas.length})` },
          { key: 'documentos', label: `Documentos (${docs.length})` },
          { key: 'operaciones', label: `Operaciones (${ops.length})` },
          ...(tercero.tipo?.includes('proveedor') ? [{ key: 'rubros', label: `Rubros (${rubros.length})` }] : []),
        ].map(t => (
          <button key={t.key} onClick={() => { setTab(t.key as any); if (t.key !== 'datos') setEditando(false) }}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all shadow-sm ${tab === t.key ? 'bg-[#1168F8] text-white shadow-md' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'datos' && (
        <div className="space-y-4">
          {editando ? (
            <>
              <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                <h3 className="font-bold text-sm text-gray-900 mb-3">Tipo de tercero</h3>
                <div className="flex gap-3">
                  {[
                    { key: 'cliente', label: 'Cliente', icon: '🤝', desc: 'Contrata servicios a Puerto NOA' },
                    { key: 'proveedor', label: 'Proveedor', icon: '📦', desc: 'Presta servicios a Puerto NOA' },
                  ].map(o => {
                    const tipoActual = Array.isArray(form.tipo) ? form.tipo : []
                    const seleccionado = tipoActual.includes(o.key)
                    return (
                      <button key={o.key} onClick={() => {
                        const nuevos = seleccionado
                          ? tipoActual.filter((x: string) => x !== o.key)
                          : [...tipoActual, o.key]
                        if (nuevos.length === 0) return
                        setForm((f: any) => ({ ...f, tipo: nuevos }))
                      }}
                        className={`flex-1 px-4 py-3 rounded-xl border-2 text-left transition-all ${seleccionado ? 'border-[#1168F8] bg-[#EBF2FF]' : 'border-gray-200 hover:bg-gray-50'}`}>
                        <div className="text-base mb-1">{o.icon}</div>
                        <div className="font-bold text-sm text-gray-900">{o.label}</div>
                        <div className="text-[10px] text-gray-400">{o.desc}</div>
                      </button>
                    )
                  })}
                </div>
                {Array.isArray(form.tipo) && form.tipo.includes('cliente') && form.tipo.includes('proveedor') && (
                  <div className="mt-2 text-[10px] text-amber-600 font-medium">↔️ Registrado como cliente y proveedor simultáneamente</div>
                )}
              </div>

              <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                <h3 className="font-bold text-sm text-gray-900 mb-4">Datos generales</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Razon social</label>
                    <input value={form.razon_social} onChange={e => setForm((f: any) => ({ ...f, razon_social: e.target.value }))} className={inp} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Nombre fantasia</label>
                    <input value={form.nombre_fantasia || ''} onChange={e => setForm((f: any) => ({ ...f, nombre_fantasia: e.target.value }))} className={inp} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Pais</label>
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
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Numero</label>
                    <input value={form.nro_doc || ''} onChange={e => setForm((f: any) => ({ ...f, nro_doc: e.target.value }))} className={inp} />
                  </div>
                  {form.pais !== 'Chile' && (
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Condicion IVA</label>
                    <select value={form.condicion_iva || ''} onChange={e => setForm((f: any) => ({ ...f, condicion_iva: e.target.value }))} className={inp}>
                      {CONDICION_IVA.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  )}
                  {form.pais !== 'Chile' && (
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">N importador / exportador</label>
                    <input value={form.nro_importador || ''} onChange={e => setForm((f: any) => ({ ...f, nro_importador: e.target.value }))} className={inp} />
                  </div>
                  )}
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">{form.pais === 'Chile' ? 'Actividad principal según SII' : 'Actividad principal según ARCA'}</label>
                    <input value={form.actividad || ''} onChange={e => setForm((f: any) => ({ ...f, actividad: e.target.value }))} className={inp} />
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                <h3 className="font-bold text-sm text-gray-900 mb-1">Domicilio comercial</h3>
                <p className="text-[11px] text-gray-400 mb-4">El fijado por el estatuto / contrato social.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Calle y numero</label>
                    <input value={form.dir_comercial_calle || ''} onChange={e => setForm((f: any) => ({ ...f, dir_comercial_calle: e.target.value }))} className={inp} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Ciudad</label>
                    <input value={form.dir_comercial_ciudad || ''} onChange={e => setForm((f: any) => ({ ...f, dir_comercial_ciudad: e.target.value }))} className={inp} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Provincia / Region</label>
                    <input value={form.dir_comercial_provincia || ''} onChange={e => setForm((f: any) => ({ ...f, dir_comercial_provincia: e.target.value }))} className={inp} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Pais</label>
                    <select value={form.dir_comercial_pais || form.pais} onChange={e => setForm((f: any) => ({ ...f, dir_comercial_pais: e.target.value }))} className={inp}>
                      {PAISES.map(p => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Codigo postal</label>
                    <input value={form.dir_comercial_cp || ''} onChange={e => setForm((f: any) => ({ ...f, dir_comercial_cp: e.target.value }))} className={inp} />
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer mt-4 pt-4 border-t border-gray-100">
                  <input type="checkbox" checked={fiscalIgual} onChange={e => setFiscalIgual(e.target.checked)} className="w-4 h-4 rounded" />
                  <span className="text-xs text-gray-700 font-medium">El domicilio fiscal es igual al comercial</span>
                </label>

                {!fiscalIgual && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <h3 className="font-bold text-sm text-gray-900 mb-1">Domicilio fiscal</h3>
                    <p className="text-[11px] text-gray-400 mb-4">{form.pais === 'Chile' ? 'El registrado en el SII.' : 'El registrado en ARCA / AFIP.'}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Calle y numero</label>
                        <input value={form.dir_fiscal_calle || ''} onChange={e => setForm((f: any) => ({ ...f, dir_fiscal_calle: e.target.value }))} className={inp} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Ciudad</label>
                        <input value={form.dir_fiscal_ciudad || ''} onChange={e => setForm((f: any) => ({ ...f, dir_fiscal_ciudad: e.target.value }))} className={inp} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Provincia / Region</label>
                        <input value={form.dir_fiscal_provincia || ''} onChange={e => setForm((f: any) => ({ ...f, dir_fiscal_provincia: e.target.value }))} className={inp} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Pais</label>
                        <select value={form.dir_fiscal_pais || form.pais} onChange={e => setForm((f: any) => ({ ...f, dir_fiscal_pais: e.target.value }))} className={inp}>
                          {PAISES.map(p => <option key={p}>{p}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Codigo postal</label>
                        <input value={form.dir_fiscal_cp || ''} onChange={e => setForm((f: any) => ({ ...f, dir_fiscal_cp: e.target.value }))} className={inp} />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                <h3 className="font-bold text-sm text-gray-900 mb-3">Notas</h3>
                <textarea value={form.notas || ''} onChange={e => setForm((f: any) => ({ ...f, notas: e.target.value }))}
                  className={inp + ' resize-none'} rows={2} />
              </div>

              <div className="flex justify-end gap-2">
                <button onClick={() => setEditando(false)} className="px-4 py-2 border border-gray-200 rounded-xl text-xs">Cancelar</button>
                <button onClick={saveData} disabled={saving} className="px-5 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold disabled:opacity-50">
                  {saving ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </>
          ) : (
            <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
              <div className="grid grid-cols-3 gap-x-8 gap-y-4">
                {(() => {
                  const comVacio = dirVacia(tercero, 'dir_comercial')
                  const fisVacio = dirVacia(tercero, 'dir_fiscal')
                  const distintos = !comVacio && !fisVacio && !dirIguales(tercero, 'dir_comercial', 'dir_fiscal')
                  // Registros viejos sin comercial: se muestra el fiscal como domicilio.
                  const cp = comVacio && !fisVacio ? 'dir_fiscal' : 'dir_comercial'
                  return [
                    { l: 'Pais', v: tercero.pais },
                    { l: tercero.pais === 'Chile' ? 'Actividad principal según SII' : 'Actividad principal según ARCA', v: tercero.actividad },
                    ...(tercero.pais !== 'Chile' ? [
                      { l: 'Condicion IVA', v: tercero.condicion_iva },
                      { l: 'N importador / exportador', v: tercero.nro_importador },
                    ] : []),
                    { l: tercero.tipo_doc || 'Documento', v: tercero.nro_doc },
                    { l: 'Domicilio comercial', v: tercero[`${cp}_calle`] },
                    { l: 'Ciudad', v: tercero[`${cp}_ciudad`] },
                    { l: 'Provincia / Region', v: tercero[`${cp}_provincia`] },
                    { l: 'Pais domicilio', v: tercero[`${cp}_pais`] },
                    { l: 'Codigo postal', v: tercero[`${cp}_cp`] },
                    ...(distintos ? [
                      { l: 'Domicilio fiscal', v: tercero.dir_fiscal_calle },
                      { l: 'Ciudad fiscal', v: tercero.dir_fiscal_ciudad },
                      { l: 'Provincia fiscal', v: tercero.dir_fiscal_provincia },
                      { l: 'Pais fiscal', v: tercero.dir_fiscal_pais },
                      { l: 'CP fiscal', v: tercero.dir_fiscal_cp },
                    ] : []),
                  ]
                })().filter(r => r.v).map(r => (
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

      {tab === 'contactos' && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
            <h3 className="font-bold text-sm text-gray-900 mb-4">Agregar contacto</h3>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Nombre *</label>
                <input value={newContacto.nombre} onChange={e => setNewContacto(f => ({ ...f, nombre: e.target.value }))} className={inp} /></div>
              <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Cargo</label>
                <input value={newContacto.cargo} onChange={e => setNewContacto(f => ({ ...f, cargo: e.target.value }))} className={inp} /></div>
              <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Email</label>
                <input type="email" value={newContacto.email} onChange={e => setNewContacto(f => ({ ...f, email: e.target.value }))} className={inp} /></div>
              <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Telefono</label>
                <input value={newContacto.telefono} onChange={e => setNewContacto(f => ({ ...f, telefono: e.target.value }))} className={inp} /></div>
              <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">WhatsApp</label>
                <input value={newContacto.whatsapp} onChange={e => setNewContacto(f => ({ ...f, whatsapp: e.target.value }))} className={inp} /></div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer pb-2">
                  <input type="checkbox" checked={newContacto.principal} onChange={e => setNewContacto(f => ({ ...f, principal: e.target.checked }))} className="w-4 h-4 rounded" />
                  <span className="text-xs text-gray-600 font-medium">Contacto principal</span>
                </label>
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={addContacto} className="px-4 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold">+ Agregar</button>
            </div>
          </div>
          {contactos.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-xs">
                <thead><tr className="bg-gray-50 border-b border-gray-100">
                  {['Nombre','Cargo','Email','Telefono','WhatsApp',''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {contactos.map(c => (
                    <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3 font-semibold text-gray-800">{c.nombre}{c.principal && <span className="ml-1.5 px-1.5 py-0.5 bg-[#EBF2FF] text-[#052698] rounded text-[9px] font-bold">Principal</span>}</td>
                      <td className="px-4 py-3 text-gray-500">{c.cargo || '-'}</td>
                      <td className="px-4 py-3 text-[#1168F8]">{c.email || '-'}</td>
                      <td className="px-4 py-3 font-mono text-[10px]">{c.telefono || '-'}</td>
                      <td className="px-4 py-3 font-mono text-[10px] text-green-700">{c.whatsapp || '-'}</td>
                      <td className="px-4 py-3">{puedeEliminar && <button onClick={() => deleteContacto(c.id)} className="text-gray-400 hover:text-red-500">X</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'bancario' && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
            <h3 className="font-bold text-sm text-gray-900 mb-4">Agregar cuenta bancaria</h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Banco</label>
                <input value={newCuenta.banco} onChange={e => setNewCuenta(f => ({ ...f, banco: e.target.value }))} className={inp} /></div>
              <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Moneda</label>
                <select value={newCuenta.moneda} onChange={e => setNewCuenta(f => ({ ...f, moneda: e.target.value }))} className={inp}>
                  {MONEDAS.map(m => <option key={m}>{m}</option>)}
                </select></div>
              <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">N cuenta</label>
                <input value={newCuenta.cuenta} onChange={e => setNewCuenta(f => ({ ...f, cuenta: e.target.value }))} className={inp} /></div>
              <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">CBU / IBAN</label>
                <input value={newCuenta.cbu_iban} onChange={e => setNewCuenta(f => ({ ...f, cbu_iban: e.target.value }))} className={inp} /></div>
              <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">SWIFT / BIC</label>
                <input value={newCuenta.swift} onChange={e => setNewCuenta(f => ({ ...f, swift: e.target.value }))} className={inp} /></div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer pb-2">
                  <input type="checkbox" checked={newCuenta.principal} onChange={e => setNewCuenta(f => ({ ...f, principal: e.target.checked }))} className="w-4 h-4 rounded" />
                  <span className="text-xs text-gray-600 font-medium">Cuenta principal</span>
                </label>
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={addCuenta} className="px-4 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold">+ Agregar</button>
            </div>
          </div>
          {cuentas.length > 0 ? (
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-xs">
                <thead><tr className="bg-gray-50 border-b border-gray-100">
                  {['Banco','Moneda','N Cuenta','CBU / IBAN','SWIFT',''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {cuentas.map(c => (
                    <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3 font-semibold text-gray-800">{c.banco || '-'}{c.principal && <span className="ml-1.5 px-1.5 py-0.5 bg-[#EBF2FF] text-[#052698] rounded text-[9px] font-bold">Principal</span>}</td>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 bg-gray-100 rounded-full text-[10px] font-bold text-gray-600">{c.moneda}</span></td>
                      <td className="px-4 py-3 font-mono text-[11px]">{c.cuenta || '-'}</td>
                      <td className="px-4 py-3 font-mono text-[10px] text-gray-500">{c.cbu_iban || '-'}</td>
                      <td className="px-4 py-3 font-mono text-[10px] text-gray-500">{c.swift || '-'}</td>
                      <td className="px-4 py-3">{puedeEliminar && <button onClick={() => deleteCuenta(c.id)} className="text-gray-400 hover:text-red-500">X</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center text-gray-400 text-sm shadow-sm">Sin cuentas bancarias cargadas.</div>
          )}
        </div>
      )}

      {tab === 'documentos' && (
        <div className="space-y-4">
          {puedeSubirDoc && (
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
            <h3 className="font-bold text-sm text-gray-900 mb-4">Agregar documento</h3>
            <div className="grid grid-cols-4 gap-3 mb-3">
              <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Tipo</label>
                <select value={docForm.tipo} onChange={e => setDocForm(f => ({ ...f, tipo: e.target.value }))} className={inp}>
                  {Object.entries(TIPOS_DOC_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select></div>
              {docForm.tipo === 'otro' && (
                <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Nombre *</label>
                  <input value={docForm.nombre_custom} onChange={e => setDocForm(f => ({ ...f, nombre_custom: e.target.value }))} className={inp} /></div>
              )}
              <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">
                {docForm.tipo === 'afip' ? 'Código verificador' : 'Referencia'}
              </label>
                <input value={docForm.referencia} onChange={e => setDocForm(f => ({ ...f, referencia: e.target.value }))} className={inp}
                  placeholder={docForm.tipo === 'afip' ? 'Código verificador AFIP' : 'N° referencia, folio, etc.'}/></div>
              <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">
                {docForm.tipo === 'afip' ? 'Fecha de emisión' : 'Fecha'}
              </label>
                <input type="date" value={docForm.fecha} onChange={e => setDocForm(f => ({ ...f, fecha: e.target.value }))} className={inp} /></div>
            </div>
            <div className="mb-3">
              <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Notas (opcional)</label>
              <input value={docForm.notas || ''} onChange={e => setDocForm(f => ({ ...f, notas: e.target.value }))}
                className={inp} placeholder="Observaciones sobre este documento"/>
            </div>
            <label className={`flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-[#93B8FC] rounded-xl text-xs text-[#1168F8] hover:bg-[#EBF2FF] cursor-pointer transition-colors ${uploading ? 'opacity-60' : ''} w-fit`}>
              📎 {uploading ? 'Subiendo...' : 'Seleccionar y subir archivo'}
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" disabled={uploading}
                onChange={e => { const f = e.target.files?.[0]; if (f) subirDoc(f) }} />
            </label>
          </div>
          )}
          {(puedeVerDoc || puedeDescargarDoc) && docs.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
              <div className="divide-y divide-gray-50">
                {docs.map((d: any) => (
                  <div key={d.id} className="flex items-center gap-4 px-5 py-3.5">
                    <div className="w-8 h-8 rounded-lg bg-[#EBF2FF] flex items-center justify-center text-[#1168F8] text-sm flex-shrink-0">
                      📄
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-gray-800">{TIPOS_DOC_LABEL[d.tipo] || d.nombre_custom || d.tipo}</div>
                      <div className="text-[10px] text-gray-400 flex gap-3 mt-0.5 flex-wrap">
                        {d.referencia && <span className="font-mono">Ref: {d.referencia}</span>}
                        {d.fecha && <span>{d.fecha.split('-').reverse().join('/')}</span>}
                        {d.archivo_nombre && <span className="truncate">{d.archivo_nombre}</span>}
                        {d.subido_por && <span>por {d.subido_por}</span>}
                      </div>
                      {d.notas && <div className="text-[10px] text-gray-500 mt-0.5 italic">{d.notas}</div>}
                    </div>
                    {d.archivo_url ? (
                      (puedeVerDoc || puedeDescargarDoc) ? (
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {puedeVerDoc && (
                            <button onClick={()=>abrirConMarca('terceros', d.archivo_url)} className="px-3 py-1.5 bg-[#EBF2FF] text-[#1168F8] rounded-lg text-xs font-medium hover:bg-[#93B8FC]">📄 Ver</button>
                          )}
                          {puedeDescargarDoc && (
                            <button onClick={async()=>{
                              const {data} = await supabase.storage.from('terceros').createSignedUrl(d.archivo_url,3600,{download:d.archivo_nombre||'documento'})
                              if(data?.signedUrl){const a=document.createElement('a');a.href=data.signedUrl;a.download=d.archivo_nombre||'documento';a.click()}
                            }} className="px-3 py-1.5 bg-gray-50 border border-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-100">⬇ Descargar</button>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-300 text-[10px] flex-shrink-0">Sin permiso</span>
                      )
                    ) : (
                      <span className="text-gray-300 text-[10px]">Sin archivo</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'operaciones' && (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
          {ops.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">Sin operaciones vinculadas.</div>
          ) : (
            <table className="w-full text-xs">
              <thead><tr className="bg-gray-50 border-b border-gray-100">
                {['N Cotizacion','Cliente','Estado','Fecha'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {ops.map((o: any) => (
                  <tr key={o.num} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3"><Link href={`/registro/${o.id}`} className="font-mono text-[#1168F8] hover:underline font-bold">{o.num}</Link></td>
                    <td className="px-4 py-3 text-gray-700">{o.cliente}</td>
                    <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600">{o.estado}</span></td>
                    <td className="px-4 py-3 text-gray-400 font-mono text-[10px]">{o.created_at?.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'rubros' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-[11px] text-green-700 bg-green-50 border border-green-100 rounded-xl px-3.5 py-2.5">
            <span className="text-sm">✓</span>
            <span>Los rubros y lugares se guardan <strong>automáticamente</strong> al marcarlos. No hace falta apretar "Guardar".</span>
          </div>
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
            <div className="mb-4">
              <div className="text-sm font-bold text-gray-900 mb-1">Rubros asignados</div>
              <div className="text-[10px] text-gray-400">Determina en que bloque del cotizador aparece este proveedor</div>
            </div>
            {todosRubros.length === 0 ? (
              <div className="text-xs text-gray-400 bg-gray-50 rounded-xl px-4 py-3 text-center">No hay rubros configurados.</div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {todosRubros.map(r => {
                  const asignado = rubros.some((x: any) => x.id === r.id)
                  return (
                    <button key={r.id} onClick={() => toggleRubro(r.id)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${asignado ? '' : 'border-gray-200 hover:border-gray-300 bg-gray-50'}`}
                      style={asignado ? { background: r.color + '15', borderColor: r.color + '40' } : {}}>
                      <span className="text-xl flex-shrink-0">{r.icono}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold truncate" style={asignado ? { color: r.color } : { color: '#374151' }}>{r.nombre}</div>
                        {r.descripcion && <div className="text-[10px] text-gray-400 truncate mt-0.5">{r.descripcion}</div>}
                      </div>
                      {asignado && <span className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ background: r.color }}>v</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Lugares de prestación — solo para rubros asignados que prestan en una ciudad concreta */}
          {rubros.some((r: any) => r.tiene_lugares_prestacion === true) && (
            <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
              <div className="mb-4">
                <div className="text-sm font-bold text-gray-900 mb-1">Lugares de prestación</div>
                <div className="text-[10px] text-gray-400">Ciudades donde este proveedor presta cada servicio. Al cotizar se marca si coinciden con la operación.</div>
              </div>
              <div className="space-y-4">
                {(() => {
                  // El domicilio fiscal del proveedor define el orden y el destaque visual de los países.
                  const mapPais: Record<string, string> = { argentina: 'AR', chile: 'CL', china: 'CN' }
                  const paisFiscal = mapPais[String(tercero.dir_fiscal_pais || tercero.pais || '').trim().toLowerCase()] || ''
                  const paisesOrden = [...PAISES_LUGAR].sort((a, b) => (a.code === paisFiscal ? -1 : b.code === paisFiscal ? 1 : 0))
                  return rubros.filter((r: any) => r.tiene_lugares_prestacion === true).map((r: any) => (
                  <div key={r.id} className="border border-gray-100 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-2.5">
                      <span className="text-base flex-shrink-0">{r.icono}</span>
                      <span className="text-xs font-semibold" style={{ color: r.color }}>{r.nombre}</span>
                    </div>
                    {paisesOrden.map(p => {
                      const ciuPais = ciudades.filter((c: any) => c.pais === p.code)
                      if (ciuPais.length === 0) return null
                      const esFiscal = p.code === paisFiscal
                      return (
                        <div key={p.code} className="mb-2 last:mb-0">
                          <div className={`text-[10px] mb-1 font-semibold ${esFiscal ? 'text-[#1168F8]' : 'text-gray-400'}`}>
                            {p.label}{esFiscal ? ' · domicilio fiscal' : ''}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {ciuPais.map((c: any) => {
                              const on = lugares.has(r.id + '|' + c.lugar_tipo + ':' + c.id)
                              const cls = on
                                ? 'bg-[#1168F8] text-white border-[#1168F8]'
                                : esFiscal
                                  ? 'bg-[#EBF2FF] text-[#1168F8] border-[#BBD3FF] hover:border-[#1168F8]'
                                  : 'bg-gray-50 text-gray-400 border-gray-200 hover:border-gray-300'
                              return (
                                <button key={c.lugar_tipo + c.id} onClick={() => toggleLugar(r.id, c.lugar_tipo, c.id)}
                                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${cls}`}>
                                  {on ? '✓ ' : ''}{c.ciudad}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  ))
                })()}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
