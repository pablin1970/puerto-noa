'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

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

export default function UtilidadesPage() {
  const supabase = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(true)
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [mes, setMes] = useState(new Date().getMonth() + 1)
  const [ops, setOps] = useState<OpData[]>([])
  const [gastosFijosMes, setGastosFijosMes] = useState(0)
  const [criterioElegido, setCriterioElegido] = useState<string>('costos')
  const [tab, setTab] = useState<'operaciones'|'comparativo'|'mensual'>('operaciones')
  const [tc, setTc] = useState(908)

  useEffect(() => { load() }, [anio, mes])

  async function load() {
    setLoading(true)
    const fechaInicio = `${anio}-${String(mes).padStart(2,'0')}-01`
    const fechaFin = `${anio}-${String(mes).padStart(2,'0')}-31`

    const [opRes, feRes, frRes, gfRes, tcRes] = await Promise.all([
      supabase.from('operaciones').select('id, estado, cotizacion:cotizaciones(num, cliente, tipo_contenedores, presupuesto)').order('created_at', { ascending: false }),
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

    // Agrupar facturas por operacion_id
    const feByOp: Record<string, any[]> = {}
    for (const f of (feRes.data||[]) as any[]) {
      if (!feByOp[f.operacion_id]) feByOp[f.operacion_id] = []
      feByOp[f.operacion_id].push(f)
    }
    const frByOp: Record<string, any[]> = {}
    for (const f of (frRes.data||[]) as any[]) {
      if (!frByOp[f.operacion_id]) frByOp[f.operacion_id] = []
      frByOp[f.operacion_id].push(f)
    }

    // Procesar operaciones
    const opsData: OpData[] = ((opRes.data||[]) as any[]).map(op => {
      const cot = op.cotizacion as any
      const presupuesto = Array.isArray(cot?.presupuesto) ? cot.presupuesto : []

      // Fee desde presupuesto (etapa: 'fee')
      const feeItem = presupuesto.find((i: any) => i.etapa === 'fee')
      const fee_usd = feeItem?.usd || 0

      // Contenedores
      const conts = Array.isArray(cot?.tipo_contenedores) ? cot.tipo_contenedores : []
      const contenedores = conts.reduce((t: number, c: any) => t + (c.cantidad || 1), 0) || 1

      // Facturas emitidas de esta operación
      const fes = feByOp[op.id] || []
      const ingresos_usd = fes.reduce((t, f) => t + (f.total_usd || (f.neto_usd * 1.19) || 0), 0)
      const iva_debito = fes.reduce((t, f) => t + (f.iva_monto || 0) / (f.tc_referencia || tcVal), 0)

      // Facturas recibidas de esta operación
      const frs = frByOp[op.id] || []
      const costos_usd = frs.reduce((t, f) => t + (f.total_usd || 0), 0)
      const iva_credito = frs.filter(f => f.credito_fiscal).reduce((t, f) => t + (f.iva_monto || 0) / (f.tc_referencia || tcVal), 0)

      // Markup: cobrado al cliente en recuperos − pagado a proveedores en recuperos
      const cobrado_recupero = fes.filter(f => f.a_recuperar).reduce((t, f) => t + (f.total_usd || 0), 0)
      const pagado_recupero = frs.filter(f => f.a_recuperar).reduce((t, f) => t + (f.total_usd || 0), 0)
      const markup_usd = cobrado_recupero - pagado_recupero

      // IVA neto: si débito > crédito → costo
      const iva_neto = Math.max(0, iva_debito - iva_credito)

      // Margen bruto
      const margen_bruto = fee_usd + markup_usd - iva_neto

      return {
        id: op.id,
        num: cot?.num || '—',
        cliente: cot?.cliente || '—',
        fecha_cierre: op.updated_at?.slice(0,10) || '',
        ingresos_usd, costos_usd, fee_usd, markup_usd,
        iva_debito, iva_credito, iva_neto,
        margen_bruto, contenedores,
        gf_por_ingresos: 0, gf_por_costos: 0,
        gf_por_contenedores: 0, gf_igualitario: 0,
        mn_ingresos: 0, mn_costos: 0,
        mn_contenedores: 0, mn_igualitario: 0,
      }
    }).filter(o => o.ingresos_usd > 0 || o.fee_usd > 0)

    // Calcular prorrateos de gastos fijos
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

    setOps(opsData)
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
        {([['operaciones','Por operación'],['comparativo','Comparativo criterios'],['mensual','Resumen mensual']] as [string,string][]).map(([k,l]) => (
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
                      <td className="px-3 py-3 font-mono font-bold text-[#052698]">{o.num}</td>
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
                  <td className="px-3 py-3 font-mono font-bold text-[#052698]">{o.num}</td>
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

          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-[11px] text-blue-700">
            💡 El criterio activo es <strong>{CRITERIOS.find(c=>c.key===criterioElegido)?.label}</strong>.
            Cambialo desde el selector arriba para ver cómo varía el margen neto por operación.
          </div>
        </div>
      )}
    </div>
  )
}
