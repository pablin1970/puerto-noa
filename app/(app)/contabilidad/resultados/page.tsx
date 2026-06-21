'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { cargarPermisos, puede } from '@/lib/permisos'

const fmtN = (n: number) => (n||0).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtUSD = (n: number) => `USD ${fmtN(n)}`
const fmtPct = (n: number) => `${(n||0).toFixed(1)}%`
const MESES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const CRITERIOS = [
  { key: 'ingresos',     label: 'Por ingresos',          desc: 'Según lo facturado al cliente' },
  { key: 'costos',       label: 'Por costos gestionados', desc: 'Según volumen de dinero administrado' },
  { key: 'contenedores', label: 'Por contenedores',       desc: 'Según N° de contenedores' },
  { key: 'igualitario',  label: 'Igualitario',            desc: 'Partes iguales entre operaciones' },
]

interface OpData {
  id: string
  num: string
  cliente: string
  estado: string
  fecha_cierre: string
  // Financiero
  ingresos_usd: number      // facturas emitidas PN→cliente
  costos_usd: number        // facturas recibidas proveedor→PN
  fee_usd: number           // fee bloque 5
  markup_usd: number        // cobrado − pagado en recuperos
  iva_debito: number        // IVA facturas emitidas
  iva_credito: number       // IVA facturas recibidas
  iva_neto: number          // débito − crédito (si >0 es costo)
  margen_bruto: number      // fee + markup − iva_neto_a_pagar
  contenedores: number      // N° contenedores de la operación
  // Gastos fijos prorrateados (se calculan)
  gf_por_ingresos: number
  gf_por_costos: number
  gf_por_contenedores: number
  gf_igualitario: number
  // Margen neto por criterio
  mn_ingresos: number
  mn_costos: number
  mn_contenedores: number
  mn_igualitario: number
}

function computarOpsData(opRows: any[], feRows: any[], frRows: any[], gfUSD: number, tcVal: number): OpData[] {
  const feByOp: Record<string, any[]> = {}
  for (const f of (feRows||[]) as any[]) {
    if (!feByOp[f.operacion_id]) feByOp[f.operacion_id] = []
    feByOp[f.operacion_id].push(f)
  }
  const frByOp: Record<string, any[]> = {}
  for (const f of (frRows||[]) as any[]) {
    if (!frByOp[f.operacion_id]) frByOp[f.operacion_id] = []
    frByOp[f.operacion_id].push(f)
  }
  const opsData: OpData[] = ((opRows||[]) as any[]).map(op => {
    const cot = op.cotizacion as any
    const presupuesto = Array.isArray(cot?.presupuesto) ? cot.presupuesto : []
    const feeItem = presupuesto.find((i: any) => i.etapa === 'fee')
    const fee_usd = feeItem?.usd || 0
    const conts = Array.isArray(cot?.tipo_contenedores) ? cot.tipo_contenedores : []
    const contenedores = conts.reduce((t: number, c: any) => t + (c.cantidad || 1), 0) || 1
    const fes = feByOp[op.id] || []
    const ingresos_usd = fes.reduce((t, f) => t + (f.total_usd || (f.neto_usd * 1.19) || 0), 0)
    const iva_debito = fes.reduce((t, f) => t + (f.iva_monto || 0) / (f.tc_referencia || tcVal), 0)
    const frs = frByOp[op.id] || []
    const costos_usd = frs.reduce((t, f) => t + (f.total_usd || 0), 0)
    const iva_credito = frs.filter(f => f.credito_fiscal).reduce((t, f) => t + (f.iva_monto || 0) / (f.tc_referencia || tcVal), 0)
    const cobrado_recupero = fes.filter(f => f.a_recuperar).reduce((t, f) => t + (f.total_usd || 0), 0)
    const pagado_recupero = frs.filter(f => f.a_recuperar).reduce((t, f) => t + (f.total_usd || 0), 0)
    const markup_usd = cobrado_recupero - pagado_recupero
    const iva_neto = Math.max(0, iva_debito - iva_credito)
    const margen_bruto = fee_usd + markup_usd - iva_neto
    return {
      id: op.id,
      num: cot?.num || '—',
      cliente: cot?.cliente || '—',
      estado: op.estado || 'activa',
      fecha_cierre: op.fecha_cierre || op.updated_at?.slice(0,10) || '',
      ingresos_usd, costos_usd, fee_usd, markup_usd,
      iva_debito, iva_credito, iva_neto,
      margen_bruto, contenedores,
      gf_por_ingresos: 0, gf_por_costos: 0,
      gf_por_contenedores: 0, gf_igualitario: 0,
      mn_ingresos: 0, mn_costos: 0,
      mn_contenedores: 0, mn_igualitario: 0,
    }
  }).filter(o => o.ingresos_usd > 0 || o.fee_usd > 0)
  const totIngresos = opsData.reduce((t, o) => t + o.ingresos_usd, 0)
  const totCostos   = opsData.reduce((t, o) => t + o.costos_usd, 0)
  const totConts    = opsData.reduce((t, o) => t + o.contenedores, 0)
  const nOps        = opsData.length || 1
  for (const o of opsData) {
    o.gf_por_ingresos     = totIngresos > 0 ? gfUSD * (o.ingresos_usd / totIngresos) : 0
    o.gf_por_costos       = totCostos > 0   ? gfUSD * (o.costos_usd / totCostos) : 0
    o.gf_por_contenedores = totConts > 0    ? gfUSD * (o.contenedores / totConts) : 0
    o.gf_igualitario      = gfUSD / nOps
    o.mn_ingresos         = o.margen_bruto - o.gf_por_ingresos
    o.mn_costos           = o.margen_bruto - o.gf_por_costos
    o.mn_contenedores     = o.margen_bruto - o.gf_por_contenedores
    o.mn_igualitario      = o.margen_bruto - o.gf_igualitario
  }
  return opsData
}

