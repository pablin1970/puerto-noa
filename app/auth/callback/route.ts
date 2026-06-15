import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user) {
      // Verificar que el usuario existe en la tabla usuarios y está activo
      const { data: u } = await supabase
        .from('usuarios')
        .select('id, activo, nombre')
        .eq('email', data.user.email)
        .single()

      if (!u || !(u as any).activo) {
        // Usuario no existe o está inactivo — cerrar sesión y redirigir con error
        await supabase.auth.signOut()
        return NextResponse.redirect(`${origin}/?error=usuario_inactivo`)
      }

      // Vincular auth_id si es la primera vez que entra con Google
      await (supabase.from('usuarios') as any)
        .update({ auth_id: data.user.id, last_login_at: new Date().toISOString() })
        .eq('email', data.user.email)

      return NextResponse.redirect(`${origin}/dashboard`)
    }
  }

  return NextResponse.redirect(`${origin}/?error=auth_error`)
}
