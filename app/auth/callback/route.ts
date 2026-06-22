import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

// Geolocaliza una IP (best-effort, no bloquea el login si falla)
async function geolocalizar(ip: string): Promise<{ ciudad: string; pais: string; paisCodigo: string }> {
  const vacio = { ciudad: '', pais: '', paisCodigo: '' }
  if (!ip || ip === 'unknown' || ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('192.168')) return vacio
  try {
    const r = await fetch(`https://ipapi.co/${ip}/json/`, { signal: AbortSignal.timeout(3000) })
    if (!r.ok) return vacio
    const g = await r.json()
    return { ciudad: g.city || '', pais: g.country_name || '', paisCodigo: g.country_code || '' }
  } catch {
    return vacio
  }
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
        .select('id, activo')
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
      const { ciudad, pais, paisCodigo } = await geolocalizar(ip)
      const now = new Date().toISOString()

      try {
        await supabase.from('login_historial').insert({
          usuario_id: (u as any).id, ip, ciudad, pais, pais_codigo: paisCodigo, user_agent: userAgent,
        })
      } catch {}

      await supabase.from('usuarios').update({
        auth_id: user.id,
        last_login_at: now,
        last_login_ip: ip,
        last_login_ciudad: ciudad,
        last_login_pais: pais,
      }).eq('email', user.email)

      // Redirigir con parámetro para que el layout sepa que viene de OAuth
      const response = NextResponse.redirect(new URL('/dashboard?auth=ok', requestUrl.origin))
      return response
    }
  }

  return NextResponse.redirect(new URL('/?error=auth_error', requestUrl.origin))
}
