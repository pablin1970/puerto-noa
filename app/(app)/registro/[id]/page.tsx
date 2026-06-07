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
  maritimo: 'Flete marítimo', chile: 'Gastos Chile', terrestre: 'Transporte',
  argentina: 'Gastos Argentina', tributos: 'Tributos ARCA', fee: 'Fee Puerto NOA',
}

const CONDICIONES = [
  'Los valores expresados en USD son de referencia a la fecha de emisión de esta cotización.',
  'Los pagos en pesos argentinos (ARS) se realizarán al tipo de cambio oficial BNA vigente en la fecha efectiva de cada pago.',
  'Los tributos aduaneros se liquidan al TC oficial del día del despacho, pudiendo diferir del TC de referencia indicado.',
  'Esta cotización no incluye gastos no previstos que pudieran surgir por demoras, cambios regulatorios o instrucciones especiales del importador.',
  'Puerto NOA SpA actúa como agente logístico y gestor de la operación de importación.',
]

function DocHeader({ cot, fechaEmision, pagina, total }: { cot: any, fechaEmision: string, pagina: number, total: number }) {
  if (pagina === 1) return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', paddingBottom: '12px', marginBottom: '14px', borderBottom: '3px solid #1168F8' }}>
      <div>
        <Image src="/logo.png" alt="Puerto NOA SpA" width={170} height={50} style={{ objectFit: 'contain' }} />
        <div style={{ marginTop: '6px', fontSize: '10px', color: '#9ca3af', lineHeight: '1.5' }}>
          Puerto NOA SpA — Logística de importaciones China → NOA<br />
          Paso de Jama · San Salvador de Jujuy, Argentina
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: '9px', fontWeight: 700, color: '#9ca3af', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '2px' }}>Cotización</div>
        <div style={{ fontSize: '28px', fontWeight: 900, fontFamily: 'monospace', color: '#052698', letterSpacing: '-1px' }}>{cot.num}</div>
        <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>{fechaEmision}</div>
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '6px', flexWrap: 'wrap' }}>
          {cot.validez && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '3px 10px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '20px', fontSize: '9px', color: '#b45309', fontWeight: 600 }}>
              ⏱ Válida por {cot.validez}
            </span>
          )}
          <span style={{ display: 'inline-flex', padding: '3px 10px', borderRadius: '20px', fontSize: '9px', fontWeight: 700, background: cot.estado === 'aceptada' ? '#f0fdf4' : '#eff6ff', color: cot.estado === 'aceptada' ? '#15803d' : '#1168F8', border: `1px solid ${cot.estado === 'aceptada' ? '#86efac' : '#93c5fd'}` }}>
            {ESTADOS_L[cot.estado]}
          </span>
        </div>
      </div>
    </div>
  )
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '8px', marginBottom: '14px', borderBottom: '2px solid #1168F8' }}>
      <Image src="/logo.png" alt="Puerto NOA SpA" width={100} height={30} style={{ objectFit: 'contain', opacity: 0.7 }} />
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#374151' }}>COTIZACIÓN {cot.num}</div>
        <div style={{ fontSize: '10px', color: '#9ca3af' }}>{cot.cliente}</div>
      </div>
      <div style={{ textAlign: 'right', fontSize: '9px', color: '#9ca3af', fontFamily: 'monospace' }}>
        {fechaEmision} · Pág. {pagina}/{total}
      </div>
    </div>
  )
}

