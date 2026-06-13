'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'

const RUBROS: Record<string, { label: string; color: string; bg: string }> = {
  forwarder:           { label: 'ForWarder',            color: '#1168F8', bg: '#EBF2FF' },
  transporte_chile:    { label: 'Transporte Chile',     color: '#0a9e6e', bg: '#E1F5EE' },
  transporte_terrestre:{ label: 'Transporte terrestre', color: '#b45309', bg: '#FEF3C7' },
  gastos_argentina:    { label: 'Gastos Argentina',     color: '#6b21a8', bg: '#F3E8FF' },
  deposito:            { label: 'Deposito fiscal',      color: '#0891b2', bg: '#E0F2FE' },
  otro:                { label: 'Otro',                 color: '#6b7280', bg: '#F3F4F6' },
}

const TIPO_CALCULO: Record<string, string> = {
  fijo_usd:        'Fijo USD',
  por_contenedor:  'Por contenedor',
  por_m3:          'Por m3',
  pct_cif:         '% sobre CIF',
}

interface Item {
  id?: string
  descripcion: string
  tipo_calculo: string
  valor: number
  moneda: string
  tipo_contenedor: string
  orden: number
}

interface Cotizacion {
  id: string
  tercero_id: string | null
  proveedor_nombre: string
  rubro: string
  tipo: string
  cotizacion_id: string | null
  referencia: string
  fecha: string
  fecha_vencimiento: string
  moneda: string
  estado: string
  seguro_incluido: boolean
  seguro_monto: number | null
  notas: string
  created_at: string
  items?: Item[]
  tercero?: { razon_social: string }
}

const ITEM_VACIO: Item = { descripcion: '', tipo_calculo: 'fijo_usd', valor: 0, moneda: 'USD', tipo_contenedor: '', orden: 0 }

