'use client'
import { useEffect, useState, useMemo, Suspense } from 'react'
import { createClient } from '@/lib/supabase'
import { fmt, ETAPAS_L, ETAPAS_ORD, nowDate } from '@/lib/utils'
import type { Cotizacion, Operacion } from '@/types'
import { useSearchParams } from 'next/navigation'
import { cargarPermisos, puede } from '@/lib/permisos'
import { urlVerConMarca } from '@/lib/documentos'

type Tab = 'resumen' | 'facturas' | 'comparativo' | 'caja' | 'cierre' | 'minuta' | 'documentos'

// ── Tipos locales (la operación solo refleja; la carga vive en Facturación/Tesorería) ──
interface FacturaOp {
  id: string
  origen: 'emitida' | 'recibida'
  numero: string
  fecha: string
  contraparte: string          // cliente (emitida) o proveedor (recibida)
  etapa: string | null
  moneda: string
  total: number
  total_usd: number | null
  estado: string
  facturada_a: string | null   // solo recibidas: 'puerto_noa' | 'cliente'
  a_recuperar: boolean | null
  via: string | null           // via_cobro (emitida) | via_pago (recibida)
  archivo_url: string | null
  archivo_nombre: string | null
}

interface FondoMov {
  id: string
  fecha: string
  tipo: string
  concepto: string
  moneda: string
  monto: number
  tc_usd: number
  usd: number
  nro_referencia: string | null
  comprobante_url: string | null
  comprobante_nombre: string | null
  cuenta?: { nombre: string; tipo: string; pais: string; moneda: string } | null
}

// Tipos de movimiento que suman / restan al saldo de la caja a rendir de la operación
const MOV_INGRESO = ['ingreso_cliente', 'cobro_diferencia']
const MOV_EGRESO = ['pago_proveedor', 'honorarios_puertonoa', 'devolucion_cliente']
function signoUsd(m: { tipo: string; usd: number }): number {
  if (m.tipo === 'transferencia') return 0
  if (MOV_INGRESO.includes(m.tipo)) return m.usd
  if (MOV_EGRESO.includes(m.tipo)) return -m.usd
  if (m.tipo === 'ajuste_cambio') return m.usd   // guarda su propio signo
  return -m.usd
}

const usdDe = (f: FacturaOp) => f.total_usd ?? 0
const estaSaldada = (f: FacturaOp) => f.estado === 'pagada'

function OperacionesContent() {
  const searchParams = useSearchParams()
  const cotId = searchParams.get('cot')
  const [ops, setOps] = useState<Array<Operacion & { cotizacion: Cotizacion }>>([])
  const [selId, setSelId] = useState<string>('')
  const [tab, setTab] = useState<Tab>('resumen')
  const [loading, setLoading] = useState(true)
  const [permisos, setPermisos] = useState<Record<string, string[]>>({})
  const supabase = createClient()

  useEffect(() => { loadData(); cargarPermisos().then(setPermisos) }, [])

  async function loadData() {
    const { data } = await supabase
      .from('operaciones')
      .select('*, cotizacion:cotizaciones(*)')
      .order('created_at', { ascending: false })
    if (data && data.length) {
      setOps(data as any)
      const preferred = cotId ? data.find((o: any) => o.cotizacion_id === cotId) : null
      setSelId(preferred ? (preferred as any).id : (data[0] as any).id)
    }
    setLoading(false)
  }

  const op = ops.find(o => o.id === selId)
  const cot = op?.cotizacion

  if (loading) return <div className="p-8 text-gray-400 text-sm">Cargando...</div>
  if (!ops.length) return (
    <div className="p-8 text-center">
      <p className="text-gray-500 text-sm mb-3">No hay operaciones activas.</p>
      <p className="text-xs text-gray-400">Las operaciones se crean automáticamente cuando una cotización pasa a estado <strong>Aceptada</strong>.</p>
    </div>
  )

  return (
    <div className="p-6">
      <div className="mb-5 flex items-center gap-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Seguimiento de operaciones</h1>
          <p className="text-xs text-gray-400 mt-0.5">Control de la operación — facturas, caja a rendir y cierre</p>
        </div>
        <select value={selId} onChange={e => setSelId(e.target.value)}
          className="ml-auto px-3 py-2 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:border-[#1168F8]">
          {ops.map(o => <option key={o.id} value={o.id}>{o.cotizacion?.num} — {o.cotizacion?.cliente}</option>)}
        </select>
      </div>
      {op && cot && <OperacionDetail op={op} cot={cot} tab={tab} setTab={setTab} reload={loadData} permisos={permisos} />}
    </div>
  )
}

