'use client'
import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

const CATEGORIAS: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  mercaderia:            { label: 'Mercadería',             color: '#052698', bg: '#E8EEFF', icon: '📦' },
  flete_maritimo:        { label: 'Flete marítimo',        color: '#1168F8', bg: '#EBF2FF', icon: '🚢' },
  thc_destino:           { label: 'THC destino',            color: '#0891b2', bg: '#E0F2FE', icon: '⚓' },
  bl_fee:                { label: 'BL Fee',                 color: '#6b21a8', bg: '#F3E8FF', icon: '📄' },
  handling:              { label: 'Handling / Estiba',      color: '#b45309', bg: '#FEF3C7', icon: '🏗' },
  flete_terrestre:       { label: 'Flete terrestre',        color: '#b45309', bg: '#FEF3C7', icon: '🚛' },
  desconsolidacion:      { label: 'Desconsolidación',       color: '#0a9e6e', bg: '#E1F5EE', icon: '📦' },
  almacenaje:            { label: 'Almacenaje',             color: '#0a9e6e', bg: '#E1F5EE', icon: '🏭' },
  honorarios_despachante:{ label: 'Honorarios despachante', color: '#6b21a8', bg: '#F3E8FF', icon: '📋' },
  gastos_aduana:         { label: 'Gastos aduana',          color: '#6b21a8', bg: '#F3E8FF', icon: '🏛' },
  seguro:                { label: 'Seguro',                 color: '#052698', bg: '#EBF2FF', icon: '🛡' },
  otro:                  { label: 'Otro',                   color: '#6b7280', bg: '#F3F4F6', icon: '·' },
}

