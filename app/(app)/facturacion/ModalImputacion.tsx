'use client'
import { useEffect, useMemo, useState } from 'react'

const fmtN = (n: number) => Math.round(n || 0).toLocaleString('es-CL')

function aUSD(monto: number, moneda: string, snap: any): number {
  if (!snap) return (moneda || '').toUpperCase() === 'USD' ? monto : 0
  const m = (moneda || 'CLP').toUpperCase()
  if (m === 'USD') return monto
  const tasa = Number(snap[m]) || 0
  return tasa > 0 ? monto / tasa : 0
}

/**
 * Imputa el saldo "a cuenta" de un tercero (pagos no asignados) contra sus facturas pendientes.
 * No mueve dinero ni crea asientos de cuenta corriente: el dinero ya se movió cuando se emitió
 * el recibo / la orden de pago. Sólo asigna ese crédito a facturas concretas (FIFO sobre los
 * comprobantes con crédito) y marca las facturas como pagadas cuando se cubren.
 *
 * lado='cliente'   → crédito = recibos (sentido ingreso) · facturas = facturas_emitidas
 * lado='proveedor' → crédito = órdenes de pago (sentido egreso) · facturas = facturas_recibidas
 */
export default function ModalImputacion({ supabase, lado, tercero, onClose, onDone }: any) {
  const esCliente = lado === 'cliente'
  const sentido = esCliente ? 'ingreso' : 'egreso'
  const facturaTabla = esCliente ? 'facturas_emitidas' : 'facturas_recibidas'
  const facturaCol = esCliente ? 'factura_emitida_id' : 'factura_recibida_id'

  const [loading, setLoading] = useState(true)
  const [comprobantes, setComprobantes] = useState<any[]>([])   // con credito calculado
  const [facturas, setFacturas] = useState<any[]>([])           // con saldo calculado
  const [asign, setAsign] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => { cargar() }, [tercero?.id])

  async function cargar() {
    setLoading(true)
    // 1) Comprobantes con posible crédito a cuenta
    const { data: comps } = await (supabase.from('comprobantes_tesoreria') as any)
      .select('id,numero_formateado,fecha,monto,moneda,tc_snapshot,a_cuenta')
      .eq('tercero_id', tercero.id).eq('sentido', sentido).eq('contexto', 'propia').eq('estado', 'emitido')
      .order('fecha', { ascending: true })
    const compIds = (comps || []).map((c: any) => c.id)

    // 2) Facturas pendientes del tercero
    let fq = (supabase.from(facturaTabla) as any).eq('tercero_id', tercero.id)
    if (esCliente) {
      fq = fq.select('id,folio,fecha_emision,moneda,total,total_usd,estado').not('estado', 'in', '("pagada","anulada","borrador")')
    } else {
      fq = fq.select('id,folio,fecha_emision,moneda,total,estado,estado_pago,facturada_a').eq('facturada_a', 'puerto_noa').not('estado', 'in', '("anulada")').neq('estado_pago', 'pagada')
    }
    const { data: facts } = await fq
    const factIds = (facts || []).map((f: any) => f.id)

    // 3) Imputaciones existentes (para descontar crédito ya usado y saldo de factura)
    let imps: any[] = []
    if (compIds.length || factIds.length) {
      const orParts: string[] = []
      if (compIds.length) orParts.push(`comprobante_id.in.(${compIds.join(',')})`)
      if (factIds.length) orParts.push(`${facturaCol}.in.(${factIds.join(',')})`)
      const { data: ii } = await (supabase.from('comprobantes_tesoreria_imputaciones') as any)
        .select(`id,comprobante_id,${facturaCol},monto`).or(orParts.join(','))
      imps = ii || []
    }

    const compsCredito = (comps || []).map((c: any) => {
      const usado = imps.filter(x => x.comprobante_id === c.id).reduce((s, x) => s + (Number(x.monto) || 0), 0)
      return { ...c, credito: (Number(c.monto) || 0) - usado }
    }).filter((c: any) => c.credito > 0.5)

    const factSaldo = (facts || []).map((f: any) => {
      const cubierto = imps.filter(x => x[facturaCol] === f.id).reduce((s, x) => s + (Number(x.monto) || 0), 0)
      return { ...f, saldo: (Number(f.total) || 0) - cubierto }
    }).filter((f: any) => f.saldo > 0.5)

    setComprobantes(compsCredito)
    setFacturas(factSaldo)
    setLoading(false)
  }

  const creditoTotal = useMemo(() => comprobantes.reduce((s, c) => s + (c.credito || 0), 0), [comprobantes])
  const totalAsignado = useMemo(() => Object.values(asign).reduce((s: number, v: any) => s + (Number(v) || 0), 0), [asign])
  const restante = creditoTotal - totalAsignado

  function setA(fid: string, val: number, maxFactura: number) {
    const otros = Object.entries(asign).filter(([k]) => k !== fid).reduce((s, [, v]) => s + (Number(v) || 0), 0)
    const maxPorCredito = creditoTotal - otros
    setAsign(prev => ({ ...prev, [fid]: Math.max(0, Math.min(val, maxFactura, maxPorCredito)) }))
  }

  async function confirmar() {
    if (totalAsignado <= 0) { alert('Asigná al menos un monto a una factura'); return }
    if (totalAsignado > creditoTotal + 0.5) { alert('Estás asignando más que el crédito disponible'); return }
    setSaving(true)
    try {
      // Pool FIFO de crédito por comprobante
      const pool = comprobantes.map(c => ({ ...c, restante: c.credito }))
      for (const f of facturas) {
        let aplicar = Number(asign[f.id]) || 0
        if (aplicar <= 0) continue
        for (const c of pool) {
          if (aplicar <= 0) break
          if (c.restante <= 0) continue
          const porcion = Math.min(aplicar, c.restante)
          await (supabase.from('comprobantes_tesoreria_imputaciones') as any).insert({
            comprobante_id: c.id, [facturaCol]: f.id, monto: porcion, monto_usd: aUSD(porcion, f.moneda || c.moneda, c.tc_snapshot),
          })
          c.restante -= porcion
          aplicar -= porcion
        }
        // ¿quedó cubierta la factura?
        const aplicadoFactura = Number(asign[f.id]) || 0
        if (aplicadoFactura >= (Number(f.saldo) || 0) - 0.5) {
          const upd: any = { estado: 'pagada', fecha_pago: new Date().toISOString().slice(0, 10) }
          if (!esCliente) upd.estado_pago = 'pagada'
          await (supabase.from(facturaTabla) as any).update(upd).eq('id', f.id)
        }
      }
      await onDone?.()
      onClose()
    } catch (e: any) { alert('Error al imputar: ' + (e?.message || e)); setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <div>
            <div className="font-bold text-sm text-gray-900">Imputar saldo a cuenta</div>
            <div className="text-[11px] text-gray-400">{tercero?.razon_social}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-[#EBF2FF] border border-[#93B8FC]/40 rounded-xl px-4 py-3 flex items-center justify-between">
            <span className="text-[11px] text-[#052698]">Crédito a cuenta disponible</span>
            <span className="font-mono font-bold text-[#1168F8]">{fmtN(creditoTotal)}</span>
          </div>

          {loading ? <div className="text-center py-8 text-gray-400 text-sm">Cargando…</div> : (
            <>
              {creditoTotal <= 0.5 ? (
                <div className="text-center py-6 text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl">
                  Este {esCliente ? 'cliente' : 'proveedor'} no tiene saldo a cuenta sin imputar. El crédito se genera cuando un {esCliente ? 'recibo' : 'pago'} queda "a cuenta".
                </div>
              ) : facturas.length === 0 ? (
                <div className="text-center py-6 text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl">
                  No hay facturas pendientes para imputar.
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-[10px] font-semibold text-gray-500 uppercase">Facturas pendientes</div>
                  {facturas.map((f: any) => (
                    <div key={f.id} className="flex items-center gap-3 border border-gray-200 rounded-xl p-2.5">
                      <div className="flex-1">
                        <div className="text-xs font-semibold">{f.folio ? `Folio ${f.folio}` : '(s/folio)'}</div>
                        <div className="text-[10px] text-gray-400">{f.fecha_emision} · {f.moneda} · saldo {fmtN(f.saldo)}</div>
                      </div>
                      <button onClick={() => setA(f.id, f.saldo, f.saldo)} className="text-[10px] text-[#1168F8] hover:underline">aplicar saldo</button>
                      <input type="text" inputMode="decimal" value={asign[f.id] || ''}
                        onChange={e => setA(f.id, parseFloat(e.target.value.replace(/\./g, '').replace(',', '.')) || 0, f.saldo)}
                        className="w-28 px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-right font-mono focus:outline-none focus:border-[#1168F8]" placeholder="0" />
                    </div>
                  ))}
                  <div className="flex justify-end gap-6 text-xs pt-1">
                    <span className="text-gray-500">Asignado: <span className="font-mono font-bold text-gray-800">{fmtN(totalAsignado)}</span></span>
                    <span className="text-gray-500">Resto crédito: <span className={`font-mono font-bold ${restante < -0.5 ? 'text-red-600' : 'text-[#7C3AED]'}`}>{fmtN(restante)}</span></span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-5 py-2 border border-gray-200 rounded-xl text-xs font-semibold hover:bg-gray-50">Cancelar</button>
          <button onClick={confirmar} disabled={saving || totalAsignado <= 0} className="px-6 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold hover:bg-[#0a4fc4] disabled:opacity-50">{saving ? 'Imputando…' : 'Imputar'}</button>
        </div>
      </div>
    </div>
  )
}
