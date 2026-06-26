export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib'

// ─────────────────────────────────────────────────────────────────────────────
// MOTOR DE MARCA DE AGUA · Puerto NOA
// "Ver" un documento pasa por acá: se descarga el original CON EL TOKEN DEL USUARIO
// (así el RLS de storage hace cumplir el permiso del módulo — si no tiene acceso,
// ni se descarga), y si es PDF se le estampa una marca de agua con el nombre del
// usuario y la fecha. Así, si un documento se filtra, queda registrado quién lo vio.
// "Descargar" NO pasa por acá: va por enlace firmado al original limpio.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const bucket = req.nextUrl.searchParams.get('bucket')
  const path = req.nextUrl.searchParams.get('path')
  if (!bucket || !path) {
    return new NextResponse('Faltan parámetros (bucket, path).', { status: 400 })
  }

  // Cliente con la sesión del usuario (lee cookies). El RLS corre como este usuario.
  const supabase = createRouteHandlerClient({ cookies })
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) {
    return new NextResponse('No autenticado.', { status: 401 })
  }

  // Nombre para el sello (cae a email si no hay nombre).
  let quien = auth.user.email || 'usuario'
  try {
    const { data: u } = await supabase.from('usuarios').select('nombre, email').eq('auth_id', auth.user.id).single()
    quien = ((u as any)?.nombre || (u as any)?.email || quien).toString()
  } catch { /* best-effort */ }

  // Descarga el original con el cliente del usuario → el RLS exige el permiso del módulo.
  const { data: file, error } = await supabase.storage.from(bucket).download(path)
  if (error || !file) {
    return new NextResponse('No tenés permiso para ver este documento, o no está disponible.', { status: 403 })
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const esPdf = path.toLowerCase().endsWith('.pdf')

  // No-PDF (imágenes u otros): se sirven sin marca por ahora (el marcado de imagen es otra etapa).
  if (!esPdf) {
    const ext = path.split('.').pop()?.toLowerCase() || ''
    const mime = ext === 'png' ? 'image/png'
      : (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg'
      : ext === 'webp' ? 'image/webp'
      : 'application/octet-stream'
    return new NextResponse(Buffer.from(bytes), {
      headers: { 'Content-Type': mime, 'Content-Disposition': 'inline', 'Cache-Control': 'no-store' },
    })
  }

  // PDF: estampar marca de agua en cada página.
  try {
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true })
    const font = await pdf.embedFont(StandardFonts.HelveticaBold)
    const ahora = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Jujuy' })
    const selloDiag = 'USO INTERNO · PROHIBIDA SU DISTRIBUCIÓN'
    const pie = `Documento interno Puerto NOA — visto por ${quien} — ${ahora}`

    for (const page of pdf.getPages()) {
      const { width, height } = page.getSize()
      // Marca diagonal repetida, tenue, cruzando la página.
      for (let i = -1; i <= 2; i++) {
        page.drawText(selloDiag, {
          x: width * 0.06,
          y: height * (0.25 * i + 0.2),
          size: Math.max(12, Math.min(22, width / 28)),
          font,
          color: rgb(0.86, 0.11, 0.28),
          opacity: 0.12,
          rotate: degrees(40),
        })
      }
      // Pie con el usuario y la fecha (trazabilidad).
      page.drawText(pie, {
        x: 18, y: 10, size: 7, font, color: rgb(0.45, 0.45, 0.45), opacity: 0.75,
      })
    }

    const out = await pdf.save()
    return new NextResponse(Buffer.from(out), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="documento.pdf"',
        'Cache-Control': 'no-store',
      },
    })
  } catch {
    // Si el PDF no se puede procesar (corrupto/cifrado), servir el original sin marca antes que fallar.
    return new NextResponse(Buffer.from(bytes), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline', 'Cache-Control': 'no-store' },
    })
  }
}
