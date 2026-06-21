'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { cargarPermisos, puede } from '@/lib/permisos'

const fmtCLP = (n: number) => `$ ${(n||0).toLocaleString('es-CL',{maximumFractionDigits:0})}`
const fmtUSD = (n: number) => `USD ${(n||0).toLocaleString('es-CL',{minimumFractionDigits:2,maximumFractionDigits:2})}`
const MESES = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

export default function DashboardFinancieroPage() {
  const supabase = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(true)
  const [tc, setTc] = useState({ usd: 908, ars: 1450 })
  const [d, setD] = useState({
    ivaVentas:0, ivaCompras:0, ivaSaldo:0,
    facEmitidas:0, facRecibidas:0,
    gastosFixosMes:0,
    margenAnio:0,
    cuentasCLP:0, cuentasUSD:0, cuentasARS:0,
    custodiaUSD:0,
    opsAbiertas:0,
  })

  const anio = new Date().getFullYear()
  const mes  = new Date().getMonth() + 1

  const [permisos, setPermisos] = useState<Record<string, string[]>>({})
  const [permListos, setPermListos] = useState(false)
  useEffect(() => { cargarPermisos().then(p => { setPermisos(p); setPermListos(true) }) }, [])

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [tcRes, ivavRes, ivacRes, feRes, frRes, gfRes, uRes, cpRes, mvRes, opRes] = await Promise.all([
      supabase.from('tipos_cambio_eventos').select('clp,ars').order('created_at',{ascending:false}).limit(1),
      (supabase.from('libro_iva_ventas') as any).select('iva_clp').eq('anio',anio).eq('mes',mes),
      (supabase.from('libro_iva_compras') as any).select('credito_fiscal_clp').eq('anio',anio).eq('mes',mes),
      supabase.from('facturas_emitidas').select('total,estado,moneda').gte('fecha_emision',`${anio}-01-01`),
      supabase.from('facturas_recibidas').select('total,estado,moneda').gte('fecha_emision',`${anio}-01-01`),
      (supabase.from('gastos_fijos_pn') as any).select('monto_clp_equiv').eq('periodo_anio',anio).eq('periodo_mes',mes),
      (supabase.from('utilidad_operacion') as any).select('margen_bruto_usd').gte('fecha_cierre',`${anio}-01-01`),
      (supabase.from('cuentas_pn') as any).select('moneda,saldo_actual').eq('activo',true),
      (supabase.from('fondos_movimientos') as any).select('tipo,monto,moneda'),
      supabase.from('operaciones').select('id').eq('estado','activa'),
    ])

    const tcVal = (tcRes.data?.[0] as any) || { clp:908, ars:1450 }
    setTc({ usd: tcVal.clp||908, ars: tcVal.ars||1450 })

    const ivaV = (ivavRes.data||[]).reduce((t:number,r:any)=>t+(r.iva_clp||0),0)
    const ivaC = (ivacRes.data||[]).reduce((t:number,r:any)=>t+(r.credito_fiscal_clp||0),0)
    const gfMes = (gfRes.data||[]).reduce((t:number,r:any)=>t+(r.monto_clp_equiv||0),0)
    const margen = (uRes.data||[]).reduce((t:number,r:any)=>t+(r.margen_bruto_usd||0),0)
    const cp = cpRes.data||[]
    const movs = mvRes.data||[]
    const custUSD = (movs as any[]).reduce((t:number,m:any)=>{
      const v = m.monto||0
      return ['ingreso','deposito','credito'].includes(m.tipo)?t+v:t-v
    },0)

    setD({
      ivaVentas:ivaV, ivaCompras:ivaC, ivaSaldo:ivaV-ivaC,
      facEmitidas:(feRes.data||[]).reduce((t:number,r:any)=>t+(r.total||0),0),
      facRecibidas:(frRes.data||[]).reduce((t:number,r:any)=>t+(r.total||0),0),
      gastosFixosMes:gfMes, margenAnio:margen,
      cuentasCLP:(cp as any[]).filter((c:any)=>c.moneda==='CLP').reduce((t:number,c:any)=>t+(c.saldo_actual||0),0),
      cuentasUSD:(cp as any[]).filter((c:any)=>c.moneda==='USD').reduce((t:number,c:any)=>t+(c.saldo_actual||0),0),
      cuentasARS:(cp as any[]).filter((c:any)=>c.moneda==='ARS').reduce((t:number,c:any)=>t+(c.saldo_actual||0),0),
      custodiaUSD:custUSD,
      opsAbiertas:opRes.data?.length||0,
    })
    setLoading(false)
  }

  if (loading) return <div className="p-12 text-center text-gray-400">Cargando...</div>

  const ivaNegativo = d.ivaSaldo < 0

  if (permListos && !puede(permisos, 'dashboard_financiero', 'ver')) {
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
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dashboard financiero</h1>
          <p className="text-xs text-gray-400 mt-0.5">Puerto NOA SpA · {MESES[mes]} {anio} · TC USD/CLP {tc.usd.toLocaleString('es-CL')}</p>
        </div>
        <div className="flex gap-2">
          {[
            { label:'Libro IVA', href:'/contabilidad/iva' },
            { label:'Gastos', href:'/contabilidad/gastos' },
            { label:'Resultados', href:'/contabilidad/resultados' },
          ].map(l => (
            <Link key={l.href} href={l.href} className="px-3 py-1.5 border border-gray-200 rounded-xl text-xs text-gray-600 hover:border-[#1168F8] hover:text-[#1168F8] bg-white">
              {l.label}
            </Link>
          ))}
        </div>
      </div>

      {/* FILA 1 — IVA del mes */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Débito fiscal</div>
          <div className="text-xl font-bold font-mono text-orange-700">{fmtCLP(d.ivaVentas)}</div>
          <div className="text-[10px] text-gray-400 mt-1">IVA ventas {MESES[mes]}</div>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Crédito fiscal</div>
          <div className="text-xl font-bold font-mono text-green-700">{fmtCLP(d.ivaCompras)}</div>
          <div className="text-[10px] text-gray-400 mt-1">IVA compras {MESES[mes]}</div>
        </div>
        <div className={`border rounded-2xl p-4 shadow-sm ${ivaNegativo?'bg-green-50 border-green-100':'bg-red-50 border-red-100'}`}>
          <div className={`text-[10px] font-semibold uppercase mb-1 ${ivaNegativo?'text-green-700':'text-red-700'}`}>
            {ivaNegativo?'Remanente CF':'IVA a pagar SII'}
          </div>
          <div className={`text-xl font-bold font-mono ${ivaNegativo?'text-green-800':'text-red-800'}`}>{fmtCLP(Math.abs(d.ivaSaldo))}</div>
          <div className={`text-[10px] mt-1 ${ivaNegativo?'text-green-600':'text-red-600'}`}>F29 línea 48</div>
        </div>
      </div>

      {/* FILA 2 — Facturación + Resultado */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Fact. emitidas {anio}</div>
          <div className="text-lg font-bold font-mono text-[#052698]">{fmtUSD(d.facEmitidas)}</div>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Fact. recibidas {anio}</div>
          <div className="text-lg font-bold font-mono text-red-700">{fmtUSD(d.facRecibidas)}</div>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Margen bruto {anio}</div>
          <div className="text-lg font-bold font-mono text-gray-900">{fmtUSD(d.margenAnio)}</div>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Gastos fijos {MESES[mes]}</div>
          <div className="text-lg font-bold font-mono text-orange-700">{fmtCLP(d.gastosFixosMes)}</div>
        </div>
      </div>

      {/* FILA 3 — Posición de cuentas */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <div className="text-[10px] font-semibold text-gray-400 uppercase mb-3">Cuentas propias Puerto NOA</div>
          <div className="space-y-2">
            {[
              { flag:'🇨🇱', label:'CLP', val:fmtCLP(d.cuentasCLP) },
              { flag:'💵', label:'USD', val:fmtUSD(d.cuentasUSD) },
              { flag:'🇦🇷', label:'ARS', val:`AR$ ${d.cuentasARS.toLocaleString('es-CL',{maximumFractionDigits:0})}` },
            ].map(r => (
              <div key={r.label} className="flex justify-between items-center py-1 border-b border-gray-50 last:border-0">
                <span className="text-xs text-gray-600">{r.flag} {r.label}</span>
                <span className="font-mono text-xs font-bold text-gray-900">{r.val}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 shadow-sm">
          <div className="text-[10px] font-semibold text-blue-600 uppercase mb-3">Fondos en custodia (clientes)</div>
          <div className="text-2xl font-bold font-mono text-blue-800 mb-1">{fmtUSD(d.custodiaUSD)}</div>
          <div className="text-[10px] text-blue-500">Total administrado para clientes</div>
          <Link href="/fondos" className="mt-3 inline-block text-[10px] text-blue-600 hover:underline">Ver detalle →</Link>
        </div>
      </div>
    </div>
  )
}
