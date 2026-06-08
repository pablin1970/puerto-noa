'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Email o contraseña incorrectos.')
      setLoading(false)
    } else {
      // Track login client-side
      if (data.user) {
        try {
          const { data: u } = await supabase.from('usuarios').select('id, force_password_change').eq('auth_id', data.user.id).single()
          if (u) {
            const userId = (u as any).id
            const now = new Date().toISOString()
            // Get approximate IP via public API
            let ip = '', ciudad = '', pais = '', paisCodigo = ''
            try {
              const geoRes = await fetch('https://ipapi.co/json/')
              if (geoRes.ok) {
                const geo = await geoRes.json()
                ip = geo.ip || ''
                ciudad = geo.city || ''
                pais = geo.country_name || ''
                paisCodigo = geo.country_code || ''
              }
            } catch {}
            // Insert login log
            (supabase.from('login_historial') as any).insert({
              usuario_id: userId, ip, ciudad, pais, pais_codigo: paisCodigo,
              user_agent: navigator.userAgent,
            }).then(() => {})
            // Update last login
            (supabase.from('usuarios') as any).update({
              last_login_at: now, last_login_ip: ip,
              last_login_ciudad: ciudad, last_login_pais: pais,
            }).eq('id', userId).then(() => {})
            // Force password change
            if ((u as any).force_password_change) {
              router.push('/cambiar-password')
              return
            }
          }
        } catch {}
      }
      router.push('/dashboard')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #052698 0%, #1168F8 100%)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8">
        <div className="flex justify-center mb-8">
          <Image src="/logo.png" alt="Puertonoa" width={180} height={52} style={{ objectFit: 'contain' }} />
        </div>
        <h1 className="text-lg font-semibold text-gray-900 mb-1">Iniciar sesión</h1>
        <p className="text-xs text-gray-500 mb-6">Sistema logístico · Acceso interno</p>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1168F8]"
              placeholder="correo@puertonoa.com" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Contraseña</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1168F8]"
              placeholder="••••••••" />
          </div>
          {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
          <button type="submit" disabled={loading}
            className="w-full text-white font-medium py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60"
            style={{ background: '#1168F8' }}>
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
        <p className="text-xs text-gray-400 text-center mt-6">¿Sin acceso? Contactá al administrador del sistema.</p>
      </div>
    </div>
  )
}
