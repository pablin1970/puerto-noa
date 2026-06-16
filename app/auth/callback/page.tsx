import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  if (code) {
    const supabase = createRouteHandlerClient({ cookies })
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.session) {
      const user = data.session.user

      // Verificar que el usuario existe y está activo
      const { data: u } = await supabase
        .from('usuarios')
        .select('id, activo')
        .eq('email', user.email)
        .single()

      if (!u || !(u as any).activo) {
        await supabase.auth.signOut()
        return NextResponse.redirect(new URL('/?error=usuario_inactivo', requestUrl.origin))
      }

      // Vincular auth_id y registrar login
      await supabase.from('usuarios').update({
        auth_id: user.id,
        last_login_at: new Date().toISOString()
      }).eq('email', user.email)

      return NextResponse.redirect(new URL('/dashboard', requestUrl.origin))
    }
  }

  return NextResponse.redirect(new URL('/?error=auth_error', requestUrl.origin))
}
