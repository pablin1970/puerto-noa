'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { fmt } from '@/lib/utils'

interface CotProv {
  id: string
  proveedor: string
  referencia: string
  fecha: string
  tipo: 'generica' | 'especifica'
  operacion_id: string | null
  archivo_url: string | null
  archivo_nombre: string | null
  estado: 'vigente' | 'vencida'
  notas: string
  creado_por: string
  created_at: string
  items?: CotProvItem[]
  operacion?: { cotizacion?: { num: string; cliente: string } }
}

interface CotProvItem {
  id: string
  cotizacion_id: string
  tipo_servicio: string
  descripcion: string
  ruta_origen: string
  ruta_destino: string
  tipo_equipo: string
  moneda: string
  valor: number
  tipo_calculo: string
  piso_usd: number
  techo_usd: number
  notas: string
  orden: number
}

const TIPOS_SERVICIO: Record<string, string> = {
  maritima: '🚢 Flete marítimo',
  terrestre: '🚛 Flete terrestre',
  puerto: '⚓ Gastos puerto Chile',
  argentina: '🇦🇷 Gastos Argentina',
  otro: '📋 Otro',
}

const TIPO_CALCULO_L: Record<string, string> = {
  fijo_usd: 'Fijo USD',
  fijo_ars: 'Fijo ARS',
  pct_cif: '% sobre CIF',
}