const inp = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white'
const fmt = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function CotizacionesProveedoresPage() {
  const supabase = useMemo(() => createClient(), [])
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([])
  const [terceros, setTerceros] = useState<any[]>([])
  const [cotsSistema, setCotsSistema] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'lista' | 'nueva' | 'detalle'>('lista')
  const [selId, setSelId] = useState<string | null>(null)
  const [filtroRubro, setFiltroRubro] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('vigente')
  const [buscar, setBuscar] = useState('')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [cotRes, tercRes] = await Promise.all([
      supabase.from('cotizaciones_proveedor_v2')
        .select('*, items:cotizaciones_proveedor_v2_items(*), tercero:terceros(razon_social)')
        .order('created_at', { ascending: false }),
      supabase.from('terceros').select('id,razon_social').eq('activo', 'true').order('razon_social'),
    ])
    if (cotRes.data) setCotizaciones(cotRes.data as any)
    if (tercRes.data) setTerceros(tercRes.data)
    setLoading(false)
  }

  const sel = cotizaciones.find(c => c.id === selId)

  const filtradas = cotizaciones.filter(c => {
    const b = buscar.toLowerCase()
    const matchB = !b || c.proveedor_nombre.toLowerCase().includes(b) || (c.referencia || '').toLowerCase().includes(b)
    const matchR = !filtroRubro || c.rubro === filtroRubro
    const matchT = !filtroTipo || c.tipo === filtroTipo
    const matchE = !filtroEstado || c.estado === filtroEstado
    return matchB && matchR && matchT && matchE
  })

  async function cambiarEstado(id: string, estado: string) {
    await (supabase.from('cotizaciones_proveedor_v2') as any).update({ estado }).eq('id', id)
    setCotizaciones(prev => prev.map(c => c.id === id ? { ...c, estado } : c))
  }

  async function eliminar(id: string) {
    if (!confirm('Eliminar esta cotizacion?')) return
    await supabase.from('cotizaciones_proveedor_v2').delete().eq('id', id)
    setCotizaciones(prev => prev.filter(c => c.id !== id))
    if (selId === id) setView('lista')
  }

  // Totales por rubro para el header
  const stats = Object.keys(RUBROS).map(r => ({
    rubro: r,
    total: cotizaciones.filter(c => c.rubro === r && c.estado === 'vigente').length,
  })).filter(s => s.total > 0)

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Cotizaciones de proveedores</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {cotizaciones.filter(c => c.estado === 'vigente').length} vigentes de {cotizaciones.length} total
          </p>
        </div>
        <div className="flex gap-2">
          {view !== 'lista' && (
            <button onClick={() => setView('lista')} className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold hover:bg-gray-100">Volver</button>
          )}
          {view === 'lista' && (
            <button onClick={() => setView('nueva')} className="px-5 py-2.5 bg-[#1168F8] text-white rounded-xl text-sm font-bold hover:bg-[#0a4fc4] shadow-sm">+ Nueva cotizacion</button>
          )}
        </div>
      </div>

      {/* Stats por rubro */}
      {view === 'lista' && stats.length > 0 && (
        <div className="flex gap-2 mb-5 flex-wrap">
          {stats.map(s => {
            const r = RUBROS[s.rubro]
            return (
              <button key={s.rubro} onClick={() => setFiltroRubro(filtroRubro === s.rubro ? '' : s.rubro)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all"
                style={filtroRubro === s.rubro
                  ? { background: r.color, color: 'white', borderColor: r.color }
                  : { background: r.bg, color: r.color, borderColor: r.color + '40' }}>
                {r.label}
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                  style={filtroRubro === s.rubro
                    ? { background: 'rgba(255,255,255,0.25)', color: 'white' }
                    : { background: r.color + '20', color: r.color }}>
                  {s.total}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {view === 'lista' && (
        <>
          {/* Filtros */}
          <div className="flex gap-3 mb-4 flex-wrap items-center">
            <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar proveedor o referencia..."
              className="flex-1 min-w-48 px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white" />
            <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:border-[#1168F8]">
              <option value="">Generica + Especifica</option>
              <option value="generica">Solo genericas</option>
              <option value="especifica">Solo especificas</option>
            </select>
            <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:border-[#1168F8]">
              <option value="">Todos los estados</option>
              <option value="vigente">Vigentes</option>
              <option value="vencida">Vencidas</option>
              <option value="reemplazada">Reemplazadas</option>
            </select>
            {(buscar || filtroRubro || filtroTipo || filtroEstado) && (
              <button onClick={() => { setBuscar(''); setFiltroRubro(''); setFiltroTipo(''); setFiltroEstado('vigente') }}
                className="px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-500 hover:bg-gray-50">Limpiar</button>
            )}
            <span className="text-xs text-gray-400 ml-auto">{filtradas.length} registro(s)</span>
          </div>

          {/* Tabla */}
          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
            {loading ? (
              <div className="p-12 text-center text-gray-400">Cargando...</div>
            ) : filtradas.length === 0 ? (
              <div className="p-12 text-center">
                <div className="text-gray-500 text-sm mb-3">{cotizaciones.length === 0 ? 'Sin cotizaciones cargadas aun' : 'Sin resultados'}</div>
                {cotizaciones.length === 0 && (
                  <button onClick={() => setView('nueva')} className="px-4 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold">+ Cargar primera cotizacion</button>
                )}
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {['Proveedor', 'Rubro', 'Tipo', 'Referencia', 'Fecha', 'Vence', 'Items', 'Estado', ''].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map(c => {
                    const r = RUBROS[c.rubro] || RUBROS.otro
                    const totalItems = (c.items || []).length
                    return (
                      <tr key={c.id} className="border-b border-gray-50 hover:bg-blue-50/20 transition-colors group cursor-pointer"
                        onClick={() => { setSelId(c.id); setView('detalle') }}>
                        <td className="px-4 py-3.5">
                          <div className="font-semibold text-gray-900">{c.proveedor_nombre}</div>
                          {c.referencia && <div className="text-[10px] text-gray-400 font-mono">{c.referencia}</div>}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: r.bg, color: r.color }}>{r.label}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${c.tipo === 'especifica' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                            {c.tipo === 'especifica' ? 'Especifica' : 'Generica'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 font-mono text-[11px] text-gray-600">{c.referencia || '-'}</td>
                        <td className="px-4 py-3.5 font-mono text-[11px] text-gray-600">{c.fecha}</td>
                        <td className="px-4 py-3.5">
                          {c.fecha_vencimiento ? (
                            <span className={`font-mono text-[11px] ${new Date(c.fecha_vencimiento) < new Date() ? 'text-red-500' : 'text-gray-500'}`}>
                              {c.fecha_vencimiento}
                            </span>
                          ) : <span className="text-gray-300">-</span>}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="px-2 py-0.5 bg-[#EBF2FF] text-[#052698] rounded-full text-[10px] font-bold">{totalItems} item(s)</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <select value={c.estado}
                            onClick={e => e.stopPropagation()}
                            onChange={e => { e.stopPropagation(); cambiarEstado(c.id, e.target.value) }}
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border-0 cursor-pointer focus:outline-none ${
                              c.estado === 'vigente' ? 'bg-green-50 text-green-700' :
                              c.estado === 'vencida' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-500'
                            }`}>
                            <option value="vigente">Vigente</option>
                            <option value="vencida">Vencida</option>
                            <option value="reemplazada">Reemplazada</option>
                          </select>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                            <button onClick={e => { e.stopPropagation(); setSelId(c.id); setView('detalle') }}
                              className="p-1.5 border border-gray-200 rounded-lg hover:bg-[#EBF2FF] text-gray-500 hover:text-[#1168F8] transition-colors">E</button>
                            <button onClick={e => { e.stopPropagation(); eliminar(c.id) }}
                              className="p-1.5 border border-red-100 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">X</button>
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

      {view === 'nueva' && (
        <FormCotizacion
          supabase={supabase}
          terceros={terceros}
          onSave={async () => { await loadAll(); setView('lista') }}
          onCancel={() => setView('lista')}
        />
      )}

      {view === 'detalle' && sel && (
        <DetalleCotizacion
          cotizacion={sel}
          supabase={supabase}
          terceros={terceros}
          onReload={async () => { await loadAll() }}
          onBack={() => setView('lista')}
          onEliminar={() => eliminar(sel.id)}
        />
      )}
    </div>
  )
}

function FormCotizacion({ supabase, terceros, cotsSistema, onSave, onCancel, cotizacionInicial }: any) {
  const [form, setForm] = useState({
    proveedor_nombre: '',
    tercero_id: '',
    rubro: 'forwarder',
    tipo: 'generica',
    referencia: '',
    fecha: new Date().toISOString().slice(0, 10),
    fecha_vencimiento: '',
    moneda: 'USD',
    estado: 'vigente',
    seguro_incluido: false,
    seguro_monto: '',
    notas: '',
    cotizacion_id: '',
    ...cotizacionInicial,
  })
  const [items, setItems] = useState<Item[]>(cotizacionInicial?.items || [{ ...ITEM_VACIO }])
  const [saving, setSaving] = useState(false)
  const [buscarProv, setBuscarProv] = useState('')
  const [showProvDropdown, setShowProvDropdown] = useState(false)
  const [buscarCot, setBuscarCot] = useState('')
  const [showCotDropdown, setShowCotDropdown] = useState(false)
  const cotsFiltradas = (cotsSistema || []).filter((c: any) =>
    !buscarCot || c.num?.toLowerCase().includes(buscarCot.toLowerCase()) || c.cliente?.toLowerCase().includes(buscarCot.toLowerCase())
  ).slice(0, 8)

  const provsFiltrados = terceros.filter((t: any) =>
    !buscarProv || t.razon_social.toLowerCase().includes(buscarProv.toLowerCase())
  ).slice(0, 6)

  function addItem() {
    setItems(prev => [...prev, { ...ITEM_VACIO, orden: prev.length }])
  }

  function removeItem(i: number) {
    setItems(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateItem(i: number, field: string, value: any) {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: value } : it))
  }

  async function handleSave() {
    if (!form.proveedor_nombre) { alert('Ingresa el nombre del proveedor'); return }
    if (items.filter(it => it.descripcion).length === 0) { alert('Agrega al menos un item'); return }
    setSaving(true)

    const { data: cot, error } = await (supabase.from('cotizaciones_proveedor_v2') as any).insert({
      proveedor_nombre: form.proveedor_nombre,
      tercero_id: form.tercero_id || null,
      rubro: form.rubro,
      tipo: form.tipo,
      referencia: form.referencia || null,
      fecha: form.fecha,
      fecha_vencimiento: form.fecha_vencimiento || null,
      moneda: form.moneda,
      estado: form.estado,
      seguro_incluido: form.rubro === 'forwarder' ? form.seguro_incluido : false,
      seguro_monto: form.rubro === 'forwarder' && form.seguro_incluido ? parseFloat(form.seguro_monto as any) || null : null,
      notas: form.notas || null,
      cotizacion_id: form.cotizacion_id || null,
    }).select().single()

    if (error) { alert('Error: ' + error.message); setSaving(false); return }

    const itemsValidos = items.filter(it => it.descripcion).map((it, i) => ({
      cotizacion_id: cot.id,
      descripcion: it.descripcion,
      tipo_calculo: it.tipo_calculo,
      valor: parseFloat(it.valor as any) || 0,
      moneda: it.moneda || 'USD',
      tipo_contenedor: it.tipo_contenedor || null,
      orden: i,
    }))

    if (itemsValidos.length > 0) {
      await (supabase.from('cotizaciones_proveedor_v2_items') as any).insert(itemsValidos)
    }

    await onSave()
    setSaving(false)
  }

  const totalUSD = items.reduce((t, it) => t + (parseFloat(it.valor as any) || 0), 0)

  return (
    <div className="max-w-3xl space-y-4">
      {/* Proveedor */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <h3 className="font-bold text-sm text-gray-900 mb-4">Proveedor</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 relative">
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Nombre del proveedor *</label>
            <input
              value={form.proveedor_nombre}
              onChange={e => {
                setForm((f: any) => ({ ...f, proveedor_nombre: e.target.value }))
                setBuscarProv(e.target.value)
                setShowProvDropdown(e.target.value.length > 0)
              }}
              onFocus={() => setShowProvDropdown(form.proveedor_nombre.length > 0)}
              onClick={e => e.stopPropagation()}
              className={inp} placeholder="Nombre o buscar en terceros..."
            />
            {showProvDropdown && provsFiltrados.length > 0 && (
              <div className="absolute z-50 top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl mt-1 max-h-48 overflow-y-auto"
                onClick={e => e.stopPropagation()}>
                {provsFiltrados.map((t: any) => (
                  <button key={t.id} onMouseDown={() => {
                    setForm((f: any) => ({ ...f, proveedor_nombre: t.razon_social, tercero_id: t.id }))
                    setShowProvDropdown(false)
                  }} className="w-full text-left px-4 py-2.5 hover:bg-[#EBF2FF] text-xs border-b border-gray-50 last:border-0">
                    <span className="font-semibold text-gray-900">{t.razon_social}</span>
                  </button>
                ))}
              </div>
            )}
            {form.tercero_id && (
              <div className="mt-1 text-[10px] text-[#1168F8]">Vinculado al tercero en el sistema</div>
            )}
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Referencia (N cotizacion proveedor)</label>
            <input value={form.referencia} onChange={e => setForm((f: any) => ({ ...f, referencia: e.target.value }))} className={inp} placeholder="ej. Q-2026-001" />
          </div>
          <div className="col-span-2 relative">
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Asociar a cotizacion del sistema (opcional)</label>
            <input
              value={form.cotizacion_id ? (cotsSistema||[]).find((c:any)=>c.id===form.cotizacion_id) ? `${(cotsSistema||[]).find((c:any)=>c.id===form.cotizacion_id)?.num} — ${(cotsSistema||[]).find((c:any)=>c.id===form.cotizacion_id)?.cliente}` : form.cotizacion_id : buscarCot}
              onChange={e => { setBuscarCot(e.target.value); setShowCotDropdown(true); if (!e.target.value) setForm((f:any)=>({...f,cotizacion_id:''})) }}
              onFocus={() => setShowCotDropdown(true)}
              className={inp} placeholder="Buscar por N o cliente..."
            />
            {form.cotizacion_id && (
              <button onClick={() => { setForm((f:any)=>({...f,cotizacion_id:''})); setBuscarCot('') }}
                className="absolute right-2 top-8 text-gray-400 hover:text-red-500 text-xs">X</button>
            )}
            {showCotDropdown && cotsFiltradas.length > 0 && !form.cotizacion_id && (
              <div className="absolute z-50 top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl mt-1 max-h-48 overflow-y-auto"
                onClick={e => e.stopPropagation()}>
                {cotsFiltradas.map((c: any) => (
                  <button key={c.id} onMouseDown={() => {
                    setForm((f:any)=>({...f,cotizacion_id:c.id}))
                    setShowCotDropdown(false)
                    setBuscarCot('')
                  }} className="w-full text-left px-4 py-2.5 hover:bg-[#EBF2FF] text-xs border-b border-gray-50 last:border-0">
                    <span className="font-mono font-semibold text-[#1168F8]">{c.num}</span>
                    <span className="text-gray-600 ml-2">{c.cliente}</span>
                    <span className={`ml-2 text-[9px] px-1.5 py-0.5 rounded-full ${c.estado==='aprobada'?'bg-green-50 text-green-700':'bg-gray-100 text-gray-500'}`}>{c.estado}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Moneda</label>
            <select value={form.moneda} onChange={e => setForm((f: any) => ({ ...f, moneda: e.target.value }))} className={inp}>
              {['USD', 'ARS', 'CLP'].map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Fecha</label>
            <input type="date" value={form.fecha} onChange={e => setForm((f: any) => ({ ...f, fecha: e.target.value }))} className={inp} />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Fecha vencimiento</label>
            <input type="date" value={form.fecha_vencimiento} onChange={e => setForm((f: any) => ({ ...f, fecha_vencimiento: e.target.value }))} className={inp} />
          </div>
        </div>
      </div>

      {/* Clasificacion */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <h3 className="font-bold text-sm text-gray-900 mb-4">Clasificacion</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-2 uppercase">Rubro</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(RUBROS).map(([key, r]) => (
                <button key={key} onClick={() => setForm((f: any) => ({ ...f, rubro: key }))}
                  className="px-3 py-2 rounded-xl border-2 text-left text-xs font-semibold transition-all"
                  style={form.rubro === key
                    ? { background: r.color, color: 'white', borderColor: r.color }
                    : { background: r.bg, color: r.color, borderColor: r.color + '40' }}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-2 uppercase">Tipo de cotizacion</label>
            <div className="space-y-2">
              {[
                { key: 'generica', label: 'Generica', desc: 'Valida para cualquier operacion' },
                { key: 'especifica', label: 'Especifica', desc: 'Para una cotizacion particular' },
              ].map(o => (
                <button key={o.key} onClick={() => setForm((f: any) => ({ ...f, tipo: o.key }))}
                  className={`w-full px-4 py-2.5 rounded-xl border-2 text-left transition-all ${form.tipo === o.key ? 'border-[#1168F8] bg-[#EBF2FF]' : 'border-gray-200 hover:bg-gray-50'}`}>
                  <div className="text-xs font-bold text-gray-900">{o.label}</div>
                  <div className="text-[10px] text-gray-400">{o.desc}</div>
                </button>
              ))}
            </div>
            {/* Seguro — solo para forwarder */}
            {form.rubro === 'forwarder' && (
              <div className="mt-4 p-3 bg-[#EBF2FF] rounded-xl border border-[#93B8FC]">
                <label className="flex items-center gap-2 cursor-pointer mb-2">
                  <input type="checkbox" checked={form.seguro_incluido}
                    onChange={e => setForm((f: any) => ({ ...f, seguro_incluido: e.target.checked }))}
                    className="w-4 h-4 rounded" />
                  <span className="text-xs font-semibold text-[#052698]">Seguro incluido en esta cotizacion</span>
                </label>
                {form.seguro_incluido && (
                  <div>
                    <label className="block text-[10px] font-semibold text-[#052698] mb-1 uppercase">Monto seguro (USD)</label>
                    <input type="text" inputMode="decimal" value={form.seguro_monto}
                      onChange={e => setForm((f: any) => ({ ...f, seguro_monto: e.target.value }))}
                      className="w-full px-2.5 py-1.5 border border-[#93B8FC] rounded-lg text-xs focus:outline-none focus:border-[#1168F8] bg-white"
                      placeholder="0.00" />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-sm text-gray-900">Items de la cotizacion</h3>
          <button onClick={addItem} className="px-3 py-1.5 border border-[#1168F8] text-[#1168F8] rounded-xl text-xs font-bold hover:bg-[#EBF2FF]">+ Agregar item</button>
        </div>

        {/* Headers */}
        <div className="grid gap-2 mb-1 text-[10px] text-gray-400 font-semibold uppercase tracking-wide" style={{ gridTemplateColumns: '2fr 130px 110px 110px auto' }}>
          <div>Descripcion</div>
          <div>Tipo calculo</div>
          <div className="text-right">Valor</div>
          <div>Contenedor</div>
          <div></div>
        </div>

        {items.map((it, i) => (
          <div key={i} className="grid gap-2 mb-2 items-center" style={{ gridTemplateColumns: '2fr 130px 110px 110px auto' }}>
            <input value={it.descripcion} onChange={e => updateItem(i, 'descripcion', e.target.value)}
              className={inp} placeholder="Descripcion del cargo" />
            <select value={it.tipo_calculo} onChange={e => updateItem(i, 'tipo_calculo', e.target.value)} className={inp}>
              {Object.entries(TIPO_CALCULO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input type="text" inputMode="decimal" value={it.valor || ''}
              onFocus={e => e.target.select()}
              onChange={e => updateItem(i, 'valor', e.target.value)}
              className={inp + ' text-right font-mono'} placeholder="0.00" />
            <input value={it.tipo_contenedor} onChange={e => updateItem(i, 'tipo_contenedor', e.target.value)}
              className={inp} placeholder="20DV / 40HC / -" />
            <button onClick={() => removeItem(i)} className="text-gray-400 hover:text-red-500 text-xs p-1">X</button>
          </div>
        ))}

        {items.filter(it => it.descripcion && parseFloat(it.valor as any) > 0).length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between items-center">
            <span className="text-xs text-gray-500">Total estimado:</span>
            <span className="font-mono font-bold text-[#052698] text-sm">USD {fmt(totalUSD)}</span>
          </div>
        )}
      </div>

      {/* Notas */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <label className="block text-[10px] font-semibold text-gray-500 mb-2 uppercase">Notas / Condiciones</label>
        <textarea value={form.notas} onChange={e => setForm((f: any) => ({ ...f, notas: e.target.value }))}
          className={inp + ' resize-none'} rows={2} placeholder="Condiciones de la cotizacion, vigencia, observaciones..." />
      </div>

      <div className="flex justify-between">
        <button onClick={onCancel} className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold hover:bg-gray-50">Cancelar</button>
        <button onClick={handleSave} disabled={saving}
          className="px-6 py-2.5 bg-[#1168F8] text-white rounded-xl text-xs font-bold hover:bg-[#0a4fc4] disabled:opacity-50 shadow-sm">
          {saving ? 'Guardando...' : 'Guardar cotizacion'}
        </button>
      </div>
    </div>
  )
}

function DetalleCotizacion({ cotizacion, supabase, terceros, onReload, onBack, onEliminar }: any) {
  const [editando, setEditando] = useState(false)
  const [items, setItems] = useState<Item[]>(cotizacion.items || [])
  const [saving, setSaving] = useState(false)

  const r = RUBROS[cotizacion.rubro] || RUBROS.otro
  const totalUSD = items.reduce((t, it) => t + (parseFloat(it.valor as any) || 0), 0)

  async function saveItems() {
    setSaving(true)
    // Borrar items viejos e insertar nuevos
    await supabase.from('cotizaciones_proveedor_v2_items').delete().eq('cotizacion_id', cotizacion.id)
    const itemsValidos = items.filter(it => it.descripcion).map((it, i) => ({
      cotizacion_id: cotizacion.id,
      descripcion: it.descripcion,
      tipo_calculo: it.tipo_calculo,
      valor: parseFloat(it.valor as any) || 0,
      moneda: it.moneda || 'USD',
      tipo_contenedor: it.tipo_contenedor || null,
      orden: i,
    }))
    if (itemsValidos.length > 0) {
      await (supabase.from('cotizaciones_proveedor_v2_items') as any).insert(itemsValidos)
    }
    await onReload()
    setEditando(false)
    setSaving(false)
  }

  function addItem() { setItems(prev => [...prev, { ...ITEM_VACIO, orden: prev.length }]) }
  function removeItem(i: number) { setItems(prev => prev.filter((_, idx) => idx !== i)) }
  function updateItem(i: number, field: string, value: any) {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: value } : it))
  }

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm mb-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold" style={{ background: r.bg, color: r.color }}>{r.label}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${cotizacion.tipo === 'especifica' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                {cotizacion.tipo === 'especifica' ? 'Especifica' : 'Generica'}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${cotizacion.estado === 'vigente' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {cotizacion.estado}
              </span>
            </div>
            <h2 className="text-xl font-bold text-gray-900">{cotizacion.proveedor_nombre}</h2>
            <div className="flex gap-4 mt-1 text-xs text-gray-500 flex-wrap">
              {cotizacion.referencia && <span className="font-mono">Ref: {cotizacion.referencia}</span>}
              <span>Fecha: {cotizacion.fecha}</span>
              {cotizacion.fecha_vencimiento && <span>Vence: {cotizacion.fecha_vencimiento}</span>}
              <span className="font-mono font-semibold text-[#052698]">USD {fmt(totalUSD)} total</span>
              {cotizacion.cotizacion_id && (cotsSistema||[]).find((c:any)=>c.id===cotizacion.cotizacion_id) && <span className="px-2 py-0.5 bg-[#EBF2FF] text-[#052698] rounded-full text-[9px] font-semibold">Operacion: {(cotsSistema||[]).find((c:any)=>c.id===cotizacion.cotizacion_id)?.num} — {(cotsSistema||[]).find((c:any)=>c.id===cotizacion.cotizacion_id)?.cliente}</span>}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setEditando(!editando)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-colors ${editando ? 'bg-gray-100 border-gray-200 text-gray-600' : 'border-[#1168F8] text-[#1168F8] hover:bg-[#EBF2FF]'}`}>
              {editando ? 'Cancelar' : 'Editar items'}
            </button>
            <button onClick={onEliminar} className="px-4 py-2 rounded-xl text-xs font-semibold border border-red-200 text-red-600 hover:bg-red-50 transition-colors">Eliminar</button>
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm mb-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-sm text-gray-900">Items</h3>
          {editando && <button onClick={addItem} className="px-3 py-1.5 border border-[#1168F8] text-[#1168F8] rounded-xl text-xs font-bold hover:bg-[#EBF2FF]">+ Agregar</button>}
        </div>

        {editando ? (
          <>
            <div className="grid gap-2 mb-1 text-[10px] text-gray-400 font-semibold uppercase tracking-wide" style={{ gridTemplateColumns: '2fr 130px 110px 110px auto' }}>
              <div>Descripcion</div><div>Tipo</div><div className="text-right">Valor</div><div>Contenedor</div><div></div>
            </div>
            {items.map((it, i) => (
              <div key={i} className="grid gap-2 mb-2 items-center" style={{ gridTemplateColumns: '2fr 130px 110px 110px auto' }}>
                <input value={it.descripcion} onChange={e => updateItem(i, 'descripcion', e.target.value)} className={inp} />
                <select value={it.tipo_calculo} onChange={e => updateItem(i, 'tipo_calculo', e.target.value)} className={inp}>
                  {Object.entries(TIPO_CALCULO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input type="text" inputMode="decimal" value={it.valor || ''} onFocus={e => e.target.select()}
                  onChange={e => updateItem(i, 'valor', e.target.value)} className={inp + ' text-right font-mono'} />
                <input value={it.tipo_contenedor || ''} onChange={e => updateItem(i, 'tipo_contenedor', e.target.value)} className={inp} />
                <button onClick={() => removeItem(i)} className="text-gray-400 hover:text-red-500 text-xs p-1">X</button>
              </div>
            ))}
            <div className="flex justify-end mt-3">
              <button onClick={saveItems} disabled={saving}
                className="px-5 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold disabled:opacity-50">
                {saving ? 'Guardando...' : 'Guardar items'}
              </button>
            </div>
          </>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Descripcion', 'Tipo calculo', 'Contenedor', 'Valor USD'].map(h => (
                  <th key={h} className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-3 py-2.5 font-medium text-gray-800">{it.descripcion}</td>
                  <td className="px-3 py-2.5 text-gray-500">{TIPO_CALCULO[it.tipo_calculo] || it.tipo_calculo}</td>
                  <td className="px-3 py-2.5 text-gray-500 font-mono text-[11px]">{it.tipo_contenedor || 'Todos'}</td>
                  <td className="px-3 py-2.5 font-mono font-semibold text-[#052698] text-right">USD {fmt(parseFloat(it.valor as any) || 0)}</td>
                </tr>
              ))}
              <tr className="bg-[#EBF2FF] border-t-2 border-[#1168F8]">
                <td colSpan={3} className="px-3 py-2 text-xs font-bold text-[#052698]">TOTAL</td>
                <td className="px-3 py-2 font-mono font-bold text-[#052698] text-right">USD {fmt(totalUSD)}</td>
              </tr>
            </tbody>
          </table>
        )}

        {cotizacion.seguro_incluido && (
          <div className="mt-3 px-3 py-2 bg-[#EBF2FF] border border-[#93B8FC] rounded-lg text-xs text-[#052698]">
            Seguro incluido en esta cotizacion{cotizacion.seguro_monto ? ` — USD ${fmt(cotizacion.seguro_monto)}` : ''}
          </div>
        )}
      </div>

      {/* Asociacion a cotizacion del sistema */}
      <AsociarCotizacion cotizacion={cotizacion} supabase={supabase} cotsSistema={cotsSistema||[]} onReload={onReload} />

      {cotizacion.notas && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <div className="text-[10px] font-semibold text-gray-500 uppercase mb-2">Notas</div>
          <div className="text-xs text-gray-700">{cotizacion.notas}</div>
        </div>
      )}
    </div>
  )
}

function AsociarCotizacion({ cotizacion, supabase, cotsSistema, onReload }: any) {
  const [buscar, setBuscar] = useState('')
  const [showDrop, setShowDrop] = useState(false)
  const [saving, setSaving] = useState(false)
  const cotVinculada = cotsSistema.find((c: any) => c.id === cotizacion.cotizacion_id)
  const cotsFiltradas = cotsSistema.filter((c: any) =>
    !buscar || c.num?.toLowerCase().includes(buscar.toLowerCase()) || c.cliente?.toLowerCase().includes(buscar.toLowerCase())
  ).slice(0, 8)
  const inp = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white'

  async function asociar(cotId: string) {
    setSaving(true)
    await (supabase.from('cotizaciones_proveedor_v2') as any).update({ cotizacion_id: cotId || null }).eq('id', cotizacion.id)
    await onReload()
    setBuscar('')
    setShowDrop(false)
    setSaving(false)
  }

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm mb-4">
      <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-3">Cotizacion del sistema vinculada</div>
      {cotVinculada ? (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#EBF2FF] flex items-center justify-center text-[#052698] text-[10px] font-bold">{cotVinculada.num?.slice(-3)}</div>
            <div>
              <div className="text-sm font-semibold text-gray-900">{cotVinculada.num}</div>
              <div className="text-[10px] text-gray-400">{cotVinculada.cliente}</div>
            </div>
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold ${cotVinculada.estado==='aprobada'?'bg-green-50 text-green-700':'bg-gray-100 text-gray-500'}`}>{cotVinculada.estado}</span>
          </div>
          <button onClick={() => asociar('')} disabled={saving}
            className="px-3 py-1.5 border border-red-200 text-red-500 rounded-xl text-xs hover:bg-red-50 transition-colors">
            Desvincular
          </button>
        </div>
      ) : (
        <div className="relative">
          <input value={buscar} onChange={e => { setBuscar(e.target.value); setShowDrop(true) }}
            onFocus={() => setShowDrop(true)}
            className={inp} placeholder="Buscar cotizacion por N o cliente..." />
          {showDrop && cotsFiltradas.length > 0 && (
            <div className="absolute z-50 top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl mt-1 max-h-48 overflow-y-auto">
              {cotsFiltradas.map((c: any) => (
                <button key={c.id} onMouseDown={() => asociar(c.id)}
                  className="w-full text-left px-4 py-2.5 hover:bg-[#EBF2FF] text-xs border-b border-gray-50 last:border-0">
                  <span className="font-mono font-semibold text-[#1168F8]">{c.num}</span>
                  <span className="text-gray-600 ml-2">{c.cliente}</span>
                  <span className={`ml-2 text-[9px] px-1.5 py-0.5 rounded-full ${c.estado==='aprobada'?'bg-green-50 text-green-700':'bg-gray-100 text-gray-500'}`}>{c.estado}</span>
                </button>
              ))}
            </div>
          )}
          {cotsFiltradas.length === 0 && buscar && (
            <div className="mt-2 text-xs text-gray-400">Sin resultados para "{buscar}"</div>
          )}
        </div>
      )}
    </div>
  )
}