function OperacionDetail({ op, cot, tab, setTab, reload, permisos }: {
  op: Operacion & { cotizacion: Cotizacion }
  cot: Cotizacion
  tab: Tab
  setTab: (t: Tab) => void
  reload: () => void
  permisos: Record<string, string[]>
}) {
  const [facturas, setFacturas] = useState<FacturaOp[]>([])
  const [movs, setMovs] = useState<FondoMov[]>([])
  const [docs, setDocs] = useState<any[]>([])
  const [loadingDetail, setLoadingDetail] = useState(true)
  const supabase = createClient()

  useEffect(() => { loadDetail() }, [op.id])

  async function loadDetail() {
    setLoadingDetail(true)
    const [fe, fr, mv, d] = await Promise.all([
      supabase.from('facturas_emitidas')
        .select('id,folio,fecha_emision,cliente_razon_social,etapa,moneda,total,total_usd,estado,via_cobro,archivo_url,archivo_nombre')
        .eq('operacion_id', op.id).order('fecha_emision'),
      supabase.from('facturas_recibidas')
        .select('id,folio,fecha_emision,proveedor_razon_social,etapa,moneda,total,total_usd,estado,facturada_a,a_recuperar,via_pago,archivo_url,archivo_nombre')
        .eq('operacion_id', op.id).order('fecha_emision'),
      supabase.from('fondos_movimientos')
        .select('*, cuenta:fondos_cuentas!fondos_movimientos_cuenta_id_fkey(nombre,tipo,pais,moneda)')
        .eq('operacion_id', op.id).order('fecha'),
      supabase.from('operacion_documentos').select('*').eq('operacion_id', op.id).order('created_at'),
    ])
    const fac: FacturaOp[] = []
    if (fe.data) for (const f of fe.data as any[]) fac.push({
      id: f.id, origen: 'emitida', numero: f.folio ? `#${f.folio}` : 'Sin folio', fecha: f.fecha_emision,
      contraparte: f.cliente_razon_social, etapa: f.etapa, moneda: f.moneda, total: f.total, total_usd: f.total_usd,
      estado: f.estado, facturada_a: null, a_recuperar: null, via: f.via_cobro,
      archivo_url: f.archivo_url, archivo_nombre: f.archivo_nombre,
    })
    if (fr.data) for (const f of fr.data as any[]) fac.push({
      id: f.id, origen: 'recibida', numero: f.folio || 'Sin folio', fecha: f.fecha_emision,
      contraparte: f.proveedor_razon_social, etapa: f.etapa, moneda: f.moneda, total: f.total, total_usd: f.total_usd,
      estado: f.estado, facturada_a: f.facturada_a, a_recuperar: f.a_recuperar, via: f.via_pago,
      archivo_url: f.archivo_url, archivo_nombre: f.archivo_nombre,
    })
    setFacturas(fac)
    if (mv.data) setMovs(mv.data as any[])
    if (d.data) setDocs(d.data as any[])
    setLoadingDetail(false)
  }

  async function cambiarTipo(nuevo: 'gestion' | 'propia') {
    await (supabase.from('operaciones') as any).update({ tipo: nuevo }).eq('id', op.id)
    reload()
  }

  const tipoOp = (op as any).tipo === 'propia' ? 'propia' : 'gestion'
  const cerrada = op.estado === 'cerrada'

  const presup = Array.isArray(cot.presupuesto) ? cot.presupuesto : []
  const totalPresup = presup.reduce((s: number, i: any) => s + (i.usd || 0), 0)

  // Facturado de la operación: recibidas (gasto) + emitidas (lo que PN factura)
  const facturadoGasto = facturas.filter(f => f.origen === 'recibida').reduce((s, f) => s + usdDe(f), 0)
  const facturadoPN = facturas.filter(f => f.origen === 'emitida').reduce((s, f) => s + usdDe(f), 0)
  const totalFacturado = facturadoGasto + facturadoPN
  const saldadoUsd = facturas.filter(estaSaldada).reduce((s, f) => s + usdDe(f), 0)
  const pendienteUsd = facturas.filter(f => !estaSaldada(f)).reduce((s, f) => s + usdDe(f), 0)

  // Caja a rendir de la operación
  const saldoCaja = movs.reduce((s, m) => s + signoUsd(m), 0)
  const pct = totalPresup > 0 ? Math.min(facturadoGasto / totalPresup * 100, 150) : 0
  const diff = facturadoGasto - totalPresup

  const TABS: { key: Tab; label: string }[] = [
    { key: 'resumen', label: 'Resumen' },
    { key: 'facturas', label: 'Facturas' },
    { key: 'comparativo', label: 'Presup. vs. Real' },
    { key: 'caja', label: 'Caja a rendir' },
    { key: 'cierre', label: 'Cierre' },
    { key: 'minuta', label: 'Minuta de pago' },
    { key: 'documentos', label: '📁 Documentos' },
  ]

  return (
    <>
      {/* Tipo de operación + estado */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg p-1">
          <button onClick={() => cambiarTipo('gestion')} disabled={cerrada}
            className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-colors ${tipoOp === 'gestion' ? 'bg-[#1168F8] text-white' : 'text-gray-500 hover:bg-gray-50'} disabled:opacity-50`}>
            Gestión de tercero
          </button>
          <button onClick={() => cambiarTipo('propia')} disabled={cerrada}
            className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-colors ${tipoOp === 'propia' ? 'bg-[#7C3AED] text-white' : 'text-gray-500 hover:bg-gray-50'} disabled:opacity-50`}>
            Importación propia
          </button>
        </div>
        <span className="text-[10px] text-gray-400 max-w-md">
          {tipoOp === 'gestion'
            ? 'PN gestiona la carga de un tercero · caja a rendir · liquidaciones ARCA a nombre del cliente'
            : 'PN es el importador · paga todo a su nombre · factura el producto nacionalizado'}
        </span>
        {cerrada && <span className="ml-auto px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-[10px] font-bold border border-gray-200">🔒 Operación cerrada</span>}
      </div>

      <div className="flex gap-2 mb-5 flex-wrap">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${tab === t.key ? 'bg-[#1168F8] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loadingDetail ? <div className="p-8 text-gray-400 text-sm">Cargando detalle...</div> : (
        <>
          {tab === 'resumen' && (
            <div>
              <div className="grid grid-cols-4 gap-3 mb-5">
                {[
                  { label: 'Presupuestado', value: `USD ${fmt(totalPresup, 0)}`, color: 'text-gray-900' },
                  { label: 'Facturado (gasto real)', value: `USD ${fmt(facturadoGasto, 0)}`, color: pct > 110 ? 'text-red-600' : 'text-gray-900' },
                  { label: 'Saldado', value: `USD ${fmt(saldadoUsd, 0)}`, color: 'text-green-700' },
                  { label: 'Saldo caja a rendir', value: `USD ${fmt(saldoCaja, 0)}`, color: saldoCaja >= 0 ? 'text-[#052698]' : 'text-red-600' },
                ].map(s => (
                  <div key={s.label} className="bg-white border border-gray-100 rounded-xl p-4">
                    <div className={`text-xl font-semibold ${s.color}`}>{s.value}</div>
                    <div className="text-[10px] text-gray-400 mt-1">{s.label}</div>
                  </div>
                ))}
              </div>
              <div className="bg-white border border-gray-100 rounded-xl p-5 mb-4">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                  <span>Ejecución del presupuesto (gasto real vs presupuestado)</span><span>{fmt(pct, 1)}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-4">
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: pct > 110 ? '#A32D2D' : pct > 90 ? '#EF9F27' : '#1168F8' }} />
                </div>
                <div className={`text-xs px-3 py-2 rounded-lg ${pct > 110 ? 'bg-red-50 text-red-700' : pct > 90 ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'}`}>
                  {pct > 110 ? `⚠ El gasto real supera el presupuesto en USD ${fmt(Math.abs(diff), 0)} (${fmt(pct, 1)}%)` :
                    pct > 90 ? `Gasto cerca del presupuesto (${fmt(pct, 1)}%). Monitorear.` :
                      `✓ Dentro del presupuesto (${fmt(pct, 1)}%).`}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white border border-gray-100 rounded-xl p-4">
                  <div className="text-[10px] text-gray-400 mb-1">Facturas de la operación</div>
                  <div className="text-lg font-semibold text-gray-900">{facturas.length}</div>
                  <div className="text-[10px] text-gray-400 mt-1">{facturas.filter(estaSaldada).length} saldadas · {facturas.filter(f => !estaSaldada(f)).length} pendientes</div>
                </div>
                <div className="bg-white border border-gray-100 rounded-xl p-4">
                  <div className="text-[10px] text-gray-400 mb-1">Pendiente de pago</div>
                  <div className="text-lg font-semibold text-amber-600">USD {fmt(pendienteUsd, 0)}</div>
                  <div className="text-[10px] text-gray-400 mt-1">facturado por PN: USD {fmt(facturadoPN, 0)}</div>
                </div>
                <div className={`border rounded-xl p-4 ${saldoCaja >= 0 ? 'bg-[#EBF2FF] border-[#93B8FC]' : 'bg-red-50 border-red-200'}`}>
                  <div className={`text-[10px] font-medium mb-1 ${saldoCaja >= 0 ? 'text-[#052698]' : 'text-red-700'}`}>Saldo caja a rendir</div>
                  <div className={`text-lg font-semibold ${saldoCaja >= 0 ? 'text-[#052698]' : 'text-red-700'}`}>USD {fmt(saldoCaja, 0)}</div>
                  <div className={`text-[10px] mt-1 ${saldoCaja >= 0 ? 'text-green-600' : 'text-red-600'}`}>{saldoCaja < 0 ? '⚠ Solicitar fondos al cliente' : saldoCaja === 0 ? 'Caja en cero' : 'Fondos disponibles'}</div>
                </div>
              </div>
            </div>
          )}

          {tab === 'facturas' && <FacturasTab facturas={facturas} cot={cot} tipoOp={tipoOp} permisos={permisos} reload={loadDetail} />}
          {tab === 'comparativo' && <ComparativoTab presup={presup} facturas={facturas} />}
          {tab === 'caja' && <CajaRendirTab opId={op.id} cotNum={cot.num || ''} movs={movs} saldo={saldoCaja} permisos={permisos} />}
          {tab === 'cierre' && <CierreTab op={op} saldoCaja={saldoCaja} totalPresup={totalPresup} facturadoGasto={facturadoGasto} saldadoUsd={saldadoUsd} pendienteUsd={pendienteUsd} reload={reload} permisos={permisos} />}
          {tab === 'minuta' && <MinutaTab opId={op.id} cotNum={cot.num || ''} cliente={cot.cliente} permisos={permisos} />}
          {tab === 'documentos' && <DocumentosTab opId={op.id} docs={docs} reload={loadDetail} permisos={permisos} />}
        </>
      )}
    </>
  )
}

