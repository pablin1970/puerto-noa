'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { fmt, getTributos, calcCapacidad, CONT_CAPS, PUERTOS_L, nextCotNum, nowDate } from '@/lib/utils'
import type { ContenedorCot, ProductoCot, TributoRow, Tarifa } from '@/types'
import { useRouter } from 'next/navigation'

type Tab = 'embarque' | 'logistica' | 'tributos' | 'resumen'

interface ItemLogistica { id: string; desc: string; cant: number; unitario: number; ivaChile?: 'exento' | 'gravado' }
interface CotState {
  cliente: string; cuit: string; email: string; telefono: string
  ejecutivoId: string; despachante: string; ivaCondicion: string; validez: string
  origen: string; ptoChile: string; destinoNoa: string; incoterm: string
  transito: string; refNaviero: string; notas: string
  contenedores: ContenedorCot[]
  productos: ProductoCot[]
  exwTransp: number; exwAgente: number; exwOtros: number
  precioArgEquiv: number
  rowsA: ItemLogistica[]; rowsC: ItemLogistica[]; rowsE: ItemLogistica[]
  segModo: 'pct' | 'fijo'; segVal: number
  optTransp: 'des' | 'con'
  ftCamion: number; nCamiones: number
  ftIda: number; ftDev: number; ftRt: number
  feeCont: number
  tcArs: number; tcClp: number
  regimen: 'A' | 'B'; tcTrib: number; derPct: number
}

const initState: CotState = {
  cliente: '', cuit: '', email: '', telefono: '',
  ejecutivoId: '', despachante: '', ivaCondicion: 'Responsable Inscripto', validez: '',
  origen: 'Dalian, China (CNDAG)', ptoChile: 'IQQ', destinoNoa: 'Jujuy', incoterm: 'FOB',
  transito: '44-46 días', refNaviero: '', notas: '',
  contenedores: [{ tipo: '40HC', cantidad: 1 }],
  productos: [{ descripcion: '', ncm: '', cantidad: 1, precio_unit: 0, subtotal: 0, peso_unit: 0, vol_unit: 0, incoterm: 'FOB' }],
  exwTransp: 0, exwAgente: 0, exwOtros: 0,
  precioArgEquiv: 0,
  rowsA: [], rowsC: [], rowsE: [],
  segModo: 'pct', segVal: 0.5,
  optTransp: 'des',
  ftCamion: 0, nCamiones: 1,
  ftIda: 0, ftDev: 0, ftRt: 0,
  feeCont: 0,
  tcArs: 1000, tcClp: 950,
  regimen: 'A', tcTrib: 1000, derPct: 18,
}

function newRow(id?: string): ItemLogistica {
  return { id: id || Math.random().toString(36).slice(2), desc: '', cant: 1, unitario: 0, ivaChile: 'exento' }
}

