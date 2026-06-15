'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'

const fmtN = (n: number) => (n||0).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtCLP = (n: number) => `$ ${(n||0).toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
const fmtUSD = (n: number) => `USD ${fmtN(n)}`

export default function DashboardFinancieroPage() {
  const supabase = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(true)
  const [tc, setTc] = useState<{usd:number,ars:number,clp:number}>({usd:908,ars:1450,clp:908})
  const [data, setData] = useState({
    ivaVentas: 0, ivaCompras: 0, ivaSaldo: 0,
    facturasEmitidas: 0, facturasRecibidas: 0,
    gastosFixosMes: 0,
    utilidadMes: 0, utilidadAnio: 0,
    cuentasCLP: 0, cuentasUSD: 0, cuentasARS: 0,
    custodiaTotal: 0,
    ctaCtePendiente: 0,
    operacionesAbiertas: 0,
  })

  const anio = new Date().getFullYear()
  const mes  = new Date().getMonth() + 1

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [tcRes, ivavRes, ivacRes, feRes, frRes, gfRes, uRes, cpRes, ccRes, opRes] = await Promise.all([
      (supabase.from('tipos_cambio_eventos') as any).select('clp,ars').order('created_at',{ascending:false}).limit(1),
      (supabase.from('libro_iva_ventas') as any).select('iva_clp').eq('anio',anio).eq('mes',mes),
      (supabase.from('libro_iva_compras') as any).select('credito_fiscal_clp').eq('anio',anio).eq('mes',mes),
      supabase.from('facturas_emitidas').select('total_usd,total_clp').gte('fecha', `${anio}-01-01`),
      supabase.from('facturas_recibidas').select('total_usd,total_clp').gte('fecha', `${anio}-01-01`),
      (supabase.from('gastos_fijos_pn') as any).select('monto_clp_equiv').eq('periodo_anio',anio).eq('periodo_mes',mes),
      (supabase.from('utilidad_operacion') as any).select('margen_bruto_usd,resultado_neto_usd').gte('fecha_cierre',`${anio}-01-01`),
      (supabase.from('cuentas_pn') as any).select('moneda,saldo_actual').eq('activo',true),
      supabase.from('fondos_custodia').select('moneda,saldo'),
      supabase.from('cotizaciones').select('id').eq('estado','en_proceso'),
    ])

    const tcVal = tcRes.data?.[0] || {clp:908,ars:1450}
    setTc({usd:tcVal.clp||908, ars:tcVal.ars||1450, clp:tcVal.clp||908})

    const ivaV = (ivavRes.data||[]).reduce((t,r) => t+(r.iva_clp||0), 0)
    const ivaC = (ivacRes.data||[]).reduce((t,r) => t+(r.credito_fiscal_clp||0), 0)

    const totGf = (gfRes.data||[]).reduce((t,r) => t+(r.monto_clp_equiv||0), 0)
    const uMes  = (uRes.data||[]).reduce((t,r) => t+(r.margen_bruto_usd||0), 0)
    const uAnio = (uRes.data||[]).reduce((t,r) => t+(r.margen_bruto_usd||0), 0)

    const cpData = cpRes.data || []
    const cClp = cpData.filter(c=>c.moneda==='CLP').reduce((t,c)=>t+(c.saldo_actual||0),0)
    const cUsd = cpData.filter(c=>c.moneda==='USD').reduce((t,c)=>t+(c.saldo_actual||0),0)
    const cArs = cpData.filter(c=>c.moneda==='ARS').reduce((t,c)=>t+(c.saldo_actual||0),0)

    const ccData = ccRes.data || []
    const custTotal = ccData.reduce((t,c) => {
      const s = c.saldo||0
      if (c.moneda==='USD') return t + s
      if (c.moneda==='CLP') return t + s/(tcVal.clp||908)
      if (c.moneda==='ARS') return t + s/(tcVal.ars||1450)
      return t
    }, 0)

    setData({
      ivaVentas: ivaV, ivaCompras: ivaC, ivaSaldo: ivaV - ivaC,
      facturasEmitidas: (feRes.data||[]).reduce((t,r)=>t+(r.total_usd||r.total_clp/(tcVal.clp||908)||0),0),
      facturasRecibidas: (frRes.data||[]).reduce((t,r)=>t+(r.total_usd||r.total_clp/(tcVal.clp||908)||0),0),
      gastosFixosMes: totGf,
      utilidadMes: uMes, utilidadAnio: uAnio,
      cuentasCLP: cClp, cuentasUSD: cUsd, cuentasARS: cArs,
      custodiaTotal: custTotal,
      ctaCtePendiente: 0,
      operacionesAbiertas: opRes.data?.length || 0,
    })
    setLoading(false)
  }

  const MESES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

  if (loading) return <div className="p-12 text-center text-gray-400">Cargando dashboard financiero...</div>

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Dashboard financiero</h1>
        <p className="text-xs text-gray-400 mt-0.5">Puerto NOA SpA — visión consolidada · TC USD/CLP {fmtN(tc.usd)} · USD/ARS {fmtN(tc.ars)}</p>
      </div>

      {/* Fila 1: IVA del mes */}
      <div className="mb-4">
        <div className="text-[10px] font-semibold text-gray-400 uppercase mb-2">{MESES[mes]} {anio} — Posición IVA</div>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Débito fiscal</div>
            <div className="text-xl font-bold font-mono text-orange-700">{fmtCLP(data.ivaVentas)}</div>
            <div className="text-[10px] text-gray-400 mt-1">IVA cobrado en ventas</div>
          </div>
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Crédito fiscal</div>
            <div className="text-xl font-bold font-mono text-green-700">{fmtCLP(data.ivaCompras)}</div>
            <div className="text-[10px] text-gray-400 mt-1">IVA pagado en compras</div>
          </div>
          <div className={`border rounded-2xl p-4 shadow-sm ${data.ivaSaldo >= 0 ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
            <div className={`text-[10px] font-semibold uppercase mb-1 ${data.ivaSaldo >= 0 ? 'text-red-700' : 'text-green-700'}`}>
              {data.ivaSaldo >= 0 ? 'A pagar SII' : 'Remanente CF'}
            </div>
            <div className={`text-xl font-bold font-mono ${data.ivaSaldo >= 0 ? 'text-red-800' : 'text-green-800'}`}>{fmtCLP(Math.abs(data.ivaSaldo))}</div>
            <div className={`text-[10px] mt-1 ${data.ivaSaldo >= 0 ? 'text-red-600' : 'text-green-600'}`}>F29 — Línea 48</div>
          </div>
        </div>
      </div>

      {/* Fila 2: Facturación del año */}
      <div className="mb-4">
        <div className="text-[10px] font-semibold text-gray-400 uppercase mb-2">Facturación {anio}</div>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Facturas emitidas PN</div>
            <div className="text-xl font-bold font-mono text-[#052698]">{fmtUSD(data.facturasEmitidas)}</div>
            <div className="text-[10px] text-gray-400 mt-1">Ingresos totales facturados</div>
          </div>
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Facturas recibidas PN</div>
            <div className="text-xl font-bold font-mono text-red-700">{fmtUSD(data.facturasRecibidas)}</div>
            <div className="text-[10px] text-gray-400 mt-1">Costos totales facturados</div>
          </div>
        </div>
      </div>

      {/* Fila 3: Utilidades */}
      <div className="mb-4">
        <div className="text-[10px] font-semibold text-gray-400 uppercase mb-2">Resultado operativo</div>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Margen bruto {anio}</div>
            <div className="text-xl font-bold font-mono text-gray-900">{fmtUSD(data.utilidadAnio)}</div>
            <div className="text-[10px] text-gray-400 mt-1">Ingresos − costos directos</div>
          </div>
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Gastos fijos {MESES[mes]}</div>
            <div className="text-xl font-bold font-mono text-orange-700">{fmtCLP(data.gastosFixosMes)}</div>
            <div className="text-[10px] text-gray-400 mt-1">Estructura fija del mes</div>
          </div>
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Ops. abiertas</div>
            <div className="text-3xl font-bold text-[#1168F8]">{data.operacionesAbiertas}</div>
            <div className="text-[10px] text-gray-400 mt-1">En proceso actualmente</div>
          </div>
        </div>
      </div>

      {/* Fila 4: Cuentas */}
      <div className="mb-4">
        <div className="text-[10px] font-semibold text-gray-400 uppercase mb-2">Posición de cuentas Puerto NOA</div>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <div className="text-[10px] font-semibold text-gray-400 uppercase mb-3">Cuentas propias PN</div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-xs text-gray-600">🇨🇱 CLP</span>
                <span className="font-mono text-xs font-bold">{fmtCLP(data.cuentasCLP)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-gray-600">💵 USD</span>
                <span className="font-mono text-xs font-bold">{fmtUSD(data.cuentasUSD)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-gray-600">🇦🇷 ARS</span>
                <span className="font-mono text-xs font-bold">AR$ {fmtN(data.cuentasARS)}</span>
              </div>
            </div>
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 shadow-sm">
            <div className="text-[10px] font-semibold text-blue-600 uppercase mb-3">Fondos en custodia (clientes)</div>
            <div className="text-2xl font-bold font-mono text-blue-800">{fmtUSD(data.custodiaTotal)}</div>
            <div className="text-[10px] text-blue-500 mt-1">Total administrado para clientes</div>
          </div>
        </div>
      </div>

      {/* Accesos rápidos */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label:'Libro IVA', href:'/contabilidad/iva', desc:'Compras y ventas' },
          { label:'Gastos fijos', href:'/contabilidad/gastos', desc:'Estructura PN' },
          { label:'Utilidades', href:'/contabilidad/resultados', desc:'Por operación' },
          { label:'Flujo cuentas', href:'/tesoreria/flujo', desc:'ARG ↔ Chile' },
        ].map(a => (
          <a key={a.href} href={a.href} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:border-[#1168F8] transition-colors group">
            <div className="font-semibold text-sm text-gray-900 group-hover:text-[#1168F8]">{a.label}</div>
            <div className="text-xs text-gray-400 mt-1">{a.desc}</div>
          </a>
        ))}
      </div>
    </div>
  )
}
