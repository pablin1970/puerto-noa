'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { fmt } from '@/lib/utils'
import { cargarPermisos, puede } from '@/lib/permisos'

interface TCEvento {
  id: string
  fecha: string
  fuente: 'manual' | 'automatico' | 'forzado'
  ars: number | null
  clp: number | null
  cny: number | null
  clp_fiscal: number | null
  ars_anterior: number | null
  clp_anterior: number | null
  cny_anterior: number | null
  clp_fiscal_anterior: number | null
  api_fuente: string | null
  usuario_nombre: string | null
  created_at: string
}

interface TCVigente { ars: number | null; clp: number | null; cny: number | null; clpFiscal: number | null; fecha: string }

const FUENTE_BADGE: Record<string, { label: string; icon: string; cls: string }> = {
  manual:     { label: 'Manual',   icon: '✏️', cls: 'bg-gray-100 text-gray-600' },
  automatico: { label: 'Automatico', icon: '🤖', cls: 'bg-blue-50 text-[#1168F8]' },
  forzado:    { label: 'Forzado',  icon: '⚡', cls: 'bg-purple-50 text-purple-700' },
}

// Brecha % entre el TC comercial (mercado) y el fiscal (BCCh observado)
function brechaPct(comercial: number | null, fiscal: number | null): number | null {
  if (comercial === null || fiscal === null || fiscal === 0) return null
  return ((comercial - fiscal) / fiscal) * 100
}

