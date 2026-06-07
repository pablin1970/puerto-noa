'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
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
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    // Get id from params, URL, or window.location as fallback
    let cotId = rawId || id
    if (!cotId && typeof window !== 'undefined') {
      const parts = window.location.pathname.split('/')
      cotId = parts[parts.length - 1]
      if (cotId) setId(cotId)
    }
    if (!cotId) return
    supabase.from('cotizaciones').select('*').eq('id', cotId).single().then(({ data, error }) => {
      if (error) console.error('Error cargando cotización:', error)
      if (data) setCot(data as Cotizacion)
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
  const fechaEmision = cot.created_at ? new Date(cot.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' }) : ''

  return (
    <>
      {/* ── ESTILOS IMPRIMIR ── */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #printable, #printable * { visibility: visible; }
          #printable { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          @page { margin: 8mm 10mm; size: A4 portrait; }
          #printable { font-size: 10px !important; }
          #printable h1, #printable .text-2xl { font-size: 16px !important; }
          #printable .text-xl { font-size: 14px !important; }
          #printable .text-lg { font-size: 13px !important; }
          #printable .text-sm { font-size: 11px !important; }
          #printable .text-xs { font-size: 10px !important; }
          #printable .text-\[10px\] { font-size: 8px !important; }
          #printable .text-base { font-size: 11px !important; }
          #printable .p-6 { padding: 6px !important; }
          #printable .p-5 { padding: 5px !important; }
          #printable .p-4 { padding: 4px !important; }
          #printable .p-3 { padding: 3px !important; }
          #printable .px-5 { padding-left: 5px !important; padding-right: 5px !important; }
          #printable .px-4 { padding-left: 4px !important; padding-right: 4px !important; }
          #printable .py-3\.5 { padding-top: 3px !important; padding-bottom: 3px !important; }
          #printable .py-3 { padding-top: 3px !important; padding-bottom: 3px !important; }
          #printable .py-2\.5 { padding-top: 2px !important; padding-bottom: 2px !important; }
          #printable .py-2 { padding-top: 2px !important; padding-bottom: 2px !important; }
          #printable .mb-6 { margin-bottom: 4px !important; }
          #printable .mb-5 { margin-bottom: 4px !important; }
          #printable .mb-4 { margin-bottom: 3px !important; }
          #printable .mb-3 { margin-bottom: 2px !important; }
          #printable .mb-2 { margin-bottom: 2px !important; }
          #printable .gap-4 { gap: 4px !important; }
          #printable .gap-3 { gap: 3px !important; }
          #printable .space-y-2 > * + * { margin-top: 2px !important; }
          #printable .space-y-1\.5 > * + * { margin-top: 1px !important; }
          #printable .rounded-xl { border-radius: 4px !important; }
          #printable .max-w-4xl { max-width: 100% !important; }
          #printable img { max-height: 28px !important; }
          #printable .border-b-2 { padding-bottom: 3px !important; margin-bottom: 4px !important; }
          #printable .mt-6 { margin-top: 4px !important; }
          #printable .pt-4 { padding-top: 3px !important; }
        }
      `}</style>

      {/* ── CONTROLES (no se imprimen) ── */}
      <div className="no-print p-4 bg-white border-b border-gray-100 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Link href="/registro" className="text-xs text-gray-400 hover:text-gray-600">← Cotizaciones</Link>
          <span className="font-mono font-semibold text-gray-800">{cot.num}</span>
          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${ESTADO_CLS[cot.estado]}`}>{ESTADOS_L[cot.estado]}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 mr-2">Cambiar estado:</span>
          {(['enviada','aceptada','rechazada','vencida'] as EstadoCotizacion[]).filter(e => e !== cot.estado).map(e => (
            <button key={e} onClick={() => cambiarEstado(e)} className={`px-3 py-1.5 rounded-full text-[10px] font-medium border transition-colors ${ESTADO_CLS[e]}`}>{ESTADOS_L[e]}</button>
          ))}
          {cot.estado === 'aceptada' && (
            <button onClick={() => router.push(`/operaciones?cot=${cot.id}`)} className="flex items-center gap-1 px-3 py-1.5 bg-[#1168F8] text-white rounded-lg text-xs font-medium hover:bg-[#0a4fc4]">🚢 Ver operación</button>
          )}
          <button onClick={() => window.print()} className="flex items-center gap-1.5 px-4 py-1.5 border-2 border-[#1168F8] text-[#1168F8] rounded-lg text-xs font-semibold hover:bg-[#EBF2FF] transition-colors">🖨 Imprimir / PDF</button>
        </div>
      </div>

      {/* ── DOCUMENTO IMPRIMIBLE ── */}
      <div id="printable" className="max-w-4xl mx-auto p-6">

        {/* ENCABEZADO */}
        <div className="flex items-start justify-between mb-6 pb-5 border-b-2 border-[#1168F8]">
          <div>
            <Image src="/logo.png" alt="Puerto NOA SpA" width={160} height={48} style={{ objectFit: 'contain' }} />
            <div className="mt-2 text-[10px] text-gray-400 leading-relaxed">
              Puerto NOA SpA — Logística de importaciones China → NOA Argentino<br/>
              Paso de Jama · San Salvador de Jujuy, Argentina
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Cotización</div>
            <div className="text-2xl font-bold font-mono text-[#052698]">{cot.num}</div>
            <div className="text-xs text-gray-500 mt-1">{fechaEmision}</div>
            {cot.validez && <div className="text-[10px] text-amber-600 mt-1 font-medium">Validez: {cot.validez}</div>}
            <div className={`inline-flex px-3 py-1 rounded-full text-[10px] font-semibold mt-2 ${ESTADO_CLS[cot.estado]}`}>{ESTADOS_L[cot.estado]}</div>
          </div>
        </div>

        {/* CLIENTE + RUTA */}
        <div className="grid grid-cols-2 gap-4 mb-5">
          <div className="border border-gray-200 rounded-xl p-4">
            <div className="text-[10px] font-bold text-[#1168F8] uppercase tracking-wider mb-3">Datos del cliente</div>
            <div className="space-y-1.5 text-xs">
              <div className="flex gap-2"><span className="text-gray-400 w-24 flex-shrink-0">Razón social</span><span className="font-semibold text-gray-900">{cot.cliente}</span></div>
              {cot.cuit && <div className="flex gap-2"><span className="text-gray-400 w-24 flex-shrink-0">CUIT</span><span className="font-mono text-gray-700">{cot.cuit}</span></div>}
              {cot.email_cliente && <div className="flex gap-2"><span className="text-gray-400 w-24 flex-shrink-0">Email</span><span className="text-gray-700">{cot.email_cliente}</span></div>}
              {cot.telefono_cliente && <div className="flex gap-2"><span className="text-gray-400 w-24 flex-shrink-0">Teléfono</span><span className="text-gray-700">{cot.telefono_cliente}</span></div>}
              {(cot as any).despachante && <div className="flex gap-2"><span className="text-gray-400 w-24 flex-shrink-0">Despachante</span><span className="text-gray-700">{(cot as any).despachante}</span></div>}
            </div>
          </div>
          <div className="border border-gray-200 rounded-xl p-4">
            <div className="text-[10px] font-bold text-[#1168F8] uppercase tracking-wider mb-3">Ruta de importación</div>
            <div className="space-y-1.5 text-xs">
              <div className="flex gap-2"><span className="text-gray-400 w-28 flex-shrink-0">Origen</span><span className="font-medium text-gray-800">{cot.origen}</span></div>
              <div className="flex gap-2"><span className="text-gray-400 w-28 flex-shrink-0">Puerto Chile</span><span className="text-gray-700">{PUERTOS_L[cot.puerto_chile || ''] || cot.puerto_chile}</span></div>
              <div className="flex gap-2"><span className="text-gray-400 w-28 flex-shrink-0">Destino NOA</span><span className="font-medium text-gray-800">{cot.destino_noa}</span></div>
              <div className="flex gap-2"><span className="text-gray-400 w-28 flex-shrink-0">Incoterm</span><span className="font-mono font-semibold text-[#052698]">{cot.incoterm}</span></div>
              <div className="flex gap-2"><span className="text-gray-400 w-28 flex-shrink-0">Tránsito est.</span><span className="text-gray-700">{cot.transito}</span></div>
              <div className="flex gap-2"><span className="text-gray-400 w-28 flex-shrink-0">Modalidad</span><span className="text-gray-700">Opción {(cot as any).opcion_transporte || 'A1'} · {(cot as any).opcion_transporte === 'B' ? 'Contenedor completo' : 'Desconsolidado'}</span></div>
            </div>
          </div>
        </div>

        {/* MERCADERÍA — protagonista */}
        <div className="border border-gray-200 rounded-xl overflow-hidden mb-5">
          <div className="px-5 py-3 bg-[#052698] flex items-center justify-between">
            <div className="font-semibold text-sm text-white">Mercadería importada</div>
            <div className="text-blue-200 text-xs">{contenedores.map((c: any) => `${c.cantidad}× ${c.tipo}`).join(' + ')} · {nc} contenedor(es)</div>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Descripción del producto</th>
                <th className="text-center px-4 py-2.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">NCM</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Cant.</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">P. Unit. USD</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Subtotal USD</th>
              </tr>
            </thead>
            <tbody>
              {productos.map((p: any, i: number) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="px-4 py-3 font-medium text-gray-800">{p.descripcion || 'Sin descripción'}</td>
                  <td className="px-4 py-3 text-center font-mono text-gray-500 text-[10px]">{p.ncm || '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{p.cantidad}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-600">{fmt(p.precio_unit || 0)}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-gray-800">USD {fmt(p.subtotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-[#EBF2FF] border-t-2 border-[#1168F8]">
                <td colSpan={4} className="px-4 py-3 font-semibold text-[#052698] text-xs">VALOR {cot.incoterm} CHINA</td>
                <td className="px-4 py-3 text-right font-mono font-bold text-[#052698] text-sm">USD {fmt(totalFOB, 0)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* COSTOS — tabla detallada */}
        <div className="border border-gray-200 rounded-xl overflow-hidden mb-5">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
            <div className="font-semibold text-sm text-gray-900">Estructura de costos hasta {cot.destino_noa}</div>
            <div className="text-[10px] text-gray-400 mt-0.5">Todos los valores expresados en USD a tipo de cambio de referencia</div>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Sección</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Concepto</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">USD</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">% s/landed</th>
              </tr>
            </thead>
            <tbody>
              {/* Producto */}
              <tr className="border-b border-gray-100 bg-blue-50/30">
                <td className="px-4 py-2.5 text-[#052698] font-medium">Mercadería</td>
                <td className="px-4 py-2.5 text-gray-700">Valor {cot.incoterm} China · {productos.length} ítem(s)</td>
                <td className="px-4 py-2.5 text-right font-mono font-semibold text-gray-800">{fmt(totalFOB, 0)}</td>
                <td className="px-4 py-2.5 text-right text-gray-400">{totalLanded > 0 ? fmt(totalFOB / totalLanded * 100, 1) : '0'}%</td>
              </tr>
              {/* Logística */}
              {presup.filter((it: any) => it.tipo !== 'tributos').map((it: any, i: number) => (
                <tr key={i} className="border-b border-gray-50">
                  <td className="px-4 py-2.5 text-gray-400 text-[10px]">{ETAPA_L[it.etapa] || it.etapa}</td>
                  <td className="px-4 py-2.5 text-gray-700">{it.concepto}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-600">{fmt(it.usd, 0)}</td>
                  <td className="px-4 py-2.5 text-right text-gray-300 text-[10px]">{totalLanded > 0 ? fmt(it.usd / totalLanded * 100, 1) : '0'}%</td>
                </tr>
              ))}
              {/* Subtotal logística */}
              <tr className="border-b border-gray-200 bg-gray-50">
                <td colSpan={2} className="px-4 py-2 text-xs font-semibold text-gray-600">Subtotal costos logísticos</td>
                <td className="px-4 py-2 text-right font-mono font-semibold text-gray-700">{fmt(totalLog, 0)}</td>
                <td className="px-4 py-2 text-right text-gray-400 text-[10px]">{totalLanded > 0 ? fmt(totalLog / totalLanded * 100, 1) : '0'}%</td>
              </tr>
              {/* Tributos */}
              <tr className="border-b border-gray-100 bg-amber-50/40">
                <td className="px-4 py-2.5 text-amber-700 font-medium">Tributos ARCA</td>
                <td className="px-4 py-2.5 text-gray-700">
                  Régimen {regimen} · Aduana Jujuy · Base CIF Jama
                  {tcRef > 0 && <span className="text-gray-400 ml-1">(TC ref. ARS {fmt(tcRef, 0)})</span>}
                </td>
                <td className="px-4 py-2.5 text-right font-mono font-semibold text-gray-800">{fmt(totalTribUSD, 0)}</td>
                <td className="px-4 py-2.5 text-right text-gray-400">{totalLanded > 0 ? fmt(totalTribUSD / totalLanded * 100, 1) : '0'}%</td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="bg-[#052698]">
                <td colSpan={2} className="px-4 py-3.5 font-bold text-white text-sm">TOTAL LANDED EN {(cot.destino_noa || '').toUpperCase()}</td>
                <td className="px-4 py-3.5 text-right font-mono font-bold text-white text-base">USD {fmt(totalLanded, 0)}</td>
                <td className="px-4 py-3.5 text-right text-blue-200 text-xs">100%</td>
              </tr>
              {nc > 1 && (
                <tr className="bg-[#EBF2FF]">
                  <td colSpan={2} className="px-4 py-2 text-[10px] text-[#052698]">Costo por contenedor</td>
                  <td colSpan={2} className="px-4 py-2 text-right font-mono text-[10px] font-semibold text-[#052698]">USD {fmt(totalLanded / nc, 0)} / cont.</td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>

        {/* PAGOS EN PESOS */}
        <div className="grid grid-cols-2 gap-4 mb-5">
          <div className="border border-gray-200 rounded-xl p-4">
            <div className="text-[10px] font-bold text-[#1168F8] uppercase tracking-wider mb-3">Tributos a pagar en Aduana (ARS)</div>
            <div className="text-2xl font-bold text-gray-900 mb-1">ARS {Math.round(totalTribARS).toLocaleString('es-AR')}</div>
            <div className="text-[10px] text-gray-400 space-y-0.5">
              <div>Equivalente USD ref.: USD {fmt(totalTribUSD, 0)}</div>
              {tcRef > 0 && <div>TC de referencia: ARS {fmt(tcRef, 0)} por USD</div>}
              <div className="text-amber-600 mt-1">Se abona al TC oficial BNA del día del despacho</div>
            </div>
          </div>
          <div className="border border-[#1168F8] rounded-xl p-4 bg-[#EBF2FF]">
            <div className="text-[10px] font-bold text-[#052698] uppercase tracking-wider mb-3">Resumen financiero</div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between"><span className="text-gray-600">Mercadería ({cot.incoterm})</span><span className="font-mono font-semibold">USD {fmt(totalFOB, 0)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Logística total</span><span className="font-mono font-semibold">USD {fmt(totalLog, 0)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Tributos ARCA (USD ref.)</span><span className="font-mono font-semibold">USD {fmt(totalTribUSD, 0)}</span></div>
              <div className="flex justify-between pt-1.5 border-t border-[#93B8FC] mt-1">
                <span className="font-bold text-[#052698]">TOTAL LANDED</span>
                <span className="font-mono font-bold text-[#052698]">USD {fmt(totalLanded, 0)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* TC DE REFERENCIA */}
        {tcRef > 0 && (
          <div className="border border-gray-200 rounded-xl px-5 py-3 mb-5 bg-gray-50">
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Tipos de cambio de referencia a la fecha de cotización</div>
            <div className="flex gap-6 text-xs">
              <div><span className="text-gray-500">TC oficial BNA (ARS/USD): </span><span className="font-mono font-semibold text-gray-800">ARS {fmt(tcRef, 0)}</span><span className="text-gray-400 ml-1">— para tributos y gastos locales</span></div>
            </div>
            <div className="text-[10px] text-amber-600 mt-1.5">⚠ Los pagos en pesos se realizarán al tipo de cambio oficial BNA vigente en la fecha efectiva de cada pago.</div>
          </div>
        )}

        {/* NOTAS */}
        {cot.notas && (
          <div className="border border-amber-200 rounded-xl px-4 py-3 mb-5 bg-amber-50">
            <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wider mb-1">Observaciones</div>
            <div className="text-xs text-amber-800">{cot.notas}</div>
          </div>
        )}

        {/* PIE DE PÁGINA */}
        <div className="border-t-2 border-[#1168F8] pt-4 mt-6">
          <div className="flex items-center justify-between">
            <div>
              <Image src="/logo.png" alt="Puerto NOA SpA" width={100} height={30} style={{ objectFit: 'contain', opacity: 0.7 }} />
            </div>
            <div className="text-center text-[10px] text-gray-400">
              <div>Esta cotización fue generada el {fechaEmision}{cot.validez ? ` · Válida por ${cot.validez}` : ''}.</div>
              <div>Los valores están expresados en USD. Los pagos en ARS se realizan al TC BNA del día efectivo de cada pago.</div>
            </div>
            <div className="text-right text-[10px] text-gray-400">
              <div className="font-mono font-medium text-gray-600">{cot.num}</div>
              <div>Puerto NOA SpA</div>
            </div>
          </div>
        </div>

      </div>
    </>
  )
}
