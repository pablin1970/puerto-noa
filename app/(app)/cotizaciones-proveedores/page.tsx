'use client'
import { useEffect, useState, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { cargarPermisos, puede } from '@/lib/permisos'

// Colores por código — se combina con rubros dinámicos de DB
const RUBRO_COLORS: Record<string, { color: string; bg: string }> = {
  forwarder:            { color: '#1168F8', bg: '#EBF2FF' },
  agente:     { color: '#0a9e6e', bg: '#E1F5EE' },
  transporte_terrestre: { color: '#b45309', bg: '#FEF3C7' },
  despachante:     { color: '#6b21a8', bg: '#F3E8FF' },
  deposito:             { color: '#0891b2', bg: '#E0F2FE' },
  naviera:              { color: '#0e7490', bg: '#E0F7FA' },
  seguro:               { color: '#15803d', bg: '#DCFCE7' },
  otro:                 { color: '#6b7280', bg: '#F3F4F6' },
}
// RUBROS se reconstruye dinámicamente — este es el fallback
const RUBROS: Record<string, { label: string; color: string; bg: string }> = {
  forwarder:            { label: 'ForWarder',            color: '#1168F8', bg: '#EBF2FF' },
  agente:     { label: 'Agente',     color: '#0a9e6e', bg: '#E1F5EE' },
  transporte_terrestre: { label: 'Transporte terrestre', color: '#b45309', bg: '#FEF3C7' },
  despachante:     { label: 'Despachante',     color: '#6b21a8', bg: '#F3E8FF' },
  deposito:             { label: 'Deposito fiscal',      color: '#0891b2', bg: '#E0F2FE' },
  naviera:              { label: 'Naviera',              color: '#0e7490', bg: '#E0F7FA' },
  seguro:               { label: 'Seguro de carga',      color: '#15803d', bg: '#DCFCE7' },
  otro:                 { label: 'Otro',                 color: '#6b7280', bg: '#F3F4F6' },
}

// Bloque por defecto según rubro (número de bloque en cotizador_bloques)
// Usa los CÓDIGOS REALES de proveedor_rubros (editables desde Catálogos)
const RUBRO_BLOQUE_DEFAULT: Record<string, number> = {
  proveedor_mercaderia: 0, // Proveedor de mercadería → bloque Mercadería
  forwarder: 1,           // Freight Forwarder → marítimo
  naviera: 1,             // Naviera → marítimo
  deposito: 2,            // Almacen extra puertario → Chile
  agente: 2,    // Agente → Chile
  transporte_terrestre: 3,// Transporte terrestre
  despachante: 4,    // Despachante de aduana → Argentina
}

// Categoría por defecto de los ítems según rubro (para inteligencia de precios)
const RUBRO_CATEGORIA_DEFAULT: Record<string, string> = {
  proveedor_mercaderia: 'mercaderia',
  forwarder: 'flete_maritimo',
  naviera: 'flete_maritimo',
  deposito: 'almacenaje',
  despachante: 'honorarios_despachante',
  transporte_terrestre: 'flete_terrestre',
  seguro: 'seguro',
}

// ── Mapeo CÓDIGO de rubro → TIPO de formulario que se muestra ──
// FUNDAMENTAL: cualquier rubro nuevo en la base que no esté acá cae en 'generico'
// sin romper nada. No depende de keys hardcodeados de botones.
type TipoFormulario = 'maritimo' | 'terrestre' | 'almacenaje' | 'despachante' | 'seguro' | 'mercaderia' | 'generico'
const FORMULARIO_POR_RUBRO: Record<string, TipoFormulario> = {
  proveedor_mercaderia: 'mercaderia',
  forwarder: 'maritimo',
  naviera: 'maritimo',
  transporte_terrestre: 'terrestre',
  deposito: 'almacenaje',
  despachante: 'despachante',
  seguro: 'seguro',
  agente: 'almacenaje', // Agente — usa catálogo de servicios
  otro: 'almacenaje',             // Otro — usa catálogo de servicios
}
const tipoFormulario = (codigo: string): TipoFormulario => FORMULARIO_POR_RUBRO[codigo] || 'generico'


const TIPO_CALCULO: Record<string, string> = {
  fijo_usd:        'Fijo USD',
  fijo_ars:        'Fijo ARS',
  por_contenedor:  'Por contenedor',
  por_m3:          'Por m3',
  por_bigbag:      'Por big bag',
  pct_cif:         '% sobre CIF',
}

interface Item {
  id?: string
  descripcion: string
  tipo_calculo: string
  valor: number
  piso_usd?: number
  techo_usd?: number
  moneda: string
  tipo_contenedor: string
  orden: number
  // Campos de producto (solo rubro proveedor_mercaderia)
  ncm?: string
  cantidad?: number
  peso_unit?: number
  vol_unit?: number
  incoterm?: string
}

interface Cotizacion {
  id: string
  tercero_id: string | null
  proveedor_nombre: string
  rubro: string
  tipo: string
  cotizacion_id: string | null
  cliente_id: string | null
  referencia: string
  fecha: string
  fecha_vencimiento: string
  moneda: string
  estado: string
  origen: string
  sentido?: string | null
  grupo_id?: string | null
  seguro_incluido: boolean
  seguro_monto: number | null
  notas: string
  created_at: string
  items?: Item[]
  tercero?: { razon_social: string }
}

const ITEM_VACIO: Item = { descripcion: '', tipo_calculo: 'fijo_usd', valor: 0, piso_usd: 0, techo_usd: 0, moneda: 'USD', tipo_contenedor: '', orden: 0 }

const inp = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white'
const fmtN = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const parseN = (v: string) => { const n = parseFloat(String(v).replace(',', '.').replace(/[^0-9.-]/g, '')); return isNaN(n) ? 0 : n }

const CATEGORIAS_ITEM: Record<string, string> = {
  flete_maritimo:         '🚢 Flete marítimo',
  thc_destino:            '⚓ THC destino',
  bl_fee:                 '📄 BL Fee',
  handling:               '🏗 Handling / Estiba',
  flete_terrestre:        '🚛 Flete terrestre',
  desconsolidacion:       '📦 Desconsolidación',
  almacenaje:             '🏭 Almacenaje',
  honorarios_despachante: '📋 Honorarios despachante',
  gastos_aduana:          '🏛 Gastos aduana',
  seguro:                 '🛡 Seguro',
  otro:                   '· Otro',
}

// ── Fila de item con categorías dinámicas ────────────────────────────────────
function ItemRow({ it, i, tiposCont, onChange, onRemove, editMode = true }: {
  it: Item; i: number; tiposCont: any[]
  onChange: (i: number, f: string, v: any) => void; onRemove: (i: number) => void; editMode?: boolean
}) {
  const esPct = it.tipo_calculo === 'pct_cif'
  const tiposCalc: Record<string,string> = TIPO_CALCULO
  const mostrarCont = true

  if (!editMode) return (
    <tr className="border-b border-gray-50 hover:bg-gray-50">
      <td className="px-3 py-2.5 font-medium text-gray-800">{it.descripcion}</td>
      <td className="px-3 py-2.5 text-gray-500 text-[11px]">{TIPO_CALCULO[it.tipo_calculo] || it.tipo_calculo}</td>
      {mostrarCont && <td className="px-3 py-2.5 text-gray-500 font-mono text-[11px]">{it.tipo_contenedor || 'Todos'}</td>}
      <td className="px-3 py-2.5 font-mono text-[#052698] text-right">
        {esPct ? `${it.valor}%` : `USD ${fmtN(parseN(String(it.valor)))}`}
        {esPct && (it.piso_usd || it.techo_usd) ? (
          <div className="text-[9px] text-gray-400">
            {it.piso_usd ? `Piso ${fmtN(it.piso_usd)}` : ''}{it.piso_usd && it.techo_usd ? ' · ' : ''}{it.techo_usd ? `Techo ${fmtN(it.techo_usd)}` : ''}
          </div>
        ) : null}
      </td>
    </tr>
  )

  return (
    <div className="mb-2.5 p-3 bg-gray-50 rounded-xl border border-gray-100">
      {/* Fila 1: tipo cálculo + contenedor + valor + eliminar */}
      <div className="grid gap-2 mb-2" style={{gridTemplateColumns:'1fr auto auto auto'}}>
        <select value={it.tipo_calculo} onChange={e=>onChange(i,'tipo_calculo',e.target.value)}
          className="px-2 py-1.5 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white">
          {Object.entries(tiposCalc).map(([k,v])=><option key={k} value={k}>{v as string}</option>)}
        </select>
        {mostrarCont?(
          <select value={it.tipo_contenedor} onChange={e=>onChange(i,'tipo_contenedor',e.target.value)}
            className="px-2 py-1.5 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white w-20">
            <option value="">Todos</option>
            {tiposCont.map((t:any)=><option key={t.codigo} value={t.codigo}>{t.codigo}</option>)}
          </select>
        ):<div/>}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-400 w-6 text-right flex-shrink-0">
            {esPct?'%':it.tipo_calculo==='fijo_ars'?'$':'U$'}
          </span>
          <input type="text" inputMode="decimal" value={it.valor||''} onFocus={e=>e.target.select()}
            onChange={e=>onChange(i,'valor',e.target.value)}
            className="w-24 px-2 py-1.5 border border-gray-200 rounded-xl text-xs text-right font-mono focus:outline-none focus:border-[#1168F8] bg-white"
            placeholder="0.00"/>
        </div>
        <button onClick={()=>onRemove(i)} className="text-gray-400 hover:text-red-500 text-xs px-1">✕</button>
      </div>
      {/* Fila 2: descripción libre */}
      <input value={it.descripcion} onChange={e=>onChange(i,'descripcion',e.target.value)}
        className={inp+' text-xs'} placeholder="Descripción adicional (opcional)"/>

      {/* Piso / Techo — solo % CIF (bloque 4) */}
      {esPct && (
        <div className="flex gap-3 items-center pl-1 mt-1">
          <span className="text-[10px] text-gray-400">Piso USD</span>
          <input type="text" inputMode="decimal" value={it.piso_usd||''} onFocus={e=>e.target.select()}
            onChange={e=>onChange(i,'piso_usd',parseN(e.target.value))}
            className="w-28 px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-right font-mono bg-white focus:outline-none focus:border-[#1168F8]"
            placeholder="0 = sin piso"/>
          <span className="text-[10px] text-gray-400">Techo USD</span>
          <input type="text" inputMode="decimal" value={it.techo_usd||''} onFocus={e=>e.target.select()}
            onChange={e=>onChange(i,'techo_usd',parseN(e.target.value))}
            className="w-28 px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-right font-mono bg-white focus:outline-none focus:border-[#1168F8]"
            placeholder="0 = sin techo"/>
          <span className="text-[10px] text-gray-400 italic">0 = sin límite</span>
        </div>
      )}
    </div>
  )
}

function CotizacionesProveedoresInner() {
  const supabase = useMemo(() => createClient(), [])
  const searchParams = useSearchParams()
  const [previewModal, setPreviewModal] = useState<{url:string;nombre:string;tipo:string}|null>(null)
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([])
  const [terceros, setTerceros] = useState<any[]>([])
  const [cotsSistema, setCotsSistema] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'lista' | 'nueva' | 'detalle'>('lista')
  // Params prellenados desde el cotizador
  const [initParams, setInitParams] = useState<any>(null)
  const [selId, setSelId] = useState<string | null>(null)
  const [rubrosDB, setRubrosDB] = useState<Record<string,{label:string;color:string;bg:string}>>(RUBROS)
  const [filtroRubro, setFiltroRubro] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [buscar, setBuscar] = useState('')
  const [permisos, setPermisos] = useState<Record<string,string[]>>({})
  const [permListos, setPermListos] = useState(false)
  // Snapshot de la cotización a duplicar (se restaura al abrir el formulario)
  const [dupSnapshot, setDupSnapshot] = useState<any>(null)

  useEffect(() => {
    loadAll()
    cargarPermisos().then(p => { setPermisos(p); setPermListos(true) })
    // Detectar si viene del cotizador con params prellenados
    const esNuevo = searchParams.get('nuevo')
    if(esNuevo === '1') {
      const params = {
        rubro: searchParams.get('rubro') || '',
        bloque: searchParams.get('bloque') || '',
        cliente_id: searchParams.get('cliente_id') || '',
        cliente_nombre: searchParams.get('cliente_nombre') || '',
      }
      setInitParams(params)
      setView('nueva')
    }
  }, [])

  async function loadAll() {
    setLoading(true)
    // Queries separadas para evitar joins que pueden fallar por RLS
    const [cotRes, itemsRes, tercRes, cotsRes, rubrosRes] = await Promise.all([
      supabase.from('cotizaciones_proveedor_v2')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase.from('cotizaciones_proveedor_v2_items')
        .select('*')
        .order('orden', { ascending: true }),
      supabase.from('terceros').select('id,razon_social,tipo,nro_doc,tipo_doc,nombre_fantasia').eq('activo', 'true').order('razon_social'),
      supabase.from('cotizaciones').select('id,num,cliente,estado').order('created_at', { ascending: false }).limit(200),
      supabase.from('proveedor_rubros').select('id,nombre,codigo,activo').eq('activo', true).order('nombre'),
    ])
    // Construir mapa de rubros dinámico
    if(rubrosRes.data){
      const map:Record<string,{label:string;color:string;bg:string}>={}
      for(const r of rubrosRes.data as any[]){
        const cod=r.codigo||r.nombre.toLowerCase().replace(/ /g,'_')
        const colors=RUBRO_COLORS[cod]||RUBRO_COLORS.otro
        map[cod]={label:r.nombre, color:colors.color, bg:colors.bg}
      }
      setRubrosDB(map)
    }
    if (cotRes.data && itemsRes.data) {
      // Combinar items con sus cotizaciones manualmente
      const itemsPorCot: Record<string, Item[]> = {}
      for (const it of itemsRes.data as any[]) {
        if (!itemsPorCot[it.cotizacion_id]) itemsPorCot[it.cotizacion_id] = []
        itemsPorCot[it.cotizacion_id].push(it)
      }
      setCotizaciones((cotRes.data as any[]).map(c => ({ ...c, items: itemsPorCot[c.id] || [] })))
    }
    if (tercRes.data) setTerceros(tercRes.data)
    if (cotsRes.data) setCotsSistema(cotsRes.data)
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

  // Duplicar una cotización: restaura el formulario completo desde el snapshot,
  // pone la fecha de hoy y deja que el TC se recapture al guardar. Abre como nueva.
  async function duplicarCotizacion(cotId: string) {
    const { data: orig } = await supabase
      .from('cotizaciones_proveedor_v2').select('estado_formulario').eq('id', cotId).single()
    const snap = (orig as any)?.estado_formulario
    if (!snap || typeof snap !== 'object' || !snap.form) {
      alert('Esta cotización se cargó antes de que existiera la duplicación, así que no tiene los datos guardados para copiarla. Las que cargues de ahora en más sí se podrán duplicar.')
      return
    }
    const hoy = new Date().toISOString().slice(0, 10)
    const snapAjustado = {
      ...snap,
      form: { ...snap.form, fecha: hoy, fecha_vencimiento: '' },
    }
    setInitParams(null)
    setDupSnapshot(snapAjustado)
    setView('nueva')
  }

  const stats = Object.keys(rubrosDB).map(r => ({
    rubro: r,
    total: cotizaciones.filter(c => c.rubro === r && c.estado === 'vigente').length,
  })).filter(s => s.total > 0)

  const puedeCrear = puede(permisos,'cotizaciones_proveedores','crear')
  const puedeEditar = puede(permisos,'cotizaciones_proveedores','editar')
  const puedeEliminar = puede(permisos,'cotizaciones_proveedores','eliminar')

  if (permListos && !puede(permisos,'cotizaciones_proveedores','ver')) {
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
          <h1 className="text-xl font-bold text-gray-900">Cotizaciones de proveedores</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {cotizaciones.filter(c => c.estado === 'vigente').length} vigentes de {cotizaciones.length} total
          </p>
        </div>
        <div className="flex gap-2">
          {view !== 'lista' && (
            <button onClick={() => setView('lista')} className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold hover:bg-gray-100">Volver</button>
          )}
          {view === 'lista' && puedeCrear && (
            <button onClick={() => { setDupSnapshot(null); setInitParams(null); setView('nueva') }} className="px-5 py-2.5 bg-[#1168F8] text-white rounded-xl text-sm font-bold hover:bg-[#0a4fc4] shadow-sm">+ Nueva cotizacion</button>
          )}
        </div>
      </div>

      {view === 'lista' && stats.length > 0 && (
        <div className="flex gap-2 mb-5 flex-wrap">
          {stats.map(s => {
            const r = rubrosDB[s.rubro] || RUBROS[s.rubro] || RUBROS.otro || {label:s.rubro,color:'#6b7280',bg:'#f3f4f6'}
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

          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
            {loading ? (
              <div className="p-12 text-center text-gray-400">Cargando...</div>
            ) : filtradas.length === 0 ? (
              <div className="p-12 text-center">
                <div className="text-gray-500 text-sm mb-3">{cotizaciones.length === 0 ? 'Sin cotizaciones cargadas aun' : 'Sin resultados'}</div>
                {cotizaciones.length === 0 && puedeCrear && (
                  <button onClick={() => { setDupSnapshot(null); setInitParams(null); setView('nueva') }} className="px-4 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold">+ Cargar primera cotizacion</button>
                )}
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {['Proveedor', 'Rubro', 'Tipo', 'Referencia', 'Fecha', 'Vence', 'Items', 'Estado', 'Duplicar', ''].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map(c => {
                    const r = rubrosDB[c.rubro] || RUBROS.otro
                    const totalItems = (c.items || []).length
                    return (
                      <tr key={c.id} className="border-b border-gray-50 hover:bg-blue-50/20 transition-colors group cursor-pointer"
                        onClick={() => { setSelId(c.id); setView('detalle') }}>
                        <td className="px-4 py-3.5">
                          <div className="font-semibold text-gray-900">{c.proveedor_nombre}</div>
                          {c.referencia && <div className="text-[10px] text-gray-400 font-mono">{c.referencia}{c.sentido==='importacion'?' /I':c.sentido==='exportacion'?' /E':''}</div>}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: r.bg, color: r.color }}>{r.label}</span>
                            {c.sentido==='importacion' && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#EBF2FF] text-[#052698]">📦 Impo</span>}
                            {c.sentido==='exportacion' && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-50 text-green-700">🚢 Expo</span>}
                            {c.grupo_id && <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-gray-100 text-gray-400" title="Cotización con versión Impo y Expo hermanadas">🔗</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${c.tipo === 'especifica' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                            {c.tipo === 'especifica' ? '⭐ Especifica' : 'Generica'}
                          </span>
                          {c.origen === 'estimada' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 text-purple-700">✏️ Estimada</span>
                          )}
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
                            disabled={!puedeEditar}
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border-0 ${puedeEditar?'cursor-pointer':'cursor-default opacity-80'} focus:outline-none ${
                              c.estado === 'vigente' ? 'bg-green-50 text-green-700' :
                              c.estado === 'vencida' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-500'
                            }`}>
                            <option value="vigente">Vigente</option>
                            <option value="vencida">Vencida</option>
                            <option value="reemplazada">Reemplazada</option>
                          </select>
                        </td>
                        <td className="px-4 py-3.5">
                          {puede(permisos,'cotizaciones_proveedores_duplicar','crear') && (
                            <button onClick={e => { e.stopPropagation(); duplicarCotizacion(c.id) }}
                              className="px-3 py-1.5 bg-[#EBF2FF] text-[#1168F8] rounded-lg text-[11px] font-bold hover:bg-[#1168F8] hover:text-white transition-colors whitespace-nowrap">
                              ⧉ Duplicar
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                            <button onClick={e => { e.stopPropagation(); setSelId(c.id); setView('detalle') }}
                              className="p-1.5 border border-gray-200 rounded-lg hover:bg-[#EBF2FF] text-gray-500 hover:text-[#1168F8] transition-colors">E</button>
                            {puedeEliminar && <button onClick={e => { e.stopPropagation(); eliminar(c.id) }}
                              className="p-1.5 border border-red-100 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">X</button>}
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
          cotsSistema={cotsSistema}
          rubrosDisp={rubrosDB}
          onSave={async () => { setDupSnapshot(null); await loadAll(); setView('lista') }}
          onCancel={() => { setDupSnapshot(null); setView('lista') }}
          initParams={initParams}
          snapshotInicial={dupSnapshot}
        />
      )}

      {view === 'detalle' && sel && (
        <DetalleCotizacion
          cotizacion={sel}
          supabase={supabase}
          terceros={terceros}
          cotsSistema={cotsSistema}
          rubrosDisp={rubrosDB}
          onReload={async () => { await loadAll() }}
          onBack={() => setView('lista')}
          onEliminar={() => eliminar(sel.id)}
          permisos={permisos}
        />
      )}
      {previewModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={()=>setPreviewModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <span className="font-medium text-sm truncate">{previewModal.nombre}</span>
              <div className="flex items-center gap-2">
                {puede(permisos,'cotizaciones_proveedores','descargar') && (
                <a href={previewModal.url} download={previewModal.nombre} className="px-3 py-1.5 bg-gray-50 border border-gray-200 text-gray-600 rounded-lg text-xs">⬇ Descargar</a>
                )}
                <button onClick={()=>setPreviewModal(null)} className="text-gray-400 text-xl px-1">×</button>
              </div>
            </div>
            {previewModal.tipo==='pdf'
              ? <iframe src={previewModal.url} className="w-full h-[70vh] border-0" title={previewModal.nombre}/>
              : <img src={previewModal.url} alt={previewModal.nombre} className="max-w-full mx-auto rounded p-4"/>}
          </div>
        </div>
      )}
    </div>
  )
}

function FormCotizacion({ supabase, terceros, cotsSistema, rubrosDisp, onSave, onCancel, cotizacionInicial, initParams, snapshotInicial }: any) {
  const rubros = rubrosDisp || RUBROS
  const [sentido, setSentido] = useState<'importacion'|'exportacion'|'ambos'>(snapshotInicial?.sentido || 'importacion')
  // ── Multi-tramo terrestre (sentido simple) ──
  // Cada tramo = un ítem con ruta estructurada + tarifas. Permite cargar varias rutas en una cotización.
  const TRAMO_VACIO = { origen_id:'', origen_tipo:'', destino_id:'', destino_tipo:'', paso_id:'', tipo_camion:'', tipo_contenedor:'', flete_ida:'', flete_vuelta:'', flete_rt:'', seguro_modo:'pct', seguro_monto:'' }
  // tramosA: sentido simple (impo o expo) Y versión A del modo "ambos" (importación)
  // tramosB: versión B del modo "ambos" (exportación)
  const [tramos, setTramos] = useState<any[]>(snapshotInicial?.tramos || [{ ...TRAMO_VACIO }])
  const [tramosB, setTramosB] = useState<any[]>(snapshotInicial?.tramosB || [{ ...TRAMO_VACIO }])
  const setTramo = (i:number, k:string, v:any) => setTramos(prev => prev.map((t,idx)=> idx===i ? {...t,[k]:v} : t))
  const addTramo = () => setTramos(prev => [...prev, { ...TRAMO_VACIO }])
  const removeTramo = (i:number) => setTramos(prev => prev.length>1 ? prev.filter((_,idx)=>idx!==i) : prev)
  const setTramoB = (i:number, k:string, v:any) => setTramosB(prev => prev.map((t,idx)=> idx===i ? {...t,[k]:v} : t))
  const addTramoB = () => setTramosB(prev => [...prev, { ...TRAMO_VACIO }])
  const removeTramoB = (i:number) => setTramosB(prev => prev.length>1 ? prev.filter((_,idx)=>idx!==i) : prev)
  // Versión B (exportación) — solo se usa cuando sentido==='ambos'. Campos que cambian por sentido en terrestre.
  const [formB, setFormB] = useState(snapshotInicial?.formB || {
    puerto_chile_id: '', paso_id: '', ciudad_origen_id: '', ciudad_destino_id: '',
    tipo_camion: '', tipo_contenedor: '',
    flete_ida: '', flete_vuelta: '', flete_rt: '',
  })
  const setFB = (k: string, v: any) => setFormB((p:any) => ({ ...p, [k]: v }))
  const [form, setForm] = useState({
    proveedor_nombre: '', tercero_id: '', rubro: 'forwarder', tipo: 'generica',
    referencia: '', fecha: new Date().toISOString().slice(0, 10), fecha_vencimiento: '',
    moneda: 'USD', estado: 'vigente', origen: 'recibida',
    seguro_incluido: false, seguro_modo: 'pct', seguro_monto: '',
    seguro_alcance: 'maritimo',
    seguro_terrestre: false, seguro_terrestre_pct: '', seguro_terrestre_min: '',
    notas: '', cotizacion_id: '', cliente_id: '',
    bloque_ids: [] as string[], bloque_id: '',
    puerto_china_id: '', puerto_chile_id: '', paso_id: '', ciudad_origen_id: '', ciudad_destino_id: '',
    tipo_contenedor: '', tipo_camion: '', tc_referencia: '', es_tarifa_base: false,
    flete_ida: '', flete_vuelta: '', flete_rt: '',
    almacen_ubicacion: '', almacen_dias_gratis: '0',
    lugar_prestacion_tipo: '', lugar_prestacion_id: '', etiqueta_lugar: '',
    almacen_m3_dia: '', almacen_m3_min: '',
    almacen_pallet_dia: '', almacen_pallet_min: '',
    almacen_bigbag_dia: '', almacen_bigbag_min: '',
    almacen_cont_dia: '', almacen_cont_min: '',
    ...cotizacionInicial,
    ...(snapshotInicial?.form || {}),
  })
  const [items, setItems] = useState<Item[]>(snapshotInicial?.items || cotizacionInicial?.items || [{ ...ITEM_VACIO }])
  const [saving, setSaving] = useState(false)
  const [compFile, setCompFile] = useState<File|null>(null)
  const [previewModal, setPreviewModal] = useState<{url:string;nombre:string;tipo:string}|null>(null)
  const [buscarProv, setBuscarProv] = useState('')
  const [showProvDropdown, setShowProvDropdown] = useState(false)
  const [usuarioNombre, setUsuarioNombre] = useState('')
  // Alta rápida de proveedor no registrado
  const [showAltaProv, setShowAltaProv] = useState(false)
  const [altaProvNombre, setAltaProvNombre] = useState('')
  const [altaProvRubroId, setAltaProvRubroId] = useState('')
  const [altaProvSaving, setAltaProvSaving] = useState(false)
  const [tercerosConRubro, setTercerosConRubro] = useState<any[]>([])
  const [lugaresProv, setLugaresProv] = useState<any[]>([])  // ciudades donde el proveedor presta el rubro actual
  const [buscarCot, setBuscarCot] = useState('')
  const [showCotDropdown, setShowCotDropdown] = useState(false)
  const [bloques, setBloques] = useState<any[]>([])
  const [puertosCh, setPuertosCh] = useState<any[]>([])
  const [puertosChile, setPuertosChile] = useState<any[]>([])
  const [pasos, setPasos] = useState<any[]>([])
  const [ciudades, setCiudades] = useState<any[]>([])
  const [tiposCont, setTiposCont] = useState<any[]>([])
  const [tiposCamion, setTiposCamion] = useState<any[]>([])
  const [rubrosCatalogo, setRubrosCatalogo] = useState<any[]>([])
  // Catálogo de servicios de depósito (Fase 2) + servicios cargados en esta cotización
  const [depServiciosCat, setDepServiciosCat] = useState<any[]>([])
  const [depMetricas, setDepMetricas] = useState<any[]>([])
  const [depHab, setDepHab] = useState<Set<string>>(new Set())
  const [depHabMin, setDepHabMin] = useState<Set<string>>(new Set())  // formas con "mínimo de cobro" tildado en el catálogo
  const [depServicios, setDepServicios] = useState<any[]>(snapshotInicial?.depServicios || [])
  const [depSelSvc, setDepSelSvc] = useState('')
  // Lugares de prestación = unión de las tablas estables (puertos Chile/China + ciudades NOA). Sin tabla 'ciudades'.
  const lugaresEstables = useMemo<any[]>(() => ([
    ...((puertosChile as any[]) || []).map(c => ({ lugar_tipo: 'puerto_chile', id: c.id, ciudad: c.ciudad, pais: 'CL', region: c.region || '' })),
    ...((puertosCh as any[]) || []).map(c => ({ lugar_tipo: 'puerto_china', id: c.id, ciudad: c.ciudad, pais: 'CN', region: c.region || '' })),
    ...((ciudades as any[]) || []).map(c => ({ lugar_tipo: 'ciudad_arg', id: c.id, ciudad: c.ciudad, pais: 'AR', region: c.provincia || '' })),
  ]), [puertosChile, puertosCh, ciudades])

  const inp = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white'
  const sel = inp
  const setF = (k: string, v: any) => setForm((p:any) => ({ ...p, [k]: v }))

  // ── Servicios de depósito (Fase 2): agregar / quitar / editar valores ──
  function depAgregarServicio() {
    if(!depSelSvc) return
    const svc = depServiciosCat.find(s=>s.id===depSelSvc)
    if(!svc) return
    const formas = depMetricas
      .filter(m=>depHab.has(svc.id+'|'+m.id))
      .map(m=>({ metrica_id:m.id, nombre:m.nombre, codigo:m.codigo, comportamiento:m.comportamiento, precio:'', moneda:(m.codigo==='fijo_ars'?'ARS':''), minimo:'', dias_libres:'', techo:'' }))
    setDepServicios(prev=>[...prev, { servicio_id:svc.id, nombre:svc.nombre, grupo:svc.grupo, dias_libres:'', formas }])
    setDepSelSvc('')
  }
  function depQuitarServicio(servicioId:string) {
    setDepServicios(prev=>prev.filter(s=>s.servicio_id!==servicioId))
  }
  // Días libres es UNO por servicio (no por forma): el depósito da X días, no importa cómo facture.
  function depSetDiasServicio(servicioId:string, valor:string) {
    setDepServicios(prev=>prev.map(s=> s.servicio_id===servicioId ? { ...s, dias_libres:valor } : s))
  }
  function depSetForma(servicioId:string, metricaId:string, campo:string, valor:string) {
    setDepServicios(prev=>prev.map(s=>{
      if(s.servicio_id!==servicioId) return s
      return { ...s, formas: s.formas.map((f:any)=> f.metrica_id===metricaId ? { ...f, [campo]:valor } : f) }
    }))
  }

  // ── Opción 2: autocompletar la etiqueta del lugar según proveedor + ciudad ──
  // Busca la última etiqueta usada para esa dupla en cotizaciones anteriores y la sugiere,
  // solo si el campo está vacío (no pisa lo que el usuario escribió).
  useEffect(() => {
    const rubroEsDeposito = tipoFormulario(form.rubro) === 'almacenaje'
    if(!rubroEsDeposito) return
    if(!form.lugar_prestacion_id) return
    if(!form.tercero_id && !form.proveedor_nombre) return
    if(form.etiqueta_lugar && form.etiqueta_lugar.trim() !== '') return
    let cancelado = false
    ;(async () => {
      let q = supabase.from('cotizaciones_proveedor_v2')
        .select('etiqueta_lugar,fecha')
        .eq('lugar_prestacion_id', form.lugar_prestacion_id)
        .not('etiqueta_lugar', 'is', null)
        .order('fecha', { ascending: false })
        .limit(1)
      q = form.tercero_id ? q.eq('tercero_id', form.tercero_id) : q.eq('proveedor_nombre', form.proveedor_nombre)
      const { data } = await q
      if(cancelado) return
      const sugerida = (data && data[0] && (data[0] as any).etiqueta_lugar) || ''
      if(sugerida) {
        setForm((p:any) => (p.etiqueta_lugar && p.etiqueta_lugar.trim() !== '') ? p : { ...p, etiqueta_lugar: sugerida })
      }
    })()
    return () => { cancelado = true }
  }, [form.lugar_prestacion_id, form.tercero_id, form.proveedor_nombre, form.rubro])

  // Carga los lugares de prestación del proveedor para el rubro actual (frente ①).
  // El selector de ciudad se acota a estos lugares; si hay uno solo, se autoselecciona.
  useEffect(() => {
    const rubro = rubrosCatalogo.find((r: any) => r.codigo === form.rubro)
    if (!rubro || rubro.tiene_lugares_prestacion !== true || !form.tercero_id) { setLugaresProv([]); return }
    let cancelado = false
    ;(async () => {
      const { data } = await supabase.from('tercero_lugares_prestacion')
        .select('lugar_tipo, lugar_id')
        .eq('tercero_id', form.tercero_id)
        .eq('rubro_id', rubro.id)
      if (cancelado) return
      const idx = new Map(lugaresEstables.map((c: any) => [c.lugar_tipo + ':' + c.id, c]))
      const lugares = (data || []).map((l: any) => idx.get(l.lugar_tipo + ':' + l.lugar_id)).filter(Boolean)
      setLugaresProv(lugares)
      if (lugares.length === 1) setForm((p: any) => p.lugar_prestacion_id ? p : { ...p, lugar_prestacion_tipo: (lugares[0] as any).lugar_tipo, lugar_prestacion_id: (lugares[0] as any).id })
    })()
    return () => { cancelado = true }
  }, [form.tercero_id, form.rubro, rubrosCatalogo, lugaresEstables])

  useEffect(() => {
    Promise.all([
      supabase.from('cotizador_bloques').select('id,numero,nombre,descripcion').eq('activo',true).order('numero'),
      supabase.from('puertos_china').select('id,locode,nombre,ciudad').eq('activo','true').order('orden'),
      supabase.from('puertos_chile').select('id,locode,nombre,ciudad').eq('activo','true').order('orden'),
      supabase.from('pasos_fronterizos').select('id,nombre,provincia_argentina').eq('activo','true').order('orden'),
      supabase.from('ciudades_destino_arg').select('id,ciudad,provincia').eq('activo','true').order('orden'),
      supabase.from('tipos_contenedor').select('id,codigo,nombre').eq('activo','true').order('orden'),
      supabase.from('proveedor_rubros').select('*').eq('activo',true).order('nombre'),
      supabase.from('servicios_catalogo').select('*').eq('activo',true).order('rubro').order('orden'),
      supabase.from('servicios_metricas').select('*').eq('activo',true).order('orden'),
      supabase.from('servicios_metricas_habilitadas').select('servicio_id,metrica_id,usa_minimo'),
      supabase.from('tipos_camion').select('id,nombre,icono').eq('activo','true').order('orden'),
    ]).then(([bl,ch,cl,ps,ci,tc,ru,dsv,dmt,dhb,tcam]) => {
      if(bl.data) setBloques(bl.data)
      if(ch.data) setPuertosCh(ch.data)
      if(cl.data) setPuertosChile(cl.data)
      if(ps.data) setPasos(ps.data)
      if(ci.data) setCiudades(ci.data)
      if(tc.data) setTiposCont(tc.data)
      if(dsv.data) setDepServiciosCat(dsv.data)
      if(dmt.data) setDepMetricas(dmt.data)
      if(dhb.data) { setDepHab(new Set((dhb.data as any[]).map(h=>h.servicio_id+'|'+h.metrica_id))); setDepHabMin(new Set((dhb.data as any[]).filter(h=>h.usa_minimo).map(h=>h.servicio_id+'|'+h.metrica_id))) }
      if(tcam.data) setTiposCamion(tcam.data)
      if(ru.data){
        // Normalizar: cada rubro con su código (fallback al nombre normalizado)
        const lista = (ru.data as any[]).map(r=>({
          ...r,
          _codigo: r.codigo || (r.nombre||'').toLowerCase().replace(/ /g,'_'),
        }))
        setRubrosCatalogo(lista)
        // Si el rubro inicial del form no existe en la lista, usar el primero disponible
        setForm((p:any)=>{
          const existe = lista.some(r=>r._codigo===p.rubro)
          return existe ? p : { ...p, rubro: lista[0]?._codigo || p.rubro }
        })
      }
    })
    Promise.all([
      supabase.from('terceros').select('id,razon_social,nro_doc,tipo_doc,nombre_fantasia').eq('activo','true').order('razon_social'),
      supabase.from('tercero_rubros').select('tercero_id,rubro:proveedor_rubros!inner(codigo)'),
    ]).then(([tRes,trRes]) => {
      if(tRes.data){
        const map: Record<string,string[]> = {}
        for(const r of (trRes.data||[]) as any[]){
          if(!map[r.tercero_id]) map[r.tercero_id]=[]
          const cod=(r.rubro as any)?.codigo||''
          if(cod) map[r.tercero_id].push(cod)
        }
        setTercerosConRubro(tRes.data.map((t:any)=>({...t,rubros:map[t.id]||[]})))
      }
    })
    supabase.auth.getUser().then(({data}:any) => {
      if(data?.user) supabase.from('usuarios').select('nombre_completo,email').eq('auth_id',data.user.id).single()
        .then(({data:u}:any) => setUsuarioNombre((u as any)?.nombre_completo||(u as any)?.email||data.user.email||'Puerto NOA'))
    })
    if(initParams?.proveedor_nombre) setF('proveedor_nombre', initParams.proveedor_nombre)
    if(initParams?.bloque_id) setF('bloque_id', initParams.bloque_id)
    if(initParams?.rubro) {
      setF('rubro', initParams.rubro)
      // Si el rubro es mercadería, preparar el primer item como producto
      if(tipoFormulario(initParams.rubro)==='mercaderia'){
        setItems(prev=>prev.length>0 ? prev.map((it,idx)=>idx===0?{...it,tipo_calculo:'producto',cantidad:it.cantidad??1,incoterm:it.incoterm||'FOB'}:it) : prev)
      }
    }
    if(initParams?.cliente_id) { setF('tipo','especifica'); setF('cliente_id', initParams.cliente_id) }
  }, [])

  // Cálculo flete terrestre: toma el menor entre ida+vuelta vs round trip
  const fIda = parseN(String(form.flete_ida||0))
  const fVuelta = parseN(String(form.flete_vuelta||0))
  const fRt = parseN(String(form.flete_rt||0))
  const sumaIdaVuelta = fIda + fVuelta
  const fleteElegido = fRt > 0 && fRt < sumaIdaVuelta ? fRt : sumaIdaVuelta
  const usaRt = fRt > 0 && fRt < sumaIdaVuelta
  // Versión B (exportación) — mismos cálculos
  const fIdaB = parseN(String(formB.flete_ida||0))
  const fVueltaB = parseN(String(formB.flete_vuelta||0))
  const fRtB = parseN(String(formB.flete_rt||0))
  const sumaIdaVueltaB = fIdaB + fVueltaB
  const fleteElegidoB = fRtB > 0 && fRtB < sumaIdaVueltaB ? fRtB : sumaIdaVueltaB
  const usaRtB = fRtB > 0 && fRtB < sumaIdaVueltaB

  // Helper: tarifa elegida de un tramo (round-trip vs ida+vuelta, la más económica)
  const calcTramo = (t:any) => {
    const ida = parseN(String(t.flete_ida||0))
    const vue = parseN(String(t.flete_vuelta||0))
    const rt = parseN(String(t.flete_rt||0))
    const suma = ida + vue
    const usaRtT = rt > 0 && rt < suma
    return { ida, vue, rt, suma, elegido: usaRtT ? rt : suma, usaRt: usaRtT }
  }
  // Nombre legible de un punto (puerto chileno o ciudad NOA) para la descripción del ítem
  const nombrePunto = (id:string, tipo:string) => {
    if(!id) return '—'
    if(tipo==='puerto') return (puertosChile.find((p:any)=>p.id===id)?.nombre) || 'Puerto'
    if(tipo==='ciudad') return (ciudades.find((c:any)=>c.id===id)?.ciudad) || 'Ciudad'
    return '—'
  }

  const listaProv = tercerosConRubro.length > 0 ? tercerosConRubro : terceros
  const provsFiltrados = listaProv.filter((t:any) => {
    const q = buscarProv.toLowerCase()
    const matchB = !buscarProv
      || t.razon_social.toLowerCase().includes(q)
      || (t.nro_doc||'').toLowerCase().includes(q)
      || (t.nombre_fantasia||'').toLowerCase().includes(q)
    const tieneRubros = t.rubros && t.rubros.length > 0
    const matchR = !form.rubro || !tercerosConRubro.length ? true : tieneRubros ? t.rubros.includes(form.rubro) : false
    return matchB && matchR
  }).slice(0,8)

  const cotsFiltradas = (cotsSistema||[]).filter((c:any) =>
    !buscarCot || c.num?.toLowerCase().includes(buscarCot.toLowerCase()) || c.cliente?.toLowerCase().includes(buscarCot.toLowerCase())
  ).slice(0,8)

  function addItem() { setItems(prev => [...prev, { ...ITEM_VACIO, orden: prev.length }]) }
  function addItemMercaderia() { setItems(prev => [...prev, { ...ITEM_VACIO, tipo_calculo:'producto', cantidad:1, incoterm:'FOB', orden: prev.length }]) }
  function removeItem(i:number) { setItems(prev => prev.filter((_,idx) => idx!==i)) }
  function updateItem(i:number, field:string, value:any) { setItems(prev => prev.map((it,idx) => idx===i ? {...it,[field]:value} : it)) }

  // ── Alta rápida de proveedor no registrado ──
  function abrirAltaProveedor() {
    setAltaProvNombre(form.proveedor_nombre || buscarProv || '')
    // Presugerir el rubro de la cotización actual (por código)
    const rubroActual = rubrosCatalogo.find((r:any)=>r._codigo===form.rubro)
    setAltaProvRubroId(rubroActual?.id || '')
    setShowProvDropdown(false)
    setShowAltaProv(true)
  }
  async function crearProveedorRapido() {
    if(!altaProvNombre.trim()) { alert('Ingresá la razón social'); return }
    if(!altaProvRubroId) { alert('Elegí el rubro del proveedor'); return }
    setAltaProvSaving(true)
    try {
      // 1. Crear el tercero (proveedor) con datos mínimos
      const { data: nuevo, error: errT } = await (supabase.from('terceros') as any)
        .insert({ razon_social: altaProvNombre.trim(), tipo: ['proveedor'], activo: true, pais: 'Argentina' })
        .select('id,razon_social').single()
      if(errT || !nuevo) { alert('Error al crear el proveedor: '+(errT?.message||'')); setAltaProvSaving(false); return }
      // 2. Vincular el rubro
      const { error: errR } = await (supabase.from('tercero_rubros') as any)
        .insert({ tercero_id: nuevo.id, rubro_id: altaProvRubroId })
      if(errR) { alert('Proveedor creado, pero falló la asignación de rubro: '+errR.message) }
      // 3. Vincular a la cotización y cerrar
      setF('proveedor_nombre', nuevo.razon_social)
      setF('tercero_id', nuevo.id)
      setBuscarProv(nuevo.razon_social)
      // Agregar a la lista local con su rubro, para que quede disponible enseguida
      const codigoRubro = rubrosCatalogo.find((r:any)=>r.id===altaProvRubroId)?._codigo || form.rubro
      setTercerosConRubro((prev:any[])=>[...prev, {id:nuevo.id, razon_social:nuevo.razon_social, rubros:[codigoRubro]}])
      setShowAltaProv(false)
      setAltaProvSaving(false)
    } catch(e:any) {
      console.error('Error en alta rápida de proveedor:', e)
      alert('Error al crear el proveedor: '+(e?.message||'revisá la consola'))
      setAltaProvSaving(false)
    }
  }

  async function handleSave() {
    if(!form.proveedor_nombre) { alert('Ingresá el nombre del proveedor'); return }
    setSaving(true)
    try {
    const esAmbos = sentido==='ambos'
    const grupoId = esAmbos ? (crypto?.randomUUID?.() || null) : null
    // Sentido de la versión A: si es ambos, A = importación
    const sentidoA = esAmbos ? 'importacion' : sentido

    // bloque_id inferido del rubro si el usuario no marcó ninguno (corrige bug de bloque_id null)
    let bloqueIdFinal = form.bloque_id || ''
    if(!bloqueIdFinal){
      const numDefault = RUBRO_BLOQUE_DEFAULT[form.rubro]
      if(numDefault!==undefined){
        // numDefault puede ser 0 (Mercadería). `bloques` incluye todos los activos.
        const bl = bloques.find((b:any)=>b.numero===numDefault)
        if(bl) bloqueIdFinal = bl.id
      }
    }
    // Bloque obligatorio: sin bloque, el cotizador no puede traer esta cotización.
    if(!bloqueIdFinal){
      alert('Asigná un bloque antes de guardar.\n\nEste rubro no tiene un bloque por defecto, así que tenés que elegir manualmente a qué bloque del cotizador pertenece. Sin bloque, la cotización no aparecerá al cargar desde el cotizador.')
      setSaving(false)
      return
    }
    // categoría por defecto de los ítems según rubro
    const catDefault = RUBRO_CATEGORIA_DEFAULT[form.rubro] || null
    // tipo de formulario del rubro elegido (maritimo/terrestre/almacenaje/despachante/seguro/generico)
    const tf = tipoFormulario(form.rubro)

    // ── Capturar el TC del día (último evento) para sellar la cotización ──
    // Snapshot flexible: todas las monedas disponibles como JSON {ARS, CLP, CNY, ...}
    // Permite convertir/comparar a futuro aunque cambien las monedas o el TC del momento.
    let tcSnapshot: Record<string, number> | null = null
    let tcEventoId: string | null = null
    try {
      const { data: tcEv } = await supabase.from('tipos_cambio_eventos')
        .select('id, ars, clp, cny')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      if (tcEv) {
        tcEventoId = (tcEv as any).id || null
        const snap: Record<string, number> = {}
        if ((tcEv as any).ars != null) snap.ARS = Number((tcEv as any).ars)
        if ((tcEv as any).clp != null) snap.CLP = Number((tcEv as any).clp)
        if ((tcEv as any).cny != null) snap.CNY = Number((tcEv as any).cny)
        tcSnapshot = Object.keys(snap).length > 0 ? snap : null
      }
    } catch (e) { /* sin TC disponible: se guarda null, no bloquea el guardado */ }

    const payload = {
      proveedor_nombre: form.proveedor_nombre, tercero_id: form.tercero_id||null,
      rubro: form.rubro, tipo: form.tipo, origen: form.origen||'recibida',
      referencia: form.referencia||null, fecha: form.fecha,
      fecha_vencimiento: form.fecha_vencimiento||null, moneda: form.moneda,
      estado: form.estado,
      sentido: sentidoA, grupo_id: grupoId,
      seguro_incluido: (tf==='maritimo'||tf==='seguro') ? form.seguro_incluido : false,
      seguro_modo: (tf==='maritimo'||tf==='seguro')&&form.seguro_incluido ? form.seguro_modo : null,
      seguro_monto: (tf==='maritimo'||tf==='seguro')&&form.seguro_incluido ? parseN(String(form.seguro_monto))||null : null,
      notas: form.notas||null, cotizacion_id: form.cotizacion_id||null,
      cliente_id: form.tipo==='especifica' ? (form.cliente_id||null) : null,
      bloque_id: bloqueIdFinal||null,
      puerto_china_id: form.puerto_china_id||null, puerto_chile_id: form.puerto_chile_id||null,
      paso_id: form.paso_id||null, ciudad_destino_id: form.ciudad_destino_id||null,
      tipo_contenedor: form.tipo_contenedor||null, tc_referencia: parseN(String(form.tc_referencia))||null,
      tc_snapshot: tcSnapshot, tc_evento_id: tcEventoId,
      lugar_prestacion_tipo: (tf==='almacenaje' || tf==='despachante') ? (form.lugar_prestacion_tipo||null) : null,
      lugar_prestacion_id: (tf==='almacenaje' || tf==='despachante') ? (form.lugar_prestacion_id||null) : null,
      etiqueta_lugar: (tf==='almacenaje' || tf==='despachante') ? (form.etiqueta_lugar||null) : null,
      // Snapshot completo del formulario para poder duplicar la cotización después
      estado_formulario: { sentido, tramos, tramosB, formB, form, items, depServicios },
    }
    const { data: cot, error } = await (supabase.from('cotizaciones_proveedor_v2') as any).insert(payload).select().single()
    if(error) { alert('Error: '+error.message); setSaving(false); return }

    // Helper: genera los ítems (hasta 3 tarifas por tramo) de una lista de tramos
    const itemsDeTramos = (lista:any[], cotizId:string) => {
      const out:any[] = []
      let ord = 0
      lista.forEach((t:any) => {
        const ida = parseN(String(t.flete_ida||0))
        const vue = parseN(String(t.flete_vuelta||0))
        const rt = parseN(String(t.flete_rt||0))
        const oNom = nombrePunto(t.origen_id, t.origen_tipo)
        const dNom = nombrePunto(t.destino_id, t.destino_tipo)
        const rutaDir = (oNom!=='—'||dNom!=='—') ? `${oNom} → ${dNom}` : 'Tramo'
        const rutaInv = (oNom!=='—'||dNom!=='—') ? `${dNom} → ${oNom}` : 'Tramo'
        const base = {
          cotizacion_id: cotizId,
          tipo_calculo: 'por_contenedor',
          moneda: form.moneda,
          tipo_contenedor: t.tipo_contenedor||null,
          tipo_camion_id: t.tipo_camion||null,
          categoria: 'flete_terrestre',
          origen_id: t.origen_id||null, origen_tipo: t.origen_tipo||null,
          destino_id: t.destino_id||null, destino_tipo: t.destino_tipo||null,
          paso_id: t.paso_id||null,
        }
        if(ida>0) out.push({ ...base, descripcion: `Flete terrestre IDA: ${rutaDir}`, valor: ida, tipo_flete: 'ida', orden: ord++ })
        if(vue>0) out.push({ ...base, descripcion: `Flete terrestre VUELTA: ${rutaInv}`, valor: vue, tipo_flete: 'vuelta', orden: ord++ })
        if(rt>0)  out.push({ ...base, descripcion: `Flete terrestre ROUND TRIP: ${oNom} → ${dNom} → ${oNom}`, valor: rt, tipo_flete: 'round_trip', orden: ord++ })
        // Seguro del tramo terrestre (opcional): hereda origen/destino/paso ya invertidos según el sentido
        const segM = parseN(String(t.seguro_monto||0))
        if(segM>0){
          const esPctSeg = (t.seguro_modo||'pct')==='pct'
          out.push({
            ...base,
            categoria: 'seguro',
            tipo_calculo: esPctSeg ? 'pct_cif' : 'fijo_usd',
            moneda: 'USD',
            descripcion: `Seguro terrestre: ${rutaDir}${esPctSeg?' (% CIF)':''}`,
            valor: segM,
            tipo_flete: 'seguro',
            orden: ord++,
          })
        }
      })
      return out
    }

    // Ruta estructurada de los ítems según rubro y sentido (para inteligencia de precios entre puntos)
    // Reutiliza puntos de cabecera. esExpoForm: true si la versión actual es exportación.
    const rutaItemRubro = (tfRubro:string, esExpoForm:boolean, f:any) => {
      if(tfRubro==='maritimo'){
        // impo: China → Chile ; expo: Chile → China (destino)
        const china = f.puerto_china_id||null
        const chile = f.puerto_chile_id||null
        return esExpoForm
          ? { origen_id: chile, origen_tipo: chile?'puerto':null, destino_id: china, destino_tipo: china?'puerto_china':null, paso_id: null }
          : { origen_id: china, origen_tipo: china?'puerto_china':null, destino_id: chile, destino_tipo: chile?'puerto':null, paso_id: null }
      }
      if(tfRubro==='almacenaje'){
        // ubicación = puerto chile (mismo en ambos sentidos)
        const chile = f.puerto_chile_id||null
        return { origen_id: chile, origen_tipo: chile?'puerto':null, destino_id: null, destino_tipo: null, paso_id: null }
      }
      if(tfRubro==='despachante'){
        // aduana: paso + ciudad destino NOA
        const ciudad = f.ciudad_destino_id||null
        return { origen_id: null, origen_tipo: null, destino_id: ciudad, destino_tipo: ciudad?'ciudad':null, paso_id: f.paso_id||null }
      }
      if(tfRubro==='seguro'){
        const china = f.puerto_china_id||null
        const chile = f.puerto_chile_id||null
        const ciudad = f.ciudad_destino_id||null
        const paso = f.paso_id||null
        const al = f.seguro_alcance||'maritimo'
        if(al==='terrestre'){
          // impo: Chile → NOA ; expo: NOA → Chile
          return esExpoForm
            ? { origen_id: ciudad, origen_tipo: ciudad?'ciudad':null, destino_id: chile, destino_tipo: chile?'puerto':null, paso_id: paso }
            : { origen_id: chile, origen_tipo: chile?'puerto':null, destino_id: ciudad, destino_tipo: ciudad?'ciudad':null, paso_id: paso }
        }
        if(al==='punta_a_punta'){
          // impo: China → NOA ; expo: NOA → China
          return esExpoForm
            ? { origen_id: ciudad, origen_tipo: ciudad?'ciudad':null, destino_id: china, destino_tipo: china?'puerto_china':null, paso_id: paso }
            : { origen_id: china, origen_tipo: china?'puerto_china':null, destino_id: ciudad, destino_tipo: ciudad?'ciudad':null, paso_id: paso }
        }
        // marítimo: impo China → Chile ; expo Chile → China
        return esExpoForm
          ? { origen_id: chile, origen_tipo: chile?'puerto':null, destino_id: china, destino_tipo: china?'puerto_china':null, paso_id: null }
          : { origen_id: china, origen_tipo: china?'puerto_china':null, destino_id: chile, destino_tipo: chile?'puerto':null, paso_id: null }
      }
      return { origen_id: null, origen_tipo: null, destino_id: null, destino_tipo: null, paso_id: null }
    }

    // Genera ítems de los rubros NO multi-tramo (marítimo, almacenaje, despachante, seguro, genérico)
    // cotizId: cotización destino; esExpoForm: sentido de esta versión; f: form base (A) o formB-equivalente
    const itemsDeRubro = (cotizId:string, esExpoForm:boolean, f:any) => {
      const out:any[] = []
      const ruta = rutaItemRubro(tf, esExpoForm, f)
      if(tf==='mercaderia'){
        // Productos de la proforma: cada uno con NCM, cantidad, precio, peso, volumen, incoterm
        items.filter(it=>it.descripcion).forEach((it,i)=>{
          out.push({
            cotizacion_id: cotizId,
            descripcion: it.descripcion,
            tipo_calculo: 'producto',
            valor: parseN(String(it.valor))||0,            // precio unitario USD
            cantidad: parseN(String(it.cantidad))||0,
            ncm: it.ncm||null,
            peso_unit: parseN(String(it.peso_unit))||0,
            vol_unit: parseN(String(it.vol_unit))||0,
            incoterm: it.incoterm||'FOB',
            moneda: it.moneda||'USD',
            categoria: 'mercaderia',
            ...ruta, orden:i,
          })
        })
      } else if(tf==='almacenaje'||tf==='despachante'||tf==='seguro'||tf==='maritimo'||tf==='generico'){
        let ord=0
        depServicios.forEach((svc:any)=>{
          // Flags del ítem del catálogo: qué habilitó la pastilla (días libres / piso / techo del %)
          const cat:any = depServiciosCat.find((c:any)=>c.id===svc.servicio_id) || {}
          const usaDias = !!cat.usa_dias_libres
          const pctPiso = !!cat.pct_piso
          const pctTecho = !!cat.pct_techo
          // Días libres: uno por servicio, el mismo para todas sus formas
          const diasSvc = usaDias && svc.dias_libres!=='' ? parseN(String(svc.dias_libres)) : null
          svc.formas.forEach((fr:any)=>{
            const v = parseN(String(fr.precio||0))
            if(v<=0) return
            const esPct = fr.comportamiento==='porcentaje'
            const tieneMin = depHabMin.has(svc.servicio_id+'|'+fr.metrica_id)  // mínimo solo si esa forma lo tildó
            const min = parseN(String(fr.minimo||0))
            const techoVal = parseN(String(fr.techo||0))
            out.push({
              cotizacion_id: cotizId,
              descripcion: svc.nombre+' — '+fr.nombre,
              tipo_calculo: fr.codigo||'catalogo',
              servicio_id: svc.servicio_id,
              metrica_id: fr.metrica_id,
              valor: v,
              moneda: esPct ? 'USD' : (fr.moneda||form.moneda||'USD'),
              piso_usd: esPct ? (pctPiso && min>0 ? min : null) : (tieneMin && min>0 ? min : null),
              techo_usd: esPct && pctTecho && techoVal>0 ? techoVal : null,
              dias_libres: diasSvc,
              categoria: form.rubro==='deposito' ? 'almacenaje' : form.rubro,
              ...ruta, orden:ord++,
            })
          })
        })
      } else {
        // marítimo, despachante, seguro, genérico → items[] genéricos
        items.filter(it=>it.descripcion).forEach((it,i)=>{
          out.push({
            cotizacion_id: cotizId, descripcion: it.descripcion, tipo_calculo: it.tipo_calculo,
            valor: parseN(String(it.valor))||0,
            piso_usd: it.tipo_calculo==='pct_cif'?(parseN(String(it.piso_usd))||0):null,
            techo_usd: it.tipo_calculo==='pct_cif'?(parseN(String(it.techo_usd))||0):null,
            moneda: it.moneda||'USD', tipo_contenedor: it.tipo_contenedor||null,
            categoria: (it as any).categoria || catDefault || null,
            ...ruta, orden:i,
          })
        })
      }
      return out
    }

    // Items según rubro
    let itemsFinales: any[] = []
    if(tf==='terrestre') {
      // Multi-tramo: vale para sentido simple Y para la versión A del modo "ambos" (ambas usan `tramos`)
      itemsFinales = itemsDeTramos(tramos, cot.id)
    } else {
      // marítimo, almacenaje, despachante, seguro, genérico — versión A
      itemsFinales = itemsDeRubro(cot.id, sentido==='exportacion', form)
    }
    if(itemsFinales.length>0) await (supabase.from('cotizaciones_proveedor_v2_items') as any).insert(itemsFinales)

    // ── Versión B (exportación) — en modo "ambos" para todos los rubros con ruta ──
    let cotB: any = null
    if(esAmbos && tf==='terrestre') {
      const payloadB = {
        ...payload,
        sentido: 'exportacion',
        grupo_id: grupoId,
        // Ruta y datos propios de la versión B
        puerto_chile_id: formB.puerto_chile_id||null,
        paso_id: formB.paso_id||null,
        ciudad_destino_id: formB.ciudad_destino_id||null,
        tipo_contenedor: formB.tipo_contenedor||null,
      }
      const { data: cotBData, error: errB } = await (supabase.from('cotizaciones_proveedor_v2') as any).insert(payloadB).select().single()
      if(errB) { alert('Error al guardar versión B: '+errB.message); setSaving(false); return }
      cotB = cotBData
      // Items de la versión B (multi-tramo, 3 tarifas por tramo)
      if(cotB) {
        const itemsB = itemsDeTramos(tramosB, cotB.id)
        if(itemsB.length>0) await (supabase.from('cotizaciones_proveedor_v2_items') as any).insert(itemsB)
      }
    } else if(esAmbos && (tf==='maritimo' || tf==='almacenaje' || tf==='despachante' || tf==='seguro')) {
      // Rubros no multi-tramo con ruta: versión B hereda la misma cabecera, sentido exportación.
      // Mismos ítems con la ruta estructurada invertida (esExpoForm=true).
      const payloadB = { ...payload, sentido: 'exportacion', grupo_id: grupoId }
      const { data: cotBData, error: errB } = await (supabase.from('cotizaciones_proveedor_v2') as any).insert(payloadB).select().single()
      if(errB) { alert('Error al guardar versión B: '+errB.message); setSaving(false); return }
      cotB = cotBData
      if(cotB){
        const itemsB = itemsDeRubro(cotB.id, true, form)
        if(itemsB.length>0) await (supabase.from('cotizaciones_proveedor_v2_items') as any).insert(itemsB)
      }
    }

    // Multi-bloque (no aplica a versión B; se mantiene como estaba para la cotización A)
    const bloqueIds: string[] = Array.isArray(form.bloque_ids) ? form.bloque_ids : (bloqueIdFinal?[bloqueIdFinal]:[])
    const bloqueExtras = bloqueIds.filter((id:string)=>id!==(bloqueIdFinal||''))
    for(const bId of bloqueExtras) {
      const { data: cotExtra } = await (supabase.from('cotizaciones_proveedor_v2') as any).insert({...payload,bloque_id:bId}).select().single()
      if(cotExtra && itemsFinales.length>0) {
        await (supabase.from('cotizaciones_proveedor_v2_items') as any).insert(itemsFinales.map((it:any)=>({...it,cotizacion_id:cotExtra.id})))
      }
    }

    // Adjunto — compartido entre versión A y B
    if(compFile && cot?.id) {
      const ext = compFile.name.split('.').pop()
      const path = `cotiz-prov/${cot.id}.${ext}`
      await supabase.storage.from('comprobantes').upload(path, compFile, {upsert:true})
      await (supabase.from('cotizaciones_proveedor_v2') as any).update({archivo_url:path,archivo_nombre:compFile.name}).eq('id',cot.id)
      // La versión B referencia el mismo archivo
      if(cotB?.id) {
        await (supabase.from('cotizaciones_proveedor_v2') as any).update({archivo_url:path,archivo_nombre:compFile.name}).eq('id',cotB.id)
      }
    }
    await onSave(); setSaving(false)
    } catch(e:any) {
      console.error('Error al guardar cotización:', e)
      alert('Error al guardar: '+(e?.message||'revisá la consola del navegador para más detalle'))
      setSaving(false)
    }
  }

  // Íconos de respaldo por tipo de formulario (si el rubro no trae ícono en la base)
  const ICONO_FALLBACK: Record<string,string> = {
    maritimo: '🚢', terrestre: '🚛', almacenaje: '🏭',
    despachante: '📋', seguro: '🛡', generico: '·',
  }
  // Botones de rubro generados desde el catálogo (proveedor_rubros). Editable desde Catálogos.
  const RUBRO_ITEMS = rubrosCatalogo.length > 0
    ? rubrosCatalogo.map(r=>({
        key: r._codigo,
        icon: r.icon || ICONO_FALLBACK[tipoFormulario(r._codigo)] || '·',
        label: r.nombre || r._codigo,
        desc: r.descripcion || '',
        color: r.color || '#1168F8',
      }))
    : [
        {key:'forwarder', icon:'🚢', label:'ForWarder', desc:'Flete marítimo', color:'#1168F8'},
        {key:'transporte_terrestre', icon:'🚛', label:'Terrestre', desc:'Flete ida/vuelta/RT', color:'#b45309'},
      ]

  const lbl = (s:string) => <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{s}</label>
  // tipo de formulario del rubro elegido — decide qué bloque de campos se muestra
  const tf = tipoFormulario(form.rubro)
  const rubroActual = rubrosCatalogo.find((r:any)=>r._codigo===form.rubro)

  // Formulario de servicios del catálogo (reutilizable: depósito, agente, otros, despachante)
  const renderServiciosCat = () => (
    <>
            {/* Selector para agregar servicio del catálogo */}
            <div className="flex items-end gap-2 p-3 bg-gray-50 border border-dashed border-gray-300 rounded-xl">
              <div className="flex-1">
                {lbl('Agregar servicio')}
                <select value={depSelSvc} onChange={e=>setDepSelSvc(e.target.value)} className={sel}>
                  <option value="">— Elegí un servicio del catálogo —</option>
                  {depServiciosCat.filter(s=>s.rubro===form.rubro && !depServicios.some(d=>d.servicio_id===s.id)).map(s=>(
                    <option key={s.id} value={s.id}>{s.nombre}</option>
                  ))}
                </select>
              </div>
              <button type="button" onClick={depAgregarServicio} className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#1168F8] text-white hover:bg-[#052698] transition-all whitespace-nowrap">+ Agregar</button>
            </div>

            {/* Servicios agregados */}
            {depServicios.length===0 ? (
              <div className="text-center py-6 text-gray-400 text-xs">Todavía no agregaste servicios. Elegí uno de la lista de arriba.</div>
            ) : depServicios.map((svc:any)=>{
              // Flags del ítem del catálogo (fuente de verdad): qué campos habilitó la pastilla.
              const cat:any = depServiciosCat.find((c:any)=>c.id===svc.servicio_id) || {}
              const usaDias = !!cat.usa_dias_libres
              const pctPiso = !!cat.pct_piso
              const pctTecho = !!cat.pct_techo
              const svcTienePct = svc.formas.some((f:any)=>f.comportamiento==='porcentaje')
              return (
              <div key={svc.servicio_id} className="border border-[#B9D0F6] bg-[#EFF4FE] rounded-2xl px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-semibold text-gray-800 flex-1">{svc.nombre}</span>
                  {usaDias && (
                    <div className="inline-flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-lg px-2 py-1">
                      <span className="text-[11px] text-[#0a9e6e] whitespace-nowrap">📅 Días libres</span>
                      <input type="text" inputMode="decimal" value={svc.dias_libres||''} onFocus={e=>e.target.select()} onChange={e=>depSetDiasServicio(svc.servicio_id,e.target.value)} className="w-12 px-1.5 py-0.5 border border-green-200 rounded-md text-[11px] text-right font-mono bg-white focus:outline-none focus:border-[#0a9e6e]" placeholder="0"/>
                    </div>
                  )}
                  <button type="button" onClick={()=>depQuitarServicio(svc.servicio_id)} className="text-gray-300 hover:text-red-500 text-sm" title="Quitar servicio">✕</button>
                </div>
                <div className="grid gap-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-b border-[#dbe7fb] pb-1.5 mb-1.5" style={{gridTemplateColumns:'1.4fr 0.9fr 0.7fr 0.9fr 0.9fr'}}>
                  <span>Forma de cobro</span>
                  <span className="text-right">{svcTienePct?'Porcentaje':'Precio'}</span>
                  <span>{svcTienePct?'':'Moneda'}</span>
                  <span className="text-right">{svcTienePct?'Piso':'Mínimo'}</span>
                  <span className="text-right">{svcTienePct?'Techo':''}</span>
                </div>
                {svc.formas.map((f:any)=>{
                  const esPorcentaje = f.comportamiento==='porcentaje'
                  const tieneMin = depHabMin.has(svc.servicio_id+'|'+f.metrica_id)
                  return (
                    <div key={f.metrica_id} className="grid gap-2 items-center py-1" style={{gridTemplateColumns:'1.4fr 0.9fr 0.7fr 0.9fr 0.9fr'}}>
                      <span className="text-xs text-gray-700">{f.nombre}</span>
                      <input type="text" inputMode="decimal" value={f.precio} onFocus={e=>e.target.select()} onChange={e=>depSetForma(svc.servicio_id,f.metrica_id,'precio',e.target.value)} className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-[11px] text-right font-mono bg-white focus:outline-none focus:border-[#1168F8]" placeholder={esPorcentaje?'%':'0.00'}/>
                      {esPorcentaje ? (
                        <span className="text-center text-[10px] font-semibold text-[#052698]">% CIF</span>
                      ) : (
                        <select value={f.moneda || form.moneda} onChange={e=>depSetForma(svc.servicio_id,f.metrica_id,'moneda',e.target.value)} className="w-full px-1 py-1.5 border border-gray-200 rounded-lg text-[11px] bg-white font-semibold text-[#1168F8] focus:outline-none focus:border-[#1168F8]">
                          <option>USD</option><option>ARS</option><option>CLP</option><option>CNY</option>
                        </select>
                      )}
                      {/* Col Mínimo (cantidad, si la forma lo tildó) / Piso (%, si el ítem lo habilitó) */}
                      {esPorcentaje ? (
                        pctPiso ? (
                          <input type="text" inputMode="decimal" value={f.minimo} onFocus={e=>e.target.select()} onChange={e=>depSetForma(svc.servicio_id,f.metrica_id,'minimo',e.target.value)} className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-[11px] text-right font-mono bg-white focus:outline-none focus:border-[#1168F8]" placeholder="piso"/>
                        ) : (
                          <span className="text-center text-gray-300 text-xs">—</span>
                        )
                      ) : tieneMin ? (
                        <input type="text" inputMode="decimal" value={f.minimo} onFocus={e=>e.target.select()} onChange={e=>depSetForma(svc.servicio_id,f.metrica_id,'minimo',e.target.value)} className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-[11px] text-right font-mono bg-white focus:outline-none focus:border-[#1168F8]" placeholder="mín."/>
                      ) : (
                        <span className="text-center text-gray-300 text-xs">—</span>
                      )}
                      {/* Col Techo: solo % con techo habilitado (los días libres ahora van arriba, únicos por servicio) */}
                      {esPorcentaje && pctTecho ? (
                        <input type="text" inputMode="decimal" value={f.techo||''} onFocus={e=>e.target.select()} onChange={e=>depSetForma(svc.servicio_id,f.metrica_id,'techo',e.target.value)} className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-[11px] text-right font-mono bg-white focus:outline-none focus:border-[#1168F8]" placeholder="techo"/>
                      ) : (
                        <span className="text-center text-gray-300 text-xs">—</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )})}
    </>
  )

  // Render reutilizable de una lista de tramos (se usa en sentido simple y en versión A/B de "ambos")
  const renderTramos = (lista:any[], esExpoLista:boolean, fnSet:(i:number,k:string,v:any)=>void, fnAdd:()=>void, fnRemove:(i:number)=>void) => (
    <>
      {lista.map((t:any, i:number)=>{ const ct = calcTramo(t); return (
        <div key={i} className="border border-gray-200 rounded-xl p-3 bg-gray-50/50">
          <div className="flex items-center gap-2 mb-3">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">Tramo {i+1}</span>
            {lista.length>1 && <button onClick={()=>fnRemove(i)} className="ml-auto text-gray-300 hover:text-red-500 text-xs">✕ Quitar</button>}
          </div>
          <div className="grid grid-cols-3 gap-3 items-end mb-3">
            <div>
              <span className="text-[10px] text-gray-400 mb-1 block">{esExpoLista?'Ciudad origen (NOA)':'Puerto origen (Chile)'}</span>
              {esExpoLista ? (
                <select value={t.origen_id} onChange={e=>{fnSet(i,'origen_id',e.target.value);fnSet(i,'origen_tipo','ciudad')}} className={sel}>
                  <option value="">— Cualquier ciudad —</option>
                  {ciudades.map((c:any)=><option key={c.id} value={c.id}>{c.ciudad} ({c.provincia})</option>)}
                </select>
              ) : (
                <select value={t.origen_id} onChange={e=>{fnSet(i,'origen_id',e.target.value);fnSet(i,'origen_tipo','puerto')}} className={sel}>
                  <option value="">— Cualquier puerto —</option>
                  {puertosChile.map((p:any)=><option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              )}
            </div>
            <div>
              <span className="text-[10px] text-gray-400 mb-1 block">Paso fronterizo</span>
              <select value={t.paso_id} onChange={e=>fnSet(i,'paso_id',e.target.value)} className={sel}>
                <option value="">— Cualquier paso —</option>
                {pasos.map((p:any)=><option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div>
              <span className="text-[10px] text-gray-400 mb-1 block">{esExpoLista?'Puerto destino (Chile)':'Ciudad destino (NOA)'}</span>
              {esExpoLista ? (
                <select value={t.destino_id} onChange={e=>{fnSet(i,'destino_id',e.target.value);fnSet(i,'destino_tipo','puerto')}} className={sel}>
                  <option value="">— Cualquier puerto —</option>
                  {puertosChile.map((p:any)=><option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              ) : (
                <select value={t.destino_id} onChange={e=>{fnSet(i,'destino_id',e.target.value);fnSet(i,'destino_tipo','ciudad')}} className={sel}>
                  <option value="">— Cualquier ciudad —</option>
                  {ciudades.map((c:any)=><option key={c.id} value={c.id}>{c.ciudad} ({c.provincia})</option>)}
                </select>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <span className="text-[10px] text-gray-400 mb-1 block">Tipo de camión</span>
              <select value={t.tipo_camion} onChange={e=>fnSet(i,'tipo_camion',e.target.value)} className={sel}>
                <option value="">— Sin especificar —</option>
                {tiposCamion.map((cam:any)=><option key={cam.id} value={cam.id}>{cam.icono?cam.icono+' ':''}{cam.nombre}</option>)}
              </select>
            </div>
            <div>
              <span className="text-[10px] text-gray-400 mb-1 block">Tipo de contenedor</span>
              <select value={t.tipo_contenedor} onChange={e=>fnSet(i,'tipo_contenedor',e.target.value)} className={sel}>
                <option value="">— Todos —</option>
                {tiposCont.map((tc:any)=><option key={tc.id} value={tc.codigo}>{tc.codigo} — {tc.nombre}</option>)}
              </select>
            </div>
          </div>
          <div className="border border-gray-100 rounded-xl overflow-hidden bg-white">
            <div className="grid grid-cols-3 divide-x divide-gray-100">
              <div className="p-3">
                <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{esExpoLista?'Flete ida (NOA→Chile)':'Flete ida (Chile→NOA)'}</div>
                <div className="text-[10px] text-gray-400 mb-2">Cargado</div>
                <input type="text" inputMode="decimal" value={t.flete_ida} onFocus={e=>e.target.select()} onChange={e=>fnSet(i,'flete_ida',e.target.value)} className={inp+' text-right font-mono'} placeholder="0"/>
              </div>
              <div className="p-3">
                <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{esExpoLista?'Devolución (Chile→NOA)':'Devolución vacío (NOA→Chile)'}</div>
                <div className="text-[10px] text-gray-400 mb-2">Vacío</div>
                <input type="text" inputMode="decimal" value={t.flete_vuelta} onFocus={e=>e.target.select()} onChange={e=>fnSet(i,'flete_vuelta',e.target.value)} className={inp+' text-right font-mono'} placeholder="0"/>
              </div>
              <div className="p-3 bg-green-50">
                <div className="text-[10px] font-semibold text-green-700 uppercase tracking-wider mb-1">Round trip</div>
                <div className="text-[10px] text-green-600 mb-2">Ida + vuelta combinado</div>
                <input type="text" inputMode="decimal" value={t.flete_rt} onFocus={e=>e.target.select()} onChange={e=>fnSet(i,'flete_rt',e.target.value)} className={inp+' text-right font-mono border-green-200 focus:border-green-500'} placeholder="0"/>
              </div>
            </div>
            {(ct.ida>0||ct.vue>0||ct.rt>0) && (
              <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex items-center gap-3 text-[11px] text-gray-600 flex-wrap">
                <span className="font-semibold text-gray-500">Se guardan por separado:</span>
                {ct.ida>0 && <span className="px-2 py-0.5 rounded-full bg-white border border-gray-200">Ida USD {fmtN(ct.ida)}</span>}
                {ct.vue>0 && <span className="px-2 py-0.5 rounded-full bg-white border border-gray-200">Vuelta USD {fmtN(ct.vue)}</span>}
                {ct.rt>0 && <span className="px-2 py-0.5 rounded-full bg-green-50 border border-green-200 text-green-700">Round trip USD {fmtN(ct.rt)}</span>}
              </div>
            )}
          </div>
          {/* Seguro de este tramo (opcional) — se usa si el forwarder cubre solo el marítimo */}
          <div className="mt-3 rounded-xl border border-purple-100 bg-purple-50/40 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold text-purple-700 uppercase tracking-wider">Seguro de este tramo (opcional)</span>
              {parseN(String(t.seguro_monto||0))>0 && <span className="text-[10px] font-medium text-purple-600">Cubre {esExpoLista?'NOA → Chile':'Chile → NOA'}</span>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] text-gray-400 mb-1 block">Modo de cálculo</span>
                <select value={t.seguro_modo||'pct'} onChange={e=>fnSet(i,'seguro_modo',e.target.value)} className={sel}>
                  <option value="pct">% sobre CIF</option>
                  <option value="fijo">Monto fijo USD</option>
                </select>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 mb-1 block">{(t.seguro_modo||'pct')==='fijo'?'Monto (USD)':'Porcentaje (%)'}</span>
                <input type="text" inputMode="decimal" value={t.seguro_monto||''} onFocus={e=>e.target.select()} onChange={e=>fnSet(i,'seguro_monto',e.target.value)} className={inp+' text-right font-mono'} placeholder={(t.seguro_modo||'pct')==='fijo'?'ej. 200':'ej. 0.3'}/>
              </div>
            </div>
            <div className="text-[10px] text-gray-400 mt-1.5">Solo si el transportista asegura su tramo. La dirección sigue al sentido (impo/expo) como el flete.</div>
          </div>
        </div>
      )})}
      <button onClick={fnAdd} className="w-full py-2.5 border border-dashed border-gray-300 rounded-xl text-xs font-semibold text-[#1168F8] hover:bg-[#EBF2FF] transition-colors">
        + Agregar tramo
      </button>
    </>
  )

  return (
    <div className="max-w-3xl space-y-4">

      {/* Banner si viene del cotizador */}
      {initParams?.bloque && (
        <div className="bg-[#EBF2FF] border border-[#93B8FC] rounded-2xl px-5 py-3 flex items-center gap-3 text-xs text-[#052698]">
          <span className="text-lg">📋</span>
          <span>Iniciada desde el Cotizador — Bloque {initParams.bloque}{initParams.opcion?` · Op. ${initParams.opcion}`:''}</span>
        </div>
      )}

      {/* ── BLOQUE 1: Datos generales ── */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
          <span className="font-semibold text-sm text-gray-900">Datos generales</span>
        </div>
        <div className="px-5 py-4 space-y-4">
          {/* Origen */}
          <div>
            {lbl('Origen de esta cotización')}
            <div className="flex gap-2">
              {[{key:'recibida',icon:'📨',label:'Recibida',desc:'Del proveedor'},{key:'estimada',icon:'✏️',label:'Estimada',desc:'Puerto NOA interno'}].map(o=>(
                <button key={o.key} onClick={()=>setF('origen',o.key)}
                  className={`flex-1 flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-left transition-all ${form.origen===o.key?'border-[#1168F8] bg-[#EBF2FF]':'border-gray-200 hover:bg-gray-50'}`}>
                  <span>{o.icon}</span>
                  <div><div className="text-xs font-bold text-gray-900">{o.label}</div><div className="text-[10px] text-gray-400">{o.desc}</div></div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── BLOQUE 2: Tipo de servicio (movido: después de Origen, antes de Proveedor) ── */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
          <span className="font-semibold text-sm text-gray-900">Tipo de servicio</span>
        </div>
        <div className="px-5 py-4 space-y-4">
          {/* Sentido */}
          <div>
            {lbl('Sentido de la operación')}
            <div className="flex gap-2">
              {[{key:'importacion',icon:'📦',label:'Importación',desc:'Origen → Argentina/NOA'},{key:'exportacion',icon:'🚢',label:'Exportación',desc:'Argentina/NOA → Destino'},{key:'ambos',icon:'🔄',label:'Ambos sentidos',desc:'Carga versión A + B'}].map(o=>(
                <button key={o.key} onClick={()=>setSentido(o.key as any)}
                  className={`flex-1 flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-left transition-all ${sentido===o.key?'border-[#1168F8] bg-[#EBF2FF]':'border-gray-200 hover:bg-gray-50'}`}>
                  <span className="text-base">{o.icon}</span>
                  <div><div className="text-xs font-bold text-gray-900">{o.label}</div><div className="text-[10px] text-gray-400">{o.desc}</div></div>
                </button>
              ))}
            </div>
            {sentido==='ambos' && (
              <div className="mt-2 flex items-center gap-2 text-[11px] text-[#052698] bg-[#EBF2FF] border border-[#93B8FC] rounded-xl px-3 py-2">
                <span>ℹ️</span>
                <span>Se guardarán <strong>dos cotizaciones hermanadas</strong>: versión A (importación) y versión B (exportación). El proveedor, las fechas y el comprobante son compartidos.{tf==='terrestre' ? ' La ruta y las tarifas se cargan por separado en cada versión.' : ((tf==='maritimo'||tf==='almacenaje'||tf==='despachante') ? ' Los ítems se replican en ambas versiones con la ruta invertida según el sentido.' : ' Nota: este rubro no desdobla A/B; se guardará una sola versión con el sentido elegido.')}</span>
              </div>
            )}
          </div>

          {/* Rubro */}
          <div>
            {lbl('Rubro del proveedor')}
            <div className="grid grid-cols-4 gap-2">
              {RUBRO_ITEMS.map(r=>{
                const activo = form.rubro===r.key
                return (
                <button key={r.key} onClick={()=>{
                  setF('rubro',r.key)
                  setDepServicios([]); setDepSelSvc('')
                  // Si el rubro es mercadería y el primer item está vacío, darle defaults de producto
                  if(tipoFormulario(r.key)==='mercaderia'){
                    setItems(prev=>prev.length>0 && !prev[0].descripcion && prev[0].tipo_calculo!=='producto'
                      ? prev.map((it,idx)=>idx===0?{...it,tipo_calculo:'producto',cantidad:it.cantidad??1,incoterm:it.incoterm||'FOB'}:it)
                      : prev)
                  }
                }}
                  className="flex flex-col items-center gap-1 py-3 px-2 rounded-xl border-2 text-center transition-all"
                  style={activo
                    ? {borderColor:r.color, background:(r.color||'#1168F8')+'14'}
                    : {borderColor:'#e5e7eb', background:'white'}}>
                  <span className="text-xl leading-none">{r.icon}</span>
                  <span className="text-xs font-bold" style={{color:activo?r.color:'#374151'}}>{r.label}</span>
                  <span className="text-[9px] text-gray-400 leading-tight">{r.desc}</span>
                </button>
              )})}
            </div>
          </div>

          {/* Bloques */}
          <div>
            {lbl('Bloques que cubre esta cotización')}
            {bloques.length===0 ? <div className="text-xs text-gray-400">Cargando...</div> : (
              <div className="flex flex-wrap gap-2">
                {bloques.map(b=>{
                  const bloqueIds:string[] = Array.isArray(form.bloque_ids)?form.bloque_ids:(form.bloque_id?[form.bloque_id]:[])
                  const activo = bloqueIds.includes(b.id)
                  return (
                    <button key={b.id} onClick={()=>{
                      const current:string[] = Array.isArray(form.bloque_ids)?form.bloque_ids:(form.bloque_id?[form.bloque_id]:[])
                      const next = activo ? current.filter((id:string)=>id!==b.id) : [...current,b.id]
                      setForm((p:any)=>({...p,bloque_ids:next,bloque_id:next[0]||''}))
                    }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all ${activo?'bg-[#052698] border-[#052698] text-white':'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                      {activo && <span className="w-1.5 h-1.5 rounded-full bg-white/60"/>}
                      {b.nombre}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── BLOQUE 1b: Proveedor y condiciones ── */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
          <span className="font-semibold text-sm text-gray-900">Proveedor y condiciones</span>
        </div>
        <div className="px-5 py-4 space-y-4">
          {/* Proveedor */}
          <div className="relative">
            {lbl('Proveedor * (buscá por nombre, CUIT/RUT o fantasía)')}
            {form.origen==='estimada' ? (
              <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-700 flex items-center gap-2">
                <span>✏️</span><span className="font-semibold">{form.proveedor_nombre||usuarioNombre||'Puerto NOA SpA'}</span>
                <span className="text-[10px] text-gray-400 ml-1">— usuario logueado</span>
              </div>
            ) : (
              <>
                <input value={form.proveedor_nombre}
                  onChange={e=>{setF('proveedor_nombre',e.target.value);setBuscarProv(e.target.value);setShowProvDropdown(e.target.value.length>0)}}
                  onFocus={()=>setShowProvDropdown(form.proveedor_nombre.length>0)}
                  onBlur={()=>setTimeout(()=>setShowProvDropdown(false),200)}
                  className={inp} placeholder="Buscar por nombre, CUIT/RUT o fantasía..." />
                {showProvDropdown && form.proveedor_nombre.length>0 && (
                  <div className="absolute z-50 top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl mt-1 max-h-44 overflow-y-auto">
                    {provsFiltrados.map((t:any)=>(
                      <button key={t.id} onMouseDown={()=>{setF('proveedor_nombre',t.razon_social);setF('tercero_id',t.id);setShowProvDropdown(false)}}
                        className="w-full text-left px-4 py-2.5 hover:bg-[#EBF2FF] text-xs border-b border-gray-50 last:border-0">
                        <span className="font-semibold text-gray-900">{t.razon_social}</span>
                        {(t.nro_doc||t.nombre_fantasia)&&(
                          <span className="block text-[10px] text-gray-400 mt-0.5">
                            {t.nro_doc&&<span className="font-mono">{t.tipo_doc?`${t.tipo_doc}: `:''}{t.nro_doc}</span>}
                            {t.nro_doc&&t.nombre_fantasia&&<span> · </span>}
                            {t.nombre_fantasia&&<span>{t.nombre_fantasia}</span>}
                          </span>
                        )}
                      </button>
                    ))}
                    {/* Si no hay coincidencia exacta, ofrecer crear el proveedor */}
                    {!provsFiltrados.some((t:any)=>t.razon_social.toLowerCase()===form.proveedor_nombre.toLowerCase()) && (
                      <button onMouseDown={abrirAltaProveedor}
                        className="w-full text-left px-4 py-2.5 hover:bg-green-50 text-xs border-t border-gray-100 bg-green-50/40">
                        <span className="font-semibold text-green-700">+ Crear proveedor «{form.proveedor_nombre}»</span>
                        <span className="block text-[10px] text-gray-400 mt-0.5">No está registrado — cargalo ahora con razón social y rubro</span>
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Ref + Moneda + Fechas */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              {lbl('Referencia proveedor')}
              <input value={form.referencia} onChange={e=>setF('referencia',e.target.value)} className={inp} placeholder="N° cotización del proveedor"/>
            </div>
            <div>
              {lbl('Moneda')}
              <select value={form.moneda} onChange={e=>setF('moneda',e.target.value)} className={sel}>
                {['USD','ARS','CLP','CNY'].map(m=><option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              {lbl('Fecha')}
              <input type="date" value={form.fecha} onChange={e=>setF('fecha',e.target.value)} className={inp}/>
            </div>
            <div>
              {lbl('Vigencia hasta')}
              <input type="date" value={form.fecha_vencimiento} onChange={e=>setF('fecha_vencimiento',e.target.value)} className={inp}/>
            </div>
          </div>

          {/* Datos del lugar de prestación — depósito y agente (almacenaje) y despachante */}
          {(tf==='almacenaje' || tf==='despachante') && (
            <div className="grid grid-cols-2 gap-3 pt-1 border-t border-gray-50">
              <div>
                {lbl('Ciudad de prestación')}
                {form.tercero_id && lugaresProv.length > 0 ? (
                  // Acotado a los lugares que el proveedor cargó en su ficha (frente ①)
                  <select value={form.lugar_prestacion_id ? form.lugar_prestacion_tipo+':'+form.lugar_prestacion_id : ''} onChange={e=>{const [t,i]=e.target.value.split(':'); setForm((p:any)=>({...p, lugar_prestacion_tipo:t||'', lugar_prestacion_id:i||''}))}} className={sel}>
                    <option value="">— Elegí el lugar —</option>
                    {lugaresProv.map((c:any)=><option key={c.lugar_tipo+c.id} value={c.lugar_tipo+':'+c.id}>{c.ciudad}{c.region?' ('+c.region+')':''}</option>)}
                  </select>
                ) : (
                  <>
                    <select value={form.lugar_prestacion_id ? form.lugar_prestacion_tipo+':'+form.lugar_prestacion_id : ''} onChange={e=>{const [t,i]=e.target.value.split(':'); setForm((p:any)=>({...p, lugar_prestacion_tipo:t||'', lugar_prestacion_id:i||''}))}} className={sel}>
                      <option value="">— Elegí el lugar —</option>
                      {['CL','AR','CN'].map(pais=>{
                        const grupo = lugaresEstables.filter((c:any)=>c.pais===pais)
                        if(grupo.length===0) return null
                        const nombrePais = pais==='CL'?'Chile':pais==='AR'?'Argentina':'China'
                        return (
                          <optgroup key={pais} label={nombrePais}>
                            {grupo.map((c:any)=><option key={c.lugar_tipo+c.id} value={c.lugar_tipo+':'+c.id}>{c.ciudad}{c.region?' ('+c.region+')':''}</option>)}
                          </optgroup>
                        )
                      })}
                    </select>
                    {form.tercero_id && (
                      <div className="text-[10px] text-amber-600 mt-1">Este proveedor no tiene lugares cargados para este rubro. Cargalos en su ficha (tab Rubros) para que aparezcan acá.</div>
                    )}
                  </>
                )}
              </div>
              <div>
                {lbl('Etiqueta del lugar (opcional)')}
                <input value={form.etiqueta_lugar} onChange={e=>setF('etiqueta_lugar',e.target.value)} className={inp} placeholder="ej. Zona Franca — Bodega 3"/>
              </div>
              {/* Días libres: ahora se definen por ítem (pastilla del catálogo) y se cargan en cada servicio, no acá */}
            </div>
          )}

          {/* Tipo de cotización */}
          <div className="flex gap-3 items-center pt-1 border-t border-gray-50">
            <div className="flex-1">
              {lbl('Tipo de cotización')}
              <div className="flex gap-2">
                {[{key:'generica',label:'Genérica',desc:'Cualquier operación'},{key:'especifica',label:'⭐ Específica',desc:'Un cliente particular'}].map(o=>(
                  <button key={o.key} onClick={()=>setF('tipo',o.key)}
                    className={`flex-1 px-3 py-2 rounded-xl border-2 text-left transition-all ${form.tipo===o.key?'border-[#1168F8] bg-[#EBF2FF]':'border-gray-200 hover:bg-gray-50'}`}>
                    <div className="text-xs font-bold text-gray-900">{o.label}</div>
                    <div className="text-[10px] text-gray-400">{o.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
          {form.tipo==='especifica' && (
            <div>
              {lbl('Cliente')}
              <select value={form.cliente_id} onChange={e=>setF('cliente_id',e.target.value)} className={sel}>
                <option value="">— Sin vincular —</option>
                {terceros.filter((t:any)=>Array.isArray(t.tipo)?t.tipo.includes('cliente'):t.tipo==='cliente').map((t:any)=>(
                  <option key={t.id} value={t.id}>{t.razon_social}</option>
                ))}
              </select>
            </div>
          )}

          {/* Asociar a cotización */}
          <div className="relative pt-1 border-t border-gray-50">
            {lbl('Asociar a cotización del sistema (opcional)')}
            <input
              value={form.cotizacion_id?(cotsSistema||[]).find((c:any)=>c.id===form.cotizacion_id)?`${(cotsSistema||[]).find((c:any)=>c.id===form.cotizacion_id)?.num} — ${(cotsSistema||[]).find((c:any)=>c.id===form.cotizacion_id)?.cliente}`:form.cotizacion_id:buscarCot}
              onChange={e=>{setBuscarCot(e.target.value);setShowCotDropdown(true);if(!e.target.value)setF('cotizacion_id','')}}
              onFocus={()=>setShowCotDropdown(true)}
              onBlur={()=>setTimeout(()=>setShowCotDropdown(false),200)}
              className={inp} placeholder="Buscar por N° o cliente..."/>
            {form.cotizacion_id && <button onClick={()=>{setF('cotizacion_id','');setBuscarCot('')}} className="absolute right-2 top-8 text-gray-400 hover:text-red-500 text-xs">✕</button>}
            {showCotDropdown && cotsFiltradas.length>0 && !form.cotizacion_id && (
              <div className="absolute z-50 top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl mt-1 max-h-44 overflow-y-auto">
                {cotsFiltradas.map((c:any)=>(
                  <button key={c.id} onMouseDown={()=>{setF('cotizacion_id',c.id);setShowCotDropdown(false);setBuscarCot('')}}
                    className="w-full text-left px-4 py-2.5 hover:bg-[#EBF2FF] text-xs border-b border-gray-50 last:border-0">
                    <span className="font-mono font-semibold text-[#1168F8]">{c.num}</span>
                    <span className="text-gray-600 ml-2">{c.cliente}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── BLOQUE 3: Campos específicos por rubro ── */}

      {/* FORWARDER */}
      {tf==='maritimo' && (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden" style={{borderLeft:'3px solid #1168F8'}}>
          <div className="px-5 py-3 border-b border-gray-100 bg-[#EBF2FF] flex items-center gap-2">
            <span className="text-lg">🚢</span>
            <span className="font-semibold text-sm text-[#052698]">ForWarder — datos del tramo marítimo</span>
            <span className="ml-auto text-[10px] text-[#1168F8] font-medium">{sentido==='ambos'?'Ambos sentidos · A+B':sentido==='exportacion'?'Exportación · NOA → Puerto':'Importación · Puerto → NOA'}</span>
          </div>
          <div className="px-5 py-4 space-y-4">
            {/* Ruta */}
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Ruta marítima</span>
              <span className="text-[10px] font-medium text-[#1168F8]">Dirección: {sentido==='exportacion'?'Puerto Chile → Puerto China':'Puerto China → Puerto Chile'}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(()=>{
                const exp = sentido==='exportacion'
                const selChina = (
                  <div key="china">
                    {lbl(`Puerto China (${exp?'destino':'origen'})`)}
                    <select value={form.puerto_china_id} onChange={e=>setF('puerto_china_id',e.target.value)} className={sel}>
                      <option value="">— Cualquier puerto —</option>
                      {puertosCh.map((p:any)=><option key={p.id} value={p.id}>{p.nombre} ({p.locode})</option>)}
                    </select>
                  </div>
                )
                const selChile = (
                  <div key="chile">
                    {lbl(`Puerto Chile (${exp?'origen':'destino'})`)}
                    <select value={form.puerto_chile_id} onChange={e=>setF('puerto_chile_id',e.target.value)} className={sel}>
                      <option value="">— Cualquier puerto —</option>
                      {puertosChile.map((p:any)=><option key={p.id} value={p.id}>{p.nombre} ({p.locode})</option>)}
                    </select>
                  </div>
                )
                return exp ? [selChile, selChina] : [selChina, selChile]
              })()}
              <div>
                {lbl('Tipo de contenedor')}
                <select value={form.tipo_contenedor} onChange={e=>setF('tipo_contenedor',e.target.value)} className={sel}>
                  <option value="">— Todos —</option>
                  {tiposCont.map((t:any)=><option key={t.id} value={t.codigo}>{t.codigo} — {t.nombre}</option>)}
                </select>
              </div>
            </div>

            {/* Ítems — catálogo de servicios (forwarder / naviera) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                {lbl('Conceptos cotizados')}
              </div>
              {renderServiciosCat()}
            </div>

            {/* Seguro */}
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <label className="flex items-center gap-2 cursor-pointer mb-3">
                <input type="checkbox" checked={form.seguro_incluido} onChange={e=>setF('seguro_incluido',e.target.checked)} className="w-4 h-4"/>
                <span className="text-xs font-semibold text-amber-800">Seguro de carga incluido en esta cotización</span>
              </label>
              {form.seguro_incluido && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      {lbl('Porcentaje sobre FOB')}
                      <input type="text" inputMode="decimal" value={form.seguro_monto} onChange={e=>setF('seguro_monto',e.target.value)} className={inp} placeholder="ej. 0.5 (%)"/>
                    </div>
                    <div>
                      {lbl('Alcance del seguro')}
                      <select value={form.seguro_alcance} onChange={e=>setF('seguro_alcance',e.target.value)} className={sel}>
                        <option value="maritimo">Solo tramo marítimo</option>
                        <option value="puerta_puerta">Puerta a puerta (hasta destino final)</option>
                      </select>
                    </div>
                  </div>
                  {form.seguro_alcance==='maritimo' && (
                    <div className="text-[10px] text-amber-700 bg-amber-100 rounded-lg px-3 py-2">
                      ℹ El seguro cubre solo el tramo marítimo. Al cotizar al cliente podrás habilitar seguro para el tramo terrestre.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TERRESTRE — sentido SIMPLE (impo o expo): multi-tramo */}
      {tf==='terrestre' && sentido!=='ambos' && (()=>{ const esExpoA = sentido==='exportacion'; return (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden" style={{borderLeft:'3px solid #b45309'}}>
          <div className="px-5 py-3 border-b border-gray-100 bg-amber-50 flex items-center gap-2">
            <span className="text-lg">🚛</span>
            <span className="font-semibold text-sm text-amber-900">Terrestre — tramos del flete</span>
            <span className="ml-auto text-[10px] text-amber-700 font-medium">{tramos.length} tramo{tramos.length!==1?'s':''} · {esExpoA?'NOA → Chile':'Chile → NOA'}</span>
          </div>
          <div className="px-5 py-4 space-y-3">
            {renderTramos(tramos, esExpoA, setTramo, addTramo, removeTramo)}

            {/* Seguro terrestre — opcional (común a la cotización) */}
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.seguro_terrestre} onChange={e=>setF('seguro_terrestre',e.target.checked)} className="w-4 h-4"/>
                <span className="text-xs font-semibold text-amber-800">Incluye seguro tramo terrestre</span>
              </label>
              {form.seguro_terrestre && (
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    {lbl('% sobre valor mercadería')}
                    <input type="text" inputMode="decimal" value={form.seguro_terrestre_pct} onChange={e=>setF('seguro_terrestre_pct',e.target.value)} className={inp} placeholder="ej. 0.3"/>
                  </div>
                  <div>
                    {lbl('Mínimo USD')}
                    <input type="text" inputMode="decimal" value={form.seguro_terrestre_min} onChange={e=>setF('seguro_terrestre_min',e.target.value)} className={inp} placeholder="ej. 100"/>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )})()}

      {/* TERRESTRE — modo "ambos": Versión A (Importación) — multi-tramo */}
      {tf==='terrestre' && sentido==='ambos' && (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden" style={{borderLeft:'3px solid #b45309'}}>
          <div className="px-5 py-3 border-b border-gray-100 bg-amber-50 flex items-center gap-2">
            <span className="text-lg">🚛</span>
            <span className="font-semibold text-sm text-amber-900">Terrestre — tramos del flete · Versión A (Importación)</span>
            <span className="ml-auto text-[10px] text-amber-700 font-medium">{tramos.length} tramo{tramos.length!==1?'s':''} · Chile → NOA</span>
          </div>
          <div className="px-5 py-4 space-y-3">
            {renderTramos(tramos, false, setTramo, addTramo, removeTramo)}
          </div>
        </div>
      )}

      {/* TERRESTRE — Versión B (Exportación), solo en modo "ambos" */}
      {tf==='terrestre' && sentido==='ambos' && (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden" style={{borderLeft:'3px solid #0a9e6e'}}>
          <div className="px-5 py-3 border-b border-gray-100 bg-green-50 flex items-center gap-2">
            <span className="text-lg">🚛</span>
            <span className="font-semibold text-sm text-green-900">Terrestre — tramos del flete · Versión B (Exportación)</span>
            <span className="ml-auto text-[10px] text-green-700 font-medium">{tramosB.length} tramo{tramosB.length!==1?'s':''} · NOA → Chile</span>
          </div>
          <div className="px-5 py-4 space-y-3">
            {renderTramos(tramosB, true, setTramoB, addTramoB, removeTramoB)}
          </div>
        </div>
      )}

      {/* ALMACENAJE */}
      {tf==='almacenaje' && (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden" style={{borderLeft:'3px solid #0a9e6e'}}>
          <div className="px-5 py-3 border-b border-gray-100 bg-green-50 flex items-center gap-2">
            <span className="text-lg">{form.rubro==='deposito'?'🏭':(rubroActual?.icono||'📋')}</span>
            <span className="font-semibold text-sm text-green-900">{form.rubro==='deposito'?'Servicios de depósito':('Servicios — '+(rubroActual?.nombre||'proveedor'))}</span>
            <span className="ml-auto text-[10px] text-green-700 font-medium">{sentido==='ambos'?'Ambos sentidos · A+B':sentido==='exportacion'?'Exportación':'Importación'}</span>
          </div>
          <div className="px-5 py-4 space-y-4">{renderServiciosCat()}</div>
        </div>
      )}

      {/* DESPACHANTE */}
      {tf==='despachante' && (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden" style={{borderLeft:'3px solid #6d28d9'}}>
          <div className="px-5 py-3 border-b border-gray-100 bg-purple-50 flex items-center gap-2">
            <span className="text-lg">📋</span>
            <span className="font-semibold text-sm text-purple-900">Despachante — honorarios y gastos</span>
            <span className="ml-auto text-[10px] text-purple-700 font-medium">{sentido==='ambos'?'Ambos sentidos · A+B':sentido==='exportacion'?'Exportación':'Importación'}</span>
          </div>
          <div className="px-5 py-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                {lbl('Paso / aduana')}
                <select value={form.paso_id} onChange={e=>setF('paso_id',e.target.value)} className={sel}>
                  <option value="">— Cualquier aduana —</option>
                  {pasos.map((p:any)=><option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
              <div>
                {lbl('Ciudad / destino')}
                <select value={form.ciudad_destino_id} onChange={e=>setF('ciudad_destino_id',e.target.value)} className={sel}>
                  <option value="">— Cualquier ciudad —</option>
                  {ciudades.map((c:any)=><option key={c.id} value={c.id}>{c.ciudad} ({c.provincia})</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-4 pt-2 border-t border-gray-50">{renderServiciosCat()}</div>
          </div>
        </div>
      )}

      {/* MERCADERÍA — Proveedor de mercadería (proforma) */}
      {tf==='mercaderia' && (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden" style={{borderLeft:'3px solid #ca8a04'}}>
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2" style={{background:'#fefce8'}}>
            <span className="text-lg">📦</span>
            <span className="font-semibold text-sm" style={{color:'#854d0e'}}>Mercadería — proforma del proveedor</span>
          </div>
          <div className="px-5 py-4">
            <div className="text-[11px] text-gray-500 bg-gray-50 rounded-lg px-3 py-2 mb-3">
              Cargá los productos de la proforma. El NCM, peso y volumen se usan para el cálculo del CIF y la liquidación de tributos ARCA en el cotizador.
            </div>
            <div className="flex items-center justify-between mb-2">
              {lbl('Productos de la proforma')}
              <button onClick={addItemMercaderia} className="text-[10px] text-[#ca8a04] hover:underline font-semibold">+ Agregar producto</button>
            </div>
            <div className="space-y-2">
              {items.map((it,i)=>(
                <div key={i} className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                  {/* Fila 1: descripción + NCM + incoterm + eliminar */}
                  <div className="grid grid-cols-12 gap-2 mb-2 items-end">
                    <div className="col-span-5">
                      <label className="block text-[9px] font-semibold text-gray-400 uppercase mb-1">Descripción</label>
                      <input value={it.descripcion} onChange={e=>updateItem(i,'descripcion',e.target.value)} className={inp} placeholder="Producto"/>
                    </div>
                    <div className="col-span-3">
                      <label className="block text-[9px] font-semibold text-gray-400 uppercase mb-1">NCM</label>
                      <input value={it.ncm||''} onChange={e=>updateItem(i,'ncm',e.target.value)} className={inp} placeholder="0000.00.00"/>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[9px] font-semibold text-gray-400 uppercase mb-1">Incoterm</label>
                      <select value={it.incoterm||'FOB'} onChange={e=>updateItem(i,'incoterm',e.target.value)} className={sel}>
                        {['FOB','EXW','CIF'].map(v=><option key={v}>{v}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2 flex items-center justify-end pb-1">
                      <button onClick={()=>removeItem(i)} className="text-gray-300 hover:text-red-500 text-xs transition-colors">✕ Eliminar</button>
                    </div>
                  </div>
                  {/* Fila 2: cantidad + precio + subtotal + peso + volumen */}
                  <div className="grid grid-cols-5 gap-2 items-end">
                    <div>
                      <label className="block text-[9px] font-semibold text-gray-400 uppercase mb-1">Cantidad</label>
                      <input type="text" inputMode="decimal" value={it.cantidad??''} onFocus={e=>e.target.select()}
                        onChange={e=>updateItem(i,'cantidad',parseN(e.target.value))} className={inp+' text-right'} placeholder="1"/>
                    </div>
                    <div>
                      <label className="block text-[9px] font-semibold text-gray-400 uppercase mb-1">Precio unit. USD</label>
                      <input type="text" inputMode="decimal" value={it.valor||''} onFocus={e=>e.target.select()}
                        onChange={e=>updateItem(i,'valor',parseN(e.target.value))} className={inp+' text-right'} placeholder="0"/>
                    </div>
                    <div>
                      <label className="block text-[9px] font-semibold text-gray-400 uppercase mb-1">Subtotal USD</label>
                      <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl font-mono text-xs text-right font-bold" style={{color:'#854d0e'}}>
                        {fmtN((parseN(String(it.cantidad||0)))*(parseN(String(it.valor||0))))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[9px] font-semibold text-gray-400 uppercase mb-1">Peso kg/u</label>
                      <input type="text" inputMode="decimal" value={it.peso_unit||''} onFocus={e=>e.target.select()}
                        onChange={e=>updateItem(i,'peso_unit',parseN(e.target.value))} className={inp+' text-right'} placeholder="0"/>
                    </div>
                    <div>
                      <label className="block text-[9px] font-semibold text-gray-400 uppercase mb-1">Volumen m³/u</label>
                      <input type="text" inputMode="decimal" value={it.vol_unit||''} onFocus={e=>e.target.select()}
                        onChange={e=>updateItem(i,'vol_unit',parseN(e.target.value))} className={inp+' text-right'} placeholder="0"/>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {/* Totales de la proforma */}
            <div className="grid grid-cols-4 gap-3 mt-4">
              {(()=>{
                const totFOB = items.reduce((t,it)=>t+(parseN(String(it.cantidad||0)))*(parseN(String(it.valor||0))),0)
                const totKg = items.reduce((t,it)=>t+(parseN(String(it.cantidad||0)))*(parseN(String(it.peso_unit||0))),0)
                const totM3 = items.reduce((t,it)=>t+(parseN(String(it.cantidad||0)))*(parseN(String(it.vol_unit||0))),0)
                return [
                  {label:'Total FOB (USD)', value:`USD ${fmtN(totFOB)}`},
                  {label:'Peso total', value:`${fmtN(totKg)} kg`},
                  {label:'Volumen total', value:`${fmtN(totM3)} m³`},
                  {label:'Productos', value:String(items.filter(it=>it.descripcion).length)},
                ].map(b=>(
                  <div key={b.label} className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                    <div className="text-[10px] text-gray-400 mb-1">{b.label}</div>
                    <div className="font-semibold text-sm text-gray-800">{b.value}</div>
                  </div>
                ))
              })()}
            </div>
          </div>
        </div>
      )}

      {/* OTRO */}
      {tf==='generico' && (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden" style={{borderLeft:'3px solid #6b7280'}}>
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
            <span className="text-lg">·</span>
            <span className="font-semibold text-sm text-gray-700">Servicio — catálogo</span>
          </div>
          <div className="px-5 py-4 space-y-4">{renderServiciosCat()}</div>
        </div>
      )}

      {/* SEGURO — Aseguradora */}
      {tf==='seguro' && (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden" style={{borderLeft:'3px solid #15803d'}}>
          <div className="px-5 py-3 border-b border-gray-100 bg-green-50 flex items-center gap-2">
            <span className="text-lg">🛡</span>
            <span className="font-semibold text-sm text-green-900">Seguro de transporte — aseguradora</span>
          </div>
          <div className="px-5 py-4 space-y-4">
            <div className="text-[11px] text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
              Cargá el costo del seguro. Puede ser un monto fijo o un porcentaje sobre el valor de la mercadería (FOB).
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                {lbl('Modo de cálculo')}
                <select value={form.seguro_modo} onChange={e=>setF('seguro_modo',e.target.value)} className={sel}>
                  <option value="pct">% sobre FOB</option>
                  <option value="fijo">Monto fijo USD</option>
                </select>
              </div>
              <div>
                {lbl(form.seguro_modo==='fijo'?'Monto fijo (USD)':'Porcentaje sobre FOB (%)')}
                <input type="text" inputMode="decimal" value={form.seguro_monto} onFocus={e=>e.target.select()} onChange={e=>{setF('seguro_monto',e.target.value);setF('seguro_incluido',true)}} className={inp+' text-right font-mono'} placeholder={form.seguro_modo==='fijo'?'ej. 350':'ej. 0.5'}/>
              </div>
            </div>
            {/* Tramo que cubre el seguro — definido por los puntos, igual que el flete */}
            <div className="pt-2 border-t border-gray-50">
              <div className="flex items-center justify-between mb-2">
                {lbl('Tramo que cubre')}
                <span className="text-[10px] font-medium text-purple-700">Dirección: {(()=>{ const exp=sentido==='exportacion'; const al=form.seguro_alcance||'maritimo'; if(al==='terrestre') return exp?'NOA → Puerto Chile':'Puerto Chile → NOA'; if(al==='punta_a_punta') return exp?'NOA → Puerto China':'Puerto China → NOA'; return exp?'Puerto Chile → Puerto China':'Puerto China → Puerto Chile' })()}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {[
                  {v:'maritimo', t:'Marítimo', s:'China ↔ Chile'},
                  {v:'terrestre', t:'Terrestre', s:'Chile ↔ NOA'},
                  {v:'punta_a_punta', t:'Punta a punta', s:'China ↔ NOA'},
                ].map(op=>(
                  <button key={op.v} type="button" onClick={()=>setF('seguro_alcance',op.v)}
                    className={'rounded-xl border px-2 py-2 text-center transition-colors '+(form.seguro_alcance===op.v?'border-green-500 bg-green-50 text-green-800 ring-1 ring-green-500':'border-gray-200 bg-white text-gray-500 hover:border-gray-300')}>
                    <div className="text-[11px] font-bold">{op.t}</div>
                    <div className="text-[9px] opacity-70">{op.s}</div>
                  </button>
                ))}
              </div>
              <div className={'grid gap-3 '+(form.seguro_alcance==='maritimo'?'grid-cols-2':'grid-cols-3')}>
                {(()=>{
                  const exp = sentido==='exportacion'
                  const al = form.seguro_alcance||'maritimo'
                  const selChina = (
                    <div key="china">
                      {lbl(`Puerto China (${exp?'destino':'origen'})`)}
                      <select value={form.puerto_china_id} onChange={e=>setF('puerto_china_id',e.target.value)} className={sel}>
                        <option value="">— Cualquiera —</option>
                        {puertosCh.map((p:any)=><option key={p.id} value={p.id}>{p.nombre||p.ciudad}</option>)}
                      </select>
                    </div>
                  )
                  const selChile = (
                    <div key="chile">
                      {lbl(`Puerto Chile (${al==='terrestre'?(exp?'destino':'origen'):(exp?'origen':'destino')})`)}
                      <select value={form.puerto_chile_id} onChange={e=>setF('puerto_chile_id',e.target.value)} className={sel}>
                        <option value="">— Cualquiera —</option>
                        {puertosChile.map((p:any)=><option key={p.id} value={p.id}>{p.nombre||p.ciudad}</option>)}
                      </select>
                    </div>
                  )
                  const selNoa = (
                    <div key="noa">
                      {lbl(`Ciudad NOA (${exp?'origen':'destino'})`)}
                      <select value={form.ciudad_destino_id} onChange={e=>setF('ciudad_destino_id',e.target.value)} className={sel}>
                        <option value="">— Cualquiera —</option>
                        {ciudades.map((cc:any)=><option key={cc.id} value={cc.id}>{cc.ciudad} ({cc.provincia})</option>)}
                      </select>
                    </div>
                  )
                  const selPaso = (
                    <div key="paso">
                      {lbl('Paso fronterizo')}
                      <select value={form.paso_id} onChange={e=>setF('paso_id',e.target.value)} className={sel}>
                        <option value="">— Cualquiera —</option>
                        {pasos.map((p:any)=><option key={p.id} value={p.id}>{p.nombre}</option>)}
                      </select>
                    </div>
                  )
                  if(al==='maritimo') return exp ? [selChile, selChina] : [selChina, selChile]
                  if(al==='terrestre') return exp ? [selNoa, selPaso, selChile] : [selChile, selPaso, selNoa]
                  return exp ? [selNoa, selPaso, selChina] : [selChina, selPaso, selNoa]
                })()}
              </div>
            </div>
            {/* Coberturas adicionales del catálogo de servicios */}
            <div className="space-y-4 pt-2 border-t border-gray-50">{renderServiciosCat()}</div>
          </div>
        </div>
      )}

      {/* ── BLOQUE 4: Notas + Adjunto ── */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
          <span className="font-semibold text-sm text-gray-900">Notas y comprobante</span>
        </div>
        <div className="px-5 py-4 grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Notas / condiciones</label>
            <textarea value={form.notas} onChange={e=>setF('notas',e.target.value)} rows={3} className={inp+' resize-none'} placeholder="Vigencia, condiciones, observaciones del proveedor..."/>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Adjuntar cotización recibida (PDF / imagen)</label>
            <div className="flex items-center gap-2">
              <label className="flex-1 flex flex-col items-center justify-center px-3 py-4 border border-dashed border-gray-300 rounded-xl text-xs text-gray-500 hover:border-[#1168F8] hover:text-[#1168F8] cursor-pointer transition-colors">
                <span className="text-2xl mb-1">📎</span>
                <span>{compFile ? compFile.name : (cotizacionInicial?.archivo_nombre||'Seleccionar archivo')}</span>
                <span className="text-[10px] text-gray-400 mt-0.5">PDF, JPG o PNG</span>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e=>setCompFile(e.target.files?.[0]||null)}/>
              </label>
            </div>
            {compFile && <button onClick={()=>setCompFile(null)} className="text-[10px] text-red-500 hover:underline mt-1">✕ Quitar archivo</button>}
            {cotizacionInicial?.archivo_url && !compFile && (
              <button onClick={async()=>{
                  const {data}=await supabase.storage.from('comprobantes').createSignedUrl(cotizacionInicial.archivo_url,3600)
                  if(data?.signedUrl) setPreviewModal({url:data.signedUrl,nombre:cotizacionInicial.archivo_nombre||'comprobante',tipo:cotizacionInicial.archivo_nombre?.endsWith('.pdf')?'pdf':'img'})
                }}
                className="mt-2 text-[10px] text-[#1168F8] hover:underline">📄 Ver archivo actual</button>
            )}
          </div>
        </div>
      </div>

      {/* Botones */}
      <div className="flex justify-between items-center">
        <button onClick={onCancel} className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold hover:bg-gray-50">Cancelar</button>
        <button onClick={handleSave} disabled={saving} className="px-6 py-2.5 bg-[#1168F8] text-white rounded-xl text-sm font-bold hover:bg-[#0a4fc4] disabled:opacity-50 shadow-sm">
          {saving?'Guardando...':'✓ Guardar cotización'}
        </button>
      </div>

      {/* Modal alta rápida de proveedor */}
      {showAltaProv && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4" onClick={()=>!altaProvSaving&&setShowAltaProv(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e=>e.stopPropagation()}>
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2" style={{background:'#EBF2FF'}}>
              <span className="text-lg">🏢</span>
              <span className="font-semibold text-sm text-[#052698]">Nuevo proveedor</span>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="text-[11px] text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                Cargá lo mínimo para vincularlo a la cotización. Después podés completar el resto (CUIT, dirección, contactos) en Clientes y Proveedores.
              </div>
              <div>
                {lbl('Razón social *')}
                <input value={altaProvNombre} onChange={e=>setAltaProvNombre(e.target.value)} className={inp} placeholder="Nombre del proveedor" autoFocus/>
              </div>
              <div>
                {lbl('Rubro *')}
                <select value={altaProvRubroId} onChange={e=>setAltaProvRubroId(e.target.value)} className={sel}>
                  <option value="">— Seleccionar rubro —</option>
                  {rubrosCatalogo.map((r:any)=>(
                    <option key={r.id} value={r.id}>{r.nombre}</option>
                  ))}
                </select>
                <div className="text-[10px] text-gray-400 mt-1">Determina en qué bloque del cotizador aparece este proveedor.</div>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={()=>setShowAltaProv(false)} disabled={altaProvSaving}
                className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold hover:bg-gray-50 disabled:opacity-50">Cancelar</button>
              <button onClick={crearProveedorRapido} disabled={altaProvSaving}
                className="px-5 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold hover:bg-[#0a4fc4] disabled:opacity-50">
                {altaProvSaving?'Creando...':'Crear y usar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal preview */}
      {previewModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={()=>setPreviewModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <span className="font-medium text-sm truncate">{previewModal.nombre}</span>
              <div className="flex items-center gap-2">
                <a href={previewModal.url} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-[#1168F8] text-white rounded-lg text-xs">🔗 Abrir / Descargar</a>
                <button onClick={()=>setPreviewModal(null)} className="text-gray-400 text-xl px-1">×</button>
              </div>
            </div>
            {previewModal.tipo==='pdf'
              ? <iframe src={previewModal.url} className="w-full h-[70vh] border-0" title={previewModal.nombre}/>
              : <img src={previewModal.url} alt={previewModal.nombre} className="max-w-full mx-auto rounded p-4"/>}
          </div>
        </div>
      )}
    </div>
  )
}


function DetalleCotizacion({ cotizacion, supabase, terceros, cotsSistema, rubrosDisp, onReload, onBack, onEliminar, permisos }: any) {
  const rubros = rubrosDisp || RUBROS
  const puedeEditar = puede(permisos,'cotizaciones_proveedores','editar')
  const puedeEliminar = puede(permisos,'cotizaciones_proveedores','eliminar')
  const [editando, setEditando] = useState(false)
  const [items, setItems] = useState<Item[]>(cotizacion.items || [])
  const [saving, setSaving] = useState(false)
  const [tiposCont, setTiposCont] = useState<any[]>([])

  useEffect(() => {
    supabase.from('tipos_contenedor').select('id,codigo,nombre').eq('activo', 'true').order('orden').then(({ data }: any) => { if (data) setTiposCont(data) })
  }, [])

  const r = rubros[cotizacion.rubro] || rubros.otro || RUBROS.otro
  const esMercaderia = tipoFormulario(cotizacion.rubro) === 'mercaderia'
  const esAlmacenaje = tipoFormulario(cotizacion.rubro) === 'almacenaje'
  const totalUSD = items.reduce((t, it) => {
    if (esMercaderia) return t + (parseN(String(it.cantidad||0)))*(parseN(String(it.valor||0)))
    if (it.tipo_calculo === 'pct_cif') return t
    return t + (parseN(String(it.valor)) || 0)
  }, 0)

  async function saveItems() {
    setSaving(true)
    await supabase.from('cotizaciones_proveedor_v2_items').delete().eq('cotizacion_id', cotizacion.id)
    const itemsValidos = items.filter(it => it.descripcion).map((it, i) => {
      const esAlmacenaje = (it as any).categoria === 'almacenaje'
      return {
        cotizacion_id: cotizacion.id,
        descripcion: it.descripcion,
        tipo_calculo: esMercaderia ? 'producto' : it.tipo_calculo,
        valor: parseN(String(it.valor)) || 0,
        piso_usd: it.tipo_calculo === 'pct_cif'
          ? (parseN(String(it.piso_usd)) || 0)
          : (esAlmacenaje && (it as any).piso_usd != null ? parseN(String((it as any).piso_usd)) : null),
        techo_usd: it.tipo_calculo === 'pct_cif' ? (parseN(String(it.techo_usd)) || 0) : null,
        moneda: it.moneda || 'USD',
        tipo_contenedor: it.tipo_contenedor || null,
        categoria: esMercaderia ? 'mercaderia' : ((it as any).categoria || null),
        // Preservar la vinculación al catálogo de servicios de depósito para no romper la cotización al editar
        servicio_id: (it as any).servicio_id ?? null,
        metrica_id: (it as any).metrica_id ?? null,
        dias_libres: (it as any).dias_libres ?? null,
        // Campos de producto (solo mercadería)
        ncm: esMercaderia ? (it.ncm||null) : null,
        cantidad: esMercaderia ? (parseN(String(it.cantidad||0))||0) : null,
        peso_unit: esMercaderia ? (parseN(String(it.peso_unit||0))||0) : null,
        vol_unit: esMercaderia ? (parseN(String(it.vol_unit||0))||0) : null,
        incoterm: esMercaderia ? (it.incoterm||'FOB') : null,
        orden: i,
      }
    })
    if (itemsValidos.length > 0) {
      await (supabase.from('cotizaciones_proveedor_v2_items') as any).insert(itemsValidos)
    }
    await onReload()
    setEditando(false)
    setSaving(false)
  }

  function addItem() { setItems(prev => [...prev, { ...ITEM_VACIO, orden: prev.length }]) }
  function addItemMercaderiaDetalle() { setItems(prev => [...prev, { ...ITEM_VACIO, tipo_calculo:'producto', cantidad:1, incoterm:'FOB', orden: prev.length }]) }
  function removeItem(i: number) { setItems(prev => prev.filter((_, idx) => idx !== i)) }
  function updateItem(i: number, field: string, value: any) {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: value } : it))
  }

  const clienteVinculado = cotizacion.cliente_id ? terceros.find((t: any) => t.id === cotizacion.cliente_id) : null

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm mb-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold" style={{ background: r.bg, color: r.color }}>{r.label}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${cotizacion.tipo === 'especifica' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                {cotizacion.tipo === 'especifica' ? '⭐ Especifica' : 'Generica'}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${cotizacion.estado === 'vigente' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {cotizacion.estado}
              </span>
              {clienteVinculado && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700">
                  Cliente: {clienteVinculado.razon_social}
                </span>
              )}
            </div>
            <h2 className="text-xl font-bold text-gray-900">{cotizacion.proveedor_nombre}</h2>
            <div className="flex gap-4 mt-1 text-xs text-gray-500 flex-wrap">
              {cotizacion.referencia && <span className="font-mono">Ref: {cotizacion.referencia}</span>}
              <span>Fecha: {cotizacion.fecha}</span>
              {cotizacion.fecha_vencimiento && <span>Vence: {cotizacion.fecha_vencimiento}</span>}
              {totalUSD > 0 && <span className="font-mono font-semibold text-[#052698]">USD {fmtN(totalUSD)} {esMercaderia?'(FOB)':'(items fijos)'}</span>}
            </div>
          </div>
          <div className="flex gap-2">
            {puedeEditar && <button onClick={() => setEditando(!editando)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-colors ${editando ? 'bg-gray-100 border-gray-200 text-gray-600' : 'border-[#1168F8] text-[#1168F8] hover:bg-[#EBF2FF]'}`}>
              {editando ? 'Cancelar' : 'Editar items'}
            </button>}
            {puedeEliminar && <button onClick={onEliminar} className="px-4 py-2 rounded-xl text-xs font-semibold border border-red-200 text-red-600 hover:bg-red-50 transition-colors">Eliminar</button>}
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
            {esAlmacenaje && (
              <div className="mb-3 rounded-xl border border-[#ef9f27]/40 bg-[#ef9f27]/10 px-4 py-3 text-[11px] text-[#92400e] leading-relaxed">
                <strong>Cotización de depósito.</strong> Acá podés ajustar montos y descripciones de los renglones existentes. Para cambios estructurales (agregar/quitar servicios, cambiar días libres o mínimos) conviene usar <strong>Duplicar</strong> y editar en el formulario completo, que maneja el catálogo de servicios. Los datos del servicio (tipo de cálculo, días libres y mínimo) se conservan al guardar.
              </div>
            )}
            {esMercaderia ? (
              <div className="space-y-2">
                {items.map((it, i) => (
                  <div key={i} className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                    <div className="grid grid-cols-12 gap-2 mb-2 items-end">
                      <div className="col-span-5">
                        <label className="block text-[9px] font-semibold text-gray-400 uppercase mb-1">Descripción</label>
                        <input value={it.descripcion} onChange={e=>updateItem(i,'descripcion',e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white" placeholder="Producto"/>
                      </div>
                      <div className="col-span-3">
                        <label className="block text-[9px] font-semibold text-gray-400 uppercase mb-1">NCM</label>
                        <input value={it.ncm||''} onChange={e=>updateItem(i,'ncm',e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white" placeholder="0000.00.00"/>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-[9px] font-semibold text-gray-400 uppercase mb-1">Incoterm</label>
                        <select value={it.incoterm||'FOB'} onChange={e=>updateItem(i,'incoterm',e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white">
                          {['FOB','EXW','CIF'].map(v=><option key={v}>{v}</option>)}
                        </select>
                      </div>
                      <div className="col-span-2 flex items-center justify-end pb-1">
                        <button onClick={()=>removeItem(i)} className="text-gray-300 hover:text-red-500 text-xs">✕ Eliminar</button>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2 items-end">
                      <div>
                        <label className="block text-[9px] font-semibold text-gray-400 uppercase mb-1">Cantidad</label>
                        <input type="text" inputMode="decimal" value={it.cantidad??''} onFocus={e=>e.target.select()} onChange={e=>updateItem(i,'cantidad',parseN(e.target.value))} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-right focus:outline-none focus:border-[#1168F8] bg-white"/>
                      </div>
                      <div>
                        <label className="block text-[9px] font-semibold text-gray-400 uppercase mb-1">Precio unit. USD</label>
                        <input type="text" inputMode="decimal" value={it.valor||''} onFocus={e=>e.target.select()} onChange={e=>updateItem(i,'valor',parseN(e.target.value))} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-right focus:outline-none focus:border-[#1168F8] bg-white"/>
                      </div>
                      <div>
                        <label className="block text-[9px] font-semibold text-gray-400 uppercase mb-1">Peso kg/u</label>
                        <input type="text" inputMode="decimal" value={it.peso_unit||''} onFocus={e=>e.target.select()} onChange={e=>updateItem(i,'peso_unit',parseN(e.target.value))} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-right focus:outline-none focus:border-[#1168F8] bg-white"/>
                      </div>
                      <div>
                        <label className="block text-[9px] font-semibold text-gray-400 uppercase mb-1">Vol m³/u</label>
                        <input type="text" inputMode="decimal" value={it.vol_unit||''} onFocus={e=>e.target.select()} onChange={e=>updateItem(i,'vol_unit',parseN(e.target.value))} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-right focus:outline-none focus:border-[#1168F8] bg-white"/>
                      </div>
                    </div>
                  </div>
                ))}
                <button onClick={addItemMercaderiaDetalle} className="text-[10px] text-[#ca8a04] hover:underline font-semibold">+ Agregar producto</button>
              </div>
            ) : (
              items.map((it, i) => (
                <ItemRow key={i} it={it} i={i} tiposCont={tiposCont} onChange={updateItem} onRemove={removeItem} editMode={true} />
              ))
            )}
            <div className="flex justify-end mt-3">
              <button onClick={saveItems} disabled={saving}
                className="px-5 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold disabled:opacity-50">
                {saving ? 'Guardando...' : 'Guardar items'}
              </button>
            </div>
          </>
        ) : esMercaderia ? (
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Producto', 'NCM', 'Incoterm', 'Cantidad', 'Precio unit.', 'Peso kg/u', 'Vol m³/u', 'Subtotal'].map(h => (
                  <th key={h} className={`px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider ${['Cantidad','Precio unit.','Peso kg/u','Vol m³/u','Subtotal'].includes(h)?'text-right':'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => {
                const cant = parseN(String(it.cantidad||0))
                const sub = cant*(parseN(String(it.valor||0)))
                return (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="px-3 py-2.5 font-medium text-gray-800">{it.descripcion}</td>
                    <td className="px-3 py-2.5 font-mono text-gray-500">{it.ncm||'—'}</td>
                    <td className="px-3 py-2.5 text-gray-500">{it.incoterm||'—'}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-700">{cant.toLocaleString('es-AR')}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-700">USD {fmtN(parseN(String(it.valor||0)))}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-500">{parseN(String(it.peso_unit||0))||'—'}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-500">{parseN(String(it.vol_unit||0))||'—'}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-[#052698]">USD {fmtN(sub)}</td>
                  </tr>
                )
              })}
              <tr className="bg-[#EBF2FF] border-t-2 border-[#1168F8]">
                <td colSpan={7} className="px-3 py-2 text-xs font-bold text-[#052698]">TOTAL FOB</td>
                <td className="px-3 py-2 font-mono font-bold text-[#052698] text-right">USD {fmtN(totalUSD)}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Descripcion', 'Tipo calculo', 'Categoría', 'Contenedor', 'Valor'].map(h => (
                  <th key={h} className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <ItemRow key={i} it={it} i={i} tiposCont={tiposCont} onChange={updateItem} onRemove={removeItem} editMode={false} />
              ))}
              {totalUSD > 0 && (
                <tr className="bg-[#EBF2FF] border-t-2 border-[#1168F8]">
                  <td colSpan={3} className="px-3 py-2 text-xs font-bold text-[#052698]">TOTAL (items fijos)</td>
                  <td className="px-3 py-2 font-mono font-bold text-[#052698] text-right">USD {fmtN(totalUSD)}</td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {cotizacion.seguro_incluido && (
          <div className="mt-3 px-3 py-2 bg-[#EBF2FF] border border-[#93B8FC] rounded-lg text-xs text-[#052698]">
            Seguro incluido — {cotizacion.seguro_modo === 'pct' ? `${cotizacion.seguro_monto}% sobre FOB` : `USD ${fmtN(cotizacion.seguro_monto || 0)}`}
          </div>
        )}
      </div>

      {/* Cotizacion vinculada */}
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
  const cotVinculada = (cotsSistema||[]).find((c: any) => c.id === cotizacion.cotizacion_id)
  const cotsFiltradas = (cotsSistema||[]).filter((c: any) =>
    !buscar || c.num?.toLowerCase().includes(buscar.toLowerCase()) || c.cliente?.toLowerCase().includes(buscar.toLowerCase())
  ).slice(0, 8)

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
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold ${cotVinculada.estado==='aceptada'?'bg-green-50 text-green-700':'bg-gray-100 text-gray-500'}`}>{cotVinculada.estado}</span>
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
                  <span className={`ml-2 text-[9px] px-1.5 py-0.5 rounded-full ${c.estado==='aceptada'?'bg-green-50 text-green-700':'bg-gray-100 text-gray-500'}`}>{c.estado}</span>
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


export default function CotizacionesProveedoresPage() {
  return (
    <Suspense fallback={<div className="p-6 text-gray-400 text-sm">Cargando...</div>}>
      <CotizacionesProveedoresInner />
    </Suspense>
  )
}
