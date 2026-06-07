'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { fmt, ESTADOS_L, PUERTOS_L } from '@/lib/utils'
import type { Cotizacion, EstadoCotizacion } from '@/types'
import Link from 'next/link'
import Image from 'next/image'

const ESTADO_CLS: Record<string, string> = {
  borrador: 'bg-gray-100 text-gray-600',
  enviada: 'bg-blue-50 text-[#1168F8]',
  aceptada: 'bg-green-50 text-green-700',
  rechazada: 'bg-red-50 text-red-700',
  vencida: 'bg-amber-50 text-amber-700',
}

const ETAPA_L: Record<string, string> = {
  maritimo: 'Flete marítimo',
  chile: 'Gastos Chile',
  terrestre: 'Transporte',
  argentina: 'Gastos Argentina',
  tributos: 'Tributos ARCA',
  fee: 'Fee Puerto NOA',
}

export default function CotizacionDetailPage({ params }: { params: { id: string } }) {
  const rawId = params?.id
  const [id, setId] = useState<string>(rawId || '')
  const [cot, setCot] = useState<Cotizacion | null>(null)
  const [loading, setLoading] = useState(true)
  const [ejecutivo, setEjecutivo] = useState<any>(null)
  const [mostrarComparativa, setMostrarComparativa] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    let cotId = rawId || id
    if (!cotId && typeof window !== 'undefined') {
      const parts = window.location.pathname.split('/')
      cotId = parts[parts.length - 1]
      if (cotId) setId(cotId)
    }
    if (!cotId) return
    supabase.from('cotizaciones').select('*').eq('id', cotId).single().then(({ data, error }) => {
      if (error) console.error('Error cargando cotización:', error)
      if (data) {
        setCot(data as Cotizacion)
        // Load ejecutivo data
        if ((data as any).ejecutivo_id) {
          supabase.from('usuarios').select('*').eq('id', (data as any).ejecutivo_id).single().then(({ data: u }) => {
            if (u) setEjecutivo(u)
          })
        }
      }
      setLoading(false)
    })
  }, [rawId, id])

  async function cambiarEstado(estado: EstadoCotizacion) {
    await (supabase.from('cotizaciones') as any).update({ estado, updated_at: new Date().toISOString() }).eq('id', id)
    if (estado === 'aceptada') {
      const { data: opExist } = await supabase.from('operaciones').select('id').eq('cotizacion_id', id).single()
      if (!opExist) await (supabase.from('operaciones') as any).insert({ cotizacion_id: id })
    }
    setCot(c => c ? { ...c, estado } : c)
  }

  if (loading) return <div className="p-8 text-gray-400 text-sm">Cargando...</div>
  if (!cot) return (
    <div className="p-8">
      <div className="text-gray-400 text-sm mb-2">Cotización no encontrada.</div>
      <div className="text-[10px] text-gray-300 font-mono">ID: {id}</div>
      <a href="/registro" className="text-xs text-[#1168F8] hover:underline mt-2 block">← Volver a cotizaciones</a>
    </div>
  )

  const presup = Array.isArray(cot.presupuesto) ? cot.presupuesto : []
  const productos = Array.isArray(cot.productos) ? cot.productos.filter((p: any) => p.subtotal > 0) : []
  const contenedores = Array.isArray(cot.tipo_contenedores) ? cot.tipo_contenedores : []
  const nc = contenedores.reduce((t: number, c: any) => t + (c.cantidad || 0), 0)
  const totalFOB = cot.total_fob || 0
  const totalLog = cot.total_logistico || 0
  const totalTribUSD = cot.total_tributos_usd || 0
  const totalTribARS = cot.total_tributos_ars || 0
  const totalLanded = cot.total_landed || 0
  const tcRef = cot.tc_ars || 0
  const regimen = (cot as any).regimen || 'A'
  const precioArg = (cot as any).precio_arg_equiv || 0
  const fechaEmision = cot.created_at ? new Date(cot.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' }) : ''
  const hayComparativa = precioArg > 0
  const ahorro = precioArg - totalLanded

  const CONDICIONES = [
    'Los valores expresados en USD son de referencia a la fecha de emisión de esta cotización.',
    'Los pagos en pesos argentinos (ARS) se realizarán al tipo de cambio oficial BNA vigente en la fecha efectiva de cada pago.',
    'Los tributos aduaneros se liquidan al TC oficial del día del despacho, pudiendo diferir del TC de referencia indicado.',
    'Esta cotización no incluye gastos no previstos que pudieran surgir por demoras, cambios regulatorios o instrucciones especiales del importador.',
    'Puerto NOA SpA actúa como agente logístico y gestor de la operación de importación.',
  ]

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #printable, #printable * { visibility: visible; }
          #printable { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          @page { margin: 10mm 12mm; size: A4 portrait; }
          .page-break { page-break-before: always; }
          #printable * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          /* Evitar corte de tablas */
          .cost-table { page-break-inside: avoid; }
          .merch-table { page-break-inside: avoid; }
          /* Reducir espacios en página 1 para que entre todo */
          .p1-section { margin-bottom: 8px !important; }
          .p1-header { margin-bottom: 8px !important; padding-bottom: 8px !important; }
          .p1-grid { gap: 8px !important; }
          .p1-cell { padding: 4px 10px !important; }
          .p1-row { padding-top: 4px !important; padding-bottom: 4px !important; }
        }
      `}</style>

      {/* ── CONTROLES ── */}
      <div className="no-print bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <Link href="/registro" className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">← Cotizaciones</Link>
          <span className="text-gray-300">|</span>
          <span className="font-mono font-bold text-gray-800">{cot.num}</span>
          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${ESTADO_CLS[cot.estado]}`}>{ESTADOS_L[cot.estado]}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {hayComparativa && (
            <button onClick={() => setMostrarComparativa(!mostrarComparativa)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-medium border transition-colors ${mostrarComparativa ? 'bg-[#1168F8] text-white border-[#1168F8]' : 'bg-white border-gray-200 text-gray-600'}`}>
              {mostrarComparativa ? '✓ Con comparativa' : 'Agregar comparativa'}
            </button>
          )}
          <span className="text-xs text-gray-400">Estado:</span>
          {(['enviada','aceptada','rechazada','vencida'] as EstadoCotizacion[]).filter(e => e !== cot.estado).map(e => (
            <button key={e} onClick={() => cambiarEstado(e)}
              className={`px-3 py-1.5 rounded-full text-[10px] font-semibold border transition-colors ${ESTADO_CLS[e]}`}>
              {ESTADOS_L[e]}
            </button>
          ))}
          {cot.estado === 'aceptada' && (
            <button onClick={() => router.push(`/operaciones?cot=${cot.id}`)}
              className="flex items-center gap-1 px-3 py-1.5 bg-[#1168F8] text-white rounded-lg text-xs font-medium hover:bg-[#0a4fc4]">
              🚢 Ver operación
            </button>
          )}
          <button onClick={() => {
            const t = document.title
            document.title = `Cotizacion_${cot.num}_${cot.cliente.replace(/\s+/g,'-')}`
            window.print()
            document.title = t
          }} className="flex items-center gap-1.5 px-4 py-2 bg-[#052698] text-white rounded-lg text-xs font-bold hover:bg-[#1168F8] transition-colors">
            🖨 Imprimir / PDF
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          DOCUMENTO IMPRIMIBLE
      ══════════════════════════════════════════════════════ */}
      <div id="printable" className="max-w-4xl mx-auto">

        {/* ─────────────────────────────────────────────────────
            PÁGINA 1
        ───────────────────────────────────────────────────── */}
        <div className="bg-white p-8 min-h-screen flex flex-col">

          {/* ENCABEZADO P1 */}
          <div className="flex items-start justify-between pb-5 mb-6 p1-header" style={{borderBottom: '3px solid #1168F8'}}>
            <div>
              <Image src="/logo.png" alt="Puerto NOA SpA" width={180} height={52} style={{objectFit:'contain'}} />
              <div className="mt-2 text-[11px] text-gray-400 leading-relaxed">
                Puerto NOA SpA — Logística de importaciones China → NOA<br/>
                Paso de Jama · San Salvador de Jujuy, Argentina
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Cotización</div>
              <div className="text-3xl font-black font-mono text-[#052698] tracking-tight">{cot.num}</div>
              <div className="text-xs text-gray-500 mt-1.5">{fechaEmision}</div>
              {cot.validez && (
                <div className="inline-flex items-center gap-1 mt-2 px-3 py-1 bg-amber-50 border border-amber-200 rounded-full text-[10px] text-amber-700 font-semibold">
                  ⏱ Válida por {cot.validez}
                </div>
              )}
              <div className={`inline-flex px-3 py-1 rounded-full text-[10px] font-bold mt-2 ml-2 ${ESTADO_CLS[cot.estado]}`}>
                {ESTADOS_L[cot.estado]}
              </div>
            </div>
          </div>

          {/* CLIENTE + RUTA */}
          <div className="grid grid-cols-2 gap-5 mb-6 p1-grid">
            <div className="rounded-xl overflow-hidden" style={{border:'1px solid #e5e7eb'}}>
              <div className="px-4 py-2.5 font-bold text-[11px] uppercase tracking-widest" style={{background:'#1168F8',color:'white'}}>
                Datos del cliente
              </div>
              <div className="px-4 py-4 space-y-2">
                {[
                  {l:'Razón social', v:cot.cliente, bold:true},
                  {l:'CUIT', v:cot.cuit, mono:true},
                  {l:'Email', v:cot.email_cliente},
                  {l:'Teléfono', v:cot.telefono_cliente},
                  {l:'Despachante', v:(cot as any).despachante},
                ].filter(r=>r.v).map(r=>(
                  <div key={r.l} className="flex gap-3 text-xs">
                    <span className="text-gray-400 w-24 flex-shrink-0">{r.l}</span>
                    <span className={`${r.bold?'font-bold text-gray-900':'text-gray-700'} ${r.mono?'font-mono':''}`}>{r.v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl overflow-hidden" style={{border:'1px solid #e5e7eb'}}>
              <div className="px-4 py-2.5 font-bold text-[11px] uppercase tracking-widest" style={{background:'#052698',color:'white'}}>
                Ruta de importación
              </div>
              <div className="px-4 py-4 space-y-2">
                {[
                  {l:'Origen', v:cot.origen},
                  {l:'Puerto Chile', v:PUERTOS_L[cot.puerto_chile||''||cot.puerto_chile]},
                  {l:'Destino NOA', v:cot.destino_noa, bold:true},
                  {l:'Incoterm', v:cot.incoterm, bold:true, blue:true},
                  {l:'Tránsito est.', v:cot.transito},
                  {l:'Modalidad', v:`Opción ${(cot as any).opcion_transporte||'A1'} · ${(cot as any).opcion_transporte==='B'?'Contenedor completo':'Desconsolidado'}`},
                ].filter(r=>r.v).map(r=>(
                  <div key={r.l} className="flex gap-3 text-xs">
                    <span className="text-gray-400 w-28 flex-shrink-0">{r.l}</span>
                    <span className={`${r.bold?'font-bold':''} ${r.blue?'text-[#1168F8]':'text-gray-700'}`}>{r.v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* MERCADERÍA */}
          <div className="rounded-xl overflow-hidden mb-6 merch-table" style={{border:'1px solid #e5e7eb'}}>
            <div className="px-5 py-3 flex items-center justify-between" style={{background:'#052698'}}>
              <span className="font-bold text-sm text-white">Mercadería importada</span>
              <span className="text-blue-200 text-xs">{contenedores.map((c:any)=>`${c.cantidad}× ${c.tipo}`).join(' + ')} · {nc} contenedor(es)</span>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr style={{background:'#f8fafc',borderBottom:'1px solid #e5e7eb'}}>
                  <th className="text-left px-5 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Descripción del producto</th>
                  <th className="text-center px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">NCM</th>
                  <th className="text-right px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Cant.</th>
                  <th className="text-right px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">P. Unit. USD</th>
                  <th className="text-right px-5 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Subtotal USD</th>
                </tr>
              </thead>
              <tbody>
                {productos.map((p:any, i:number) => (
                  <tr key={i} style={{borderBottom:'1px solid #f1f5f9'}}>
                    <td className="px-5 py-2 font-medium text-gray-800">{p.descripcion}</td>
                    <td className="px-4 py-2 text-center font-mono text-gray-500 text-[10px]">{p.ncm||'—'}</td>
                    <td className="px-4 py-2 text-right text-gray-600">{p.cantidad}</td>
                    <td className="px-4 py-2 text-right font-mono text-gray-600">{fmt(p.precio_unit||0)}</td>
                    <td className="px-5 py-2 text-right font-mono font-bold text-gray-800">USD {fmt(p.subtotal)}</td>
                  </tr>
                ))}
                {/* Espacio extra para productos adicionales */}
                {productos.length < 3 && Array.from({length: 3-productos.length}).map((_,i)=>(
                  <tr key={`empty-${i}`} style={{borderBottom:'1px solid #f8fafc'}}>
                    <td className="px-5 py-2.5 text-gray-200 text-[10px]">—</td>
                    <td colSpan={4}></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{background:'#EBF2FF',borderTop:'2px solid #1168F8'}}>
                  <td colSpan={4} className="px-5 py-3 font-bold text-[#052698] text-xs">VALOR {cot.incoterm} CHINA</td>
                  <td className="px-5 py-3 text-right font-mono font-black text-[#052698] text-sm">USD {fmt(totalFOB,0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* ESTRUCTURA DE COSTOS */}
          <div className="rounded-xl overflow-hidden mb-4 cost-table" style={{border:'1px solid #e5e7eb'}}>
            <div className="px-5 py-3" style={{background:'#f8fafc',borderBottom:'1px solid #e5e7eb'}}>
              <div className="font-bold text-sm text-gray-900">Estructura de costos hasta {cot.destino_noa}</div>
              <div className="text-[10px] text-gray-400 mt-0.5">Valores en USD a tipo de cambio de referencia · Régimen {regimen}</div>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr style={{background:'#f8fafc',borderBottom:'1px solid #e5e7eb'}}>
                  <th className="text-left px-5 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider w-36">Sección</th>
                  <th className="text-left px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Concepto</th>
                  <th className="text-right px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider w-24">USD</th>
                  <th className="text-right px-5 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider w-20">% s/landed</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{background:'#eff6ff',borderBottom:'1px solid #e5e7eb'}}>
                  <td className="px-5 py-2.5 font-bold text-[#052698] text-[11px]">Mercadería</td>
                  <td className="px-4 py-2.5 text-gray-700">Valor {cot.incoterm} China · {productos.length} producto(s)</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-gray-800">{fmt(totalFOB,0)}</td>
                  <td className="px-5 py-2.5 text-right text-gray-400">{totalLanded>0?fmt(totalFOB/totalLanded*100,1):'0'}%</td>
                </tr>
                {presup.filter((it:any)=>it.tipo!=='tributos').map((it:any,i:number)=>(
                  <tr key={i} style={{borderBottom:'1px solid #f8fafc'}}>
                    <td className="px-5 py-2.5 text-gray-400 text-[10px]">{ETAPA_L[it.etapa]||it.etapa}</td>
                    <td className="px-4 py-2.5 text-gray-700">{it.concepto}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-gray-600">{fmt(it.usd,0)}</td>
                    <td className="px-5 py-2.5 text-right text-gray-300 text-[10px]">{totalLanded>0?fmt(it.usd/totalLanded*100,1):'0'}%</td>
                  </tr>
                ))}
                <tr style={{background:'#f8fafc',borderBottom:'1px solid #e5e7eb',borderTop:'1px solid #e5e7eb'}}>
                  <td colSpan={2} className="px-5 py-2.5 font-bold text-xs text-gray-600">Subtotal costos logísticos</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-gray-700">{fmt(totalLog,0)}</td>
                  <td className="px-5 py-2.5 text-right text-gray-400 text-[10px]">{totalLanded>0?fmt(totalLog/totalLanded*100,1):'0'}%</td>
                </tr>
                <tr style={{background:'#fffbeb',borderBottom:'1px solid #fde68a'}}>
                  <td className="px-5 py-2.5 font-bold text-amber-700 text-[11px]">Tributos ARCA</td>
                  <td className="px-4 py-2.5 text-gray-700">Régimen {regimen} · Aduana Jujuy · Base CIF Jama {tcRef>0&&<span className="text-gray-400">(TC ref. ARS {fmt(tcRef,0)})</span>}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-gray-800">{fmt(totalTribUSD,0)}</td>
                  <td className="px-5 py-2.5 text-right text-gray-400">{totalLanded>0?fmt(totalTribUSD/totalLanded*100,1):'0'}%</td>
                </tr>
              </tbody>
              <tfoot>
                <tr style={{background:'#052698'}}>
                  <td colSpan={2} className="px-5 py-4 font-black text-white text-sm">TOTAL LANDED EN {(cot.destino_noa||'DESTINO').toUpperCase()}</td>
                  <td className="px-4 py-4 text-right font-mono font-black text-white text-base">USD {fmt(totalLanded,0)}</td>
                  <td className="px-5 py-4 text-right text-blue-200 text-xs font-bold">100%</td>
                </tr>
                {nc>0&&(
                  <tr style={{background:'#EBF2FF'}}>
                    <td colSpan={2} className="px-5 py-2 text-[10px] text-[#052698] font-medium">Costo por contenedor</td>
                    <td colSpan={2} className="px-5 py-2 text-right font-mono text-[10px] font-bold text-[#052698]">USD {fmt(totalLanded/nc,0)} / cont.</td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>

          {/* PIE PÁGINA 1 */}
          <div className="flex items-center justify-between pt-4 mt-auto" style={{borderTop:'1px solid #e5e7eb'}}>
            <div className="text-[9px] text-gray-400">Puerto NOA SpA · Importaciones China → NOA · {fechaEmision}</div>
            <div className="text-[9px] text-gray-400 font-mono font-medium">{cot.num} · Pág. 1/2</div>
            <Image src="/logo.png" alt="Puerto NOA" width={70} height={20} style={{objectFit:'contain',opacity:0.35}} />
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────
            PÁGINA 2
        ───────────────────────────────────────────────────── */}
        <div className="page-break bg-white p-8 min-h-screen flex flex-col">

          {/* ENCABEZADO P2 */}
          <div className="flex items-center justify-between pb-4 mb-6" style={{borderBottom:'2px solid #1168F8'}}>
            <Image src="/logo.png" alt="Puerto NOA SpA" width={120} height={36} style={{objectFit:'contain',opacity:0.8}} />
            <div className="text-center">
              <div className="text-xs font-bold text-gray-600">COTIZACIÓN {cot.num}</div>
              <div className="text-[10px] text-gray-400">{cot.cliente}</div>
            </div>
            <div className="text-right text-[10px] text-gray-400 font-mono">{fechaEmision} · Pág. 2/2</div>
          </div>

          {/* RESUMEN FINANCIERO + TRIBUTOS */}
          <div className="grid grid-cols-2 gap-5 mb-6">
            {/* Resumen */}
            <div className="rounded-xl overflow-hidden" style={{border:'2px solid #1168F8'}}>
              <div className="px-5 py-3 font-bold text-[11px] uppercase tracking-widest" style={{background:'#1168F8',color:'white'}}>
                Resumen financiero
              </div>
              <div className="px-5 py-4 space-y-3">
                {[
                  {l:`Mercadería (${cot.incoterm})`,v:`USD ${fmt(totalFOB,0)}`,sub:null},
                  {l:'Costos logísticos',v:`USD ${fmt(totalLog,0)}`,sub:null},
                  {l:'Tributos ARCA (ref.)',v:`USD ${fmt(totalTribUSD,0)}`,sub:`ARS ${Math.round(totalTribARS).toLocaleString('es-AR')}`},
                ].map(r=>(
                  <div key={r.l} className="flex justify-between items-start">
                    <div>
                      <div className="text-xs text-gray-600">{r.l}</div>
                      {r.sub&&<div className="text-[10px] text-gray-400 font-mono">{r.sub}</div>}
                    </div>
                    <span className="font-mono font-bold text-gray-800 text-xs">{r.v}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center pt-3" style={{borderTop:'2px solid #1168F8'}}>
                  <span className="font-black text-[#052698] text-sm">TOTAL LANDED</span>
                  <span className="font-mono font-black text-[#1168F8] text-lg">USD {fmt(totalLanded,0)}</span>
                </div>
                {nc>1&&<div className="text-[10px] text-[#1168F8] font-mono text-right">USD {fmt(totalLanded/nc,0)} por contenedor</div>}
              </div>
            </div>

            {/* Tributos ARS */}
            <div className="rounded-xl overflow-hidden" style={{border:'1px solid #fde68a'}}>
              <div className="px-5 py-3 font-bold text-[11px] uppercase tracking-widest" style={{background:'#f59e0b',color:'white'}}>
                Tributos a pagar en Aduana (ARS)
              </div>
              <div className="px-5 py-4">
                <div className="text-3xl font-black text-gray-900 mb-2" style={{fontVariantNumeric:'tabular-nums'}}>
                  ARS {Math.round(totalTribARS).toLocaleString('es-AR')}
                </div>
                <div className="space-y-1.5 text-[11px] text-gray-500">
                  <div>Equivalente USD ref.: <span className="font-mono font-bold text-gray-700">USD {fmt(totalTribUSD,0)}</span></div>
                  {tcRef>0&&<div>TC de referencia: <span className="font-mono font-bold text-gray-700">ARS {fmt(tcRef,0)} / USD</span></div>}
                  <div className="text-amber-600 font-medium mt-2 text-[10px]">
                    ⚠ Se abona al TC oficial BNA vigente el día del despacho. El monto en pesos puede variar.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* COMPARATIVA — solo si está activada */}
          {mostrarComparativa && hayComparativa && (
            <div className="rounded-xl overflow-hidden mb-6" style={{border:`2px solid ${ahorro>0?'#16a34a':'#dc2626'}`}}>
              <div className="px-5 py-3 font-bold text-[11px] uppercase tracking-widest text-white" style={{background:ahorro>0?'#16a34a':'#dc2626'}}>
                📊 Comparativa: importar vs. precio local
              </div>
              <div className="px-5 py-4 grid grid-cols-3 gap-4">
                <div className="text-center p-3 bg-blue-50 rounded-xl">
                  <div className="text-[10px] text-gray-500 mb-1">Costo importación</div>
                  <div className="font-mono font-black text-[#052698] text-lg">USD {fmt(totalLanded,0)}</div>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-xl">
                  <div className="text-[10px] text-gray-500 mb-1">Precio equivalente local</div>
                  <div className="font-mono font-black text-gray-700 text-lg">USD {fmt(precioArg,0)}</div>
                </div>
                <div className={`text-center p-3 rounded-xl ${ahorro>0?'bg-green-50':'bg-red-50'}`}>
                  <div className="text-[10px] text-gray-500 mb-1">{ahorro>0?'Ahorro estimado':'Diferencia'}</div>
                  <div className={`font-mono font-black text-lg ${ahorro>0?'text-green-700':'text-red-700'}`}>
                    {ahorro>0?'+':''}USD {fmt(Math.abs(ahorro),0)}
                  </div>
                  <div className={`text-[10px] font-bold mt-0.5 ${ahorro>0?'text-green-600':'text-red-600'}`}>
                    {ahorro>0?`${fmt(ahorro/precioArg*100,1)}% más económico`:'Por encima del precio local'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* NOTAS */}
          {cot.notas && (
            <div className="rounded-xl overflow-hidden mb-6" style={{border:'1px solid #fde68a',background:'#fffbeb'}}>
              <div className="px-5 py-2.5 font-bold text-[11px] uppercase tracking-widest text-amber-800">Observaciones</div>
              <div className="px-5 pb-4 text-xs text-amber-900">{cot.notas}</div>
            </div>
          )}

          {/* CONDICIONES GENERALES */}
          <div className="rounded-xl overflow-hidden mb-6" style={{border:'1px solid #e5e7eb'}}>
            <div className="px-5 py-2.5 font-bold text-[11px] uppercase tracking-widest text-gray-600" style={{background:'#f8fafc',borderBottom:'1px solid #e5e7eb'}}>
              Condiciones generales
            </div>
            <div className="px-5 py-4">
              <ol className="space-y-1.5">
                {CONDICIONES.map((c,i)=>(
                  <li key={i} className="flex gap-2.5 text-[11px] text-gray-500">
                    <span className="text-[#1168F8] font-bold flex-shrink-0 w-4">{i+1}.</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {/* FIRMA */}
          <div className="grid grid-cols-2 gap-8 mb-6 flex-1">
            <div className="rounded-xl p-5" style={{border:'1px solid #e5e7eb'}}>
              <div className="font-bold text-[11px] uppercase tracking-widest text-gray-500 mb-4">Por Puerto NOA SpA</div>
              <div className="border-b border-gray-300 mb-3 h-10"></div>
              <div className="text-xs text-gray-700 font-bold">{ejecutivo?.nombre || '_______________________'}</div>
              <div className="text-[10px] text-gray-400">{ejecutivo ? (ejecutivo.rol === 'admin' ? 'Dirección' : 'Ejecutivo de operaciones') : 'Cargo'}</div>
              {ejecutivo?.email && <div className="text-[10px] text-[#1168F8] mt-1">{ejecutivo.email}</div>}
              {(ejecutivo as any)?.telefono && <div className="text-[10px] text-gray-500">{(ejecutivo as any).telefono}</div>}
            </div>
            <div className="rounded-xl p-5" style={{border:'1px solid #e5e7eb'}}>
              <div className="font-bold text-[11px] uppercase tracking-widest text-gray-500 mb-4">Aceptación del cliente</div>
              <div className="border-b border-gray-300 mb-3 h-10"></div>
              <div className="text-xs text-gray-700 font-bold">{cot.cliente}</div>
              {cot.cuit && <div className="text-[10px] text-gray-400 font-mono">CUIT: {cot.cuit}</div>}
              <div className="text-[10px] text-gray-400 mt-1">Fecha: ___/___/______</div>
            </div>
          </div>

          {/* PIE PÁGINA 2 */}
          <div className="flex items-center justify-between pt-4 mt-auto" style={{borderTop:'2px solid #1168F8'}}>
            <Image src="/logo.png" alt="Puerto NOA SpA" width={90} height={26} style={{objectFit:'contain',opacity:0.6}} />
            <div className="text-center text-[9px] text-gray-400">
              <div className="font-bold text-gray-600">Puerto NOA SpA</div>
              <div>San Salvador de Jujuy, Argentina · Paso de Jama</div>
              <div>Importaciones China → NOA Argentino</div>
            </div>
            <div className="text-right text-[9px] text-gray-400">
              <div className="font-mono font-bold text-gray-600">{cot.num}</div>
              <div>Emitida: {fechaEmision}</div>
              <div className="mt-0.5">Pág. 2/2</div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
