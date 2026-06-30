'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { cargarPermisos, puede, cuentasPermitidas } from '@/lib/permisos'

// ── Helpers ────────────────────────────────────────────────────────
const fmt = (n: number) => Math.round(n || 0).toLocaleString('es-CL')
function fmtMon(moneda: string, n: number) {
  const s = (moneda || '').toUpperCase() === 'USD' ? 'US$' : '$'
  return `${s} ${fmt(n)}`
}
function aUSD(monto: number, moneda: string, tc: { ARS: number; CLP: number }) {
  const m = (moneda || 'CLP').toUpperCase()
  if (m === 'USD') return monto
  if (m === 'ARS') return tc.ARS ? monto / tc.ARS : 0
  if (m === 'CLP') return tc.CLP ? monto / tc.CLP : 0
  return 0
}
function paisLabel(p: string) {
  if (p === 'AR' || p === 'Argentina') return 'Argentina'
  if (p === 'CL' || p === 'Chile') return 'Chile'
  return p || 'Sin país'
}
function paisKey(p: string) {
  if (p === 'AR' || p === 'Argentina') return 'AR'
  if (p === 'CL' || p === 'Chile') return 'CL'
  return p || 'ZZ'
}
function paisFlag(k: string) { return k === 'AR' ? '🇦🇷' : k === 'CL' ? '🇨🇱' : '🌐' }
function tipoLabel(t: string) {
  if (t === 'caja') return 'Cajas'
  if (t === 'banco') return 'Bancos'
  if (t === 'inversion') return 'Inversiones'
  return 'Otros'
}
function tipoIcon(t: string) { return t === 'banco' ? '🏦' : t === 'inversion' ? '📈' : '💵' }

// Saldo de una cuenta de custodia, calculado desde sus movimientos
function saldoCustodia(cuentaId: string, movs: any[]): number {
  return movs.reduce((s, m) => {
    if (m.cuenta_id === cuentaId && m.tipo !== 'transferencia') {
      return s + (m.tipo === 'ingreso_cliente' ? Number(m.monto || 0) : -Number(m.monto || 0))
    }
    if (m.tipo === 'transferencia') {
      if (m.cuenta_id === cuentaId) return s - Number(m.monto || 0)
      if (m.cuenta_destino_id === cuentaId) return s + Number(m.monto || 0)
    }
    return s
  }, 0)
}

const TIPO_MOV_LABEL: Record<string, string> = {
  transferencia_out: 'Transferencia (salida)', transferencia_in: 'Transferencia (entrada)',
  ingreso_cliente: 'Ingreso de cliente', pago_proveedor: 'Pago a proveedor',
  transferencia: 'Transferencia', honorarios_puertonoa: 'Honorarios Puerto NOA',
  devolucion_cliente: 'Devolución a cliente',
}

