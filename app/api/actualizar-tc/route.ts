import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Usar anon key — las políticas RLS permiten insertar a usuarios autenticados
// El cron job usa la anon key con bypass via secret
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const UMBRAL_CAMBIO = 0.001

async function fetchTC(moneda: string): Promise<{ valor: number; fuente: string } | null> {
  try {
    if (moneda === 'ARS') {
      try {
        const r = await fetch('https://dolarapi.com/v1/dolares/oficial')
        if (r.ok) {
          const d = await r.json()
          if (d?.venta && d.venta > 0) return { valor: d.venta, fuente: 'DolarAPI (BNA oficial)' }
        }
      } catch {}
    }
    const r = await fetch('https://open.er-api.com/v6/latest/USD')
    if (r.ok) {
      const d = await r.json()
      const valor = d?.rates?.[moneda]
      if (valor && valor > 0) return { valor, fuente: 'Open Exchange Rates' }
    }
  } catch {}
  return null
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET && secret !== 'puertonoa_cron_2026') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const resultados: any[] = []
  const hoy = new Date().toISOString().slice(0, 10)

  for (const moneda of ['ARS', 'CLP', 'CNY']) {
    const { data: ultimo } = await supabase
      .from('tipos_cambio')
      .select('valor, fecha')
      .eq('moneda', moneda)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const nuevo = await fetchTC(moneda)
    if (!nuevo) { resultados.push({ moneda, status: 'error_api' }); continue }

    const ultimoValor = (ultimo as any)?.valor || 0
    const variacion = ultimoValor > 0 ? Math.abs((nuevo.valor - ultimoValor) / ultimoValor) : 1

    if (variacion < UMBRAL_CAMBIO && (ultimo as any)?.fecha === hoy) {
      resultados.push({ moneda, status: 'sin_cambio', valor: nuevo.valor })
      continue
    }

    await (supabase.from('tipos_cambio') as any).insert({
      moneda, valor: nuevo.valor, fecha: hoy,
      fuente: 'automatico', api_fuente: nuevo.fuente,
      usuario_nombre: 'Sistema (cron diario)',
    })

    resultados.push({ moneda, status: 'actualizado', anterior: ultimoValor, nuevo: nuevo.valor })
  }

  return NextResponse.json({ fecha: hoy, resultados })
}
