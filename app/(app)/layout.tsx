'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import Image from 'next/image'
import type { Usuario } from '@/types'

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: '⊞', section: null },
  { href: null, label: 'MÓDULO 1', icon: null, section: true },
  { href: '/cotizador', label: 'Cotizador', icon: '✦' },
  { href: '/tarifas', label: 'Tarifas base', icon: '⚙' },
  { href: null, label: 'MÓDULO 2', icon: null, section: true },
  { href: '/registro', label: 'Cotizaciones', icon: '☰' },
  { href: '/usuarios', label: 'Usuarios', icon: '◎' },
  { href: null, label: 'MÓDULO 3', icon: null, section: true },
  { href: '/operaciones', label: 'Operaciones', icon: '⟳' },
  { href: null, label: 'MÓDULO 4', icon: null, section: true },
  { href: '/cierre', label: 'Liquidación', icon: '✓' },
]

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [user, setUser] = useState<Usuario | null>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.push('/'); return }
      const { data: u } = await supabase
        .from('usuarios')
        .select('*')
        .eq('auth_id', data.user.id)
        .single()
      if (u) setUser(u as Usuario)
    })
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/')
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* SIDEBAR */}
      <aside className="w-52 flex-shrink-0 flex flex-col" style={{ background: '#052698' }}>
        {/* Logo */}
        <div className="px-4 py-4 border-b border-white/10 flex items-center justify-center">
          <Image
            src="/logo-white.png"
            alt="Puertonoa"
            width={140}
            height={40}
            style={{ objectFit: 'contain' }}
          />
        </div>

        {/* Nav */}
        <nav className="flex-1 py-2 overflow-y-auto">
          {NAV.map((item, i) => {
            if (item.section) return (
              <div key={i} className="px-3 pt-4 pb-1 text-[9px] font-bold text-white/30 tracking-widest uppercase">
                {item.label}
              </div>
            )
            if (!item.href) return null
            const active = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 mx-2 px-3 py-2 rounded-lg text-xs font-medium transition-all mb-0.5 ${
                  active
                    ? 'bg-[#1168F8] text-white'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                <span className="text-sm w-4 text-center">{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* User */}
        <div className="px-3 py-3 border-t border-white/10">
          {user && (
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-full bg-[#1168F8] flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                {user.iniciales}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white text-[11px] font-medium truncate">{user.nombre.split(' ')[0]}</div>
                <div className="text-white/40 text-[9px] capitalize">{user.rol}</div>
              </div>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="w-full text-left text-white/40 hover:text-white/70 text-[10px] px-1 py-1 transition-colors"
          >
            ↪ Cerrar sesión
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 overflow-y-auto bg-gray-50">
        {children}
      </main>
    </div>
  )
}
