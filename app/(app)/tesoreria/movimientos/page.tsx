'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { cargarPermisos, puede } from '@/lib/permisos'

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
  return snap?.CLP ? usd * Number(snap.CLP) : usd
}

export default function MovimientosCuentasPage() {
  const supabase = createClient()
  const [permisos, setPermisos] = useState<Record<string, string[]>>({})
  const [permListos, setPermListos] = useState(false)
  const [view, setView] = useState<'lista' | 'nuevo'>('lista')
  const [movs, setMovs] = useState<any[]>([])
  const [talonarios, setTalonarios] = useState<any[]>([])
  const [cuentas, setCuentas] = useState<any[]>([])
  const [tcSnap, setTcSnap] = useState<any>(null)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadUser(); loadData(); cargarPermisos().then(p => { setPermisos(p); setPermListos(true) }) }, [])

  async function loadUser() {
    const { data: auth } = await supabase.auth.getUser()
    if (auth.user) { const { data: u } = await supabase.from('usuarios').select('*').eq('auth_id', auth.user.id).single(); setCurrentUser(u) }
  }

  async function loadData() {
    setLoading(true)
    const [cRes, talRes, cpRes, tceRes] = await Promise.all([
      (supabase.from('comprobantes_tesoreria') as any).select('*, tipo:tipos_comprobante(nombre)').order('fecha', { ascending: false }).order('created_at', { ascending: false }),
      (supabase.from('talonarios') as any).select('*, tipo:tipos_comprobante(nombre)').eq('activo', true).order('orden'),
      (supabase.from('cuentas_pn') as any).select('id,nombre,tipo,pais,moneda,saldo_actual').eq('activo', true).order('nombre'),
      (supabase.from('tipos_cambio_eventos') as any).select('fecha,fuente,ars,clp,cny').order('created_at', { ascending: false }).limit(1),
    ])
    setMovs((cRes.data || []).filter((c: any) => c.tipo?.nombre === 'Movimiento de fondos' || c.tipo?.nombre === 'Comprobante de cambio de divisa'))
    setTalonarios((talRes.data || []).filter((t: any) => (t.tipo?.nombre === 'Movimiento de fondos' || t.tipo?.nombre === 'Comprobante de cambio de divisa') && !t.fiscal))
    if (cpRes.data) setCuentas(cpRes.data)
    if (tceRes.data?.[0]) {
      const t: any = tceRes.data[0]
      setTcSnap({ fecha: t.fecha, fuente: t.fuente || null, USD: 1, ARS: Number(t.ars) || null, CLP: Number(t.clp) || null, CNY: Number(t.cny) || null })
    }
    setLoading(false)
  }

  if (permListos && !puede(permisos, 'movimientos_cuentas', 'ver')) {
    return (<div className="p-6 bg-gray-50 min-h-screen flex items-center justify-center"><div className="text-center max-w-sm"><div className="text-5xl mb-3">🔒</div><h2 className="text-lg font-bold text-gray-700">Sin acceso</h2><p className="text-sm text-gray-400 mt-1">No tenés permiso para ver movimientos de cuentas.</p></div></div>)
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Movimientos entre cuentas propias</h1>
          <p className="text-xs text-gray-400 mt-0.5">Transferencias y cambios de divisa entre cuentas de Puerto NOA</p>
        </div>
        <div className="flex gap-2">
          {view !== 'lista' && <button onClick={() => setView('lista')} className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold hover:bg-gray-100">← Volver</button>}
          {view === 'lista' && puede(permisos, 'movimientos_cuentas', 'crear') && (
            <button onClick={() => setView('nuevo')} className="px-5 py-2.5 bg-[#1168F8] text-white rounded-xl text-sm font-bold hover:bg-[#0a4fc4] shadow-sm">+ Nuevo movimiento</button>
          )}
        </div>
      </div>

      {view === 'lista' && (
        <>
          <div className="grid grid-cols-4 gap-3 mb-5">
            {cuentas.slice(0, 4).map((c: any) => (
              <div key={c.id} className="bg-white border border-gray-100 rounded-2xl p-3 shadow-sm">
                <div className="text-[10px] text-gray-400 truncate">{c.nombre}</div>
                <div className="font-mono font-bold text-sm text-gray-900">{c.moneda} {fmt(c.saldo_actual)}</div>
              </div>
            ))}
          </div>
          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
            {loading ? <div className="p-8 text-center text-gray-400">Cargando…</div> :
              movs.length === 0 ? <div className="p-8 text-center text-gray-400 text-sm">Sin movimientos.</div> : (
                <table className="w-full text-xs">
                  <thead><tr className="bg-gray-50 border-b border-gray-100 text-gray-500">
                    <th className="px-4 py-3 text-left font-semibold">Número</th>
                    <th className="px-4 py-3 text-left font-semibold">Fecha</th>
                    <th className="px-4 py-3 text-left font-semibold">Tipo</th>
                    <th className="px-4 py-3 text-left font-semibold">Concepto</th>
                    <th className="px-4 py-3 text-right font-semibold">Monto</th>
                  </tr></thead>
                  <tbody>
                    {movs.map(m => (
                      <tr key={m.id} className="border-b border-gray-50">
                        <td className="px-4 py-3 font-mono font-bold text-[#1168F8]">{m.numero_formateado}</td>
                        <td className="px-4 py-3 text-gray-600">{m.fecha}</td>
                        <td className="px-4 py-3">{m.tipo?.nombre === 'Comprobante de cambio de divisa' ? <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-50 text-amber-700">Cambio divisa</span> : <span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-50 text-blue-700">Transferencia</span>}</td>
                        <td className="px-4 py-3 text-gray-700">{m.concepto || '—'}</td>
                        <td className="px-4 py-3 text-right font-mono font-semibold">{m.moneda} {fmt(m.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
          </div>
        </>
      )}

      {view === 'nuevo' && (
        <FormMovimiento supabase={supabase} currentUser={currentUser} talonarios={talonarios} cuentas={cuentas} tcSnap={tcSnap}
          onSave={async () => { await loadData(); setView('lista') }} onCancel={() => setView('lista')} />
      )}
    </div>
  )
}

function FormMovimiento({ supabase, currentUser, talonarios, cuentas, tcSnap, onSave, onCancel }: any) {
  const [modo, setModo] = useState<'transferencia' | 'cambio'>('transferencia')
  const [form, setForm] = useState<any>({
    fecha: new Date().toISOString().slice(0, 10), cuenta_origen_id: '', cuenta_destino_id: '',
    monto_origen: '', monto_destino: '', tipo_cambio: '', concepto: '', notas: '',
    costo_on: false, costo_modo: 'origen', costo_monto: '',
  })
  const [saving, setSaving] = useState(false)
  const [compFile, setCompFile] = useState<File | null>(null)

  const origen = cuentas.find((c: any) => c.id === form.cuenta_origen_id)
  const destino = cuentas.find((c: any) => c.id === form.cuenta_destino_id)
  const montoOrigen = parseFloat(form.monto_origen) || 0
  const montoDestino = modo === 'cambio' ? (parseFloat(form.monto_destino) || 0) : montoOrigen
  // En cambio, destino calculado si hay TC
  const destinoCalculado = modo === 'cambio' && form.tipo_cambio && montoOrigen ? montoOrigen * (parseFloat(form.tipo_cambio) || 0) : null

  // Costo de conversión (comisión bancaria) opcional
  const costoMonto = parseFloat(form.costo_monto) || 0
  const costoActivo = modo === 'cambio' && form.costo_on && costoMonto > 0
  const costoMoneda = form.costo_modo === 'destino' ? (destino?.moneda || '') : (origen?.moneda || '')
  const costoCLP = costoActivo ? aCLP(costoMonto, costoMoneda, tcSnap) : 0
  // Saldos reales: si la comisión se cobra en origen, sale más; si en destino, entra menos
  const egresoOrigen = montoOrigen + (costoActivo && form.costo_modo === 'origen' ? costoMonto : 0)
  const ingresoDestino = montoDestino - (costoActivo && form.costo_modo === 'destino' ? costoMonto : 0)
  // TC efectivo (con comisión adentro), misma orientación que el TC ingresado: destino / origen
  const tcEfectivo = modo === 'cambio' && egresoOrigen > 0 && ingresoDestino > 0 ? ingresoDestino / egresoOrigen : null

  // Talonario según modo
  const talonarioMov = talonarios.find((t: any) => t.tipo?.nombre === 'Movimiento de fondos')
  const talonarioCambio = talonarios.find((t: any) => t.tipo?.nombre === 'Comprobante de cambio de divisa')
  const talonario = modo === 'cambio' ? talonarioCambio : talonarioMov

  async function guardar() {
    if (!talonario) { alert(`No hay talonario de ${modo === 'cambio' ? 'cambio de divisa' : 'movimiento de fondos'}. Cargá uno en Catálogos › Talonarios.`); return }
    if (!form.cuenta_origen_id || !form.cuenta_destino_id) { alert('Elegí cuenta origen y destino'); return }
    if (form.cuenta_origen_id === form.cuenta_destino_id) { alert('Origen y destino no pueden ser la misma cuenta'); return }
    if (montoOrigen <= 0) { alert('Ingresá el monto'); return }
    if (modo === 'transferencia' && origen?.moneda !== destino?.moneda) { alert('Para transferencia, las cuentas deben tener la misma moneda. Usá "Cambio de divisa" si difieren.'); return }
    if (modo === 'cambio' && montoDestino <= 0) { alert('Ingresá el monto que llega a destino (o el tipo de cambio)'); return }
    setSaving(true)
    try {
      const { data: numData, error: numErr } = await (supabase.rpc as any)('emitir_numero_talonario', { p_talonario: talonario.id })
      if (numErr || !numData?.[0]) { alert('Error al numerar: ' + (numErr?.message || '')); setSaving(false); return }
      const numero = numData[0].numero, formateado = numData[0].formateado
      const monedaO = origen?.moneda, monedaD = destino?.moneda
      const tcAplicado = modo === 'cambio' ? (parseFloat(form.tipo_cambio) || (montoOrigen ? montoDestino / montoOrigen : null)) : null

      // Comprobante cabecera (neutro: es movimiento interno)
      const { data: comp, error: cErr } = await (supabase.from('comprobantes_tesoreria') as any).insert({
        talonario_id: talonario.id, tipo_comprobante_id: talonario.tipo_comprobante_id,
        numero, numero_formateado: formateado, fecha: form.fecha, sentido: 'neutro',
        concepto: form.concepto || (modo === 'cambio' ? 'Cambio de divisa' : 'Transferencia entre cuentas'),
        contexto: 'propia', cuenta_propia_id: form.cuenta_origen_id, moneda: monedaO, monto: montoOrigen,
        monto_usd: aUSD(montoOrigen, monedaO, tcSnap), tc_snapshot: tcSnap || null,
        estado: 'emitido', notas: form.notas || null, creado_por: currentUser?.nombre, creado_por_id: currentUser?.id,
      }).select('id').single()
      if (cErr || !comp) { alert('Error al guardar: ' + (cErr?.message || '')); setSaving(false); return }

      // Registro en flujo_cuentas_pn
      const tipoFlujo = modo === 'cambio' ? 'cambio_divisa'
        : (origen?.pais === destino?.pais ? 'transferencia_interna' : (origen?.pais === 'AR' ? 'transferencia_arg_chile' : 'transferencia_chile_arg'))
      const { data: flujo } = await (supabase.from('flujo_cuentas_pn') as any).insert({
        fecha: form.fecha, tipo: tipoFlujo, descripcion: form.concepto || (modo === 'cambio' ? 'Cambio de divisa' : 'Transferencia interna'),
        cuenta_origen_id: form.cuenta_origen_id, cuenta_origen_tipo: origen?.pais === 'AR' ? 'propia_argentina' : 'propia_chile', cuenta_origen_nombre: origen?.nombre,
        cuenta_destino_id: form.cuenta_destino_id, cuenta_destino_tipo: destino?.pais === 'AR' ? 'propia_argentina' : 'propia_chile', cuenta_destino_nombre: destino?.nombre,
        monto_origen: montoOrigen, moneda_origen: monedaO, monto_destino: montoDestino, moneda_destino: monedaD,
        tipo_cambio_aplicado: tcAplicado, monto_usd_equiv: aUSD(montoOrigen, monedaO, tcSnap),
        costo_conversion: costoActivo ? costoMonto : null,
        costo_conversion_moneda: costoActivo ? costoMoneda : null,
        costo_conversion_modo: costoActivo ? form.costo_modo : null,
        tc_efectivo: costoActivo ? tcEfectivo : null,
        referencia: formateado, talonario_id: talonario.id, numero_comprobante: formateado, tc_snapshot: tcSnap || null,
        created_by: currentUser?.id,
      }).select('id').single()

      // Adjunto
      if (compFile) {
        const ext = compFile.name.split('.').pop()
        const path = `movimientos/${comp.id}.${ext}`
        await supabase.storage.from('comprobantes').upload(path, compFile, { upsert: true })
        await (supabase.from('comprobantes_tesoreria') as any).update({ archivo_url: path, archivo_nombre: compFile.name }).eq('id', comp.id)
        if (flujo) await (supabase.from('flujo_cuentas_pn') as any).update({ archivo_url: path, archivo_nombre: compFile.name }).eq('id', flujo.id)
      }

      // Costo de conversión → se registra como gasto (comisión bancaria) en contabilidad
      if (costoActivo) {
        const catNombre = origen?.pais === 'AR' ? 'Gastos bancarios Argentina' : 'Gastos bancarios Chile'
        const { data: cat } = await (supabase.from('gastos_fijos_categorias') as any).select('id').eq('nombre', catNombre).maybeSingle()
        const [pAnio, pMes] = String(form.fecha).split('-').map(Number)
        await (supabase.from('gastos_fijos_pn') as any).insert({
          categoria_id: cat?.id || null,
          descripcion: `Comisión cambio de divisa ${monedaO}→${monedaD} · ${formateado}`,
          moneda: costoMoneda,
          monto_clp: costoMoneda === 'CLP' ? costoMonto : null,
          monto_usd: costoMoneda === 'USD' ? costoMonto : null,
          monto_ars: costoMoneda === 'ARS' ? costoMonto : null,
          monto_clp_equiv: aCLP(costoMonto, costoMoneda, tcSnap),
          tipo_cambio_ref: aCLP(1, costoMoneda, tcSnap),
          fecha: form.fecha, periodo_anio: pAnio, periodo_mes: pMes,
          es_recurrente: false, comprobante_ref: formateado,
          notas: `Generado automáticamente desde cambio de divisa (${form.costo_modo === 'origen' ? 'descontado de más en ' + monedaO : 'acreditado de menos en ' + monedaD})`,
          tc_snapshot: tcSnap || null, created_by: currentUser?.id,
        })
      }

      // Egreso cuenta origen + ingreso cuenta destino, con saldos (ya considerando la comisión)
      await (supabase.from('movimientos_cuentas_pn') as any).insert({
        cuenta_id: form.cuenta_origen_id, fecha: form.fecha, tipo: 'transferencia_out',
        concepto: `${formateado} · a ${destino?.nombre}`, monto: egresoOrigen, moneda: monedaO,
        referencia: formateado, flujo_id: flujo?.id || null, talonario_id: talonario.id, numero_comprobante: formateado, tc_snapshot: tcSnap || null,
        saldo_posterior: (Number(origen?.saldo_actual) || 0) - egresoOrigen,
      })
      await (supabase.from('cuentas_pn') as any).update({ saldo_actual: (Number(origen?.saldo_actual) || 0) - egresoOrigen }).eq('id', form.cuenta_origen_id)
      await (supabase.from('movimientos_cuentas_pn') as any).insert({
        cuenta_id: form.cuenta_destino_id, fecha: form.fecha, tipo: 'transferencia_in',
        concepto: `${formateado} · de ${origen?.nombre}`, monto: ingresoDestino, moneda: monedaD,
        referencia: formateado, flujo_id: flujo?.id || null, talonario_id: talonario.id, numero_comprobante: formateado, tc_snapshot: tcSnap || null,
        saldo_posterior: (Number(destino?.saldo_actual) || 0) + ingresoDestino,
      })
      await (supabase.from('cuentas_pn') as any).update({ saldo_actual: (Number(destino?.saldo_actual) || 0) + ingresoDestino }).eq('id', form.cuenta_destino_id)

      await onSave()
    } catch (e: any) { alert('Error inesperado: ' + (e?.message || e)); setSaving(false) }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
        <div className="flex gap-2">
          <button onClick={() => setModo('transferencia')} className={`flex-1 px-4 py-2.5 rounded-xl text-xs font-semibold border ${modo === 'transferencia' ? 'bg-[#1168F8] text-white border-[#1168F8]' : 'bg-white text-gray-600 border-gray-200'}`}>↔ Transferencia (misma moneda)</button>
          <button onClick={() => setModo('cambio')} className={`flex-1 px-4 py-2.5 rounded-xl text-xs font-semibold border ${modo === 'cambio' ? 'bg-[#ef9f27] text-white border-[#ef9f27]' : 'bg-white text-gray-600 border-gray-200'}`}>💱 Cambio de divisa</button>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Fecha</label>
            <input type="date" value={form.fecha} onChange={e => setForm((f: any) => ({ ...f, fecha: e.target.value }))} className={inp} /></div>
          <div></div>
          <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Cuenta origen (sale)</label>
            <select value={form.cuenta_origen_id} onChange={e => setForm((f: any) => ({ ...f, cuenta_origen_id: e.target.value }))} className={inp}>
              <option value="">— elegí —</option>
              {cuentas.map((c: any) => <option key={c.id} value={c.id}>{c.nombre} · {c.moneda} ({c.pais}) · {fmt(c.saldo_actual)}</option>)}
            </select>
          </div>
          <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Cuenta destino (entra)</label>
            <select value={form.cuenta_destino_id} onChange={e => setForm((f: any) => ({ ...f, cuenta_destino_id: e.target.value }))} className={inp}>
              <option value="">— elegí —</option>
              {cuentas.map((c: any) => <option key={c.id} value={c.id}>{c.nombre} · {c.moneda} ({c.pais}) · {fmt(c.saldo_actual)}</option>)}
            </select>
          </div>
          <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Monto que sale {origen ? `(${origen.moneda})` : ''}</label>
            <input type="text" inputMode="decimal" value={form.monto_origen} onChange={e => setForm((f: any) => ({ ...f, monto_origen: e.target.value.replace(/\./g, '').replace(',', '.') }))} className={inp + ' text-right font-mono'} placeholder="0" /></div>
          {modo === 'cambio' ? (
            <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Monto que llega {destino ? `(${destino.moneda})` : ''}</label>
              <input type="text" inputMode="decimal" value={form.monto_destino} onChange={e => setForm((f: any) => ({ ...f, monto_destino: e.target.value.replace(/\./g, '').replace(',', '.') }))} className={inp + ' text-right font-mono'} placeholder="0" />
              {destinoCalculado != null && <div className="text-[10px] text-gray-400 mt-1">Con TC {form.tipo_cambio}: {fmt(destinoCalculado)}</div>}
            </div>
          ) : <div></div>}
          {modo === 'cambio' && (
            <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Tipo de cambio del banco (opcional)</label>
              <input type="text" inputMode="decimal" value={form.tipo_cambio} onChange={e => setForm((f: any) => ({ ...f, tipo_cambio: e.target.value.replace(',', '.') }))} className={inp} placeholder="destino / origen" /></div>
          )}
        </div>
      </div>

      {modo === 'cambio' && (
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
          <div>
            <div className="text-[10px] font-semibold text-gray-500 uppercase">TC efectivo (con comisión)</div>
            <div className="text-[10px] text-gray-400">El que termina quedando una vez metida la comisión adentro. Informativo.</div>
          </div>
          <div className="font-mono font-bold text-sm text-gray-900">{tcEfectivo != null ? tcEfectivo.toLocaleString('es-CL', { maximumFractionDigits: 6 }) : '—'}</div>
        </div>

        <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer">
          <input type="checkbox" checked={form.costo_on} onChange={e => setForm((f: any) => ({ ...f, costo_on: e.target.checked }))} />
          Tuvo costo / comisión de cambio
        </label>

        {form.costo_on && (
          <div className="space-y-3 border border-amber-200 bg-amber-50/40 rounded-xl p-3">
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setForm((f: any) => ({ ...f, costo_modo: 'origen' }))}
                className={`px-3 py-2 rounded-xl text-[11px] font-semibold border text-left ${form.costo_modo === 'origen' ? 'border-[#ef9f27] bg-white text-gray-900' : 'border-gray-200 bg-white text-gray-500'}`}>
                Me descontaron de más{origen ? ` en ${origen.moneda}` : ''}
                <div className="text-[10px] font-normal text-gray-400">Sale más de la cuenta origen</div>
              </button>
              <button type="button" onClick={() => setForm((f: any) => ({ ...f, costo_modo: 'destino' }))}
                className={`px-3 py-2 rounded-xl text-[11px] font-semibold border text-left ${form.costo_modo === 'destino' ? 'border-[#ef9f27] bg-white text-gray-900' : 'border-gray-200 bg-white text-gray-500'}`}>
                Me acreditaron de menos{destino ? ` en ${destino.moneda}` : ''}
                <div className="text-[10px] font-normal text-gray-400">Entra menos a la cuenta destino</div>
              </button>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Monto del costo {costoMoneda ? `(${costoMoneda})` : ''}</label>
              <input type="text" inputMode="decimal" value={form.costo_monto} onChange={e => setForm((f: any) => ({ ...f, costo_monto: e.target.value.replace(/\./g, '').replace(',', '.') }))} className={inp + ' text-right font-mono'} placeholder="0" />
            </div>
            <div className="text-[11px] text-[#0a9e6e] bg-[#0a9e6e]/10 rounded-lg px-3 py-2">
              ✓ Se registra como gasto (comisión bancaria{origen ? ` ${origen.pais === 'AR' ? 'Argentina' : 'Chile'}` : ''}) en la contabilidad{costoCLP > 0 ? `, en pesos: ≈ CLP ${fmt(costoCLP)}` : ''}{costoActivo && costoMoneda !== 'CLP' ? ` (convertido de ${fmt(costoMonto)} ${costoMoneda} con el TC del día)` : ''}.
            </div>
          </div>
        )}
      </div>
      )}

      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-3">
          <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Concepto</label>
            <input value={form.concepto} onChange={e => setForm((f: any) => ({ ...f, concepto: e.target.value }))} className={inp} placeholder={modo === 'cambio' ? 'ej. Compra USD para pago exterior' : 'ej. Fondeo caja Jujuy'} /></div>
          <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Comprobante (adjunto)</label>
            <input type="file" onChange={e => setCompFile(e.target.files?.[0] || null)} className="text-xs" /></div>
          <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Notas</label>
            <textarea value={form.notas} onChange={e => setForm((f: any) => ({ ...f, notas: e.target.value }))} className={inp} rows={2} /></div>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-5 py-2.5 border border-gray-200 rounded-xl text-xs font-semibold hover:bg-gray-50">Cancelar</button>
        <button onClick={guardar} disabled={saving} className="px-6 py-2.5 bg-[#1168F8] text-white rounded-xl text-xs font-bold hover:bg-[#0a4fc4] disabled:opacity-50">{saving ? 'Emitiendo…' : 'Emitir comprobante'}</button>
      </div>
    </div>
  )
}
