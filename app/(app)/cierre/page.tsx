'use client'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase'
import { fmt, ETAPAS_L, ETAPAS_ORD, nowDate, nowStr } from '@/lib/utils'
import type { Cotizacion, Operacion } from '@/types'
import { cargarPermisos, puede } from '@/lib/permisos'

type Tab4 = 'resultado' | 'comparativo' | 'rendicion' | 'interno' | 'cierre'

// ── Tipos locales (modelo nuevo: facturas recibidas + fondos) ──
interface FactRec {
  id: string; folio: string | null; fecha_emision: string; proveedor_razon_social: string
  etapa: string | null; moneda: string; total: number; total_usd: number | null; estado: string
  a_recuperar?: boolean; credito_fiscal?: number; iva_monto?: number; tc_referencia?: number | null
}
interface FondoMov {
  id: string; fecha: string; tipo: string; concepto: string
  moneda: string; monto: number; usd: number
}

const MOV_INGRESO = ['ingreso_cliente', 'cobro_diferencia']
const MOV_EGRESO = ['pago_proveedor', 'honorarios_puertonoa', 'devolucion_cliente']
function signoUsd(m: { tipo: string; usd: number }): number {
  if (m.tipo === 'transferencia') return 0
  if (MOV_INGRESO.includes(m.tipo)) return m.usd
  if (MOV_EGRESO.includes(m.tipo)) return -m.usd
  if (m.tipo === 'ajuste_cambio') return m.usd
  return -m.usd
}
const fFecha = (d: string | null) => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—'
const uDe = (f: FactRec) => f.total_usd ?? 0

const PASOS = [
  'Todas las facturas registradas y pagadas',
  'Comparativo presup. vs. real revisado',
  'Caja a rendir cuadrada',
  'Rendición presentada al cliente',
  'Saldo final liquidado',
]