export default function UtilidadesPage() {
  const supabase = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(true)
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [mes, setMes] = useState(new Date().getMonth() + 1)
  const [ops, setOps] = useState<OpData[]>([])
  const [opsEnCurso, setOpsEnCurso] = useState<OpData[]>([])
  const [gastosFijosMes, setGastosFijosMes] = useState(0)
  const [criterioElegido, setCriterioElegido] = useState<string>('costos')
  const [tab, setTab] = useState<'operaciones'|'comparativo'|'mensual'|'anual'>('operaciones')
  const [tc, setTc] = useState(908)

  const [permisos, setPermisos] = useState<Record<string, string[]>>({})
  const [permListos, setPermListos] = useState(false)
  useEffect(() => { cargarPermisos().then(p => { setPermisos(p); setPermListos(true) }) }, [])

  useEffect(() => { load() }, [anio, mes])

  // ── Vista anual consolidada (suma automática de los 12 meses del ejercicio) ──
  const [opsAnio, setOpsAnio] = useState<OpData[]>([])
  const [gastosFijosAnio, setGastosFijosAnio] = useState(0)
  const [desgloseMensual, setDesgloseMensual] = useState<{mes:number; ingresos:number; mb:number; gf:number; mn:number}[]>([])
  const [loadingAnio, setLoadingAnio] = useState(false)
  useEffect(() => { loadAnual() }, [anio])

  async function loadAnual() {
    setLoadingAnio(true)
    const ini = `${anio}-01-01`, fin = `${anio}-12-31`
    const [opRes, feRes, frRes, gfRes, tcRes] = await Promise.all([
      supabase.from('operaciones').select('id, estado, fecha_cierre, cotizacion:cotizaciones(num, cliente, tipo_contenedores, presupuesto)').order('created_at', { ascending: false }),
      supabase.from('facturas_emitidas').select('operacion_id, total_usd, neto_usd, iva_monto, moneda, tc_referencia, a_recuperar').not('operacion_id', 'is', null).gte('fecha_emision', ini).lte('fecha_emision', fin),
      supabase.from('facturas_recibidas').select('operacion_id, total_usd, neto_usd, iva_monto, moneda, tc_referencia, a_recuperar, credito_fiscal').not('operacion_id', 'is', null).gte('fecha_emision', ini).lte('fecha_emision', fin),
      (supabase.from('gastos_fijos_pn') as any).select('monto_clp_equiv, periodo_mes').eq('periodo_anio', anio),
      supabase.from('tipos_cambio_eventos').select('clp').order('created_at', { ascending: false }).limit(1),
    ])
    const tcVal = (tcRes.data?.[0] as any)?.clp || 908
    const gfRows = (gfRes.data||[]) as any[]
    const gfAnioUSD = gfRows.reduce((t,g)=>t+(g.monto_clp_equiv||0),0) / tcVal
    setGastosFijosAnio(gfAnioUSD)
    const opRows = (opRes.data||[]) as any[]
    const feAll = (feRes.data||[]) as any[]
    const frAll = (frRes.data||[]) as any[]
    // Total del ejercicio: todas las facturas del año
    const opsYear = computarOpsData(opRows, feAll, frAll, gfAnioUSD, tcVal)
    const cerradasYear = opsYear.filter(o => o.estado==='cerrada' && o.fecha_cierre>=ini && o.fecha_cierre<=fin)
    setOpsAnio(cerradasYear)
    // Desglose mes a mes: cada operación cerrada se imputa a su mes de cierre (suma exacta al total)
    const mesNum = (d:string) => Number((d||'').slice(5,7))
    const acc: Record<number,{ingresos:number; mb:number}> = {}
    for(let m=1;m<=12;m++) acc[m]={ingresos:0,mb:0}
    for(const o of cerradasYear){ const m=mesNum(o.fecha_cierre); if(m>=1&&m<=12){ acc[m].ingresos+=o.ingresos_usd; acc[m].mb+=o.margen_bruto } }
    const desg = [] as {mes:number; ingresos:number; mb:number; gf:number; mn:number}[]
    for(let m=1;m<=12;m++){
      const gfM = gfRows.filter(g=>(g.periodo_mes||0)===m).reduce((t,g)=>t+(g.monto_clp_equiv||0),0) / tcVal
      desg.push({ mes:m, ingresos:acc[m].ingresos, mb:acc[m].mb, gf:gfM, mn:acc[m].mb-gfM })
    }
    setDesgloseMensual(desg)
    setLoadingAnio(false)
  }

  // Totales del ejercicio (el margen neto total = bruto − gastos fijos, independiente del criterio de prorrateo)
  const totAnioIngresos = opsAnio.reduce((t,o)=>t+o.ingresos_usd,0)
  const totAnioFee      = opsAnio.reduce((t,o)=>t+o.fee_usd,0)
  const totAnioMarkup   = opsAnio.reduce((t,o)=>t+o.markup_usd,0)
  const totAnioIVA      = opsAnio.reduce((t,o)=>t+o.iva_neto,0)
  const totAnioMB       = opsAnio.reduce((t,o)=>t+o.margen_bruto,0)
  const totAnioMN       = totAnioMB - gastosFijosAnio

  async function load() {
    setLoading(true)
    const fechaInicio = `${anio}-${String(mes).padStart(2,'0')}-01`
    const fechaFin = `${anio}-${String(mes).padStart(2,'0')}-31`

    const [opRes, feRes, frRes, gfRes, tcRes] = await Promise.all([
      supabase.from('operaciones').select('id, estado, fecha_cierre, cotizacion:cotizaciones(num, cliente, tipo_contenedores, presupuesto)').order('created_at', { ascending: false }),
      supabase.from('facturas_emitidas').select('operacion_id, total_usd, neto_usd, iva_monto, moneda, tc_referencia, a_recuperar').not('operacion_id', 'is', null).gte('fecha_emision', fechaInicio).lte('fecha_emision', fechaFin),
      supabase.from('facturas_recibidas').select('operacion_id, total_usd, neto_usd, iva_monto, moneda, tc_referencia, a_recuperar, credito_fiscal').not('operacion_id', 'is', null).gte('fecha_emision', fechaInicio).lte('fecha_emision', fechaFin),
      (supabase.from('gastos_fijos_pn') as any).select('monto_clp_equiv').eq('periodo_anio', anio).eq('periodo_mes', mes),
      supabase.from('tipos_cambio_eventos').select('clp').order('created_at', { ascending: false }).limit(1),
    ])

    const tcVal = (tcRes.data?.[0] as any)?.clp || 908
    setTc(tcVal)

    const gfTotal = ((gfRes.data||[]) as any[]).reduce((t, g) => t + (g.monto_clp_equiv||0), 0)
    const gfUSD = gfTotal / tcVal
    setGastosFijosMes(gfUSD)

    // Procesar operaciones (lógica compartida con la vista anual)
    const opsData = computarOpsData((opRes.data||[]) as any[], (feRes.data||[]) as any[], (frRes.data||[]) as any[], gfUSD, tcVal)

    // Separar: cerradas en el período vs en curso
    const opsCerradas = opsData.filter(o => {
      if (o.estado !== 'cerrada' || !o.fecha_cierre) return false
      return o.fecha_cierre >= fechaInicio && o.fecha_cierre <= fechaFin
    })
    const opsEnCurso = opsData.filter(o => o.estado !== 'cerrada')

    setOps(opsCerradas)
    setOpsEnCurso(opsEnCurso)
    setLoading(false)
  }

  const totMB      = ops.reduce((t, o) => t + o.margen_bruto, 0)
  const totFee     = ops.reduce((t, o) => t + o.fee_usd, 0)
  const totMarkup  = ops.reduce((t, o) => t + o.markup_usd, 0)
  const totIVA     = ops.reduce((t, o) => t + o.iva_neto, 0)
  const mnElegido  = (o: OpData) => o[`mn_${criterioElegido}` as keyof OpData] as number
  const totMN      = ops.reduce((t, o) => t + mnElegido(o), 0)

  function colorMN(v: number) {
    return v > 0 ? 'text-green-700' : v < 0 ? 'text-red-700' : 'text-gray-400'
  }

  if (loading) return <div className="p-12 text-center text-gray-400">Cargando...</div>

  if (permListos && !puede(permisos, 'resultados', 'ver')) {
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
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Utilidades</h1>
          <p className="text-xs text-gray-400 mt-0.5">Margen bruto por operación · Margen neto con prorrateo de gastos fijos</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select value={mes} onChange={e => setMes(Number(e.target.value))} className="px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white">
            {MESES.slice(1).map((m,i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
          <select value={anio} onChange={e => setAnio(Number(e.target.value))} className="px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white">
            {[2024,2025,2026,2027].map(a => <option key={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-5 gap-3 mb-5">
        {[
          { label:'Fee PN', val: fmtUSD(totFee), color:'text-[#052698]' },
          { label:'Markup', val: fmtUSD(totMarkup), color:'text-teal-700' },
          { label:'IVA neto (costo)', val: fmtUSD(totIVA), color:'text-orange-700' },
          { label:'Margen bruto', val: fmtUSD(totMB), color:'text-gray-900' },
          { label:`Margen neto (${CRITERIOS.find(c=>c.key===criterioElegido)?.label})`, val: fmtUSD(totMN), color: colorMN(totMN) },
        ].map((k,i) => (
          <div key={i} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1">{k.label}</div>
            <div className={`text-lg font-bold font-mono ${k.color}`}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Gastos fijos del mes */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm mb-5 flex items-center justify-between">
        <div>
          <div className="text-[10px] font-semibold text-gray-400 uppercase">Gastos fijos {MESES[mes]} {anio}</div>
          <div className="text-xs text-gray-400 mt-0.5">Base para prorrateo — TC USD/CLP {fmtN(tc)}</div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold font-mono text-orange-700">{fmtUSD(gastosFijosMes)}</div>
          <Link href="/contabilidad/gastos" className="text-[10px] text-[#1168F8] hover:underline">Ver detalle →</Link>
        </div>
      </div>

      {/* Criterio de prorrateo */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm mb-5">
        <div className="text-[10px] font-semibold text-gray-400 uppercase mb-3">Criterio de distribución de gastos fijos</div>
        <div className="grid grid-cols-4 gap-2">
          {CRITERIOS.map(c => (
            <button key={c.key} onClick={() => setCriterioElegido(c.key)}
              className={`px-3 py-2.5 rounded-xl border-2 text-left transition-all ${criterioElegido===c.key?'border-[#1168F8] bg-[#EBF2FF]':'border-gray-200 hover:bg-gray-50'}`}>
              <div className={`text-xs font-bold ${criterioElegido===c.key?'text-[#052698]':'text-gray-700'}`}>{c.label}</div>
              <div className="text-[10px] text-gray-400 mt-0.5">{c.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {([['operaciones','Por operación'],['comparativo','Comparativo criterios'],['mensual','Resumen mensual'],['anual','Resultado anual']] as [string,string][]).map(([k,l]) => (
          <button key={k} onClick={() => setTab(k as any)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${tab===k?'bg-[#1168F8] text-white':'bg-white border border-gray-200 text-gray-600 hover:border-[#1168F8]'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* Tab: Por operación */}
      {tab === 'operaciones' && (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
          {ops.length === 0 ? (
            <div className="p-12 text-center text-gray-400">Sin operaciones con movimiento financiero en {MESES[mes]} {anio}</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Cotización','Cliente','Fee PN','Markup','IVA neto','Margen bruto','GF asignados','Margen neto','%MB'].map(h => (
                    <th key={h} className="text-left px-3 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ops.map(o => {
                  const mn = mnElegido(o)
                  const gf = o[`gf_por_${criterioElegido}` as keyof OpData] as number
                  const pctMB = o.ingresos_usd > 0 ? (o.margen_bruto / o.ingresos_usd) * 100 : 0
                  return (
                    <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-3 py-3">
                        <div className="font-mono font-bold text-[#052698]">{o.num}</div>
                        {o.estado !== 'cerrada' && (
                          <span className="text-[9px] px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded-full font-semibold">en curso</span>
                        )}
                      </td>
                      <td className="px-3 py-3 font-medium text-gray-800">{o.cliente}</td>
                      <td className="px-3 py-3 text-right font-mono text-[#052698]">{fmtN(o.fee_usd)}</td>
                      <td className="px-3 py-3 text-right font-mono text-teal-700">{fmtN(o.markup_usd)}</td>
                      <td className="px-3 py-3 text-right font-mono text-orange-700">{o.iva_neto > 0 ? `−${fmtN(o.iva_neto)}` : '—'}</td>
                      <td className="px-3 py-3 text-right font-mono font-bold text-gray-900">{fmtN(o.margen_bruto)}</td>
                      <td className="px-3 py-3 text-right font-mono text-orange-600">−{fmtN(gf)}</td>
                      <td className="px-3 py-3 text-right font-mono font-bold">
                        <span className={colorMN(mn)}>{fmtN(mn)}</span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <span className={`font-semibold ${pctMB>=15?'text-green-700':pctMB>=5?'text-amber-600':'text-red-600'}`}>
                          {fmtPct(pctMB)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-[#EBF2FF] border-t-2 border-[#1168F8]">
                  <td colSpan={2} className="px-3 py-3 text-xs font-bold text-[#052698]">TOTALES</td>
                  <td className="px-3 py-3 text-right font-mono font-bold text-[#052698]">{fmtN(totFee)}</td>
                  <td className="px-3 py-3 text-right font-mono font-bold text-teal-700">{fmtN(totMarkup)}</td>
                  <td className="px-3 py-3 text-right font-mono font-bold text-orange-700">{totIVA>0?`−${fmtN(totIVA)}`:'—'}</td>
                  <td className="px-3 py-3 text-right font-mono font-bold text-gray-900">{fmtN(totMB)}</td>
                  <td className="px-3 py-3 text-right font-mono font-bold text-orange-600">−{fmtN(gastosFijosMes)}</td>
                  <td className="px-3 py-3 text-right font-mono font-bold">
                    <span className={colorMN(totMN)}>{fmtN(totMN)}</span>
                  </td>
                  <td className="px-3 py-3 text-right font-semibold text-gray-600">
                    {fmtPct(ops.reduce((t,o)=>t+o.ingresos_usd,0)>0?(totMB/ops.reduce((t,o)=>t+o.ingresos_usd,0))*100:0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      {/* Tab: Comparativo criterios */}
      {tab === 'comparativo' && (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-3 py-3 text-[10px] font-semibold text-gray-400 uppercase">Cotización</th>
                <th className="text-left px-3 py-3 text-[10px] font-semibold text-gray-400 uppercase">Cliente</th>
                <th className="text-right px-3 py-3 text-[10px] font-semibold text-gray-400 uppercase">M. Bruto</th>
                {CRITERIOS.map(c => (
                  <th key={c.key} className={`text-right px-3 py-3 text-[10px] font-semibold uppercase ${criterioElegido===c.key?'text-[#052698]':'text-gray-400'}`}>
                    {c.label}
                    {criterioElegido===c.key && <span className="ml-1">★</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ops.map(o => (
                <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-3 py-3">
                    <div className="font-mono font-bold text-[#052698]">{o.num}</div>
                    {o.estado !== 'cerrada' && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded-full font-semibold">en curso</span>
                    )}
                  </td>
                  <td className="px-3 py-3 font-medium text-gray-800">{o.cliente}</td>
                  <td className="px-3 py-3 text-right font-mono font-bold text-gray-900">{fmtN(o.margen_bruto)}</td>
                  <td className={`px-3 py-3 text-right font-mono ${criterioElegido==='ingresos'?'font-bold':''}`}>
                    <span className={colorMN(o.mn_ingresos)}>{fmtN(o.mn_ingresos)}</span>
                  </td>
                  <td className={`px-3 py-3 text-right font-mono ${criterioElegido==='costos'?'font-bold':''}`}>
                    <span className={colorMN(o.mn_costos)}>{fmtN(o.mn_costos)}</span>
                  </td>
                  <td className={`px-3 py-3 text-right font-mono ${criterioElegido==='contenedores'?'font-bold':''}`}>
                    <span className={colorMN(o.mn_contenedores)}>{fmtN(o.mn_contenedores)}</span>
                  </td>
                  <td className={`px-3 py-3 text-right font-mono ${criterioElegido==='igualitario'?'font-bold':''}`}>
                    <span className={colorMN(o.mn_igualitario)}>{fmtN(o.mn_igualitario)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-[#EBF2FF] border-t-2 border-[#1168F8]">
                <td colSpan={2} className="px-3 py-3 text-xs font-bold text-[#052698]">TOTALES</td>
                <td className="px-3 py-3 text-right font-mono font-bold text-gray-900">{fmtN(totMB)}</td>
                {CRITERIOS.map(c => {
                  const tot = ops.reduce((t,o) => t + (o[`mn_${c.key}` as keyof OpData] as number), 0)
                  return (
                    <td key={c.key} className={`px-3 py-3 text-right font-mono font-bold ${criterioElegido===c.key?'text-[#052698]':''}`}>
                      <span className={colorMN(tot)}>{fmtN(tot)}</span>
                    </td>
                  )
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Tab: Resumen mensual */}
      {tab === 'mensual' && (
        <div className="max-w-lg space-y-4">
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
            <h3 className="font-bold text-sm text-gray-900 mb-4">Resumen {MESES[mes]} {anio}</h3>
            <div className="space-y-3">
              {[
                { label:'Ingresos totales facturados', val: ops.reduce((t,o)=>t+o.ingresos_usd,0), color:'text-gray-800' },
                { label:'Fee Puerto NOA', val: totFee, color:'text-[#052698]' },
                { label:'Markup sobre costos', val: totMarkup, color:'text-teal-700' },
                { label:'IVA neto a pagar SII', val: -totIVA, color:'text-orange-700' },
                { label:'', val: 0, color:'' },
                { label:'MARGEN BRUTO', val: totMB, color:'text-gray-900', bold: true },
                { label:`Gastos fijos (${CRITERIOS.find(c=>c.key===criterioElegido)?.label})`, val: -gastosFijosMes, color:'text-orange-600' },
                { label:'MARGEN NETO', val: totMN, color: colorMN(totMN), bold: true },
              ].map((r,i) => r.label ? (
                <div key={i} className={`flex justify-between py-1.5 border-b border-gray-50 ${r.bold?'border-t-2 border-gray-200 pt-2 mt-1':''}`}>
                  <span className={`text-xs ${r.bold?'font-bold text-gray-900':'text-gray-600'}`}>{r.label}</span>
                  <span className={`font-mono text-sm font-bold ${r.color}`}>
                    {r.val < 0 ? `−USD ${fmtN(Math.abs(r.val))}` : fmtUSD(r.val)}
                  </span>
                </div>
              ) : <div key={i} className="h-2"/>)}
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-[11px] text-blue-700 mb-3">
            💡 El criterio activo es <strong>{CRITERIOS.find(c=>c.key===criterioElegido)?.label}</strong>.
            Cambialo desde el selector arriba para ver cómo varía el margen neto por operación.
          </div>
          {ops.some(o => o.estado !== 'cerrada') && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-[11px] text-amber-700">
              ⚠ Hay operaciones <strong>en curso</strong> incluidas. Los números son parciales y cambiarán al registrar más movimientos.
            </div>
          )}
        </div>
      )}
      {/* Tab: Resultado anual */}
      {tab === 'anual' && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
            <h3 className="font-bold text-sm text-gray-900 mb-1">Resultado ejercicio fiscal {anio}</h3>
            <p className="text-xs text-gray-400 mb-4">Operaciones cerradas · Enero — Diciembre {anio} · consolidado automático · Normativa SII Chile</p>
            {loadingAnio ? (
              <div className="text-xs text-gray-400 py-6 text-center">Consolidando el ejercicio…</div>
            ) : opsAnio.length===0 ? (
              <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-6 text-center text-xs text-gray-400">Sin operaciones cerradas en {anio}.</div>
            ) : (
            <div className="space-y-2">
              {[
                { label: 'Ingresos totales del ejercicio', val: totAnioIngresos, indent: false, bold: false },
                { label: 'Fee Puerto NOA', val: totAnioFee, indent: true, bold: false },
                { label: 'Markup sobre costos', val: totAnioMarkup, indent: true, bold: false },
                { label: 'IVA neto pagado SII', val: -totAnioIVA, indent: true, bold: false },
                { label: 'RESULTADO BRUTO DE EXPLOTACIÓN', val: totAnioMB, indent: false, bold: true },
                { label: 'Gastos de administración y operación (12 meses)', val: -gastosFijosAnio, indent: true, bold: false },
                { label: `RESULTADO NETO DEL EJERCICIO`, val: totAnioMN, indent: false, bold: true },
              ].map((r,i) => (
                <div key={i} className={`flex justify-between py-2 border-b border-gray-50 ${r.bold?'border-t border-gray-200 mt-2 pt-3':''} ${r.indent?'pl-4':''}`}>
                  <span className={`text-xs ${r.bold?'font-bold text-gray-900':'text-gray-600'}`}>{r.label}</span>
                  <span className={`font-mono text-sm font-bold ${r.bold?colorMN(r.val):'text-gray-700'}`}>
                    {r.val < 0 ? `−USD ${fmtN(Math.abs(r.val))}` : fmtUSD(r.val)}
                  </span>
                </div>
              ))}
            </div>
            )}
          </div>

          {!loadingAnio && opsAnio.length>0 && (
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
            <div className="text-[10px] font-semibold text-gray-400 uppercase mb-3">Composición del ejercicio — mes a mes</div>
            <table className="w-full text-xs">
              <thead><tr className="border-b border-gray-100 text-[10px] text-gray-400 uppercase">
                <th className="text-left py-2">Mes</th>
                <th className="text-right py-2">Ingresos</th>
                <th className="text-right py-2">Margen bruto</th>
                <th className="text-right py-2">Gastos fijos</th>
                <th className="text-right py-2">Margen neto</th>
              </tr></thead>
              <tbody>
                {desgloseMensual.filter(d=>d.ingresos!==0||d.mb!==0||d.gf!==0).map(d => (
                  <tr key={d.mes} className="border-b border-gray-50">
                    <td className="py-1.5 text-gray-700">{MESES[d.mes]}</td>
                    <td className="py-1.5 text-right font-mono text-gray-600">{fmtN(d.ingresos)}</td>
                    <td className="py-1.5 text-right font-mono text-gray-600">{fmtN(d.mb)}</td>
                    <td className="py-1.5 text-right font-mono text-orange-600">{d.gf>0?`−${fmtN(d.gf)}`:'—'}</td>
                    <td className={`py-1.5 text-right font-mono font-bold ${colorMN(d.mn)}`}>{d.mn<0?`−${fmtN(Math.abs(d.mn))}`:fmtN(d.mn)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 font-bold">
                  <td className="py-2 text-gray-900">Ejercicio {anio}</td>
                  <td className="py-2 text-right font-mono text-gray-900">{fmtN(totAnioIngresos)}</td>
                  <td className="py-2 text-right font-mono text-gray-900">{fmtN(totAnioMB)}</td>
                  <td className="py-2 text-right font-mono text-orange-700">{gastosFijosAnio>0?`−${fmtN(gastosFijosAnio)}`:'—'}</td>
                  <td className={`py-2 text-right font-mono ${colorMN(totAnioMN)}`}>{totAnioMN<0?`−${fmtN(Math.abs(totAnioMN))}`:fmtN(totAnioMN)}</td>
                </tr>
              </tfoot>
            </table>
            <div className="mt-3 text-[10px] text-gray-400">El margen neto total del ejercicio es independiente del criterio de prorrateo (bruto − gastos fijos). El criterio solo redistribuye los gastos fijos entre operaciones.</div>
          </div>
          )}

          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
            <div className="text-[10px] font-semibold text-gray-400 uppercase mb-3">Datos para declaración — Puerto NOA SpA</div>
            <div className="text-xs text-gray-500 space-y-1">
              <div>RUT: <span className="font-mono text-gray-800">— configurar en Catálogos</span></div>
              <div>Razón social: <span className="font-mono text-gray-800">Puerto NOA SpA</span></div>
              <div>Régimen tributario: <span className="font-mono text-gray-800">— configurar en Catálogos</span></div>
              <div>Año tributario: <span className="font-mono text-gray-800">{anio + 1} (ejercicio {anio})</span></div>
            </div>
            <div className="mt-3 text-[10px] text-[#1168F8] hover:underline cursor-pointer">
              Completar datos de la empresa en Catálogos →
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
