'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { fmt } from '@/lib/utils'

interface TC {
  id: string
  moneda: string
  valor: number
  fecha: string
  fuente: string
  api_fuente: string
  usuario_nombre: string
  created_at: string
}

const MONEDA_INFO: Record<string, { label: string; flag: string; banco: string; color: string; bg: string }> = {
  ARS: { label: 'Peso argentino', flag: '🇦🇷', banco: 'BNA — Banco Nación Argentina', color: '#1168F8', bg: '#EBF2FF' },
  CLP: { label: 'Peso chileno', flag: '🇨🇱', banco: 'BCCh — Banco Central de Chile', color: '#dc2626', bg: '#fef2f2' },
  CNY: { label: 'Yuan chino', flag: '🇨🇳', banco: 'PBoC — Open Exchange Rates', color: '#b45309', bg: '#fffbeb' },
}

export default function TiposCambioPage() {
  const supabase = useMemo(() => createClient(), [])
  const [vigentes, setVigentes] = useState<Record<string, TC>>({})
  const [historico, setHistorico] = useState<TC[]>([])
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [editando, setEditando] = useState<Record<string, string>>({})
  const [actualizando, setActualizando] = useState<Record<string, boolean>>({})
  const [guardando, setGuardando] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [filtroMoneda, setFiltroMoneda] = useState('')
  const [filtroDesde, setFiltroDesde] = useState('')
  const [filtroHasta, setFiltroHasta] = useState('')

  useEffect(() => { 
    loadUser()
    loadData().then(() => {
      // Auto-actualizar si algún TC tiene más de 1 día
      checkAutoUpdate()
    })
  }, [])

  async function checkAutoUpdate() {
    const { data } = await supabase
      .from('tipos_cambio')
      .select('moneda, fecha')
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
    
    if (!data) return
    const hoy = new Date().toISOString().slice(0, 10)
    const monedas = ['ARS', 'CLP', 'CNY']
    
    for (const moneda of monedas) {
      const latest = (data as any[]).find(t => t.moneda === moneda)
      const fechaUltimo = latest?.fecha || ''
      // Si no tiene TC hoy, actualizar automáticamente
      if (fechaUltimo < hoy) {
        await actualizarDesdeAPI(moneda)
      }
    }
  }

  async function loadUser() {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return
    const { data: u } = await supabase.from('usuarios').select('*').eq('auth_id', auth.user.id).single()
    if (u) setCurrentUser(u)
  }

  async function loadData() {
    setLoading(true)
    const { data: hist } = await supabase.from('tipos_cambio').select('*').order('fecha', { ascending: false }).order('created_at', { ascending: false }).limit(300)
    if (hist) {
      setHistorico(hist as TC[])
      const v: Record<string, TC> = {}
      const edits: Record<string, string> = {}
      for (const moneda of ['ARS', 'CLP', 'CNY']) {
        const latest = (hist as TC[]).find(t => t.moneda === moneda)
        if (latest) { v[moneda] = latest; edits[moneda] = String(latest.valor) }
      }
      setVigentes(v)
      setEditando(edits)
    }
    setLoading(false)
  }

  async function guardarTC(moneda: string, valor: number, fuente: 'manual' | 'automatico' | 'forzado', apiFuente?: string) {
    if (!valor || isNaN(valor) || valor <= 0) return
    setGuardando(g => ({ ...g, [moneda]: true }))
    await (supabase.from('tipos_cambio') as any).insert({
      moneda, valor,
      fecha: new Date().toISOString().slice(0, 10),
      fuente, api_fuente: apiFuente || (fuente === 'manual' ? 'Ingreso manual' : null),
      usuario_id: currentUser?.id || null,
      usuario_nombre: currentUser?.nombre || 'Sistema',
    })
    await loadData()
    setGuardando(g => ({ ...g, [moneda]: false }))
  }

  async function actualizarDesdeAPI(moneda: string, tipofuente: 'automatico' | 'forzado' = 'automatico') {
    setActualizando(a => ({ ...a, [moneda]: true }))
    try {
      let valor: number | null = null
      let fuente = ''
      if (moneda === 'ARS') {
        try {
          const r = await fetch('https://dolarapi.com/v1/dolares/oficial')
          if (r.ok) { const d = await r.json(); valor = d?.venta || null; fuente = 'DolarAPI (BNA oficial)' }
        } catch {}
      }
      if (moneda === 'CLP' || moneda === 'CNY' || !valor) {
        try {
          const r = await fetch('https://open.er-api.com/v6/latest/USD')
          if (r.ok) { const d = await r.json(); valor = d?.rates?.[moneda] || null; fuente = 'Open Exchange Rates' }
        } catch {}
      }
      if (valor && valor > 0) {
        setEditando(e => ({ ...e, [moneda]: String(Math.round(moneda === 'CNY' ? valor! * 10000 : valor!) / (moneda === 'CNY' ? 10000 : 1)) }))
        await guardarTC(moneda, valor, tipofuente, fuente)
      } else {
        alert(`No se pudo obtener TC de ${moneda} desde la API. Ingresalo manualmente.`)
      }
    } catch { alert(`Error conectando con la API para ${moneda}.`) }
    setActualizando(a => ({ ...a, [moneda]: false }))
  }

  const histFiltrado = historico.filter(t => {
    const mM = !filtroMoneda || t.moneda === filtroMoneda
    const mD = !filtroDesde || t.fecha >= filtroDesde
    const mH = !filtroHasta || t.fecha <= filtroHasta
    return mM && mD && mH
  })

  const hoy = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Tipos de cambio</h1>
          <p className="text-xs text-gray-400 mt-0.5">TC vigentes · Actualización automática · Historial completo</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl px-4 py-2.5 shadow-sm text-right">
          <div className="text-xs font-semibold text-gray-700 capitalize">{hoy}</div>
          <div className="text-[10px] text-gray-400 mt-0.5">Fecha de referencia del sistema</div>
        </div>
      </div>

      {/* TC Vigentes */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {['ARS', 'CLP', 'CNY'].map(moneda => {
          const info = MONEDA_INFO[moneda]
          const vig = vigentes[moneda]
          const isAct = actualizando[moneda]
          const isGuard = guardando[moneda]
          const diasAtras = vig ? Math.floor((Date.now() - new Date(vig.fecha).getTime()) / 86400000) : null
          return (
            <div key={moneda} className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-5 py-3.5 flex items-center justify-between" style={{ background: info.bg, borderBottom: `2px solid ${info.color}` }}>
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">{info.flag}</span>
                  <div>
                    <div className="font-black text-sm" style={{ color: info.color }}>USD → {moneda}</div>
                    <div className="text-[10px] text-gray-500">{info.label}</div>
                  </div>
                </div>
                {diasAtras !== null && (
                  <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${diasAtras === 0 ? 'bg-green-100 text-green-700' : diasAtras <= 1 ? 'bg-blue-50 text-[#1168F8]' : 'bg-amber-50 text-amber-700'}`}>
                    {diasAtras === 0 ? '✓ Hoy' : `Hace ${diasAtras}d`}
                  </span>
                )}
              </div>
              <div className="px-5 py-4">
                <div className="text-4xl font-black font-mono mb-0.5" style={{ color: info.color }}>
                  {vig ? fmt(vig.valor, moneda === 'CNY' ? 4 : 0) : '—'}
                </div>
                <div className="text-[10px] text-gray-400 mb-4">
                  {vig ? `${vig.fuente === 'automatico' ? '🤖 Cron' : vig.fuente === 'forzado' ? '⚡ Forzado' : '✏️ Manual'} · ${vig.api_fuente || ''} · ${vig.fecha}` : 'Sin datos aún'}
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <input
                    type="text" inputMode="decimal"
                    value={editando[moneda] || ''}
                    onChange={e => setEditando(ed => ({ ...ed, [moneda]: e.target.value }))}
                    onFocus={e => e.target.select()}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm font-mono font-bold text-right focus:outline-none focus:border-[#1168F8]"
                    placeholder="0.00"
                  />
                  <button disabled={isGuard}
                    onClick={() => guardarTC(moneda, parseFloat((editando[moneda] || '0').replace(',', '.')), 'manual')}
                    className="px-4 py-2 bg-gray-800 text-white rounded-xl text-xs font-bold hover:bg-gray-700 disabled:opacity-50 transition-colors">
                    {isGuard ? '...' : '✓ Guardar'}
                  </button>
                </div>
                <button disabled={isAct} onClick={() => actualizarDesdeAPI(moneda, 'forzado')}
                  className="w-full flex items-center justify-center gap-2 py-2.5 border-2 rounded-xl text-xs font-bold transition-all hover:opacity-80"
                  style={{ borderColor: info.color, color: isAct ? '#9ca3af' : info.color, borderStyle: 'solid' }}>
                  {isAct ? <><span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span> Consultando...</> : <><span>🔄</span> Actualizar desde {info.banco.split('—')[0].trim()}</>}
                </button>
                <div className="text-[9px] text-gray-300 text-center mt-1">{info.banco}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Historial */}
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
          <div>
            <span className="font-bold text-sm text-gray-900">Historial</span>
            <span className="text-xs text-gray-400 ml-2">{histFiltrado.length} registro(s)</span>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <select value={filtroMoneda} onChange={e => setFiltroMoneda(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:border-[#1168F8]">
              <option value="">Todas</option>
              <option value="ARS">🇦🇷 ARS</option>
              <option value="CLP">🇨🇱 CLP</option>
              <option value="CNY">🇨🇳 CNY</option>
            </select>
            <input type="date" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8]" />
            <span className="text-gray-300">→</span>
            <input type="date" value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8]" />
            {(filtroMoneda || filtroDesde || filtroHasta) && (
              <button onClick={() => { setFiltroMoneda(''); setFiltroDesde(''); setFiltroHasta('') }}
                className="px-3 py-1.5 border border-gray-200 rounded-xl text-xs text-gray-500 hover:bg-gray-50">✕ Limpiar</button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400">Cargando historial...</div>
        ) : histFiltrado.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">Sin registros.</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Fecha', 'Moneda', 'Valor', 'Variación', 'Fuente', 'Origen', 'Usuario', 'Hora'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {histFiltrado.map((t, idx) => {
                const info = MONEDA_INFO[t.moneda]
                const prev = histFiltrado.slice(idx + 1).find(x => x.moneda === t.moneda)
                const variacion = prev ? ((t.valor - prev.valor) / prev.valor * 100) : null
                return (
                  <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-[11px] font-semibold text-gray-700">{t.fecha}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold" style={{ background: info.bg, color: info.color }}>
                        {info.flag} {t.moneda}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-gray-900 text-sm">{fmt(t.valor, t.moneda === 'CNY' ? 4 : 0)}</td>
                    <td className="px-4 py-3">
                      {variacion !== null ? (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${variacion > 0.01 ? 'bg-red-50 text-red-600' : variacion < -0.01 ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                          {variacion > 0.01 ? '▲' : variacion < -0.01 ? '▼' : '='} {Math.abs(variacion).toFixed(2)}%
                        </span>
                      ) : <span className="text-gray-200">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${t.fuente === 'automatico' ? 'bg-blue-50 text-[#1168F8]' : t.fuente === 'forzado' ? 'bg-purple-50 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                        {t.fuente === 'automatico' ? '🤖 Cron' : t.fuente === 'forzado' ? '⚡ Forzado' : '✏️ Manual'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-[10px] max-w-36 truncate">{t.api_fuente || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{t.usuario_nombre || '—'}</td>
                    <td className="px-4 py-3 text-gray-400 font-mono text-[10px]">
                      {new Date(t.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-4 bg-[#EBF2FF] border border-[#93B8FC] rounded-xl px-4 py-3 text-xs text-[#052698]">
        <span className="font-bold">ℹ️ Uso:</span> El TC vigente se aplica automáticamente en cotizaciones nuevas. Al recotizar, el sistema informa el cambio de TC respecto a la cotización original. Cada valor queda registrado con fecha, origen y usuario para trazabilidad completa.
      </div>
    </div>
  )
}
