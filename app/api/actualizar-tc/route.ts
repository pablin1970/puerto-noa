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
    const r = await fetchWithTimeout('https://dolarapi.com/v1/dolares/oficial', 8000)
    if (r.ok) {
      const d = await r.json()
      ars = d?.venta || null
      if (ars) apiFuente = 'DolarAPI (BNA)'
    }
  } catch {}

  // CLP y CNY desde Open Exchange Rates
  try {
    const r = await fetchWithTimeout('https://open.er-api.com/v6/latest/USD', 8000)
    if (r.ok) {
      const d = await r.json()
      clp = d?.rates?.CLP || null
      cny = d?.rates?.CNY || null
      if (clp || cny) apiFuente = apiFuente ? apiFuente + ' - Open Exchange Rates' : 'Open Exchange Rates'
    }
  } catch {}

  return { ars, clp, cny, apiFuente }
}

// UTM (Unidad Tributaria Mensual) desde mindicador.cl — se reajusta por IPC, sirve como
// referencia de inflación chilena (para el IVA y para inteligencia de precios).
// Trae la serie del año en curso y hace upsert en valores_utm (clave anio,mes).
// Correrla a diario mantiene fresco el mes vigente y completa meses faltantes.
async function fetchYGuardarUtm(): Promise<{ ok: boolean; registros: number; ultima: { anio: number; mes: number; valor: number } | null }> {
  try {
    const r = await fetchWithTimeout('https://mindicador.cl/api/utm', 8000)
    if (!r.ok) return { ok: false, registros: 0, ultima: null }
    const d = await r.json()
    const serie = Array.isArray(d?.serie) ? d.serie : []
    const filas = serie
      .filter((it: any) => it?.fecha && it?.valor != null)
      .map((it: any) => {
        const f = new Date(it.fecha)
        return { anio: f.getUTCFullYear(), mes: f.getUTCMonth() + 1, valor_clp: Number(it.valor), fuente: 'mindicador.cl', updated_at: new Date().toISOString() }
      })
    if (!filas.length) return { ok: false, registros: 0, ultima: null }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/valores_utm?on_conflict=anio,mes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(filas),
    })
    const ult = filas[0]
    return { ok: res.ok, registros: filas.length, ultima: { anio: ult.anio, mes: ult.mes, valor: ult.valor_clp } }
  } catch {
    return { ok: false, registros: 0, ultima: null }
  }
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

  // UTM en la misma corrida (best-effort: si falla, el TC igual quedó guardado)
  const utm = await fetchYGuardarUtm()

  return NextResponse.json({ ok: true, data, utm }, { status: 200 })
}