export default function CierrePage() {
  const [ops, setOps] = useState<Array<Operacion & { cotizacion: Cotizacion }>>([])
  const [selId, setSelId] = useState('')
  const [facturas, setFacturas] = useState<FactRec[]>([])
  const [emitidas, setEmitidas] = useState<any[]>([])
  const [tcVal, setTcVal] = useState(910)
  const [movs, setMovs] = useState<FondoMov[]>([])
  const [tab, setTab] = useState<Tab4>('resultado')
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const [permisos, setPermisos] = useState<Record<string, string[]>>({})
  const [permListos, setPermListos] = useState(false)
  useEffect(() => { cargarPermisos().then(p => { setPermisos(p); setPermListos(true) }) }, [])

  useEffect(() => { loadOps() }, [])
  useEffect(() => { if (selId) loadDetail() }, [selId])

  async function loadOps() {
    const { data } = await supabase.from('operaciones').select('*, cotizacion:cotizaciones(*)').order('created_at', { ascending: false })
    if (data?.length) { setOps(data as any); setSelId(prev => prev || (data[0] as any).id) }
    setLoading(false)
  }

  async function loadDetail() {
    const [fr, mv, fe, tc] = await Promise.all([
      supabase.from('facturas_recibidas')
        .select('id,folio,fecha_emision,proveedor_razon_social,etapa,moneda,total,total_usd,estado,a_recuperar,credito_fiscal,iva_monto,tc_referencia')
        .eq('operacion_id', selId).order('fecha_emision'),
      supabase.from('fondos_movimientos')
        .select('id,fecha,tipo,concepto,moneda,monto,usd')
        .eq('operacion_id', selId).order('fecha'),
      supabase.from('facturas_emitidas')
        .select('id,total_usd,neto_usd,iva_monto,tc_referencia,a_recuperar,estado')
        .eq('operacion_id', selId),
      supabase.from('tipos_cambio_eventos').select('clp').order('created_at', { ascending: false }).limit(1),
    ])
    setFacturas((fr.data as any[])?.filter(f => f.estado !== 'anulada') || [])
    setMovs((mv.data as any[]) || [])
    setEmitidas((fe.data as any[])?.filter(f => f.estado !== 'anulada') || [])
    const tcv = (tc.data?.[0] as any)?.clp
    if (tcv) setTcVal(tcv)
  }

  const op = ops.find(o => o.id === selId)
  const cot = op?.cotizacion
  const presup = Array.isArray(cot?.presupuesto) ? cot!.presupuesto : []

  const totalPresup = presup.reduce((s: number, i: any) => s + (i.usd || 0), 0)
  const feePresup = presup.find((i: any) => i.etapa === 'fee')?.usd || 0
  const presupTerceros = totalPresup - feePresup

  const gastoReal = facturas.reduce((s, f) => s + uDe(f), 0)               // facturas de terceros
  const feeReal = movs.filter(m => m.tipo === 'honorarios_puertonoa').reduce((s, m) => s + m.usd, 0)
  const totalIng = movs.filter(m => MOV_INGRESO.includes(m.tipo)).reduce((s, m) => s + m.usd, 0)
  const pagosProv = movs.filter(m => m.tipo === 'pago_proveedor').reduce((s, m) => s + m.usd, 0)
  const devol = movs.filter(m => m.tipo === 'devolucion_cliente').reduce((s, m) => s + m.usd, 0)
  const saldo = movs.reduce((s, m) => s + signoUsd(m), 0)                  // saldo caja a rendir
  const diff = gastoReal - presupTerceros
  const resOp = feeReal                                                    // resultado de PN (gestión): fee cobrado
  const fPend = facturas.filter(f => f.estado !== 'pagada').length
  const totalRealComp = gastoReal + feeReal
  const diffTotal = totalRealComp - totalPresup
  const pasos = Array.isArray(op?.pasos) ? op!.pasos : [false, false, false, false, false]

  const realPorEtapa = (e: string) => e === 'fee' ? feeReal : facturas.filter(f => (f.etapa || 'otro') === e).reduce((s, f) => s + uDe(f), 0)

  // ── Margen bruto canónico (misma definición que computarOpsData en Resultados) ──
  const ingresosUSD = emitidas.reduce((t, f) => t + (f.total_usd || (f.neto_usd * 1.19) || 0), 0)
  const costosProvUSD = facturas.reduce((t, f) => t + (f.total_usd || 0), 0)
  const ivaDebito = emitidas.reduce((t, f) => t + (f.iva_monto || 0) / (f.tc_referencia || tcVal), 0)
  const ivaCredito = facturas.filter(f => f.credito_fiscal).reduce((t, f) => t + ((f.iva_monto || 0) / (f.tc_referencia || tcVal)), 0)
  const cobradoRecupero = emitidas.filter(f => f.a_recuperar).reduce((t, f) => t + (f.total_usd || 0), 0)
  const pagadoRecupero = facturas.filter(f => f.a_recuperar).reduce((t, f) => t + (f.total_usd || 0), 0)
  const markupUSD = cobradoRecupero - pagadoRecupero
  const ivaNeto = Math.max(0, ivaDebito - ivaCredito)
  const margenBrutoUSD = feePresup + markupUSD - ivaNeto

  async function togglePaso(i: number) {
    if (!op) return
    const newPasos = [...pasos]; newPasos[i] = !newPasos[i]
    await (supabase.from('operaciones') as any).update({ pasos: newPasos, updated_at: new Date().toISOString() }).eq('id', op.id)
    loadOps()
  }

  async function cerrarOp() {
    if (!op) return
    if (!confirm(`¿Cerrar la operación ${cot?.num}? Esta acción quedará registrada.`)) return
    const snap = { fecha: nowStr(), accion: `Operación cerrada. Saldo caja a rendir: USD ${fmt(saldo)} · Fee PN: USD ${fmt(feeReal)}`, saldo_caja_usd: saldo, fee_usd: feeReal, gasto_real_usd: gastoReal }
    const histNuevo = [...(Array.isArray(op.hist_cierre) ? op.hist_cierre : []), snap]
    await (supabase.from('operaciones') as any).update({ estado: 'cerrada', fecha_cierre: nowDate(), hist_cierre: histNuevo, updated_at: new Date().toISOString() }).eq('id', op.id)
    // Persistir el resultado de la operación: fuente única para el dashboard contable (margen) y antecedentes históricos.
    await (supabase.from('utilidad_operacion') as any).delete().eq('operacion_id', op.id)
    await (supabase.from('utilidad_operacion') as any).insert({
      operacion_id: op.id,
      cotizacion_num: cot?.num || null,
      cliente_nombre: cot?.cliente || null,
      fecha_apertura: (op as any).created_at ? String((op as any).created_at).slice(0, 10) : null,
      fecha_cierre: nowDate(),
      ingresos_usd: Math.round(ingresosUSD * 100) / 100,
      costos_proveedor_usd: Math.round(costosProvUSD * 100) / 100,
      fee_usd: Math.round(feePresup * 100) / 100,
      margen_bruto_usd: Math.round(margenBrutoUSD * 100) / 100,
      margen_pct: ingresosUSD > 0 ? Math.round((margenBrutoUSD / ingresosUSD) * 1000) / 10 : null,
      resultado_neto_usd: Math.round(margenBrutoUSD * 100) / 100,
      tipo_cambio_usd: tcVal,
      estado: 'cerrada',
    })
    loadOps()
  }

  async function reabrirOp() {
    if (!op) return
    const histNuevo = [...(Array.isArray(op.hist_cierre) ? op.hist_cierre : []), { fecha: nowStr(), accion: 'Operación reabierta.' }]
    await (supabase.from('operaciones') as any).update({ estado: 'activa', fecha_cierre: null, hist_cierre: histNuevo, updated_at: new Date().toISOString() }).eq('id', op.id)
    await (supabase.from('utilidad_operacion') as any).delete().eq('operacion_id', op.id)
    loadOps()
  }

  if (loading) return <div className="p-8 text-gray-400 text-sm">Cargando...</div>
  if (!ops.length) return <div className="p-8 text-center text-gray-400 text-sm">No hay operaciones disponibles.</div>

  const TABS: { key: Tab4; label: string }[] = [
    { key: 'resultado', label: 'Resultado' },
    { key: 'comparativo', label: 'Comparativo final' },
    { key: 'rendicion', label: 'Rendición cliente' },
    { key: 'interno', label: 'Liquidación interna' },
    { key: 'cierre', label: 'Cierre' },
  ]

  if (permListos && !puede(permisos, 'cierre', 'ver')) {
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
    <div className="p-6">
      <div className="mb-5 flex items-center gap-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Liquidación y cierre</h1>
          <p className="text-xs text-gray-400 mt-0.5">Rendición y cierre formal de la operación</p>
        </div>
        <select value={selId} onChange={e => setSelId(e.target.value)} className="ml-auto px-3 py-2 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:border-[#1168F8]">
          {ops.map(o => <option key={o.id} value={o.id}>{o.cotizacion?.num} — {o.cotizacion?.cliente}</option>)}
        </select>
      </div>

      <div className="flex gap-2 mb-5 flex-wrap">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${tab === t.key ? 'bg-[#1168F8] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{t.label}</button>
        ))}
      </div>

      {tab === 'resultado' && (
        <div>
          <div className="grid grid-cols-3 gap-4 mb-5">
            <div className="bg-[#EBF2FF] border border-[#93B8FC] rounded-xl p-5"><div className="text-xs font-medium text-[#0a4fc4] mb-1">Resultado operativo PN</div><div className="text-2xl font-semibold text-[#052698]">USD {fmt(resOp, 0)}</div><div className="text-[10px] text-[#0a4fc4] mt-1">Fee / honorarios cobrados</div></div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5"><div className="text-xs font-medium text-blue-700 mb-1">Gasto real (terceros)</div><div className="text-2xl font-semibold text-blue-800">USD {fmt(gastoReal, 0)}</div><div className="text-[10px] text-blue-600 mt-1">Presup.: USD {fmt(presupTerceros, 0)}</div></div>
            <div className={`border rounded-xl p-5 ${Math.abs(saldo) < 0.01 ? 'bg-gray-50 border-gray-200' : saldo > 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}><div className={`text-xs font-medium mb-1 ${saldo >= 0 ? 'text-green-700' : 'text-red-700'}`}>Saldo caja a rendir</div><div className={`text-2xl font-semibold ${saldo >= 0 ? 'text-green-800' : 'text-red-700'}`}>USD {fmt(saldo, 0)}</div><div className={`text-[10px] mt-1 ${saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>{Math.abs(saldo) < 0.01 ? 'En cero · lista para cerrar' : saldo > 0 ? 'A devolver al cliente' : 'A cobrar al cliente'}</div></div>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-5">
            <h3 className="font-medium text-sm text-gray-900 mb-4">Flujo de la caja a rendir</h3>
            <div className="space-y-2">
              {[
                { lbl: 'Fondos recibidos del cliente', v: totalIng, color: 'text-green-700', bg: 'bg-green-50', sign: '+' },
                { lbl: 'Pagos a proveedores', v: -pagosProv, color: 'text-red-600', bg: 'bg-red-50', sign: '−' },
                { lbl: 'Honorarios Puerto NOA', v: -feeReal, color: 'text-blue-700', bg: 'bg-blue-50', sign: '−' },
                { lbl: 'Devoluciones al cliente', v: -devol, color: 'text-amber-700', bg: 'bg-amber-50', sign: '−' },
              ].map(r => (
                <div key={r.lbl} className={`flex items-center gap-3 px-4 py-2.5 rounded-lg ${r.bg} text-xs`}>
                  <span className={`font-bold w-4 ${r.color}`}>{r.sign}</span>
                  <span className="flex-1 text-gray-700">{r.lbl}</span>
                  <span className={`font-mono font-medium ${r.color}`}>USD {fmt(Math.abs(r.v))}</span>
                </div>
              ))}
              <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-[#052698] text-xs text-white font-medium">
                <span className="w-4 font-bold">=</span>
                <span className="flex-1">Saldo caja a rendir</span>
                <span className="font-mono">USD {fmt(saldo)}</span>
              </div>
            </div>
            <div className="mt-4">
              {Math.abs(saldo) < 0.01 ? <p className="text-xs bg-gray-50 text-gray-600 px-3 py-2 rounded-lg">✓ La caja a rendir está en cero. Lista para cerrar.</p> :
                saldo > 0 ? <p className="text-xs bg-green-50 text-green-700 px-3 py-2 rounded-lg">Saldo de USD {fmt(saldo)} a devolver al cliente. Registrá la devolución en Tesorería antes de cerrar.</p> :
                  <p className="text-xs bg-red-50 text-red-700 px-3 py-2 rounded-lg">⚠ Faltan USD {fmt(Math.abs(saldo))} en la caja. Cobrá la diferencia al cliente en Tesorería antes de cerrar.</p>}
            </div>
          </div>
        </div>
      )}

      {tab === 'comparativo' && (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100"><span className="font-medium text-sm text-gray-900">Comparativo final — Presupuestado vs. Ejecutado</span></div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="bg-gray-50 border-b border-gray-100"><th className="text-left px-4 py-2.5 text-[10px] text-gray-400 font-medium uppercase tracking-wide">Concepto</th><th className="text-right px-4 py-2.5 text-[10px] text-gray-400 font-medium uppercase tracking-wide">Presupuestado</th><th className="text-right px-4 py-2.5 text-[10px] text-gray-400 font-medium uppercase tracking-wide">Ejecutado</th><th className="text-right px-4 py-2.5 text-[10px] text-gray-400 font-medium uppercase tracking-wide">Diferencia</th><th className="px-4 py-2.5 text-[10px] text-gray-400 font-medium uppercase tracking-wide">%</th></tr></thead>
              <tbody>
                {ETAPAS_ORD.map(e => {
                  const p = presup.filter((i: any) => i.etapa === e).reduce((s: number, i: any) => s + (i.usd || 0), 0)
                  const r = realPorEtapa(e)
                  if (!p && !r) return null
                  const d = r - p
                  return (
                    <tr key={e} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">{ETAPAS_L[e] || e}</td>
                      <td className="px-4 py-3 font-mono text-right">USD {fmt(p)}</td>
                      <td className="px-4 py-3 font-mono text-right">USD {fmt(r)}</td>
                      <td className={`px-4 py-3 font-mono text-right font-medium ${d > 0 ? 'text-red-600' : d < 0 ? 'text-green-700' : 'text-gray-400'}`}>{d !== 0 ? `${d > 0 ? '+ ' : ''}USD ${fmt(d)}` : '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{p ? `${fmt(r / p * 100, 0)}%` : 'nuevo'}</td>
                    </tr>
                  )
                })}
                <tr className="bg-gray-50 font-semibold border-t-2 border-gray-200">
                  <td className="px-4 py-3 text-sm">TOTAL</td>
                  <td className="px-4 py-3 font-mono text-right">USD {fmt(totalPresup)}</td>
                  <td className="px-4 py-3 font-mono text-right">USD {fmt(totalRealComp)}</td>
                  <td className={`px-4 py-3 font-mono text-right ${diffTotal > 0 ? 'text-red-600' : diffTotal < 0 ? 'text-green-700' : 'text-gray-400'}`}>{diffTotal !== 0 ? `${diffTotal > 0 ? '+ ' : ''}USD ${fmt(diffTotal)}` : '—'}</td>
                  <td className="px-4 py-3 text-sm">{totalPresup ? `${fmt(totalRealComp / totalPresup * 100, 1)}%` : '—'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'rendicion' && cot && (
        <div>
          <style>{`
            @media print {
              body * { visibility: hidden; }
              #rend-print, #rend-print * { visibility: visible; }
              #rend-print { position: absolute; left: 0; top: 0; width: 100%; }
              .no-print { display: none !important; }
              @page { margin: 10mm 12mm; size: A4 portrait; }
              #rend-print { font-size: 10px !important; }
              #rend-print .text-sm { font-size: 11px !important; }
              #rend-print .text-xs { font-size: 10px !important; }
              #rend-print .text-lg { font-size: 13px !important; }
              #rend-print .p-5 { padding: 5px !important; }
              #rend-print .p-4 { padding: 4px !important; }
              #rend-print .p-2 { padding: 2px !important; }
              #rend-print .px-5 { padding-left: 5px !important; padding-right: 5px !important; }
              #rend-print .mb-4 { margin-bottom: 4px !important; }
              #rend-print .mb-5 { margin-bottom: 5px !important; }
              #rend-print .gap-4 { gap: 4px !important; }
              #rend-print img { max-height: 28px !important; }
              #rend-print .mt-8 { margin-top: 8px !important; }
            }
          `}</style>

          <div className="no-print flex justify-end mb-3">
            <button onClick={() => {
            const t = document.title
            document.title = `Rendicion_${cot?.num}_${cot?.cliente?.replace(/\s+/g,'-')}`
            window.print()
            document.title = t
          }} className="flex items-center gap-1.5 px-4 py-2 border-2 border-[#1168F8] text-[#1168F8] rounded-lg text-xs font-semibold hover:bg-[#EBF2FF] transition-colors">🖨 Imprimir / PDF</button>
          </div>

          <div id="rend-print" className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex items-start justify-between px-6 py-5 border-b-2 border-[#1168F8]">
              <div>
                <Image src="/logo.png" alt="Puerto NOA SpA" width={150} height={44} style={{objectFit:'contain'}} />
                <div className="text-[10px] text-gray-400 mt-1.5 leading-relaxed">
                  Puerto NOA SpA — Servicios logísticos China → NOA Argentino<br/>
                  San Salvador de Jujuy, Argentina
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Rendición de cuentas</div>
                <div className="text-xl font-bold font-mono text-[#052698]">{cot.num}</div>
                <div className="text-xs text-gray-500 mt-1">{nowDate()}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 px-6 py-4 bg-[#EBF2FF] border-b border-[#93B8FC]">
              <div>
                <div className="text-[9px] text-[#052698] uppercase tracking-wider font-bold mb-1">Cliente</div>
                <div className="font-semibold text-sm text-[#052698]">{cot.cliente}</div>
                {cot.cuit && <div className="text-xs text-gray-500 mt-0.5">CUIT: {cot.cuit}</div>}
              </div>
              <div>
                <div className="text-[9px] text-[#052698] uppercase tracking-wider font-bold mb-1">Operación</div>
                <div className="text-xs text-gray-700">{cot.origen} → {cot.destino_noa}</div>
                <div className="text-xs text-gray-500 mt-0.5">{Array.isArray(cot.tipo_contenedores) ? cot.tipo_contenedores.map((x: any) => `${x.cantidad}× ${x.tipo}`).join(', ') : '—'}</div>
              </div>
            </div>

            <div className="px-6 py-4">
              <div className="mb-4">
                <div className="text-[10px] font-bold text-green-700 uppercase tracking-wider mb-2 pb-1 border-b border-green-200">Fondos recibidos del cliente</div>
                <table className="w-full text-xs">
                  <thead><tr className="bg-green-50"><th className="text-left p-2 text-green-800 font-semibold">Fecha</th><th className="text-left p-2 text-green-800 font-semibold">Concepto</th><th className="text-left p-2 text-green-800 font-semibold">Moneda</th><th className="text-right p-2 text-green-800 font-semibold">USD</th></tr></thead>
                  <tbody>
                    {movs.filter(m => MOV_INGRESO.includes(m.tipo)).map(m => (
                      <tr key={m.id} className="border-b border-gray-100">
                        <td className="p-2 font-mono text-[10px] text-gray-500">{fFecha(m.fecha)}</td>
                        <td className="p-2 text-gray-700">{m.concepto}</td>
                        <td className="p-2 text-gray-500">{m.moneda !== 'USD' ? `${m.moneda} ${fmt(m.monto)}` : 'USD'}</td>
                        <td className="p-2 text-right font-mono font-medium">USD {fmt(m.usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex justify-between px-2 py-2 bg-green-50 rounded text-xs font-semibold text-green-800 mt-1">
                  <span>Total fondos recibidos</span><span className="font-mono">USD {fmt(totalIng)}</span>
                </div>
              </div>

              <div className="mb-4">
                <div className="text-[10px] font-bold text-[#052698] uppercase tracking-wider mb-2 pb-1 border-b border-[#93B8FC]">Facturas pagadas en la operación</div>
                <table className="w-full text-xs">
                  <thead><tr className="bg-[#EBF2FF]"><th className="text-left p-2 text-[#052698] font-semibold">Fecha</th><th className="text-left p-2 text-[#052698] font-semibold">Proveedor</th><th className="text-left p-2 text-[#052698] font-semibold">Etapa</th><th className="text-right p-2 text-[#052698] font-semibold">USD</th></tr></thead>
                  <tbody>
                    {facturas.map(f => (
                      <tr key={f.id} className="border-b border-gray-100">
                        <td className="p-2 font-mono text-[10px] text-gray-500">{fFecha(f.fecha_emision)}</td>
                        <td className="p-2 text-gray-700">{f.proveedor_razon_social}</td>
                        <td className="p-2 text-gray-500">{f.etapa ? (ETAPAS_L[f.etapa] || f.etapa) : '—'}</td>
                        <td className="p-2 text-right font-mono font-medium">USD {fmt(uDe(f))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex justify-between px-2 py-2 bg-[#EBF2FF] rounded text-xs font-semibold text-[#052698] mt-1">
                  <span>Total facturas de terceros</span><span className="font-mono">USD {fmt(gastoReal)}</span>
                </div>
                {feeReal > 0 && (
                  <div className="flex justify-between px-2 py-2 bg-blue-50 rounded text-xs font-semibold text-blue-800 mt-1">
                    <span>Honorarios Puerto NOA</span><span className="font-mono">USD {fmt(feeReal)}</span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                {diff !== 0 && (
                  <div className={`flex justify-between px-3 py-2 rounded text-xs font-medium ${diff > 0 ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                    <span>{diff > 0 ? '⚠ El gasto de terceros superó lo presupuestado' : '✓ Ahorro respecto a lo presupuestado'}</span>
                    <span className="font-mono">{diff > 0 ? '+ ' : ''}USD {fmt(Math.abs(diff))}</span>
                  </div>
                )}
                <div className={`flex justify-between px-4 py-3.5 rounded-lg text-sm font-bold ${Math.abs(saldo) < 0.01 ? 'bg-gray-700 text-white' : saldo > 0 ? 'bg-[#052698] text-white' : 'bg-red-600 text-white'}`}>
                  <span>{Math.abs(saldo) < 0.01 ? 'CUENTA CERRADA SIN SALDO' : saldo > 0 ? 'SALDO A DEVOLVER AL CLIENTE' : 'SALDO A COBRAR AL CLIENTE'}</span>
                  <span className="font-mono">USD {fmt(Math.abs(saldo))}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-12 mt-8 pt-4 border-t border-gray-200 text-[10px] text-gray-400">
                <div className="text-center"><div className="border-t border-gray-400 pt-2 mt-8">Firma y sello Puerto NOA SpA</div></div>
                <div className="text-center"><div className="border-t border-gray-400 pt-2 mt-8">Conformidad del cliente — {cot.cliente}</div></div>
              </div>
            </div>

            <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100 bg-gray-50">
              <div className="text-[9px] text-gray-400">Puerto NOA SpA · Importaciones China → NOA Argentino · San Salvador de Jujuy</div>
              <Image src="/logo.png" alt="Puerto NOA" width={70} height={20} style={{objectFit:'contain',opacity:0.5}} />
            </div>
          </div>
        </div>
      )}

      {tab === 'interno' && cot && (
        <div>
          <div className="text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4 text-amber-700">🔒 Documento de uso interno exclusivo. No compartir con el cliente.</div>
          <div className="bg-white border border-gray-100 rounded-xl p-6">
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-[#EBF2FF] rounded-xl p-4"><div className="text-[10px] font-medium text-[#0a4fc4] mb-1">Fee cobrado</div><div className="text-xl font-semibold text-[#052698]">USD {fmt(feeReal)}</div><div className="text-[10px] text-[#0a4fc4]">Presup.: USD {fmt(feePresup)}</div></div>
              <div className="bg-blue-50 rounded-xl p-4"><div className="text-[10px] font-medium text-blue-700 mb-1">Resultado operativo</div><div className={`text-xl font-semibold ${resOp >= 0 ? 'text-blue-800' : 'text-red-700'}`}>USD {fmt(resOp)}</div><div className="text-[10px] text-blue-600">{resOp >= 0 ? 'Ganancia neta' : 'Pérdida neta'}</div></div>
              <div className={`rounded-xl p-4 ${saldo >= 0 ? 'bg-green-50' : 'bg-red-50'}`}><div className={`text-[10px] font-medium mb-1 ${saldo >= 0 ? 'text-green-700' : 'text-red-700'}`}>Saldo caja a rendir</div><div className={`text-xl font-semibold ${saldo >= 0 ? 'text-green-800' : 'text-red-700'}`}>USD {fmt(saldo)}</div><div className={`text-[10px] ${saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>{Math.abs(saldo) < 0.01 ? 'En cero' : saldo > 0 ? 'A devolver' : 'A cobrar'}</div></div>
            </div>
            <table className="w-full text-xs mb-4">
              <thead><tr className="bg-gray-50 border-b border-gray-100"><th className="text-left px-4 py-2.5 text-[10px] text-gray-400 font-medium uppercase">Etapa</th><th className="text-right px-4 py-2.5 text-[10px] text-gray-400 font-medium uppercase">Presupuestado</th><th className="text-right px-4 py-2.5 text-[10px] text-gray-400 font-medium uppercase">Real</th><th className="text-right px-4 py-2.5 text-[10px] text-gray-400 font-medium uppercase">Diferencia</th></tr></thead>
              <tbody>
                {ETAPAS_ORD.map(e => {
                  const p = presup.filter((i: any) => i.etapa === e).reduce((s: number, i: any) => s + (i.usd || 0), 0)
                  const r = realPorEtapa(e)
                  if (!p && !r) return null
                  const d = r - p
                  return <tr key={e} className="border-b border-gray-50"><td className="px-4 py-2.5 text-gray-700">{ETAPAS_L[e] || e}</td><td className="px-4 py-2.5 font-mono text-right">USD {fmt(p)}</td><td className="px-4 py-2.5 font-mono text-right">USD {fmt(r)}</td><td className={`px-4 py-2.5 font-mono text-right ${d > 0 ? 'text-red-600' : d < 0 ? 'text-green-700' : 'text-gray-400'}`}>{d !== 0 ? `${d > 0 ? '+ ' : ''}USD ${fmt(d)}` : '—'}</td></tr>
                })}
              </tbody>
            </table>
            <div className="text-[10px] text-gray-400 border-t border-gray-100 pt-3 flex justify-between">
              <span>Puerto NOA SpA — Liquidación interna · Confidencial</span>
              <span>{cot.num} · {nowDate()}</span>
            </div>
          </div>
        </div>
      )}

      {tab === 'cierre' && op && (
        <div>
          <div className="bg-white border border-gray-100 rounded-xl p-5 mb-4">
            <h3 className="font-medium text-sm text-gray-900 mb-1">Checklist de cierre</h3>
            <p className="text-xs text-gray-400 mb-4">Verificá cada paso antes de cerrar la operación. El cierre queda registrado con fecha y hora.</p>
            <div className="space-y-2 mb-5">
              {PASOS.map((p, i) => {
                const autoCheck = i === 0 ? fPend === 0 : i === 2 ? Math.abs(saldo) < 0.01 : false
                const done = autoCheck || pasos[i]
                return (
                  <div key={i} onClick={() => !autoCheck && togglePaso(i)} className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${autoCheck ? '' : 'cursor-pointer'} ${done ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${done ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-600'}`}>{done ? '✓' : i + 1}</div>
                    <div className="flex-1">
                      <div className="text-xs font-medium text-gray-800">{p}</div>
                      {i === 0 && fPend > 0 && <div className="text-[10px] text-red-600 mt-0.5">{fPend} factura(s) pendiente(s) de pago</div>}
                      {i === 2 && <div className={`text-[10px] mt-0.5 ${Math.abs(saldo) < 0.01 ? 'text-green-600' : saldo > 0 ? 'text-green-600' : 'text-red-600'}`}>{Math.abs(saldo) < 0.01 ? 'Caja en cero' : saldo > 0 ? `USD ${fmt(saldo)} a devolver` : `USD ${fmt(Math.abs(saldo))} a cobrar`}</div>}
                    </div>
                    <div className={`text-[10px] font-medium ${done ? 'text-green-700' : 'text-gray-400'}`}>{done ? '✓ Completado' : 'Pendiente'}</div>
                  </div>
                )
              })}
            </div>
            <div className="flex gap-3 justify-end">
              {op.estado === 'cerrada' ? (
                <button onClick={reabrirOp} className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 rounded-lg text-xs hover:bg-gray-50 transition-colors">🔓 Reabrir operación</button>
              ) : (
                <button onClick={cerrarOp} className="flex items-center gap-1.5 px-4 py-2 bg-[#1168F8] text-white rounded-lg text-xs font-medium hover:bg-[#0a4fc4] transition-colors">✓ Cerrar operación</button>
              )}
            </div>
          </div>

          {op.estado === 'cerrada' && (
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-xs text-green-700 mb-4">
              ✓ Operación cerrada el {fFecha((op as any).fecha_cierre)}.
            </div>
          )}

          {Array.isArray(op.hist_cierre) && op.hist_cierre.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-100"><span className="font-medium text-sm text-gray-900">Historial de cierre</span></div>
              <div className="divide-y divide-gray-50">
                {(op.hist_cierre as any[]).map((h, i) => (
                  <div key={i} className="flex gap-3 px-5 py-3 text-xs">
                    <span className="font-mono text-[10px] text-gray-400 w-36 flex-shrink-0">{h.fecha}</span>
                    <span className="text-gray-700">{h.accion}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
