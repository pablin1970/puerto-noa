'use client'
import { useEffect, useState, useMemo } from 'react'
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
  { href: '/tributos-config', label: 'Tributos ARCA', icon: '§', adminOnly: true },
  { href: null, label: 'MÓDULO 2', icon: null, section: true },
  { href: '/registro', label: 'Cotizaciones', icon: '☰' },
  { href: '/clientes', label: 'Clientes / Proveed.', icon: '🏢' },
  { href: '/usuarios', label: 'Usuarios', icon: '◎' },
  { href: null, label: 'MÓDULO 3', icon: null, section: true },
  { href: '/operaciones', label: 'Operaciones', icon: '⟳' },
  { href: null, label: 'MÓDULO 4', icon: null, section: true },
  { href: '/cierre', label: 'Liquidación', icon: '✓' },
  { href: '/tipos-cambio', label: 'Tipos de cambio', icon: '💱' },
]

interface TCWidget {
  ARS: number | null
  CLP: number | null
  CNY: number | null
  fecha: string
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [user, setUser] = useState<Usuario | null>(null)
  const [tc, setTc] = useState<TCWidget>({ ARS: null, CLP: null, CNY: null, fecha: '' })
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.push('/'); return }
      const { data: u } = await supabase.from('usuarios').select('*').eq('auth_id', data.user.id).single()
      if (u) setUser(u as Usuario)
    })
    loadTC()
  }, [])

  async function loadTC() {
    const { data } = await supabase
      .from('tipos_cambio_eventos')
      .select('ars, clp, cny, fecha')
      .order('created_at', { ascending: false })
      .limit(20)
    if (data && data.length > 0) {
      const latest: TCWidget = { ARS: null, CLP: null, CNY: null, fecha: '' }
      for (const ev of data as any[]) {
        if (latest.ARS === null && ev.ars !== null) { latest.ARS = ev.ars; if (!latest.fecha) latest.fecha = ev.fecha }
        if (latest.CLP === null && ev.clp !== null) latest.CLP = ev.clp
        if (latest.CNY === null && ev.cny !== null) latest.CNY = ev.cny
        if (latest.ARS !== null && latest.CLP !== null && latest.CNY !== null) break
      }
      setTc(latest)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/')
  }

  const hoy = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })

  return (
    <div className="flex h-screen overflow-hidden">
      {/* SIDEBAR */}
      <aside className="w-56 flex-shrink-0 flex flex-col" style={{ background: '#052698' }}>
        {/* Logo */}
        <div className="px-4 py-4 border-b border-white/10 flex items-center justify-center">
          <Image src="/logo-white.png" alt="Puertonoa" width={140} height={40} style={{ objectFit: 'contain' }} />
        </div>

        {/* Fecha + TC Widget */}
        <div className="mx-2 mt-3 mb-1 rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
          {/* Fecha */}
          <div className="px-3 py-2 flex items-center justify-between border-b border-white/10">
            <span className="text-[10px] text-white/50">📅 {hoy}</span>
            <Link href="/tipos-cambio" className="text-[9px] text-white/30 hover:text-white/60 transition-colors">ver hist. →</Link>
          </div>
          {/* TC rows */}
          <div className="px-3 py-2 space-y-1.5">
            {[
              { moneda: 'ARS', flag: '🇦🇷', valor: tc.ARS },
              { moneda: 'CLP', flag: '🇨🇱', valor: tc.CLP },
              { moneda: 'CNY', flag: '🇨🇳', valor: tc.CNY },
            ].map(({ moneda, flag, valor }) => (
              <div key={moneda} className="flex items-center justify-between">
                <span className="text-[10px] text-white/50">{flag} USD/{moneda}</span>
                <span className="font-mono font-bold text-white text-[11px]">
                  {valor !== null ? (moneda === 'CNY' ? valor.toFixed(4) : Math.round(valor).toLocaleString('es-AR')) : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-2 overflow-y-auto">
          {NAV.map((item, i) => {
            if (item.section) return (
              <div key={i} className="px-3 pt-4 pb-1 text-[9px] font-bold text-white/30 tracking-widest uppercase">{item.label}</div>
            )
            if (!item.href) return null
            const active = pathname === item.href || pathname.startsWith(item.href + '/')
            if ((item as any).adminOnly && user?.rol !== 'admin') return null
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-2 mx-2 px-3 py-2 rounded-lg text-xs font-medium transition-all mb-0.5 ${
                  active ? 'bg-[#1168F8] text-white' : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}>
                <span className="text-sm w-4 text-center">{item.icon}</span>
                {item.label}
                {(item as any).adminOnly && <span className="ml-auto text-[8px] text-white/30 uppercase tracking-wide">Admin</span>}
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
          <button onClick={handleLogout} className="w-full text-left text-white/40 hover:text-white/70 text-[10px] px-1 py-1 transition-colors">
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