function DocFooter({ cot, fechaEmision, pagina, total }: { cot: any, fechaEmision: string, pagina: number, total: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '8px', borderTop: pagina === total ? '2px solid #1168F8' : '1px solid #e5e7eb', marginTop: 'auto' }}>
      {pagina === total
        ? <Image src="/logo.png" alt="Puerto NOA" width={80} height={24} style={{ objectFit: 'contain', opacity: 0.5 }} />
        : <div style={{ fontSize: '9px', color: '#9ca3af' }}>Puerto NOA SpA · Importaciones China → NOA Argentino</div>
      }
      <div style={{ textAlign: 'center', fontSize: '9px', color: '#9ca3af' }}>
        {pagina === total && <div style={{ fontWeight: 700, color: '#374151', fontSize: '10px' }}>Puerto NOA SpA</div>}
        {pagina === total && <div>San Salvador de Jujuy, Argentina · Paso de Jama</div>}
        {pagina === total && <div>Importaciones China → NOA Argentino</div>}
        {pagina !== total && <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#6b7280' }}>{cot.num}</span>}
      </div>
      <div style={{ textAlign: 'right', fontSize: '9px', color: '#9ca3af', fontFamily: 'monospace' }}>
        {pagina === total && <div style={{ fontWeight: 700, color: '#374151' }}>{cot.num}</div>}
        {pagina === total && <div>Emitida: {fechaEmision}</div>}
        <div style={{ marginTop: pagina === total ? '2px' : '0', fontWeight: 700, color: '#374151', fontSize: '10px' }}>Pág. {pagina}/{total}</div>
      </div>
    </div>
  )
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
      if (error) console.error('Error:', error)
      if (data) {
        setCot(data as Cotizacion)
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

  if (loading) return <div className="p-8 text-gray-400">Cargando...</div>
  if (!cot) return (
    <div className="p-8">
      <div className="text-gray-400 text-sm mb-2">Cotización no encontrada.</div>
      <div className="text-[10px] text-gray-300 font-mono">ID: {id}</div>
      <a href="/registro" className="text-xs text-[#1168F8] hover:underline mt-2 block">← Volver</a>
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
  const hayComparativa = precioArg > 0
  const ahorro = precioArg - totalLanded
  const fechaEmision = cot.created_at ? new Date(cot.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' }) : ''
  const TOTAL_PAGS = 2

  // Shared cell style
  const th = { padding: '6px 10px', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: '#9ca3af', background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }
  const td = { padding: '7px 10px', fontSize: '11px', borderBottom: '1px solid #f1f5f9' }
  const tdGray = { ...td, fontSize: '10px', color: '#6b7280' }

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #printable, #printable * { visibility: visible; }
          #printable { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          @page { margin: 0; size: A4 portrait; }
          #printable * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .doc-page {
            width: 210mm;
            height: 297mm;
            padding: 12mm 14mm;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            page-break-after: always;
            page-break-inside: avoid;
          }
          .doc-page:last-child { page-break-after: auto; }
        }
      `}</style>

      {/* CONTROLES */}
      <div className="no-print bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <Link href="/registro" className="text-xs text-gray-400 hover:text-gray-600">← Cotizaciones</Link>
          <span className="text-gray-300">|</span>
          <span className="font-mono font-bold text-gray-800">{cot.num}</span>
          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${ESTADO_CLS[cot.estado]}`}>{ESTADOS_L[cot.estado]}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {hayComparativa && (
            <button onClick={() => setMostrarComparativa(!mostrarComparativa)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold border transition-colors ${mostrarComparativa ? 'bg-[#1168F8] text-white border-[#1168F8]' : 'bg-white border-gray-200 text-gray-600'}`}>
              {mostrarComparativa ? '✓ Con comparativa' : '+ Agregar comparativa'}
            </button>
          )}
          <span className="text-xs text-gray-400">Estado:</span>
          {(['enviada','aceptada','rechazada','vencida'] as EstadoCotizacion[]).filter(e => e !== cot.estado).map(e => (
            <button key={e} onClick={() => cambiarEstado(e)} className={`px-3 py-1.5 rounded-full text-[10px] font-semibold border ${ESTADO_CLS[e]}`}>{ESTADOS_L[e]}</button>
          ))}
          {cot.estado === 'aceptada' && (
            <button onClick={() => router.push(`/operaciones?cot=${cot.id}`)} className="px-3 py-1.5 bg-[#1168F8] text-white rounded-lg text-xs font-medium hover:bg-[#0a4fc4]">🚢 Operación</button>
          )}
          <button onClick={() => {
            const t = document.title
            document.title = `Cotizacion_${cot.num}_${cot.cliente.replace(/\s+/g,'-')}`
            window.print()
            document.title = t
          }} className="px-4 py-2 bg-[#052698] text-white rounded-lg text-xs font-bold hover:bg-[#1168F8] transition-colors">
            🖨 Imprimir / PDF
          </button>
        </div>
      </div>

      <div id="printable" className="max-w-4xl mx-auto">

        {/* ══ PÁGINA 1: Propuesta comercial ══ */}
        <div className="doc-page bg-white">
          <DocHeader cot={cot} fechaEmision={fechaEmision} pagina={1} total={TOTAL_PAGS} />

          {/* Cliente + Ruta */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
              <div style={{ padding: '7px 14px', background: '#1168F8', color: 'white', fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}>Datos del cliente</div>
              <div style={{ padding: '12px 14px' }}>
                {[
                  { l: 'Razón social', v: cot.cliente, bold: true },
                  { l: 'CUIT', v: cot.cuit, mono: true },
                  { l: 'Email', v: cot.email_cliente },
                  { l: 'Teléfono', v: cot.telefono_cliente },
                  { l: 'Despachante', v: (cot as any).despachante },
                ].filter(r => r.v).map(r => (
                  <div key={r.l} style={{ display: 'flex', gap: '10px', marginBottom: '5px', fontSize: '11px' }}>
                    <span style={{ color: '#9ca3af', width: '90px', flexShrink: 0 }}>{r.l}</span>
                    <span style={{ fontWeight: r.bold ? 700 : 400, color: r.bold ? '#111827' : '#374151', fontFamily: r.mono ? 'monospace' : 'inherit' }}>{r.v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
              <div style={{ padding: '7px 14px', background: '#052698', color: 'white', fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}>Ruta de importación</div>
              <div style={{ padding: '12px 14px' }}>
                {[
                  { l: 'Origen', v: cot.origen },
                  { l: 'Puerto Chile', v: PUERTOS_L[cot.puerto_chile || ''] || cot.puerto_chile },
                  { l: 'Destino NOA', v: cot.destino_noa, bold: true },
                  { l: 'Incoterm', v: cot.incoterm, blue: true, bold: true },
                  { l: 'Tránsito est.', v: cot.transito },
                  { l: 'Modalidad', v: `Opción ${(cot as any).opcion_transporte || 'A1'} · ${(cot as any).opcion_transporte === 'B' ? 'Contenedor completo' : 'Desconsolidado'}` },
                ].filter(r => r.v).map(r => (
                  <div key={r.l} style={{ display: 'flex', gap: '10px', marginBottom: '5px', fontSize: '11px' }}>
                    <span style={{ color: '#9ca3af', width: '100px', flexShrink: 0 }}>{r.l}</span>
                    <span style={{ fontWeight: r.bold ? 700 : 400, color: r.blue ? '#1168F8' : '#374151' }}>{r.v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Mercadería */}
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden', marginBottom: '14px' }}>
            <div style={{ padding: '8px 14px', background: '#052698', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: '12px' }}>Mercadería importada</span>
              <span style={{ fontSize: '10px', color: '#bfdbfe' }}>{contenedores.map((c: any) => `${c.cantidad}× ${c.tipo}`).join(' + ')} · {nc} contenedor(es)</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: 'left', width: '40%' }}>Descripción del producto</th>
                  <th style={{ ...th, textAlign: 'center' }}>NCM</th>
                  <th style={{ ...th, textAlign: 'right' }}>Cant.</th>
                  <th style={{ ...th, textAlign: 'right' }}>P. Unit. USD</th>
                  <th style={{ ...th, textAlign: 'right' }}>Subtotal USD</th>
                </tr>
              </thead>
              <tbody>
                {productos.map((p: any, i: number) => (
                  <tr key={i}>
                    <td style={{ ...td, fontWeight: 600, color: '#111827' }}>{p.descripcion}</td>
                    <td style={{ ...tdGray, textAlign: 'center', fontFamily: 'monospace' }}>{p.ncm || '—'}</td>
                    <td style={{ ...tdGray, textAlign: 'right' }}>{p.cantidad}</td>
                    <td style={{ ...tdGray, textAlign: 'right', fontFamily: 'monospace' }}>{fmt(p.precio_unit || 0)}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, fontFamily: 'monospace' }}>USD {fmt(p.subtotal)}</td>
                  </tr>
                ))}
                {productos.length < 4 && Array.from({ length: 4 - productos.length }).map((_, i) => (
                  <tr key={`e${i}`}>
                    <td style={{ ...tdGray, color: '#e5e7eb' }}>—</td>
                    <td colSpan={4} style={{ borderBottom: '1px solid #f8fafc' }}></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#EBF2FF', borderTop: '2px solid #1168F8' }}>
                  <td colSpan={4} style={{ padding: '8px 10px', fontWeight: 700, color: '#052698', fontSize: '11px' }}>VALOR {cot.incoterm} CHINA</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 900, color: '#052698', fontSize: '13px', fontFamily: 'monospace' }}>USD {fmt(totalFOB, 0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Estructura de costos */}
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden', marginBottom: '12px', flex: 1 }}>
            <div style={{ padding: '8px 14px', background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
              <div style={{ fontWeight: 700, fontSize: '12px', color: '#111827' }}>Estructura de costos hasta {cot.destino_noa}</div>
              <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>Valores en USD a tipo de cambio de referencia · Régimen {regimen}</div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: 'left', width: '130px' }}>Sección</th>
                  <th style={{ ...th, textAlign: 'left' }}>Concepto</th>
                  <th style={{ ...th, textAlign: 'right', width: '90px' }}>USD</th>
                  <th style={{ ...th, textAlign: 'right', width: '75px' }}>% s/landed</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ background: '#eff6ff', borderBottom: '1px solid #dbeafe' }}>
                  <td style={{ ...td, fontWeight: 700, color: '#052698', fontSize: '10px' }}>Mercadería</td>
                  <td style={{ ...td, color: '#374151' }}>Valor {cot.incoterm} China · {productos.length} producto(s)</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: '#111827' }}>{fmt(totalFOB, 0)}</td>
                  <td style={{ ...td, textAlign: 'right', color: '#9ca3af', fontSize: '10px' }}>{totalLanded > 0 ? fmt(totalFOB / totalLanded * 100, 1) : '0'}%</td>
                </tr>
                {presup.filter((it: any) => it.tipo !== 'tributos').map((it: any, i: number) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ ...tdGray, fontSize: '10px' }}>{ETAPA_L[it.etapa] || it.etapa}</td>
                    <td style={{ ...td, color: '#374151' }}>{it.concepto}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace', color: '#6b7280' }}>{fmt(it.usd, 0)}</td>
                    <td style={{ ...td, textAlign: 'right', color: '#d1d5db', fontSize: '10px' }}>{totalLanded > 0 ? fmt(it.usd / totalLanded * 100, 1) : '0'}%</td>
                  </tr>
                ))}
                <tr style={{ background: '#f8fafc', borderTop: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb' }}>
                  <td colSpan={2} style={{ ...td, fontWeight: 700, fontSize: '11px', color: '#374151' }}>Subtotal costos logísticos</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: '#374151' }}>{fmt(totalLog, 0)}</td>
                  <td style={{ ...td, textAlign: 'right', color: '#9ca3af', fontSize: '10px' }}>{totalLanded > 0 ? fmt(totalLog / totalLanded * 100, 1) : '0'}%</td>
                </tr>
                <tr style={{ background: '#fffbeb', borderBottom: '1px solid #fde68a' }}>
                  <td style={{ ...td, fontWeight: 700, color: '#b45309', fontSize: '10px' }}>Tributos ARCA</td>
                  <td style={{ ...td, color: '#374151' }}>Régimen {regimen} · Aduana Jujuy · Base CIF Jama{tcRef > 0 ? ` (TC ref. ARS ${fmt(tcRef, 0)})` : ''}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: '#111827' }}>{fmt(totalTribUSD, 0)}</td>
                  <td style={{ ...td, textAlign: 'right', color: '#9ca3af', fontSize: '10px' }}>{totalLanded > 0 ? fmt(totalTribUSD / totalLanded * 100, 1) : '0'}%</td>
                </tr>
              </tbody>
              <tfoot>
                <tr style={{ background: '#052698' }}>
                  <td colSpan={2} style={{ padding: '10px', fontWeight: 900, color: 'white', fontSize: '12px' }}>TOTAL LANDED EN {(cot.destino_noa || 'DESTINO').toUpperCase()}</td>
                  <td style={{ padding: '10px', textAlign: 'right', fontWeight: 900, color: 'white', fontSize: '14px', fontFamily: 'monospace' }}>USD {fmt(totalLanded, 0)}</td>
                  <td style={{ padding: '10px', textAlign: 'right', color: '#93c5fd', fontSize: '11px', fontWeight: 700 }}>100%</td>
                </tr>
                {nc > 0 && (
                  <tr style={{ background: '#EBF2FF' }}>
                    <td colSpan={2} style={{ padding: '6px 10px', fontSize: '10px', color: '#052698', fontWeight: 500 }}>Costo por contenedor</td>
                    <td colSpan={2} style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'monospace', fontSize: '10px', fontWeight: 700, color: '#052698' }}>USD {fmt(totalLanded / nc, 0)} / cont.</td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>

          <DocFooter cot={cot} fechaEmision={fechaEmision} pagina={1} total={TOTAL_PAGS} />
        </div>

        {/* ══ PÁGINA 2: Resumen financiero ══ */}
        <div className="doc-page bg-white">
          <DocHeader cot={cot} fechaEmision={fechaEmision} pagina={2} total={TOTAL_PAGS} />

          {/* Resumen + Tributos */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div style={{ border: '2px solid #1168F8', borderRadius: '10px', overflow: 'hidden' }}>
              <div style={{ padding: '8px 16px', background: '#1168F8', color: 'white', fontWeight: 700, fontSize: '10px', letterSpacing: '1px', textTransform: 'uppercase' }}>Resumen financiero</div>
              <div style={{ padding: '16px' }}>
                {[
                  { l: `Mercadería (${cot.incoterm})`, v: `USD ${fmt(totalFOB, 0)}`, sub: null },
                  { l: 'Costos logísticos', v: `USD ${fmt(totalLog, 0)}`, sub: null },
                  { l: 'Tributos ARCA (ref.)', v: `USD ${fmt(totalTribUSD, 0)}`, sub: `ARS ${Math.round(totalTribARS).toLocaleString('es-AR')}` },
                ].map(r => (
                  <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                    <div>
                      <div style={{ fontSize: '11px', color: '#6b7280' }}>{r.l}</div>
                      {r.sub && <div style={{ fontSize: '10px', color: '#9ca3af', fontFamily: 'monospace' }}>{r.sub}</div>}
                    </div>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#111827', fontSize: '11px' }}>{r.v}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '10px', borderTop: '2px solid #1168F8', marginTop: '4px' }}>
                  <span style={{ fontWeight: 900, color: '#052698', fontSize: '13px' }}>TOTAL LANDED</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 900, color: '#1168F8', fontSize: '18px' }}>USD {fmt(totalLanded, 0)}</span>
                </div>
                {nc > 1 && <div style={{ textAlign: 'right', fontSize: '10px', color: '#1168F8', fontFamily: 'monospace', marginTop: '4px' }}>USD {fmt(totalLanded / nc, 0)} por contenedor</div>}
              </div>
            </div>
            <div style={{ border: '1px solid #fde68a', borderRadius: '10px', overflow: 'hidden' }}>
              <div style={{ padding: '8px 16px', background: '#f59e0b', color: 'white', fontWeight: 700, fontSize: '10px', letterSpacing: '1px', textTransform: 'uppercase' }}>Tributos a pagar en Aduana (ARS)</div>
              <div style={{ padding: '16px' }}>
                <div style={{ fontSize: '30px', fontWeight: 900, color: '#111827', fontFamily: 'monospace', marginBottom: '12px', lineHeight: 1.1 }}>
                  ARS {Math.round(totalTribARS).toLocaleString('es-AR')}
                </div>
                <div style={{ fontSize: '11px', color: '#6b7280', lineHeight: 1.6 }}>
                  <div>Equivalente USD ref.: <strong style={{ color: '#374151' }}>USD {fmt(totalTribUSD, 0)}</strong></div>
                  {tcRef > 0 && <div>TC de referencia: <strong style={{ fontFamily: 'monospace', color: '#374151' }}>ARS {fmt(tcRef, 0)} / USD</strong></div>}
                  <div style={{ color: '#b45309', fontWeight: 600, marginTop: '8px', fontSize: '10px' }}>
                    ⚠ Se abona al TC oficial BNA vigente el día del despacho. El monto en pesos puede variar.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Comparativa — solo si activada */}
          {mostrarComparativa && hayComparativa && (
            <div style={{ border: `2px solid ${ahorro > 0 ? '#16a34a' : '#dc2626'}`, borderRadius: '10px', overflow: 'hidden', marginBottom: '16px' }}>
              <div style={{ padding: '8px 16px', background: ahorro > 0 ? '#16a34a' : '#dc2626', color: 'white', fontWeight: 700, fontSize: '10px', letterSpacing: '1px', textTransform: 'uppercase' }}>
                📊 Comparativa: importar vs. precio local
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', padding: '16px' }}>
                <div style={{ textAlign: 'center', padding: '12px', background: '#eff6ff', borderRadius: '8px' }}>
                  <div style={{ fontSize: '10px', color: '#6b7280', marginBottom: '4px' }}>Costo importación</div>
                  <div style={{ fontFamily: 'monospace', fontWeight: 900, color: '#052698', fontSize: '16px' }}>USD {fmt(totalLanded, 0)}</div>
                </div>
                <div style={{ textAlign: 'center', padding: '12px', background: '#f9fafb', borderRadius: '8px' }}>
                  <div style={{ fontSize: '10px', color: '#6b7280', marginBottom: '4px' }}>Precio equivalente local</div>
                  <div style={{ fontFamily: 'monospace', fontWeight: 900, color: '#374151', fontSize: '16px' }}>USD {fmt(precioArg, 0)}</div>
                </div>
                <div style={{ textAlign: 'center', padding: '12px', background: ahorro > 0 ? '#f0fdf4' : '#fef2f2', borderRadius: '8px' }}>
                  <div style={{ fontSize: '10px', color: '#6b7280', marginBottom: '4px' }}>{ahorro > 0 ? 'Ahorro estimado' : 'Diferencia'}</div>
                  <div style={{ fontFamily: 'monospace', fontWeight: 900, color: ahorro > 0 ? '#15803d' : '#dc2626', fontSize: '16px' }}>
                    {ahorro > 0 ? '+' : ''}USD {fmt(Math.abs(ahorro), 0)}
                  </div>
                  <div style={{ fontSize: '9px', fontWeight: 700, color: ahorro > 0 ? '#15803d' : '#dc2626', marginTop: '2px' }}>
                    {ahorro > 0 ? `${fmt(ahorro / precioArg * 100, 1)}% más económico` : 'Por encima del precio local'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tipo de cambio */}
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px', background: '#f8fafc' }}>
            <div style={{ fontWeight: 700, fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Tipos de cambio aplicados</div>
            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '11px' }}>
                <span style={{ color: '#9ca3af' }}>TC oficial BNA (ARS/USD): </span>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#374151' }}>ARS {fmt(tcRef, 0)}</span>
                <span style={{ fontSize: '10px', color: '#9ca3af' }}> — tributos y gastos locales</span>
              </div>
            </div>
          </div>

          {/* Notas */}
          {cot.notas && (
            <div style={{ border: '1px solid #fde68a', borderRadius: '10px', overflow: 'hidden', marginBottom: '16px', background: '#fffbeb' }}>
              <div style={{ padding: '6px 14px', fontWeight: 700, fontSize: '10px', color: '#92400e', textTransform: 'uppercase', letterSpacing: '1px' }}>Observaciones</div>
              <div style={{ padding: '8px 14px 14px', fontSize: '11px', color: '#78350f' }}>{cot.notas}</div>
            </div>
          )}

          {/* Condiciones generales */}
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden', marginBottom: '14px' }}>
            <div style={{ padding: '7px 16px', background: '#f8fafc', borderBottom: '1px solid #e5e7eb', fontWeight: 700, fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Condiciones generales
            </div>
            <div style={{ padding: '12px 18px' }}>
              <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {CONDICIONES.map((c, i) => (
                  <li key={i} style={{ display: 'flex', gap: '10px', marginBottom: '8px', fontSize: '10.5px', color: '#6b7280', lineHeight: 1.4 }}>
                    <span style={{ color: '#1168F8', fontWeight: 700, flexShrink: 0, width: '16px' }}>{i + 1}.</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {/* Firma */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '14px' }}>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '16px' }}>
              <div style={{ fontWeight: 700, fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '32px' }}>Por Puerto NOA SpA</div>
              <div style={{ borderBottom: '1px solid #9ca3af', marginBottom: '8px' }}></div>
              <div style={{ fontWeight: 700, fontSize: '12px', color: '#111827' }}>{ejecutivo?.nombre || '_____________________________'}</div>
              <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>{ejecutivo ? (ejecutivo.rol === 'admin' ? 'Dirección' : 'Ejecutivo de operaciones') : 'Cargo'}</div>
              {ejecutivo?.email && <div style={{ fontSize: '10px', color: '#1168F8', marginTop: '3px' }}>{ejecutivo.email}</div>}
              {(ejecutivo as any)?.telefono && <div style={{ fontSize: '10px', color: '#6b7280' }}>{(ejecutivo as any).telefono}</div>}
            </div>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '16px' }}>
              <div style={{ fontWeight: 700, fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '32px' }}>Aceptación del cliente</div>
              <div style={{ borderBottom: '1px solid #9ca3af', marginBottom: '8px' }}></div>
              <div style={{ fontWeight: 700, fontSize: '12px', color: '#111827' }}>{cot.cliente}</div>
              {cot.cuit && <div style={{ fontSize: '10px', color: '#9ca3af', fontFamily: 'monospace', marginTop: '2px' }}>CUIT: {cot.cuit}</div>}
              <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '3px' }}>Fecha: ___/___/______</div>
            </div>
          </div>

          <div style={{ flex: 1 }}></div>
          <DocFooter cot={cot} fechaEmision={fechaEmision} pagina={2} total={TOTAL_PAGS} />
        </div>

      </div>
    </>
  )
}
