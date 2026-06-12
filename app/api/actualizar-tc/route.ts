import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 25

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const CRON_SECRET = process.env.CRON_SECRET || 'puertonoa_cron_2026'

async function fetchWithTimeout(url: string, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { cache: 'no-store', signal: controller.signal })
    return res
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchTipoCambio(): Promise<{ ars: number | null; clp: number | null; cny: number | null; apiFuente: string }> {
  let ars: number | null = null
  let clp: number | null = null
  let cny: number | null = null
  let apiFuente = ''

  // ARS desde DolarAPI (oficial BNA)
  try {
    const r = await fetchWithTimeout('https://dolarapi.com/v1/dolares/oficial')
    if (r.ok) {
      const d = await r.json()
      ars = d?.venta || null
      if (ars) apiFuente = 'DolarAPI (BNA)'
    }
  } catch {}

  // CLP desde mindicador.cl (BCCh)
  try {
    const r = await fetchWithTimeout('https://mindicador.cl/api/dolar')
    if (r.ok) {
      const d = await r.json()
      clp = d?.serie?.[0]?.valor || null
      if (clp) apiFuente = apiFuente ? apiFuente + ' - mindicador.cl (BCCh)' : 'mindicador.cl (BCCh)'
    }
  } catch {}

  // CNY desde Open Exchange Rates
  try {
    const r = await fetchWithTimeout('https://open.er-api.com/v6/latest/USD')
    if (r.ok) {
      const d = await r.json()
      cny = d?.rates?.CNY || null
      if (cny) apiFuente = apiFuente ? apiFuente + ' - Open Exchange Rates' : 'Open Exchange Rates'
    }
  } catch {}

  return { ars, clp, cny, apiFuente }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')

  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { ars, clp, cny, apiFuente } = await fetchTipoCambio()

  if (!ars && !clp && !cny) {
    return NextResponse.json({ error: 'No se pudieron obtener los tipos de cambio' }, { status: 500 })
  }

  const body = {
    fuente: 'automatico',
    ars,
    clp,
    cny,
    api_fuente: apiFuente,
    usuario_nombre: 'Sistema (cron)',
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/tipos_cambio_eventos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const error = await res.text()
    return NextResponse.json({ error: 'Error guardando en base de datos', detalle: error }, { status: 500 })
  }

  const data = await res.json()
  return NextResponse.json({ ok: true, data }, { status: 200 })
}
