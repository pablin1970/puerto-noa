import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CRON_SECRET = process.env.CRON_SECRET || 'puertonoa_cron_2026';

async function fetchTipoCambio(): Promise<{ ars: number; clp: number; cny: number } | null> {
  try {
    // USD a ARS (blue/informal - usamos bluelytics)
    const arsRes = await fetch('https://api.bluelytics.com.ar/v2/latest', { cache: 'no-store' });
    const arsData = await arsRes.json();
    const ars = arsData?.blue?.value_sell ?? null;

    // USD a CLP
    const clpRes = await fetch('https://mindicador.cl/api/dolar', { cache: 'no-store' });
    const clpData = await clpRes.json();
    const clp = clpData?.serie?.[0]?.valor ?? null;

    // USD a CNY (tipo de cambio oficial)
    const cnyRes = await fetch('https://open.er-api.com/v6/latest/USD', { cache: 'no-store' });
    const cnyData = await cnyRes.json();
    const cny = cnyData?.rates?.CNY ?? null;

    if (!ars || !clp || !cny) return null;

    return { ars, clp, cny };
  } catch (err) {
    console.error('Error fetching tipos de cambio:', err);
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');

  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tasas = await fetchTipoCambio();

  if (!tasas) {
    return NextResponse.json({ error: 'No se pudieron obtener los tipos de cambio' }, { status: 500 });
  }

  // Insertar evento en tipos_cambio_eventos
  const body = {
    tipo_fuente: 'automatico',
    ars_por_usd: tasas.ars,
    clp_por_usd: tasas.clp,
    cny_por_usd: tasas.cny,
    notas: 'Actualización automática vía cron',
  };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/tipos_cambio_eventos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const error = await res.text();
    console.error('Error insertando en Supabase:', error);
    return NextResponse.json({ error: 'Error guardando en base de datos' }, { status: 500 });
  }

  const data = await res.json();
  return NextResponse.json({ ok: true, data }, { status: 200 });
}
