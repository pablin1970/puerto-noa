'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { cargarPermisos, puede } from '@/lib/permisos'
import { imprimirComprobante } from '@/lib/comprobantePrint'

const inp = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white'
const fmt = (n: number) => Math.round(n || 0).toLocaleString('es-CL')

function aUSD(monto: number, moneda: string, snap: any): number {
  if (!snap) return moneda === 'USD' ? monto : 0
  const m = (moneda || 'CLP').toUpperCase()
  if (m === 'USD') return monto
  const tasa = Number(snap[m]) || 0
  return tasa > 0 ? monto / tasa : 0
}
function aCLP(monto: number, moneda: string, snap: any): number {
  const usd = aUSD(monto, moneda, snap)
  const clp = Number(snap?.CLP) || 0
  return Math.round(usd * clp)
}

export default function OrdenesPagoPage() {
  const supabase = createClient()
  const [permisos, setPermisos] = useState<Record<string, string[]>>({})
  const [permListos, setPermListos] = useState(false)
  const [view, setView] = useState<'lista' | 'nuevo' | 'detalle'>('lista')
  const [ops, setOps] = useState<any[]>([])
  const [talonarios, setTalonarios] = useState<any[]>([])
  const [proveedores, setProveedores] = useState<any[]>([])
  const [clientes, setClientes] = useState<any[]>([])
  const [operaciones, setOperaciones] = useState<any[]>([])
  const [cuentasPropias, setCuentasPropias] = useState<any[]>([])
  const [cuentasRendir, setCuentasRendir] = useState<any[]>([])
  const [tcSnap, setTcSnap] = useState<any>(null)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [sel, setSel] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [buscar, setBuscar] = useState('')

  useEffect(() => { loadUser(); loadData(); cargarPermisos().then(p => { setPermisos(p); setPermListos(true) }) }, [])

  async function loadUser() {
    const { data: auth } = await supabase.auth.getUser()
    if (auth.user) { const { data: u } = await supabase.from('usuarios').select('*').eq('auth_id', auth.user.id).single(); setCurrentUser(u) }
  }

  async function loadData() {
    setLoading(true)
    const [rRes, talRes, tRes, oRes, cpRes, crRes, tceRes] = await Promise.all([
      (supabase.from('comprobantes_tesoreria') as any)
        .select('*, tercero:terceros(razon_social), tipo:tipos_comprobante(nombre,categoria)')
        .order('fecha', { ascending: false }).order('created_at', { ascending: false }),
      (supabase.from('talonarios') as any).select('*, tipo:tipos_comprobante(nombre,categoria)').eq('activo', true).order('orden'),
      supabase.from('terceros').select('id,razon_social,nro_doc,tipo_doc,pais,tipo').order('razon_social'),
      supabase.from('operaciones').select('id,tercero_id,cotizacion:cotizaciones(num,cliente)').order('created_at', { ascending: false }).limit(60),
      (supabase.from('cuentas_pn') as any).select('id,nombre,tipo,pais,moneda,saldo_actual').eq('activo', true).order('nombre'),
      (supabase.from('fondos_cuentas') as any).select('id,nombre,tipo,moneda,pais').eq('activo', true).order('orden'),
      (supabase.from('tipos_cambio_eventos') as any).select('fecha,fuente,ars,clp,cny').order('created_at', { ascending: false }).limit(1),
    ])
    setOps((rRes.data || []).filter((c: any) => c.tipo?.nombre === 'Orden de pago'))
    setTalonarios((talRes.data || []).filter((t: any) => t.tipo?.nombre === 'Orden de pago' && !t.fiscal))
    const ts = tRes.data || []
    setProveedores(ts.filter((t: any) => (t.tipo || []).includes('proveedor')))
    setClientes(ts.filter((t: any) => (t.tipo || []).includes('cliente')))
    if (oRes.data) setOperaciones(oRes.data)
    if (cpRes.data) setCuentasPropias(cpRes.data)
    if (crRes.data) setCuentasRendir(crRes.data)
    if (tceRes.data?.[0]) {
      const t: any = tceRes.data[0]
      setTcSnap({ fecha: t.fecha, fuente: t.fuente || null, USD: 1, ARS: Number(t.ars) || null, CLP: Number(t.clp) || null, CNY: Number(t.cny) || null })
    }
    setLoading(false)
  }

  const filtrados = ops.filter(r => {
    const b = buscar.toLowerCase()
    return !b || (r.tercero?.razon_social || '').toLowerCase().includes(b) || (r.numero_formateado || '').toLowerCase().includes(b)
  })
  const totalPagado = ops.filter(r => r.estado !== 'anulado').reduce((s, r) => s + (r.monto_usd || 0), 0)

  if (permListos && !puede(permisos, 'ordenes_pago', 'ver')) {
    return (<div className="p-6 bg-gray-50 min-h-screen flex items-center justify-center"><div className="text-center max-w-sm"><div className="text-5xl mb-3">🔒</div><h2 className="text-lg font-bold text-gray-700">Sin acceso</h2><p className="text-sm text-gray-400 mt-1">No tenés permiso para ver órdenes de pago.</p></div></div>)
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Órdenes de pago</h1>
          <p className="text-xs text-gray-400 mt-0.5">Egresos · pago a proveedor desde PN o por cuenta y orden, y devoluciones</p>
        </div>
        <div className="flex gap-2">
          {view !== 'lista' && <button onClick={() => { setView('lista'); setSel(null) }} className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold hover:bg-gray-100">← Volver</button>}
          {view === 'lista' && puede(permisos, 'ordenes_pago', 'crear') && (
            <button onClick={() => setView('nuevo')} className="px-5 py-2.5 bg-[#1168F8] text-white rounded-xl text-sm font-bold hover:bg-[#0a4fc4] shadow-sm">+ Nueva orden de pago</button>
          )}
        </div>
      </div>

      {view === 'lista' && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm"><div className="text-xl mb-1">📤</div><div className="text-xl font-bold text-gray-900">{ops.length}</div><div className="text-[10px] text-gray-500 mt-0.5">Órdenes emitidas</div></div>
            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm"><div className="text-xl mb-1">💸</div><div className="text-xl font-bold text-red-600">USD {fmt(totalPagado)}</div><div className="text-[10px] text-gray-500 mt-0.5">Total pagado (equiv.)</div></div>
            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm"><div className="text-xl mb-1">📋</div><div className="text-xl font-bold text-[#7C3AED]">{ops.filter(r => r.contexto === 'rendir').length}</div><div className="text-[10px] text-gray-500 mt-0.5">Por cuenta y orden</div></div>
          </div>

          <div className="flex gap-3 mb-4 items-center">
            <div className="relative flex-1 min-w-60">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🔍</span>
              <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar beneficiario, número…" className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white shadow-sm" />
            </div>
            <span className="text-xs text-gray-400 ml-auto">{filtrados.length} orden(es)</span>
          </div>

          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
            {loading ? <div className="p-8 text-center text-gray-400">Cargando…</div> :
              filtrados.length === 0 ? <div className="p-8 text-center text-gray-400 text-sm">Sin órdenes de pago.</div> : (
                <table className="w-full text-xs">
                  <thead><tr className="bg-gray-50 border-b border-gray-100 text-gray-500">
                    <th className="px-4 py-3 text-left font-semibold">Número</th>
                    <th className="px-4 py-3 text-left font-semibold">Fecha</th>
                    <th className="px-4 py-3 text-left font-semibold">Beneficiario</th>
                    <th className="px-4 py-3 text-left font-semibold">Origen</th>
                    <th className="px-4 py-3 text-right font-semibold">Monto</th>
                    <th className="px-4 py-3 text-center font-semibold">Estado</th>
                  </tr></thead>
                  <tbody>
                    {filtrados.map(r => (
                      <tr key={r.id} onClick={() => { setSel(r); setView('detalle') }} className="border-b border-gray-50 hover:bg-[#F7FAFF] cursor-pointer">
                        <td className="px-4 py-3 font-mono font-bold text-[#1168F8]">{r.numero_formateado}</td>
                        <td className="px-4 py-3 text-gray-600">{r.fecha}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{r.tercero?.razon_social || '—'}</td>
                        <td className="px-4 py-3">{r.contexto === 'rendir'
                          ? <span className="px-2 py-0.5 rounded-full text-[10px] bg-purple-50 text-purple-700">Caja a rendir</span>
                          : <span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-50 text-blue-700">Cuenta PN</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold">{r.moneda} {fmt(r.monto)}</td>
                        <td className="px-4 py-3 text-center">{r.estado === 'anulado' ? <span className="text-red-500">anulado</span> : <span className="text-green-600">emitida</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
          </div>
        </>
      )}

      {view === 'nuevo' && (
        <FormOrdenPago supabase={supabase} currentUser={currentUser}
          talonarios={talonarios} proveedores={proveedores} clientes={clientes} operaciones={operaciones}
          cuentasPropias={cuentasPropias} cuentasRendir={cuentasRendir} tcSnap={tcSnap}
          onSave={async () => { await loadData(); setView('lista') }} onCancel={() => setView('lista')} />
      )}

      {view === 'detalle' && sel && <DetalleOP op={sel} supabase={supabase} />}
    </div>
  )
}

function FormOrdenPago({ supabase, currentUser, talonarios, proveedores, clientes, operaciones, cuentasPropias, cuentasRendir, tcSnap, onSave, onCancel }: any) {
  const [contexto, setContexto] = useState<'propia' | 'rendir'>('propia')
  const [modoRendir, setModoRendir] = useState<'proveedor' | 'devolucion'>('proveedor')  // solo en rendir
  const [form, setForm] = useState<any>({
    talonario_id: talonarios?.[0]?.id || '', tercero_id: '', operacion_id: '',
    fecha: new Date().toISOString().slice(0, 10), moneda: '',
    cuenta_propia_id: '', cuenta_rendir_id: '', monto: '', concepto: '', notas: '',
  })
  const [buscarT, setBuscarT] = useState('')
  const [showTDD, setShowTDD] = useState(false)
  const [facturas, setFacturas] = useState<any[]>([])
  const [imput, setImput] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)
  const [compFile, setCompFile] = useState<File | null>(null)

  const esDevolucion = contexto === 'rendir' && modoRendir === 'devolucion'
  const listaBenef = esDevolucion ? clientes : proveedores

  // Facturas recibidas pendientes: en propia → del proveedor (facturada_a puerto_noa); en rendir → de la operación
  useEffect(() => {
    if (esDevolucion) { setFacturas([]); setImput({}); return }
    let cancel = false
    ;(async () => {
      let q = (supabase.from('facturas_recibidas') as any)
        .select('id,folio,fecha_emision,moneda,total,estado,operacion_id,facturada_a,proveedor_razon_social')
        .not('estado', 'in', '("anulada","pagada")')
      if (contexto === 'propia') {
        if (!form.tercero_id) { setFacturas([]); return }
        q = q.eq('tercero_id', form.tercero_id).eq('facturada_a', 'puerto_noa')
      } else {
        if (!form.operacion_id) { setFacturas([]); return }
        q = q.eq('operacion_id', form.operacion_id)
      }
      const { data: fs } = await q
      const ids = (fs || []).map((f: any) => f.id)
      let imps: any[] = []
      if (ids.length > 0) {
        const { data: ii } = await (supabase.from('comprobantes_tesoreria_imputaciones') as any).select('factura_recibida_id,monto').in('factura_recibida_id', ids)
        imps = ii || []
      }
      if (cancel) return
      const conSaldo = (fs || []).map((f: any) => {
        const yaImp = imps.filter(x => x.factura_recibida_id === f.id).reduce((s, x) => s + (Number(x.monto) || 0), 0)
        return { ...f, saldo: (Number(f.total) || 0) - yaImp }
      }).filter((f: any) => f.saldo > 0.5)
      setFacturas(conSaldo)
    })()
    return () => { cancel = true }
  }, [contexto, modoRendir, form.tercero_id, form.operacion_id])

  const tercero = listaBenef.find((t: any) => t.id === form.tercero_id)
  const monto = parseFloat(form.monto) || 0
  const totalImputado = Object.values(imput).reduce((s: number, v: any) => s + (Number(v) || 0), 0)
  const aCuenta = Math.max(0, monto - totalImputado)
  // El TC sale del snapshot según la moneda de la cuenta (no se carga a mano)
  const tcMoneda = form.moneda === 'USD' ? 1 : (Number(tcSnap?.[form.moneda]) || null)

  function selTercero(t: any) { setForm((f: any) => ({ ...f, tercero_id: t.id })); setBuscarT(t.razon_social); setShowTDD(false) }
  function setImp(fid: string, val: number, max: number) { setImput(prev => ({ ...prev, [fid]: Math.max(0, Math.min(val, max)) })) }

  async function guardar() {
    if (!form.talonario_id) { alert('No hay talonario de órdenes de pago. Cargá uno en Catálogos › Talonarios.'); return }
    if (!form.tercero_id) { alert(esDevolucion ? 'Elegí el cliente' : 'Elegí el proveedor'); return }
    if (monto <= 0) { alert('Ingresá el monto'); return }
    if (contexto === 'propia' && !form.cuenta_propia_id) { alert('Elegí la cuenta de Puerto NOA de donde sale la plata'); return }
    if (contexto === 'rendir' && !form.cuenta_rendir_id) { alert('Elegí la caja a rendir'); return }
    if (contexto === 'rendir' && !form.operacion_id) { alert('El pago por cuenta y orden requiere una operación'); return }
    if (totalImputado > monto + 0.5) { alert('Lo imputado supera el monto de la orden'); return }
    setSaving(true)
    try {
      const { data: numData, error: numErr } = await (supabase.rpc as any)('emitir_numero_talonario', { p_talonario: form.talonario_id })
      if (numErr || !numData?.[0]) { alert('Error al numerar: ' + (numErr?.message || 'desconocido')); setSaving(false); return }
      const numero = numData[0].numero, formateado = numData[0].formateado
      const tcRef = tcMoneda
      const montoUsd = aUSD(monto, form.moneda, tcSnap)

      const { data: comp, error: cErr } = await (supabase.from('comprobantes_tesoreria') as any).insert({
        talonario_id: form.talonario_id, tipo_comprobante_id: talonarios.find((t: any) => t.id === form.talonario_id)?.tipo_comprobante_id,
        numero, numero_formateado: formateado, fecha: form.fecha, sentido: 'egreso',
        tercero_id: form.tercero_id, operacion_id: form.operacion_id || null,
        concepto: form.concepto || (esDevolucion ? 'Devolución a cliente' : 'Pago a proveedor'),
        contexto, cuenta_propia_id: contexto === 'propia' ? form.cuenta_propia_id : null,
        cuenta_rendir_id: contexto === 'rendir' ? form.cuenta_rendir_id : null,
        moneda: form.moneda, monto, tc_referencia: tcRef, monto_usd: montoUsd, tc_snapshot: tcSnap || null,
        imputa_facturas: !esDevolucion && totalImputado > 0, a_cuenta: contexto === 'propia' && !esDevolucion && aCuenta > 0.5,
        estado: 'emitido', creado_por: currentUser?.nombre, creado_por_id: currentUser?.id,
      }).select('id').single()
      if (cErr || !comp) { alert('Error al guardar la orden: ' + (cErr?.message || '')); setSaving(false); return }

      let archivoPath: string | null = null
      if (compFile) {
        const ext = compFile.name.split('.').pop()
        archivoPath = `ordenes-pago/${comp.id}.${ext}`
        await supabase.storage.from('comprobantes').upload(archivoPath, compFile, { upsert: true })
        await (supabase.from('comprobantes_tesoreria') as any).update({ archivo_url: archivoPath, archivo_nombre: compFile.name }).eq('id', comp.id)
      }

      if (contexto === 'propia') {
        // Egreso de cuenta propia + saldo
        const cuenta = cuentasPropias.find((c: any) => c.id === form.cuenta_propia_id)
        await (supabase.from('movimientos_cuentas_pn') as any).insert({
          cuenta_id: form.cuenta_propia_id, fecha: form.fecha, tipo: 'egreso',
          concepto: `OP ${formateado} · ${tercero?.razon_social || ''}`, monto, moneda: form.moneda,
          monto_clp_equiv: aCLP(monto, form.moneda, tcSnap), tipo_cambio: tcRef,
          referencia: formateado, operacion_id: form.operacion_id || null, tercero_id: form.tercero_id,
          talonario_id: form.talonario_id, numero_comprobante: formateado, tc_snapshot: tcSnap || null,
          saldo_posterior: (Number(cuenta?.saldo_actual) || 0) - monto,
        })
        await (supabase.from('cuentas_pn') as any).update({ saldo_actual: (Number(cuenta?.saldo_actual) || 0) - monto }).eq('id', form.cuenta_propia_id)
        // Imputaciones + cc_proveedores (debe) + marcar pagadas
        for (const f of facturas) {
          const m = Number(imput[f.id]) || 0
          if (m <= 0) continue
          await (supabase.from('comprobantes_tesoreria_imputaciones') as any).insert({
            comprobante_id: comp.id, factura_recibida_id: f.id, monto: m, monto_usd: aUSD(m, form.moneda, tcSnap),
          })
          await (supabase.from('cc_proveedores') as any).insert({
            tercero_id: form.tercero_id, operacion_id: f.operacion_id || form.operacion_id || null, tipo: 'pago',
            factura_id: f.id, fecha: form.fecha, concepto: `OP ${formateado}`, moneda: form.moneda, monto: m,
            tc_referencia: tcRef, monto_usd: aUSD(m, form.moneda, tcSnap), debe: m, haber: 0, notas: form.notas || null,
            creado_por: currentUser?.nombre,
          })
          if (m >= (Number(f.saldo) || 0) - 0.5) {
            await (supabase.from('facturas_recibidas') as any).update({ estado: 'pagada', estado_pago: 'pagada', fecha_pago: form.fecha }).eq('id', f.id)
          }
        }
        if (aCuenta > 0.5) {
          await (supabase.from('cc_proveedores') as any).insert({
            tercero_id: form.tercero_id, operacion_id: form.operacion_id || null, tipo: 'pago', fecha: form.fecha,
            concepto: `OP ${formateado} · a cuenta`, moneda: form.moneda, monto: aCuenta, tc_referencia: tcRef,
            monto_usd: aUSD(aCuenta, form.moneda, tcSnap), debe: aCuenta, haber: 0, notas: 'Pago a cuenta (sin imputar)', creado_por: currentUser?.nombre,
          })
        }
      } else {
        // Caja a rendir: por cuenta y orden (pago_proveedor) o devolución (devolucion_cliente). No toca cc de PN.
        await (supabase.from('fondos_movimientos') as any).insert({
          fecha: form.fecha, tipo: esDevolucion ? 'devolucion_cliente' : 'pago_proveedor',
          concepto: `OP ${formateado} · ${esDevolucion ? 'devolución a cliente' : 'pago por cuenta y orden'}`,
          operacion_id: form.operacion_id, cuenta_id: form.cuenta_rendir_id, moneda: form.moneda, monto,
          tc_usd: tcRef || 1, usd: aUSD(monto, form.moneda, tcSnap), tercero_id: form.tercero_id,
          talonario_id: form.talonario_id, numero_comprobante: formateado, tc_snapshot: tcSnap || null,
          creado_por: currentUser?.nombre,
        })
        // Marcar facturas de la operación pagadas + registrar imputación (trazabilidad), sin cc PN
        if (!esDevolucion) {
          for (const f of facturas) {
            const m = Number(imput[f.id]) || 0
            if (m <= 0) continue
            await (supabase.from('comprobantes_tesoreria_imputaciones') as any).insert({
              comprobante_id: comp.id, factura_recibida_id: f.id, monto: m, monto_usd: aUSD(m, form.moneda, tcSnap),
            })
            if (m >= (Number(f.saldo) || 0) - 0.5) {
              await (supabase.from('facturas_recibidas') as any).update({ estado: 'pagada', estado_pago: 'pagada', fecha_pago: form.fecha }).eq('id', f.id)
            }
          }
        }
      }
      await onSave()
    } catch (e: any) { alert('Error inesperado: ' + (e?.message || e)); setSaving(false) }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
        <label className="block text-[10px] font-semibold text-gray-500 mb-2 uppercase">¿De dónde sale la plata?</label>
        <div className="flex gap-2">
          <button onClick={() => setContexto('propia')} className={`flex-1 px-4 py-2.5 rounded-xl text-xs font-semibold border ${contexto === 'propia' ? 'bg-[#1168F8] text-white border-[#1168F8]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#1168F8]'}`}>
            🏦 Cuenta propia de Puerto NOA
          </button>
          <button onClick={() => setContexto('rendir')} className={`flex-1 px-4 py-2.5 rounded-xl text-xs font-semibold border ${contexto === 'rendir' ? 'bg-[#7C3AED] text-white border-[#7C3AED]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#7C3AED]'}`}>
            📥 Caja a rendir (por cuenta y orden)
          </button>
        </div>
        <p className="text-[10px] text-gray-400 mt-2">{contexto === 'propia' ? 'Pago de una deuda de Puerto NOA: sale de una cuenta propia, baja el saldo del proveedor y cancela facturas recibidas.' : 'Pago con plata del cliente que PN administra: sale de la caja a rendir de la operación. No afecta la cuenta corriente de PN.'}</p>
        {contexto === 'rendir' && (
          <div className="flex gap-2 mt-3">
            <button onClick={() => { setModoRendir('proveedor'); setForm((f: any) => ({ ...f, tercero_id: '' })); setBuscarT('') }} className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border ${modoRendir === 'proveedor' ? 'bg-purple-100 text-purple-800 border-purple-200' : 'bg-white text-gray-500 border-gray-200'}`}>Pago a proveedor</button>
            <button onClick={() => { setModoRendir('devolucion'); setForm((f: any) => ({ ...f, tercero_id: '' })); setBuscarT('') }} className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border ${modoRendir === 'devolucion' ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-white text-gray-500 border-gray-200'}`}>Devolución al cliente</button>
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 relative">
            <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">{esDevolucion ? 'Cliente' : 'Proveedor'}</label>
            <input value={buscarT} onChange={e => { setBuscarT(e.target.value); setForm((f: any) => ({ ...f, tercero_id: '' })); setShowTDD(true) }}
              onFocus={() => setShowTDD(true)} onBlur={() => setTimeout(() => setShowTDD(false), 150)} className={inp} placeholder={`Buscar ${esDevolucion ? 'cliente' : 'proveedor'}…`} />
            {showTDD && (() => {
              const q = buscarT.trim().toLowerCase()
              const lista = listaBenef.filter((t: any) => !q || t.razon_social.toLowerCase().includes(q)).slice(0, 8)
              return lista.length ? (
                <div className="absolute z-50 top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl max-h-52 overflow-y-auto mt-1">
                  {lista.map((t: any) => <button key={t.id} onMouseDown={() => selTercero(t)} className="w-full text-left px-4 py-2.5 hover:bg-[#EBF2FF] border-b border-gray-50 last:border-0"><div className="font-semibold text-xs">{t.razon_social}</div>{t.nro_doc && <div className="text-[10px] text-gray-400 font-mono">{t.tipo_doc}: {t.nro_doc}</div>}</button>)}
                </div>
              ) : null
            })()}
          </div>
          <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Talonario</label>
            <select value={form.talonario_id} onChange={e => setForm((f: any) => ({ ...f, talonario_id: e.target.value }))} className={inp}>
              {talonarios.length === 0 && <option value="">— sin talonario de OP —</option>}
              {talonarios.map((t: any) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </div>
          <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Fecha</label>
            <input type="date" value={form.fecha} onChange={e => setForm((f: any) => ({ ...f, fecha: e.target.value }))} className={inp} /></div>
          <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Operación {contexto === 'rendir' ? '*' : '(opcional)'}</label>
            <select value={form.operacion_id} onChange={e => setForm((f: any) => ({ ...f, operacion_id: e.target.value }))} className={inp}>
              <option value="">Sin vincular</option>
              {operaciones.map((o: any) => <option key={o.id} value={o.id}>{o.cotizacion?.num} · {o.cotizacion?.cliente}</option>)}
            </select>
          </div>
          {contexto === 'propia' ? (
            <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Cuenta de Puerto NOA (sale)</label>
              <select value={form.cuenta_propia_id} onChange={e => { const c = cuentasPropias.find((x: any) => x.id === e.target.value); setForm((f: any) => ({ ...f, cuenta_propia_id: e.target.value, moneda: c?.moneda || '' })) }} className={inp}>
                <option value="">— elegí la cuenta —</option>
                {cuentasPropias.map((c: any) => <option key={c.id} value={c.id}>{c.nombre} · {c.tipo === 'banco' ? '🏦' : '💵'} {c.moneda} ({c.pais}) · saldo {fmt(c.saldo_actual)}</option>)}
              </select>
            </div>
          ) : (
            <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Caja a rendir (sale)</label>
              <select value={form.cuenta_rendir_id} onChange={e => { const c = cuentasRendir.find((x: any) => x.id === e.target.value); setForm((f: any) => ({ ...f, cuenta_rendir_id: e.target.value, moneda: c?.moneda || '' })) }} className={inp}>
                <option value="">— elegí la caja —</option>
                {cuentasRendir.map((c: any) => <option key={c.id} value={c.id}>{c.nombre} · {c.moneda} ({c.pais})</option>)}
              </select>
            </div>
          )}
          <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Moneda</label>
            <div className={inp + ' bg-gray-50 text-gray-600 flex items-center'}>{form.moneda || <span className="text-gray-400">la define la cuenta</span>}</div>
          </div>
          <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Monto</label>
            <input type="text" inputMode="decimal" value={form.monto} onChange={e => setForm((f: any) => ({ ...f, monto: e.target.value.replace(/\./g, '').replace(',', '.') }))} className={inp + ' text-right font-mono'} placeholder="0" /></div>
          {form.moneda && form.moneda !== 'USD' && <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">TC del día (snapshot)</label>
            <div className={inp + ' bg-gray-50 text-gray-600 font-mono flex items-center'}>{tcMoneda ? `1 USD = ${fmt(tcMoneda)} ${form.moneda}` : <span className="text-gray-400 font-sans">sin snapshot</span>}</div></div>}
        </div>
      </div>

      {!esDevolucion && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <h3 className="font-bold text-sm text-gray-900 mb-1">Imputar a facturas recibidas</h3>
          <p className="text-[11px] text-gray-400 mb-3">{contexto === 'propia' ? 'Facturas del proveedor a nombre de Puerto NOA.' : 'Facturas de la operación a pagar por cuenta y orden.'} Lo no imputado queda a cuenta.</p>
          {facturas.length === 0 ? (
            <div className="text-center py-6 text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl">{(contexto === 'propia' && !form.tercero_id) ? 'Elegí el proveedor para ver sus facturas.' : (contexto === 'rendir' && !form.operacion_id) ? 'Elegí la operación para ver sus facturas.' : 'No hay facturas pendientes. La orden quedará a cuenta.'}</div>
          ) : (
            <div className="space-y-2">
              {facturas.map((f: any) => (
                <div key={f.id} className="flex items-center gap-3 border border-gray-200 rounded-xl p-2.5">
                  <div className="flex-1">
                    <div className="text-xs font-semibold">{f.folio ? `Folio ${f.folio}` : '(s/folio)'} <span className="text-gray-400">· {f.proveedor_razon_social}</span></div>
                    <div className="text-[10px] text-gray-400">{f.fecha_emision} · {f.moneda} · saldo {fmt(f.saldo)}</div>
                  </div>
                  <button onClick={() => setImp(f.id, f.saldo, f.saldo)} className="text-[10px] text-[#1168F8] hover:underline">total</button>
                  <input type="text" inputMode="decimal" value={imput[f.id] || ''} onChange={e => setImp(f.id, parseFloat(e.target.value.replace(/\./g, '').replace(',', '.')) || 0, f.saldo)}
                    className="w-28 px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-right font-mono focus:outline-none focus:border-[#1168F8]" placeholder="imputar" />
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-6 mt-3 text-xs">
            <span className="text-gray-500">Imputado: <span className="font-mono font-bold text-gray-800">{fmt(totalImputado)}</span></span>
            {contexto === 'propia' && <span className="text-gray-500">A cuenta: <span className="font-mono font-bold text-[#7C3AED]">{fmt(aCuenta)}</span></span>}
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Concepto</label>
            <input value={form.concepto} onChange={e => setForm((f: any) => ({ ...f, concepto: e.target.value }))} className={inp} placeholder={esDevolucion ? 'ej. Devolución saldo a rendir' : 'ej. Pago flete / despacho'} /></div>
          <div className="col-span-2"><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Comprobante / recibo del proveedor (adjunto)</label>
            <input type="file" onChange={e => setCompFile(e.target.files?.[0] || null)} className="text-xs" /></div>
          <div className="col-span-2"><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Notas</label>
            <textarea value={form.notas} onChange={e => setForm((f: any) => ({ ...f, notas: e.target.value }))} className={inp} rows={2} /></div>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-5 py-2.5 border border-gray-200 rounded-xl text-xs font-semibold hover:bg-gray-50">Cancelar</button>
        <button onClick={guardar} disabled={saving} className="px-6 py-2.5 bg-[#1168F8] text-white rounded-xl text-xs font-bold hover:bg-[#0a4fc4] disabled:opacity-50">{saving ? 'Emitiendo…' : 'Emitir orden de pago'}</button>
      </div>
    </div>
  )
}

function DetalleOP({ op, supabase }: any) {
  const [imps, setImps] = useState<any[]>([])
  const [abriendo, setAbriendo] = useState(false)
  useEffect(() => {
    (async () => {
      const { data } = await (supabase.from('comprobantes_tesoreria_imputaciones') as any)
        .select('*, factura:facturas_recibidas(folio,proveedor_razon_social,total)').eq('comprobante_id', op.id)
      setImps(data || [])
    })()
  }, [op.id])
  async function abrir() {
    if (!op.archivo_url) return
    setAbriendo(true)
    const { data } = await supabase.storage.from('comprobantes').createSignedUrl(op.archivo_url, 120)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
    setAbriendo(false)
  }

  async function imprimir() {
    let empresa: any = null
    const { data: emp } = await (supabase.from('empresa_config') as any).select('*').not('rut', 'is', null).limit(1)
    empresa = emp?.[0]
    if (!empresa) { const { data: e2 } = await (supabase.from('empresa_config') as any).select('*').limit(1); empresa = e2?.[0] }
    if (empresa?.logo_url && !/^https?:/i.test(empresa.logo_url)) empresa = { ...empresa, logo_url: null }
    let nro_doc: any = null
    if (op.tercero_id) { const { data: t } = await (supabase.from('terceros') as any).select('nro_doc').eq('id', op.tercero_id).limit(1); nro_doc = t?.[0]?.nro_doc || null }
    imprimirComprobante({
      empresa: empresa || {}, tipoDoc: 'ORDEN DE PAGO', numero: op.numero_formateado, fecha: op.fecha,
      receptorLabel: 'Pagado a', receptor: { razon_social: op.tercero?.razon_social, nro_doc },
      concepto: op.concepto, moneda: op.moneda, monto: op.monto, montoUsd: op.monto_usd,
      imputaciones: imps.map((i: any) => ({ etiqueta: i.factura?.folio ? `Folio ${i.factura.folio}` : 'Factura', monto: Number(i.monto) || 0 })),
      leyendaPie: 'Documento interno de control — no constituye documento tributario electrónico (DTE).',
    })
  }
  return (
    <div className="max-w-2xl space-y-4">
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
        <div className="flex items-start justify-between border-b border-gray-100 pb-4 mb-4">
          <div>
            <div className="text-[11px] font-bold text-[#1168F8]/60 uppercase tracking-widest">Orden de pago</div>
            <div className="text-2xl font-bold font-mono text-gray-900">{op.numero_formateado}</div>
            <div className="text-xs text-gray-400 mt-1">{op.fecha}</div>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${op.contexto === 'rendir' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'}`}>
            {op.contexto === 'rendir' ? 'Caja a rendir' : 'Cuenta propia PN'}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-xs">
          <div><div className="text-[10px] text-gray-400 uppercase">Beneficiario</div><div className="font-semibold text-gray-900">{op.tercero?.razon_social || '—'}</div></div>
          <div><div className="text-[10px] text-gray-400 uppercase">Monto</div><div className="font-mono font-bold text-lg text-gray-900">{op.moneda} {fmt(op.monto)}</div></div>
          <div><div className="text-[10px] text-gray-400 uppercase">Concepto</div><div className="text-gray-700">{op.concepto || '—'}</div></div>
          <div><div className="text-[10px] text-gray-400 uppercase">Equivalente USD</div><div className="font-mono text-gray-700">USD {fmt(op.monto_usd || 0)}</div></div>
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={imprimir} className="px-3 py-1.5 bg-[#1168F8] text-white rounded-lg text-xs font-semibold hover:bg-[#0a4fc4]">🖨 Imprimir orden</button>
          {op.archivo_url && <button onClick={abrir} disabled={abriendo} className="px-3 py-1.5 bg-[#EBF2FF] text-[#1168F8] rounded-lg text-xs font-medium hover:bg-[#93B8FC] disabled:opacity-50">📄 Ver comprobante</button>}
        </div>
      </div>
      {imps.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <h3 className="font-bold text-sm text-gray-900 mb-3">Imputado a facturas</h3>
          <div className="space-y-1.5">
            {imps.map((i: any) => (
              <div key={i.id} className="flex justify-between text-xs border-b border-gray-50 pb-1.5">
                <span className="text-gray-700">{i.factura?.folio ? `Folio ${i.factura.folio}` : 'factura'} <span className="text-gray-400">· {i.factura?.proveedor_razon_social}</span></span>
                <span className="font-mono font-semibold">{fmt(i.monto)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {op.a_cuenta && <div className="text-[11px] text-[#7C3AED] bg-purple-50 border border-purple-100 rounded-xl px-4 py-2.5">Parte de esta orden quedó <b>a cuenta</b> del proveedor. Lo podés imputar después desde la cuenta corriente.</div>}
    </div>
  )
}
