import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const UMBRAL_CAMBIO = 0.001 // 0.1% mínimo para considerar cambio

async function fetchTC(moneda: string): Promise<{ valor: number; fuente: string } | null> {
  try {
    if (moneda === 'ARS') {
      const r = await fetch('https://dolarapi.com/v1/dolares/oficial', { next: { revalidate: 0 } })
      if (r.ok) {
        const d = await r.json()
        if (d?.venta && d.venta > 0) return { valor: d.venta, fuente: 'DolarAPI (BNA oficial)' }
      }
    }
    // CLP y CNY — y fallback ARS
    const r = await fetch('https://open.er-api.com/v6/latest/USD', { next: { revalidate: 0 } })
    if (r.ok) {
      const d = await r.json()
      const valor = d?.rates?.[moneda]
      if (valor && valor > 0) return { valor, fuente: 'Open Exchange Rates' }
    }
  } catch {}
  return null
}

export async function GET(request: Request) {
  // Verificar secret para seguridad
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const resultados: any[] = []
  const hoy = new Date().toISOString().slice(0, 10)

  for (const moneda of ['ARS', 'CLP', 'CNY']) {
    // Obtener último TC guardado
    const { data: ultimo } = await supabase
      .from('tipos_cambio')
      .select('valor, fecha')
      .eq('moneda', moneda)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    // Fetch desde API
    const nuevo = await fetchTC(moneda)
    if (!nuevo) { resultados.push({ moneda, status: 'error_api' }); continue }

    // Comparar con último valor
    const ultimoValor = (ultimo as any)?.valor || 0
    const variacion = ultimoValor > 0 ? Math.abs((nuevo.valor - ultimoValor) / ultimoValor) : 1

    if (variacion < UMBRAL_CAMBIO && (ultimo as any)?.fecha === hoy) {
      resultados.push({ moneda, status: 'sin_cambio', valor: nuevo.valor })
      continue
    }

    // Guardar nuevo TC
    await supabase.from('tipos_cambio').insert({
      moneda,
      valor: nuevo.valor,
      fecha: hoy,
      fuente: 'automatico',
      api_fuente: nuevo.fuente,
      usuario_nombre: 'Sistema (cron diario)',
    })

    resultados.push({ moneda, status: 'actualizado', anterior: ultimoValor, nuevo: nuevo.valor, variacion: `${(variacion * 100).toFixed(2)}%` })
  }

  return NextResponse.json({ fecha: hoy, resultados })
}
