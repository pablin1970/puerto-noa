'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import Image from 'next/image'

export default function LoginPage() {
  const [loadingGoogle, setLoadingGoogle] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  // Mensajes que devuelve /auth/callback ante un acceso denegado
  useEffect(() => {
    const err = new URLSearchParams(window.location.search).get('error')
    if (err === 'usuario_inactivo') setError('Tu usuario no está habilitado para ingresar. Contactá al administrador.')
    else if (err === 'auth_error') setError('No pudimos completar el inicio de sesión. Probá de nuevo.')
  }, [])

  async function handleGoogle() {
    setLoadingGoogle(true)
    setError('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // Forzar SIEMPRE el selector de cuentas de Google: así se puede elegir
        // entre cuentas y no entra automáticamente con la sesión ya abierta.
        queryParams: { prompt: 'select_account' },
      },
    })
    if (error) {
      setError('Error al conectar con Google. Intentá de nuevo.')
      setLoadingGoogle(false)
    }
    // Si no hay error, Google redirige automáticamente
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #052698 0%, #1168F8 100%)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8">
        <div className="flex justify-center mb-8">
          <Image src="/logo.png" alt="Puertonoa" width={180} height={52} style={{ objectFit: 'contain' }} />
        </div>
        <h1 className="text-lg font-semibold text-gray-900 mb-1">Iniciar sesión</h1>
        <p className="text-xs text-gray-500 mb-6">Sistema logístico · Acceso interno</p>

        {/* Login con Google (único método) */}
        <button onClick={handleGoogle} disabled={loadingGoogle}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 border-2 border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all disabled:opacity-60">
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

        {error && <div className="mt-4 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

        <p className="text-xs text-gray-400 text-center mt-6">Ingresá con tu cuenta corporativa de Google.<br/>¿Sin acceso? Contactá al administrador del sistema.</p>
        <div className="mt-8 pt-4 border-t border-gray-100 text-center">
          <p style={{ fontFamily: "'Georgia', 'Times New Roman', serif", fontSize: '12px', color: '#6b7280', letterSpacing: '0.05em', fontStyle: 'italic', fontWeight: 400 }}>Developed by Pablin</p>
        </div>
      </div>
    </div>
  )
}