const fmtUSD = (n: number) => `USD ${n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
const fmtDate = (s: string) => s ? s.split('-').reverse().join('/') : ''

// Paleta de colores para líneas del gráfico por proveedor
const COLORES_LINEA = ['#1168F8','#0a9e6e','#b45309','#6b21a8','#0891b2','#dc2626','#059669']

type Tab = 'evolucion' | 'comparativa' | 'tc' | 'mercado'

export default function InteligenciaPreciosPage() {
  const supabase = useMemo(() => createClient(), [])
  const [tab, setTab] = useState<Tab>('evolucion')
  const [items, setItems] = useState<any[]>([])
  const [cotizaciones, setCotizaciones] = useState<any[]>([])
  const [tcHistorico, setTcHistorico] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Filtros Tab 1
  const [filtCat, setFiltCat] = useState('flete_maritimo')
  const [filtProvs, setFiltProvs] = useState<string[]>([])
  const [filtMeses, setFiltMeses] = useState(12)
  // Filtro global por tipo de cotización (afecta Evolución y Comparativa)
  const [filtTipo, setFiltTipo] = useState<'todas'|'generica'|'especifica'>('todas')

  // Filtros Tab 2
  const [filtCat2, setFiltCat2] = useState('flete_maritimo')
  const [filtFecha2, setFiltFecha2] = useState('')

  // Filtros Tab 3
  const [filtTC, setFiltTC] = useState<'ars'|'clp'|'cny'>('ars')
  const [filtMesesTC, setFiltMesesTC] = useState(12)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [itemsRes, cotsRes, tcRes] = await Promise.all([
      supabase.from('cotizaciones_proveedor_v2_items')
        .select('*, cotizacion:cotizaciones_proveedor_v2(id,proveedor_nombre,fecha,rubro,estado,referencia,tramo,tipo,cliente_id,puerto_china_id,puerto_chile_id)')
        .order('cotizacion_id'),
      supabase.from('cotizaciones_proveedor_v2')
        .select('id,proveedor_nombre,fecha,rubro,estado,referencia,tramo')
        .order('fecha', { ascending: false }),
      supabase.from('tipos_cambio_eventos')
        .select('ars,clp,cny,fecha,created_at')
        .order('created_at', { ascending: true })
        .limit(500),
    ])
    if (itemsRes.data) setItems(itemsRes.data as any[])
    if (cotsRes.data) setCotizaciones(cotsRes.data)
    if (tcRes.data) setTcHistorico(tcRes.data)
    setLoading(false)
  }

  // ── Datos para Tab 1 ──────────────────────────────────────────────
  const itemsFiltrados1 = useMemo(() => {
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - filtMeses)
    return items.filter(it => {
      const fecha = it.cotizacion?.fecha
      if (!fecha) return false
      if (new Date(fecha) < cutoff) return false
      if (it.categoria !== filtCat) return false
      if (filtProvs.length > 0 && !filtProvs.includes(it.cotizacion?.proveedor_nombre)) return false
      if (it.tipo_calculo === 'pct_cif') return false // excluir % del gráfico de valores
      if (filtTipo !== 'todas' && (it.cotizacion?.tipo || 'generica') !== filtTipo) return false
      return true
    })
  }, [items, filtCat, filtProvs, filtMeses, filtTipo])

  const proveedoresDisp = useMemo(() => {
    const cats = items.filter(it => it.categoria === filtCat && it.tipo_calculo !== 'pct_cif')
    return Array.from(new Set(cats.map(it => it.cotizacion?.proveedor_nombre).filter(Boolean))) as string[]
  }, [items, filtCat])

  // Agrupar por proveedor para líneas del gráfico
  const seriesGrafico = useMemo(() => {
    const provMap: Record<string, { fecha: string; valor: number; ref: string }[]> = {}
    itemsFiltrados1.forEach(it => {
      const prov = it.cotizacion?.proveedor_nombre || 'Sin nombre'
      if (!provMap[prov]) provMap[prov] = []
      provMap[prov].push({
        fecha: it.cotizacion?.fecha || '',
        valor: parseFloat(it.valor) || 0,
        ref: it.cotizacion?.referencia || '',
      })
    })
    // Ordenar cada serie por fecha
    Object.values(provMap).forEach(serie => serie.sort((a, b) => a.fecha.localeCompare(b.fecha)))
    return provMap
  }, [itemsFiltrados1])

  // Bounds para el SVG
  const todosValores = itemsFiltrados1.map(it => parseFloat(it.valor) || 0).filter(v => v > 0)
  const minVal = todosValores.length ? Math.min(...todosValores) * 0.85 : 0
  const maxVal = todosValores.length ? Math.max(...todosValores) * 1.1 : 1000

  const todasFechas = Array.from(new Set(itemsFiltrados1.map(it => it.cotizacion?.fecha).filter(Boolean))).sort() as string[]
  const minFecha = todasFechas[0] || ''
  const maxFecha = todasFechas[todasFechas.length - 1] || ''

  function xPos(fecha: string, w: number): number {
    if (!minFecha || !maxFecha || minFecha === maxFecha) return w / 2
    const total = new Date(maxFecha).getTime() - new Date(minFecha).getTime()
    const pos = new Date(fecha).getTime() - new Date(minFecha).getTime()
    return 60 + (pos / total) * (w - 80)
  }

  function yPos(valor: number, h: number): number {
    if (maxVal === minVal) return h / 2
    return h - 30 - ((valor - minVal) / (maxVal - minVal)) * (h - 50)
  }

  // ── Datos para Tab 2 ──────────────────────────────────────────────
  const itemsComp = useMemo(() => {
    return items.filter(it => {
      if (it.categoria !== filtCat2) return false
      if (it.tipo_calculo === 'pct_cif') return false
      if (filtTipo !== 'todas' && (it.cotizacion?.tipo || 'generica') !== filtTipo) return false
      if (filtFecha2) {
        const fecha = it.cotizacion?.fecha || ''
        return fecha >= filtFecha2
      }
      return true
    })
  }, [items, filtCat2, filtFecha2, filtTipo])

  // Última cotización de cada proveedor para esa categoría
  const ultimasPorProv = useMemo(() => {
    const map: Record<string, any> = {}
    itemsComp.forEach(it => {
      const prov = it.cotizacion?.proveedor_nombre || ''
      if (!map[prov] || it.cotizacion?.fecha > map[prov].cotizacion?.fecha) {
        map[prov] = it
      }
    })
    return Object.values(map).sort((a, b) => (parseFloat(a.valor) || 0) - (parseFloat(b.valor) || 0))
  }, [itemsComp])

  const minComp = ultimasPorProv.length ? parseFloat(ultimasPorProv[0].valor) || 0 : 0

  // ── Datos para Tab 3 ──────────────────────────────────────────────
  const tcFiltrado = useMemo(() => {
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - filtMesesTC)
    return tcHistorico.filter(t => new Date(t.created_at) >= cutoff && t[filtTC] != null)
  }, [tcHistorico, filtTC, filtMesesTC])

  const tcValores = tcFiltrado.map(t => t[filtTC] as number)
  const tcMin = tcValores.length ? Math.min(...tcValores) * 0.98 : 0
  const tcMax = tcValores.length ? Math.max(...tcValores) * 1.02 : 1

  const tcFechas = tcFiltrado.map(t => t.created_at)
  const tcMinF = tcFechas[0] || ''
  const tcMaxF = tcFechas[tcFechas.length - 1] || ''

  function tcX(fecha: string, w: number): number {
    if (!tcMinF || !tcMaxF || tcMinF === tcMaxF) return w / 2
    const total = new Date(tcMaxF).getTime() - new Date(tcMinF).getTime()
    const pos = new Date(fecha).getTime() - new Date(tcMinF).getTime()
    return 60 + (pos / total) * (w - 80)
  }
  function tcY(valor: number, h: number): number {
    if (tcMax === tcMin) return h / 2
    return h - 30 - ((valor - tcMin) / (tcMax - tcMin)) * (h - 50)
  }

  const [hovTc, setHovTc] = useState<{ x: number; y: number; val: number; fecha: string } | null>(null)
  const [hovGraf, setHovGraf] = useState<{ x: number; y: number; val: number; fecha: string; prov: string } | null>(null)

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-[#1168F8] border-t-transparent rounded-full animate-spin mx-auto"/>
        <div className="text-sm text-gray-400">Cargando datos...</div>
      </div>
    </div>
  )

  const catActual = CATEGORIAS[filtCat] || CATEGORIAS.otro
  const catActual2 = CATEGORIAS[filtCat2] || CATEGORIAS.otro

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <div className="text-[11px] font-bold text-[#1168F8]/60 uppercase tracking-widest mb-1">Puerto NOA SpA</div>
        <h1 className="text-2xl font-bold text-gray-900">Inteligencia de precios</h1>
        <p className="text-xs text-gray-400 mt-1">Evolución histórica · Comparativa entre proveedores · Tipos de cambio · Mercado internacional</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-white border border-gray-100 rounded-2xl p-1.5 shadow-sm w-fit">
        {([
          { key: 'evolucion',   label: 'Evolución de precios', icon: '📈' },
          { key: 'comparativa', label: 'Comparativa',          icon: '⚖️' },
          { key: 'tc',          label: 'Tipos de cambio',      icon: '💱' },
          { key: 'mercado',     label: 'Mercado FBX',          icon: '🌐' },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              tab === t.key ? 'bg-[#1168F8] text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* ══ TAB 1: EVOLUCIÓN ══════════════════════════════════════════ */}
      {tab === 'evolucion' && (
        <div className="space-y-4">
          {/* Filtros */}
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Categoría</label>
              <select value={filtCat} onChange={e => { setFiltCat(e.target.value); setFiltProvs([]) }}
                className="px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:border-[#1168F8]">
                {Object.entries(CATEGORIAS).map(([k, v]) => (
                  <option key={k} value={k}>{v.icon} {v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Período</label>
              <select value={filtMeses} onChange={e => setFiltMeses(Number(e.target.value))}
                className="px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:border-[#1168F8]">
                <option value={3}>Últimos 3 meses</option>
                <option value={6}>Últimos 6 meses</option>
                <option value={12}>Último año</option>
                <option value={24}>Últimos 2 años</option>
                <option value={120}>Todo el historial</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Tipo cotización</label>
              <select value={filtTipo} onChange={e => setFiltTipo(e.target.value as any)}
                className="px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:border-[#1168F8]">
                <option value="todas">Todas</option>
                <option value="generica">Solo genéricas</option>
                <option value="especifica">⭐ Solo específicas</option>
              </select>
            </div>
            {proveedoresDisp.length > 0 && (
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Proveedores</label>
                <div className="flex flex-wrap gap-1">
                  {proveedoresDisp.map((p, idx) => (
                    <button key={p} onClick={() => setFiltProvs(prev =>
                      prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
                    )}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all"
                      style={filtProvs.includes(p) || filtProvs.length === 0
                        ? { background: COLORES_LINEA[idx % COLORES_LINEA.length], color: 'white', borderColor: COLORES_LINEA[idx % COLORES_LINEA.length] }
                        : { background: 'white', color: '#9ca3af', borderColor: '#e5e7eb' }}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="ml-auto text-right">
              <div className="text-[10px] text-gray-400">{itemsFiltrados1.length} cotizaciones</div>
              <div className="text-xs font-semibold" style={{ color: catActual.color }}>{catActual.icon} {catActual.label}</div>
            </div>
          </div>

          {/* Gráfico SVG */}
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
            {itemsFiltrados1.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-gray-300">
                <div className="text-5xl mb-3">📭</div>
                <div className="text-sm font-medium text-gray-400">Sin datos para esta categoría</div>
                <div className="text-xs text-gray-300 mt-1">Cargá cotizaciones con la categoría "{catActual.label}" para ver la evolución</div>
              </div>
            ) : (
              <svg width="100%" height="320" className="overflow-visible"
                onMouseLeave={() => setHovGraf(null)}>
                {/* Grid horizontal */}
                {[0, 0.25, 0.5, 0.75, 1].map(p => {
                  const val = minVal + p * (maxVal - minVal)
                  const y = yPos(val, 320)
                  return (
                    <g key={p}>
                      <line x1="60" y1={y} x2="98%" y2={y} stroke="#f1f5f9" strokeWidth="1"/>
                      <text x="55" y={y + 4} textAnchor="end" fontSize="9" fill="#9ca3af">
                        {val >= 1000 ? `${(val/1000).toFixed(1)}k` : Math.round(val)}
                      </text>
                    </g>
                  )
                })}
                {/* Etiquetas de fecha en X */}
                {todasFechas.filter((_, i) => i % Math.max(1, Math.floor(todasFechas.length / 6)) === 0).map(f => (
                  <text key={f} x={xPos(f, 900)} y={310} textAnchor="middle" fontSize="9" fill="#9ca3af">
                    {fmtDate(f)}
                  </text>
                ))}
                {/* Líneas por proveedor */}
                {Object.entries(seriesGrafico).map(([prov, puntos], idx) => {
                  const color = COLORES_LINEA[idx % COLORES_LINEA.length]
                  if (puntos.length === 0) return null
                  const path = puntos.map((p, i) =>
                    `${i === 0 ? 'M' : 'L'} ${xPos(p.fecha, 900)} ${yPos(p.valor, 320)}`
                  ).join(' ')
                  return (
                    <g key={prov}>
                      <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round"/>
                      {puntos.map((p, i) => (
                        <circle key={i}
                          cx={xPos(p.fecha, 900)} cy={yPos(p.valor, 320)} r="5"
                          fill="white" stroke={color} strokeWidth="2.5"
                          style={{ cursor: 'pointer' }}
                          onMouseEnter={e => setHovGraf({
                            x: xPos(p.fecha, 900),
                            y: yPos(p.valor, 320),
                            val: p.valor,
                            fecha: p.fecha,
                            prov,
                          })}
                        />
                      ))}
                    </g>
                  )
                })}
                {/* Tooltip */}
                {hovGraf && (
                  <g>
                    <rect x={hovGraf.x - 70} y={hovGraf.y - 48} width="140" height="40" rx="6"
                      fill="white" stroke="#e5e7eb" strokeWidth="1" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.1))"/>
                    <text x={hovGraf.x} y={hovGraf.y - 30} textAnchor="middle" fontSize="11" fontWeight="700" fill="#052698">
                      {fmtUSD(hovGraf.val)}
                    </text>
                    <text x={hovGraf.x} y={hovGraf.y - 16} textAnchor="middle" fontSize="9" fill="#6b7280">
                      {hovGraf.prov} · {fmtDate(hovGraf.fecha)}
                    </text>
                  </g>
                )}
              </svg>
            )}
            {/* Leyenda */}
            {Object.keys(seriesGrafico).length > 0 && (
              <div className="flex flex-wrap gap-4 mt-2 pt-3 border-t border-gray-100">
                {Object.keys(seriesGrafico).map((prov, idx) => (
                  <div key={prov} className="flex items-center gap-1.5">
                    <div className="w-6 h-0.5 rounded" style={{ background: COLORES_LINEA[idx % COLORES_LINEA.length] }}/>
                    <div className="w-2.5 h-2.5 rounded-full border-2" style={{ borderColor: COLORES_LINEA[idx % COLORES_LINEA.length], background: 'white' }}/>
                    <span className="text-[11px] text-gray-600">{prov}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tabla detalle */}
          {itemsFiltrados1.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                <span className="font-semibold text-sm text-gray-900">Detalle de cotizaciones</span>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {['Fecha','Proveedor','Descripción','Tipo contenedor','Valor','Referencia'].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...itemsFiltrados1].sort((a,b) => (b.cotizacion?.fecha||'').localeCompare(a.cotizacion?.fecha||'')).map((it, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-blue-50/20">
                      <td className="px-4 py-2.5 font-mono text-[11px] text-gray-500">{fmtDate(it.cotizacion?.fecha)}</td>
                      <td className="px-4 py-2.5 font-semibold text-gray-800">{it.cotizacion?.proveedor_nombre}</td>
                      <td className="px-4 py-2.5 text-gray-600">{it.descripcion}</td>
                      <td className="px-4 py-2.5 text-gray-400">{it.tipo_contenedor || 'Todos'}</td>
                      <td className="px-4 py-2.5 font-mono font-bold text-[#052698]">{fmtUSD(parseFloat(it.valor)||0)}</td>
                      <td className="px-4 py-2.5 text-gray-400 font-mono text-[10px]">{it.cotizacion?.referencia || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══ TAB 2: COMPARATIVA ════════════════════════════════════════ */}
      {tab === 'comparativa' && (
        <div className="space-y-4">
          {/* Filtros */}
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Categoría</label>
              <select value={filtCat2} onChange={e => setFiltCat2(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:border-[#1168F8]">
                {Object.entries(CATEGORIAS).map(([k, v]) => (
                  <option key={k} value={k}>{v.icon} {v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Cotizaciones desde</label>
              <input type="date" value={filtFecha2} onChange={e => setFiltFecha2(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:border-[#1168F8]"/>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Tipo cotización</label>
              <select value={filtTipo} onChange={e => setFiltTipo(e.target.value as any)}
                className="px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:border-[#1168F8]">
                <option value="todas">Todas</option>
                <option value="generica">Solo genéricas</option>
                <option value="especifica">⭐ Solo específicas</option>
              </select>
            </div>
            <div className="ml-auto text-right">
              <div className="text-[10px] text-gray-400">{ultimasPorProv.length} proveedores</div>
              <div className="text-xs font-semibold" style={{ color: catActual2.color }}>{catActual2.icon} {catActual2.label}</div>
            </div>
          </div>

          {ultimasPorProv.length === 0 ? (
            <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center shadow-sm">
              <div className="text-4xl mb-3">📭</div>
              <div className="text-sm text-gray-400">Sin proveedores con cotizaciones para esta categoría</div>
            </div>
          ) : (
            <>
              {/* Barras comparativas */}
              <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-4">
                  Última cotización por proveedor · {catActual2.icon} {catActual2.label}
                </div>
                <div className="space-y-3">
                  {ultimasPorProv.map((it, i) => {
                    const val = parseFloat(it.valor) || 0
                    const pct = minComp > 0 ? (val / minComp - 1) * 100 : 0
                    const barPct = maxVal > 0 ? (val / (Math.max(...ultimasPorProv.map(x => parseFloat(x.valor)||0)) * 1.1)) * 100 : 0
                    const esMasBarat = i === 0
                    return (
                      <div key={i} className={`p-4 rounded-xl border-2 transition-all ${esMasBarat ? 'border-green-200 bg-green-50' : 'border-gray-100 bg-gray-50'}`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {esMasBarat && <span className="text-[9px] font-bold bg-green-500 text-white px-2 py-0.5 rounded-full">MÁS ECONÓMICO</span>}
                            <span className="font-semibold text-sm text-gray-800">{it.cotizacion?.proveedor_nombre}</span>
                            <span className="text-[10px] text-gray-400 font-mono">{fmtDate(it.cotizacion?.fecha)}</span>
                          </div>
                          <div className="text-right">
                            <div className="font-mono font-bold text-lg text-[#052698]">{fmtUSD(val)}</div>
                            {pct > 0 && <div className="text-[10px] text-red-500 font-semibold">+{pct.toFixed(1)}% vs más económico</div>}
                          </div>
                        </div>
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all"
                            style={{ width: `${barPct}%`, background: esMasBarat ? '#22c55e' : '#1168F8' }}/>
                        </div>
                        <div className="flex justify-between mt-1">
                          <span className="text-[9px] text-gray-400">{it.descripcion}</span>
                          <span className="text-[9px] text-gray-400">{it.tipo_contenedor || 'Todos los contenedores'}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Historial por proveedor */}
              <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                  <span className="font-semibold text-sm text-gray-900">Historial completo por proveedor</span>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {['Proveedor','Fecha','Descripción','Valor','Δ vs mín','Referencia'].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...itemsComp].sort((a,b) => parseFloat(a.valor)-parseFloat(b.valor)).map((it, i) => {
                      const val = parseFloat(it.valor) || 0
                      const delta = minComp > 0 ? ((val / minComp - 1) * 100) : 0
                      return (
                        <tr key={i} className="border-b border-gray-50 hover:bg-blue-50/20">
                          <td className="px-4 py-2.5 font-semibold text-gray-800">{it.cotizacion?.proveedor_nombre}</td>
                          <td className="px-4 py-2.5 font-mono text-[11px] text-gray-500">{fmtDate(it.cotizacion?.fecha)}</td>
                          <td className="px-4 py-2.5 text-gray-600">{it.descripcion}</td>
                          <td className="px-4 py-2.5 font-mono font-bold text-[#052698]">{fmtUSD(val)}</td>
                          <td className="px-4 py-2.5">
                            {delta === 0
                              ? <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded-full text-[10px] font-bold">Base</span>
                              : <span className="text-red-500 text-[11px] font-semibold">+{delta.toFixed(1)}%</span>
                            }
                          </td>
                          <td className="px-4 py-2.5 text-gray-400 font-mono text-[10px]">{it.cotizacion?.referencia || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══ TAB 3: TIPOS DE CAMBIO ════════════════════════════════════ */}
      {tab === 'tc' && (
        <div className="space-y-4">
          {/* Filtros */}
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex gap-4 items-end flex-wrap">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Moneda</label>
              <div className="flex gap-2">
                {([
                  { key: 'ars', label: '🇦🇷 ARS/USD' },
                  { key: 'clp', label: '🇨🇱 CLP/USD' },
                  { key: 'cny', label: '🇨🇳 CNY/USD' },
                ] as const).map(m => (
                  <button key={m.key} onClick={() => setFiltTC(m.key)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                      filtTC === m.key ? 'bg-[#052698] text-white border-[#052698]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Período</label>
              <select value={filtMesesTC} onChange={e => setFiltMesesTC(Number(e.target.value))}
                className="px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:border-[#1168F8]">
                <option value={1}>Último mes</option>
                <option value={3}>Últimos 3 meses</option>
                <option value={6}>Últimos 6 meses</option>
                <option value={12}>Último año</option>
                <option value={120}>Todo el historial</option>
              </select>
            </div>
            {tcFiltrado.length > 0 && (
              <div className="ml-auto flex gap-6">
                <div className="text-center">
                  <div className="text-[10px] text-gray-400">Mínimo</div>
                  <div className="font-mono font-bold text-gray-700">{Math.min(...tcValores).toLocaleString('es-AR', {maximumFractionDigits: filtTC==='cny'?4:0})}</div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-gray-400">Máximo</div>
                  <div className="font-mono font-bold text-gray-700">{Math.max(...tcValores).toLocaleString('es-AR', {maximumFractionDigits: filtTC==='cny'?4:0})}</div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-gray-400">Último</div>
                  <div className="font-mono font-bold text-[#052698]">{tcValores[tcValores.length-1]?.toLocaleString('es-AR', {maximumFractionDigits: filtTC==='cny'?4:0})}</div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-gray-400">Variación</div>
                  <div className={`font-mono font-bold ${tcValores.length > 1 && tcValores[tcValores.length-1] > tcValores[0] ? 'text-red-500' : 'text-green-600'}`}>
                    {tcValores.length > 1 ? `${((tcValores[tcValores.length-1]/tcValores[0]-1)*100).toFixed(1)}%` : '—'}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Gráfico TC */}
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
            <div className="text-sm font-semibold text-gray-900 mb-4">
              {filtTC === 'ars' ? '🇦🇷 Peso argentino / USD' : filtTC === 'clp' ? '🇨🇱 Peso chileno / USD' : '🇨🇳 Yuan chino / USD'}
              <span className="text-xs font-normal text-gray-400 ml-2">· {tcFiltrado.length} registros</span>
            </div>
            {tcFiltrado.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-gray-300">
                <div className="text-center">
                  <div className="text-4xl mb-2">📭</div>
                  <div className="text-sm text-gray-400">Sin datos de tipo de cambio</div>
                </div>
              </div>
            ) : (
              <svg width="100%" height="300" className="overflow-visible"
                onMouseLeave={() => setHovTc(null)}>
                {/* Área bajo la curva */}
                {tcFiltrado.length > 1 && (
                  <path
                    d={[
                      `M ${tcX(tcFiltrado[0].created_at, 900)} ${tcY(tcFiltrado[0][filtTC], 300)}`,
                      ...tcFiltrado.map(t => `L ${tcX(t.created_at, 900)} ${tcY(t[filtTC], 300)}`),
                      `L ${tcX(tcFiltrado[tcFiltrado.length-1].created_at, 900)} 275`,
                      `L ${tcX(tcFiltrado[0].created_at, 900)} 275`,
                      'Z'
                    ].join(' ')}
                    fill="#1168F8" fillOpacity="0.06"/>
                )}
                {/* Grid */}
                {[0, 0.25, 0.5, 0.75, 1].map(p => {
                  const val = tcMin + p * (tcMax - tcMin)
                  const y = tcY(val, 300)
                  return (
                    <g key={p}>
                      <line x1="60" y1={y} x2="98%" y2={y} stroke="#f1f5f9" strokeWidth="1"/>
                      <text x="55" y={y + 4} textAnchor="end" fontSize="9" fill="#9ca3af">
                        {val >= 1000 ? `${(val/1000).toFixed(0)}k` : val.toFixed(filtTC==='cny'?2:0)}
                      </text>
                    </g>
                  )
                })}
                {/* Etiquetas X */}
                {tcFiltrado.filter((_, i) => i % Math.max(1, Math.floor(tcFiltrado.length / 7)) === 0).map((t, i) => (
                  <text key={i} x={tcX(t.created_at, 900)} y={295} textAnchor="middle" fontSize="9" fill="#9ca3af">
                    {new Date(t.created_at).toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit' })}
                  </text>
                ))}
                {/* Línea principal */}
                {tcFiltrado.length > 1 && (
                  <path
                    d={tcFiltrado.map((t, i) =>
                      `${i===0?'M':'L'} ${tcX(t.created_at, 900)} ${tcY(t[filtTC], 300)}`
                    ).join(' ')}
                    fill="none" stroke="#1168F8" strokeWidth="2.5" strokeLinejoin="round"/>
                )}
                {/* Puntos interactivos invisibles */}
                {tcFiltrado.map((t, i) => (
                  <circle key={i}
                    cx={tcX(t.created_at, 900)} cy={tcY(t[filtTC], 300)} r="8"
                    fill="transparent"
                    onMouseEnter={() => setHovTc({
                      x: tcX(t.created_at, 900),
                      y: tcY(t[filtTC], 300),
                      val: t[filtTC],
                      fecha: t.created_at,
                    })}
                  />
                ))}
                {/* Tooltip */}
                {hovTc && (
                  <g>
                    <line x1={hovTc.x} y1="0" x2={hovTc.x} y2="275" stroke="#1168F8" strokeWidth="1" strokeDasharray="3,3"/>
                    <circle cx={hovTc.x} cy={hovTc.y} r="5" fill="#1168F8" stroke="white" strokeWidth="2"/>
                    <rect x={hovTc.x - 65} y={hovTc.y - 48} width="130" height="38" rx="6"
                      fill="white" stroke="#e5e7eb" strokeWidth="1" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.1))"/>
                    <text x={hovTc.x} y={hovTc.y - 30} textAnchor="middle" fontSize="12" fontWeight="700" fill="#052698">
                      {hovTc.val?.toLocaleString('es-AR', { maximumFractionDigits: filtTC==='cny'?4:0 })}
                    </text>
                    <text x={hovTc.x} y={hovTc.y - 16} textAnchor="middle" fontSize="9" fill="#6b7280">
                      {new Date(hovTc.fecha).toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric' })}
                    </text>
                  </g>
                )}
              </svg>
            )}
          </div>

          {/* Tabla últimos registros */}
          {tcFiltrado.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <span className="font-semibold text-sm text-gray-900">Últimos 10 registros</span>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {['Fecha','ARS/USD','CLP/USD','CNY/USD'].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...tcHistorico].reverse().slice(0, 10).map((t, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-blue-50/20">
                      <td className="px-4 py-2.5 font-mono text-[11px] text-gray-500">
                        {new Date(t.created_at).toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })}
                      </td>
                      <td className="px-4 py-2.5 font-mono font-semibold text-gray-800">{t.ars ? Math.round(t.ars).toLocaleString('es-AR') : '—'}</td>
                      <td className="px-4 py-2.5 font-mono font-semibold text-gray-800">{t.clp ? Math.round(t.clp).toLocaleString('es-AR') : '—'}</td>
                      <td className="px-4 py-2.5 font-mono font-semibold text-gray-800">{t.cny ? t.cny.toFixed(4) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══ TAB 4: MERCADO FBX ════════════════════════════════════════ */}
      {tab === 'mercado' && (
        <div className="space-y-4">
          <div className="bg-[#052698] rounded-2xl p-5 text-white">
            <div className="text-[10px] font-bold text-blue-300 uppercase tracking-widest mb-1">Freightos Baltic Index (FBX)</div>
            <h2 className="text-lg font-bold mb-1">Índice global de fletes marítimos</h2>
            <p className="text-sm text-blue-200">
              Referencia de mercado para contenedores 40' en rutas globales. Publicado diariamente por Freightos y Baltic Exchange.
              La ruta más relevante para Puerto NOA es <strong className="text-white">China/East Asia → North America West Coast (FBX01)</strong> como proxy de precios Asia-Chile.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Iframe Far Point Global */}
            <div className="col-span-2 bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-sm text-gray-900">FBX — Índice global de contenedores</span>
                  <span className="text-[10px] text-gray-400 ml-2">vía Far Point Global · datos Freightos Baltic Index</span>
                </div>
                <a href="https://farpointglobal.com/tools/freight-index" target="_blank" rel="noopener noreferrer"
                  className="text-xs text-[#1168F8] hover:underline">Ver en sitio completo →</a>
              </div>
              <iframe
                src="https://farpointglobal.com/tools/freight-index"
                className="w-full"
                style={{ height: '520px', border: 'none' }}
                title="Freightos Baltic Index"
                loading="lazy"
              />
            </div>

            {/* Links directos */}
            <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-4">Rutas relevantes para Puerto NOA</div>
              <div className="space-y-3">
                {[
                  { code: 'FBX01', label: 'China/East Asia → N. América West Coast', relevancia: 'Alta', color: 'text-green-600', bg: 'bg-green-50', url: 'https://www.freightos.com/enterprise/terminal/fbx-01-china-to-north-america-west-coast/' },
                  { code: 'FBX13', label: 'China/East Asia → Mediterráneo', relevancia: 'Media', color: 'text-amber-600', bg: 'bg-amber-50', url: 'https://www.freightos.com/freightos-baltic-index/' },
                  { code: 'FBX24', label: 'Europa → Sudamérica Costa Este', relevancia: 'Referencia', color: 'text-blue-600', bg: 'bg-blue-50', url: 'https://www.freightos.com/freightos-baltic-index/' },
                ].map(r => (
                  <a key={r.code} href={r.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-between p-3 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors group">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-[#052698] text-xs">{r.code}</span>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${r.bg} ${r.color}`}>{r.relevancia}</span>
                      </div>
                      <div className="text-[11px] text-gray-600 mt-0.5">{r.label}</div>
                    </div>
                    <span className="text-gray-300 group-hover:text-[#1168F8] transition-colors">→</span>
                  </a>
                ))}
              </div>
            </div>

            {/* Cómo usar */}
            <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-4">Cómo usar el FBX para negociar</div>
              <div className="space-y-3">
                {[
                  { n: '1', titulo: 'Antes de solicitar cotizaciones', desc: 'Revisá el FBX01 para saber si el mercado está en alza o baja. Si el índice subió 20% en 60 días, esperá que las cotizaciones reflejen eso.' },
                  { n: '2', titulo: 'Al recibir una cotización', desc: 'Compará el precio del ForWarder contra el FBX. Si cotiza 15% por encima del índice, tenés margen para negociar o buscar alternativas.' },
                  { n: '3', titulo: 'Para justificar variaciones con clientes', desc: 'Si el cliente cuestiona por qué subió el flete, mostrá la curva del FBX. Los datos públicos respaldan la conversación.' },
                  { n: '4', titulo: 'Marcadores en el historial de TC', desc: 'Cruzá la variación del flete con el TC del momento. Un flete "caro" en USD puede ser conveniente si el ARS se devaluó.' },
                ].map(item => (
                  <div key={item.n} className="flex gap-3">
                    <div className="w-5 h-5 rounded-full bg-[#EBF2FF] text-[#052698] text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{item.n}</div>
                    <div>
                      <div className="text-xs font-semibold text-gray-700">{item.titulo}</div>
                      <div className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