export default function TarifasPage() {
  const supabase = useMemo(() => createClient(), [])
  const [cots, setCots] = useState<CotProv[]>([])
  const [loading, setLoading] = useState(true)
  const [selId, setSelId] = useState<string | null>(null)
  const [view, setView] = useState<'lista' | 'detalle' | 'nueva' | 'comparativa'>('lista')
  const [filtroProveedor, setFiltroProveedor] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('vigente')
  const [currentUser, setCurrentUser] = useState<{ id: string; nombre: string } | null>(null)
  const [previewModal, setPreviewModal] = useState<{ url: string; nombre: string } | null>(null)
  const [ops, setOps] = useState<any[]>([])

  useEffect(() => { loadUser(); loadData(); loadOps() }, [])

  async function loadUser() {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return
    const { data: u } = await supabase.from('usuarios').select('id, nombre').eq('auth_id', auth.user.id).single()
    if (u) setCurrentUser(u as any)
  }

  async function loadOps() {
    const { data } = await supabase.from('operaciones').select('id, cotizacion:cotizaciones(num, cliente)').order('created_at', { ascending: false })
    if (data) setOps(data as any[])
  }

  async function loadData() {
    setLoading(true)
    const { data } = await supabase
      .from('cotizaciones_proveedor')
      .select('*, items:cotizacion_proveedor_items(*), operacion:operaciones(cotizacion:cotizaciones(num,cliente))')
      .order('fecha', { ascending: false })
    if (data) setCots(data as CotProv[])
    setLoading(false)
  }

  const selCot = cots.find(c => c.id === selId)
  const proveedores = [...new Set(cots.map(c => c.proveedor))].sort()

  const filtradas = cots.filter(c => {
    const matchP = !filtroProveedor || c.proveedor === filtroProveedor
    const matchT = !filtroTipo || c.tipo === filtroTipo
    const matchE = !filtroEstado || c.estado === filtroEstado
    return matchP && matchT && matchE
  })

  function openDetalle(id: string) { setSelId(id); setView('detalle') }

  return (
    <div className="p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Tarifas base</h1>
          <p className="text-xs text-gray-400 mt-0.5">Cotizaciones de proveedores · Fletes · Servicios</p>
        </div>
        <div className="flex gap-2">
          {view !== 'lista' && (
            <button onClick={() => setView('lista')} className="px-3 py-2 border border-gray-200 rounded-lg text-xs hover:bg-gray-50 transition-colors">← Volver</button>
          )}
          {view === 'lista' && (
            <>
              <button onClick={() => setView('comparativa')} className="px-3 py-2 border border-gray-200 rounded-lg text-xs hover:bg-gray-50 text-gray-600 transition-colors">📊 Comparativa</button>
              <button onClick={() => setView('nueva')} className="px-4 py-2 bg-[#1168F8] text-white rounded-lg text-xs font-medium hover:bg-[#0a4fc4] transition-colors">+ Nueva cotización</button>
            </>
          )}
        </div>
      </div>

      {view === 'lista' && (
        <ListaView
          cots={filtradas} loading={loading}
          filtroProveedor={filtroProveedor} setFiltroProveedor={setFiltroProveedor}
          filtroTipo={filtroTipo} setFiltroTipo={setFiltroTipo}
          filtroEstado={filtroEstado} setFiltroEstado={setFiltroEstado}
          proveedores={proveedores}
          onOpen={openDetalle}
          onToggleEstado={async (id, estado) => {
            await (supabase.from('cotizaciones_proveedor') as any).update({ estado }).eq('id', id)
            loadData()
          }}
        />
      )}

      {view === 'detalle' && selCot && (
        <DetalleView
          cot={selCot} supabase={supabase} currentUser={currentUser}
          onReload={loadData} onPreview={setPreviewModal}
        />
      )}

      {view === 'nueva' && (
        <NuevaView
          supabase={supabase} currentUser={currentUser} ops={ops}
          onSave={async (cot) => {
            const { data } = await (supabase.from('cotizaciones_proveedor') as any).insert(cot).select('id').single()
            await loadData()
            if (data) { setSelId(data.id); setView('detalle') }
          }}
          onCancel={() => setView('lista')}
        />
      )}

      {view === 'comparativa' && (
        <ComparativaView cots={cots} onPreview={setPreviewModal} />
      )}

      {previewModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setPreviewModal(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <span className="font-medium text-sm text-gray-900 truncate">{previewModal.nombre}</span>
              <div className="flex gap-2">
                <a href={previewModal.url} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-[#1168F8] text-white rounded-lg text-xs hover:bg-[#0a4fc4]">🔗 Abrir</a>
                <button onClick={() => setPreviewModal(null)} className="text-gray-400 hover:text-gray-600 text-xl px-1">×</button>
              </div>
            </div>
            <div className="overflow-auto max-h-[80vh] p-2">
              {previewModal.nombre.toLowerCase().endsWith('.pdf')
                ? <iframe src={previewModal.url} className="w-full h-[75vh] border-0" title={previewModal.nombre} />
                : <img src={previewModal.url} alt={previewModal.nombre} className="max-w-full mx-auto rounded" />
              }
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── LISTA ──────────────────────────────────────────────────────
function ListaView({ cots, loading, filtroProveedor, setFiltroProveedor, filtroTipo, setFiltroTipo, filtroEstado, setFiltroEstado, proveedores, onOpen, onToggleEstado }: any) {
  const sel = 'px-3 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:border-[#1168F8]'
  return (
    <div>
      {/* Filtros */}
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <select value={filtroProveedor} onChange={e => setFiltroProveedor(e.target.value)} className={sel}>
          <option value="">Todos los proveedores</option>
          {proveedores.map((p: string) => <option key={p}>{p}</option>)}
        </select>
        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} className={sel}>
          <option value="">Genérica + Específica</option>
          <option value="generica">Solo genéricas</option>
          <option value="especifica">Solo específicas</option>
        </select>
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} className={sel}>
          <option value="vigente">Vigentes</option>
          <option value="vencida">Vencidas</option>
          <option value="">Todas</option>
        </select>
        <span className="text-xs text-gray-400 ml-auto">{cots.length} cotización(es)</span>
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-400 text-sm">Cargando...</div>
      ) : cots.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl p-12 text-center">
          <div className="text-3xl mb-3">📋</div>
          <div className="text-gray-500 text-sm mb-1">Sin cotizaciones de proveedores</div>
          <div className="text-gray-400 text-xs">Hacé click en "Nueva cotización" para cargar la primera</div>
        </div>
      ) : (
        <div className="space-y-3">
          {cots.map((c: CotProv) => {
            const itemCount = c.items?.length || 0
            const opRef = (c.operacion as any)?.cotizacion
            return (
              <div key={c.id} className={`bg-white border rounded-xl p-4 hover:border-[#1168F8] transition-colors cursor-pointer ${c.estado === 'vencida' ? 'opacity-60 border-gray-100' : 'border-gray-100'}`}
                onClick={() => onOpen(c.id)}>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${c.estado === 'vigente' ? 'bg-[#1168F8]' : 'bg-gray-300'}`}>
                      {c.proveedor.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-semibold text-sm text-gray-900">{c.proveedor}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {c.referencia && <span className="font-mono mr-2">{c.referencia}</span>}
                        <span>{c.fecha}</span>
                      </div>
                      <div className="flex gap-2 mt-1.5 flex-wrap">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${c.tipo === 'generica' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                          {c.tipo === 'generica' ? '📋 Genérica' : '🎯 Específica'}
                        </span>
                        {opRef && <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#EBF2FF] text-[#052698]">{opRef.num} · {opRef.cliente}</span>}
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${c.estado === 'vigente' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {c.estado === 'vigente' ? '✓ Vigente' : 'Vencida'}
                        </span>
                        {itemCount > 0 && <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600">{itemCount} ítem(s)</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {c.archivo_url && (
                      <span className="text-[10px] text-[#1168F8] flex items-center gap-1">📄 PDF</span>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); onToggleEstado(c.id, c.estado === 'vigente' ? 'vencida' : 'vigente') }}
                      className="px-2 py-1 border border-gray-200 rounded-lg text-[10px] text-gray-500 hover:bg-gray-50 transition-colors"
                    >
                      {c.estado === 'vigente' ? 'Vencer' : 'Reactivar'}
                    </button>
                  </div>
                </div>
                {c.notas && <div className="mt-2 text-[10px] text-amber-700 bg-amber-50 rounded px-2.5 py-1.5">📌 {c.notas}</div>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── DETALLE ────────────────────────────────────────────────────
function DetalleView({ cot, supabase, currentUser, onReload, onPreview }: any) {
  const [items, setItems] = useState<CotProvItem[]>(cot.items || [])
  const [form, setForm] = useState({ tipo_servicio: 'maritima', descripcion: '', ruta_origen: '', ruta_destino: '', tipo_equipo: '', moneda: 'USD', valor: '', tipo_calculo: 'fijo_usd', piso_usd: '', techo_usd: '', notas: '' })
  const [uploading, setUploading] = useState(false)
  const inp = 'w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8] bg-white'
  const opRef = (cot.operacion as any)?.cotizacion

  async function addItem() {
    if (!form.descripcion || !form.valor) return
    const { data } = await (supabase.from('cotizacion_proveedor_items') as any).insert({
      cotizacion_id: cot.id,
      tipo_servicio: form.tipo_servicio,
      descripcion: form.descripcion,
      ruta_origen: form.ruta_origen,
      ruta_destino: form.ruta_destino,
      tipo_equipo: form.tipo_equipo,
      moneda: form.moneda,
      valor: parseFloat(form.valor.replace(',', '.')) || 0,
      tipo_calculo: form.tipo_calculo,
      piso_usd: parseFloat(form.piso_usd.replace(',', '.')) || 0,
      techo_usd: parseFloat(form.techo_usd.replace(',', '.')) || 0,
      notas: form.notas,
      orden: items.length,
    }).select('*').single()
    if (data) setItems(p => [...p, data as CotProvItem])
    setForm(f => ({ ...f, descripcion: '', ruta_origen: '', ruta_destino: '', tipo_equipo: '', valor: '', piso_usd: '', techo_usd: '', notas: '' }))
  }

  async function deleteItem(id: string) {
    if (!confirm('¿Eliminar este ítem?')) return
    await supabase.from('cotizacion_proveedor_items').delete().eq('id', id)
    setItems(p => p.filter(i => i.id !== id))
  }

  async function uploadPDF(file: File) {
    if (!currentUser) return
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `cotizaciones_proveedor/${cot.id}.${ext}`
    await supabase.storage.from('comprobantes').upload(path, file, { upsert: true })
    const { data } = supabase.storage.from('comprobantes').getPublicUrl(path)
    if (data?.publicUrl) {
      await (supabase.from('cotizaciones_proveedor') as any).update({ archivo_url: data.publicUrl, archivo_nombre: file.name }).eq('id', cot.id)
      onReload()
    }
    setUploading(false)
  }

  async function updateItem(id: string, field: string, value: any) {
    await (supabase.from('cotizacion_proveedor_items') as any).update({ [field]: value }).eq('id', id)
    setItems(p => p.map(i => i.id === id ? { ...i, [field]: value } : i))
  }

  // Group items by tipo_servicio
  const grouped = items.reduce((acc: Record<string, CotProvItem[]>, item) => {
    if (!acc[item.tipo_servicio]) acc[item.tipo_servicio] = []
    acc[item.tipo_servicio].push(item)
    return acc
  }, {})

  return (
    <div className="space-y-4">
      {/* Header cotización */}
      <div className="bg-white border border-gray-100 rounded-xl p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg font-bold text-gray-900">{cot.proveedor}</span>
              <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${cot.tipo === 'generica' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                {cot.tipo === 'generica' ? '📋 Genérica' : '🎯 Específica'}
              </span>
              <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${cot.estado === 'vigente' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {cot.estado === 'vigente' ? '✓ Vigente' : 'Vencida'}
              </span>
            </div>
            <div className="text-xs text-gray-500">
              {cot.referencia && <span className="font-mono mr-3">{cot.referencia}</span>}
              <span>Fecha: {cot.fecha}</span>
              {opRef && <span className="ml-3 text-[#1168F8]">Operación: {opRef.num} · {opRef.cliente}</span>}
            </div>
            {cot.notas && <div className="text-xs text-amber-700 mt-1">📌 {cot.notas}</div>}
          </div>
          {/* PDF */}
          <div className="flex-shrink-0">
            {cot.archivo_url ? (
              <div className="flex items-center gap-2">
                <button onClick={() => onPreview({ url: cot.archivo_url, nombre: cot.archivo_nombre || 'cotizacion.pdf' })}
                  className="flex items-center gap-1.5 px-3 py-2 bg-[#EBF2FF] text-[#1168F8] rounded-lg text-xs font-medium hover:bg-[#93B8FC] transition-colors">
                  📄 Ver PDF
                </button>
                <label className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-500 hover:bg-gray-50 cursor-pointer transition-colors">
                  🔄 Reemplazar
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadPDF(f) }} />
                </label>
              </div>
            ) : (
              <label className={`flex items-center gap-1.5 px-3 py-2 border-2 border-dashed border-[#93B8FC] rounded-lg text-xs text-[#1168F8] hover:bg-[#EBF2FF] cursor-pointer transition-colors ${uploading ? 'opacity-60' : ''}`}>
                📎 {uploading ? 'Subiendo...' : 'Adjuntar PDF cotización'}
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadPDF(f) }} disabled={uploading} />
              </label>
            )}
          </div>
        </div>
      </div>

      {/* Items agrupados por tipo */}
      {Object.entries(TIPOS_SERVICIO).map(([tipo, label]) => {
        const group = grouped[tipo] || []
        if (!group.length) return null
        const total = group.reduce((s, i) => s + i.valor, 0)
        return (
          <div key={tipo} className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <span className="font-medium text-sm text-gray-900">{label}</span>
              <span className="text-xs text-gray-400 font-mono">{group.length} ítem(s)</span>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Descripción', 'Ruta', 'Equipo', 'Tipo cálculo', 'Valor', 'Piso USD', 'Notas', ''].map(h =>
                    <th key={h} className="text-left px-4 py-2 text-[10px] font-medium text-gray-400 uppercase tracking-wide">{h}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {group.map(item => (
                  <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <input defaultValue={item.descripcion} onBlur={e => updateItem(item.id, 'descripcion', e.target.value)}
                        className="w-full px-2 py-1 border border-transparent rounded hover:border-gray-200 focus:border-[#1168F8] focus:outline-none text-xs" />
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1 text-[10px]">
                        <input defaultValue={item.ruta_origen} onBlur={e => updateItem(item.id, 'ruta_origen', e.target.value)}
                          className="w-16 px-1.5 py-1 border border-transparent rounded hover:border-gray-200 focus:border-[#1168F8] focus:outline-none text-xs" placeholder="Origen" />
                        <span className="text-gray-300">→</span>
                        <input defaultValue={item.ruta_destino} onBlur={e => updateItem(item.id, 'ruta_destino', e.target.value)}
                          className="w-16 px-1.5 py-1 border border-transparent rounded hover:border-gray-200 focus:border-[#1168F8] focus:outline-none text-xs" placeholder="Destino" />
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <input defaultValue={item.tipo_equipo} onBlur={e => updateItem(item.id, 'tipo_equipo', e.target.value)}
                        className="w-16 px-2 py-1 border border-transparent rounded hover:border-gray-200 focus:border-[#1168F8] focus:outline-none text-xs font-mono" placeholder="40HC" />
                    </td>
                    <td className="px-4 py-2.5">
                      <select defaultValue={item.tipo_calculo} onBlur={e => updateItem(item.id, 'tipo_calculo', e.target.value)}
                        className="px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:border-[#1168F8] bg-white">
                        {Object.entries(TIPO_CALCULO_L).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-gray-400">{item.moneda}</span>
                        <input type="text" inputMode="decimal" defaultValue={item.valor} onFocus={e => e.target.select()}
                          onBlur={e => updateItem(item.id, 'valor', parseFloat(e.target.value.replace(',', '.')) || 0)}
                          className="w-20 px-2 py-1 border border-transparent rounded hover:border-gray-200 focus:border-[#1168F8] focus:outline-none text-xs text-right font-mono" />
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      {item.tipo_calculo === 'pct_cif' ? (
                        <input type="text" inputMode="decimal" defaultValue={item.piso_usd} onFocus={e => e.target.select()}
                          onBlur={e => updateItem(item.id, 'piso_usd', parseFloat(e.target.value.replace(',', '.')) || 0)}
                          className="w-16 px-2 py-1 border border-transparent rounded hover:border-gray-200 focus:border-[#1168F8] focus:outline-none text-xs text-right font-mono" />
                      ) : <span className="text-gray-300 text-[10px]">—</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <input defaultValue={item.notas} onBlur={e => updateItem(item.id, 'notas', e.target.value)}
                        className="w-full px-2 py-1 border border-transparent rounded hover:border-gray-200 focus:border-[#1168F8] focus:outline-none text-xs text-gray-400" placeholder="Opcional" />
                    </td>
                    <td className="px-4 py-2.5">
                      <button onClick={() => deleteItem(item.id)} className="p-1 text-gray-400 hover:text-red-500 transition-colors text-xs">🗑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-[#EBF2FF]">
                  <td colSpan={4} className="px-4 py-2 text-[10px] font-semibold text-[#052698]">Subtotal {label}</td>
                  <td className="px-4 py-2 font-mono font-semibold text-[#052698] text-right">{fmt(total)}</td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )
      })}

      {/* Agregar ítem */}
      <div className="bg-white border border-gray-100 rounded-xl p-5">
        <h3 className="font-medium text-sm text-gray-900 mb-3">+ Agregar ítem a esta cotización</h3>
        <div className="grid grid-cols-4 gap-3 mb-3">
          <div>
            <label className="block text-[10px] text-gray-500 font-medium mb-1">Tipo de servicio</label>
            <select value={form.tipo_servicio} onChange={e => setForm(f => ({ ...f, tipo_servicio: e.target.value }))}
              className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8] bg-white">
              {Object.entries(TIPOS_SERVICIO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-[10px] text-gray-500 font-medium mb-1">Descripción</label>
            <input value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} className={inp} placeholder="ej. Flete marítimo FCL" />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 font-medium mb-1">Equipo / tipo</label>
            <input value={form.tipo_equipo} onChange={e => setForm(f => ({ ...f, tipo_equipo: e.target.value }))} className={inp} placeholder="ej. 40HC" />
          </div>
        </div>
        <div className="grid grid-cols-5 gap-3 mb-3">
          <div>
            <label className="block text-[10px] text-gray-500 font-medium mb-1">Origen</label>
            <input value={form.ruta_origen} onChange={e => setForm(f => ({ ...f, ruta_origen: e.target.value }))} className={inp} placeholder="ej. Iquique" />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 font-medium mb-1">Destino</label>
            <input value={form.ruta_destino} onChange={e => setForm(f => ({ ...f, ruta_destino: e.target.value }))} className={inp} placeholder="ej. Jujuy" />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 font-medium mb-1">Tipo cálculo</label>
            <select value={form.tipo_calculo} onChange={e => setForm(f => ({ ...f, tipo_calculo: e.target.value }))}
              className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8] bg-white">
              {Object.entries(TIPO_CALCULO_L).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 font-medium mb-1">Moneda / Valor</label>
            <div className="flex gap-1">
              <select value={form.moneda} onChange={e => setForm(f => ({ ...f, moneda: e.target.value }))}
                className="w-16 px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8] bg-white">
                <option>USD</option><option>ARS</option><option>CLP</option>
              </select>
              <input type="text" inputMode="decimal" value={form.valor} onFocus={e => e.target.select()} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} className={inp + ' text-right'} placeholder="0.00" />
            </div>
          </div>
          {form.tipo_calculo === 'pct_cif' && (
            <div>
              <label className="block text-[10px] text-gray-500 font-medium mb-1">Piso USD</label>
              <input type="text" inputMode="decimal" value={form.piso_usd} onFocus={e => e.target.select()} onChange={e => setForm(f => ({ ...f, piso_usd: e.target.value }))} className={inp + ' text-right'} placeholder="0" />
            </div>
          )}
        </div>
        <div className="flex justify-end">
          <button onClick={addItem} className="px-4 py-2 bg-[#1168F8] text-white rounded-lg text-xs font-medium hover:bg-[#0a4fc4] transition-colors">+ Agregar ítem</button>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
        💡 Los cambios en los ítems se guardan automáticamente al hacer click fuera del campo.
        {cot.creado_por && <span className="ml-2 text-gray-400">Creado por {cot.creado_por} · {cot.created_at?.slice(0, 10)}</span>}
      </div>
    </div>
  )
}

// ── NUEVA COTIZACIÓN ───────────────────────────────────────────
function NuevaView({ supabase, currentUser, ops, onSave, onCancel }: any) {
  const [form, setForm] = useState({ proveedor: '', referencia: '', fecha: new Date().toISOString().slice(0, 10), tipo: 'generica', operacion_id: '', notas: '' })
  const inp = 'w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8] bg-white'

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-6 max-w-xl">
      <h2 className="font-semibold text-sm text-gray-900 mb-4">Nueva cotización de proveedor</h2>
      <div className="space-y-3">
        <div>
          <label className="block text-[10px] text-gray-500 font-medium mb-1">Proveedor *</label>
          <input value={form.proveedor} onChange={e => setForm(f => ({ ...f, proveedor: e.target.value }))} className={inp} placeholder="ej. Hellmann Worldwide Logistics" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] text-gray-500 font-medium mb-1">N° referencia / cotización</label>
            <input value={form.referencia} onChange={e => setForm(f => ({ ...f, referencia: e.target.value }))} className={inp} placeholder="ej. HWL-2026-AR-001" />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 font-medium mb-1">Fecha de la cotización *</label>
            <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} className={inp} />
          </div>
        </div>
        <div>
          <label className="block text-[10px] text-gray-500 font-medium mb-1">Tipo</label>
          <div className="grid grid-cols-2 gap-2">
            {[{ k: 'generica', label: '📋 Genérica', sub: 'Tarifa general del proveedor' }, { k: 'especifica', label: '🎯 Específica', sub: 'Para una operación en particular' }].map(o => (
              <button key={o.k} onClick={() => setForm(f => ({ ...f, tipo: o.k, operacion_id: o.k === 'generica' ? '' : f.operacion_id }))}
                className={`px-3 py-2.5 rounded-lg border text-left transition-colors ${form.tipo === o.k ? 'border-[#1168F8] bg-[#EBF2FF] text-[#052698]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                <div className="text-xs font-semibold">{o.label}</div>
                <div className="text-[10px] opacity-70 mt-0.5">{o.sub}</div>
              </button>
            ))}
          </div>
        </div>
        {form.tipo === 'especifica' && (
          <div>
            <label className="block text-[10px] text-gray-500 font-medium mb-1">Operación vinculada</label>
            <select value={form.operacion_id} onChange={e => setForm(f => ({ ...f, operacion_id: e.target.value }))}
              className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8] bg-white">
              <option value="">Seleccionar operación...</option>
              {ops.map((o: any) => <option key={o.id} value={o.id}>{o.cotizacion?.num} · {o.cotizacion?.cliente}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="block text-[10px] text-gray-500 font-medium mb-1">Notas</label>
          <input value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} className={inp} placeholder="Observaciones generales" />
        </div>
      </div>
      <div className="flex justify-between mt-5">
        <button onClick={onCancel} className="px-4 py-2 border border-gray-200 rounded-lg text-xs hover:bg-gray-50 transition-colors">Cancelar</button>
        <button
          disabled={!form.proveedor || !form.fecha}
          onClick={() => onSave({ proveedor: form.proveedor, referencia: form.referencia || null, fecha: form.fecha, tipo: form.tipo, operacion_id: form.operacion_id || null, notas: form.notas || null, estado: 'vigente', creado_por: currentUser?.nombre || '', creado_por_id: currentUser?.id || null })}
          className="px-4 py-2 bg-[#1168F8] text-white rounded-lg text-xs font-medium hover:bg-[#0a4fc4] disabled:opacity-50 transition-colors">
          Crear cotización →
        </button>
      </div>
    </div>
  )
}

// ── COMPARATIVA ────────────────────────────────────────────────
function ComparativaView({ cots, onPreview }: any) {
  const [tipoServicio, setTipoServicio] = useState('maritima')
  const [ruta, setRuta] = useState('')
  const [equipo, setEquipo] = useState('')

  // Get all items of selected tipo
  const allItems: Array<CotProvItem & { proveedor: string; fecha: string; estado: string; cotizacion_id: string; archivo_url?: string; archivo_nombre?: string }> = []
  cots.forEach((c: CotProv) => {
    (c.items || []).filter((i: CotProvItem) => i.tipo_servicio === tipoServicio).forEach((i: CotProvItem) => {
      allItems.push({ ...i, proveedor: c.proveedor, fecha: c.fecha, estado: c.estado, cotizacion_id: c.id, archivo_url: c.archivo_url || undefined, archivo_nombre: c.archivo_nombre || undefined })
    })
  })

  const rutas = [...new Set(allItems.map(i => `${i.ruta_origen}→${i.ruta_destino}`).filter(Boolean))].sort()
  const equipos = [...new Set(allItems.map(i => i.tipo_equipo).filter(Boolean))].sort()

  const filtrados = allItems.filter(i => {
    const matchR = !ruta || `${i.ruta_origen}→${i.ruta_destino}` === ruta
    const matchE = !equipo || i.tipo_equipo === equipo
    return matchR && matchE
  }).sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())

  const sel = 'px-3 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:border-[#1168F8]'

  return (
    <div>
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <select value={tipoServicio} onChange={e => setTipoServicio(e.target.value)} className={sel}>
          {Object.entries(TIPOS_SERVICIO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={ruta} onChange={e => setRuta(e.target.value)} className={sel}>
          <option value="">Todas las rutas</option>
          {rutas.map(r => <option key={r}>{r}</option>)}
        </select>
        <select value={equipo} onChange={e => setEquipo(e.target.value)} className={sel}>
          <option value="">Todos los equipos</option>
          {equipos.map(e => <option key={e}>{e}</option>)}
        </select>
        <span className="text-xs text-gray-400 ml-auto">{filtrados.length} cotización(es) encontradas</span>
      </div>

      {filtrados.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl p-8 text-center text-gray-400 text-sm">
          Sin cotizaciones para los filtros seleccionados.
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 font-medium text-sm text-gray-900">
            Comparativa de precios — {TIPOS_SERVICIO[tipoServicio]}
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Proveedor', 'Fecha', 'Ruta', 'Equipo', 'Descripción', 'Tipo', 'Precio', 'Estado', 'Ref.'].map(h =>
                  <th key={h} className="text-left px-4 py-2.5 text-[10px] font-medium text-gray-400 uppercase tracking-wide">{h}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtrados.map((item, idx) => {
                const isMin = item.valor === Math.min(...filtrados.map(i => i.valor))
                const isMax = item.valor === Math.max(...filtrados.map(i => i.valor))
                return (
                  <tr key={item.id + idx} className={`border-b border-gray-50 hover:bg-gray-50 ${item.estado === 'vencida' ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 font-medium text-gray-800">{item.proveedor}</td>
                    <td className="px-4 py-3 font-mono text-[10px] text-gray-500">{item.fecha}</td>
                    <td className="px-4 py-3 text-gray-600 text-[10px]">{item.ruta_origen && `${item.ruta_origen} → ${item.ruta_destino}`}</td>
                    <td className="px-4 py-3 font-mono text-gray-600">{item.tipo_equipo || '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{item.descripcion}</td>
                    <td className="px-4 py-3 text-[10px] text-gray-500">{TIPO_CALCULO_L[item.tipo_calculo]}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`font-mono font-semibold ${isMin ? 'text-green-700' : isMax ? 'text-red-600' : 'text-gray-800'}`}>
                          {item.moneda} {fmt(item.valor)}
                        </span>
                        {isMin && filtrados.length > 1 && <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">Menor</span>}
                        {isMax && filtrados.length > 1 && <span className="text-[9px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium">Mayor</span>}
                      </div>
                      {item.piso_usd > 0 && <div className="text-[9px] text-gray-400 mt-0.5">Piso: USD {fmt(item.piso_usd)}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${item.estado === 'vigente' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {item.estado === 'vigente' ? '✓' : '✗'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {item.archivo_url && (
                        <button onClick={() => onPreview({ url: item.archivo_url, nombre: item.archivo_nombre || 'cotizacion.pdf' })}
                          className="px-2 py-0.5 bg-[#EBF2FF] text-[#1168F8] rounded text-[10px] hover:bg-[#93B8FC] transition-colors">
                          📄 PDF
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