// ── FACTURAS TAB (solo refleja; la carga vive en Facturación/Tesorería) ──
function FacturasTab({ facturas, cot, tipoOp, permisos, reload }: {
  facturas: FacturaOp[]; cot: Cotizacion; tipoOp: 'gestion' | 'propia'
  permisos: Record<string, string[]>; reload: () => void
}) {
  const supabase = createClient()
  const [previewModal, setPreviewModal] = useState<{ url: string; nombre: string; tipo: string } | null>(null)
  // El comprobante pertenece al módulo de la factura (emitida/recibida), no a 'operaciones'.
  const puedeVerFactura = (f: FacturaOp) => puede(permisos, f.origen === 'emitida' ? 'facturas_emitidas' : 'facturas_recibidas', 'ver')

  async function verArchivo(f: FacturaOp) {
    if (!f.archivo_url) return
    const bucket = f.origen === 'emitida' ? 'comprobantes' : 'facturas'
    setPreviewModal({ url: urlVerConMarca(bucket, f.archivo_url), nombre: f.archivo_nombre || 'documento', tipo: f.archivo_nombre?.toLowerCase().endsWith('.pdf') ? 'pdf' : 'img' })
  }

  const totalGasto = facturas.filter(f => f.origen === 'recibida').reduce((s, f) => s + usdDe(f), 0)
  const totalPN = facturas.filter(f => f.origen === 'emitida').reduce((s, f) => s + usdDe(f), 0)

  const badgeFacturadaA = (f: FacturaOp) => {
    if (f.origen !== 'recibida') return null
    if (f.facturada_a === 'cliente') return <span className="text-[9px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full font-semibold">A nombre del cliente</span>
    return <span className="text-[9px] bg-blue-50 text-[#1168F8] border border-blue-200 px-1.5 py-0.5 rounded-full font-semibold">A nombre de PN</span>
  }
  const labelVia = (v: string | null) => v === 'fondos_rendir' ? 'Caja a rendir' : v === 'cliente_directo' ? 'Pago directo cliente' : '—'

  return (
    <div>
      {/* Acciones → llevan a los módulos de carga, no se carga acá */}
      <div className="bg-[#EBF2FF] border border-[#93B8FC] rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="text-xs text-[#052698]">
            <span className="font-semibold">La carga se hace en su módulo.</span> Acá la operación solo refleja las facturas y su estado.
          </div>
          <div className="flex gap-2 flex-wrap">
            <a href="/facturacion/recibidas" className="px-3 py-1.5 bg-white border border-[#1168F8] text-[#1168F8] rounded-lg text-[11px] font-semibold hover:bg-[#1168F8] hover:text-white transition-colors">↗ Cargar factura de tercero</a>
            <a href="/facturacion/emitidas" className="px-3 py-1.5 bg-white border border-[#1168F8] text-[#1168F8] rounded-lg text-[11px] font-semibold hover:bg-[#1168F8] hover:text-white transition-colors">↗ Emitir factura PN</a>
            <a href="/tesoreria/flujo" className="px-3 py-1.5 bg-white border border-[#0a9e6e] text-[#0a9e6e] rounded-lg text-[11px] font-semibold hover:bg-[#0a9e6e] hover:text-white transition-colors">↗ Registrar pago / recibo</a>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <span className="font-medium text-sm text-gray-900">Facturas de la operación</span>
          <span className="text-xs text-gray-400 font-mono">Gasto: USD {fmt(totalGasto, 0)} · PN factura: USD {fmt(totalPN, 0)}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['', 'N°', 'Fecha', 'Contraparte', 'Etapa', 'Monto', 'USD', 'Pago', 'Estado', 'Doc.'].map(h => (
                  <th key={h} className="text-left px-4 py-2 text-[10px] text-gray-400 font-medium uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {facturas.map(f => (
                <tr key={f.origen + f.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    {f.origen === 'emitida'
                      ? <span className="text-[9px] bg-[#EBF2FF] text-[#052698] px-1.5 py-0.5 rounded-full font-semibold">PN emite</span>
                      : <span className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full font-semibold">Recibida</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-gray-700">{f.numero}</td>
                  <td className="px-4 py-3 font-mono text-[10px] text-gray-500">{f.fecha ? f.fecha.split('-').reverse().join('/') : '—'}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">{f.contraparte}</div>
                    <div className="mt-0.5">{badgeFacturadaA(f)}</div>
                  </td>
                  <td className="px-4 py-3 text-[11px] text-gray-600">
                    {f.etapa ? (ETAPAS_L[f.etapa] || f.etapa) : <span className="text-amber-500">Sin imputar</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-right text-gray-600 text-[11px]">{f.moneda !== 'USD' ? `${f.moneda} ${fmt(f.total)}` : '—'}</td>
                  <td className="px-4 py-3 font-mono text-right font-medium">USD {fmt(usdDe(f))}</td>
                  <td className="px-4 py-3 text-[10px] text-gray-500">{labelVia(f.via)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${estaSaldada(f) ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                      {estaSaldada(f) ? 'Saldada' : 'Pendiente'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {f.archivo_url && puedeVerFactura(f)
                      ? <button onClick={() => verArchivo(f)} className="px-1.5 py-0.5 bg-[#EBF2FF] text-[#1168F8] rounded text-[9px]">📄 Ver</button>
                      : f.origen === 'emitida'
                        ? <span className="text-[9px] text-gray-300">emitido PN</span>
                        : <span className="text-[9px] text-gray-300">—</span>}
                  </td>
                </tr>
              ))}
              {!facturas.length && (
                <tr><td colSpan={10} className="px-4 py-6 text-center text-gray-400">Sin facturas en esta operación todavía. Cargalas desde Facturación.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {previewModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setPreviewModal(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <span className="font-medium text-sm text-gray-900 truncate">{previewModal.nombre}</span>
              <div className="flex gap-2">
                <a href={previewModal.url} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-[#1168F8] text-white rounded-lg text-xs">🔗 Abrir</a>
                <button onClick={() => setPreviewModal(null)} className="text-gray-400 hover:text-gray-600 text-xl px-1">×</button>
              </div>
            </div>
            <div className="overflow-auto max-h-[75vh] p-2">
              {previewModal.tipo === 'pdf'
                ? <iframe src={previewModal.url} className="w-full h-[70vh] border-0" title={previewModal.nombre} />
                : <img src={previewModal.url} alt={previewModal.nombre} className="max-w-full mx-auto rounded" />}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── COMPARATIVO TAB (presupuesto por etapa vs gasto real facturado por etapa) ──
function ComparativoTab({ presup, facturas }: { presup: any[]; facturas: FacturaOp[] }) {
  // Solo las recibidas son "gasto real" contra el presupuesto
  const gastoFacturas = facturas.filter(f => f.origen === 'recibida')
  const etapas = Array.from(new Set([
    ...ETAPAS_ORD,
    ...presup.map((i: any) => i.etapa),
    ...gastoFacturas.map(f => f.etapa || 'otro'),
  ].filter(Boolean)))
  const etapasOrden = ETAPAS_ORD.filter(e => etapas.includes(e))

  let totP = 0, totR = 0
  const rows: React.ReactNode[] = []
  for (const e of etapasOrden) {
    const p = presup.filter((i: any) => i.etapa === e).reduce((s: number, i: any) => s + (i.usd || 0), 0)
    const r = gastoFacturas.filter(f => (f.etapa || 'otro') === e).reduce((s, f) => s + usdDe(f), 0)
    if (!p && !r) continue
    totP += p; totR += r
    const d = r - p
    rows.push(
      <tr key={e} className="border-b border-gray-50 hover:bg-gray-50">
        <td className="px-4 py-2.5 text-xs text-gray-700">{ETAPAS_L[e] || e}</td>
        <td className="px-4 py-2.5 font-mono text-xs text-right">USD {fmt(p)}</td>
        <td className="px-4 py-2.5 font-mono text-xs text-right">{r > 0 ? `USD ${fmt(r)}` : '—'}</td>
        <td className={`px-4 py-2.5 font-mono text-xs text-right font-medium ${d > 0 ? 'text-red-600' : d < 0 ? 'text-green-700' : 'text-gray-400'}`}>
          {d !== 0 ? `${d > 0 ? '+ ' : ''}USD ${fmt(d)}` : '—'}
        </td>
        <td className="px-4 py-2.5 w-24">
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.min(p > 0 && r ? r / p * 100 : 0, 100)}%`, background: p > 0 && d / p > 0.1 ? '#A32D2D' : d > 0 ? '#EF9F27' : '#1168F8' }} />
          </div>
        </td>
      </tr>
    )
  }
  // Facturas sin etapa imputada
  const sinEtapa = gastoFacturas.filter(f => !f.etapa).reduce((s, f) => s + usdDe(f), 0)
  const dTot = totR - totP

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <span className="font-medium text-sm text-gray-900">Presupuestado vs. gasto real facturado</span>
        {sinEtapa > 0 && <span className="text-[10px] text-amber-600">⚠ USD {fmt(sinEtapa, 0)} en facturas sin etapa imputada</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="bg-gray-50 border-b border-gray-100">
            {['Etapa', 'Presupuestado', 'Real', 'Diferencia', '%'].map(h => (
              <th key={h} className={`px-4 py-2.5 text-[10px] text-gray-400 font-medium uppercase tracking-wide ${h !== 'Etapa' ? 'text-right' : 'text-left'}`}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {rows}
            <tr className="bg-gray-50 font-semibold border-t-2 border-gray-200">
              <td className="px-4 py-3 text-sm">TOTAL</td>
              <td className="px-4 py-3 font-mono text-right">USD {fmt(totP)}</td>
              <td className="px-4 py-3 font-mono text-right">USD {fmt(totR)}</td>
              <td className={`px-4 py-3 font-mono text-right ${dTot > 0 ? 'text-red-600' : dTot < 0 ? 'text-green-700' : 'text-gray-400'}`}>
                {dTot !== 0 ? `${dTot > 0 ? '+ ' : ''}USD ${fmt(dTot)}` : '—'}
              </td>
              <td className="px-4 py-3 text-xs">{totP ? `${fmt(totR / totP * 100, 1)}%` : '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── CAJA A RENDIR TAB (refleja fondos_movimientos de la operación; carga en Tesorería) ──
function CajaRendirTab({ opId, cotNum, movs, saldo, permisos }: {
  opId: string; cotNum: string; movs: FondoMov[]; saldo: number; permisos: Record<string, string[]>
}) {
  const supabase = createClient()
  const [previewModal, setPreviewModal] = useState<{ url: string; nombre: string; tipo: string } | null>(null)
  // El comprobante de caja a rendir pertenece a Fondos en custodia, no a 'operaciones'.
  const puedeVer = puede(permisos, 'fondos_custodia', 'ver')

  const ingresos = movs.filter(m => MOV_INGRESO.includes(m.tipo)).reduce((s, m) => s + m.usd, 0)
  const egresos = movs.filter(m => MOV_EGRESO.includes(m.tipo)).reduce((s, m) => s + m.usd, 0)

  async function verComp(m: FondoMov) {
    if (!m.comprobante_url) return
    setPreviewModal({ url: urlVerConMarca('comprobantes', m.comprobante_url), nombre: m.comprobante_nombre || 'comprobante', tipo: m.comprobante_nombre?.toLowerCase().endsWith('.pdf') ? 'pdf' : 'img' })
  }

  const TIPO_L: Record<string, string> = {
    ingreso_cliente: 'Ingreso cliente', pago_proveedor: 'Pago proveedor',
    honorarios_puertonoa: 'Honorarios PN', devolucion_cliente: 'Devolución',
    cobro_diferencia: 'Cobro diferencia', ajuste_cambio: 'Ajuste cambio', transferencia: 'Transferencia',
  }
  let saldoAcum = 0

  return (
    <div>
      <div className="bg-[#EBF2FF] border border-[#93B8FC] rounded-xl p-4 mb-4 flex items-center justify-between flex-wrap gap-2">
        <div className="text-xs text-[#052698]"><span className="font-semibold">La caja a rendir se mueve desde Tesorería.</span> Acá ves los movimientos de fondos de esta operación.</div>
        <a href="/tesoreria/flujo" className="px-3 py-1.5 bg-white border border-[#0a9e6e] text-[#0a9e6e] rounded-lg text-[11px] font-semibold hover:bg-[#0a9e6e] hover:text-white transition-colors">↗ Ir a Tesorería</a>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4"><div className="text-[10px] font-medium text-green-700 mb-1">Fondos recibidos</div><div className="text-xl font-semibold text-green-800">USD {fmt(ingresos)}</div></div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4"><div className="text-[10px] font-medium text-red-700 mb-1">Aplicado (pagos / devolución)</div><div className="text-xl font-semibold text-red-700">USD {fmt(egresos)}</div></div>
        <div className={`border rounded-xl p-4 ${saldo >= 0 ? 'bg-[#EBF2FF] border-[#93B8FC]' : 'bg-red-50 border-red-200'}`}>
          <div className={`text-[10px] font-medium mb-1 ${saldo >= 0 ? 'text-[#052698]' : 'text-red-700'}`}>Saldo disponible</div>
          <div className={`text-xl font-semibold ${saldo >= 0 ? 'text-[#052698]' : 'text-red-700'}`}>USD {fmt(saldo)}</div>
          <div className={`text-[10px] mt-1 ${saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>{saldo < 0 ? '⚠ Solicitar fondos' : 'Fondos disponibles'}</div>
        </div>
      </div>

      <style>{`@media print { body * { visibility: hidden; } #rend-print, #rend-print * { visibility: visible; } #rend-print { position: absolute; left: 0; top: 0; width: 100%; } .no-print { display: none !important; } @page { margin: 10mm 12mm; size: A4 portrait; } }`}</style>
      <div className="no-print flex justify-end mb-3">
        <button onClick={() => { const t = document.title; document.title = `Rendicion_${cotNum}`; window.print(); document.title = t }}
          className="flex items-center gap-1.5 px-4 py-2 border-2 border-[#1168F8] text-[#1168F8] rounded-lg text-xs font-semibold hover:bg-[#EBF2FF]">🖨 Imprimir rendición</button>
      </div>

      <div id="rend-print" className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <div className="flex items-start justify-between px-5 py-4 border-b-2 border-[#1168F8]">
          <div><img src="/logo.png" alt="Puerto NOA SpA" style={{ height: '32px', objectFit: 'contain' }} /><div className="text-[10px] text-gray-400 mt-1">Puerto NOA SpA — Rendición de fondos · {cotNum}</div></div>
          <div className="text-right"><div className="text-[10px] text-gray-400 uppercase tracking-wider">Caja a rendir</div><div className="text-xs font-mono font-bold text-[#052698] mt-0.5">{new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}</div></div>
        </div>
        <div className="grid grid-cols-3 gap-3 px-5 py-3 bg-gray-50 border-b border-gray-100">
          <div className="text-center"><div className="text-[9px] text-gray-400 uppercase tracking-wide">Recibido</div><div className="font-mono font-bold text-green-700 text-sm">USD {fmt(ingresos)}</div></div>
          <div className="text-center"><div className="text-[9px] text-gray-400 uppercase tracking-wide">Aplicado</div><div className="font-mono font-bold text-red-600 text-sm">USD {fmt(egresos)}</div></div>
          <div className="text-center"><div className="text-[9px] text-gray-400 uppercase tracking-wide">Saldo</div><div className={`font-mono font-bold text-sm ${saldo >= 0 ? 'text-[#052698]' : 'text-red-600'}`}>USD {fmt(saldo)}</div></div>
        </div>
        <div>
          {movs.map(m => {
            saldoAcum += signoUsd(m)
            const positivo = signoUsd(m) >= 0
            return (
              <div key={m.id} className="flex items-center gap-3 px-5 py-3 border-b border-gray-50 text-xs">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${positivo ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="font-mono text-[10px] text-gray-400 w-20">{m.fecha ? m.fecha.split('-').reverse().join('/') : ''}</span>
                <span className="text-[10px] text-gray-500 w-28">{TIPO_L[m.tipo] || m.tipo}</span>
                <span className="flex-1 text-gray-800">{m.concepto}{m.cuenta ? <span className="text-gray-400"> · {m.cuenta.nombre}</span> : null}</span>
                <span className="text-[10px] text-gray-400">{m.moneda !== 'USD' ? `${m.moneda} ${fmt(m.monto)} · ` : ''}{m.nro_referencia || ''}</span>
                <span className={`font-mono font-medium min-w-24 text-right ${positivo ? 'text-green-700' : 'text-red-600'}`}>{positivo ? '+' : '−'} USD {fmt(Math.abs(m.usd))}</span>
                <span className={`font-mono text-[10px] min-w-24 text-right ${saldoAcum >= 0 ? 'text-green-700' : 'text-red-600'}`}>= USD {fmt(saldoAcum)}</span>
                <span className="no-print w-16 text-right">
                  {m.comprobante_url && puedeVer ? <button onClick={() => verComp(m)} className="px-2 py-0.5 bg-[#EBF2FF] text-[#1168F8] rounded text-[10px]">📄 Ver</button> : <span className="text-gray-300 text-[10px]">—</span>}
                </span>
              </div>
            )
          })}
          {!movs.length && <div className="px-5 py-6 text-center text-gray-400 text-xs">Sin movimientos de caja para esta operación.</div>}
        </div>
        <div className="flex items-center justify-between px-5 py-2.5 border-t border-gray-100 bg-gray-50">
          <div className="text-[9px] text-gray-400">Puerto NOA SpA — Rendición al cliente</div>
          <img src="/logo.png" alt="Puerto NOA" style={{ height: '18px', objectFit: 'contain', opacity: 0.5 }} />
        </div>
      </div>

      {previewModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setPreviewModal(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <span className="font-medium text-sm truncate">{previewModal.nombre}</span>
              <div className="flex gap-2">
                <a href={previewModal.url} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-[#1168F8] text-white rounded-lg text-xs">🔗 Abrir</a>
                <button onClick={() => setPreviewModal(null)} className="text-gray-400 text-xl px-1">×</button>
              </div>
            </div>
            <div className="overflow-auto max-h-[75vh] p-2">
              {previewModal.tipo === 'pdf' ? <iframe src={previewModal.url} className="w-full h-[70vh] border-0" title={previewModal.nombre} /> : <img src={previewModal.url} alt={previewModal.nombre} className="max-w-full mx-auto rounded" />}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── CIERRE TAB (valida caja en cero, congela liquidación, cierra) ──
function CierreTab({ op, saldoCaja, totalPresup, facturadoGasto, saldadoUsd, pendienteUsd, reload, permisos }: {
  op: Operacion & { cotizacion: Cotizacion }
  saldoCaja: number; totalPresup: number; facturadoGasto: number; saldadoUsd: number; pendienteUsd: number; reload: () => void
  permisos: Record<string, string[]>
}) {
  const supabase = createClient()
  const puedeEditar = puede(permisos, 'operaciones', 'editar')
  const [cerrando, setCerrando] = useState(false)
  const cerrada = op.estado === 'cerrada'
  const enCero = Math.abs(saldoCaja) < 0.01
  const hayPendientes = pendienteUsd > 0.01

  async function cerrar() {
    if (!enCero) return
    if (!confirm('¿Cerrar la operación? La caja a rendir queda congelada y no se podrán registrar más movimientos.')) return
    setCerrando(true)
    const liquidacion = {
      fecha: nowDate(), accion: 'Cierre de operación',
      presupuestado_usd: totalPresup, facturado_gasto_usd: facturadoGasto,
      saldado_usd: saldadoUsd, saldo_caja_usd: saldoCaja,
    }
    const histPrev = Array.isArray((op as any).hist_cierre) ? (op as any).hist_cierre : []
    await (supabase.from('operaciones') as any).update({
      estado: 'cerrada', fecha_cierre: nowDate(), hist_cierre: [...histPrev, liquidacion],
    }).eq('id', op.id)
    setCerrando(false)
    reload()
  }

  const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
    <div className="flex items-center justify-between px-5 py-3 border-b border-gray-50">
      <span className={`text-xs ${strong ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>{label}</span>
      <span className={`font-mono ${strong ? 'font-bold text-[#052698] text-sm' : 'text-gray-700 text-xs'}`}>{value}</span>
    </div>
  )

  return (
    <div className="max-w-2xl">
      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden mb-4">
        <div className="px-5 py-3.5 border-b border-gray-100 font-medium text-sm text-gray-900">Liquidación de la operación</div>
        <Row label="Presupuestado" value={`USD ${fmt(totalPresup)}`} />
        <Row label="Gasto real facturado" value={`USD ${fmt(facturadoGasto)}`} />
        <Row label="Facturas saldadas" value={`USD ${fmt(saldadoUsd)}`} />
        <Row label="Facturas pendientes" value={`USD ${fmt(pendienteUsd)}`} />
        <Row label="Saldo caja a rendir" value={`USD ${fmt(saldoCaja)}`} strong />
      </div>

      {cerrada ? (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 text-center">
          <div className="text-2xl mb-2">🔒</div>
          <div className="text-sm font-semibold text-gray-700">Operación cerrada</div>
          <div className="text-xs text-gray-400 mt-1">Cerrada el {(op as any).fecha_cierre ? String((op as any).fecha_cierre).split('-').reverse().join('/') : '—'}. La caja quedó congelada.</div>
        </div>
      ) : enCero ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5">
          <div className="text-sm font-semibold text-green-800 mb-1">✓ La caja a rendir está en cero</div>
          <div className="text-xs text-green-700 mb-4">Se puede cerrar la operación. {hayPendientes ? 'Atención: hay facturas pendientes de pago.' : 'Todas las facturas están saldadas.'}</div>
          {puedeEditar ? (
          <button onClick={cerrar} disabled={cerrando}
            className="px-5 py-2.5 bg-[#1168F8] text-white rounded-lg text-xs font-bold hover:bg-[#0a4fc4] disabled:opacity-50">
            {cerrando ? 'Cerrando...' : '🔒 Cerrar operación y congelar liquidación'}
          </button>
          ) : <div className="text-xs text-gray-400">No tenés permiso para cerrar la operación.</div>}
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <div className="text-sm font-semibold text-amber-800 mb-1">La caja a rendir no está en cero</div>
          <div className="text-xs text-amber-700 mb-3">
            {saldoCaja > 0
              ? `Sobran USD ${fmt(saldoCaja)} en la caja a rendir. Antes de cerrar, registrá la devolución al cliente desde Tesorería.`
              : `Faltan USD ${fmt(Math.abs(saldoCaja))} en la caja a rendir. Antes de cerrar, pedí los fondos al cliente y registrá el cobro de la diferencia desde Tesorería.`}
            <span className="block mt-1 text-amber-600">El movimiento se toma al TC del día; si hubo diferencia de cambio, registrala como ajuste en Tesorería para que la caja cierre en cero.</span>
          </div>
          <a href="/tesoreria/flujo" className="inline-block px-4 py-2 bg-white border border-amber-400 text-amber-700 rounded-lg text-xs font-semibold hover:bg-amber-100">↗ Ir a Tesorería</a>
        </div>
      )}
    </div>
  )
}

// ── MINUTA TAB ─────────────────────────────────────────────────
function MinutaTab({ opId, cotNum, cliente, permisos }: { opId: string; cotNum: string; cliente: string; permisos: Record<string, string[]> }) {
  const supabase = createClient()
  const puedeEditar = puede(permisos, 'operaciones', 'editar')
  const puedeProveedores = puede(permisos, 'proveedores', 'editar')

  const [facturas, setFacturas] = useState<any[]>([])
  const [minutas, setMinutas] = useState<any[]>([])
  const [talonarioMin, setTalonarioMin] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const [provSel, setProvSel] = useState<string>('')
  const [factSel, setFactSel] = useState<Record<string, boolean>>({})
  const [cuentas, setCuentas] = useState<any[]>([])
  const [cuentaSel, setCuentaSel] = useState<string>('')
  const [emitiendo, setEmitiendo] = useState(false)

  const [addCta, setAddCta] = useState(false)
  const [ctaForm, setCtaForm] = useState({ banco: '', cuenta: '', cbu_iban: '', swift: '', moneda: 'USD', notas: '' })

  const inp = 'w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8]'

  async function load() {
    setLoading(true)
    const [fRes, mRes, tRes] = await Promise.all([
      (supabase.from('facturas_recibidas') as any)
        .select('id,folio,moneda,total,fecha_vencimiento,fecha_emision,tercero_id,proveedor_razon_social,estado,estado_pago,facturada_a')
        .eq('operacion_id', opId).eq('facturada_a', 'cliente').not('estado', 'in', '("anulada")'),
      (supabase.from('minutas') as any)
        .select('*, tercero:terceros(razon_social), cuenta:tercero_cuentas_bancarias(banco,cuenta,cbu_iban,swift,moneda), facturas:minuta_facturas(id,factura_recibida_id,monto,moneda,factura:facturas_recibidas(folio,fecha_vencimiento))')
        .eq('operacion_id', opId).order('created_at', { ascending: false }),
      (supabase.from('talonarios') as any).select('id,prefijo,tipo_comprobante_id, tipo:tipos_comprobante(nombre)').eq('activo', true),
    ])
    setFacturas(fRes.data || [])
    setMinutas(mRes.data || [])
    const tmin = (tRes.data || []).find((t: any) => t.tipo?.nombre === 'Minuta de pago' || t.prefijo === 'MIN')
    setTalonarioMin(tmin || null)
    setLoading(false)
  }
  useEffect(() => { load() }, [opId])

  const proveedores = useMemo(() => {
    const m = new Map<string, { id: string; nombre: string; n: number }>()
    facturas.forEach((f: any) => {
      if (!f.tercero_id) return
      const e = m.get(f.tercero_id) || { id: f.tercero_id, nombre: f.proveedor_razon_social || 'Proveedor', n: 0 }
      e.n++; m.set(f.tercero_id, e)
    })
    return Array.from(m.values())
  }, [facturas])

  const factsProv = facturas.filter((f: any) => f.tercero_id === provSel && f.estado_pago !== 'pagada')

  async function elegirProveedor(tid: string) {
    setProvSel(tid); setFactSel({}); setCuentaSel('')
    if (!tid) { setCuentas([]); return }
    const { data } = await (supabase.from('tercero_cuentas_bancarias') as any).select('*').eq('tercero_id', tid).order('principal', { ascending: false })
    setCuentas(data || [])
    const ppal = (data || []).find((c: any) => c.principal) || (data || [])[0]
    setCuentaSel(ppal?.id || '')
  }

  const seleccionadas = factsProv.filter((f: any) => factSel[f.id])
  const monedaMin = seleccionadas[0]?.moneda || ''
  const monedaMixta = seleccionadas.some((f: any) => f.moneda !== monedaMin)
  const totalMin = seleccionadas.reduce((s: number, f: any) => s + (Number(f.total) || 0), 0)

  async function guardarCuenta() {
    if (!ctaForm.banco) { alert('Completá al menos el banco.'); return }
    const { data, error } = await (supabase.from('tercero_cuentas_bancarias') as any)
      .insert({ tercero_id: provSel, banco: ctaForm.banco, cuenta: ctaForm.cuenta || null, cbu_iban: ctaForm.cbu_iban || null, swift: ctaForm.swift || null, moneda: ctaForm.moneda, principal: cuentas.length === 0, notas: ctaForm.notas || null })
      .select('*').single()
    if (error) { alert('Error al guardar la cuenta: ' + error.message); return }
    setCuentas(c => [...c, data]); setCuentaSel(data.id); setAddCta(false)
    setCtaForm({ banco: '', cuenta: '', cbu_iban: '', swift: '', moneda: 'USD', notas: '' })
  }

  async function emitir() {
    if (!provSel) { alert('Elegí el proveedor.'); return }
    if (seleccionadas.length === 0) { alert('Marcá al menos una factura.'); return }
    if (monedaMixta) { alert('Las facturas seleccionadas tienen monedas distintas. Emití una minuta por moneda.'); return }
    if (cuentas.length > 0 && !cuentaSel) { alert('Elegí la cuenta bancaria del proveedor.'); return }
    if (!talonarioMin) { alert('No hay talonario de minutas. Cargalo en Catálogos › Talonarios.'); return }
    setEmitiendo(true)
    try {
      const { data: numData, error: numErr } = await (supabase.rpc as any)('emitir_numero_talonario', { p_talonario: talonarioMin.id })
      if (numErr || !numData?.[0]) { alert('Error al numerar: ' + (numErr?.message || '')); setEmitiendo(false); return }
      const numero = numData[0].numero, formateado = numData[0].formateado
      const { data: min, error: mErr } = await (supabase.from('minutas') as any).insert({
        operacion_id: opId, tercero_id: provSel, cuenta_bancaria_id: cuentaSel || null,
        talonario_id: talonarioMin.id, numero, numero_formateado: formateado,
        fecha: nowDate(), moneda: monedaMin, total: totalMin, estado: 'emitida',
      }).select('id').single()
      if (mErr || !min) { alert('Error al emitir la minuta: ' + (mErr?.message || '')); setEmitiendo(false); return }
      for (const f of seleccionadas) {
        await (supabase.from('minuta_facturas') as any).insert({ minuta_id: min.id, factura_recibida_id: f.id, monto: Number(f.total) || 0, moneda: f.moneda })
        await (supabase.from('facturas_recibidas') as any).update({ estado_pago: 'minuta_emitida' }).eq('id', f.id)
      }
      setProvSel(''); setFactSel({}); setCuentas([]); setCuentaSel('')
      await load()
      alert(`Minuta ${formateado} emitida.`)
    } catch (e: any) { alert('Error inesperado: ' + (e?.message || e)) }
    setEmitiendo(false)
  }

  if (loading) return <div className="text-center text-gray-400 text-xs py-8">Cargando…</div>

  return (
    <div className="space-y-4">
      {puedeEditar && (
        <div className="bg-white border border-gray-100 rounded-xl p-5">
          <h3 className="font-medium text-sm text-gray-900 mb-1">Emitir minuta de pago</h3>
          <p className="text-[11px] text-gray-400 mb-4">Solo facturas de proveedor emitidas <b>a nombre del cliente</b> en esta operación. Las facturadas a Puerto NOA se pagan desde Tesorería.</p>
          {proveedores.length === 0 ? (
            <div className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-4 text-center">No hay facturas de proveedor cargadas en esta operación todavía.</div>
          ) : (
            <>
              <div className="mb-3">
                <label className="block text-[10px] text-gray-500 font-medium mb-1">Proveedor</label>
                <select value={provSel} onChange={e => elegirProveedor(e.target.value)} className={inp + ' bg-white'}>
                  <option value="">— elegí proveedor —</option>
                  {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre} ({p.n} fact.)</option>)}
                </select>
              </div>
              {provSel && (
                <>
                  <div className="border border-gray-100 rounded-lg divide-y divide-gray-50 mb-3">
                    {factsProv.length === 0 && <div className="px-3 py-3 text-xs text-gray-400">Este proveedor no tiene facturas pendientes en la operación.</div>}
                    {factsProv.map((f: any) => (
                      <label key={f.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50">
                        <input type="checkbox" checked={!!factSel[f.id]} onChange={e => setFactSel(s => ({ ...s, [f.id]: e.target.checked }))} className="w-4 h-4 rounded" />
                        <div className="flex-1">
                          <div className="text-xs font-medium text-gray-800">Factura {f.folio || '—'}</div>
                          <div className="text-[10px] text-gray-400">{f.fecha_emision || ''}{f.fecha_vencimiento ? ` · vence ${f.fecha_vencimiento.split('-').reverse().join('/')}` : ''}{f.estado_pago === 'minuta_emitida' ? ' · ya en una minuta' : ''}</div>
                        </div>
                        <div className="font-mono font-semibold text-xs text-gray-900">{f.moneda} {fmt(Number(f.total) || 0)}</div>
                      </label>
                    ))}
                  </div>
                  <div className="mb-3">
                    <label className="block text-[10px] text-gray-500 font-medium mb-1">Cuenta bancaria del proveedor</label>
                    {cuentas.length > 0 ? (
                      <select value={cuentaSel} onChange={e => setCuentaSel(e.target.value)} className={inp + ' bg-white'}>
                        {cuentas.map((c: any) => <option key={c.id} value={c.id}>{c.banco} · {c.cuenta || c.cbu_iban || ''} · {c.moneda}{c.principal ? ' (principal)' : ''}</option>)}
                      </select>
                    ) : (
                      puedeProveedores ? (
                        <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 flex items-center justify-between">
                          <span>El proveedor no tiene cuentas bancarias cargadas.</span>
                          <button onClick={() => setAddCta(true)} className="text-[#1168F8] font-semibold hover:underline">+ Agregar cuenta</button>
                        </div>
                      ) : (
                        <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">El proveedor no tiene cuentas bancarias cargadas. Pedile a un administrador que las cargue en la ficha del proveedor.</div>
                      )
                    )}
                  </div>
                  <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                    <div className="text-xs text-gray-500">
                      {seleccionadas.length} factura(s){monedaMin && !monedaMixta ? ` · ${monedaMin} ${fmt(totalMin)}` : ''}
                      {monedaMixta && <span className="text-[#E11D48] ml-1">⚠ monedas distintas</span>}
                    </div>
                    <button onClick={emitir} disabled={emitiendo || seleccionadas.length === 0 || monedaMixta || (cuentas.length > 0 && !cuentaSel)}
                      className="bg-[#1168F8] text-white px-4 py-2 rounded-lg text-xs font-medium hover:bg-[#0a4fc4] disabled:opacity-40">
                      {emitiendo ? 'Emitiendo…' : 'Emitir minuta'}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {minutas.length === 0 ? (
        <div className="text-center text-gray-400 text-xs py-8">No hay minutas emitidas en esta operación.</div>
      ) : (
        minutas.map((m: any) => <MinutaDoc key={m.id} m={m} cotNum={cotNum} cliente={cliente} />)
      )}

      {addCta && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setAddCta(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-sm text-gray-900 mb-3">Agregar cuenta bancaria del proveedor</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="block text-[10px] text-gray-500 font-medium mb-1">Banco / entidad</label><input value={ctaForm.banco} onChange={e => setCtaForm(f => ({ ...f, banco: e.target.value }))} className={inp} /></div>
              <div><label className="block text-[10px] text-gray-500 font-medium mb-1">N° cuenta</label><input value={ctaForm.cuenta} onChange={e => setCtaForm(f => ({ ...f, cuenta: e.target.value }))} className={inp} /></div>
              <div><label className="block text-[10px] text-gray-500 font-medium mb-1">CBU / IBAN</label><input value={ctaForm.cbu_iban} onChange={e => setCtaForm(f => ({ ...f, cbu_iban: e.target.value }))} className={inp} /></div>
              <div><label className="block text-[10px] text-gray-500 font-medium mb-1">SWIFT / alias</label><input value={ctaForm.swift} onChange={e => setCtaForm(f => ({ ...f, swift: e.target.value }))} className={inp} /></div>
              <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Moneda</label><select value={ctaForm.moneda} onChange={e => setCtaForm(f => ({ ...f, moneda: e.target.value }))} className={inp + ' bg-white'}><option>USD</option><option>ARS</option><option>CLP</option><option>EUR</option><option>CNY</option></select></div>
              <div className="col-span-2"><label className="block text-[10px] text-gray-500 font-medium mb-1">Notas</label><input value={ctaForm.notas} onChange={e => setCtaForm(f => ({ ...f, notas: e.target.value }))} className={inp} /></div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setAddCta(false)} className="px-4 py-2 text-xs text-gray-500 hover:text-gray-700">Cancelar</button>
              <button onClick={guardarCuenta} className="bg-[#1168F8] text-white px-4 py-2 rounded-lg text-xs font-medium hover:bg-[#0a4fc4]">Guardar cuenta</button>
            </div>
            <p className="text-[10px] text-gray-400 mt-2">Queda guardada en la ficha del proveedor como una cuenta más.</p>
          </div>
        </div>
      )}
    </div>
  )
}

// Documento imprimible de una minuta emitida
function MinutaDoc({ m, cotNum, cliente }: { m: any; cotNum: string; cliente: string }) {
  const fecha = m.fecha ? m.fecha.split('-').reverse().join('/') : ''
  const cta = m.cuenta
  const printId = `minuta-print-${m.id}`
  return (
    <div>
      <style>{`@media print { body * { visibility: hidden; } #${printId}, #${printId} * { visibility: visible; } #${printId} { position: absolute; left: 0; top: 0; width: 100%; } .no-print { display: none !important; } @page { margin: 10mm 12mm; size: A4 portrait; } }`}</style>
      <div className="no-print flex items-center justify-between mb-2">
        <span className="text-xs text-gray-600 font-semibold">Minuta {m.numero_formateado} · {m.tercero?.razon_social || ''} · {fecha}</span>
        <button onClick={() => { const t = document.title; document.title = `Minuta_${m.numero_formateado}`; window.print(); document.title = t }}
          className="flex items-center gap-1.5 px-3 py-1.5 border-2 border-[#1168F8] text-[#1168F8] rounded-lg text-xs font-semibold hover:bg-[#EBF2FF]">🖨 Imprimir / PDF</button>
      </div>
      <div id={printId} className="bg-white border border-gray-100 rounded-xl overflow-hidden mb-4">
        <div className="flex items-start justify-between px-6 py-5 border-b-2 border-[#1168F8]">
          <div>
            <img src="/logo.png" alt="Puerto NOA SpA" style={{ height: '36px', objectFit: 'contain' }} />
            <div className="mt-2 text-[10px] text-gray-400">Puerto NOA SpA — Logística de importaciones China → NOA<br />San Salvador de Jujuy, Argentina</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Minuta de pago</div>
            <div className="text-xl font-bold font-mono text-[#052698]">{m.numero_formateado}</div>
            <div className="text-xs text-gray-500 mt-1">{fecha} · Op. {cotNum}</div>
          </div>
        </div>
        <div className="px-6 py-4 bg-[#EBF2FF] border-b border-[#93B8FC]">
          <div className="text-[10px] text-[#052698] uppercase tracking-wider font-bold mb-1">Estimado cliente</div>
          <div className="text-sm font-semibold text-[#052698]">{cliente}</div>
          <div className="text-xs text-[#1168F8] mt-1">Le solicitamos efectuar la transferencia al proveedor por las siguientes facturas de la operación {cotNum}.</div>
        </div>
        <div className="px-6 py-4">
          <div className="font-semibold text-sm text-gray-900 mb-2">{m.tercero?.razon_social || ''}</div>
          <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg mb-3">
            {(m.facturas || []).map((mf: any, idx: number) => (
              <div key={mf.id} className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-[#1168F8] text-white text-[9px] font-bold flex items-center justify-center">{idx + 1}</div>
                  <div className="text-xs text-gray-700">Factura {mf.factura?.folio || '—'}{mf.factura?.fecha_vencimiento ? ` · vence ${mf.factura.fecha_vencimiento.split('-').reverse().join('/')}` : ''}</div>
                </div>
                <div className="font-mono font-semibold text-xs text-gray-900">{mf.moneda} {fmt(Number(mf.monto) || 0)}</div>
              </div>
            ))}
          </div>
          {cta && (
            <div className="grid grid-cols-4 gap-3 bg-gray-50 rounded-lg p-3 text-xs">
              <div><div className="text-[9px] text-gray-400 uppercase mb-0.5">Banco</div><div className="font-medium text-gray-700">{cta.banco}</div></div>
              {cta.cuenta && <div><div className="text-[9px] text-gray-400 uppercase mb-0.5">Cuenta</div><div className="font-mono text-gray-700">{cta.cuenta}</div></div>}
              {cta.cbu_iban && <div><div className="text-[9px] text-gray-400 uppercase mb-0.5">CBU / IBAN</div><div className="font-mono text-gray-700">{cta.cbu_iban}</div></div>}
              {cta.swift && <div><div className="text-[9px] text-gray-400 uppercase mb-0.5">SWIFT</div><div className="font-mono text-gray-700">{cta.swift}</div></div>}
            </div>
          )}
        </div>
        <div className="px-6 py-4 bg-gray-50 border-t-2 border-[#1168F8] flex items-center justify-between">
          <div className="text-xs font-semibold text-gray-700">TOTAL A TRANSFERIR</div>
          <div className="font-mono font-bold text-[#052698] text-base">{m.moneda} {fmt(Number(m.total) || 0)}</div>
        </div>
        <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100">
          <div className="text-[9px] text-gray-400">Ante cualquier consulta comuníquese con Puerto NOA SpA · San Salvador de Jujuy, Argentina</div>
          <img src="/logo.png" alt="Puerto NOA" style={{ height: '20px', objectFit: 'contain', opacity: 0.5 }} />
        </div>
      </div>
    </div>
  )
}

export default function OperacionesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">Cargando...</div>}>
      <OperacionesContent />
    </Suspense>
  )
}

// ── DOCUMENTOS TAB ─────────────────────────────────────────────
const TIPOS_DOC = [
  { key: 'proforma', label: 'Proforma del proveedor' },
  { key: 'bl', label: 'BL — Bill of Lading' },
  { key: 'packing', label: 'Packing List' },
  { key: 'crt', label: 'CRT — Carta de Porte' },
  { key: 'liquidacion', label: 'Liquidación de impuestos (SIM)' },
  { key: 'otro', label: 'Otro (definir nombre)' },
]

function DocumentosTab({ opId, docs, reload, permisos }: { opId: string; docs: any[]; reload: () => void; permisos: Record<string, string[]> }) {
  const supabase = createClient()
  const [form, setForm] = useState({ tipo: 'bl', nombre_custom: '', referencia: '', fecha: '', notas: '' })
  const [uploading, setUploading] = useState(false)
  const [previewModal, setPreviewModal] = useState<{ url: string; nombre: string; tipo: string } | null>(null)
  const [currentUser, setCurrentUser] = useState<{ id: string; nombre: string } | null>(null)
  const inp = 'w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8]'

  const puedeVer = puede(permisos, 'operaciones', 'ver')
  const puedeDescargar = puede(permisos, 'operaciones_documentos', 'descargar')
  const puedeSubirDoc = puede(permisos, 'operaciones_documentos', 'crear')
  const puedeEliminarDoc = puede(permisos, 'operaciones_documentos', 'eliminar')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return
      supabase.from('usuarios').select('id, nombre').eq('auth_id', data.user.id).single().then(({ data: u }) => {
        if (u) setCurrentUser(u as any)
      })
    })
  }, [])

  async function subirDocumento(file: File) {
    if (!currentUser) return
    setUploading(true)
    const { data: docData } = await (supabase.from('operacion_documentos') as any).insert({
      operacion_id: opId, tipo: form.tipo,
      nombre_custom: form.tipo === 'otro' ? form.nombre_custom : null,
      referencia: form.referencia || null, fecha: form.fecha || null, notas: form.notas || null,
      subido_por: currentUser.nombre, subido_por_id: currentUser.id, archivo_nombre: file.name,
    }).select('id').single()
    if (docData) {
      const ext = file.name.split('.').pop()
      const path = `documentos/${opId}/${docData.id}.${ext}`
      await supabase.storage.from('comprobantes').upload(path, file, { upsert: true })
      await (supabase.from('operacion_documentos') as any).update({ archivo_url: path }).eq('id', docData.id)
    }
    setForm({ tipo: 'bl', nombre_custom: '', referencia: '', fecha: '', notas: '' })
    setUploading(false)
    reload()
  }

  async function verDoc(doc: any) {
    if (!doc.archivo_url) return
    setPreviewModal({ url: urlVerConMarca('comprobantes', doc.archivo_url), nombre: doc.archivo_nombre, tipo: doc.archivo_nombre?.toLowerCase().endsWith('.pdf') ? 'pdf' : 'img' })
  }

  async function descargarDoc(doc: any) {
    if (!doc.archivo_url) return
    const { data, error } = await supabase.storage.from('comprobantes').createSignedUrl(doc.archivo_url, 3600, { download: doc.archivo_nombre || 'documento' })
    if (error || !data?.signedUrl) { alert('No se pudo descargar el documento'); return }
    window.open(data.signedUrl, '_blank')
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar este documento?')) return
    await supabase.from('operacion_documentos').delete().eq('id', id)
    reload()
  }

  const grouped = docs.reduce((acc: Record<string, any[]>, d) => {
    const key = d.tipo === 'otro' ? (d.nombre_custom || 'Otro') : d.tipo
    if (!acc[key]) acc[key] = []
    acc[key].push(d)
    return acc
  }, {})

  const getLabel = (tipo: string, nombre_custom?: string) => {
    if (tipo === 'otro') return nombre_custom || 'Otro'
    return TIPOS_DOC.find(t => t.key === tipo)?.label || tipo
  }

  return (
    <div className="space-y-4">
      {puedeSubirDoc && (
      <div className="bg-white border border-gray-100 rounded-xl p-5">
        <h3 className="font-medium text-sm text-gray-900 mb-4">Agregar documento</h3>
        <div className="grid grid-cols-4 gap-3 mb-3">
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Tipo</label>
            <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))} className={inp + ' bg-white'}>
              {TIPOS_DOC.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select></div>
          {form.tipo === 'otro' && <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Nombre *</label>
            <input value={form.nombre_custom} onChange={e => setForm(f => ({ ...f, nombre_custom: e.target.value }))} className={inp} /></div>}
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">N° referencia</label>
            <input value={form.referencia} onChange={e => setForm(f => ({ ...f, referencia: e.target.value }))} className={inp} /></div>
          <div><label className="block text-[10px] text-gray-500 font-medium mb-1">Fecha</label>
            <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} className={inp} /></div>
        </div>
        <label className={`flex items-center gap-2 px-4 py-2 border-2 border-dashed border-[#93B8FC] rounded-lg text-xs text-[#1168F8] hover:bg-[#EBF2FF] cursor-pointer w-fit ${uploading ? 'opacity-60' : ''}`}>
          📎 {uploading ? 'Subiendo...' : 'Seleccionar y subir archivo'}
          <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" disabled={uploading || (form.tipo === 'otro' && !form.nombre_custom)}
            onChange={e => { const f = e.target.files?.[0]; if (f) subirDocumento(f) }} />
        </label>
      </div>
      )}
      {Object.keys(grouped).length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl p-8 text-center text-gray-400 text-sm">Sin documentos cargados aún.</div>
      ) : (
        Object.entries(grouped).map(([key, items]: [string, any[]]) => (
          <div key={key} className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <span className="font-medium text-sm text-gray-900">{getLabel(items[0].tipo, items[0].nombre_custom)}</span>
              <span className="text-xs text-gray-400">{items.length} archivo(s)</span>
            </div>
            <div className="divide-y divide-gray-50">
              {items.map((doc: any) => (
                <div key={doc.id} className="flex items-center gap-4 px-5 py-3 text-xs">
                  <div className="flex-1">
                    <div className="font-medium text-gray-800">{doc.archivo_nombre}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5 flex gap-3">
                      {doc.referencia && <span className="font-mono">Ref: {doc.referencia}</span>}
                      {doc.fecha && <span>{doc.fecha}</span>}
                      {doc.subido_por && <span>por {doc.subido_por}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {doc.archivo_url && puedeVer && (
                      <button onClick={() => verDoc(doc)}
                        className="px-2.5 py-1.5 bg-[#EBF2FF] text-[#1168F8] rounded-lg text-[10px] font-medium">📄 Ver</button>
                    )}
                    {doc.archivo_url && puedeDescargar && (
                      <button onClick={() => descargarDoc(doc)}
                        className="px-2.5 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-[10px] font-medium hover:bg-gray-50">⬇ Descargar</button>
                    )}
                    {puedeEliminarDoc && <button onClick={() => eliminar(doc.id)} className="p-1.5 border border-gray-200 rounded-lg text-gray-400 hover:text-red-500 text-[10px]">🗑</button>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
      {previewModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setPreviewModal(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <span className="font-medium text-sm truncate">{previewModal.nombre}</span>
              <div className="flex gap-2">
                <a href={previewModal.url} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-[#1168F8] text-white rounded-lg text-xs">🔗 Abrir</a>
                <button onClick={() => setPreviewModal(null)} className="text-gray-400 text-xl px-1">×</button>
              </div>
            </div>
            <div className="overflow-auto max-h-[80vh] p-2">
              {previewModal.tipo === 'pdf' ? <iframe src={previewModal.url} className="w-full h-[75vh] border-0" title={previewModal.nombre} /> : <img src={previewModal.url} alt={previewModal.nombre} className="max-w-full mx-auto rounded" />}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
