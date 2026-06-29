export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Asistente IA del módulo Ayuda. Hace de proxy a la API de Anthropic, PERO solo
// para usuarios autenticados: sin una sesión válida de Supabase no se llama a la
// API. Así el endpoint deja de ser un proxy abierto que cualquiera en internet
// podría usar para consumir nuestra API key con prompts arbitrarios.
export async function POST(req: NextRequest) {
  // ── Gate de autenticación: exige sesión de Supabase (cookies del usuario). ──
  const supabase = createRouteHandlerClient({ cookies })
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'El asistente no está configurado (falta ANTHROPIC_API_KEY).' }, { status: 503 })
  }

  try {
    const body = await req.json()
    const { messages, system } = body

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system,
        messages,
      }),
    })

    const data = await response.json()
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: 'Error al conectar con el asistente' }, { status: 500 })
  }
}
