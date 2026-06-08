'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { fmt } from '@/lib/utils'

interface CCMovimiento {
  id: string
  tercero_id: string
  operacion_id: string | null
  tipo: string
  factura_id: string | null
  fecha: string
  concepto: string
  moneda: string
  monto: number
  tc_referencia: number | null
  monto_usd: number | null
  debe: number
  haber: number
  saldo: number
  comprobante_url: string | null
  notas: string | null
  creado_por: string | null
  created_at: string
  tercero?: { razon_social: string }
}

const TIPO_L: Record<string, string> = {
  factura: 'Factura', pago: 'Pago recibido',
  nota_credito: 'Nota de crédito', nota_debito: 'Nota de débito', ajuste: 'Ajuste',
}
const TIPO_CLS: Record<string, string> = {
  factura: 'bg-blue-50 text-[#1168F8] border-blue-200',
  pago: 'bg-green-50 text-green-700 border-green-200',
  nota_credito: 'bg-amber-50 text-amber-700 border-amber-200',
  nota_debito: 'bg-red-50 text-red-700 border-red-200',
  ajuste: 'bg-gray-100 text-gray-600 border-gray-200',
}

export default function CteClientesPage() {
  const supabase = useMemo(() => createClient(), [])
  const [movimientos, setMovimientos] = useState<CCMovimiento[]>([])
  const [terceros, setTerceros] = useState<any[]>([])
  const [operaciones, setOperaciones] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroTercero, setFiltroTercero] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [form, setForm] = useState({
    tercero_id: '', operacion_id: '', tipo: 'pago', fecha: new Date().toISOString().slice(0, 10),
    concepto: '', moneda: 'CLP', monto: '', tc_referencia: '', notas: '',
  })
  const [saving, setSaving] = useState(false)
  const [uploadingComp, setUploadingComp] = useState(false)
  const [compUrl, setCompUrl] = useState('')

  useEffect(() => { loadUser(); loadData() }, [])

  async function loadUser() {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return
    const { data: u } = await supabase.from('usuarios').select('*').eq('auth_id', auth.user.id).single()
    if (u) setCurrentUser(u)
  }

  async function loadData() {
    setLoading(true)
    const [mRes, tRes, oRes] = await Promise.all([
      supabase.from('cc_clientes').select('*, tercero:terceros(razon_social)').order('fecha', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('terceros').select('id,razon_social').contains('tipo', ['cliente']).order('razon_social'),
      supabase.from('operaciones').select('id,cotizacion:cotizaciones(num,cliente)').limit(50),
    ])
    if (mRes.data) setMovimientos(mRes.data as CCMovimiento[])
    if (tRes.data) setTerceros(tRes.data)
    if (oRes.data) setOperaciones(oRes.data)
    setLoading(false)
  }

  async function subirComprobante(file: File) {
    setUploadingComp(true)
    const ext = file.name.split('.').pop()
    const path = `cc/${Date.now()}.${ext}`
    await supabase.storage.from('facturas').upload(path, file, { upsert: true })
    const { data } = supabase.storage.from('facturas').getPublicUrl(path)
    if (data?.publicUrl) setCompUrl(data.publicUrl)
    setUploadingComp(false)
  }

  async function guardarMovimiento() {
    if (!form.tercero_id || !form.monto) { alert('Completá tercero y monto'); return }
    setSaving(true)
    const monto = parseFloat(String(form.monto).replace(',', '.')) || 0
    const tcRef = parseFloat(String(form.tc_referencia).replace(',', '.')) || null
    const esPago = form.tipo === 'pago' || form.tipo === 'nota_credito'
    await (supabase.from('cc_clientes') as any).insert({
      ...form, monto, tc_referencia: tcRef,
      monto_usd: tcRef ? monto / tcRef : null,
      debe: esPago ? 0 : monto,
      haber: esPago ? monto : 0,
      comprobante_url: compUrl || null,
      creado_por: currentUser?.nombre,
    })
    await loadData()
    setShowModal(false)
    setCompUrl('')
    setSaving(false)
  }

  const filtrados = movimientos.filter(m => !filtroTercero || m.tercero_id === filtroTercero)

  // Calcular saldos por tercero
  const saldosPorTercero = terceros.map(t => {
    const movs = movimientos.filter(m => m.tercero_id === t.id)
    const totalDebe = movs.reduce((s, m) => s + (m.debe || 0), 0)
    const totalHaber = movs.reduce((s, m) => s + (m.haber || 0), 0)
    return { ...t, saldo: totalDebe - totalHaber, debe: totalDebe, haber: totalHaber }
  }).filter(t => t.debe > 0 || t.haber > 0)

  const totalSaldo = saldosPorTercero.reduce((s, t) => s + t.saldo, 0)
  const fmtCLP = (n: number) => Math.round(n).toLocaleString('es-CL')
  const inp = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white'

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Cuenta corriente — Clientes</h1>
          <p className="text-xs text-gray-400 mt-0.5">Movimientos de clientes · Facturas emitidas y pagos recibidos</p>
        </div>
        <button onClick={() => { setForm({ tercero_id: '', operacion_id: '', tipo: 'pago', fecha: new Date().toISOString().slice(0, 10), concepto: '', moneda: 'CLP', monto: '', tc_referencia: '', notas: '' }); setCompUrl(''); setShowModal(true) }}
          className="px-5 py-2.5 bg-[#1168F8] text-white rounded-xl text-sm font-bold hover:bg-[#0a4fc4] shadow-sm">+ Registrar movimiento</button>
      </div>

      {/* Resumen por cliente */}
      {saldosPorTercero.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm mb-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-sm text-gray-900">Saldo por cliente</h3>
            <div className={`text-sm font-black font-mono ${totalSaldo > 0 ? 'text-[#1168F8]' : 'text-green-700'}`}>
              {totalSaldo > 0 ? `A cobrar: $ ${fmtCLP(totalSaldo)}` : `Saldo a favor: $ ${fmtCLP(Math.abs(totalSaldo))}`}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {saldosPorTercero.map(t => (
              <button key={t.id} onClick={() => setFiltroTercero(filtroTercero === t.id ? '' : t.id)}
                className={`text-left p-3 rounded-xl border transition-all ${filtroTercero === t.id ? 'border-[#1168F8] bg-[#EBF2FF]' : 'border-gray-100 hover:bg-gray-50'}`}>
                <div className="font-semibold text-xs text-gray-900 truncate">{t.razon_social}</div>
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-gray-400">Debe: <span className="font-mono text-[#1168F8]">{fmtCLP(t.debe)}</span></span>
                  <span className="text-[10px] text-gray-400">Haber: <span className="font-mono text-green-700">{fmtCLP(t.haber)}</span></span>
                </div>
                <div className={`text-xs font-bold font-mono mt-1 ${t.saldo > 0 ? 'text-[#1168F8]' : 'text-green-700'}`}>
                  Saldo: {fmtCLP(Math.abs(t.saldo))} {t.saldo > 0 ? '(a cobrar)' : '(a favor)'}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-3 mb-4 items-center">
        <select value={filtroTercero} onChange={e => setFiltroTercero(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:border-[#1168F8] shadow-sm flex-1 max-w-xs">
          <option value="">Todos los clientes</option>
          {terceros.map(t => <option key={t.id} value={t.id}>{t.razon_social}</option>)}
        </select>
        {filtroTercero && <button onClick={() => setFiltroTercero('')} className="px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-500">✕ Limpiar</button>}
        <span className="text-xs text-gray-400 ml-auto">{filtrados.length} movimiento(s)</span>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
        {loading ? <div className="p-8 text-center text-gray-400">Cargando...</div> :
        filtrados.length === 0 ? <div className="p-8 text-center text-gray-400 text-sm">Sin movimientos registrados.</div> : (
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Fecha', 'Cliente', 'Tipo', 'Concepto', 'Debe', 'Haber', 'Comprobante', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.map((m, idx) => {
                // Calcular saldo acumulado
                const movsCliente = filtrados.filter(x => x.tercero_id === m.tercero_id).slice(idx)
                return (
                  <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-[11px] text-gray-600">{m.fecha}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900">{(m.tercero as any)?.razon_social || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border ${TIPO_CLS[m.tipo]}`}>{TIPO_L[m.tipo]}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{m.concepto}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-[#1168F8]">
                      {m.debe > 0 ? fmtCLP(m.debe) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-green-700">
                      {m.haber > 0 ? fmtCLP(m.haber) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {m.comprobante_url ? <a href={m.comprobante_url} target="_blank" className="text-[#1168F8] text-[10px] hover:underline">📎 Ver</a> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {m.notas && <span className="text-[10px] text-gray-400" title={m.notas}>💬</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <span className="font-bold text-sm text-gray-900">Registrar movimiento</span>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Cliente</label>
                  <select value={form.tercero_id} onChange={e => setForm(f => ({ ...f, tercero_id: e.target.value }))} className={inp}>
                    <option value="">Seleccionar...</option>
                    {terceros.map(t => <option key={t.id} value={t.id}>{t.razon_social}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Tipo</label>
                  <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))} className={inp}>
                    {Object.entries(TIPO_L).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Fecha</label>
                  <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} className={inp} />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Concepto</label>
                  <input value={form.concepto} onChange={e => setForm(f => ({ ...f, concepto: e.target.value }))} className={inp} placeholder="ej. Pago factura #1234" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Moneda</label>
                  <select value={form.moneda} onChange={e => setForm(f => ({ ...f, moneda: e.target.value }))} className={inp}>
                    {['CLP', 'USD', 'ARS'].map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Monto</label>
                  <input type="text" inputMode="decimal" value={form.monto} onFocus={e => e.target.select()}
                    onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} className={inp + ' font-mono text-right'} placeholder="0" />
                </div>
                {form.moneda !== 'CLP' && (
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">TC referencia</label>
                    <input value={form.tc_referencia} onChange={e => setForm(f => ({ ...f, tc_referencia: e.target.value }))} className={inp} placeholder="ej. 950" />
                  </div>
                )}
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Operación</label>
                  <select value={form.operacion_id} onChange={e => setForm(f => ({ ...f, operacion_id: e.target.value }))} className={inp}>
                    <option value="">Sin vincular</option>
                    {operaciones.map((o: any) => <option key={o.id} value={o.id}>{o.cotizacion?.num}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Comprobante</label>
                  {compUrl ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-600">📎 Adjuntado</span>
                      <button onClick={() => setCompUrl('')} className="text-xs text-red-500">✕</button>
                    </div>
                  ) : (
                    <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-gray-200 rounded-xl text-xs text-gray-500 hover:bg-gray-50 cursor-pointer w-fit">
                      📎 {uploadingComp ? 'Subiendo...' : 'Adjuntar comprobante'}
                      <input type="file" accept=".pdf,.jpg,.png" className="hidden" disabled={uploadingComp}
                        onChange={e => { const f = e.target.files?.[0]; if (f) subirComprobante(f) }} />
                    </label>
                  )}
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Notas</label>
                  <input value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} className={inp} placeholder="Observaciones opcionales..." />
                </div>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-between">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-gray-200 rounded-xl text-xs hover:bg-gray-50">Cancelar</button>
              <button onClick={guardarMovimiento} disabled={saving} className="px-5 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold disabled:opacity-50">
                {saving ? 'Guardando...' : '✓ Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
