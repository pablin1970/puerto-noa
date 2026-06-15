'use client'
import { useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function AuthCallbackPage() {
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function handleCallback() {
      const { data, error } = await supabase.auth.getSession()

      if (error || !data.session) {
        router.push('/?error=auth_error')
        return
      }

      const user = data.session.user

      // Verificar que el usuario existe y está activo
      const { data: u } = await supabase
        .from('usuarios')
        .select('id, activo')
        .eq('email', user.email)
        .single()

      if (!u || !(u as any).activo) {
        await supabase.auth.signOut()
        router.push('/?error=usuario_inactivo')
        return
      }

      // Vincular auth_id y registrar login
      await (supabase.from('usuarios') as any)
        .update({
          auth_id: user.id,
          last_login_at: new Date().toISOString()
        })
        .eq('email', user.email)

      router.push('/dashboard')
    }

    handleCallback()
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #052698 0%, #1168F8 100%)' }}>
      <div className="bg-white rounded-2xl shadow-2xl p-8 text-center">
        <div className="w-8 h-8 border-4 border-[#1168F8] border-t-transparent rounded-full animate-spin mx-auto mb-4"/>
        <p className="text-sm text-gray-600">Verificando acceso...</p>
      </div>
    </div>
  )
}
