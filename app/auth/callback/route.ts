import { createClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(`${origin}/?error=auth_error`)
  }

  if (code) {
    const supabase = createClient()
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

    if (!exchangeError && data.user) {
      // Verificar que el usuario existe en la tabla usuarios y está activo
      const { data: u } = await supabase
        .from('usuarios')
        .select('id, activo')
        .eq('email', data.user.email)
        .single()

      if (!u || !(u as any).activo) {
        await supabase.auth.signOut()
        return NextResponse.redirect(`${origin}/?error=usuario_inactivo`)
      }

      // Vincular auth_id y registrar login
      await (supabase.from('usuarios') as any)
        .update({
          auth_id: data.user.id,
          last_login_at: new Date().toISOString()
        })
        .eq('email', data.user.email)

      return NextResponse.redirect(`${origin}/dashboard`)
    }
  }

  return NextResponse.redirect(`${origin}/?error=auth_error`)
}