export default function TiposCambioPage() {
  const supabase = useMemo(() => createClient(), [])
  const [vigente, setVigente] = useState<TCVigente>({ ars: null, clp: null, cny: null, clpFiscal: null, fecha: '' })
  const [eventos, setEventos] = useState<TCEvento[]>([])
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [editARS, setEditARS] = useState('')
  const [editCLP, setEditCLP] = useState('')
  const [editCNY, setEditCNY] = useState('')
  const [editCLPFiscal, setEditCLPFiscal] = useState('')
  const [actualizando, setActualizando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [loading, setLoading] = useState(true)
  const [filtroDesde, setFiltroDesde] = useState('')
  const [filtroHasta, setFiltroHasta] = useState('')
  const [filtroFuente, setFiltroFuente] = useState('')

  const [permisos, setPermisos] = useState<Record<string, string[]>>({})
  const [permListos, setPermListos] = useState(false)
  useEffect(() => { cargarPermisos().then(p => { setPermisos(p); setPermListos(true) }) }, [])

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
      const vig: TCVigente = { ars: null, clp: null, cny: null, clpFiscal: null, fecha: '' }
      for (const ev of data as TCEvento[]) {
        if (vig.ars === null && ev.ars !== null) { vig.ars = ev.ars; vig.fecha = ev.fecha }
        if (vig.clp === null && ev.clp !== null) vig.clp = ev.clp
        if (vig.cny === null && ev.cny !== null) vig.cny = ev.cny
        if (vig.clpFiscal === null && ev.clp_fiscal !== null) vig.clpFiscal = ev.clp_fiscal
      }
      setVigente(vig)
      setEditARS(vig.ars ? String(Math.round(vig.ars)) : '')
      setEditCLP(vig.clp ? String(Math.round(vig.clp)) : '')
      setEditCNY(vig.cny ? String(vig.cny?.toFixed(4) || '') : '')
      setEditCLPFiscal(vig.clpFiscal ? String(Math.round(vig.clpFiscal)) : '')
    }
    setLoading(false)
  }

  // Ultimo evento de un dia ANTERIOR a hoy (para calcular la variacion % de cada moneda).
  async function getAnteriores() {
    const hoy = new Date().toISOString().slice(0, 10)
    const { data } = await supabase
      .from('tipos_cambio_eventos')
      .select('ars, clp, cny, clp_fiscal')
      .lt('fecha', hoy)
      .order('fecha', { ascending: false })
      .limit(10)
    const prev = { ars: 0, clp: 0, cny: 0, clpFiscal: 0 }
    if (!data) return prev
    for (const ev of data as any[]) {
      if (!prev.ars && ev.ars) prev.ars = ev.ars
      if (!prev.clp && ev.clp) prev.clp = ev.clp
      if (!prev.cny && ev.cny) prev.cny = ev.cny
      if (!prev.clpFiscal && ev.clp_fiscal) prev.clpFiscal = ev.clp_fiscal
    }
    return prev
  }

  async function guardarManual() {
    const arsVal = parseFloat(editARS.replace(',', '.')) || null
    const clpVal = parseFloat(editCLP.replace(',', '.')) || null
    const cnyVal = parseFloat(editCNY.replace(',', '.')) || null
    const clpFiscalVal = parseFloat(editCLPFiscal.replace(',', '.')) || null
    if (!arsVal && !clpVal && !cnyVal && !clpFiscalVal) return
    setGuardando(true)
    const prev = await getAnteriores()
    const { error } = await (supabase.from('tipos_cambio_eventos') as any).upsert({
      fecha: new Date().toISOString().slice(0, 10),
      fuente: 'manual',
      ars: arsVal,
      clp: clpVal,
      cny: cnyVal,
      clp_fiscal: clpFiscalVal,
      ars_anterior: arsVal ? prev.ars : null,
      clp_anterior: clpVal ? prev.clp : null,
      cny_anterior: cnyVal ? prev.cny : null,
      clp_fiscal_anterior: clpFiscalVal ? prev.clpFiscal : null,
      api_fuente: 'Ingreso manual',
      usuario_nombre: currentUser?.nombre || 'Usuario',
    }, { onConflict: 'fecha' })
    if (error) alert('No se pudo guardar: ' + error.message)
    await loadData()
    setGuardando(false)
  }

  async function actualizarDesdeAPI(fuente: 'automatico' | 'forzado' = 'forzado') {
    setActualizando(true)
    try {
      let ars: number | null = null, clp: number | null = null, cny: number | null = null, clpFiscal: number | null = null
      let apiFuente = ''

      // ARS desde DolarAPI (oficial BNA)
      try {
        const r = await fetch('https://dolarapi.com/v1/dolares/oficial')
        if (r.ok) {
          const d = await r.json()
          ars = d?.venta || null
          if (ars) apiFuente = 'DolarAPI (BNA)'
        }
      } catch {}

      // CLP COMERCIAL y CNY desde Open Exchange Rates (mercado)
      try {
        const r = await fetch('https://open.er-api.com/v6/latest/USD')
        if (r.ok) {
          const d = await r.json()
          clp = d?.rates?.CLP || null
          cny = d?.rates?.CNY || null
          if (clp || cny) apiFuente = apiFuente ? apiFuente + ' - Open Exchange Rates' : 'Open Exchange Rates'
        }
      } catch {}

      // CLP FISCAL desde mindicador.cl (dolar observado BCCh, uso tributario SII)
      try {
        const r = await fetch('https://mindicador.cl/api/dolar')
        if (r.ok) {
          const d = await r.json()
          clpFiscal = d?.serie?.[0]?.valor || null
          if (clpFiscal) apiFuente = apiFuente ? apiFuente + ' - mindicador.cl (BCCh fiscal)' : 'mindicador.cl (BCCh fiscal)'
        }
      } catch {}

      if (ars || clp || cny || clpFiscal) {
        const prev = await getAnteriores()
        const { error } = await (supabase.from('tipos_cambio_eventos') as any).upsert({
          fecha: new Date().toISOString().slice(0, 10),
          fuente,
          ars, clp, cny,
          clp_fiscal: clpFiscal,
          ars_anterior: prev.ars,
          clp_anterior: prev.clp,
          cny_anterior: prev.cny,
          clp_fiscal_anterior: prev.clpFiscal,
          api_fuente: apiFuente,
          usuario_nombre: fuente === 'forzado' ? (currentUser?.nombre || 'Usuario') : 'Sistema (cron)',
        }, { onConflict: 'fecha' })
        if (error && fuente === 'forzado') alert('No se pudo actualizar: ' + error.message)
        await loadData()
      } else if (fuente === 'forzado') {
        alert('No se pudo obtener datos de las APIs.')
      }
    } catch {
      if (fuente === 'forzado') alert('Error conectando con las APIs.')
    }
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
    const signo = v > 0 ? '+' : '-'
    const color = v > 0 ? 'text-red-500' : 'text-green-600'
    return (
      <span className={`text-[10px] font-semibold ${color}`}>
        {signo}{Math.abs(v).toFixed(2)}%
      </span>
    )
  }

  const hoy = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const brechaCLP = brechaPct(vigente.clp, vigente.clpFiscal)

  if (permListos && !puede(permisos, 'tipos_cambio', 'ver')) {
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Tipos de cambio</h1>
          <p className="text-xs text-gray-400 mt-0.5">TC comercial (mercado) y fiscal (BCCh observado · SII) · Actualizacion automatica · Historial</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl px-4 py-2.5 shadow-sm text-right">
          <div className="text-xs font-semibold text-gray-700 capitalize">{hoy}</div>
          <div className="text-[10px] text-gray-400 mt-0.5">Fecha de referencia del sistema</div>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm mb-6 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between" style={{ background: '#052698' }}>
          <div>
            <div className="font-bold text-white text-sm">Tipos de cambio vigentes</div>
            <div className="text-blue-200 text-[10px] mt-0.5">Ultima actualizacion: {vigente.fecha || '-'}</div>
          </div>
          <button disabled={actualizando} onClick={() => actualizarDesdeAPI('forzado')}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-colors border border-white/20 disabled:opacity-50">
            {actualizando ? 'Consultando APIs...' : 'Actualizar todo desde APIs'}
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
                  <div className="font-bold text-sm" style={{ color }}>USD a {moneda}</div>
                  <div className="text-[10px] text-gray-400">{label} - {banco}</div>
                </div>
              </div>
              {moneda === 'CLP' && (
                <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">Comercial · mercado</div>
              )}
              <div className="text-3xl font-black font-mono mb-3" style={{ color }}>
                {valor !== null ? fmt(valor, decimals) : '-'}
              </div>
              <div className="flex items-center gap-2">
                <input type="text" inputMode="decimal" value={edit}
                  onChange={e => setEdit(e.target.value)} onFocus={e => e.target.select()}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm font-mono font-bold text-right focus:outline-none focus:border-[#1168F8]"
                  placeholder="0.00" />
              </div>

              {moneda === 'CLP' && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#7C3AED' }}>Fiscal · BCCh observado (SII)</div>
                    {brechaCLP !== null && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#F3EEFF', color: '#7C3AED' }}>
                        brecha {brechaCLP > 0 ? '+' : ''}{brechaCLP.toFixed(2)}%
                      </span>
                    )}
                  </div>
                  <div className="text-2xl font-black font-mono mb-3" style={{ color: '#7C3AED' }}>
                    {vigente.clpFiscal !== null ? fmt(vigente.clpFiscal, 0) : '-'}
                  </div>
                  <input type="text" inputMode="decimal" value={editCLPFiscal}
                    onChange={e => setEditCLPFiscal(e.target.value)} onFocus={e => e.target.select()}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-mono font-bold text-right focus:outline-none focus:border-[#7C3AED]"
                    placeholder="0" />
                  <div className="text-[9px] text-gray-400 mt-1.5 leading-tight">
                    Este es el valor que exige el SII para facturar en USD.
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
          <div className="text-[10px] text-gray-400">Edita los valores que quieras (incluido el fiscal) y haz click en Guardar.</div>
          <button disabled={guardando} onClick={guardarManual}
            className="flex items-center gap-2 px-5 py-2 bg-gray-800 text-white rounded-xl text-xs font-bold hover:bg-gray-700 disabled:opacity-50 transition-colors">
            {guardando ? 'Guardando...' : 'Guardar cambios manuales'}
          </button>
        </div>
      </div>

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
              <option value="manual">Manual</option>
              <option value="automatico">Automatico</option>
              <option value="forzado">Forzado</option>
            </select>
            <input type="date" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8]" />
            <span className="text-gray-300">-</span>
            <input type="date" value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8]" />
            {(filtroDesde || filtroHasta || filtroFuente) && (
              <button onClick={() => { setFiltroDesde(''); setFiltroHasta(''); setFiltroFuente('') }}
                className="px-3 py-1.5 border border-gray-200 rounded-xl text-xs text-gray-500 hover:bg-gray-50">X</button>
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
              <tr className="bg-gray-50 border-b
