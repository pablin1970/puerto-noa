'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingGoogle, setLoadingGoogle] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleGoogle() {
    setLoadingGoogle(true)
    setError('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      setError('Error al conectar con Google. Intentá de nuevo.')
      setLoadingGoogle(false)
    }
    // Si no hay error, Google redirige automáticamente
  }

  // Paso 1: enviar el código de 6 dígitos al email asignado
  async function enviarCodigo(e?: React.FormEvent) {
    e?.preventDefault()
    if (!email) return
    setLoading(true); setError(''); setInfo('')
    const emailNorm = email.trim().toLowerCase()
    const { error } = await supabase.auth.signInWithOtp({
      email: emailNorm,
      options: { shouldCreateUser: false }, // solo usuarios ya dados de alta
    })
    if (error) {
      setError('No pudimos enviar el código. Verificá que sea el email que tenés asignado, o contactá al administrador.')
      setLoading(false)
      return
    }
    setStep('code')
    setInfo('Te enviamos un código de 6 dígitos a tu correo. Puede tardar hasta un minuto.')
    setLoading(false)
  }

  // Paso 2: verificar el código y validar que el usuario esté activo
  async function verificarCodigo(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const emailNorm = email.trim().toLowerCase()
    const { data, error } = await supabase.auth.verifyOtp({
      email: emailNorm,
      token: code.trim(),
      type: 'email',
    })
    if (error || !data.user) {
      setError('Código incorrecto o vencido. Revisá el correo o pedí uno nuevo.')
      setLoading(false)
      return
    }
    try {
      const { data: u } = await supabase.from('usuarios').select('id, activo').eq('email', emailNorm).single()
      if (!u || !(u as any).activo) {
        await supabase.auth.signOut()
        setError('Tu usuario está inactivo. Contactá al administrador.')
        setLoading(false)
        return
      }
      const userId = (u as any).id
      const now = new Date().toISOString()
      const authId = data.user.id
      // Registro de ingreso + último acceso (en segundo plano, no bloquea el login)
      Promise.resolve().then(async () => {
        try {
          let ip = '', ciudad = '', pais = '', paisCodigo = ''
          const geoRes = await fetch('https://ipapi.co/json/')
          if (geoRes.ok) {
            const geo = await geoRes.json()
            ip = geo.ip || ''; ciudad = geo.city || ''; pais = geo.country_name || ''; paisCodigo = geo.country_code || ''
          }
          await (supabase.from('login_historial') as any).insert({
            usuario_id: userId, ip: ip || 'desconocida', ciudad, pais,
            pais_codigo: paisCodigo, user_agent: navigator.userAgent,
          })
          await (supabase.from('usuarios') as any).update({
            auth_id: authId, last_login_at: now, last_login_ip: ip || 'desconocida',
            last_login_ciudad: ciudad, last_login_pais: pais,
          }).eq('id', userId)
        } catch {}
      })
    } catch {}
    router.push('/dashboard')
    router.refresh()
  }

  function volverAEmail() {
    setStep('email'); setCode(''); setError(''); setInfo('')
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #052698 0%, #1168F8 100%)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8">
        <div className="flex justify-center mb-8">
          <Image src="/logo.png" alt="Puertonoa" width={180} height={52} style={{ objectFit: 'contain' }} />
        </div>
        <h1 className="text-lg font-semibold text-gray-900 mb-1">Iniciar sesión</h1>
        <p className="text-xs text-gray-500 mb-6">Sistema logístico · Acceso interno</p>

        {/* Botón Google */}
        <button onClick={handleGoogle} disabled={loadingGoogle || loading}
          className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border-2 border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all disabled:opacity-60 mb-4">
          {loadingGoogle ? (
            <span className="text-sm text-gray-500">Conectando con Google...</span>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 18 18">
                <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
                <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2.01c-.72.48-1.63.76-2.7.76-2.08 0-3.84-1.4-4.47-3.29H1.87v2.07A8 8 0 0 0 8.98 17z"/>
                <path fill="#FBBC05" d="M4.51 10.52A4.8 4.8 0 0 1 4.26 9c0-.53.09-1.04.25-1.52V5.41H1.87A8 8 0 0 0 .98 9c0 1.29.31 2.51.89 3.59l2.64-2.07z"/>
                <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 8.98 1 8 8 0 0 0 1.87 5.41l2.64 2.07c.63-1.89 2.39-3.3 4.47-3.3z"/>
              </svg>
              Continuar con Google
            </>
          )}
        </button>

        {/* Separador */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px bg-gray-200"/>
          <span className="text-[10px] text-gray-400 uppercase tracking-wider">o con tu email</span>
          <div className="flex-1 h-px bg-gray-200"/>
        </div>

        {step === 'email' ? (
          /* Paso 1: pedir el email */
          <form onSubmit={enviarCodigo} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1168F8]"
                placeholder="correo@puertonoa.com" />
            </div>
            {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
            <button type="submit" disabled={loading || loadingGoogle}
              className="w-full text-white font-medium py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60"
              style={{ background: '#1168F8' }}>
              {loading ? 'Enviando código...' : 'Enviar código'}
            </button>
            <p className="text-[11px] text-gray-400 text-center">Te enviaremos un código de un solo uso a tu correo.</p>
          </form>
        ) : (
          /* Paso 2: ingresar el código */
          <form onSubmit={verificarCodigo} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Código de verificación</label>
              <input type="text" inputMode="numeric" autoComplete="one-time-code" value={code} maxLength={6} autoFocus
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                className="w-full px-3 py-3 border border-gray-200 rounded-lg text-center text-2xl font-mono tracking-[0.4em] focus:outline-none focus:border-[#1168F8]"
                placeholder="––––––" />
              <p className="text-[11px] text-gray-500 mt-1.5">Enviado a <b>{email.trim().toLowerCase()}</b></p>
            </div>
            {info && <div className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">{info}</div>}
            {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
            <button type="submit" disabled={loading || code.length < 6}
              className="w-full text-white font-medium py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60"
              style={{ background: '#1168F8' }}>
              {loading ? 'Verificando...' : 'Ingresar'}
            </button>
            <div className="flex items-center justify-between text-[11px]">
              <button type="button" onClick={volverAEmail} className="text-gray-500 hover:text-gray-700">← Usar otro email</button>
              <button type="button" onClick={() => enviarCodigo()} disabled={loading} className="text-[#1168F8] hover:underline disabled:opacity-50">Reenviar código</button>
            </div>
          </form>
        )}

        <p className="text-xs text-gray-400 text-center mt-6">¿Sin acceso? Contactá al administrador del sistema.</p>
        <div className="mt-8 pt-4 border-t border-gray-100 text-center">
          <p style={{ fontFamily: "'Georgia', 'Times New Roman', serif", fontSize: '12px', color: '#6b7280', letterSpacing: '0.05em', fontStyle: 'italic', fontWeight: 400 }}>Developed by Pablin</p>
        </div>
      </div>
    </div>
  )
}
