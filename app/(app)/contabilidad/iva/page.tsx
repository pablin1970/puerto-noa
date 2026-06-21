'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { cargarPermisos, puede } from '@/lib/permisos'

const inp = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white'
const fmtN = (n: number) => (n||0).toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const fmtD = (n: number) => (n||0).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export default function LibroIVAPage() {
  const supabase = useMemo(() => createClient(), [])
  const [tab, setTab] = useState<'ventas'|'compras'|'resumen'>('ventas')
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [mes, setMes] = useState(new Date().getMonth() + 1)
  const [ventas, setVentas] = useState<any[]>([])
  const [compras, setCompras] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [periodos, setPeriodos] = useState<any[]>([])
  const [utmMes, setUtmMes] = useState<number | null>(null)
  const [utmInput, setUtmInput] = useState('')
  const [savingUtm, setSavingUtm] = useState(false)

  const [permisos, setPermisos] = useState<Record<string, string[]>>({})
  const [permListos, setPermListos] = useState(false)
  useEffect(() => { cargarPermisos().then(p => { setPermisos(p); setPermListos(true) }) }, [])

  useEffect(() => { loadPeriodos(); load(); loadUtm() }, [anio, mes])

  async function loadPeriodos() {
    const { data } = await (supabase.from('periodos_contables') as any).select('*').order('anio', { ascending: false }).order('mes', { ascending: false })
    if (data) setPeriodos(data)
  }

  async function loadUtm() {
    const { data } = await (supabase.from('valores_utm') as any).select('valor_clp').eq('anio', anio).eq('mes', mes).maybeSingle()
    const v = data?.valor_clp != null ? Number(data.valor_clp) : null
    setUtmMes(v)
    setUtmInput(v != null ? String(v) : '')
  }

  async function load() {
    setLoading(true)
    const [vRes, cRes] = await Promise.all([
      (supabase.from('libro_iva_ventas') as any).select('*').eq('anio', anio).eq('mes', mes).order('fecha_emision'),
      (supabase.from('libro_iva_compras') as any).select('*').eq('anio', anio).eq('mes', mes).order('fecha_emision'),
    ])
    if (vRes.data) setVentas(vRes.data)
    if (cRes.data) setCompras(cRes.data)
    setLoading(false)
  }

  async function guardarUtm() {
    const v = parseFloat(utmInput)
    if (!v || v <= 0) { alert('Ingresá un valor de UTM válido.'); return }
    setSavingUtm(true)
    await (supabase.from('valores_utm') as any).upsert({ anio, mes, valor_clp: v, fuente: 'manual', updated_at: new Date().toISOString() }, { onConflict: 'anio,mes' })
    setSavingUtm(false)
    loadUtm()
  }

  const totVentas = {
    neto: ventas.reduce((t,r) => t + (r.neto_clp||0), 0),
    iva:  ventas.reduce((t,r) => t + (r.iva_clp||0), 0),
    total:ventas.reduce((t,r) => t + (r.total_clp||0), 0),
  }
  const totCompras = {
    neto: compras.reduce((t,r) => t + (r.neto_clp||0), 0),
    iva:  compras.reduce((t,r) => t + (r.iva_clp||0), 0),
    total:compras.reduce((t,r) => t + (r.total_clp||0), 0),
    cf:   compras.reduce((t,r) => t + (r.credito_fiscal_clp||0), 0),
  }

  // ── Remanente de crédito fiscal del período anterior, reajustado por UTM (Art. 27 DL 825) ──
  const mesAnt = mes === 1 ? 12 : mes - 1
  const anioAnt = mes === 1 ? anio - 1 : anio
  const periodoAnt = periodos.find(p => p.anio === anioAnt && p.mes === mesAnt)
  const remanenteAntUtm = Number(periodoAnt?.remanente_periodo_utm || 0)        // en UTM (lo que se arrastra)
  const remanenteAntClp = utmMes != null ? remanenteAntUtm * utmMes : 0          // reconvertido a pesos de este mes

  const debito = totVentas.iva
  const creditoMes = totCompras.cf
  const creditoTotal = creditoMes + remanenteAntClp
  const posicion = debito - creditoTotal                                         // >0 a pagar, <0 remanente
  const ivaPagar = posicion > 0 ? posicion : 0
  const remanentePeriodoClp = posicion < 0 ? -posicion : 0
  const remanentePeriodoUtm = (remanentePeriodoClp > 0 && utmMes) ? remanentePeriodoClp / utmMes : 0

  const periodoActual = periodos.find(p => p.anio === anio && p.mes === mes)
  const faltaUtm = utmMes == null
  const hayRemanenteAnt = remanenteAntUtm > 0

  async function cerrarPeriodo() {
    if (faltaUtm) { alert('Antes de cerrar el período, cargá el valor de la UTM del mes para poder reajustar el remanente.'); return }
    if (!confirm(`¿Cerrar el período ${MESES[mes-1]} ${anio}? Se consolida la liquidación de IVA y el remanente queda fijado para el mes siguiente.`)) return
    await ((supabase.from('periodos_contables') as any)).upsert({
      anio, mes, estado: 'cerrado', fecha_cierre: new Date().toISOString().slice(0,10),
      debito_fiscal_clp: Math.round(debito),
      credito_mes_clp: Math.round(creditoMes),
      utm_clp: utmMes,
      remanente_ant_utm: remanenteAntUtm,
      remanente_ant_clp: Math.round(remanenteAntClp),
      iva_pagar_clp: Math.round(ivaPagar),
      remanente_periodo_clp: Math.round(remanentePeriodoClp),
      remanente_periodo_utm: remanentePeriodoUtm,
    }, { onConflict: 'anio,mes' })
    loadPeriodos()
  }

  if (permListos && !puede(permisos, 'iva', 'ver')) {
    return (
      <div className="p-6 bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-3">🔒</div>
          <h2 className="text-lg font-bold text-gray-700">Sin acceso</h2>
          <p className="text-sm text-gray-400 mt-1">No tenés permiso para ver esta sección. Si creés que es un error, contactá al administrador.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Libro IVA</h1>
          <p className="text-xs text-gray-400 mt-0.5">Registro SII Chile — Compras, ventas y liquidación mensual</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select value={mes} onChange={e => setMes(Number(e.target.value))} className="px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white">
            {MESES.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
          </select>
          <select value={anio} onChange={e => setAnio(Number(e.target.value))} className="px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white">
            {[2024,2025,2026,2027].map(a => <option key={a}>{a}</option>)}
          </select>
          {periodoActual?.estado === 'cerrado' ? (
            <span className="px-3 py-1.5 bg-red-50 text-red-700 rounded-xl text-xs font-semibold border border-red-100">Período cerrado</span>
          ) : (
            <button onClick={cerrarPeriodo} className="px-4 py-2 border border-orange-200 text-orange-700 rounded-xl text-xs font-semibold hover:bg-orange-50">Cerrar período</button>
          )}
        </div>
      </div>

      {/* UTM del mes */}
      <div className={`flex items-center gap-3 mb-4 px-4 py-2.5 rounded-xl border text-xs ${faltaUtm ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-100'}`}>
        <span className="font-semibold text-gray-600">UTM {MESES[mes-1]} {anio}:</span>
        {faltaUtm ? (
          <>
            <span className="text-amber-700">Sin cargar.</span>
            <input value={utmInput} onChange={e => setUtmInput(e.target.value)} placeholder="valor en $" className="px-2 py-1 border border-gray-200 rounded-lg text-xs w-32" inputMode="decimal" />
            <button onClick={guardarUtm} disabled={savingUtm} className="px-3 py-1 bg-[#1168F8] text-white rounded-lg text-[11px] font-semibold disabled:opacity-50">{savingUtm ? 'Guardando...' : 'Guardar'}</button>
            <span className="text-[10px] text-gray-400">El cron mensual la trae de mindicador.cl; podés cargarla a mano si falta.</span>
          </>
        ) : (
          <>
            <span className="font-mono font-bold text-[#052698]">$ {fmtN(utmMes!)}</span>
            <input value={utmInput} onChange={e => setUtmInput(e.target.value)} className="px-2 py-1 border border-gray-200 rounded-lg text-xs w-28" inputMode="decimal" />
            <button onClick={guardarUtm} disabled={savingUtm} className="px-3 py-1 border border-gray-200 text-gray-600 rounded-lg text-[11px] font-semibold hover:bg-gray-50 disabled:opacity-50">Corregir</button>
          </>
        )}
      </div>

      {/* Resumen del período */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <div className="text-[10px] font-semibold text-gray-400 uppercase mb-2">Débito fiscal (IVA ventas)</div>
          <div className="text-2xl font-bold text-gray-900 font-mono">$ {fmtN(debito)}</div>
          <div className="text-xs text-gray-400 mt-1">{ventas.length} facturas emitidas</div>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <div className="text-[10px] font-semibold text-gray-400 uppercase mb-2">Crédito fiscal total</div>
          <div className="text-2xl font-bold text-gray-900 font-mono">$ {fmtN(creditoTotal)}</div>
          <div className="text-xs text-gray-400 mt-1">{compras.length} compras{hayRemanenteAnt ? ` + remanente $ ${fmtN(remanenteAntClp)}` : ''}</div>
        </div>
        <div className={`border rounded-2xl p-4 shadow-sm ${posicion >= 0 ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
          <div className="text-[10px] font-semibold uppercase mb-2" style={{ color: posicion >= 0 ? '#991b1b' : '#166534' }}>
            {posicion >= 0 ? 'IVA a pagar SII' : 'Remanente crédito fiscal'}
          </div>
          <div className="text-2xl font-bold font-mono" style={{ color: posicion >= 0 ? '#991b1b' : '#166534' }}>
            $ {fmtN(Math.abs(posicion))}
          </div>
          <div className="text-xs mt-1" style={{ color: posicion >= 0 ? '#dc2626' : '#16a34a' }}>
            {posicion >= 0 ? 'Débito − Crédito (con remanente)' : `Se arrastra: ${fmtD(remanentePeriodoUtm)} UTM`}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {([['ventas','IVA Ventas'],['compras','IVA Compras'],['resumen','Resumen F29']] as [string,string][]).map(([k,l]) => (
          <button key={k} onClick={() => setTab(k as any)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${tab===k ? 'bg-[#1168F8] text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:border-[#1168F8] hover:text-[#1168F8]'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* Tab: Ventas */}
      {tab === 'ventas' && (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
          {loading ? <div className="p-12 text-center text-gray-400 text-sm">Cargando...</div> : (
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Fecha','Tipo doc.','Folio','Receptor','Neto CLP','IVA 19%','Total CLP','Estado'].map(h => (
                    <th key={h} className="text-left px-3 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ventas.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">Sin facturas emitidas en este período</td></tr>
                )}
                {ventas.map(r => (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-3 py-3 font-mono text-[11px]">{r.fecha_emision?.split('-').reverse().join('/')}</td>
                    <td className="px-3 py-3 capitalize">{r.tipo_doc?.replace('_',' ')}</td>
                    <td className="px-3 py-3 font-mono text-[#052698]">{r.folio||'—'}</td>
                    <td className="px-3 py-3 font-medium">{r.razon_social_receptor}</td>
                    <td className="px-3 py-3 text-right font-mono">$ {fmtN(r.neto_clp)}</td>
                    <td className="px-3 py-3 text-right font-mono text-orange-700">$ {fmtN(r.iva_clp)}</td>
                    <td className="px-3 py-3 text-right font-mono font-bold">$ {fmtN(r.total_clp)}</td>
                    <td className="px-3 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${r.estado==='emitida'?'bg-green-50 text-green-700':'bg-red-50 text-red-700'}`}>{r.estado}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-[#EBF2FF] border-t-2 border-[#1168F8]">
                  <td colSpan={4} className="px-3 py-3 text-xs font-bold text-[#052698]">TOTALES</td>
                  <td className="px-3 py-3 text-right font-mono font-bold text-[#052698]">$ {fmtN(totVentas.neto)}</td>
                  <td className="px-3 py-3 text-right font-mono font-bold text-orange-700">$ {fmtN(totVentas.iva)}</td>
                  <td className="px-3 py-3 text-right font-mono font-bold text-[#052698]">$ {fmtN(totVentas.total)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      {/* Tab: Compras */}
      {tab === 'compras' && (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
          {loading ? <div className="p-12 text-center text-gray-400 text-sm">Cargando...</div> : (
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Fecha','Tipo','Folio','Emisor','Neto CLP','IVA','Total CLP','Créd. fiscal','Estado'].map(h => (
                    <th key={h} className="text-left px-3 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {compras.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-400">Sin facturas recibidas en este período</td></tr>
                )}
                {compras.map(r => (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-3 py-3 font-mono text-[11px]">{r.fecha_emision?.split('-').reverse().join('/')}</td>
                    <td className="px-3 py-3 capitalize">{r.tipo_doc?.replace('_',' ')}</td>
                    <td className="px-3 py-3 font-mono text-[#052698]">{r.folio||'—'}</td>
                    <td className="px-3 py-3 font-medium">{r.razon_social_emisor}</td>
                    <td className="px-3 py-3 text-right font-mono">$ {fmtN(r.neto_clp)}</td>
                    <td className="px-3 py-3 text-right font-mono text-orange-700">$ {fmtN(r.iva_clp)}</td>
                    <td className="px-3 py-3 text-right font-mono font-bold">$ {fmtN(r.total_clp)}</td>
                    <td className="px-3 py-3 text-right font-mono text-green-700 font-semibold">$ {fmtN(r.credito_fiscal_clp)}</td>
                    <td className="px-3 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${r.afecta_cf?'bg-green-50 text-green-700':'bg-gray-100 text-gray-500'}`}>
                        {r.afecta_cf ? 'Con CF' : 'Sin CF'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-[#EBF2FF] border-t-2 border-[#1168F8]">
                  <td colSpan={4} className="px-3 py-3 text-xs font-bold text-[#052698]">TOTALES</td>
                  <td className="px-3 py-3 text-right font-mono font-bold text-[#052698]">$ {fmtN(totCompras.neto)}</td>
                  <td className="px-3 py-3 text-right font-mono font-bold text-orange-700">$ {fmtN(totCompras.iva)}</td>
                  <td className="px-3 py-3 text-right font-mono font-bold text-[#052698]">$ {fmtN(totCompras.total)}</td>
                  <td className="px-3 py-3 text-right font-mono font-bold text-green-700">$ {fmtN(totCompras.cf)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      {/* Tab: Resumen F29 */}
      {tab === 'resumen' && (
        <div className="max-w-xl space-y-4">
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
            <h3 className="font-bold text-sm text-gray-900 mb-4">Liquidación de IVA — {MESES[mes-1]} {anio}</h3>
            <div className="space-y-1">
              {[
                { label: 'Ventas netas del período', value: totVentas.neto, color: 'text-gray-800', strong: false },
                { label: 'Débito fiscal (IVA ventas 19%)', value: debito, color: 'text-orange-700', strong: true },
                { sep: true },
                { label: 'Compras netas del período', value: totCompras.neto, color: 'text-gray-800', strong: false },
                { label: 'Crédito fiscal del mes (IVA compras)', value: creditoMes, color: 'text-green-700', strong: false },
              ].map((row: any, i) => row.sep ? <div key={i} className="h-2"/> : (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50">
                  <span className="text-xs text-gray-600">{row.label}</span>
                  <span className={`font-mono text-sm ${row.strong ? 'font-bold' : 'font-semibold'} ${row.color}`}>$ {fmtN(row.value)}</span>
                </div>
              ))}

              {/* Remanente período anterior reajustado por UTM */}
              {hayRemanenteAnt && (
                <div className="mt-2 bg-blue-50 border border-blue-100 rounded-xl p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-blue-800">Remanente período anterior</span>
                    <span className="font-mono text-xs text-blue-800">{fmtD(remanenteAntUtm)} UTM</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-blue-700">Reajustado a UTM de {MESES[mes-1]} (${fmtN(utmMes||0)})</span>
                    <span className="font-mono text-sm font-bold text-blue-800">$ {fmtN(remanenteAntClp)}</span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between py-2 mt-1 border-t border-gray-100">
                <span className="text-xs font-semibold text-gray-700">Crédito fiscal total disponible</span>
                <span className="font-mono text-sm font-bold text-green-700">$ {fmtN(creditoTotal)}</span>
              </div>

              <div className={`flex items-center justify-between py-3 rounded-xl px-3 mt-2 ${posicion >= 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                <span className={`text-sm font-bold ${posicion >= 0 ? 'text-red-800' : 'text-green-800'}`}>
                  {posicion >= 0 ? 'IVA A PAGAR (línea 48 F29)' : 'REMANENTE CRÉDITO FISCAL'}
                </span>
                <span className={`font-mono text-xl font-bold ${posicion >= 0 ? 'text-red-700' : 'text-green-700'}`}>
                  $ {fmtN(Math.abs(posicion))}
                </span>
              </div>

              {posicion < 0 && (
                <div className="flex items-center justify-between px-3 text-[11px] text-green-700">
                  <span>Se arrastra al mes siguiente, reajustado por UTM</span>
                  <span className="font-mono font-semibold">{fmtD(remanentePeriodoUtm)} UTM</span>
                </div>
              )}
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-[11px] text-blue-700">
            💡 Liquidación informativa para control. El remanente de crédito fiscal se arrastra en UTM (Art. 27 DL 825) y se reajusta cada mes. Para la declaración oficial usá el F29 en el SII con los datos del período cerrado.
            {periodoActual?.estado === 'cerrado' && (
              <span className="ml-1 font-semibold">Período cerrado el {periodoActual.fecha_cierre?.split('-').reverse().join('/')}.</span>
            )}
            {faltaUtm && <span className="ml-1 font-semibold text-amber-700">Cargá la UTM del mes para calcular el reajuste.</span>}
          </div>
        </div>
      )}
    </div>
  )
}
