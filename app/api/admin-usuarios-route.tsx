import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { action, email, password, auth_id } = body

    if (!action) {
      return NextResponse.json({ error: 'Accion requerida' }, { status: 400 })
    }

    // CREAR USUARIO EN AUTH
    if (action === 'crear') {
      if (!email || !password) {
        return NextResponse.json({ error: 'Email y password requeridos' }, { status: 400 })
      }

      const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
        body: JSON.stringify({
          email,
          password,
          email_confirm: true,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        return NextResponse.json({ error: data.message || 'Error creando usuario en Auth' }, { status: 500 })
      }

      return NextResponse.json({ ok: true, user: data }, { status: 200 })
    }

    // RESETEAR CONTRASEÑA
    if (action === 'reset_password') {
      if (!auth_id || !password) {
        return NextResponse.json({ error: 'auth_id y password requeridos' }, { status: 400 })
      }

      const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${auth_id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
        body: JSON.stringify({ password }),
      })

      const data = await res.json()

      if (!res.ok) {
        return NextResponse.json({ error: data.message || 'Error reseteando contraseña' }, { status: 500 })
      }

      return NextResponse.json({ ok: true }, { status: 200 })
    }

    return NextResponse.json({ error: 'Accion no reconocida' }, { status: 400 })

  } catch (err) {
    console.error('Error en admin-usuarios:', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
