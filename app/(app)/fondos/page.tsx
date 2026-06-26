'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { fmt } from '@/lib/utils'
import { cargarPermisos, puede } from '@/lib/permisos'
import { urlVerConMarca } from '@/lib/documentos'

type Tab = 'arqueo' | 'movimientos' | 'por_operacion' | 'conciliacion'

const TIPOS_MOV = [
  { key: 'ingreso_cliente',      label: 'Ingreso cliente',            icon: '⬇', color: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-200' },
  { key: 'pago_proveedor',       label: 'Pago proveedor',             icon: '⬆', color: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-200' },
  { key: 'transferencia',        label: 'Transferencia entre cuentas',icon: '↔', color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-200' },
  { key: 'honorarios_puertonoa', label: 'Honorarios Puerto NOA',      icon: '★', color: 'text-[#052698]',  bg: 'bg-[#EBF2FF]', border: 'border-[#93B8FC]' },
  { key: 'devolucion_cliente',   label: 'Devolución a cliente',       icon: '↩', color: 'text-[#ef9f27]',  bg: 'bg-amber-50',  border: 'border-amber-200' },
]

const MONEDAS = ['ARS', 'USD', 'CLP']
const nowDate = () => new Date().toISOString().slice(0, 10)
const fmtM = (m: string, v: number) => `${m} ${v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function FondosCustodiaPage() {
  const supabase = useMemo(() => createClient(), [])
  const [tab, setTab] = useState<Tab>('arqueo')
  const [cuentas, setCuentas] = useState<any[]>([])
  const [movimientos, setMovimientos] = useState<any[]>([])
  const [operaciones, setOperaciones] = useState<any[]>([])
  const [facturasEmit, setFacturasEmit] = useState<any[]>([])
  const [facturasReci, setFacturasReci] = useState<any[]>([])
  const [tcActual, setTcActual] = useState<{ ARS: number; CLP: number }>({ ARS: 1450, CLP: 910 })
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [permisos, setPermisos] = useState<Record<string, string[]>>({})

  useEffect(() => { loadAll(); cargarPermisos().then(setPermisos) }, [])

  async function loadAll() {
    setLoading(true)
    const [authRes] = await Promise.all([supabase.auth.getUser()])
    if (authRes.data.user) {
      const { data: u } = await supabase.from('usuarios').select('nombre').eq('auth_id', authRes.data.user.id).single()
      if (u) setCurrentUser(u)
    }
    const [cRes, mRes, oRes, tcRes, feRes, frRes] = await Promise.all([
      supabase.from('fondos_cuentas').select('*').eq('activo', true).order('orden'),
      supabase.from('fondos_movimientos').select('*, cuenta:fondos_cuentas!fondos_movimientos_cuenta_id_fkey(nombre,tipo,moneda,pais), cuenta_dest:fondos_cuentas!fondos_movimientos_cuenta_destino_id_fkey(nombre,tipo,moneda,pais), operacion:operaciones(id,cotizacion:cotizaciones(num,cliente))').order('fecha', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('operaciones').select('id, cotizacion:cotizaciones(num,cliente)').order('created_at', { ascending: false }),
      supabase.from('tipos_cambio_eventos').select('ars,clp').order('created_at', { ascending: false }).limit(1),
      supabase.from('facturas_emitidas').select('id,folio,cliente_razon_social,total,total_usd,moneda,estado,operacion_id').not('operacion_id', 'is', null),
      supabase.from('facturas_recibidas').select('id,folio,proveedor_razon_social,total,total_usd,moneda,estado,operacion_id').not('operacion_id', 'is', null),
    ])
    if (cRes.data) setCuentas(cRes.data)
    if (mRes.data) setMovimientos(mRes.data)
    if (oRes.data) setOperaciones(oRes.data)
    if (feRes.data) setFacturasEmit(feRes.data)
    if (frRes.data) setFacturasReci(frRes.data)
    if (tcRes.data && tcRes.data.length > 0) {
      const tc = tcRes.data[0] as any
      setTcActual({ ARS: tc.ars || 1450, CLP: tc.clp || 910 })
    }
    setLoading(false)
  }

  // ── Calcular saldo por cuenta ──────────────────────────────────
  function saldoCuenta(cuentaId: string): number {
    return movimientos.reduce((s, m) => {
      if (m.cuenta_id === cuentaId && m.tipo !== 'transferencia') {
        return s + (['ingreso_cliente'].includes(m.tipo) ? m.monto : -m.monto)
      }
      if (m.tipo === 'transferencia') {
        if (m.cuenta_id === cuentaId) return s - m.monto
        if (m.cuenta_destino_id === cuentaId) return s + m.monto
      }
      return s
    }, 0)
  }

  function saldoCuentaUSD(cuentaId: string, moneda: string): number {
    const s = saldoCuenta(cuentaId)
    if (moneda === 'USD') return s
    if (moneda === 'ARS') return s / tcActual.ARS
    if (moneda === 'CLP') return s / tcActual.CLP
    return s
  }

  // ── Saldo por operación ────────────────────────────────────────
  function saldoPorOperacion(opId: string): number {
    return movimientos
      .filter(m => m.operacion_id === opId && m.tipo !== 'transferencia')
      .reduce((s, m) => s + (['ingreso_cliente'].includes(m.tipo) ? m.usd : -m.usd), 0)
  }

  const totalUSD = cuentas.reduce((s, c) => s + saldoCuentaUSD(c.id, c.moneda), 0)

  if (loading) return (
    <div className="p-8 text-center text-gray-400">
      <div className="w-8 h-8 border-2 border-[#1168F8] border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
      Cargando fondos...
    </div>
  )

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <div className="text-[11px] font-bold text-[#1168F8]/60 uppercase tracking-widest mb-1">Finanzas · Fondos en custodia</div>
        <h1 className="text-2xl font-bold text-gray-900">Fondos a rendir</h1>
        <p className="text-xs text-gray-400 mt-1">Dinero de clientes administrado por Puerto NOA · No confundir con fondos propios</p>
      </div>

      {/* KPIs rápidos */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="bg-[#052698] rounded-2xl p-5 text-white col-span-1">
          <div className="text-[10px] font-bold text-blue-300 uppercase tracking-widest mb-2">Total en custodia</div>
          <div className="text-3xl font-black font-mono">USD {fmt(totalUSD, 0)}</div>
          <div className="text-[11px] text-blue-300 mt-1">Consolidado a TC actual</div>
        </div>
        {[
          { label: 'Cajas efectivo', cuentas: cuentas.filter(c => c.tipo === 'caja') },
          { label: 'Cuentas bancarias', cuentas: cuentas.filter(c => c.tipo === 'banco') },
        ].map(g => (
          <div key={g.label} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">{g.label}</div>
            <div className="space-y-1.5">
              {g.cuentas.map(c => {
                const s = saldoCuenta(c.id)
                return (
                  <div key={c.id} className="flex items-center justify-between">
                    <span className="text-[11px] text-gray-500">{c.pais === 'Argentina' ? '🇦🇷' : '🇨🇱'} {c.moneda}</span>
                    <span className={`font-mono text-xs font-bold ${s < 0 ? 'text-red-500' : 'text-gray-800'}`}>
                      {fmtM(c.moneda, s)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">TC referencia</div>
          <div className="space-y-1.5">
            <div className="flex justify-between"><span className="text-[11px] text-gray-500">🇦🇷 ARS/USD</span><span className="font-mono text-xs font-bold">{Math.round(tcActual.ARS).toLocaleString('es-AR')}</span></div>
            <div className="flex justify-between"><span className="text-[11px] text-gray-500">🇨🇱 CLP/USD</span><span className="font-mono text-xs font-bold">{Math.round(tcActual.CLP).toLocaleString('es-AR')}</span></div>
          </div>
          <div className="text-[9px] text-gray-300 mt-3">TC del sistema · Solo para conversión</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-white border border-gray-100 rounded-2xl p-1.5 shadow-sm w-fit">
        {([
          { key: 'arqueo',         label: 'Arqueo',             icon: '⊞' },
          { key: 'movimientos',    label: 'Movimientos',        icon: '↕' },
          { key: 'por_operacion',  label: 'Por operación',      icon: '📋' },
          { key: 'conciliacion',   label: 'Conciliación',       icon: '✓' },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              tab === t.key ? 'bg-[#1168F8] text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* ══ TAB ARQUEO ════════════════════════════════════════════ */}
      {tab === 'arqueo' && (
        <div className="space-y-4">
          {/* Por cuenta */}
          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
              <span className="font-semibold text-sm text-gray-900">Saldo por cuenta</span>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Cuenta','País','Tipo','Moneda','Saldo','Equiv. USD','Estado'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cuentas.map(c => {
                  const s = saldoCuenta(c.id)
                  const susd = saldoCuentaUSD(c.id, c.moneda)
                  return (
                    <tr key={c.id} className="border-b border-gray-50 hover:bg-blue-50/20">
                      <td className="px-4 py-3.5 font-semibold text-gray-800">{c.nombre}</td>
                      <td className="px-4 py-3.5 text-gray-500">{c.pais === 'Argentina' ? '🇦🇷 Argentina' : '🇨🇱 Chile'}</td>
                      <td className="px-4 py-3.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${c.tipo === 'banco' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
                          {c.tipo === 'banco' ? '🏦 Banco' : '💵 Caja'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-[11px] text-gray-600">{c.moneda}</td>
                      <td className="px-4 py-3.5">
                        <span className={`font-mono font-bold ${s < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                          {fmtM(c.moneda, s)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-[#052698] font-semibold">
                        {c.moneda === 'USD' ? '—' : `≈ USD ${fmt(susd, 0)}`}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${s < 0 ? 'bg-red-50 text-red-600' : s === 0 ? 'bg-gray-100 text-gray-500' : 'bg-green-50 text-green-700'}`}>
                          {s < 0 ? '⚠ Negativo' : s === 0 ? 'Sin saldo' : 'OK'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
                <tr className="bg-[#EBF2FF] border-t-2 border-[#1168F8]">
                  <td colSpan={5} className="px-4 py-3 font-bold text-[#052698]">TOTAL CONSOLIDADO</td>
                  <td className="px-4 py-3 font-mono font-black text-[#052698] text-sm">USD {fmt(totalUSD, 0)}</td>
                  <td/>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Por operación */}
          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
              <span className="font-semibold text-sm text-gray-900">Saldo por operación / cliente</span>
              <span className="text-xs text-gray-400 ml-2">Muestra cómo se distribuye el dinero en custodia</span>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Operación','Cliente','Saldo USD','Estado'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {operaciones.filter(o => {
                  const movOp = movimientos.filter(m => m.operacion_id === o.id)
                  return movOp.length > 0
                }).map(o => {
                  const s = saldoPorOperacion(o.id)
                  return (
                    <tr key={o.id} className="border-b border-gray-50 hover:bg-blue-50/20">
                      <td className="px-4 py-3 font-mono font-bold text-[#1168F8]">{o.cotizacion?.num}</td>
                      <td className="px-4 py-3 font-semibold text-gray-800">{o.cotizacion?.cliente}</td>
                      <td className="px-4 py-3">
                        <span className={`font-mono font-bold ${s < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                          USD {fmt(s, 0)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${s < 0 ? 'bg-red-50 text-red-600' : s === 0 ? 'bg-gray-100 text-gray-500' : 'bg-green-50 text-green-700'}`}>
                          {s < 0 ? '⚠ Solicitar fondos' : s === 0 ? 'Sin saldo' : 'Con fondos'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
                {operaciones.filter(o => movimientos.some(m => m.operacion_id === o.id)).length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">Sin movimientos registrados por operación aún</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══ TAB MOVIMIENTOS ═══════════════════════════════════════ */}
      {tab === 'movimientos' && (
        <MovimientosTab
          supabase={supabase}
          cuentas={cuentas}
          movimientos={movimientos}
          operaciones={operaciones}
          facturasEmit={facturasEmit}
          facturasReci={facturasReci}
          tcActual={tcActual}
          currentUser={currentUser}
          permisos={permisos}
          reload={loadAll}
        />
      )}

      {/* ══ TAB POR OPERACIÓN ═════════════════════════════════════ */}
      {tab === 'por_operacion' && (
        <PorOperacionTab
          movimientos={movimientos}
          operaciones={operaciones}
          cuentas={cuentas}
          saldoPorOperacion={saldoPorOperacion}
        />
      )}

      {/* ══ TAB CONCILIACIÓN ══════════════════════════════════════ */}
      {tab === 'conciliacion' && (
        <ConciliacionTab
          supabase={supabase}
          cuentas={cuentas}
          movimientos={movimientos}
          saldoCuenta={saldoCuenta}
          reload={loadAll}
          permisos={permisos}
        />
      )}
    </div>
  )
}

// ── MOVIMIENTOS TAB ────────────────────────────────────────────
function MovimientosTab({ supabase, cuentas, movimientos, operaciones, facturasEmit, facturasReci, tcActual, currentUser, permisos, reload }: any) {
  const [form, setForm] = useState({
    fecha: nowDate(),
    tipo: 'ingreso_cliente',
    concepto: '',
    operacion_id: '',
    factura_id: '',
    marcar_pagada: true,
    cuenta_id: '',
    cuenta_destino_id: '',
    banco_origen: '',
    cuenta_origen: '',
    banco_destino: '',
    cuenta_destino_texto: '',
    nro_referencia: '',
    moneda: 'USD',
    monto: '',
    tc_usd: '',
    notas: '',
  })
  const [compFile, setCompFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroCuenta, setFiltroCuenta] = useState('')
  const [previewModal, setPreviewModal] = useState<{ url: string; nombre: string; tipo: string } | null>(null)

  // Facturas de la operación seleccionada, según el tipo de movimiento (pagos→recibidas, ingresos→emitidas).
  const facturaEsRecibida = form.tipo === 'pago_proveedor'
  const facturasDeOp = useMemo(() => {
    if (!form.operacion_id) return [] as any[]
    if (facturaEsRecibida) return (facturasReci || []).filter((f: any) => f.operacion_id === form.operacion_id && !['pagada', 'anulada'].includes(f.estado))
    if (['ingreso_cliente', 'honorarios_puertonoa'].includes(form.tipo)) return (facturasEmit || []).filter((f: any) => f.operacion_id === form.operacion_id && !['pagada', 'anulada'].includes(f.estado))
    return [] as any[]
  }, [form.operacion_id, form.tipo, facturaEsRecibida, facturasReci, facturasEmit])

  const inp = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white'

  // TC automático según moneda
  const tcAuto = form.moneda === 'USD' ? 1 : form.moneda === 'ARS' ? tcActual.ARS : tcActual.CLP
  const tcEfectivo = parseFloat(form.tc_usd) || tcAuto
  const montoNum = parseFloat(form.monto) || 0
  const usdEquiv = form.moneda === 'USD' ? montoNum : montoNum / tcEfectivo

  // Cuentas compatibles con la moneda seleccionada
  const cuentasCompatibles = cuentas.filter((c: any) => c.moneda === form.moneda)

  async function guardar() {
    if (!form.monto || !form.cuenta_id || !form.concepto) {
      alert('Completá cuenta, concepto y monto')
      return
    }
    if (form.tipo === 'transferencia' && !form.cuenta_destino_id) {
      alert('Seleccioná la cuenta destino')
      return
    }
    setSaving(true)
    const payload: any = {
      fecha: form.fecha,
      tipo: form.tipo,
      concepto: form.concepto,
      operacion_id: form.operacion_id || null,
      cuenta_id: form.cuenta_id,
      cuenta_destino_id: form.tipo === 'transferencia' ? form.cuenta_destino_id : null,
      banco_origen: form.banco_origen || null,
      cuenta_origen: form.cuenta_origen || null,
      banco_destino: form.banco_destino || null,
      cuenta_destino_texto: form.cuenta_destino_texto || null,
      nro_referencia: form.nro_referencia || null,
      moneda: form.moneda,
      monto: montoNum,
      tc_usd: tcEfectivo,
      usd: usdEquiv,
      notas: form.notas || null,
      creado_por: currentUser?.nombre || null,
    }
    const { data: movData } = await (supabase.from('fondos_movimientos') as any).insert(payload).select('id').single()
    if (movData && compFile) {
      const ext = compFile.name.split('.').pop()
      const path = `fondos/${movData.id}.${ext}`
      await supabase.storage.from('comprobantes').upload(path, compFile, { upsert: true })
      // Guardamos el PATH (la signed URL expira a 1h). La firma se genera al vuelo en Ver/Descargar.
      await (supabase.from('fondos_movimientos') as any).update({ comprobante_url: path, comprobante_nombre: compFile.name }).eq('id', movData.id)
    }
    // Vínculo con la factura: deja el movimiento ligado a la factura y, opcionalmente, la marca pagada.
    if (movData && form.factura_id) {
      const tabla = facturaEsRecibida ? 'facturas_recibidas' : 'facturas_emitidas'
      const col = facturaEsRecibida ? 'factura_recibida_id' : 'factura_emitida_id'
      await (supabase.from('fondos_movimientos') as any).update({ [col]: form.factura_id }).eq('id', movData.id)
      if (form.marcar_pagada) {
        await (supabase.from(tabla) as any).update({ estado: 'pagada', fecha_pago: form.fecha }).eq('id', form.factura_id)
      }
    }
    setForm(f => ({ ...f, monto: '', concepto: '', nro_referencia: '', notas: '', banco_origen: '', cuenta_origen: '', banco_destino: '', cuenta_destino_texto: '', factura_id: '' }))
    setCompFile(null)
    setSaving(false)
    reload()
  }

  // El comprobante es un respaldo SUBIDO: el preview pasa por el motor de marca de agua.
  function verComprobante(m: any) {
    if (!m.comprobante_url) return
    setPreviewModal({ url: urlVerConMarca('comprobantes', m.comprobante_url), nombre: m.comprobante_nombre || 'comprobante', tipo: m.comprobante_nombre?.endsWith('.pdf') ? 'pdf' : 'img' })
  }

  // Descarga el comprobante generando una signed URL con opción download
  async function descargarComprobante(m: any) {
    if (!m.comprobante_url) return
    const { data, error } = await supabase.storage.from('comprobantes').createSignedUrl(m.comprobante_url, 3600, { download: m.comprobante_nombre || 'comprobante' })
    if (error || !data?.signedUrl) { alert('No se pudo descargar el comprobante'); return }
    window.open(data.signedUrl, '_blank')
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar este movimiento?')) return
    await (supabase.from('fondos_movimientos') as any).delete().eq('id', id)
    reload()
  }

  const tipoActual = TIPOS_MOV.find(t => t.key === form.tipo)

  const movFiltrados = movimientos.filter((m: any) => {
    const matchT = !filtroTipo || m.tipo === filtroTipo
    const matchC = !filtroCuenta || m.cuenta_id === filtroCuenta
    return matchT && matchC
  })

  return (
    <div className="space-y-4">
      {/* Formulario de carga manual removido (etapa limpieza): los movimientos nacen de talonarios */}
      <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 text-[11px] text-amber-800 leading-snug">
        Los movimientos de fondos a rendir se generan automáticamente desde <b>Recibos</b> (ingresos de clientes) y <b>Órdenes de pago</b> (pagos por cuenta y orden, y devoluciones). Esta pantalla quedó para <b>consulta y conciliación</b>.
      </div>

      {/* Filtros */}
      <div className="flex gap-3 items-center flex-wrap">
        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:border-[#1168F8]">
          <option value="">Todos los tipos</option>
          {TIPOS_MOV.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <select value={filtroCuenta} onChange={e => setFiltroCuenta(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:border-[#1168F8]">
          <option value="">Todas las cuentas</option>
          {cuentas.map((c: any) => <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>)}
        </select>
        {(filtroTipo || filtroCuenta) && (
          <button onClick={() => { setFiltroTipo(''); setFiltroCuenta('') }}
            className="px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-500 hover:bg-gray-50">Limpiar</button>
        )}
        <span className="text-xs text-gray-400 ml-auto">{movFiltrados.length} movimiento(s)</span>
      </div>

      {/* Tabla */}
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ minWidth: '900px' }}>
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Fecha','Tipo','Concepto','Operación','Cuenta','Monto','USD','Ref.','Comp.',''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {movFiltrados.map((m: any) => {
                const tipo = TIPOS_MOV.find(t => t.key === m.tipo)
                return (
                  <tr key={m.id} className={`border-b border-gray-50 hover:bg-blue-50/20 ${m.conciliado ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3 font-mono text-[10px] text-gray-500">{m.fecha}</td>
                    <td className="px-4 py-3">
                      <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold w-fit ${tipo?.bg} ${tipo?.color}`}>
                        {tipo?.icon} {tipo?.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{m.concepto}</div>
                      {m.notas && <div className="text-[10px] text-gray-400">{m.notas}</div>}
                      {m.tipo === 'transferencia' && m.cuenta_dest && (
                        <div className="text-[10px] text-blue-500">→ {m.cuenta_dest.nombre}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {m.operacion ? (
                        <div>
                          <div className="font-mono text-[10px] text-[#1168F8] font-bold">{m.operacion.cotizacion?.num}</div>
                          <div className="text-[10px] text-gray-400">{m.operacion.cotizacion?.cliente}</div>
                        </div>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-[11px] text-gray-700">{m.cuenta?.nombre}</div>
                      <div className="text-[9px] text-gray-400">{m.cuenta?.pais === 'Argentina' ? '🇦🇷' : '🇨🇱'} {m.cuenta?.tipo === 'banco' ? 'Banco' : 'Caja'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-mono font-bold text-[11px] ${['ingreso_cliente'].includes(m.tipo) ? 'text-green-700' : 'text-red-600'}`}>
                        {['ingreso_cliente'].includes(m.tipo) ? '+' : '−'} {fmtM(m.moneda, m.monto)}
                      </span>
                      {m.moneda !== 'USD' && (
                        <div className="text-[9px] text-gray-400">TC: {fmt(m.tc_usd, 0)}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold text-[#052698] text-[11px]">
                      {['ingreso_cliente'].includes(m.tipo) ? '+' : '−'} USD {fmt(m.usd, 2)}
                    </td>
                    <td className="px-4 py-3 text-[10px] text-gray-400 font-mono">{m.nro_referencia || '—'}</td>
                    <td className="px-4 py-3">
                      {m.comprobante_url && (puede(permisos, 'fondos_custodia', 'ver') || puede(permisos, 'fondos_custodia', 'descargar')) ? (
                        <div className="flex gap-1">
                          {puede(permisos, 'fondos_custodia', 'ver') && (
                            <button onClick={() => verComprobante(m)}
                              className="px-2 py-1 bg-[#EBF2FF] text-[#1168F8] rounded-lg text-[10px] font-medium hover:bg-[#93B8FC]">📄 Ver</button>
                          )}
                          {puede(permisos, 'fondos_custodia', 'descargar') && (
                            <button onClick={() => descargarComprobante(m)}
                              className="px-2 py-1 border border-gray-200 text-gray-600 rounded-lg text-[10px] font-medium hover:bg-gray-50">⬇</button>
                          )}
                        </div>
                      ) : <span className="text-gray-300 text-[10px]">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {puede(permisos,'fondos_custodia','eliminar') && <button onClick={() => eliminar(m.id)} className="text-gray-300 hover:text-red-500 text-[10px] transition-colors">🗑</button>}
                    </td>
                  </tr>
                )
              })}
              {movFiltrados.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">Sin movimientos registrados aún.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Preview modal */}
      {previewModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setPreviewModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <span className="font-medium text-sm truncate">{previewModal.nombre}</span>
              <div className="flex gap-2">
                <a href={previewModal.url} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-[#1168F8] text-white rounded-lg text-xs">🔗 Abrir</a>
                <button onClick={() => setPreviewModal(null)} className="text-gray-400 text-xl px-1">×</button>
              </div>
            </div>
            <div className="overflow-auto max-h-[75vh] p-2">
              {previewModal.tipo === 'pdf'
                ? <iframe src={previewModal.url} className="w-full h-[70vh] border-0" title={previewModal.nombre}/>
                : <img src={previewModal.url} alt={previewModal.nombre} className="max-w-full mx-auto rounded"/>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── POR OPERACIÓN TAB ──────────────────────────────────────────
function PorOperacionTab({ movimientos, operaciones, cuentas, saldoPorOperacion }: any) {
  const [selOpId, setSelOpId] = useState('')
  const movOp = movimientos.filter((m: any) => m.operacion_id === selOpId)
  const saldo = selOpId ? saldoPorOperacion(selOpId) : 0
  const opSel = operaciones.find((o: any) => o.id === selOpId)

  const totalIng = movOp.filter((m: any) => m.tipo === 'ingreso_cliente').reduce((s: number, m: any) => s + m.usd, 0)
  const totalEg = movOp.filter((m: any) => m.tipo !== 'ingreso_cliente').reduce((s: number, m: any) => s + m.usd, 0)

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
        <label className="block text-[10px] font-semibold text-gray-500 mb-2 uppercase">Seleccioná una operación</label>
        <select value={selOpId} onChange={e => setSelOpId(e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:border-[#1168F8]">
          <option value="">— Elegir operación —</option>
          {operaciones.map((o: any) => (
            <option key={o.id} value={o.id}>{o.cotizacion?.num} · {o.cotizacion?.cliente}</option>
          ))}
        </select>
      </div>

      {selOpId && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
              <div className="text-[10px] font-semibold text-green-700 mb-1">Fondos recibidos</div>
              <div className="text-xl font-bold text-green-800 font-mono">USD {fmt(totalIng, 0)}</div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
              <div className="text-[10px] font-semibold text-red-700 mb-1">Fondos utilizados</div>
              <div className="text-xl font-bold text-red-700 font-mono">USD {fmt(totalEg, 0)}</div>
            </div>
            <div className={`border rounded-2xl p-4 ${saldo >= 0 ? 'bg-[#EBF2FF] border-[#93B8FC]' : 'bg-red-50 border-red-200'}`}>
              <div className={`text-[10px] font-semibold mb-1 ${saldo >= 0 ? 'text-[#052698]' : 'text-red-700'}`}>Saldo disponible</div>
              <div className={`text-xl font-bold font-mono ${saldo >= 0 ? 'text-[#052698]' : 'text-red-700'}`}>USD {fmt(saldo, 0)}</div>
              {saldo < 0 && <div className="text-[10px] text-red-500 mt-1">⚠ Solicitar fondos al cliente</div>}
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
              <span className="font-semibold text-sm text-gray-900">
                Movimientos · {opSel?.cotizacion?.num} — {opSel?.cotizacion?.cliente}
              </span>
            </div>
            {movOp.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">Sin movimientos para esta operación.</div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {['Fecha','Tipo','Concepto','Cuenta','Monto','USD','Ref.'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {movOp.map((m: any) => {
                    const tipo = TIPOS_MOV.find(t => t.key === m.tipo)
                    return (
                      <tr key={m.id} className="border-b border-gray-50 hover:bg-blue-50/20">
                        <td className="px-4 py-3 font-mono text-[10px] text-gray-500">{m.fecha}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${tipo?.bg} ${tipo?.color}`}>{tipo?.icon} {tipo?.label}</span>
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-800">{m.concepto}</td>
                        <td className="px-4 py-3 text-[11px] text-gray-500">{m.cuenta?.nombre}</td>
                        <td className="px-4 py-3 font-mono font-bold text-[11px]">
                          <span className={m.tipo === 'ingreso_cliente' ? 'text-green-700' : 'text-red-600'}>
                            {m.tipo === 'ingreso_cliente' ? '+' : '−'} {fmtM(m.moneda, m.monto)}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-[#052698] font-semibold">
                          {m.tipo === 'ingreso_cliente' ? '+' : '−'} USD {fmt(m.usd, 2)}
                        </td>
                        <td className="px-4 py-3 text-[10px] text-gray-400">{m.nro_referencia || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── CONCILIACIÓN TAB ───────────────────────────────────────────
function ConciliacionTab({ supabase, cuentas, movimientos, saldoCuenta, reload, permisos }: any) {
  const [selCuenta, setSelCuenta] = useState('')
  const [fecha, setFecha] = useState(nowDate())
  const [saldoReal, setSaldoReal] = useState('')
  const [notas, setNotas] = useState('')
  const [saving, setSaving] = useState(false)
  const [historial, setHistorial] = useState<any[]>([])

  useEffect(() => { loadHistorial() }, [])

  async function loadHistorial() {
    const { data } = await supabase.from('fondos_conciliacion').select('*, cuenta:fondos_cuentas(nombre,moneda)').order('fecha', { ascending: false }).limit(20)
    if (data) setHistorial(data)
  }

  async function guardar() {
    if (!selCuenta || !saldoReal) { alert('Seleccioná cuenta y cargá el saldo real'); return }
    setSaving(true)
    const cuenta = cuentas.find((c: any) => c.id === selCuenta)
    await (supabase.from('fondos_conciliacion') as any).insert({
      cuenta_id: selCuenta,
      fecha,
      saldo_real: parseFloat(saldoReal),
      moneda: cuenta?.moneda || 'USD',
      notas: notas || null,
    })
    setSaldoReal('')
    setNotas('')
    setSaving(false)
    await loadHistorial()
  }

  const cuentaSel = cuentas.find((c: any) => c.id === selCuenta)
  const saldoSistema = selCuenta ? saldoCuenta(selCuenta) : 0
  const saldoRealNum = parseFloat(saldoReal) || 0
  const diferencia = saldoRealNum - saldoSistema

  const inp = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white'

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <h3 className="font-semibold text-sm text-gray-900 mb-4">Conciliar saldo bancario / caja</h3>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Cuenta</label>
            <select value={selCuenta} onChange={e => setSelCuenta(e.target.value)} className={inp}>
              <option value="">— Seleccionar cuenta —</option>
              {cuentas.map((c: any) => <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Fecha del extracto / arqueo</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={inp}/>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">
              Saldo real {cuentaSel ? `(${cuentaSel.moneda})` : ''}
            </label>
            <input type="text" inputMode="decimal" value={saldoReal} onFocus={e => e.target.select()}
              onChange={e => setSaldoReal(e.target.value)}
              className={inp + ' text-right font-mono'} placeholder="0.00"/>
          </div>
        </div>

        {selCuenta && saldoReal && (
          <div className={`grid grid-cols-3 gap-3 mb-4 p-4 rounded-xl border-2 ${Math.abs(diferencia) < 0.01 ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
            <div className="text-center">
              <div className="text-[10px] text-gray-500 mb-1">Saldo sistema</div>
              <div className="font-mono font-bold text-gray-800">{fmtM(cuentaSel?.moneda || 'USD', saldoSistema)}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-gray-500 mb-1">Saldo real</div>
              <div className="font-mono font-bold text-gray-800">{fmtM(cuentaSel?.moneda || 'USD', saldoRealNum)}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-gray-500 mb-1">Diferencia</div>
              <div className={`font-mono font-bold ${Math.abs(diferencia) < 0.01 ? 'text-green-700' : 'text-amber-700'}`}>
                {Math.abs(diferencia) < 0.01 ? '✓ Coincide' : `${diferencia > 0 ? '+' : ''}${fmtM(cuentaSel?.moneda || 'USD', diferencia)}`}
              </div>
            </div>
          </div>
        )}

        <div className="mb-4">
          <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Notas</label>
          <input value={notas} onChange={e => setNotas(e.target.value)} className={inp} placeholder="Observaciones de la conciliación"/>
        </div>
        <div className="flex justify-end">
          {puede(permisos,'fondos_custodia','crear') && <button onClick={guardar} disabled={saving}
            className="px-5 py-2.5 bg-[#1168F8] text-white rounded-xl text-xs font-bold hover:bg-[#0a4fc4] disabled:opacity-50">
            {saving ? 'Guardando...' : 'Registrar conciliación'}
          </button>}
        </div>
      </div>

      {historial.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
            <span className="font-semibold text-sm text-gray-900">Historial de conciliaciones</span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Fecha','Cuenta','Saldo real','Notas','Registrado'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {historial.map((h: any) => (
                <tr key={h.id} className="border-b border-gray-50 hover:bg-blue-50/20">
                  <td className="px-4 py-3 font-mono text-[10px] text-gray-500">{h.fecha}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{h.cuenta?.nombre}</td>
                  <td className="px-4 py-3 font-mono font-bold text-gray-800">{fmtM(h.moneda, h.saldo_real)}</td>
                  <td className="px-4 py-3 text-gray-500">{h.notas || '—'}</td>
                  <td className="px-4 py-3 font-mono text-[10px] text-gray-400">
                    {new Date(h.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
