import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { esFueraDeZona } from '@/lib/geografiaPaises'
import { enviarAlertaFueraDeZona } from '@/lib/alertaLogin'

export const dynamic = 'force-dynamic'

// Geolocaliza una IP con proveedor principal (ipwho.is, https) y respaldo (ip-api.com).
// Best-effort: si todo falla, devuelve vacío y el login NO se traba.
async function geolocalizar(ip: string): Promise<{ ciudad: string; region: string; pais: string; paisCodigo: string }> {
  const vacio = { ciudad: '', region: '', pais: '', paisCodigo: '' }
  if (!ip || ip === 'desconocida' || ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('192.168')) return vacio

  // 1) ipwho.is — https, sin API key, confiable desde servidores
  try {
    const r = await fetch(`https://ipwho.is/${ip}`, { signal: AbortSignal.timeout(3500) })
    if (r.ok) {
      const g = await r.json()
      if (g && g.success !== false && (g.city || g.country)) {
        return { ciudad: g.city || '', region: g.region || '', pais: g.country || '', paisCodigo: g.country_code || '' }
      }
    }
  } catch {}

  // 2) ip-api.com — respaldo
  try {
    const r = await fetch(`http://ip-api.com/json/${ip}?fields=status,city,regionName,country,countryCode&lang=es`, { signal: AbortSignal.timeout(3500) })
    if (r.ok) {
      const g = await r.json()
      if (g && g.status === 'success') {
        return { ciudad: g.city || '', region: g.regionName || '', pais: g.country || '', paisCodigo: g.countryCode || '' }
      }
    }
  } catch {}

  return vacio
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  if (code) {
    const cookieStore = cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.session) {
      const user = data.session.user

      const { data: u } = await supabase
        .from('usuarios')
        .select('id, nombre, activo, pais_operacion, provincia_operacion')
        .eq('email', user.email)
        .single()

      if (!u || !(u as any).activo) {
        await supabase.auth.signOut()
        return NextResponse.redirect(new URL('/?error=usuario_inactivo', requestUrl.origin))
      }

      // Ubicación e historial de ingreso (IP real del usuario desde los headers de la request)
      const ip = (request.headers.get('x-forwarded-for')?.split(',')[0].trim())
        || request.headers.get('x-real-ip') || 'desconocida'
      const userAgent = request.headers.get('user-agent') || ''
      const { ciudad, region, pais, paisCodigo } = await geolocalizar(ip)
      const now = new Date().toISOString()

      // ¿Conexión fuera del lugar de operación declarado?
      const fueraDeZona = esFueraDeZona((u as any).pais_operacion, (u as any).provincia_operacion, pais, region)

      try {
        await supabase.from('login_historial').insert({
          usuario_id: (u as any).id, ip, ciudad, region, pais, pais_codigo: paisCodigo,
          fuera_de_zona: fueraDeZona, user_agent: userAgent, metodo: 'google',
        })
      } catch {}

      await supabase.from('usuarios').update({
        auth_id: user.id,
        last_login_at: now,
        last_login_ip: ip,
        last_login_ciudad: ciudad,
        last_login_region: region,
        last_login_pais: pais,
      }).eq('email', user.email)

      // Aviso al super admin si corresponde (no traba el login si falla o no hay mail configurado)
      if (fueraDeZona) {
        await enviarAlertaFueraDeZona({
          nombreUsuario: (u as any).nombre || user.email || 'usuario',
          pais, region, ciudad,
          paisOperacion: (u as any).pais_operacion || '',
          provinciaOperacion: (u as any).provincia_operacion || '',
          fecha: new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Jujuy' }),
        })
      }

      // Redirigir con parámetro para que el layout sepa que viene de OAuth
      const response = NextResponse.redirect(new URL('/dashboard?auth=ok', requestUrl.origin))
      return response
    }
  }

  return NextResponse.redirect(new URL('/?error=auth_error', requestUrl.origin))
}
