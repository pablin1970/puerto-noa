import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

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

      await supabase.from('usuarios').update({
        auth_id: user.id,
        last_login_at: new Date().toISOString()
      }).eq('email', user.email)

      // Redirigir con parámetro para que el layout sepa que viene de OAuth
      const response = NextResponse.redirect(new URL('/dashboard?auth=ok', requestUrl.origin))
      return response
    }
  }

  return NextResponse.redirect(new URL('/?error=auth_error', requestUrl.origin))
}
