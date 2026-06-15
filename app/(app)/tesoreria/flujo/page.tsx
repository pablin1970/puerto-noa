'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'

const inp = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white'
const fmtN = (n: number) => (n||0).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const parseN = (v: string) => { const n = parseFloat(String(v).replace(',','.').replace(/[^0-9.-]/g,'')); return isNaN(n)?0:n }
const TIPOS = {
  transferencia_arg_chile: 'Argentina → Chile',
  transferencia_chile_arg: 'Chile → Argentina',
  ingreso_externo: 'Ingreso externo',
  egreso_externo: 'Egreso externo',
  ajuste: 'Ajuste de saldo',
}

export default function FlujoCuentasPage() {
  const supabase = useMemo(() => createClient(), [])
  const [movimientos, setMovimientos] = useState<any[]>([])
  const [cuentasPn, setCuentasPn] = useState<any[]>([])
  const [cuentasCustodia, setCuentasCustodia] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tc, setTc] = useState<{usd:number,ars:number}>({usd:908,ars:1450})
  const [form, setForm] = useState({
    tipo: 'transferencia_arg_chile',
    descripcion: '',
    cuenta_origen_id: '',
    cuenta_origen_tipo: 'propia_argentina' as string,
    cuenta_origen_nombre: '',
    cuenta_destino_id: '',
    cuenta_destino_tipo: 'propia_chile' as string,
    cuenta_destino_nombre: '',
    monto_origen: '',
    moneda_origen: 'ARS',
    monto_destino: '',
    moneda_destino: 'CLP',
    referencia: '',
    notas: '',
  })

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [mRes, cpRes, ccRes, tcRes] = await Promise.all([
      (supabase.from('flujo_cuentas_pn') as any).select('*').order('fecha', { ascending: false }).limit(100),
      (supabase.from('cuentas_pn') as any).select('*').eq('activo', true).order('nombre'),
      (supabase.from('fondos_custodia') as any).select('id,nombre,tipo,pais,moneda,saldo').order('nombre'),
      (supabase.from('tipos_cambio_eventos') as any).select('clp,ars').order('created_at', { ascending: false }).limit(1),
    ])
    if (mRes.data) setMovimientos(mRes.data)
    if (cpRes.data) setCuentasPn(cpRes.data)
    if (ccRes.data) setCuentasCustodia(ccRes.data)
    if (tcRes.data?.[0]) setTc({ usd: tcRes.data[0].clp||908, ars: tcRes.data[0].ars||1450 })
    setLoading(false)
  }

  function calcTCaplicado() {
    const mo = form.moneda_origen
    const md = form.moneda_destino
    if (mo === md) return 1
    if (mo === 'ARS' && md === 'CLP') return tc.usd / tc.ars
    if (mo === 'CLP' && md === 'ARS') return tc.ars / tc.usd
    if (mo === 'USD' && md === 'CLP') return tc.usd
    if (mo === 'CLP' && md === 'USD') return 1 / tc.usd
    if (mo === 'USD' && md === 'ARS') return tc.ars
    if (mo === 'ARS' && md === 'USD') return 1 / tc.ars
    return 1
  }

  function calcMontoDestino() {
    const monto = parseN(form.monto_origen)
    return monto * calcTCaplicado()
  }

  async function handleSave() {
    if (!form.descripcion || !form.monto_origen) { alert('Completá descripción y monto'); return }
    setSaving(true)
    const montoOrigen = parseN(form.monto_origen)
    const montoDestino = form.monto_destino ? parseN(form.monto_destino) : calcMontoDestino()
    const tcApl = calcTCaplicado()
    const montoUsd = form.moneda_origen === 'USD' ? montoOrigen :
      form.moneda_origen === 'CLP' ? montoOrigen / tc.usd :
      montoOrigen / tc.ars

    await (supabase.from('flujo_cuentas_pn') as any).insert({
      fecha: new Date().toISOString().slice(0,10),
      tipo: form.tipo,
      descripcion: form.descripcion,
      cuenta_origen_id: form.cuenta_origen_id || null,
      cuenta_origen_tipo: form.cuenta_origen_tipo,
      cuenta_origen_nombre: form.cuenta_origen_nombre || (cuentasPn.find(c=>c.id===form.cuenta_origen_id)?.nombre) || null,
      cuenta_destino_id: form.cuenta_destino_id || null,
      cuenta_destino_tipo: form.cuenta_destino_tipo,
      cuenta_destino_nombre: form.cuenta_destino_nombre || (cuentasPn.find(c=>c.id===form.cuenta_destino_id)?.nombre) || null,
      monto_origen: montoOrigen,
      moneda_origen: form.moneda_origen,
      monto_destino: montoDestino,
      moneda_destino: form.moneda_destino,
      tipo_cambio_aplicado: tcApl !== 1 ? tcApl : null,
      monto_usd_equiv: montoUsd,
      referencia: form.referencia || null,
      notas: form.notas || null,
    })
    setForm({ tipo:'transferencia_arg_chile', descripcion:'', cuenta_origen_id:'', cuenta_origen_tipo:'propia_argentina', cuenta_origen_nombre:'', cuenta_destino_id:'', cuenta_destino_tipo:'propia_chile', cuenta_destino_nombre:'', monto_origen:'', moneda_origen:'ARS', monto_destino:'', moneda_destino:'CLP', referencia:'', notas:'' })
    setShowForm(false)
    await loadAll()
    setSaving(false)
  }

  // Saldos por país
  const saldosArg = cuentasPn.filter(c => c.pais === 'AR')
  const saldosChile = cuentasPn.filter(c => c.pais === 'CL')
  const custodiaArg = cuentasCustodia.filter(c => c.pais === 'AR')
  const custodiaChile = cuentasCustodia.filter(c => c.pais === 'CL' || !c.pais)

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Flujo de cuentas</h1>
          <p className="text-xs text-gray-400 mt-0.5">Movimientos entre cuentas Argentina ↔ Chile</p>
        </div>
        <button onClick={() => setShowForm(true)} className="px-5 py-2.5 bg-[#1168F8] text-white rounded-xl text-sm font-bold hover:bg-[#0a4fc4] shadow-sm">+ Registrar movimiento</button>
      </div>

      {/* Panel de saldos */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Chile */}
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">🇨🇱</span>
            <h3 className="font-bold text-sm text-gray-900">Cuentas Chile</h3>
          </div>
          <div className="space-y-2">
            {saldosChile.map(c => (
              <div key={c.id} className="flex justify-between items-center py-1.5 border-b border-gray-50">
                <span className="text-xs text-gray-600">{c.nombre}</span>
                <span className="font-mono text-xs font-bold text-gray-900">{c.moneda} {fmtN(c.saldo_actual||0)}</span>
              </div>
            ))}
            {custodiaChile.slice(0,3).map(c => (
              <div key={c.id} className="flex justify-between items-center py-1.5 border-b border-gray-50">
                <div><span className="text-xs text-gray-600">{c.nombre}</span><span className="ml-1 text-[9px] text-blue-500">custodia</span></div>
                <span className="font-mono text-xs font-bold text-blue-700">{c.moneda} {fmtN(c.saldo||0)}</span>
              </div>
            ))}
            {saldosChile.length === 0 && custodiaChile.length === 0 && (
              <div className="text-xs text-gray-400">Sin cuentas registradas</div>
            )}
          </div>
        </div>
        {/* Argentina */}
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">🇦🇷</span>
            <h3 className="font-bold text-sm text-gray-900">Cuentas Argentina</h3>
          </div>
          <div className="space-y-2">
            {saldosArg.map(c => (
              <div key={c.id} className="flex justify-between items-center py-1.5 border-b border-gray-50">
                <span className="text-xs text-gray-600">{c.nombre}</span>
                <span className="font-mono text-xs font-bold text-gray-900">{c.moneda} {fmtN(c.saldo_actual||0)}</span>
              </div>
            ))}
            {custodiaArg.slice(0,3).map(c => (
              <div key={c.id} className="flex justify-between items-center py-1.5 border-b border-gray-50">
                <div><span className="text-xs text-gray-600">{c.nombre}</span><span className="ml-1 text-[9px] text-blue-500">custodia</span></div>
                <span className="font-mono text-xs font-bold text-blue-700">{c.moneda} {fmtN(c.saldo||0)}</span>
              </div>
            ))}
            {saldosArg.length === 0 && custodiaArg.length === 0 && (
              <div className="text-xs text-gray-400">Sin cuentas registradas</div>
            )}
          </div>
        </div>
      </div>

      {/* TC vigente */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5 text-xs text-blue-700 mb-5 flex gap-6">
        <span>TC vigente:</span>
        <span className="font-mono font-bold">USD/CLP {fmtN(tc.usd)}</span>
        <span className="font-mono font-bold">USD/ARS {fmtN(tc.ars)}</span>
        <span className="font-mono font-bold">ARS/CLP {fmtN(tc.usd / tc.ars)}</span>
      </div>

      {/* Formulario */}
      {showForm && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm mb-6">
          <h3 className="font-bold text-sm text-gray-900 mb-4">Registrar movimiento</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Tipo de movimiento</label>
              <select value={form.tipo} onChange={e => setForm(f => ({...f, tipo: e.target.value}))} className={inp}>
                {Object.entries(TIPOS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Descripción *</label>
              <input value={form.descripcion} onChange={e => setForm(f => ({...f, descripcion: e.target.value}))} className={inp} placeholder="ej. Envío fondos para pago despachante Jujuy"/>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Cuenta origen</label>
              <select value={form.cuenta_origen_id} onChange={e => setForm(f => ({...f, cuenta_origen_id: e.target.value}))} className={inp}>
                <option value="">— Seleccionar cuenta —</option>
                <optgroup label="Cuentas propias PN">
                  {cuentasPn.map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>)}
                </optgroup>
                <optgroup label="Fondos custodia">
                  {cuentasCustodia.map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>)}
                </optgroup>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Cuenta destino</label>
              <select value={form.cuenta_destino_id} onChange={e => setForm(f => ({...f, cuenta_destino_id: e.target.value}))} className={inp}>
                <option value="">— Seleccionar cuenta —</option>
                <optgroup label="Cuentas propias PN">
                  {cuentasPn.map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>)}
                </optgroup>
                <optgroup label="Fondos custodia">
                  {cuentasCustodia.map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>)}
                </optgroup>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Monto origen *</label>
              <div className="flex gap-2">
                <select value={form.moneda_origen} onChange={e => setForm(f => ({...f, moneda_origen: e.target.value}))} className="w-20 px-2 py-2 border border-gray-200 rounded-xl text-xs bg-white">
                  {['ARS','CLP','USD'].map(m => <option key={m}>{m}</option>)}
                </select>
                <input type="text" inputMode="decimal" value={form.monto_origen} onChange={e => setForm(f => ({...f, monto_origen: e.target.value}))} className={inp + ' text-right font-mono'} placeholder="0"/>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Monto destino (calculado)</label>
              <div className="flex gap-2">
                <select value={form.moneda_destino} onChange={e => setForm(f => ({...f, moneda_destino: e.target.value}))} className="w-20 px-2 py-2 border border-gray-200 rounded-xl text-xs bg-white">
                  {['CLP','ARS','USD'].map(m => <option key={m}>{m}</option>)}
                </select>
                <input type="text" inputMode="decimal" value={form.monto_destino || fmtN(calcMontoDestino())} onChange={e => setForm(f => ({...f, monto_destino: e.target.value}))} className={inp + ' text-right font-mono bg-gray-50'} placeholder="Auto"/>
              </div>
            </div>
            {form.monto_origen && form.moneda_origen !== form.moneda_destino && (
              <div className="col-span-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 text-xs text-amber-700">
                TC aplicado: {fmtN(calcTCaplicado())} · Equivalente USD: {fmtN(parseN(form.monto_origen) / (form.moneda_origen==='USD'?1:form.moneda_origen==='CLP'?tc.usd:tc.ars))}
              </div>
            )}
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">N° Transferencia</label>
              <input value={form.referencia} onChange={e => setForm(f => ({...f, referencia: e.target.value}))} className={inp} placeholder="Comprobante bancario"/>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Notas</label>
              <input value={form.notas} onChange={e => setForm(f => ({...f, notas: e.target.value}))} className={inp} placeholder="Observaciones"/>
            </div>
          </div>
          <div className="flex justify-between mt-4">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-200 rounded-xl text-xs hover:bg-gray-50">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="px-6 py-2.5 bg-[#1168F8] text-white rounded-xl text-xs font-bold disabled:opacity-50">
              {saving ? 'Guardando...' : 'Registrar movimiento'}
            </button>
          </div>
        </div>
      )}

      {/* Tabla de movimientos */}
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
        {loading ? <div className="p-12 text-center text-gray-400">Cargando...</div> : movimientos.length === 0 ? (
          <div className="p-12 text-center text-gray-400">Sin movimientos registrados</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Fecha','Tipo','Descripción','Origen','Destino','Monto origen','Monto destino','Equiv. USD'].map(h => (
                  <th key={h} className="text-left px-3 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {movimientos.map(m => (
                <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-3 py-3 font-mono text-[11px]">{m.fecha?.split('-').reverse().join('/')}</td>
                  <td className="px-3 py-3">
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-[10px] font-semibold whitespace-nowrap">
                      {TIPOS[m.tipo as keyof typeof TIPOS]||m.tipo}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-medium text-gray-800">{m.descripcion}</td>
                  <td className="px-3 py-3 text-gray-500 text-[11px]">{m.cuenta_origen_nombre||'—'}</td>
                  <td className="px-3 py-3 text-gray-500 text-[11px]">{m.cuenta_destino_nombre||'—'}</td>
                  <td className="px-3 py-3 text-right font-mono">{m.moneda_origen} {fmtN(m.monto_origen)}</td>
                  <td className="px-3 py-3 text-right font-mono">{m.moneda_destino} {fmtN(m.monto_destino)}</td>
                  <td className="px-3 py-3 text-right font-mono font-bold text-[#052698]">USD {fmtN(m.monto_usd_equiv)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
