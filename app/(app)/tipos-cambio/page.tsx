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
      <div className="p-6 bg-gray-50 min-h-screen
