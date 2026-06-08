export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { usuario_id } = await request.json()
    if (!usuario_id) return NextResponse.json({ error: 'Missing usuario_id' }, { status: 400 })

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const headers = {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    }

    // Get IP from request headers
    const forwarded = request.headers.get('x-forwarded-for')
    const ip = forwarded ? forwarded.split(',')[0].trim() : request.headers.get('x-real-ip') || 'unknown'
    const userAgent = request.headers.get('user-agent') || ''

    // Geolocate IP
    let ciudad = '', pais = '', paisCodigo = ''
    if (ip && ip !== 'unknown' && ip !== '127.0.0.1' && !ip.startsWith('192.168')) {
      try {
        const geo = await fetch(`http://ip-api.com/json/${ip}?fields=city,country,countryCode&lang=es`)
        if (geo.ok) {
          const geoData = await geo.json()
          ciudad = geoData.city || ''
          pais = geoData.country || ''
          paisCodigo = geoData.countryCode || ''
        }
      } catch {}
    }

    const now = new Date().toISOString()

    // Insert login history
    await fetch(`${url}/rest/v1/login_historial`, {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ usuario_id, ip, ciudad, pais, pais_codigo: paisCodigo, user_agent: userAgent })
    })

    // Update last login on usuario
    await fetch(`${url}/rest/v1/usuarios?id=eq.${usuario_id}`, {
      method: 'PATCH',
      headers: { ...headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ last_login_at: now, last_login_ip: ip, last_login_ciudad: ciudad, last_login_pais: pais })
    })

    return NextResponse.json({ ok: true, ip, ciudad, pais })
  } catch (e) {
    return NextResponse.json({ error: 'Error tracking login' }, { status: 500 })
  }
}
