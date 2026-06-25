import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 25

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const CRON_SECRET = process.env.CRON_SECRET

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

  // CLP y CNY desde Open Exchange Rates (TC comercial / mercado)
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

// Dólar OBSERVADO del Banco Central de Chile (TC FISCAL, uso tributario SII).
// mindicador.cl, indicador "dolar" = dólar observado del BCCh; serie[0] = el más reciente.
// Best-effort: si falla, devuelve null y el TC comercial igual se guarda (el fiscal
// quedará para la próxima corrida que sí lo obtenga).
async function fetchDolarFiscal(): Promise<number | null> {
  try {
    const r = await fetchWithTimeout('https://mindicador.cl/api/dolar', 8000)
    if (!r.ok) return null
    const d = await r.json()
    const v = Array.isArray(d?.serie) && d.serie[0]?.valor != null ?
