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
  if (p === 'US' || p === 'Estados Unidos' || p === 'EEUU') return 'Estados Unidos'
  return p || 'Sin país'
}
function paisKey(p: string) {
  if (p === 'AR' || p === 'Argentina') return 'AR'
  if (p === 'CL' || p === 'Chile') return 'CL'
  if (p === 'US' || p === 'Estados Unidos' || p === 'EEUU') return 'US'
  return p || 'ZZ'
}
function paisFlag(k: string) { return k === 'AR' ? '🇦🇷' : k === 'CL' ? '🇨🇱' : k === 'US' ? '🇺🇸' : '🌐' }
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
  const [fDesde, setFDesde] = useState('')
  const [fHasta, setFHasta] = useState('')
  const [fTipo, setFTipo] = useState<'todos' | 'ingresos' | 'egresos'>('todos')

  // Conciliación (persistente)
  const [conciliaciones, setConciliaciones] = useState<any[]>([])
  const [conciliarGrupo, setConciliarGrupo] = useState<any>(null)
  const [cFecha, setCFecha] = useState('')
  const [cExtracto, setCExtracto] = useState('')
  const [cNotas, setCNotas] = useState('')
  const [cSaving, setCSaving] = useState(false)

  useEffect(() => { loadData(); cargarPermisos().then(p => { setPermisos(p); setPermListos(true) }) }, [])

  async function loadData() {
    setLoading(true)
    const [cpRes, fcRes, fmRes, tceRes, ccRes] = await Promise.all([
      (supabase.from('cuentas_pn') as any).select('id,nombre,tipo,pais,moneda,saldo_actual,numero_interno,grupo_id').eq('activo', true).order('nombre'),
      (supabase.from('fondos_cuentas') as any).select('id,nombre,tipo,pais,moneda,numero_interno,grupo_id').eq('activo', true).order('nombre'),
      (supabase.from('fondos_movimientos') as any).select('cuenta_id,cuenta_destino_id,tipo,monto'),
      (supabase.from('tipos_cambio_eventos') as any).select('ars,clp').order('created_at', { ascending: false }).limit(1),
      (supabase.from('conciliaciones_cuenta') as any).select('*').order('fecha', { ascending: false }).order('created_at', { ascending: false }),
    ])
    const fm = fmRes.data || []
    setFondosMovs(fm)
    if (tceRes.data?.[0]) setTc({ ARS: Number(tceRes.data[0].ars) || 1450, CLP: Number(tceRes.data[0].clp) || 910 })
    setConciliaciones(ccRes.data || [])

    const propias = (cpRes.data || []).map((c: any) => ({ ...c, ambito: 'propia', saldo: Number(c.saldo_actual) || 0 }))
    const custodia = (fcRes.data || []).map((c: any) => ({ ...c, ambito: 'custodia', saldo: saldoCustodia(c.id, fm) }))
    setCuentas([...propias, ...custodia])
    setLoading(false)
  }

  // Solo las cuentas que el rol puede ver (P-25)
  const visibles = useMemo(() => cuentasPermitidas(permisos, cuentas, 'ver'), [permisos, cuentas])

  const totalUSD = useMemo(() => visibles.reduce((s, c) => s + aUSD(c.saldo, c.moneda, tc), 0), [visibles, tc])
  const pConciliar = puede(permisos, 'cuentas_cajas_bancos', 'conciliar')

  // Carriles agrupados por cuenta física (grupo_id): propio + terceros = total
  const fisicas = useMemo(() => {
    const map = new Map<string, any>()
    for (const c of visibles) {
      const g = map.get(c.grupo_id) || { grupo_id: c.grupo_id, propia: null, terceros: null }
      if (c.ambito === 'propia') g.propia = c; else g.terceros = c
      map.set(c.grupo_id, g)
    }
    return Array.from(map.values()).map((g: any) => {
      const base = g.propia || g.terceros
      const saldoPropio = g.propia ? g.propia.saldo : 0
      const saldoTerceros = g.terceros ? g.terceros.saldo : 0
      const uso = g.propia && g.terceros ? 'mixta' : g.propia ? 'propia' : 'terceros'
      const hist = conciliaciones.filter((x: any) => x.grupo_id === g.grupo_id)
      return { ...g, base, saldoPropio, saldoTerceros, saldoTotal: saldoPropio + saldoTerceros, uso, ultimaConc: hist[0] || null }
    })
  }, [visibles, conciliaciones])

  // Agrupación en dos niveles (país/tipo) sobre cuentas físicas
  const grupos = useMemo(() => {
    const nivel1 = (f: any) => agrup === 'pais_tipo' ? paisKey(f.base.pais) : f.base.tipo
    const nivel2 = (f: any) => agrup === 'pais_tipo' ? f.base.tipo : paisKey(f.base.pais)
    const lbl1 = (k: string) => agrup === 'pais_tipo' ? `${paisFlag(k)} ${paisLabel(k)}` : tipoLabel(k)
    const lbl2 = (k: string) => agrup === 'pais_tipo' ? tipoLabel(k) : `${paisFlag(k)} ${paisLabel(k)}`
    const ordenTipo: Record<string, number> = { caja: 0, banco: 1, inversion: 2, otro: 3 }
    const ord1 = (k: string) => agrup === 'pais_tipo' ? (k === 'AR' ? 0 : k === 'CL' ? 1 : 2) : (ordenTipo[k] ?? 9)
    const ord2 = (k: string) => agrup === 'pais_tipo' ? (ordenTipo[k] ?? 9) : (k === 'AR' ? 0 : k === 'CL' ? 1 : 2)

    const map = new Map<string, Map<string, any[]>>()
    for (const f of fisicas) {
      const k1 = nivel1(f), k2 = nivel2(f)
      if (!map.has(k1)) map.set(k1, new Map())
      const sub = map.get(k1)!
      if (!sub.has(k2)) sub.set(k2, [])
      sub.get(k2)!.push(f)
    }
    return Array.from(map.entries())
      .sort((a, b) => ord1(a[0]) - ord1(b[0]))
      .map(([k1, sub]) => {
        const porMoneda = new Map<string, number>()
        Array.from(sub.values()).forEach(arr => arr.forEach((f: any) => porMoneda.set(f.base.moneda, (porMoneda.get(f.base.moneda) || 0) + f.saldoTotal)))
        return {
          k1, lbl1: lbl1(k1),
          subtotales: Array.from(porMoneda.entries()),
          subgrupos: Array.from(sub.entries()).sort((a, b) => ord2(a[0]) - ord2(b[0])).map(([k2, arr]) => ({ k2, lbl2: lbl2(k2), fisicas: arr })),
        }
      })
  }, [fisicas, agrup])

  // Estado de cuenta: el rango de fechas manda el resumen; el tipo solo filtra la lista
  const enRango = useMemo(() => movsCuenta.filter((m: any) => {
    const f = String(m.fecha).slice(0, 10)
    if (fDesde && f < fDesde) return false
    if (fHasta && f > fHasta) return false
    return true
  }), [movsCuenta, fDesde, fHasta])

  const resumen = useMemo(() => {
    const ingresos = enRango.filter((m: any) => m.signo > 0).reduce((a: number, m: any) => a + Number(m.monto || 0), 0)
    const egresos = enRango.filter((m: any) => m.signo < 0).reduce((a: number, m: any) => a + Number(m.monto || 0), 0)
    const saldoFinal = enRango.length ? Number(enRango[0].saldo) : (cuentaSel ? Number(cuentaSel.saldo) : 0)
    const masAntiguo: any = enRango[enRango.length - 1]
    const saldoInicial = masAntiguo ? Number(masAntiguo.saldo) - masAntiguo.signo * Number(masAntiguo.monto || 0) : saldoFinal
    return { ingresos, egresos, saldoInicial, saldoFinal }
  }, [enRango, cuentaSel])

  const filtrados = useMemo(() => {
    if (fTipo === 'ingresos') return enRango.filter((m: any) => m.signo > 0)
    if (fTipo === 'egresos') return enRango.filter((m: any) => m.signo < 0)
    return enRango
  }, [enRango, fTipo])

  function exportarCSV() {
    if (!cuentaSel) return
    const sep = ';'
    const d = (f: string) => f ? String(f).slice(0, 10).split('-').reverse().join('/') : ''
    const meta = [
      [`Estado de cuenta: ${cuentaSel.nombre}`],
      [[cuentaSel.numero_interno, cuentaSel.moneda, paisLabel(cuentaSel.pais)].filter(Boolean).join(' · ')],
      [`Periodo: ${fDesde ? d(fDesde) : 'inicio'} a ${fHasta ? d(fHasta) : 'hoy'}`],
      [`Saldo inicial${sep}${Math.round(resumen.saldoInicial)}`],
      [`Ingresos${sep}${Math.round(resumen.ingresos)}`],
      [`Egresos${sep}${Math.round(resumen.egresos)}`],
      [`Saldo final${sep}${Math.round(resumen.saldoFinal)}`],
      [''],
    ]
    const cab = ['Fecha', 'Comprobante', 'Tipo', 'Concepto', 'Ingreso', 'Egreso', 'Saldo']
    const filas = filtrados.map((m: any) => [
      d(m.fecha),
      m.numero_comprobante || m.referencia || '',
      TIPO_MOV_LABEL[m.tipo] || m.tipo,
      String(m.concepto || '').replace(/[\r\n;]/g, ' '),
      m.signo > 0 ? Math.round(Number(m.monto || 0)) : '',
      m.signo < 0 ? Math.round(Number(m.monto || 0)) : '',
      m.saldo != null ? Math.round(Number(m.saldo)) : '',
    ])
    const cuerpo = [...meta, cab, ...filas].map(r => r.join(sep)).join('\r\n')
    const blob = new Blob(['\uFEFF' + cuerpo], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `estado-cuenta-${String(cuentaSel.nombre || 'cuenta').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function abrirCuenta(c: any) {
    setCuentaSel(c)
    setCargandoMovs(true)
    setMovsCuenta([])
    setFDesde(''); setFHasta(''); setFTipo('todos')
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

  function abrirConciliar(f: any) {
    setConciliarGrupo(f)
    setCFecha(new Date().toISOString().slice(0, 10))
    setCExtracto(''); setCNotas('')
  }

  async function guardarConciliacion() {
    if (!conciliarGrupo || !pConciliar) return
    const ext = Number(cExtracto)
    if (!cFecha || cExtracto === '' || isNaN(ext)) { alert('Ingresá la fecha y el saldo del extracto.'); return }
    setCSaving(true)
    const f = conciliarGrupo
    const dif = ext - f.saldoTotal
    await (supabase.from('conciliaciones_cuenta') as any).insert({
      grupo_id: f.grupo_id, fecha: cFecha, moneda: f.base.moneda,
      saldo_propio: f.saldoPropio, saldo_terceros: f.saldoTerceros, saldo_sistema: f.saldoTotal,
      saldo_extracto: ext, diferencia: dif, conciliado: Math.abs(dif) < 0.005, notas: cNotas || null,
    })
    const { data } = await (supabase.from('conciliaciones_cuenta') as any).select('*').order('fecha', { ascending: false }).order('created_at', { ascending: false })
    setConciliaciones(data || [])
    setCExtracto(''); setCNotas(''); setCSaving(false)
  }

  async function borrarConciliacion(id: string) {
    if (!pConciliar) return
    if (!confirm('¿Eliminar este cierre de conciliación?')) return
    await supabase.from('conciliaciones_cuenta').delete().eq('id', id)
    setConciliaciones(prev => prev.filter((x: any) => x.id !== id))
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

        {/* Filtros + exportación */}
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm mb-4">
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Desde</label>
              <input type="date" value={fDesde} onChange={e => setFDesde(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8]" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Hasta</label>
              <input type="date" value={fHasta} onChange={e => setFHasta(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8]" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Tipo</label>
              <div className="inline-flex border border-gray-200 rounded-xl overflow-hidden text-xs">
                {([['todos', 'Todos'], ['ingresos', 'Ingresos'], ['egresos', 'Egresos']] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setFTipo(k)} className={`px-3 py-2 ${fTipo === k ? 'bg-[#1168F8] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>{l}</button>
                ))}
              </div>
            </div>
            {(fDesde || fHasta || fTipo !== 'todos') && (
              <button onClick={() => { setFDesde(''); setFHasta(''); setFTipo('todos') }} className="px-3 py-2 text-xs text-gray-500 hover:text-gray-700 hover:underline">Limpiar</button>
            )}
            <div className="ml-auto">
              <button onClick={exportarCSV} disabled={filtrados.length === 0} className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#0a9e6e] text-white hover:bg-[#08815a] disabled:opacity-40 disabled:cursor-not-allowed">⬇ Exportar a Excel</button>
            </div>
          </div>
        </div>

        {/* Resumen del período */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <div className="text-[10px] text-gray-400 uppercase tracking-wider">Saldo inicial</div>
            <div className={`text-lg font-black font-mono mt-1 ${resumen.saldoInicial < 0 ? 'text-red-500' : 'text-gray-700'}`}>{fmtMon(cuentaSel.moneda, resumen.saldoInicial)}</div>
          </div>
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <div className="text-[10px] text-gray-400 uppercase tracking-wider">Ingresos del período</div>
            <div className="text-lg font-black font-mono text-green-600 mt-1">{fmtMon(cuentaSel.moneda, resumen.ingresos)}</div>
          </div>
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <div className="text-[10px] text-gray-400 uppercase tracking-wider">Egresos del período</div>
            <div className="text-lg font-black font-mono text-red-500 mt-1">{fmtMon(cuentaSel.moneda, resumen.egresos)}</div>
          </div>
          <div className="bg-[#052698] rounded-2xl p-4 text-white shadow-sm">
            <div className="text-[10px] text-white/60 uppercase tracking-wider">Saldo final</div>
            <div className="text-lg font-black font-mono mt-1">{fmtMon(cuentaSel.moneda, resumen.saldoFinal)}</div>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <span className="font-semibold text-sm text-gray-900">Movimientos</span>
            <span className="text-[11px] text-gray-400">{filtrados.length === movsCuenta.length ? `${movsCuenta.length} movimiento(s)` : `${filtrados.length} de ${movsCuenta.length}`}</span>
          </div>
          {cargandoMovs ? (
            <div className="px-5 py-8 text-center text-xs text-gray-400">Cargando movimientos...</div>
          ) : filtrados.length === 0 ? (
            <div className="px-5 py-8 text-center text-xs text-gray-400">{movsCuenta.length === 0 ? 'Esta cuenta todavía no tiene movimientos.' : 'No hay movimientos para los filtros elegidos.'}</div>
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
                  {filtrados.map((m: any) => (
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
          <div className="text-2xl font-black text-gray-900">{fisicas.length}</div>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Cuentas mixtas</div>
          <div className="text-2xl font-black text-gray-900">{fisicas.filter(f => f.uso === 'mixta').length}<span className="text-sm text-gray-300 font-bold"> / {fisicas.length}</span></div>
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
                    {sg.fisicas.map((f: any) => {
                      const conc = f.ultimaConc
                      const chip = conc == null
                        ? <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400">sin conciliar</span>
                        : conc.conciliado
                          ? <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-600">✓ conciliada {String(conc.fecha).split('-').reverse().join('/')}</span>
                          : <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600">⚠ dif {fmtMon(f.base.moneda, Number(conc.diferencia))}</span>
                      if (f.uso !== 'mixta') {
                        const carril = f.propia || f.terceros
                        return (
                          <div key={f.grupo_id} className="flex items-center justify-between px-2 py-2.5 rounded-xl hover:bg-blue-50/40 group">
                            <button onClick={() => abrirCuenta(carril)} className="flex items-center gap-2 min-w-0 text-left flex-1">
                              <span className="text-base">{tipoIcon(f.base.tipo)}</span>
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-gray-800 truncate">{f.base.nombre}
                                  <span className={`ml-2 text-[9px] px-1.5 py-0.5 rounded-full ${f.uso === 'propia' ? 'bg-teal-50 text-teal-600' : 'bg-orange-50 text-orange-600'}`}>{f.uso === 'propia' ? 'propia' : 'terceros'}</span>
                                </div>
                                <div className="text-[10px] text-gray-400 flex items-center gap-2">{[f.base.numero_interno, f.base.moneda].filter(Boolean).join(' · ')} {chip}</div>
                              </div>
                            </button>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className={`font-mono text-sm font-bold ${f.saldoTotal < 0 ? 'text-red-500' : 'text-gray-900'}`}>{fmtMon(f.base.moneda, f.saldoTotal)}</span>
                              {pConciliar && <button onClick={() => abrirConciliar(f)} className="text-[10px] px-2 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-[#1168F8] hover:text-[#1168F8]">Conciliar</button>}
                              <button onClick={() => abrirCuenta(carril)} className="text-gray-300 group-hover:text-[#1168F8] text-sm">→</button>
                            </div>
                          </div>
                        )
                      }
                      return (
                        <div key={f.grupo_id} className="rounded-xl border border-violet-100 bg-violet-50/20 mb-1.5 overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-2 bg-violet-50/40">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-base">{tipoIcon(f.base.tipo)}</span>
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-gray-800 truncate">{f.base.nombre}
                                  <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700">mixta</span>
                                </div>
                                <div className="text-[10px] text-gray-400 flex items-center gap-2">{[f.base.numero_interno, f.base.moneda].filter(Boolean).join(' · ')} {chip}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <div className="text-right">
                                <div className="text-[9px] text-gray-400 uppercase">Total</div>
                                <div className={`font-mono text-sm font-black ${f.saldoTotal < 0 ? 'text-red-500' : 'text-gray-900'}`}>{fmtMon(f.base.moneda, f.saldoTotal)}</div>
                              </div>
                              {pConciliar && <button onClick={() => abrirConciliar(f)} className="text-[10px] px-2 py-1 rounded-lg border border-violet-200 text-violet-600 hover:bg-violet-100">Conciliar</button>}
                            </div>
                          </div>
                          <button onClick={() => abrirCuenta(f.propia)} className="w-full flex items-center justify-between px-3 py-2 hover:bg-blue-50/40 group border-t border-violet-100/60">
                            <span className="text-xs text-gray-600 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-teal-400" />Propio</span>
                            <span className="flex items-center gap-2"><span className={`font-mono text-xs font-bold ${f.saldoPropio < 0 ? 'text-red-500' : 'text-gray-800'}`}>{fmtMon(f.base.moneda, f.saldoPropio)}</span><span className="text-gray-300 group-hover:text-[#1168F8]">→</span></span>
                          </button>
                          <button onClick={() => abrirCuenta(f.terceros)} className="w-full flex items-center justify-between px-3 py-2 hover:bg-blue-50/40 group border-t border-violet-100/60">
                            <span className="text-xs text-gray-600 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-orange-400" />Terceros (a rendir)</span>
                            <span className="flex items-center gap-2"><span className={`font-mono text-xs font-bold ${f.saldoTerceros < 0 ? 'text-red-500' : 'text-gray-800'}`}>{fmtMon(f.base.moneda, f.saldoTerceros)}</span><span className="text-gray-300 group-hover:text-[#1168F8]">→</span></span>
                          </button>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {conciliarGrupo && (
        <div className="fixed inset-0 bg-black/40 flex items-start md:items-center justify-center z-50 p-4 overflow-y-auto" onClick={() => setConciliarGrupo(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-8" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between">
              <div>
                <div className="text-[11px] font-bold text-[#1168F8]/60 uppercase tracking-widest">Conciliación con extracto</div>
                <div className="font-bold text-gray-900">{conciliarGrupo.base.nombre}</div>
                <div className="text-[11px] text-gray-400">{[conciliarGrupo.base.numero_interno, conciliarGrupo.base.moneda].filter(Boolean).join(' · ')}</div>
              </div>
              <button onClick={() => setConciliarGrupo(null)} className="text-gray-300 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-teal-50 rounded-xl p-3"><div className="text-[9px] text-teal-600 uppercase tracking-wide">Propio</div><div className="font-mono text-sm font-bold text-teal-700">{fmtMon(conciliarGrupo.base.moneda, conciliarGrupo.saldoPropio)}</div></div>
                <div className="bg-orange-50 rounded-xl p-3"><div className="text-[9px] text-orange-600 uppercase tracking-wide">Terceros</div><div className="font-mono text-sm font-bold text-orange-700">{fmtMon(conciliarGrupo.base.moneda, conciliarGrupo.saldoTerceros)}</div></div>
                <div className="bg-[#052698] rounded-xl p-3 text-white"><div className="text-[9px] text-blue-200 uppercase tracking-wide">Total sistema</div><div className="font-mono text-sm font-black">{fmtMon(conciliarGrupo.base.moneda, conciliarGrupo.saldoTotal)}</div></div>
              </div>

              {pConciliar ? (<>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Fecha del extracto</label>
                    <input type="date" value={cFecha} onChange={e => setCFecha(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8]" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Saldo del extracto</label>
                    <input type="number" step="any" value={cExtracto} onChange={e => setCExtracto(e.target.value)} placeholder="0" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] font-mono" />
                  </div>
                </div>
                {cExtracto !== '' && !isNaN(Number(cExtracto)) && (() => {
                  const dif = Number(cExtracto) - conciliarGrupo.saldoTotal
                  const ok = Math.abs(dif) < 0.005
                  return <div className={`rounded-xl px-4 py-2.5 text-sm font-semibold flex items-center justify-between ${ok ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}><span>{ok ? '✓ Cuadra con el sistema' : '⚠ Diferencia contra el sistema'}</span><span className="font-mono font-bold">{fmtMon(conciliarGrupo.base.moneda, dif)}</span></div>
                })()}
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Notas</label>
                  <input value={cNotas} onChange={e => setCNotas(e.target.value)} placeholder="Observaciones del cierre (opcional)" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8]" />
                </div>
                <button onClick={guardarConciliacion} disabled={cSaving} className="w-full py-2.5 bg-[#1168F8] text-white rounded-xl text-sm font-bold hover:bg-[#0a4fc4] disabled:opacity-50">{cSaving ? 'Guardando...' : 'Guardar conciliación'}</button>
              </>) : (
                <div className="text-[11px] text-gray-400 bg-gray-50 rounded-xl px-4 py-3">Tu rol puede ver las conciliaciones pero no registrarlas.</div>
              )}

              <div>
                <div className="text-[10px] font-semibold text-gray-500 mb-1.5 uppercase">Historial de conciliaciones</div>
                {(() => {
                  const hist = conciliaciones.filter((x: any) => x.grupo_id === conciliarGrupo.grupo_id)
                  if (hist.length === 0) return <div className="text-[11px] text-gray-400 py-2">Todavía no hay cierres registrados.</div>
                  return (
                    <div className="space-y-1.5 max-h-56 overflow-y-auto">
                      {hist.map((h: any) => (
                        <div key={h.id} className="flex items-center justify-between text-xs border border-gray-100 rounded-lg px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-600 font-medium">{String(h.fecha).split('-').reverse().join('/')}</span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${h.conciliado ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'}`}>{h.conciliado ? 'cuadra' : 'con diferencia'}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-gray-400">extracto <span className="font-mono text-gray-700">{fmtMon(conciliarGrupo.base.moneda, Number(h.saldo_extracto))}</span></span>
                            {!h.conciliado && <span className="text-amber-600 font-mono">Δ {fmtMon(conciliarGrupo.base.moneda, Number(h.diferencia))}</span>}
                            {pConciliar && <button onClick={() => borrarConciliacion(h.id)} className="text-gray-300 hover:text-red-500 text-sm leading-none">×</button>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
