'use client'
import { useEffect, useState, useMemo } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import Image from 'next/image'
import type { Usuario } from '@/types'

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: '⊞' },
  { label: 'COMERCIAL', section: true },
  { href: '/cotizador', label: 'Nueva cotización', icon: '✦' },
  { href: '/registro', label: 'Cotizaciones', icon: '☰' },
  { href: '/clientes', label: 'Clientes y proveedores', icon: '🏢' },
  { label: 'OPERACIONES', section: true },
  { href: '/operaciones', label: 'Operaciones activas', icon: '🚢' },
  { href: '/cierre', label: 'Liquidación y cierre', icon: '✓' },
  { label: 'FACTURACIÓN', section: true },
  { href: '/facturacion/emitidas', label: 'Facturas emitidas', icon: '📄' },
  { href: '/facturacion/recibidas', label: 'Facturas recibidas', icon: '📥' },
  { href: '/facturacion/cte-clientes', label: 'Cta. cte. clientes', icon: '👥' },
  { href: '/facturacion/cte-proveedores', label: 'Cta. cte. proveedores', icon: '📦' },
  { label: 'TESORERÍA', section: true },
  { href: '/tesoreria/caja', label: 'Caja', icon: '💵', soon: true },
  { href: '/tesoreria/bancos', label: 'Bancos', icon: '🏦', soon: true },
  { href: '/tesoreria/fondos', label: 'Fondos por operación', icon: '💰', soon: true },
  { href: '/tesoreria/puertonoa-arg', label: 'Cta. Puerto NOA Arg.', icon: '🇦🇷', soon: true },
  { label: 'CONTABILIDAD', section: true },
  { href: '/contabilidad/iva', label: 'Libro IVA', icon: '📊', soon: true },
  { href: '/contabilidad/gastos', label: 'Gastos y costos', icon: '📉', soon: true },
  { href: '/contabilidad/resultados', label: 'Resultados', icon: '📈', soon: true },
  { label: 'CONFIGURACIÓN', section: true },
  { href: '/tarifas', label: 'Tarifas base', icon: '⚙' },
  { href: '/tipos-cambio', label: 'Tipos de cambio', icon: '💱' },
  { href: '/tributos-config', label: 'Tributos ARCA', icon: '§', adminOnly: true },
  { href: '/usuarios', label: 'Usuarios', icon: '◎', adminOnly: true },
]

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [user, setUser] = useState<Usuario | null>(null)
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.push('/'); return }
      const { data: u } = await supabase.from('usuarios').select('*').eq('auth_id', data.user.id).single()
      if (u) setUser(u as Usuario)
    })
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/')
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-56 flex-shrink-0 flex flex-col" style={{ background: 'linear-gradient(180deg, #052698 0%, #1168F8 100%)' }}>
        <div className="px-4 py-4 border-b border-white/10 flex justify-center">
          <Image src="/logo-white.png" alt="Puertonoa" width={130} height={38} style={{ objectFit: 'contain' }} />
        </div>
        <nav className="flex-1 py-2 overflow-y-auto">
          {NAV.map((item: any, i) => {
            if (item.section) return (
              <div key={i} className="px-3 pt-4 pb-1 text-[8px] font-black text-white/25 tracking-widest uppercase flex items-center gap-1">
                <div className="flex-1 h-px bg-white/10"></div>
                <span>{item.label}</span>
                <div className="flex-1 h-px bg-white/10"></div>
              </div>
            )
            if (!item.href) return null
            const active = pathname === item.href || pathname.startsWith(item.href + '/')
            if (item.adminOnly && user?.rol !== 'admin') return null
            if (item.soon) return (
              <div key={item.href} className="flex items-center gap-2 mx-2 px-3 py-1.5 rounded-lg text-[11px] mb-0.5 opacity-35 cursor-not-allowed">
                <span className="text-sm w-4 text-center flex-shrink-0 text-white/40">{item.icon}</span>
                <span className="text-white/40 truncate">{item.label}</span>
                <span className="ml-auto text-[7px] text-white/20 uppercase bg-white/10 px-1.5 py-0.5 rounded-full">Pronto</span>
              </div>
            )
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-2 mx-2 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors mb-0.5 ${active ? 'bg-white/20 text-white' : 'text-white/55 hover:text-white hover:bg-white/10'}`}>
                <span className="text-sm w-4 text-center flex-shrink-0">{item.icon}</span>
                <span className="truncate">{item.label}</span>
                {item.adminOnly && <span className="ml-auto text-[7px] text-white/25 uppercase">Admin</span>}
              </Link>
            )
          })}
        </nav>
        <div className="px-3 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          {user && (
            <div className="flex items-center gap-2 mb-2 px-1">
              <div className="w-7 h-7 rounded-xl flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ background: 'rgba(255,255,255,0.15)' }}>
                {user.iniciales}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white text-[11px] font-semibold truncate">{user.nombre.split(' ')[0]}</div>
                <div className="text-white/30 text-[9px] capitalize">{user.rol}</div>
              </div>
            </div>
          )}
          <button onClick={handleLogout} className="w-full text-left text-white/30 hover:text-white/60 text-[10px] px-1 py-1 transition-colors">
            ↪ Cerrar sesión
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto bg-gray-50">
        {children}
      </main>
    </div>
  )
}
