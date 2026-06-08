'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { fmt } from '@/lib/utils'

interface TCEvento {
  id: string
  fecha: string
  fuente: 'manual' | 'automatico' | 'forzado'
  ars: number | null
  clp: number | null
  cny: number | null
  ars_anterior: number | null
  clp_anterior: number | null
  cny_anterior: number | null
  api_fuente: string | null
  usuario_nombre: string | null
  created_at: string
}

interface TCVigente { ars: number | null; clp: number | null; cny: number | null; fecha: string }

const FUENTE_BADGE: Record<string, { label: string; icon: string; cls: string }> = {
  manual:     { label: 'Manual',   icon: '✏️', cls: 'bg-gray-100 text-gray-600' },
  automatico: { label: 'Automático', icon: '🤖', cls: 'bg-blue-50 text-[#1168F8]' },
  forzado:    { label: 'Forzado',  icon: '⚡', cls: 'bg-purple-50 text-purple-700' },
}

export default function TiposCambioPage() {
  const supabase = useMemo(() => createClient(), [])
  const [vigente, setVigente] = useState<TCVigente>({ ars: null, clp: null, cny: null, fecha: '' })
  const [eventos, setEventos] = useState<TCEvento[]>([])
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [editARS, setEditARS] = useState('')
  const [editCLP, setEditCLP] = useState('')
  const [editCNY, setEditCNY] = useState('')
  const [actualizando, setActualizando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [loading, setLoading] = useState(true)
  const [filtroDesde, setFiltroDesde] = useState('')
  const [filtroHasta, setFiltroHasta] = useState('')
  const [filtroFuente, setFiltroFuente] = useState('')

  useEffect(() => {
    loadUser()
    loadData().then(() => checkAutoUpdate())
  }, [])

  async function loadUser() {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return
    const { data: u } = await supabase.from('usuarios').select('*').eq('auth_id', auth.user.id).single()
    if (u) setCurrentUser(u)
  }

  async function loadData() {
    setLoading(true)
    const { data } = await supabase
      .from('tipos_cambio_eventos')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)

    if (data && data.length > 0) {
      setEventos(data as TCEvento[])
      // Build vigente from latest value per moneda
      const vig: TCVigente = { ars: null, clp: null, cny: null, fecha: '' }
      for (const ev of data as TCEvento[]) {
        if (vig.ars === null && ev.ars !== null) { vig.ars = ev.ars; vig.fecha = ev.fecha }
        if (vig.clp === null && ev.clp !== null) vig.clp = ev.clp
        if (vig.cny === null && ev.cny !== null) vig.cny = ev.cny
        if (vig.ars !== null && vig.clp !== null && vig.cny !== null) break
      }
      setVigente(vig)
      setEditARS(vig.ars ? String(Math.round(vig.ars)) : '')
      setEditCLP(vig.clp ? String(Math.round(vig.clp)) : '')
      setEditCNY(vig.cny ? String(vig.cny?.toFixed(4) || '') : '')
    }
    setLoading(false)
  }

  async function getVigentes() {
    const { data } = await supabase
      .from('tipos_cambio_eventos')
      .select('ars, clp, cny')
      .order('created_at', { ascending: false })
      .limit(10)
    if (!data) return { ars: 0, clp: 0, cny: 0 }
    let ars = 0, clp = 0, cny = 0
    for (const ev of data as any[]) {
      if (!ars && ev.ars) ars = ev.ars
      if (!clp && ev.clp) clp = ev.clp
      if (!cny && ev.cny) cny = ev.cny
      if (ars && clp && cny) break
    }
    return { ars, clp, cny }
  }

  async function guardarManual() {
    const arsVal = parseFloat(editARS.replace(',', '.')) || null
    const clpVal = parseFloat(editCLP.replace(',', '.')) || null
    const cnyVal = parseFloat(editCNY.replace(',', '.')) || null
    if (!arsVal && !clpVal && !cnyVal) return
    setGuardando(true)
    const prev = await getVigentes()
    await (supabase.from('tipos_cambio_eventos') as any).insert({
      fecha: new Date().toISOString().slice(0, 10),
      fuente: 'manual',
      ars: arsVal,
      clp: clpVal,
      cny: cnyVal,
      ars_anterior: arsVal ? prev.ars : null,
      clp_anterior: clpVal ? prev.clp : null,
      cny_anterior: cnyVal ? prev.cny : null,
      api_fuente: 'Ingreso manual',
      usuario_nombre: currentUser?.nombre || 'Usuario',
    })
    await loadData()
    setGuardando(false)
  }

  async function actualizarDesdeAPI(fuente: 'automatico' | 'forzado' = 'forzado') {
    setActualizando(true)
    try {
      let ars: number | null = null, clp: number | null = null, cny: number | null = null
      let apiFuente = ''

      // ARS desde DolarAPI
      try {
        const r = await fetch('https://dolarapi.com/v1/dolares/oficial')
        if (r.ok) { const d = await r.json(); ars = d?.venta || null; apiFuente = 'DolarAPI (BNA)' }
      } catch {}

      // CLP y CNY desde Open Exchange Rates
      try {
        const r = await fetch('https://open.er-api.com/v6/latest/USD')
        if (r.ok) {
          const d = await r.json()
          clp = d?.rates?.CLP || null
          cny = d?.rates?.CNY || null
          if (!apiFuente) apiFuente = 'Open Exchange Rates'
          else apiFuente += ' · Open Exchange Rates'
        }
      } catch {}

      if (ars || clp || cny) {
        const prev = await getVigentes()
        await (supabase.from('tipos_cambio_eventos') as any).insert({
          fecha: new Date().toISOString().slice(0, 10),
          fuente,
          ars, clp, cny,
          ars_anterior: prev.ars,
          clp_anterior: prev.clp,
          cny_anterior: prev.cny,
          api_fuente: apiFuente,
          usuario_nombre: fuente === 'forzado' ? (currentUser?.nombre || 'Usuario') : 'Sistema (cron)',
        })
        await loadData()
      } else {
        alert('No se pudo obtener datos de las APIs. Verificá tu conexión.')
      }
    } catch { alert('Error conectando con las APIs.') }
    setActualizando(false)
  }

  async function checkAutoUpdate() {
    const hoy = new Date().toISOString().slice(0, 10)
    const { data } = await supabase
      .from('tipos_cambio_eventos')
      .select('fecha, fuente')
      .in('fuente', ['automatico', 'forzado'])
      .eq('fecha', hoy)
      .limit(1)
    // Only auto-update if there's NO auto/forced event today
    if (!data || data.length === 0) {
      await actualizarDesdeAPI('automatico')
    }
  }

  const eventosFiltrados = eventos.filter(e => {
    const mD = !filtroDesde || e.fecha >= filtroDesde
    const mH = !filtroHasta || e.fecha <= filtroHasta
    const mF = !filtroFuente || e.fuente === filtroFuente
    return mD && mH && mF
  })

  function varBadge(actual: number | null, anterior: number | null) {
    if (!actual || !anterior) return null
    const v = ((actual - anterior) / anterior) * 100
    if (Math.abs(v) < 0.01) return <span className="text-[10px] text-gray-300">= 0%</span>
    return (
      <span className={`text-[10px] font-semibold ${v > 0 ? 'text-red-500' : 'text-green-600'}`}>
        {v > 0 ? '▲' : '▼'} {Math.abs(v).toFixed(2)}%
      </span>
    )
  }

  const hoy = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Tipos de cambio</h1>
          <p className="text-xs text-gray-400 mt-0.5">TC vigentes · Actualización automática · Historial</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl px-4 py-2.5 shadow-sm text-right">
          <div className="text-xs font-semibold text-gray-700 capitalize">{hoy}</div>
          <div className="text-[10px] text-gray-400 mt-0.5">Fecha de referencia del sistema</div>
        </div>
      </div>

      {/* TC Vigentes + Editor */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm mb-6 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between" style={{ background: '#052698' }}>
          <div>
            <div className="font-bold text-white text-sm">Tipos de cambio vigentes</div>
            <div className="text-blue-200 text-[10px] mt-0.5">Última actualización: {vigente.fecha || '—'}</div>
          </div>
          <button disabled={actualizando} onClick={() => actualizarDesdeAPI('forzado')}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-colors border border-white/20 disabled:opacity-50">
            {actualizando ? <><span className="animate-spin inline-block">⟳</span> Consultando APIs...</> : <><span>🔄</span> Actualizar los 3 desde APIs</>}
          </button>
        </div>

        <div className="grid grid-cols-3 divide-x divide-gray-100">
          {[
            { moneda: 'ARS', flag: '🇦🇷', label: 'Peso argentino', banco: 'BNA', valor: vigente.ars, edit: editARS, setEdit: setEditARS, color: '#1168F8', decimals: 0 },
            { moneda: 'CLP', flag: '🇨🇱', label: 'Peso chileno', banco: 'BCCh', valor: vigente.clp, edit: editCLP, setEdit: setEditCLP, color: '#dc2626', decimals: 0 },
            { moneda: 'CNY', flag: '🇨🇳', label: 'Yuan chino', banco: 'PBoC', valor: vigente.cny, edit: editCNY, setEdit: setEditCNY, color: '#b45309', decimals: 4 },
          ].map(({ moneda, flag, label, banco, valor, edit, setEdit, color, decimals }) => (
            <div key={moneda} className="px-6 py-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">{flag}</span>
                <div>
                  <div className="font-bold text-sm" style={{ color }}>USD → {moneda}</div>
                  <div className="text-[10px] text-gray-400">{label} · {banco}</div>
                </div>
              </div>
              <div className="text-3xl font-black font-mono mb-3" style={{ color }}>
                {valor !== null ? fmt(valor, decimals) : '—'}
              </div>
              <div className="flex items-center gap-2">
                <input type="text" inputMode="decimal" value={edit}
                  onChange={e => setEdit(e.target.value)} onFocus={e => e.target.select()}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm font-mono font-bold text-right focus:outline-none focus:border-[#1168F8]"
                  placeholder="0.00" />
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
          <div className="text-[10px] text-gray-400">Editá uno, dos o los tres valores y hacé click en Guardar. Los que no modifiques quedarán en blanco en el historial.</div>
          <button disabled={guardando} onClick={guardarManual}
            className="flex items-center gap-2 px-5 py-2 bg-gray-800 text-white rounded-xl text-xs font-bold hover:bg-gray-700 disabled:opacity-50 transition-colors">
            {guardando ? 'Guardando...' : '✓ Guardar cambios manuales'}
          </button>
        </div>
      </div>

      {/* Historial */}
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
          <div>
            <span className="font-bold text-sm text-gray-900">Historial</span>
            <span className="text-xs text-gray-400 ml-2">{eventosFiltrados.length} evento(s)</span>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <select value={filtroFuente} onChange={e => setFiltroFuente(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:border-[#1168F8]">
              <option value="">Todos</option>
              <option value="manual">✏️ Manual</option>
              <option value="automatico">🤖 Cron</option>
              <option value="forzado">⚡ Forzado</option>
            </select>
            <input type="date" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8]" />
            <span className="text-gray-300">→</span>
            <input type="date" value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8]" />
            {(filtroDesde || filtroHasta || filtroFuente) && (
              <button onClick={() => { setFiltroDesde(''); setFiltroHasta(''); setFiltroFuente('') }}
                className="px-3 py-1.5 border border-gray-200 rounded-xl text-xs text-gray-500 hover:bg-gray-50">✕</button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400">Cargando...</div>
        ) : eventosFiltrados.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">Sin registros.</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Fecha</th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Hora</th>
                <th className="text-right px-4 py-3 text-[10px] font-semibold text-[#1168F8] uppercase tracking-wider">🇦🇷 ARS</th>
                <th className="text-right px-4 py-3 text-[10px] font-semibold text-red-600 uppercase tracking-wider">🇨🇱 CLP</th>
                <th className="text-right px-4 py-3 text-[10px] font-semibold text-amber-700 uppercase tracking-wider">🇨🇳 CNY</th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Fuente</th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Origen</th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Usuario</th>
              </tr>
            </thead>
            <tbody>
              {eventosFiltrados.map(e => {
                const fb = FUENTE_BADGE[e.fuente]
                return (
                  <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-[11px] font-semibold text-gray-700">{e.fecha ? new Date(e.fecha + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}</td>
                    <td className="px-4 py-3 font-mono text-[10px] text-gray-400">
                      {new Date(e.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {e.ars !== null ? (
                        <div>
                          <div className="font-mono font-bold text-[#1168F8]">{fmt(e.ars, 0)}</div>
                          {varBadge(e.ars, e.ars_anterior)}
                        </div>
                      ) : <span className="text-gray-200 font-mono">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {e.clp !== null ? (
                        <div>
                          <div className="font-mono font-bold text-red-600">{fmt(e.clp, 0)}</div>
                          {varBadge(e.clp, e.clp_anterior)}
                        </div>
                      ) : <span className="text-gray-200 font-mono">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {e.cny !== null ? (
                        <div>
                          <div className="font-mono font-bold text-amber-700">{e.cny.toFixed(4)}</div>
                          {varBadge(e.cny, e.cny_anterior)}
                        </div>
                      ) : <span className="text-gray-200 font-mono">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${fb.cls}`}>
                        {fb.icon} {fb.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-[10px] max-w-36 truncate">{e.api_fuente || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{e.usuario_nombre || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-4 bg-[#EBF2FF] border border-[#93B8FC] rounded-xl px-4 py-3 text-xs text-[#052698]">
        <span className="font-bold">ℹ️</span> El TC vigente se aplica automáticamente en todas las cotizaciones nuevas.
        <span className="ml-2">✏️ Manual = valor ingresado · 🤖 Cron = actualización diaria automática · ⚡ Forzado = actualización manual desde APIs</span>
      </div>
    </div>
  )
}
