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
    return await fetch(url, { cache: 'no-store', signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

// Trae la serie anual de UTM desde mindicador.cl (mapea el Banco Central de Chile).
// Devuelve filas { anio, mes, valor_clp } listas para upsert.
async function fetchUtmAnio(anio: number): Promise<{ anio: number; mes: number; valor_clp: number }[]> {
  const filas: { anio: number; mes: number; valor_clp: number }[] = []
  try {
    const r = await fetchWithTimeout(`https://mindicador.cl/api/utm/${anio}`, 8000)
    if (r.ok) {
      const d = await r.json()
      const serie = Array.isArray(d?.serie) ? d.serie : []
      for (const it of serie) {
        if (!it?.fecha || it?.valor == null) continue
        const f = new Date(it.fecha)
        filas.push({ anio: f.getUTCFullYear(), mes: f.getUTCMonth() + 1, valor_clp: Number(it.valor) })
      }
    }
  } catch {}
  return filas
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Año actual y anterior, para tener histórico suficiente para el reajuste del remanente.
  const hoy = new Date()
  const anioActual = hoy.getUTCFullYear()
  const [actual, previo] = await Promise.all([fetchUtmAnio(anioActual), fetchUtmAnio(anioActual - 1)])
  const filas = [...previo, ...actual]

  if (!filas.length) {
    return NextResponse.json({ error: 'No se pudieron obtener valores de UTM desde mindicador.cl' }, { status: 500 })
  }

  // Upsert en valores_utm (clave anio,mes)
  const body = filas.map(f => ({ anio: f.anio, mes: f.mes, valor_clp: f.valor_clp, fuente: 'mindicador.cl', updated_at: new Date().toISOString() }))
  const res = await fetch(`${SUPABASE_URL}/rest/v1/valores_utm?on_conflict=anio,mes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Prefer': 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const error = await res.text()
    return NextResponse.json({ error: 'Error guardando en base de datos', detalle: error }, { status: 500 })
  }

  const data = await res.json()
  return NextResponse.json({ ok: true, registros: Array.isArray(data) ? data.length : 0, data }, { status: 200 })
}