export default function CuentasCajaBancosPage() {
  const supabase = createClient()
  const [permisos, setPermisos] = useState<Record<string, string[]>>({})
  const [permListos, setPermListos] = useState(false)
  const [loading, setLoading] = useState(true)

  const [cuentas, setCuentas] = useState<any[]>([])       // combinadas (propia + custodia) con saldo
  const [fondosMovs, setFondosMovs] = useState<any[]>([]) // movimientos de custodia (para saldos)
  const [tc, setTc] = useState<{ ARS: number; CLP: number }>({ ARS: 1450, CLP: 910 })

  const [agrup, setAgrup] = useState<'pais_tipo' | 'tipo_pais'>('pais_tipo')

  // Estado de cuenta (detalle)
  const [cuentaSel, setCuentaSel] = useState<any>(null)
  const [movsCuenta, setMovsCuenta] = useState<any[]>([])
  const [cargandoMovs, setCargandoMovs] = useState(false)

  useEffect(() => { loadData(); cargarPermisos().then(p => { setPermisos(p); setPermListos(true) }) }, [])

  async function loadData() {
    setLoading(true)
    const [cpRes, fcRes, fmRes, tceRes] = await Promise.all([
      (supabase.from('cuentas_pn') as any).select('id,nombre,tipo,pais,moneda,saldo_actual,numero_interno').eq('activo', true).order('nombre'),
      (supabase.from('fondos_cuentas') as any).select('id,nombre,tipo,pais,moneda,numero_interno').eq('activo', true).order('nombre'),
      (supabase.from('fondos_movimientos') as any).select('cuenta_id,cuenta_destino_id,tipo,monto'),
      (supabase.from('tipos_cambio_eventos') as any).select('ars,clp').order('created_at', { ascending: false }).limit(1),
    ])
    const fm = fmRes.data || []
    setFondosMovs(fm)
    if (tceRes.data?.[0]) setTc({ ARS: Number(tceRes.data[0].ars) || 1450, CLP: Number(tceRes.data[0].clp) || 910 })

    const propias = (cpRes.data || []).map((c: any) => ({ ...c, ambito: 'propia', saldo: Number(c.saldo_actual) || 0 }))
    const custodia = (fcRes.data || []).map((c: any) => ({ ...c, ambito: 'custodia', saldo: saldoCustodia(c.id, fm) }))
    setCuentas([...propias, ...custodia])
    setLoading(false)
  }

  // Solo las cuentas que el rol puede ver (P-25)
  const visibles = useMemo(() => cuentasPermitidas(permisos, cuentas, 'ver'), [permisos, cuentas])

  const totalUSD = useMemo(() => visibles.reduce((s, c) => s + aUSD(c.saldo, c.moneda, tc), 0), [visibles, tc])

  // Agrupación en dos niveles según el modo elegido
  const grupos = useMemo(() => {
    const nivel1 = (c: any) => agrup === 'pais_tipo' ? paisKey(c.pais) : c.tipo
    const nivel2 = (c: any) => agrup === 'pais_tipo' ? c.tipo : paisKey(c.pais)
    const lbl1 = (k: string) => agrup === 'pais_tipo' ? `${paisFlag(k)} ${paisLabel(k)}` : tipoLabel(k)
    const lbl2 = (k: string) => agrup === 'pais_tipo' ? tipoLabel(k) : `${paisFlag(k)} ${paisLabel(k)}`
    const ordenTipo: Record<string, number> = { caja: 0, banco: 1, inversion: 2, otro: 3 }
    const ord1 = (k: string) => agrup === 'pais_tipo' ? (k === 'AR' ? 0 : k === 'CL' ? 1 : 2) : (ordenTipo[k] ?? 9)
    const ord2 = (k: string) => agrup === 'pais_tipo' ? (ordenTipo[k] ?? 9) : (k === 'AR' ? 0 : k === 'CL' ? 1 : 2)

    const map = new Map<string, Map<string, any[]>>()
    for (const c of visibles) {
      const k1 = nivel1(c), k2 = nivel2(c)
      if (!map.has(k1)) map.set(k1, new Map())
      const sub = map.get(k1)!
      if (!sub.has(k2)) sub.set(k2, [])
      sub.get(k2)!.push(c)
    }
    return Array.from(map.entries())
      .sort((a, b) => ord1(a[0]) - ord1(b[0]))
      .map(([k1, sub]) => {
        // subtotal por moneda del grupo de nivel 1
        const porMoneda = new Map<string, number>()
        Array.from(sub.values()).forEach(arr => arr.forEach((c: any) => porMoneda.set(c.moneda, (porMoneda.get(c.moneda) || 0) + c.saldo)))
        return {
          k1, lbl1: lbl1(k1),
          subtotales: Array.from(porMoneda.entries()),
          subgrupos: Array.from(sub.entries()).sort((a, b) => ord2(a[0]) - ord2(b[0])).map(([k2, arr]) => ({ k2, lbl2: lbl2(k2), cuentas: arr })),
        }
      })
  }, [visibles, agrup])

  async function abrirCuenta(c: any) {
    setCuentaSel(c)
    setCargandoMovs(true)
    setMovsCuenta([])
    if (c.ambito === 'propia') {
      const { data } = await (supabase.from('movimientos_cuentas_pn') as any)
        .select('id,fecha,tipo,concepto,monto,moneda,saldo_posterior,numero_comprobante,referencia')
        .eq('cuenta_id', c.id).order('fecha', { ascending: false }).order('created_at', { ascending: false })
      setMovsCuenta((data || []).map((m: any) => ({
        ...m, signo: m.tipo === 'transferencia_in' ? 1 : -1, saldo: m.saldo_posterior,
      })))
    } else {
      const { data } = await (supabase.from('fondos_movimientos') as any)
        .select('id,fecha,tipo,concepto,monto,moneda,cuenta_id,cuenta_destino_id,numero_comprobante,nro_referencia')
        .or(`cuenta_id.eq.${c.id},cuenta_destino_id.eq.${c.id}`).order('fecha', { ascending: true }).order('created_at', { ascending: true })
      // saldo corriente acumulado
      let acum = 0
      const conSaldo = (data || []).map((m: any) => {
        let signo = 0
        if (m.tipo === 'transferencia') signo = m.cuenta_destino_id === c.id ? 1 : -1
        else signo = m.tipo === 'ingreso_cliente' ? 1 : -1
        acum += signo * Number(m.monto || 0)
        return { ...m, signo, saldo: acum, referencia: m.nro_referencia }
      })
      conSaldo.reverse()
      setMovsCuenta(conSaldo)
    }
    setCargandoMovs(false)
  }

  if (permListos && !puede(permisos, 'cuentas_cajas_bancos', 'ver')) {
    return (<div className="p-6 bg-gray-50 min-h-screen flex items-center justify-center"><div className="text-center max-w-sm"><div className="text-5xl mb-3">🔒</div><h2 className="text-lg font-bold text-gray-700">Sin acceso</h2><p className="text-sm text-gray-400 mt-1">No tenés permiso para ver las cuentas.</p></div></div>)
  }
  if (loading) return (<div className="p-8 text-center text-gray-400"><div className="w-8 h-8 border-2 border-[#1168F8] border-t-transparent rounded-full animate-spin mx-auto mb-3" />Cargando cuentas...</div>)

  // ── DETALLE: estado de cuenta ─────────────────────────────────────
  if (cuentaSel) {
    return (
      <div className="p-6 bg-gray-50 min-h-screen">
        <button onClick={() => { setCuentaSel(null); setMovsCuenta([]) }} className="text-xs text-[#1168F8] hover:underline mb-3">← Volver a cuentas</button>
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm mb-4">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-gray-900">{cuentaSel.nombre}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${cuentaSel.ambito === 'propia' ? 'bg-blue-50 text-blue-600' : 'bg-violet-50 text-violet-600'}`}>{cuentaSel.ambito === 'propia' ? 'Propia' : 'Custodia'}</span>
              </div>
              <div className="text-xs text-gray-400 mt-0.5">{[cuentaSel.numero_interno, tipoIcon(cuentaSel.tipo) + ' ' + tipoLabel(cuentaSel.tipo).replace(/s$/, ''), cuentaSel.moneda, paisLabel(cuentaSel.pais)].filter(Boolean).join(' · ')}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-gray-400 uppercase tracking-wider">Saldo actual</div>
              <div className={`text-2xl font-black font-mono ${cuentaSel.saldo < 0 ? 'text-red-500' : 'text-gray-900'}`}>{fmtMon(cuentaSel.moneda, cuentaSel.saldo)}</div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <span className="font-semibold text-sm text-gray-900">Estado de cuenta · movimientos</span>
            <span className="text-[11px] text-gray-400">{movsCuenta.length} movimiento(s)</span>
          </div>
          {cargandoMovs ? (
            <div className="px-5 py-8 text-center text-xs text-gray-400">Cargando movimientos...</div>
          ) : movsCuenta.length === 0 ? (
            <div className="px-5 py-8 text-center text-xs text-gray-400">Esta cuenta todavía no tiene movimientos.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {['Fecha', 'Comprobante', 'Tipo', 'Concepto', 'Ingreso', 'Egreso', 'Saldo'].map(h => (
                      <th key={h} className={`px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider ${['Ingreso', 'Egreso', 'Saldo'].includes(h) ? 'text-right' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {movsCuenta.map((m: any) => (
                    <tr key={m.id} className="border-b border-gray-50 hover:bg-blue-50/20">
                      <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{String(m.fecha).split('-').reverse().join('/')}</td>
                      <td className="px-4 py-2.5 text-gray-400">{m.numero_comprobante || m.referencia || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-500">{TIPO_MOV_LABEL[m.tipo] || m.tipo}</td>
                      <td className="px-4 py-2.5 text-gray-700">{m.concepto || '—'}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-green-600">{m.signo > 0 ? fmt(Number(m.monto)) : ''}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-red-500">{m.signo < 0 ? fmt(Number(m.monto)) : ''}</td>
                      <td className={`px-4 py-2.5 text-right font-mono font-bold ${Number(m.saldo) < 0 ? 'text-red-500' : 'text-gray-800'}`}>{m.saldo != null ? fmt(Number(m.saldo)) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── LISTA: saldos agrupados ───────────────────────────────────────
  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="mb-5 flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-[11px] font-bold text-[#1168F8]/60 uppercase tracking-widest mb-1">Tesorería</div>
          <h1 className="text-2xl font-bold text-gray-900">Cuentas (caja y bancos)</h1>
          <p className="text-xs text-gray-400 mt-1">Saldos de todas las cuentas · propias y en custodia</p>
        </div>
        <div className="inline-flex border border-gray-200 rounded-xl overflow-hidden text-xs">
          <button onClick={() => setAgrup('pais_tipo')} className={`px-3 py-2 ${agrup === 'pais_tipo' ? 'bg-[#1168F8] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>País › tipo</button>
          <button onClick={() => setAgrup('tipo_pais')} className={`px-3 py-2 ${agrup === 'tipo_pais' ? 'bg-[#1168F8] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>Tipo › país</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <div className="bg-[#052698] rounded-2xl p-4 text-white">
          <div className="text-[10px] font-bold text-blue-300 uppercase tracking-widest mb-1">Consolidado (ref. USD)</div>
          <div className="text-2xl font-black font-mono">US$ {fmt(totalUSD)}</div>
          <div className="text-[10px] text-blue-300 mt-1">A TC del día · ARS {fmt(tc.ARS)} · CLP {fmt(tc.CLP)}</div>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Cuentas activas</div>
          <div className="text-2xl font-black text-gray-900">{visibles.length}</div>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Propias / custodia</div>
          <div className="text-2xl font-black text-gray-900">{visibles.filter(c => c.ambito === 'propia').length} / {visibles.filter(c => c.ambito === 'custodia').length}</div>
        </div>
      </div>

      {visibles.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl px-5 py-10 text-center text-sm text-gray-400">
          No hay cuentas para mostrar. {cuentas.length > 0 ? 'Tu rol no tiene permiso para ver ninguna cuenta (pedí acceso en Roles).' : 'Cargá cuentas en Catálogos → Cuentas (caja y bancos).'}
        </div>
      ) : (
        <div className="space-y-5">
          {grupos.map(g => (
            <div key={g.k1} className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
                <span className="font-bold text-sm text-gray-900">{g.lbl1}</span>
                <div className="flex items-center gap-3 flex-wrap">
                  {g.subtotales.map(([mon, tot]) => (
                    <span key={mon} className="text-[11px] text-gray-500">{mon} <span className="font-mono font-bold text-gray-800">{fmt(tot)}</span></span>
                  ))}
                </div>
              </div>
              <div className="px-3 py-2">
                {g.subgrupos.map(sg => (
                  <div key={sg.k2} className="mb-2 last:mb-0">
                    <div className="text-[10px] text-gray-400 uppercase tracking-wider px-2 py-1">{sg.lbl2}</div>
                    {sg.cuentas.map((c: any) => (
                      <button key={c.id} onClick={() => abrirCuenta(c)} className="w-full flex items-center justify-between px-2 py-2.5 rounded-xl hover:bg-blue-50/40 text-left transition-colors group">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-base">{tipoIcon(c.tipo)}</span>
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-800 truncate">{c.nombre}
                              <span className={`ml-2 text-[9px] px-1.5 py-0.5 rounded-full ${c.ambito === 'propia' ? 'bg-blue-50 text-blue-600' : 'bg-violet-50 text-violet-600'}`}>{c.ambito === 'propia' ? 'propia' : 'custodia'}</span>
                            </div>
                            <div className="text-[10px] text-gray-400">{[c.numero_interno, c.moneda].filter(Boolean).join(' · ')}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className={`font-mono text-sm font-bold ${c.saldo < 0 ? 'text-red-500' : 'text-gray-900'}`}>{fmtMon(c.moneda, c.saldo)}</span>
                          <span className="text-gray-300 group-hover:text-[#1168F8] text-sm">→</span>
                        </div>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
