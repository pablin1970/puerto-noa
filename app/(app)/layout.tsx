'use client'
import { useEffect, useState, useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
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
  modulo?: string  // para verificar permisos
}

const NAV: NavItem[] = [
  // ── INICIO ─────────────────────────────────────────
  { href: '/dashboard',              label: 'Dashboard logístico',  icon: '⊞', modulo: 'dashboard' },
  { href: '/contabilidad/dashboard', label: 'Dashboard financiero', icon: '💹', modulo: 'dashboard_financiero' },

  // ── VENTAS ─────────────────────────────────────────
  { label: 'VENTAS', section: true },
  { href: '/cotizador', label: 'Nueva cotizacion', icon: '✦', modulo: 'cotizaciones' },
  { href: '/registro',  label: 'Cotizaciones',     icon: '☰' },
  { href: '/clientes',  label: 'Clientes',         icon: '🏢', modulo: 'clientes' },

  // ── OPERACIONES ────────────────────────────────────
  { label: 'OPERACIONES', section: true },
  { href: '/operaciones',              label: 'Operaciones activas',      icon: '🚢', modulo: 'operaciones' },
  { href: '/cierre',                   label: 'Liquidacion y cierre',     icon: '✓', modulo: 'cierre' },
  { href: '/cotizaciones-proveedores', label: 'Cotizaciones proveedores', icon: '📋', modulo: 'cotizaciones_proveedores' },
  { href: '/precios',                  label: 'Inteligencia de precios',  icon: '📊', modulo: 'precios' },
  { href: '/clientes',                 label: 'Proveedores',              icon: '📦', modulo: 'proveedores' },

  // ── FINANZAS CLIENTES ──────────────────────────────
  { label: 'FINANZAS CLIENTES', section: true },
  { href: '/facturacion/emitidas',        label: 'Facturas emitidas',     icon: '📄', modulo: 'facturas_emitidas' },
  { href: '/facturacion/recibidas',       label: 'Facturas recibidas',    icon: '📥', modulo: 'facturas_recibidas' },
  { href: '/facturacion/cte-clientes',    label: 'Cta. cte. clientes',    icon: '👥', modulo: 'cte_clientes' },
  { href: '/facturacion/cte-proveedores', label: 'Cta. cte. proveedores', icon: '🤝', modulo: 'cte_proveedores' },
  { href: '/fondos',                      label: 'Fondos en custodia',    icon: '🏦', modulo: 'fondos_custodia' },

  // ── TESORERÍA ──────────────────────────────────────
  { label: 'TESORERÍA', section: true },
  { href: '/tesoreria/flujo', label: 'Flujo cuentas',   icon: '↔', modulo: 'flujo_cuentas' },
  { href: '/tipos-cambio',    label: 'Tipos de cambio', icon: '💱', modulo: 'tipos_cambio' },

  // ── CONTABILIDAD ───────────────────────────────────
  { label: 'CONTABILIDAD', section: true },
  { href: '/contabilidad/iva',        label: 'Libro IVA',       icon: '📖', modulo: 'iva' },
  { href: '/contabilidad/gastos',     label: 'Gastos y costos', icon: '📉', modulo: 'gastos_fijos' },
  { href: '/contabilidad/resultados', label: 'Resultados',      icon: '📈', modulo: 'resultados' },

  // ── CONFIGURACIÓN ──────────────────────────────────
  { label: 'CONFIGURACION', section: true },
  { href: '/catalogos',       label: 'Catálogos',    icon: '📚', modulo: 'catalogos' },
  { href: '/tributos-config', label: 'Tributos ARCA', icon: '§', adminOnly: true },
  { href: '/usuarios',        label: 'Usuarios',      icon: '◎', adminOnly: true },
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
  const [permisos, setPermisos] = useState<Record<string, string[]>>({})  // modulo → acciones permitidas
  const [collapsed, setCollapsed] = useState(false)
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    // El middleware ya protege las rutas — aquí solo cargamos los datos del usuario
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.push('/'); return }
      const { data: u } = await supabase.from('usuarios').select('*').eq('auth_id', data.user.id).single()
      if (!u) { router.push('/'); return }
      setUser(u as Usuario)
      // Cargar permisos del rol — el rol está en roles_ids[0]
      const rolId = Array.isArray((u as any).roles_ids) && (u as any).roles_ids.length > 0
        ? (u as any).roles_ids[0]
        : null
      if (rolId) {
        const { data: perms } = await supabase
          .from('rol_permisos')
          .select('modulo, accion')
          .eq('rol_id', rolId)
          .eq('permitido', true)
        if (perms) {
          const map: Record<string, string[]> = {}
          for (const p of perms as any[]) {
            if (!map[p.modulo]) map[p.modulo] = []
            map[p.modulo].push(p.accion)
          }
          setPermisos(map)
        }
      }
    })
    // Escuchar cambios de sesión (logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') { router.push('/'); return }
      if (event === 'SIGNED_IN' && session?.user) {
        const { data: u } = await supabase.from('usuarios').select('*').eq('auth_id', session.user.id).single()
        if (u) setUser(u as Usuario)
      }
    })
    loadTC()
    return () => subscription.unsubscribe()
  }, [])

  async function loadTC() {
    try {
      const { data, error } = await supabase
        .from('tipos_cambio_eventos')
        .select('ars, clp, cny, fecha, fuente, created_at')
        .order('created_at', { ascending: false })
        .limit(10)
      if (error || !data || data.length === 0) return
      const latest: TCWidget = { ARS: null, CLP: null, CNY: null, fecha: '', hora: '', fuente: '' }
      for (const ev of data as any[]) {
        if (latest.ARS === null && ev.ars !== null) {
          latest.ARS = ev.ars
          if (!latest.fecha) {
            latest.fecha = ev.fecha
            latest.hora = new Date(ev.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
            latest.fuente = ev.fuente === 'automatico' ? '🤖' : ev.fuente === 'forzado' ? '⚡' : '✏️'
          }
        }
        if (latest.CLP === null && ev.clp !== null) latest.CLP = ev.clp
        if (latest.CNY === null && ev.cny !== null) latest.CNY = ev.cny
        if (latest.ARS !== null && latest.CLP !== null && latest.CNY !== null) break
      }
      setTc(latest)
    } catch {}
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
            className="text-white/60 hover:text-white transition-colors text-sm p-1 rounded-lg hover:bg-white/10">
            {collapsed ? '›' : '‹'}
          </button>
        </div>

        {/* Fecha + TC Widget */}
        {!collapsed && (
          <div className="mx-3 mt-3 mb-1 rounded-xl overflow-hidden" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.15)' }}>
            <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <span className="text-[10px] text-white/80 font-medium capitalize">{hoy}</span>
              <Link href="/tipos-cambio" className="text-[9px] text-white/50 hover:text-white transition-colors">TC →</Link>
            </div>
            <div className="px-3 py-2 space-y-1.5">
              {[
                { moneda: 'ARS', flag: '🇦🇷', valor: tc.ARS, decimals: 0 },
                { moneda: 'CLP', flag: '🇨🇱', valor: tc.CLP, decimals: 0 },
                { moneda: 'CNY', flag: '🇨🇳', valor: tc.CNY, decimals: 4 },
              ].map(({ moneda, flag, valor, decimals }) => (
                <div key={moneda} className="flex items-center justify-between">
                  <span className="text-[11px] text-white/70 font-medium">{flag} {moneda}</span>
                  <span className="font-mono font-bold text-white text-[12px]">
                    {valor !== null ? (decimals > 0 ? valor.toFixed(decimals) : Math.round(valor).toLocaleString('es-AR')) : '-'}
                  </span>
                </div>
              ))}
              {tc.fecha && (
                <div className="pt-1 mt-1 flex items-center justify-between" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                  <span className="text-[9px] text-white/50">{tc.fuente} {tc.fecha ? tc.fecha.split('-').reverse().join('/') : ''} {tc.hora}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 py-2 overflow-y-auto scrollbar-thin">
          {NAV.map((item, i) => {
            if (item.section) return (
              <div key={i} className={`${collapsed ? 'hidden' : ''} px-3 pt-4 pb-1 text-[8px] font-black text-white/40 tracking-widest uppercase flex items-center gap-1`}>
                <div className="flex-1 h-px bg-white/10"></div>
                <span>{item.label}</span>
                <div className="flex-1 h-px bg-white/10"></div>
              </div>
            )
            if (!item.href) return null
            const active = pathname === item.href || pathname.startsWith(item.href + '/')
            if (item.adminOnly && user?.rol !== 'admin') return null
            // Filtrar por permisos del rol — si el ítem tiene módulo y el usuario tiene permisos cargados
            if (item.modulo && Object.keys(permisos).length > 0) {
              const tienePermiso = permisos[item.modulo] && permisos[item.modulo].includes('ver')
              if (!tienePermiso) return null
            }

            return (
              <div key={item.href} className="relative group">
                {item.soon ? (
                  <div className={`flex items-center gap-2 mx-2 px-3 py-1.5 rounded-lg text-[11px] mb-0.5 opacity-40 cursor-not-allowed ${collapsed ? 'justify-center' : ''}`}>
                    <span className={`${collapsed ? 'text-base' : 'text-sm'} w-4 text-center flex-shrink-0 text-white/40`}>{item.icon}</span>
                    {!collapsed && <span className="text-white/40 truncate">{item.label}</span>}
                    {!collapsed && <span className="ml-auto text-[7px] text-white/30 uppercase tracking-wide bg-white/10 px-1.5 py-0.5 rounded-full">Pronto</span>}
                  </div>
                ) : (
                  <Link href={item.href}
                    className={`flex items-center gap-2 mx-2 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all mb-0.5 ${collapsed ? 'justify-center' : ''} ${
                      active
                        ? 'bg-white/20 text-white shadow-sm'
                        : 'text-white/70 hover:text-white hover:bg-white/10'
                    }`}>
                    <span className={`${collapsed ? 'text-base' : 'text-sm'} w-4 text-center flex-shrink-0`}>{item.icon}</span>
                    {!collapsed && <span className="truncate">{item.label}</span>}
                    {!collapsed && item.adminOnly && <span className="ml-auto text-[7px] text-white/40 uppercase tracking-wide">Admin</span>}
                  </Link>
                )}
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
                <div className="text-white/50 text-[9px] capitalize">{user.rol}</div>
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
          {/* Ayuda */}
          <div className={`border-t border-white/10 pt-2 mb-1 ${collapsed?'mx-0':'mx-1'}`}>
            <Link href="/ayuda"
              className={`flex items-center gap-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-[11px] py-1.5 ${collapsed?'justify-center px-0':'px-2'}`}>
              <span className="text-sm">📖</span>
              {!collapsed && <span className="font-medium">Ayuda</span>}
            </Link>
          </div>
          <button onClick={handleLogout}
            className={`w-full text-white/50 hover:text-white/80 text-[10px] transition-colors rounded-lg hover:bg-white/10 py-1 ${collapsed ? 'px-0 text-center' : 'px-2 text-left'}`}>
            {collapsed ? '↪' : '↪ Cerrar sesion'}
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
