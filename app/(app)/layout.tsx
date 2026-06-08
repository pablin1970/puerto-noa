'use client'
import { useEffect, useState, useMemo } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import Image from 'next/image'
import type { Usuario } from '@/types'

interface NavItem {
  href?: string
  label: string
  icon?: string
  section?: boolean
  adminOnly?: boolean
  soon?: boolean
}

const NAV: NavItem[] = [
  // GENERAL
  { href: '/dashboard', label: 'Dashboard', icon: '⊞' },

  // COMERCIAL
  { label: 'COMERCIAL', section: true },
  { href: '/cotizador', label: 'Nueva cotización', icon: '✦' },
  { href: '/registro', label: 'Cotizaciones', icon: '☰' },
  { href: '/clientes', label: 'Clientes y proveedores', icon: '🏢' },

  // OPERACIONES
  { label: 'OPERACIONES', section: true },
  { href: '/operaciones', label: 'Operaciones activas', icon: '🚢' },
  { href: '/cierre', label: 'Liquidación y cierre', icon: '✓' },

  // FACTURACIÓN
  { label: 'FACTURACIÓN', section: true },
  { href: '/facturacion/emitidas', label: 'Facturas emitidas', icon: '📄', soon: true },
  { href: '/facturacion/recibidas', label: 'Facturas recibidas', icon: '📥', soon: true },
  { href: '/facturacion/cte-clientes', label: 'Cta. cte. clientes', icon: '👥', soon: true },
  { href: '/facturacion/cte-proveedores', label: 'Cta. cte. proveedores', icon: '📦', soon: true },

  // TESORERÍA
  { label: 'TESORERÍA', section: true },
  { href: '/tesoreria/caja', label: 'Caja', icon: '💵', soon: true },
  { href: '/tesoreria/bancos', label: 'Bancos', icon: '🏦', soon: true },
  { href: '/tesoreria/fondos', label: 'Fondos por operación', icon: '💰', soon: true },
  { href: '/tesoreria/puertonoa-arg', label: 'Cta. Puerto NOA Arg.', icon: '🇦🇷', soon: true },

  // CONTABILIDAD
  { label: 'CONTABILIDAD', section: true },
  { href: '/contabilidad/iva', label: 'Libro IVA', icon: '📊', soon: true },
  { href: '/contabilidad/gastos', label: 'Gastos y costos', icon: '📉', soon: true },
  { href: '/contabilidad/resultados', label: 'Resultados', icon: '📈', soon: true },

  // CONFIGURACIÓN
  { label: 'CONFIGURACIÓN', section: true },
  { href: '/tarifas', label: 'Tarifas base', icon: '⚙' },
  { href: '/tipos-cambio', label: 'Tipos de cambio', icon: '💱' },
  { href: '/tributos-config', label: 'Tributos ARCA', icon: '§', adminOnly: true },
  { href: '/usuarios', label: 'Usuarios', icon: '◎', adminOnly: true },
]

