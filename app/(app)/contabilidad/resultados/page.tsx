'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'

const fmtN = (n: number) => (n||0).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtP = (n: number) => `${(n||0).toFixed(1)}%`
const MESES = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

export default function UtilidadesPage() {
  const supabase = useMemo(() => createClient(), [])
  const [utilidades, setUtilidades] = useState<any[]>([])
  const [gastosFijos, setGastosFijos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [verDetalle, setVerDetalle] = useState<string|null>(null)
  const [tc, setTc] = useState(908)

  useEffect(() => { load() }, [anio])

  async function load() {
    setLoading(true)
    const [uRes, gRes, tcRes] = await Promise.all([
      (supabase.from('utilidad_operacion') as any).select('*').gte('fecha_cierre', `${anio}-01-01`).lte('fecha_cierre', `${anio}-12-31`).order('fecha_cierre', { ascending: false }),
      (supabase.from('gastos_fijos_pn') as any).select('periodo_anio,periodo_mes,monto_clp_equiv').eq('periodo_anio', anio),
      (supabase.from('tipos_cambio_eventos') as any).select('clp').order('created_at', { ascending: false }).limit(1),
    ])
    if (uRes.data) setUtilidades(uRes.data)
    if (gRes.data) setGastosFijos(gRes.data)
    if (tcRes.data?.[0]) setTc(tcRes.data[0].clp || 908)
    setLoading(false)
  }

  // Totales globales del año
  const totIngresos = utilidades.reduce((t, u) => t + (u.ingresos_usd||0), 0)
  const totCostos   = utilidades.reduce((t, u) => t + (u.total_costos_usd||0), 0)
  const totFee      = utilidades.reduce((t, u) => t + (u.fee_usd||0), 0)
  const totMargen   = utilidades.reduce((t, u) => t + (u.margen_bruto_usd||0), 0)
  const totGastosFijosClp = gastosFijos.reduce((t, g) => t + (g.monto_clp_equiv||0), 0)
  const totGastosFijosUsd = totGastosFijosClp / tc
  const totResultado = totMargen - totGastosFijosUsd

  // Agrupación por mes
  const porMes = Array.from({length:12}, (_,i) => {
    const m = i + 1
    const ops = utilidades.filter(u => {
      const fecha = u.fecha_cierre || u.created_at
      return fecha && new Date(fecha).getMonth() + 1 === m
    })
    const gfClp = gastosFijos.filter(g => g.periodo_mes === m).reduce((t,g) => t + (g.monto_clp_equiv||0), 0)
    const ingresos = ops.reduce((t,u) => t + (u.ingresos_usd||0), 0)
    const costos   = ops.reduce((t,u) => t + (u.total_costos_usd||0), 0)
    const margen   = ops.reduce((t,u) => t + (u.margen_bruto_usd||0), 0)
    const gfUsd    = gfClp / tc
    return { mes: m, ops: ops.length, ingresos, costos, margen, gfUsd, resultado: margen - gfUsd }
  }).filter(m => m.ops > 0 || m.ingresos > 0)

  const detalle = verDetalle ? utilidades.find(u => u.id === verDetalle) : null

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Utilidades</h1>
          <p className="text-xs text-gray-400 mt-0.5">Por operación y resultado global Puerto NOA</p>
        </div>
        <select value={anio} onChange={e => setAnio(Number(e.target.value))} className="px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white">
          {[2024,2025,2026,2027].map(a => <option key={a}>{a}</option>)}
        </select>
      </div>

      {/* KPIs anuales */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Ingresos totales', value: `USD ${fmtN(totIngresos)}`, sub: 'Facturado al cliente' },
          { label: 'Costos directos', value: `USD ${fmtN(totCostos)}`, sub: 'Carriles 1+2+3' },
          { label: 'Margen bruto', value: `USD ${fmtN(totMargen)}`, sub: fmtP(totIngresos > 0 ? (totMargen/totIngresos)*100 : 0) },
          { label: 'Resultado neto', value: `USD ${fmtN(totResultado)}`, sub: 'Margen − gastos fijos', highlight: true, positive: totResultado >= 0 },
        ].map((kpi, i) => (
          <div key={i} className={`border rounded-2xl p-4 shadow-sm ${kpi.highlight ? (kpi.positive ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100') : 'bg-white border-gray-100'}`}>
            <div className={`text-[10px] font-semibold uppercase mb-2 ${kpi.highlight ? (kpi.positive ? 'text-green-700' : 'text-red-700') : 'text-gray-400'}`}>{kpi.label}</div>
            <div className={`text-lg font-bold font-mono ${kpi.highlight ? (kpi.positive ? 'text-green-800' : 'text-red-800') : 'text-gray-900'}`}>{kpi.value}</div>
            <div className={`text-xs mt-1 ${kpi.highlight ? (kpi.positive ? 'text-green-600' : 'text-red-600') : 'text-gray-400'}`}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Resumen gastos fijos */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm mb-6 flex items-center justify-between">
        <div>
          <div className="text-[10px] font-semibold text-gray-400 uppercase">Gastos fijos PN — {anio}</div>
          <div className="text-xs text-gray-400 mt-0.5">Deducidos del margen bruto para calcular resultado neto</div>
        </div>
        <div>
          <div className="text-xl font-bold text-gray-900 font-mono text-right">$ {fmtN(totGastosFijosClp)} CLP</div>
          <div className="text-xs text-gray-400 text-right">≈ USD {fmtN(totGastosFijosUsd)} (TC {fmtN(tc)})</div>
        </div>
      </div>

      {/* Tabla por mes */}
      {porMes.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm mb-6">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <h3 className="font-bold text-sm text-gray-900">Resumen por mes</h3>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Mes','Ops.','Ingresos USD','Costos USD','Margen bruto','Gastos fijos USD','Resultado'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {porMes.map(m => (
                <tr key={m.mes} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 font-semibold text-gray-700">{MESES[m.mes]}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="px-2 py-0.5 bg-[#EBF2FF] text-[#052698] rounded-full text-[10px] font-bold">{m.ops}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{fmtN(m.ingresos)}</td>
                  <td className="px-4 py-3 text-right font-mono text-red-600">{fmtN(m.costos)}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold">{fmtN(m.margen)}</td>
                  <td className="px-4 py-3 text-right font-mono text-orange-600">{fmtN(m.gfUsd)}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold">
                    <span className={m.resultado >= 0 ? 'text-green-700' : 'text-red-700'}>{fmtN(m.resultado)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tabla por operación */}
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
          <h3 className="font-bold text-sm text-gray-900">Detalle por operación</h3>
        </div>
        {loading ? <div className="p-12 text-center text-gray-400">Cargando...</div> : utilidades.length === 0 ? (
          <div className="p-12 text-center text-gray-400">Sin operaciones cerradas en {anio}</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Cotización','Cliente','Cierre','Ingresos','Costos','Fee PN','Margen','%','Estado'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {utilidades.map(u => (
                <tr key={u.id} className="border-b border-gray-50 hover:bg-blue-50/20 cursor-pointer" onClick={() => setVerDetalle(verDetalle === u.id ? null : u.id)}>
                  <td className="px-4 py-3.5 font-mono text-[#052698] font-semibold">{u.cotizacion_num||'—'}</td>
                  <td className="px-4 py-3.5 font-medium text-gray-800">{u.cliente_nombre||'—'}</td>
                  <td className="px-4 py-3.5 font-mono text-[11px] text-gray-500">{u.fecha_cierre?.split('-').reverse().join('/')||'—'}</td>
                  <td className="px-4 py-3.5 text-right font-mono">{fmtN(u.ingresos_usd)}</td>
                  <td className="px-4 py-3.5 text-right font-mono text-red-600">{fmtN(u.total_costos_usd)}</td>
                  <td className="px-4 py-3.5 text-right font-mono text-[#1168F8]">{fmtN(u.fee_usd)}</td>
                  <td className="px-4 py-3.5 text-right font-mono font-bold">{fmtN(u.margen_bruto_usd)}</td>
                  <td className="px-4 py-3.5 text-right">
                    <span className={`font-semibold ${(u.margen_pct||0)>=15?'text-green-700':(u.margen_pct||0)>=5?'text-orange-600':'text-red-600'}`}>
                      {fmtP(u.margen_pct)}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${u.estado==='cerrada'?'bg-green-50 text-green-700':'bg-blue-50 text-blue-700'}`}>{u.estado}</span>
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
