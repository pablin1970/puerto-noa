import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const CRON_SECRET = process.env.CRON_SECRET

// Backfill de UN SOLO USO: rellena clp_fiscal (dolar observado BCCh) en los eventos
// de TC que lo tengan en null. Trae la serie anual completa de mindicador en una
// sola llamada y actualiza dia por dia. Correr una vez y luego borrar el archivo.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 1) Traer todos los eventos sin fiscal
  const resGet = await fetch(
    `${SUPABASE_URL}/rest/v1/tipos_cambio_eventos?clp_fiscal=is.null&select=id,fecha&order=fecha.asc`,
    {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
    }
  )
  if (!resGet.ok) {
    return NextResponse.json({ error: 'No se pudieron leer los eventos', detalle: await resGet.text() }, { status: 500 })
  }
  const pendientes: { id: string; fecha: string }[] = await resGet.json()
  if (!pendientes.length) {
    return NextResponse.json({ ok: true, mensaje: 'No hay dias pendientes de backfill.', actualizados: 0 }, { status: 200 })
  }

  // 2) Determinar los anios involucrados y traer la serie anual de cada uno (1 llamada por anio)
  const anios = Array.from(new Set(pendientes.map(p => p.fecha.slice(0, 4))))
  const mapaFecha: Record<string, number> = {}  // 'YYYY-MM-DD' -> valor observado
  for (const anio of anios) {
    try {
      const r = await fetch(`https://mindicador.cl/api/dolar/${anio}`, { cache: 'no-store' })
      if (!r.ok) continue
      const d = await r.json()
      const serie = Array.isArray(d?.serie) ? d.serie : []
      for (const it of serie) {
        if (it?.fecha && it?.valor != null) {
          const f = String(it.fecha).slice(0, 10) // viene como 2026-06-24T03:00:00.000Z
          mapaFecha[f] = Number(it.valor)
        }
      }
    } catch {}
  }

  const fechasOrdenadas = Object.keys(mapaFecha).sort() // ascendente

  // Devuelve el observado de la fecha exacta, o el del dia habil anterior mas cercano
  function valorPara(fecha: string): number | null {
    if (mapaFecha[fecha]) return mapaFecha[fecha]
    let mejor: number | null = null
    for (const f of fechasOrdenadas) {
      if (f <= fecha) mejor = mapaFecha[f]
      else break
    }
    return mejor
  }

  // 3) Actualizar cada evento pendiente
  let actualizados = 0
  const sinDato: string[] = []
  for (const ev of pendientes) {
    const valor = valorPara(ev.fecha)
    if (!valor || valor <= 0) { sinDato.push(ev.fecha); continue }
    const resPatch = await fetch(
      `${SUPABASE_URL}/rest/v1/tipos_cambio_eventos?id=eq.${ev.id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ clp_fiscal: valor }),
      }
    )
    if (resPatch.ok) actualizados++
  }

  return NextResponse.json({
    ok: true,
    pendientes_iniciales: pendientes.length,
    actualizados,
    sin_dato: sinDato,
    anios_consultados: anios,
  }, { status: 200 })
}
