// ── Aviso por mail de "login fuera de zona" (vía Resend) ─────────────────────
// Si no hay RESEND_API_KEY configurada, no hace nada: la alerta igual queda
// marcada en el historial de conexiones. Apenas se carga la key en Vercel, el
// mail se activa solo. Destinatarios: ALERTA_EMAIL_TO (coma-separado) o el mail
// del super admin por defecto.

export async function enviarAlertaFueraDeZona(opts: {
  nombreUsuario: string
  pais: string
  region: string
  ciudad: string
  paisOperacion: string
  provinciaOperacion: string
  fecha: string
}): Promise<void> {
  const key = process.env.RESEND_API_KEY
  if (!key) return

  const to = (process.env.ALERTA_EMAIL_TO || 'pablo@mealla.com.ar')
    .split(',').map(s => s.trim()).filter(Boolean)
  if (!to.length) return

  const from = process.env.ALERTA_EMAIL_FROM || 'Puerto NOA <onboarding@resend.dev>'
  const lugarLogin = [opts.ciudad, opts.region, opts.pais].filter(Boolean).join(', ') || 'desconocido'
  const lugarOperacion = [opts.provinciaOperacion, opts.paisOperacion].filter(Boolean).join(', ') || '—'

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
      <h2 style="color:#E11D48;margin-bottom:4px">Login fuera de zona</h2>
      <p style="color:#374151;font-size:14px">Un usuario inició sesión fuera de su lugar de operación declarado.</p>
      <table style="font-size:14px;color:#111827;border-collapse:collapse">
        <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Usuario</td><td style="padding:4px 0"><strong>${opts.nombreUsuario}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Conexión desde</td><td style="padding:4px 0">${lugarLogin}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Lugar de operación</td><td style="padding:4px 0">${lugarOperacion}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Fecha</td><td style="padding:4px 0">${opts.fecha}</td></tr>
      </table>
      <p style="color:#9ca3af;font-size:12px;margin-top:16px">Puerto NOA · aviso automático de seguridad</p>
    </div>`

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from, to,
        subject: `⚠️ Login fuera de zona — ${opts.nombreUsuario}`,
        html,
      }),
      signal: AbortSignal.timeout(4000),
    })
  } catch { /* best-effort: nunca trabar el login por el mail */ }
}