export default function CotizadorPage() {
  const [s, setS] = useState<CotState>(initState)
  const [tab, setTab] = useState<Tab>('embarque')
  const [tarifas, setTarifas] = useState<Tarifa[]>([])
  const [saving, setSaving] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    supabase.from('tarifas').select('*').eq('activo', true).then(({ data }) => {
      if (data) setTarifas(data as Tarifa[])
    })
  }, [])

  const u = <K extends keyof CotState>(k: K, v: CotState[K]) => setS(prev => ({ ...prev, [k]: v }))

  // Calculations
  const nc = s.contenedores.reduce((t, c) => t + c.cantidad, 0) || 1
  const totalFOB = s.productos.reduce((t, p) => t + p.subtotal, 0) +
    (s.incoterm === 'EXW' ? s.exwTransp + s.exwAgente + s.exwOtros : 0)
  const subA = s.rowsA.reduce((t, r) => t + r.cant * r.unitario, 0)
  const seg = s.segModo === 'pct' ? (totalFOB + subA) * s.segVal / 100 : s.segVal
  const subC = s.rowsC.reduce((t, r) => {
    const base = r.cant * r.unitario
    return t + (r.ivaChile === 'gravado' ? base * 1.19 : base)
  }, 0)
  const subD = s.optTransp === 'des'
    ? s.ftCamion * s.nCamiones
    : (() => { const ida = s.ftIda * nc, dev = s.ftDev * nc, rt = s.ftRt * nc; return rt > 0 && rt < (ida + dev) ? rt : ida + dev })()
  const subE = s.rowsE.reduce((t, r) => t + r.cant * r.unitario, 0)
  const fee = s.feeCont * nc
  const cif = totalFOB + subA + seg
  const cifARS = cif * s.tcTrib
  const tributos: TributoRow[] = getTributos(s.regimen, cifARS, s.derPct)
  const totalTribARS = tributos.reduce((t, r) => t + r.imp, 0)
  const totalTribUSD = totalTribARS / s.tcTrib
  const totalLog = totalFOB + subA + seg + subC + subD + subE + fee
  const totalLanded = totalLog + totalTribUSD
  const cap = calcCapacidad(s.contenedores, s.productos)

  function aplicarTarifas() {
    const maritimas = tarifas.filter(t => t.tipo === 'maritima')
    const puerto = tarifas.filter(t => t.tipo === 'puerto')
    setS(prev => ({
      ...prev,
      rowsA: maritimas.map(t => ({ id: Math.random().toString(36).slice(2), desc: `${t.ruta} – ${t.tipo_contenedor}${t.naviera ? ` (${t.naviera})` : ''}`, cant: nc, unitario: t.valor, ivaChile: 'exento' as const })),
      rowsC: puerto.map(t => ({ id: Math.random().toString(36).slice(2), desc: t.ruta, cant: nc, unitario: t.valor, ivaChile: (t.iva_chile || 'exento') as 'exento' | 'gravado' })),
    }))
  }

  async function guardar() {
    if (!s.cliente) { alert('Ingresá el nombre del cliente.'); return }
    setSaving(true)
    const { data: cots } = await supabase.from('cotizaciones').select('num')
    const num = nextCotNum(cots || [])
    const { data: user } = await supabase.auth.getUser()
    const { data: uDB } = await supabase.from('usuarios').select('id').eq('auth_id', user.user?.id).single()
    const uid = uDB?.id || ''
    const presupuesto = [
      ...(subA > 0 ? [{ etapa: 'maritimo', tipo: 'flete', concepto: 'Flete marítimo y cargos naviero', usd: subA }] : []),
      ...(seg > 0 ? [{ etapa: 'maritimo', tipo: 'seguro', concepto: 'Seguro mercadería', usd: seg }] : []),
      ...(subC > 0 ? [{ etapa: 'chile', tipo: 'servicios', concepto: 'Gastos puerto Chile', usd: subC }] : []),
      ...(subD > 0 ? [{ etapa: 'terrestre', tipo: 'flete', concepto: 'Transporte terrestre', usd: subD }] : []),
      ...(subE > 0 ? [{ etapa: 'argentina', tipo: 'servicios', concepto: 'Gastos Argentina', usd: subE }] : []),
      ...(totalTribUSD > 0 ? [{ etapa: 'tributos', tipo: 'tributos', concepto: `Tributos ARCA Régimen ${s.regimen}`, usd: totalTribUSD }] : []),
      ...(fee > 0 ? [{ etapa: 'fee', tipo: 'fee', concepto: 'Fee Puerto NOA', usd: fee }] : []),
    ]
    await supabase.from('cotizaciones').insert({
      num, version: 1,
      cliente: s.cliente, cuit: s.cuit, email_cliente: s.email, telefono_cliente: s.telefono,
      origen: s.origen, puerto_chile: s.ptoChile, destino_noa: s.destinoNoa, incoterm: s.incoterm,
      transito: s.transito, ref_naviero: s.refNaviero, notas: s.notas,
      tipo_contenedores: s.contenedores, productos: s.productos,
      total_fob: totalFOB, total_logistico: totalLog,
      total_tributos_usd: totalTribUSD, total_tributos_ars: totalTribARS,
      total_landed: totalLanded,
      precio_arg_equiv: s.precioArgEquiv || null,
      regimen: s.regimen, tc_ars: s.tcArs, derechos_pct: s.derPct,
      opcion_transporte: s.optTransp === 'des' ? 'desconsolidar' : 'contenedor',
      validez: s.validez, estado: 'borrador',
      ejecutivo_id: uid, creado_por: uid, modificado_por: uid,
      presupuesto,
    })
    setSaving(false)
    router.push('/registro')
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'embarque', label: 'Embarque' },
    { key: 'logistica', label: 'Logística' },
    { key: 'tributos', label: 'Tributos ARCA' },
    { key: 'resumen', label: 'Resumen' },
  ]

  return (
    <div className="p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Nueva cotización</h1>
          <p className="text-xs text-gray-400 mt-0.5">Módulo 1 — Cotizador logístico China → NOA</p>
        </div>
        <button onClick={aplicarTarifas} className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-xs hover:bg-gray-50 transition-colors text-gray-600">
          ⬇ Cargar tarifas base
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${tab === t.key ? 'bg-[#1D9E75] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{t.label}</button>
        ))}
      </div>

      {/* ── EMBARQUE ── */}
      {tab === 'embarque' && (
        <div className="space-y-4">
          {/* Cliente */}
          <Card title="Cliente y operación">
            <div className="grid grid-cols-4 gap-3 mb-3">
              <Field label="Cliente"><input value={s.cliente} onChange={e => u('cliente', e.target.value)} className={inp} placeholder="Razón social" /></Field>
              <Field label="CUIT"><input value={s.cuit} onChange={e => u('cuit', e.target.value)} className={inp} placeholder="XX-XXXXXXXX-X" /></Field>
              <Field label="Email"><input type="email" value={s.email} onChange={e => u('email', e.target.value)} className={inp} placeholder="correo@empresa.com" /></Field>
              <Field label="Teléfono"><input value={s.telefono} onChange={e => u('telefono', e.target.value)} className={inp} placeholder="+54 9 388..." /></Field>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <Field label="Despachante de aduana"><input value={s.despachante} onChange={e => u('despachante', e.target.value)} className={inp} placeholder="Nombre / CUIT" /></Field>
              <Field label="Condición IVA">
                <select value={s.ivaCondicion} onChange={e => u('ivaCondicion', e.target.value)} className={sel}>
                  {['Responsable Inscripto', 'Monotributista', 'Exento', 'Consumidor Final'].map(v => <option key={v}>{v}</option>)}
                </select>
              </Field>
              <Field label="Validez oferta">
                <select value={s.validez} onChange={e => u('validez', e.target.value)} className={sel}>
                  <option value="">Sin especificar</option>
                  <option value="15 días">15 días</option>
                  <option value="30 días">30 días</option>
                  <option value="45 días">45 días</option>
                </select>
              </Field>
              <Field label="Notas internas"><input value={s.notas} onChange={e => u('notas', e.target.value)} className={inp} placeholder="Observaciones" /></Field>
            </div>
          </Card>

          {/* Ruta */}
          <Card title="Ruta del embarque">
            <div className="grid grid-cols-4 gap-3 mb-3">
              <Field label="Origen"><input value={s.origen} onChange={e => u('origen', e.target.value)} className={inp} /></Field>
              <Field label="Puerto Chile">
                <select value={s.ptoChile} onChange={e => u('ptoChile', e.target.value)} className={sel}>
                  {Object.entries(PUERTOS_L).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="Destino NOA">
                <select value={s.destinoNoa} onChange={e => u('destinoNoa', e.target.value)} className={sel}>
                  {['Jujuy', 'Salta', 'Tucumán', 'Catamarca', 'La Rioja'].map(v => <option key={v}>{v}</option>)}
                </select>
              </Field>
              <Field label="Incoterm">
                <select value={s.incoterm} onChange={e => u('incoterm', e.target.value)} className={sel}>
                  {['FOB', 'EXW', 'CIF', 'CFR'].map(v => <option key={v}>{v}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Tránsito estimado"><input value={s.transito} onChange={e => u('transito', e.target.value)} className={inp} /></Field>
              <Field label="Ref. cotiz. naviero"><input value={s.refNaviero} onChange={e => u('refNaviero', e.target.value)} className={inp} placeholder="ej. Q-AR-DR... (Hellmann)" /></Field>
            </div>
          </Card>

          {/* Contenedores */}
          <Card title="Contenedores">
            <div className="grid grid-cols-3 gap-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">
              <div>Tipo</div><div className="text-center">Cantidad</div><div></div>
            </div>
            {s.contenedores.map((c, i) => (
              <div key={i} className="grid grid-cols-3 gap-3 items-center mb-2">
                <select value={c.tipo} onChange={e => { const n = [...s.contenedores]; n[i] = { ...n[i], tipo: e.target.value }; u('contenedores', n) }} className={sel}>
                  {Object.keys(CONT_CAPS).map(k => <option key={k}>{k}</option>)}
                </select>
                <input type="number" value={c.cantidad} min={1} onChange={e => { const n = [...s.contenedores]; n[i] = { ...n[i], cantidad: parseInt(e.target.value) || 1 }; u('contenedores', n) }} className={inp + ' text-center'} />
                <button onClick={() => u('contenedores', s.contenedores.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500 text-xs transition-colors">🗑</button>
              </div>
            ))}
            <button onClick={() => u('contenedores', [...s.contenedores, { tipo: '40HC', cantidad: 1 }])} className="text-xs text-[#1D9E75] hover:underline mt-1">+ Agregar tipo de contenedor</button>
            <div className="mt-2 text-xs text-gray-500">Total: <strong>{nc} contenedor(es)</strong></div>
          </Card>

          {/* Productos */}
          <Card title="Productos de China">
            <div className="overflow-x-auto">
              <table className="w-full text-xs mb-2">
                <thead>
                  <tr className="bg-gray-50">
                    {['Descripción', 'NCM', 'Cant.', 'Precio unit. USD', 'Subtotal', 'Peso kg/u', 'Vol m³/u', 'Incoterm', ''].map(h => (
                      <th key={h} className="text-left px-2 py-2 text-[10px] text-gray-400 font-medium uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.productos.map((p, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="px-2 py-1.5"><input value={p.descripcion} onChange={e => { const n = [...s.productos]; n[i] = { ...n[i], descripcion: e.target.value }; u('productos', n) }} className={inp} placeholder="Producto" /></td>
                      <td className="px-2 py-1.5"><input value={p.ncm} onChange={e => { const n = [...s.productos]; n[i] = { ...n[i], ncm: e.target.value }; u('productos', n) }} className={inp} placeholder="0000.00.00" /></td>
                      <td className="px-2 py-1.5"><input type="number" value={p.cantidad} min={0} onChange={e => { const n = [...s.productos]; const qty = parseFloat(e.target.value) || 0; n[i] = { ...n[i], cantidad: qty, subtotal: qty * n[i].precio_unit }; u('productos', n) }} className={inp + ' text-right w-16'} /></td>
                      <td className="px-2 py-1.5"><input type="number" value={p.precio_unit} min={0} step={0.01} onChange={e => { const n = [...s.productos]; const pu = parseFloat(e.target.value) || 0; n[i] = { ...n[i], precio_unit: pu, subtotal: pu * n[i].cantidad }; u('productos', n) }} className={inp + ' text-right w-24'} /></td>
                      <td className="px-2 py-1.5"><div className="px-2 py-1 bg-gray-50 border border-gray-200 rounded font-mono text-[11px] text-right w-24">{fmt(p.subtotal)}</div></td>
                      <td className="px-2 py-1.5"><input type="number" value={p.peso_unit} min={0} onChange={e => { const n = [...s.productos]; n[i] = { ...n[i], peso_unit: parseFloat(e.target.value) || 0 }; u('productos', n) }} className={inp + ' text-right w-20'} /></td>
                      <td className="px-2 py-1.5"><input type="number" value={p.vol_unit} min={0} step={0.001} onChange={e => { const n = [...s.productos]; n[i] = { ...n[i], vol_unit: parseFloat(e.target.value) || 0 }; u('productos', n) }} className={inp + ' text-right w-20'} /></td>
                      <td className="px-2 py-1.5">
                        <select value={p.incoterm} onChange={e => { const n = [...s.productos]; n[i] = { ...n[i], incoterm: e.target.value }; u('productos', n) }} className={sel + ' w-20'}>
                          {['FOB', 'EXW', 'CIF'].map(v => <option key={v}>{v}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5"><button onClick={() => u('productos', s.productos.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500 text-xs">🗑</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={() => u('productos', [...s.productos, { descripcion: '', ncm: '', cantidad: 1, precio_unit: 0, subtotal: 0, peso_unit: 0, vol_unit: 0, incoterm: s.incoterm }])} className="text-xs text-[#1D9E75] hover:underline">+ Agregar producto</button>

            {/* Totales productos */}
            <div className="grid grid-cols-4 gap-3 mt-4">
              {[
                { label: 'Total FOB/EXW (USD)', value: `USD ${fmt(totalFOB)}` },
                { label: 'Peso total', value: `${fmt(cap.totalKg, 0)} kg` },
                { label: 'Volumen total', value: `${fmt(cap.totalM3, 2)} m³` },
                { label: 'Productos', value: s.productos.length.toString() },
              ].map(it => (
                <div key={it.label} className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                  <div className="text-[10px] text-gray-400 mb-1">{it.label}</div>
                  <div className="font-semibold text-sm text-gray-800">{it.value}</div>
                </div>
              ))}
            </div>

            {/* Capacidad */}
            {nc > 0 && (cap.totalKg > 0 || cap.totalM3 > 0) && (
              <div className="grid grid-cols-3 gap-3 mt-3">
                {[
                  { label: 'PESO', pct: cap.pctKg, curr: fmt(cap.totalKg, 0) + ' kg', max: fmt(cap.capKg, 0) + ' kg' },
                  { label: 'VOLUMEN', pct: cap.pctM3, curr: fmt(cap.totalM3, 2) + ' m³', max: fmt(cap.capM3, 1) + ' m³' },
                ].map(it => {
                  const st = it.pct > 100 ? 'bg-red-50 border-red-200 text-red-700' : it.pct > 85 ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-green-50 border-green-200 text-green-700'
                  const barC = it.pct > 100 ? '#A32D2D' : it.pct > 85 ? '#EF9F27' : '#1D9E75'
                  return (
                    <div key={it.label} className={`border rounded-lg p-3 ${st}`}>
                      <div className="text-[9px] font-bold uppercase tracking-wider mb-1">{it.label}</div>
                      <div className="text-xl font-semibold">{fmt(it.pct, 1)}%</div>
                      <div className="text-[10px] mt-1 opacity-80">{it.curr} de {it.max}</div>
                      <div className="h-1.5 bg-white/50 rounded-full overflow-hidden mt-2">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(it.pct, 100)}%`, background: barC }} />
                      </div>
                    </div>
                  )
                })}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-gray-500 mb-1">CONTENEDORES</div>
                  <div className="text-xl font-semibold text-gray-800">{nc}</div>
                  <div className="text-[10px] text-gray-400 mt-1">{s.contenedores.map(c => `${c.cantidad}× ${c.tipo}`).join(', ')}</div>
                </div>
              </div>
            )}

            {/* EXW */}
            {s.incoterm === 'EXW' && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="text-xs font-medium text-gray-700 mb-3">Puesta a FOB (precio EXW)</div>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Transporte interno China (USD)"><input type="number" value={s.exwTransp} onChange={e => u('exwTransp', parseFloat(e.target.value) || 0)} className={inp} /></Field>
                  <Field label="Agente exportación (USD)"><input type="number" value={s.exwAgente} onChange={e => u('exwAgente', parseFloat(e.target.value) || 0)} className={inp} /></Field>
                  <Field label="Otros gastos origen (USD)"><input type="number" value={s.exwOtros} onChange={e => u('exwOtros', parseFloat(e.target.value) || 0)} className={inp} /></Field>
                </div>
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-gray-100">
              <Field label="Precio equivalente en Argentina (USD) · para comparativa">
                <input type="number" value={s.precioArgEquiv || ''} onChange={e => u('precioArgEquiv', parseFloat(e.target.value) || 0)} className={inp} placeholder="0.00" />
              </Field>
            </div>
          </Card>

          <div className="flex justify-end">
            <button onClick={() => setTab('logistica')} className="bg-[#1D9E75] text-white px-5 py-2 rounded-lg text-xs font-medium hover:bg-[#0F6E56] transition-colors">Logística →</button>
          </div>
        </div>
      )}

      {/* ── LOGÍSTICA ── */}
      {tab === 'logistica' && (
        <div className="space-y-4">
          {/* TC Bar */}
          <div className="flex gap-4 items-center px-4 py-2.5 bg-white border border-gray-100 rounded-xl text-xs flex-wrap">
            <span className="font-medium text-gray-700">Tipos de cambio:</span>
            <div className="flex items-center gap-2"><label className="text-gray-500">USD/ARS</label><input type="number" value={s.tcArs} onChange={e => u('tcArs', parseFloat(e.target.value) || 1000)} className="w-20 px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1D9E75]" /></div>
            <div className="flex items-center gap-2"><label className="text-gray-500">USD/CLP</label><input type="number" value={s.tcClp} onChange={e => u('tcClp', parseFloat(e.target.value) || 950)} className="w-20 px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1D9E75]" /></div>
          </div>

          {/* A: Flete marítimo */}
          <CardSection title="A" label="Flete marítimo internacional" sub="China → Puerto Chile" subtotal={`USD ${fmt(subA)}`}>
            <LogRows rows={s.rowsA} onChange={r => u('rowsA', r)} />
          </CardSection>

          {/* B: Seguro */}
          <CardSection title="B" label="Seguro de la mercadería" subtotal={`USD ${fmt(seg)}`}>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Modalidad"><select value={s.segModo} onChange={e => u('segModo', e.target.value as 'pct' | 'fijo')} className={sel}><option value="pct">% sobre FOB + flete</option><option value="fijo">Monto fijo (USD)</option></select></Field>
              <Field label={s.segModo === 'pct' ? 'Tasa seguro (%)' : 'Monto fijo (USD)'}><input type="number" value={s.segVal} step={0.1} onChange={e => u('segVal', parseFloat(e.target.value) || 0)} className={inp} /></Field>
              <Field label="Seguro calculado (USD)"><div className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-right font-mono">USD {fmt(seg)}</div></Field>
            </div>
          </CardSection>

          {/* C: Gastos puerto Chile */}
          <CardSection title="C" label="Gastos en puerto Chile" sub="THC, handling, desconsolidación · IVA Chile discriminado" subtotal={`USD ${fmt(subC)}`}>
            <LogRows rows={s.rowsC} onChange={r => u('rowsC', r)} withIva />
          </CardSection>

          {/* D: Transporte */}
          <CardSection title="D" label="Transporte terrestre" sub="Puerto Chile → NOA" subtotal={`USD ${fmt(subD)}`}>
            <div className="flex gap-2 mb-4">
              {[{ key: 'des', label: 'Opción A — Desconsolidar en Chile', sub: 'Mercadería en camión desde el puerto' }, { key: 'con', label: 'Opción B — Contenedor hasta Argentina', sub: 'Desconsolidar en destino + devolución' }].map(o => (
                <button key={o.key} onClick={() => u('optTransp', o.key as 'des' | 'con')} className={`flex-1 px-3 py-2.5 rounded-lg border text-left transition-colors ${s.optTransp === o.key ? 'border-[#1D9E75] bg-[#E1F5EE] text-[#085041]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                  <div className="text-xs font-medium">{o.label}</div>
                  <div className="text-[10px] opacity-70 mt-0.5">{o.sub}</div>
                </button>
              ))}
            </div>
            {s.optTransp === 'des' ? (
              <div className="grid grid-cols-3 gap-3">
                <Field label="Flete terrestre (USD/camión)"><input type="number" value={s.ftCamion} onChange={e => u('ftCamion', parseFloat(e.target.value) || 0)} className={inp} /></Field>
                <Field label="N° camiones"><input type="number" value={s.nCamiones} min={1} onChange={e => u('nCamiones', parseInt(e.target.value) || 1)} className={inp} /></Field>
                <Field label="Subtotal"><div className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono text-right">USD {fmt(subD)}</div></Field>
              </div>
            ) : (
              <div>
                <div className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-lg px-3 py-2 mb-3">El round trip (ida+devolución en un contrato) suele ser más económico. El sistema elige automáticamente.</div>
                <div className="grid grid-cols-4 gap-3">
                  <Field label="Flete ida (USD/cont)"><input type="number" value={s.ftIda} onChange={e => u('ftIda', parseFloat(e.target.value) || 0)} className={inp} /></Field>
                  <Field label="Devolución (USD/cont)"><input type="number" value={s.ftDev} onChange={e => u('ftDev', parseFloat(e.target.value) || 0)} className={inp} /></Field>
                  <Field label="Round trip disponible (USD/cont)"><input type="number" value={s.ftRt} onChange={e => u('ftRt', parseFloat(e.target.value) || 0)} className={inp} placeholder="0 = no disponible" /></Field>
                  <Field label="Elegido (USD total)"><div className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono text-right">USD {fmt(subD)}</div></Field>
                </div>
                {s.ftRt > 0 && s.ftRt < (s.ftIda + s.ftDev) * nc && (
                  <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mt-2">✓ Round trip USD {fmt(s.ftRt * nc)} más económico que ida+dev (USD {fmt((s.ftIda + s.ftDev) * nc)}). Ahorro: USD {fmt((s.ftIda + s.ftDev) * nc - s.ftRt * nc)}</p>
                )}
              </div>
            )}
          </CardSection>

          {/* E: Gastos Argentina */}
          <CardSection title="E" label="Gastos en Argentina" sub="Despachante, almacenaje, traslado" subtotal={`USD ${fmt(subE)}`}>
            <LogRows rows={s.rowsE} onChange={r => u('rowsE', r)} />
          </CardSection>

          {/* F: Fee */}
          <CardSection title="F" label="Fee Puerto NOA" subtotal={`USD ${fmt(fee)}`}>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Fee por contenedor (USD)"><input type="number" value={s.feeCont} onChange={e => u('feeCont', parseFloat(e.target.value) || 0)} className={inp} /></Field>
              <Field label="N° contenedores"><div className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-right">{nc}</div></Field>
              <Field label="Fee total (USD)"><div className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono text-right">USD {fmt(fee)}</div></Field>
            </div>
          </CardSection>

          <div className="flex justify-between">
            <button onClick={() => setTab('embarque')} className="px-4 py-2 border border-gray-200 rounded-lg text-xs hover:bg-gray-50 transition-colors">← Anterior</button>
            <button onClick={() => setTab('tributos')} className="bg-[#1D9E75] text-white px-5 py-2 rounded-lg text-xs font-medium hover:bg-[#0F6E56] transition-colors">Tributos ARCA →</button>
          </div>
        </div>
      )}

      {/* ── TRIBUTOS ── */}
      {tab === 'tributos' && (
        <div className="space-y-4">
          {/* CIF Boxes */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'FOB China', value: `USD ${fmt(totalFOB, 0)}`, sub: 'Precio mercadería + puesta a FOB' },
              { label: 'Flete hasta Jama + Seguro', value: `USD ${fmt(subA + seg, 0)}`, sub: 'Flete marítimo + seguro' },
            ].map(b => (
              <div key={b.label} className="bg-[#E1F5EE] border border-[#5DCAA5] rounded-xl p-4">
                <div className="text-[10px] text-[#0F6E56] mb-1">{b.label}</div>
                <div className="text-xl font-semibold text-[#085041]">{b.value}</div>
                <div className="text-[10px] text-[#0F6E56] mt-1">{b.sub}</div>
              </div>
            ))}
            <div className="bg-[#085041] rounded-xl p-4">
              <div className="text-[10px] text-[#9FE1CB] mb-1">Valor CIF Jama — base imponible ARCA</div>
              <div className="text-xl font-semibold text-white">USD {fmt(cif, 0)}</div>
              <div className="text-[10px] text-[#9FE1CB] mt-1">ARS {Math.round(cifARS).toLocaleString('es-AR')}</div>
            </div>
          </div>

          <Card title="Liquidación ARCA — Aduana Jujuy">
            <div className="grid grid-cols-4 gap-3 mb-4">
              <Field label="Régimen">
                <select value={s.regimen} onChange={e => u('regimen', e.target.value as 'A' | 'B')} className={sel}>
                  <option value="A">Régimen A — Comercialización</option>
                  <option value="B">Régimen B — Bien de uso persona física</option>
                </select>
              </Field>
              <Field label="TC ARS/USD (oficial al despacho)"><input type="number" value={s.tcTrib} onChange={e => u('tcTrib', parseFloat(e.target.value) || 1000)} className={inp} /></Field>
              <Field label="Derechos importación % (NCM)"><input type="number" value={s.derPct} step={0.5} onChange={e => u('derPct', parseFloat(e.target.value) || 18)} className={inp} /></Field>
              <Field label="NCM principal"><div className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono">{s.productos.find(p => p.ncm)?.ncm || '—'}</div></Field>
            </div>

            <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
              <div className="text-[10px] font-semibold text-gray-500 mb-3 uppercase tracking-wider">
                RÉGIMEN {s.regimen === 'A' ? 'A — COMERCIALIZACIÓN' : 'B — BIEN DE USO PERSONA FÍSICA'} · SIM Aduana Jujuy
              </div>
              <div className="grid grid-cols-5 gap-2 text-[9px] font-semibold text-gray-400 uppercase tracking-wide pb-2 border-b border-gray-200 mb-1">
                <div>Cód.</div><div className="col-span-2">Concepto</div><div className="text-right">Tasa</div><div className="text-right">Importe ARS</div>
              </div>
              {tributos.map(t => (
                <div key={t.cod} className="grid grid-cols-5 gap-2 text-xs py-1.5 border-b border-gray-100">
                  <div className="font-mono text-[10px] text-gray-400">{t.cod}</div>
                  <div className="col-span-2 text-gray-700">{t.con}</div>
                  <div className="text-right text-gray-500">{t.tasa}</div>
                  <div className="text-right font-mono font-medium text-gray-800">ARS {Math.round(t.imp).toLocaleString('es-AR')}</div>
                </div>
              ))}
              <div className="flex justify-between pt-2 mt-1 border-t border-gray-200 font-semibold text-sm">
                <span>TOTAL PAGADO ADUANA</span>
                <span className="font-mono text-[#085041]">ARS {Math.round(totalTribARS).toLocaleString('es-AR')}</span>
              </div>
              <div className="text-right text-[10px] text-gray-400 mt-1">Equiv. USD ref.: USD {fmt(totalTribUSD, 0)}</div>
            </div>
          </Card>

          <div className="flex justify-between">
            <button onClick={() => setTab('logistica')} className="px-4 py-2 border border-gray-200 rounded-lg text-xs hover:bg-gray-50 transition-colors">← Anterior</button>
            <button onClick={() => setTab('resumen')} className="bg-[#1D9E75] text-white px-5 py-2 rounded-lg text-xs font-medium hover:bg-[#0F6E56] transition-colors">Ver resumen →</button>
          </div>
        </div>
      )}

      {/* ── RESUMEN ── */}
      {tab === 'resumen' && (
        <div className="space-y-4">
          {/* Comparativa */}
          <div className="grid grid-cols-3 gap-3 items-center">
            <div className="bg-white border border-gray-100 border-t-4 border-t-[#1D9E75] rounded-xl p-5 text-center">
              <div className="text-[10px] text-gray-400 mb-1">Costo total China → {s.destinoNoa}</div>
              <div className="text-2xl font-semibold text-gray-900">USD {fmt(totalLanded, 0)}</div>
              <div className="text-[10px] text-gray-400 mt-1">producto + logística + tributos</div>
            </div>
            <div className="text-center text-sm text-gray-400 font-semibold">VS</div>
            <div className="bg-white border border-gray-100 border-t-4 border-t-blue-400 rounded-xl p-5 text-center">
              <div className="text-[10px] text-gray-400 mb-1">Precio equivalente en Argentina</div>
              <div className="text-2xl font-semibold text-gray-900">{s.precioArgEquiv > 0 ? `USD ${fmt(s.precioArgEquiv, 0)}` : '—'}</div>
              <div className="text-[10px] text-gray-400 mt-1">precio ingresado</div>
            </div>
          </div>

          {s.precioArgEquiv > 0 && (() => {
            const diff = s.precioArgEquiv - totalLanded
            return (
              <div className={`text-xs px-4 py-3 rounded-xl text-center font-medium ${diff > 0 ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                {diff > 0 ? `✓ Importar desde China es USD ${fmt(Math.abs(diff), 0)} más económico (${Math.round(Math.abs(diff) / s.precioArgEquiv * 100)}% de ahorro)` : `✗ Importar desde China resulta USD ${fmt(Math.abs(diff), 0)} más caro que el precio local`}
              </div>
            )
          })()}

          {/* Desglose */}
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 font-medium text-sm text-gray-900">Desglose completo de costos</div>
            <table className="w-full text-xs">
              <thead><tr className="bg-gray-50"><th className="text-left px-4 py-2.5 text-[10px] text-gray-400 font-medium uppercase tracking-wide">Concepto</th><th className="text-left px-4 py-2.5 text-[10px] text-gray-400 font-medium uppercase tracking-wide">Detalle</th><th className="text-right px-4 py-2.5 text-[10px] text-gray-400 font-medium uppercase tracking-wide">USD</th></tr></thead>
              <tbody>
                {[
                  { grp: 'Producto', concepto: `Precio mercadería China (${s.incoterm})`, detalle: `${s.productos.filter(p => p.subtotal > 0).length} producto(s)`, v: totalFOB },
                  ...(s.incoterm === 'EXW' ? [{ grp: 'Puesta a FOB', concepto: 'Gastos origen China', detalle: 'Transporte + agente + otros', v: s.exwTransp + s.exwAgente + s.exwOtros }] : []),
                  { grp: 'Flete marítimo', concepto: 'Flete int. + cargos naviero', detalle: `China → ${PUERTOS_L[s.ptoChile]}`, v: subA },
                  { grp: 'Seguro', concepto: 'Seguro de la mercadería', detalle: s.segModo === 'pct' ? `${s.segVal}% sobre FOB+flete` : 'Monto fijo', v: seg },
                  { grp: 'Puerto Chile', concepto: 'THC, handling, gastos portuarios', detalle: PUERTOS_L[s.ptoChile], v: subC },
                  { grp: 'Transporte terrestre', concepto: s.optTransp === 'des' ? 'Flete carga suelta' : 'Contenedor hasta Argentina', detalle: `${PUERTOS_L[s.ptoChile]} → ${s.destinoNoa}`, v: subD },
                  { grp: 'Gastos Argentina', concepto: 'Despachante y otros', detalle: '', v: subE },
                  { grp: 'Fee Puerto NOA', concepto: 'Gestión y coordinación', detalle: `${nc} cont. × USD ${s.feeCont}`, v: fee },
                  { grp: 'Tributos ARCA', concepto: `Derechos, IVA, Ganancias${s.regimen === 'A' ? ', IIBB' : ''}`, detalle: `Base CIF Jama · Régimen ${s.regimen}`, v: totalTribUSD },
                ].filter(r => r.v > 0).map((r, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-700"><span className="text-[9px] text-gray-400 font-normal mr-1">{r.grp}</span>{r.concepto}</td>
                    <td className="px-4 py-2.5 text-gray-400 text-[10px]">{r.detalle}</td>
                    <td className="px-4 py-2.5 font-mono text-right">{fmt(r.v)}</td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-semibold border-t-2 border-gray-200">
                  <td className="px-4 py-3 text-sm" colSpan={2}>TOTAL LANDED EN DESTINO</td>
                  <td className="px-4 py-3 font-mono text-right text-base">{fmt(totalLanded)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Totales */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white border border-gray-100 rounded-xl p-4"><div className="text-[10px] text-gray-400 mb-1">Total logístico (USD)</div><div className="text-xl font-semibold">USD {fmt(totalLog, 0)}</div></div>
            <div className="bg-white border border-gray-100 rounded-xl p-4"><div className="text-[10px] text-gray-400 mb-1">Tributos ARCA (USD ref.)</div><div className="text-xl font-semibold">USD {fmt(totalTribUSD, 0)}</div></div>
            <div className="bg-[#E1F5EE] border border-[#5DCAA5] rounded-xl p-4">
              <div className="text-[10px] text-[#0F6E56] mb-1">TOTAL LANDED</div>
              <div className="text-2xl font-semibold text-[#085041]">USD {fmt(totalLanded, 0)}</div>
              <div className="text-[10px] text-[#0F6E56] mt-1">USD {fmt(totalLanded / nc, 0)} por contenedor</div>
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-xl p-4">
            <div className="text-[10px] font-medium text-gray-500 mb-2">Tributos a pagar en Aduana Argentina (ARS)</div>
            <div className="text-2xl font-semibold">ARS {Math.round(totalTribARS).toLocaleString('es-AR')}</div>
            <div className="text-[10px] text-gray-400 mt-1">Régimen {s.regimen === 'A' ? 'A – Comercialización' : 'B – Bien de uso persona física'} · TC ref. ARS {fmt(s.tcTrib, 0)} · Se abonan al TC oficial al momento del despacho</div>
          </div>

          <div className="flex justify-between">
            <button onClick={() => setTab('tributos')} className="px-4 py-2 border border-gray-200 rounded-lg text-xs hover:bg-gray-50 transition-colors">← Anterior</button>
            <button onClick={guardar} disabled={saving} className="bg-[#1D9E75] text-white px-6 py-2 rounded-lg text-xs font-medium hover:bg-[#0F6E56] transition-colors disabled:opacity-60">
              {saving ? 'Guardando...' : '✓ Guardar cotización'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────

const inp = 'w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1D9E75] bg-white'
const sel = 'w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1D9E75] bg-white'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 font-medium text-sm text-gray-900">{title}</div>
      <div className="px-5 py-4">{children}</div>
    </div>
  )
}

function CardSection({ title, label, sub, subtotal, children }: { title: string; label: string; sub?: string; subtotal: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#1D9E75] text-white text-[10px] font-bold flex-shrink-0">{title}</span>
        <span className="font-medium text-sm text-gray-900">{label}</span>
        {sub && <span className="text-[10px] text-gray-400">{sub}</span>}
      </div>
      <div className="px-5 py-4">{children}</div>
      <div className="flex justify-end items-center gap-2 px-5 py-2.5 bg-gray-50 border-t border-gray-100 text-xs text-gray-500">
        Subtotal: <strong>{subtotal}</strong>
      </div>
    </div>
  )
}

function LogRows({ rows, onChange, withIva }: { rows: ItemLogistica[]; onChange: (r: ItemLogistica[]) => void; withIva?: boolean }) {
  const cols = withIva ? '2.5fr 0.8fr 1fr 85px auto' : '2.5fr 0.8fr 1fr auto'
  return (
    <div>
      {rows.map((r, i) => (
        <div key={r.id} className="flex gap-2 items-end mb-2 flex-wrap" style={{ display: 'grid', gridTemplateColumns: cols, gap: '7px', alignItems: 'end' }}>
          <input value={r.desc} onChange={e => { const n = [...rows]; n[i] = { ...n[i], desc: e.target.value }; onChange(n) }} className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1D9E75]" placeholder="Descripción" />
          <input type="number" value={r.cant} onChange={e => { const n = [...rows]; n[i] = { ...n[i], cant: parseFloat(e.target.value) || 1 }; onChange(n) }} className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1D9E75] text-right" />
          <input type="number" value={r.unitario} onChange={e => { const n = [...rows]; n[i] = { ...n[i], unitario: parseFloat(e.target.value) || 0 }; onChange(n) }} className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1D9E75] text-right" />
          {withIva && (
            <select value={r.ivaChile || 'exento'} onChange={e => { const n = [...rows]; n[i] = { ...n[i], ivaChile: e.target.value as 'exento' | 'gravado' }; onChange(n) }} className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1D9E75] bg-white">
              <option value="exento">Exento</option>
              <option value="gravado">Grav. 19%</option>
            </select>
          )}
          <button onClick={() => onChange(rows.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500 text-xs pb-1 transition-colors">🗑</button>
        </div>
      ))}
      <button onClick={() => onChange([...rows, newRow()])} className="text-xs text-[#1D9E75] hover:underline mt-1">+ Agregar ítem</button>
    </div>
  )
}
