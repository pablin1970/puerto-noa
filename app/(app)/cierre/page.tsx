'use client'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase'
import { fmt, ETAPAS_L, ETAPAS_ORD, nowDate, nowStr } from '@/lib/utils'
import type { Cotizacion, Operacion, Gasto, MovimientoCC } from '@/types'

type Tab4 = 'resultado' | 'comparativo' | 'rendicion' | 'interno' | 'cierre'

const PASOS = [
  'Todos los gastos registrados y pagados',
  'Comparativo presup. vs. real revisado',
  'Cuenta corriente cuadrada',
  'Rendición presentada al cliente',
  'Saldo final liquidado',
]

export default function CierrePage() {
  const [ops, setOps] = useState<Array<Operacion & { cotizacion: Cotizacion }>>([])
  const [selId, setSelId] = useState('')
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [movs, setMovs] = useState<MovimientoCC[]>([])
  const [tab, setTab] = useState<Tab4>('resultado')
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => { loadOps() }, [])
  useEffect(() => { if (selId) loadDetail() }, [selId])

  async function loadOps() {
    const { data } = await supabase.from('operaciones').select('*, cotizacion:cotizaciones(*)').order('created_at', { ascending: false })
    if (data?.length) { setOps(data as any); setSelId((data[0] as any).id) }
    setLoading(false)
  }

  async function loadDetail() {
    const [g, m] = await Promise.all([
      supabase.from('gastos').select('*').eq('operacion_id', selId).order('fecha'),
      supabase.from('movimientos_cc').select('*').eq('operacion_id', selId).order('fecha'),
    ])
    if (g.data) setGastos(g.data as Gasto[])
    if (m.data) setMovs(m.data as MovimientoCC[])
  }

  const op = ops.find(o => o.id === selId)
  const cot = op?.cotizacion
  const presup = Array.isArray(cot?.presupuesto) ? cot!.presupuesto : []
  const totalPresup = presup.reduce((s: number, i: any) => s + i.usd, 0)
  const totalReal = gastos.reduce((s, g) => s + g.usd, 0)
  const feeReal = gastos.filter(g => g.etapa === 'fee').reduce((s, g) => s + g.usd, 0)
  const feePresup = presup.find((i: any) => i.etapa === 'fee')?.usd || 0
  const totalIng = movs.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.usd, 0)
  const totalEg = movs.filter(m => m.tipo === 'egreso').reduce((s, m) => s + m.usd, 0)
  const saldo = totalIng - totalEg
  const diff = totalReal - totalPresup
  const resOp = saldo - feeReal
  const gPend = gastos.filter(g => g.estado !== 'pagado').length
  const pasos = Array.isArray(op?.pasos) ? op!.pasos : [false, false, false, false, false]

  async function togglePaso(i: number) {
    if (!op) return
    const newPasos = [...pasos]
    newPasos[i] = !newPasos[i]
    await (supabase.from('operaciones') as any).update({ pasos: newPasos, updated_at: new Date().toISOString() }).eq('id', op.id)
    loadOps()
  }

  async function cerrarOp() {
    if (!op) return
    if (!confirm(`¿Cerrar la operación ${cot?.num}? Esta acción quedará registrada.`)) return
    const histNuevo = [...(Array.isArray(op.hist_cierre) ? op.hist_cierre : []), { fecha: nowStr(), accion: `Operación cerrada. Saldo final: USD ${fmt(saldo)}` }]
    await (supabase.from('operaciones') as any).update({ estado: 'cerrada', fecha_cierre: nowDate(), hist_cierre: histNuevo, updated_at: new Date().toISOString() }).eq('id', op.id)
    loadOps()
  }

  async function reabrirOp() {
    if (!op) return
    const histNuevo = [...(Array.isArray(op.hist_cierre) ? op.hist_cierre : []), { fecha: nowStr(), accion: 'Operación reabierta.' }]
    await (supabase.from('operaciones') as any).update({ estado: 'activa', fecha_cierre: null, hist_cierre: histNuevo, updated_at: new Date().toISOString() }).eq('id', op.id)
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

  return (
    <div className="p-6">
      <div className="mb-5 flex items-center gap-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Liquidación y cierre</h1>
          <p className="text-xs text-gray-400 mt-0.5">Módulo 4 — Rendición y cierre de operación</p>
        </div>
        <select value={selId} onChange={e => setSelId(e.target.value)} className="ml-auto px-3 py-2 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:border-[#1168F8]">
          {ops.map(o => <option key={o.id} value={o.id}>{o.cotizacion?.num} — {o.cotizacion?.cliente}</option>)}
        </select>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${tab === t.key ? 'bg-[#1168F8] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{t.label}</button>
        ))}
      </div>

      {tab === 'resultado' && (
        <div>
          <div className="grid grid-cols-3 gap-4 mb-5">
            <div className="bg-[#EBF2FF] border border-[#93B8FC] rounded-xl p-5"><div className="text-xs font-medium text-[#0a4fc4] mb-1">Resultado operativo</div><div className="text-2xl font-semibold text-[#052698]">USD {fmt(resOp, 0)}</div><div className="text-[10px] text-[#0a4fc4] mt-1">Fondos − gastos − fee</div></div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5"><div className="text-xs font-medium text-blue-700 mb-1">Fee Puerto NOA cobrado</div><div className="text-2xl font-semibold text-blue-800">USD {fmt(feeReal, 0)}</div><div className="text-[10px] text-blue-600 mt-1">Presup.: USD {fmt(feePresup, 0)}</div></div>
            <div className={`border rounded-xl p-5 ${saldo >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}><div className={`text-xs font-medium mb-1 ${saldo >= 0 ? 'text-green-700' : 'text-red-700'}`}>Saldo cuenta cliente</div><div className={`text-2xl font-semibold ${saldo >= 0 ? 'text-green-800' : 'text-red-700'}`}>USD {fmt(saldo, 0)}</div><div className={`text-[10px] mt-1 ${saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>{saldo > 0 ? 'A devolver al cliente' : saldo < 0 ? 'A cobrar al cliente' : 'Exacto'}</div></div>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-5">
            <h3 className="font-medium text-sm text-gray-900 mb-4">Flujo de la operación</h3>
            <div className="space-y-2">
              {[
                { lbl: 'Fondos recibidos del cliente', v: totalIng, color: 'text-green-700', bg: 'bg-green-50', sign: '+' },
                { lbl: 'Gastos reales sin fee', v: -(totalReal - feeReal), color: 'text-red-600', bg: 'bg-red-50', sign: '−' },
                { lbl: 'Fee Puerto NOA', v: -feeReal, color: 'text-blue-700', bg: 'bg-blue-50', sign: '−' },
              ].map(r => (
                <div key={r.lbl} className={`flex items-center gap-3 px-4 py-2.5 rounded-lg ${r.bg} text-xs`}>
                  <span className={`font-bold w-4 ${r.color}`}>{r.sign}</span>
                  <span className="flex-1 text-gray-700">{r.lbl}</span>
                  <span className={`font-mono font-medium ${r.color}`}>USD {fmt(Math.abs(r.v))}</span>
                </div>
              ))}
              <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-[#052698] text-xs text-white font-medium">
                <span className="w-4 font-bold">=</span>
                <span className="flex-1">Saldo neto cuenta cliente</span>
                <span className="font-mono">USD {fmt(saldo)}</span>
              </div>
            </div>
            <div className="mt-4">
              {saldo > 0 ? <p className="text-xs bg-green-50 text-green-700 px-3 py-2 rounded-lg">✓ Hay un saldo de USD {fmt(saldo)} a devolver al cliente.</p> :
                saldo < 0 ? <p className="text-xs bg-red-50 text-red-700 px-3 py-2 rounded-lg">⚠ Los gastos superaron los fondos. A cobrar al cliente: USD {fmt(Math.abs(saldo))}.</p> :
                  <p className="text-xs bg-green-50 text-green-700 px-3 py-2 rounded-lg">✓ La cuenta cierra exacta. Sin saldo pendiente.</p>}
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
                  const p = presup.filter((i: any) => i.etapa === e).reduce((s: number, i: any) => s + i.usd, 0)
                  const r = gastos.filter(g => g.etapa === e).reduce((s, g) => s + g.usd, 0)
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
                  <td className="px-4 py-3 font-mono text-right">USD {fmt(totalReal)}</td>
                  <td className={`px-4 py-3 font-mono text-right ${diff > 0 ? 'text-red-600' : diff < 0 ? 'text-green-700' : 'text-gray-400'}`}>{diff !== 0 ? `${diff > 0 ? '+ ' : ''}USD ${fmt(diff)}` : '—'}</td>
                  <td className="px-4 py-3 text-sm">{totalPresup ? `${fmt(totalReal / totalPresup * 100, 1)}%` : '—'}</td>
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
            {/* Encabezado */}
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

            {/* Cliente y operación */}
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
              {/* Fondos recibidos */}
              <div className="mb-4">
                <div className="text-[10px] font-bold text-green-700 uppercase tracking-wider mb-2 pb-1 border-b border-green-200">Fondos recibidos del cliente</div>
                <table className="w-full text-xs">
                  <thead><tr className="bg-green-50"><th className="text-left p-2 text-green-800 font-semibold">Fecha</th><th className="text-left p-2 text-green-800 font-semibold">Concepto</th><th className="text-left p-2 text-green-800 font-semibold">Moneda</th><th className="text-right p-2 text-green-800 font-semibold">USD</th></tr></thead>
                  <tbody>
                    {movs.filter(m => m.tipo === 'ingreso').map(m => (
                      <tr key={m.id} className="border-b border-gray-100">
                        <td className="p-2 font-mono text-[10px] text-gray-500">{m.fecha}</td>
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

              {/* Gastos realizados */}
              <div className="mb-4">
                <div className="text-[10px] font-bold text-[#052698] uppercase tracking-wider mb-2 pb-1 border-b border-[#93B8FC]">Gastos realizados en la operación</div>
                <table className="w-full text-xs">
                  <thead><tr className="bg-[#EBF2FF]"><th className="text-left p-2 text-[#052698] font-semibold">Fecha</th><th className="text-left p-2 text-[#052698] font-semibold">Concepto / Proveedor</th><th className="text-left p-2 text-[#052698] font-semibold">Moneda orig.</th><th className="text-right p-2 text-[#052698] font-semibold">USD</th></tr></thead>
                  <tbody>
                    {gastos.filter(g => g.etapa !== 'fee').map(g => (
                      <tr key={g.id} className="border-b border-gray-100">
                        <td className="p-2 font-mono text-[10px] text-gray-500">{g.fecha}</td>
                        <td className="p-2 text-gray-700">{g.concepto}</td>
                        <td className="p-2 text-gray-500">{g.moneda !== 'USD' ? `${g.moneda} ${fmt(g.monto)}` : '—'}</td>
                        <td className="p-2 text-right font-mono font-medium">USD {fmt(g.usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex justify-between px-2 py-2 bg-[#EBF2FF] rounded text-xs font-semibold text-[#052698] mt-1">
                  <span>Total gastos realizados</span><span className="font-mono">USD {fmt(gastos.filter(g=>g.etapa!=='fee').reduce((s,g)=>s+g.usd,0))}</span>
                </div>
              </div>

              {/* Resultado */}
              <div className="space-y-2">
                {diff !== 0 && (
                  <div className={`flex justify-between px-3 py-2 rounded text-xs font-medium ${diff > 0 ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                    <span>{diff > 0 ? '⚠ Los gastos superaron el presupuesto original' : '✓ Ahorro respecto al presupuesto original'}</span>
                    <span className="font-mono">{diff > 0 ? '+ ' : ''}USD {fmt(Math.abs(diff))}</span>
                  </div>
                )}
                <div className={`flex justify-between px-4 py-3.5 rounded-lg text-sm font-bold ${saldo > 0 ? 'bg-[#052698] text-white' : saldo < 0 ? 'bg-red-600 text-white' : 'bg-gray-700 text-white'}`}>
                  <span>{saldo > 0 ? 'SALDO A DEVOLVER AL CLIENTE' : saldo < 0 ? 'SALDO A COBRAR AL CLIENTE' : 'CUENTA CERRADA SIN SALDO'}</span>
                  <span className="font-mono">USD {fmt(Math.abs(saldo))}</span>
                </div>
              </div>

              {/* Firmas */}
              <div className="grid grid-cols-2 gap-12 mt-8 pt-4 border-t border-gray-200 text-[10px] text-gray-400">
                <div className="text-center"><div className="border-t border-gray-400 pt-2 mt-8">Firma y sello Puerto NOA SpA</div></div>
                <div className="text-center"><div className="border-t border-gray-400 pt-2 mt-8">Conformidad del cliente — {cot.cliente}</div></div>
              </div>
            </div>

            {/* Pie */}
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
              <div className={`rounded-xl p-4 ${saldo >= 0 ? 'bg-green-50' : 'bg-red-50'}`}><div className={`text-[10px] font-medium mb-1 ${saldo >= 0 ? 'text-green-700' : 'text-red-700'}`}>Saldo cliente</div><div className={`text-xl font-semibold ${saldo >= 0 ? 'text-green-800' : 'text-red-700'}`}>USD {fmt(saldo)}</div><div className={`text-[10px] ${saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>{saldo > 0 ? 'A devolver' : saldo < 0 ? 'A cobrar' : 'Exacto'}</div></div>
            </div>
            <table className="w-full text-xs mb-4">
              <thead><tr className="bg-gray-50 border-b border-gray-100"><th className="text-left px-4 py-2.5 text-[10px] text-gray-400 font-medium uppercase">Etapa</th><th className="text-right px-4 py-2.5 text-[10px] text-gray-400 font-medium uppercase">Presupuestado</th><th className="text-right px-4 py-2.5 text-[10px] text-gray-400 font-medium uppercase">Real</th><th className="text-right px-4 py-2.5 text-[10px] text-gray-400 font-medium uppercase">Diferencia</th></tr></thead>
              <tbody>
                {ETAPAS_ORD.map(e => {
                  const p = presup.filter((i: any) => i.etapa === e).reduce((s: number, i: any) => s + i.usd, 0)
                  const r = gastos.filter(g => g.etapa === e).reduce((s, g) => s + g.usd, 0)
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
                const autoCheck = i === 0 ? gPend === 0 : i < 3 ? true : false
                const done = autoCheck || pasos[i]
                return (
                  <div key={i} onClick={() => !autoCheck && togglePaso(i)} className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all ${done ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${done ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-600'}`}>{done ? '✓' : i + 1}</div>
                    <div className="flex-1">
                      <div className="text-xs font-medium text-gray-800">{p}</div>
                      {i === 0 && gPend > 0 && <div className="text-[10px] text-red-600 mt-0.5">{gPend} gasto(s) pendiente(s) de pago</div>}
                      {i === 2 && <div className={`text-[10px] mt-0.5 ${saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>Saldo: {saldo >= 0 ? `USD ${fmt(saldo)} a devolver` : `USD ${fmt(Math.abs(saldo))} a cobrar`}</div>}
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
              ✓ Operación cerrada el {op.fecha_cierre}.
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
