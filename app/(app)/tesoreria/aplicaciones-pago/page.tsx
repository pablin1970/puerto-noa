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

export default function AplicacionesPagoTerceroPage() {
  const supabase = createClient()
  const [permisos, setPermisos] = useState<Record<string, string[]>>({})
  const [permListos, setPermListos] = useState(false)
  const [view, setView] = useState<'lista' | 'nuevo' | 'detalle'>('lista')
  const [apts, setApts] = useState<any[]>([])
  const [talonarios, setTalonarios] = useState<any[]>([])
  const [operaciones, setOperaciones] = useState<any[]>([])
  const [tcSnap, setTcSnap] = useState<any>(null)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [sel, setSel] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadUser(); loadData(); cargarPermisos().then(p => { setPermisos(p); setPermListos(true) }) }, [])

  async function loadUser() {
    const { data: auth } = await supabase.auth.getUser()
    if (auth.user) { const { data: u } = await supabase.from('usuarios').select('*').eq('auth_id', auth.user.id).single(); setCurrentUser(u) }
  }

  async function loadData() {
    setLoading(true)
    const [rRes, talRes, oRes, tceRes] = await Promise.all([
      (supabase.from('comprobantes_tesoreria') as any)
        .select('*, tercero:terceros(razon_social), tipo:tipos_comprobante(nombre)')
        .order('fecha', { ascending: false }).order('created_at', { ascending: false }),
      (supabase.from('talonarios') as any).select('*, tipo:tipos_comprobante(nombre)').eq('activo', true).order('orden'),
      supabase.from('operaciones').select('id,tercero_id,cotizacion:cotizaciones(num,cliente)').order('created_at', { ascending: false }).limit(60),
      (supabase.from('tipos_cambio_eventos') as any).select('fecha,fuente,ars,clp,cny').order('created_at', { ascending: false }).limit(1),
    ])
    setApts((rRes.data || []).filter((c: any) => c.tipo?.nombre === 'Aplicación de pago de tercero'))
    setTalonarios((talRes.data || []).filter((t: any) => t.tipo?.nombre === 'Aplicación de pago de tercero' && !t.fiscal))
    if (oRes.data) setOperaciones(oRes.data)
    if (tceRes.data?.[0]) {
      const t: any = tceRes.data[0]
      setTcSnap({ fecha: t.fecha, fuente: t.fuente || null, USD: 1, ARS: Number(t.ars) || null, CLP: Number(t.clp) || null, CNY: Number(t.cny) || null })
    }
    setLoading(false)
  }

  if (permListos && !puede(permisos, 'aplicaciones_pago', 'ver')) {
    return (<div className="p-6 bg-gray-50 min-h-screen flex items-center justify-center"><div className="text-center max-w-sm"><div className="text-5xl mb-3">🔒</div><h2 className="text-lg font-bold text-gray-700">Sin acceso</h2><p className="text-sm text-gray-400 mt-1">No tenés permiso para ver aplicaciones de pago.</p></div></div>)
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Aplicación de pago de tercero</h1>
          <p className="text-xs text-gray-400 mt-0.5">El cliente pagó directo al proveedor · marca la factura saldada sin mover tus cuentas</p>
        </div>
        <div className="flex gap-2">
          {view !== 'lista' && <button onClick={() => { setView('lista'); setSel(null) }} className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold hover:bg-gray-100">← Volver</button>}
          {view === 'lista' && puede(permisos, 'aplicaciones_pago', 'crear') && (
            <button onClick={() => setView('nuevo')} className="px-5 py-2.5 bg-[#1168F8] text-white rounded-xl text-sm font-bold hover:bg-[#0a4fc4] shadow-sm">+ Nueva aplicación</button>
          )}
        </div>
      </div>

      {view === 'lista' && (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
          {loading ? <div className="p-8 text-center text-gray-400">Cargando…</div> :
            apts.length === 0 ? <div className="p-8 text-center text-gray-400 text-sm">Sin aplicaciones registradas.</div> : (
              <table className="w-full text-xs">
                <thead><tr className="bg-gray-50 border-b border-gray-100 text-gray-500">
                  <th className="px-4 py-3 text-left font-semibold">Número</th>
                  <th className="px-4 py-3 text-left font-semibold">Fecha</th>
                  <th className="px-4 py-3 text-left font-semibold">Cliente</th>
                  <th className="px-4 py-3 text-right font-semibold">Monto aplicado</th>
                </tr></thead>
                <tbody>
                  {apts.map(r => (
                    <tr key={r.id} onClick={() => { setSel(r); setView('detalle') }} className="border-b border-gray-50 hover:bg-[#F7FAFF] cursor-pointer">
                      <td className="px-4 py-3 font-mono font-bold text-[#1168F8]">{r.numero_formateado}</td>
                      <td className="px-4 py-3 text-gray-600">{r.fecha}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{r.tercero?.razon_social || '—'}</td>
                      <td className="px-4 py-3 text-right font-mono font-semibold">{r.moneda} {fmt(r.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      )}

      {view === 'nuevo' && (
        <FormAPT supabase={supabase} currentUser={currentUser} talonarios={talonarios} operaciones={operaciones} tcSnap={tcSnap}
          onSave={async () => { await loadData(); setView('lista') }} onCancel={() => setView('lista')} />
      )}

      {view === 'detalle' && sel && <DetalleAPT apt={sel} supabase={supabase} />}
    </div>
  )
}

function FormAPT({ supabase, currentUser, talonarios, operaciones, tcSnap, onSave, onCancel }: any) {
  const [form, setForm] = useState<any>({
    talonario_id: talonarios?.[0]?.id || '', operacion_id: '',
    fecha: new Date().toISOString().slice(0, 10), concepto: '', notas: '',
  })
  const [facturas, setFacturas] = useState<any[]>([])
  const [sel, setSel] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [compFile, setCompFile] = useState<File | null>(null)

  const operacion = operaciones.find((o: any) => o.id === form.operacion_id)

  useEffect(() => {
    if (!form.operacion_id) { setFacturas([]); setSel({}); return }
    let cancel = false
    ;(async () => {
      const { data: fs } = await (supabase.from('facturas_recibidas') as any)
        .select('id,folio,fecha_emision,moneda,total,estado,estado_pago,proveedor_razon_social,via_pago, minuta_facturas(minuta:minutas(id,numero_formateado))')
        .eq('operacion_id', form.operacion_id).eq('facturada_a', 'cliente').not('estado', 'in', '("anulada")').neq('estado_pago', 'pagada')
      if (cancel) return
      setFacturas((fs || []).map((f: any) => ({ ...f, minuta: f.minuta_facturas?.[0]?.minuta || null })))
    })()
    return () => { cancel = true }
  }, [form.operacion_id])

  const seleccionadas = facturas.filter((f: any) => sel[f.id])
  const totalAplicado = seleccionadas.reduce((s: number, f: any) => s + (Number(f.total) || 0), 0)
  const monedaAplicada = seleccionadas[0]?.moneda || 'CLP'
  const monedaMixta = seleccionadas.some((f: any) => f.moneda !== monedaAplicada)
  const totalUsd = aUSD(totalAplicado, monedaAplicada, tcSnap)

  async function guardar() {
    if (!form.talonario_id) { alert('No hay talonario de aplicaciones. Cargá uno en Catálogos › Talonarios.'); return }
    if (!form.operacion_id) { alert('Elegí la operación'); return }
    if (seleccionadas.length === 0) { alert('Marcá al menos una factura que pagó el cliente'); return }
    if (monedaMixta) { alert('Las facturas seleccionadas tienen monedas distintas. Aplicá una sola moneda por vez.'); return }
    setSaving(true)
    try {
      const { data: numData, error: numErr } = await (supabase.rpc as any)('emitir_numero_talonario', { p_talonario: form.talonario_id })
      if (numErr || !numData?.[0]) { alert('Error al numerar: ' + (numErr?.message || '')); setSaving(false); return }
      const numero = numData[0].numero, formateado = numData[0].formateado

      const { data: comp, error: cErr } = await (supabase.from('comprobantes_tesoreria') as any).insert({
        talonario_id: form.talonario_id, tipo_comprobante_id: talonarios.find((t: any) => t.id === form.talonario_id)?.tipo_comprobante_id,
        numero, numero_formateado: formateado, fecha: form.fecha, sentido: 'neutro',
        tercero_id: operacion?.tercero_id || null, operacion_id: form.operacion_id,
        concepto: form.concepto || 'Pago directo del cliente al proveedor', contexto: 'rendir',
        moneda: monedaAplicada, monto: totalAplicado, monto_usd: aUSD(totalAplicado, monedaAplicada, tcSnap),
        tc_snapshot: tcSnap || null, imputa_facturas: true, a_cuenta: false,
        estado: 'emitido', creado_por: currentUser?.nombre, creado_por_id: currentUser?.id,
      }).select('id').single()
      if (cErr || !comp) { alert('Error al guardar: ' + (cErr?.message || '')); setSaving(false); return }

      if (compFile) {
        const ext = compFile.name.split('.').pop()
        const path = `aplicaciones-pago/${comp.id}.${ext}`
        await supabase.storage.from('comprobantes').upload(path, compFile, { upsert: true })
        await (supabase.from('comprobantes_tesoreria') as any).update({ archivo_url: path, archivo_nombre: compFile.name }).eq('id', comp.id)
      }

      // Marcar cada factura como pagada por tercero (sin tocar cuentas)
      for (const f of seleccionadas) {
        await (supabase.from('comprobantes_tesoreria_imputaciones') as any).insert({
          comprobante_id: comp.id, factura_recibida_id: f.id, monto: Number(f.total) || 0, monto_usd: aUSD(Number(f.total) || 0, f.moneda, tcSnap),
          minuta_id: f.minuta?.id || null,
        })
        await (supabase.from('facturas_recibidas') as any).update({ estado: 'pagada', estado_pago: 'pagada', fecha_pago: form.fecha }).eq('id', f.id)
      }
      await onSave()
    } catch (e: any) { alert('Error inesperado: ' + (e?.message || e)); setSaving(false) }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-[11px] text-amber-800">
        Esta operación <b>no mueve ninguna cuenta</b> de Puerto NOA. Solo deja constancia de que el cliente pagó directamente al proveedor y marca las facturas de la operación como saldadas. Adjuntá el recibo del proveedor como respaldo.
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Operación</label>
            <select value={form.operacion_id} onChange={e => setForm((f: any) => ({ ...f, operacion_id: e.target.value }))} className={inp}>
              <option value="">— elegí la operación —</option>
              {operaciones.map((o: any) => <option key={o.id} value={o.id}>{o.cotizacion?.num} · {o.cotizacion?.cliente}</option>)}
            </select>
          </div>
          <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Talonario</label>
            <select value={form.talonario_id} onChange={e => setForm((f: any) => ({ ...f, talonario_id: e.target.value }))} className={inp}>
              {talonarios.length === 0 && <option value="">— sin talonario —</option>}
              {talonarios.map((t: any) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </div>
          <div><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Fecha</label>
            <input type="date" value={form.fecha} onChange={e => setForm((f: any) => ({ ...f, fecha: e.target.value }))} className={inp} /></div>
        </div>
      </div>

      {form.operacion_id && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <h3 className="font-bold text-sm text-gray-900 mb-3">Facturas pagadas por el cliente</h3>
          {facturas.length === 0 ? (
            <div className="text-center py-6 text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl">No hay facturas pendientes en esta operación.</div>
          ) : (
            <div className="space-y-2">
              {facturas.map((f: any) => (
                <label key={f.id} className={`flex items-center gap-3 border rounded-xl p-2.5 cursor-pointer ${sel[f.id] ? 'border-[#1168F8] bg-[#F7FAFF]' : 'border-gray-200'}`}>
                  <input type="checkbox" checked={!!sel[f.id]} onChange={e => setSel(prev => ({ ...prev, [f.id]: e.target.checked }))} />
                  <div className="flex-1">
                    <div className="text-xs font-semibold">{f.folio ? `Folio ${f.folio}` : '(s/folio)'} <span className="text-gray-400">· {f.proveedor_razon_social}</span></div>
                    <div className="text-[10px] text-gray-400">{f.fecha_emision} · {f.minuta ? <span className="text-[#7C3AED] font-semibold">📄 Minuta {f.minuta.numero_formateado}</span> : (f.estado_pago === 'minuta_emitida' ? 'minuta emitida' : 'impaga')}</div>
                  </div>
                  <div className="font-mono font-semibold text-xs">{f.moneda} {fmt(f.total)}</div>
                </label>
              ))}
            </div>
          )}
          {seleccionadas.length > 0 && (
            <div className="mt-3 text-right">
              <div className="text-xs text-gray-500">Total aplicado: <span className="font-mono font-bold text-gray-900">{monedaAplicada} {fmt(totalAplicado)}</span>{!monedaMixta && monedaAplicada !== 'USD' && <span className="text-gray-400"> · ≈ USD {fmt(totalUsd)}</span>}</div>
              {monedaMixta && <div className="text-[11px] text-[#E11D48] mt-1">⚠ Hay facturas en monedas distintas. Aplicá una sola moneda por vez.</div>}
            </div>
          )}
        </div>
      )}

      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Concepto</label>
            <input value={form.concepto} onChange={e => setForm((f: any) => ({ ...f, concepto: e.target.value }))} className={inp} placeholder="ej. Cliente pagó flete directo a naviera" /></div>
          <div className="col-span-2"><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Recibo del proveedor (adjunto)</label>
            <input type="file" onChange={e => setCompFile(e.target.files?.[0] || null)} className="text-xs" /></div>
          <div className="col-span-2"><label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Notas</label>
            <textarea value={form.notas} onChange={e => setForm((f: any) => ({ ...f, notas: e.target.value }))} className={inp} rows={2} /></div>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-5 py-2.5 border border-gray-200 rounded-xl text-xs font-semibold hover:bg-gray-50">Cancelar</button>
        <button onClick={guardar} disabled={saving} className="px-6 py-2.5 bg-[#1168F8] text-white rounded-xl text-xs font-bold hover:bg-[#0a4fc4] disabled:opacity-50">{saving ? 'Registrando…' : 'Registrar aplicación'}</button>
      </div>
    </div>
  )
}

function DetalleAPT({ apt, supabase }: any) {
  const [imps, setImps] = useState<any[]>([])
  const [abriendo, setAbriendo] = useState(false)
  useEffect(() => {
    (async () => {
      const { data } = await (supabase.from('comprobantes_tesoreria_imputaciones') as any)
        .select('*, factura:facturas_recibidas(folio,proveedor_razon_social,total), minuta:minutas(numero_formateado)').eq('comprobante_id', apt.id)
      setImps(data || [])
    })()
  }, [apt.id])
  async function abrir() {
    if (!apt.archivo_url) return
    setAbriendo(true)
    const { data } = await supabase.storage.from('comprobantes').createSignedUrl(apt.archivo_url, 120)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
    setAbriendo(false)
  }
  return (
    <div className="max-w-2xl space-y-4">
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
        <div className="border-b border-gray-100 pb-4 mb-4">
          <div className="text-[11px] font-bold text-[#1168F8]/60 uppercase tracking-widest">Aplicación de pago de tercero</div>
          <div className="text-2xl font-bold font-mono text-gray-900">{apt.numero_formateado}</div>
          <div className="text-xs text-gray-400 mt-1">{apt.fecha}</div>
        </div>
        <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-xs">
          <div><div className="text-[10px] text-gray-400 uppercase">Cliente</div><div className="font-semibold text-gray-900">{apt.tercero?.razon_social || '—'}</div></div>
          <div><div className="text-[10px] text-gray-400 uppercase">Monto aplicado</div><div className="font-mono font-bold text-lg text-gray-900">{apt.moneda} {fmt(apt.monto)}</div></div>
          <div className="col-span-2"><div className="text-[10px] text-gray-400 uppercase">Concepto</div><div className="text-gray-700">{apt.concepto || '—'}</div></div>
        </div>
        {apt.archivo_url && <button onClick={abrir} disabled={abriendo} className="mt-4 px-3 py-1.5 bg-[#EBF2FF] text-[#1168F8] rounded-lg text-xs font-medium hover:bg-[#93B8FC] disabled:opacity-50">📄 Ver recibo del proveedor</button>}
      </div>
      {imps.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <h3 className="font-bold text-sm text-gray-900 mb-3">Facturas saldadas</h3>
          <div className="space-y-1.5">
            {imps.map((i: any) => (
              <div key={i.id} className="flex justify-between text-xs border-b border-gray-50 pb-1.5">
                <span className="text-gray-700">{i.factura?.folio ? `Folio ${i.factura.folio}` : 'factura'} <span className="text-gray-400">· {i.factura?.proveedor_razon_social}</span>{i.minuta ? <span className="text-[#7C3AED] font-medium"> · 📄 Minuta {i.minuta.numero_formateado}</span> : ''}</span>
                <span className="font-mono font-semibold">{fmt(i.monto)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