interface TCWidget {
  ARS: number | null
  CLP: number | null
  CNY: number | null
  fecha: string
  hora: string
  fuente: string
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [user, setUser] = useState<Usuario | null>(null)
  const [tc, setTc] = useState<TCWidget>({ ARS: null, CLP: null, CNY: null, fecha: '', hora: '', fuente: '' })
  const [collapsed, setCollapsed] = useState(false)
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
      .select('ars, clp, cny, fecha, fuente, created_at')
      .order('created_at', { ascending: false })
      .limit(10)
    if (data && data.length > 0) {
      const latest: TCWidget = { ARS: null, CLP: null, CNY: null, fecha: '', hora: '', fuente: '' }
      for (const ev of data as any[]) {
        if (latest.ARS === null && ev.ars !== null) {
          latest.ARS = ev.ars
          if (!latest.fecha) {
            latest.fecha = ev.fecha
            latest.hora = new Date(ev.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
            latest.fuente = ev.fuente === 'automatico' ? '🤖 Sistema' : ev.fuente === 'forzado' ? '⚡' : '✏️'
          }
        }
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

  const hoy = new Date().toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <div className="flex h-screen overflow-hidden">
      {/* SIDEBAR */}
      <aside className={`${collapsed ? 'w-14' : 'w-56'} flex-shrink-0 flex flex-col transition-all duration-200`}
        style={{ background: 'linear-gradient(180deg, #0a3ab8 0%, #1168F8 60%, #1a74ff 100%)' }}>

        {/* Logo + collapse */}
        <div className={`flex items-center ${collapsed ? 'justify-center px-2' : 'justify-between px-4'} py-4 border-b border-white/10`}>
          {!collapsed && (
            <Image src="/logo-white.png" alt="Puertonoa" width={120} height={36} style={{ objectFit: 'contain' }} />
          )}
          <button onClick={() => setCollapsed(!collapsed)}
            className="text-white/40 hover:text-white transition-colors text-sm p-1 rounded-lg hover:bg-white/10">
            {collapsed ? '›' : '‹'}
          </button>
        </div>

        {/* Fecha + TC Widget */}
        {!collapsed && (
          <div className="mx-3 mt-3 mb-1 rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
            {/* Fecha y hora */}
            <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <span className="text-[10px] text-white/60 font-medium capitalize">{hoy}</span>
              <Link href="/tipos-cambio" className="text-[9px] text-white/30 hover:text-white/60 transition-colors">TC →</Link>
            </div>
            {/* TC rows */}
            <div className="px-3 py-2 space-y-1.5">
              {[
                { moneda: 'ARS', flag: '🇦🇷', valor: tc.ARS, decimals: 0 },
                { moneda: 'CLP', flag: '🇨🇱', valor: tc.CLP, decimals: 0 },
                { moneda: 'CNY', flag: '🇨🇳', valor: tc.CNY, decimals: 4 },
              ].map(({ moneda, flag, valor, decimals }) => (
                <div key={moneda} className="flex items-center justify-between">
                  <span className="text-[10px] text-white/40">{flag} {moneda}</span>
                  <span className="font-mono font-bold text-white text-[11px]">
                    {valor !== null ? (decimals > 0 ? valor.toFixed(decimals) : Math.round(valor).toLocaleString('es-AR')) : '—'}
                  </span>
                </div>
              ))}
              {tc.fecha && (
                <div className="pt-1 mt-1 flex items-center justify-between" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <span className="text-[9px] text-white/25">{tc.fuente} {tc.fecha} {tc.hora}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 py-2 overflow-y-auto scrollbar-thin">
          {NAV.map((item, i) => {
            if (item.section) return (
              <div key={i} className={`${collapsed ? 'hidden' : ''} px-3 pt-4 pb-1 text-[8px] font-black text-white/25 tracking-widest uppercase flex items-center gap-1`}>
                <div className="flex-1 h-px bg-white/10"></div>
                <span>{item.label}</span>
                <div className="flex-1 h-px bg-white/10"></div>
              </div>
            )
            if (!item.href) return null
            const active = pathname === item.href || pathname.startsWith(item.href + '/')
            if (item.adminOnly && user?.rol !== 'admin') return null

            return (
              <div key={item.href} className="relative group">
                {item.soon ? (
                  <div className={`flex items-center gap-2 mx-2 px-3 py-1.5 rounded-lg text-[11px] mb-0.5 opacity-40 cursor-not-allowed ${collapsed ? 'justify-center' : ''}`}>
                    <span className={`${collapsed ? 'text-base' : 'text-sm'} w-4 text-center flex-shrink-0 text-white/40`}>{item.icon}</span>
                    {!collapsed && <span className="text-white/40 truncate">{item.label}</span>}
                    {!collapsed && <span className="ml-auto text-[7px] text-white/20 uppercase tracking-wide bg-white/10 px-1.5 py-0.5 rounded-full">Pronto</span>}
                  </div>
                ) : (
                  <Link href={item.href}
                    className={`flex items-center gap-2 mx-2 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all mb-0.5 ${collapsed ? 'justify-center' : ''} ${
                      active
                        ? 'bg-white/20 text-white shadow-sm'
                        : 'text-white/55 hover:text-white hover:bg-white/10'
                    }`}>
                    <span className={`${collapsed ? 'text-base' : 'text-sm'} w-4 text-center flex-shrink-0`}>{item.icon}</span>
                    {!collapsed && <span className="truncate">{item.label}</span>}
                    {!collapsed && item.adminOnly && <span className="ml-auto text-[7px] text-white/25 uppercase tracking-wide">Admin</span>}
                  </Link>
                )}
                {/* Tooltip when collapsed */}
                {collapsed && (
                  <div className="absolute left-full top-0 ml-2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                    {item.label}
                    {item.soon && <span className="ml-1 text-white/40">(pronto)</span>}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* User */}
        <div className={`${collapsed ? 'px-2' : 'px-3'} py-3`} style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          {user && !collapsed && (
            <div className="flex items-center gap-2 mb-2 px-1">
              <div className="w-7 h-7 rounded-xl flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.15)' }}>
                {user.iniciales}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white text-[11px] font-semibold truncate">{user.nombre.split(' ')[0]}</div>
                <div className="text-white/30 text-[9px] capitalize">{user.rol}</div>
              </div>
            </div>
          )}
          {user && collapsed && (
            <div className="flex justify-center mb-2">
              <div className="w-7 h-7 rounded-xl flex items-center justify-center text-white text-[10px] font-bold"
                style={{ background: 'rgba(255,255,255,0.15)' }}>
                {user.iniciales}
              </div>
            </div>
          )}
          <button onClick={handleLogout}
            className={`w-full text-white/30 hover:text-white/60 text-[10px] transition-colors rounded-lg hover:bg-white/10 py-1 ${collapsed ? 'px-0 text-center' : 'px-2 text-left'}`}>
            {collapsed ? '↪' : '↪ Cerrar sesión'}
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
