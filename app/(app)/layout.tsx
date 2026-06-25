'use client'
import { useEffect, useState, useMemo, useRef, Suspense } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import Image from 'next/image'
import type { Usuario } from '@/types'
import { modulosPendientesSet } from '@/lib/modulos'
import { cargarPermisos, esSuperAdmin } from '@/lib/permisos'
import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard, LineChart, Sparkles, List, Building2,
  Ship, ClipboardCheck, ClipboardList, BarChart3, Package,
  FileText, FileDown, Users, Handshake,
  Receipt, Send, Link2, Repeat, ArrowLeftRight, Landmark, DollarSign,
  BookOpen, TrendingDown, TrendingUp,
  Library, UserCog,
  ChevronLeft, ChevronRight, AlertTriangle, HelpCircle, LogOut,
} from 'lucide-react'

interface NavItem {
  href?: string
  label: string
  icon?: LucideIcon
  section?: boolean
  adminOnly?: boolean
  soon?: boolean
  modulo?: string  // para verificar permisos
}

const NAV: NavItem[] = [
  // ── INICIO ─────────────────────────────────────────
  { href: '/dashboard',              label: 'Dashboard logístico',  icon: LayoutDashboard, modulo: 'dashboard' },
  { href: '/contabilidad/dashboard', label: 'Dashboard financiero', icon: LineChart, modulo: 'dashboard_financiero' },

  // ── COMERCIAL ──────────────────────────────────────
  { label: 'Comercial', section: true },
  { href: '/cotizador', label: 'Nueva cotización', icon: Sparkles, modulo: 'cotizaciones' },
  { href: '/registro',  label: 'Cotizaciones',     icon: List, modulo: 'cotizaciones' },
  { href: '/clientes',  label: 'Clientes',         icon: Building2, modulo: 'clientes' },

  // ── OPERACIONES ────────────────────────────────────
  { label: 'Operaciones', section: true },
  { href: '/operaciones',              label: 'Operaciones activas',      icon: Ship, modulo: 'operaciones' },
  { href: '/cierre',                   label: 'Liquidación y cierre',     icon: ClipboardCheck, modulo: 'cierre' },
  { href: '/cotizaciones-proveedores', label: 'Cotizaciones proveedores', icon: ClipboardList, modulo: 'cotizaciones_proveedores' },
  { href: '/precios',                  label: 'Inteligencia de precios',  icon: BarChart3, modulo: 'precios' },
  { href: '/clientes?ver=proveedores', label: 'Proveedores',              icon: Package, modulo: 'proveedores' },

  // ── FACTURACIÓN ────────────────────────────────────
  { label: 'Facturación', section: true },
  { href: '/facturacion/emitidas',        label: 'Facturas emitidas',     icon: FileText, modulo: 'facturas_emitidas' },
  { href: '/facturacion/recibidas',       label: 'Facturas recibidas',    icon: FileDown, modulo: 'facturas_recibidas' },
  { href: '/facturacion/cte-clientes',    label: 'Cta. cte. clientes',    icon: Users, modulo: 'cte_clientes' },
  { href: '/facturacion/cte-proveedores', label: 'Cta. cte. proveedores', icon: Handshake, modulo: 'cte_proveedores' },

  // ── TESORERÍA (todo lo que mueve plata) ────────────
  { label: 'Tesorería', section: true },
  { href: '/tesoreria/recibos',           label: 'Recibos',                icon: Receipt, modulo: 'recibos' },
  { href: '/tesoreria/ordenes-pago',      label: 'Órdenes de pago',        icon: Send, modulo: 'ordenes_pago' },
  { href: '/tesoreria/aplicaciones-pago', label: 'Aplicaciones de pago',   icon: Link2, modulo: 'aplicaciones_pago' },
  { href: '/tesoreria/movimientos',       label: 'Movim. entre cuentas',   icon: Repeat, modulo: 'movimientos_cuentas' },
  { href: '/tesoreria/flujo',             label: 'Flujo de cuentas',       icon: ArrowLeftRight, modulo: 'flujo_cuentas' },
  { href: '/fondos',                      label: 'Fondos en custodia',     icon: Landmark, modulo: 'fondos_custodia' },
  { href: '/tipos-cambio',                label: 'Tipos de cambio',        icon: DollarSign, modulo: 'tipos_cambio' },

  // ── CONTABILIDAD ───────────────────────────────────
  { label: 'Contabilidad', section: true },
  { href: '/contabilidad/iva',        label: 'Libro IVA',       icon: BookOpen, modulo: 'iva' },
  { href: '/contabilidad/gastos',     label: 'Gastos y costos', icon: TrendingDown, modulo: 'gastos_fijos' },
  { href: '/contabilidad/resultados', label: 'Resultados',      icon: TrendingUp, modulo: 'resultados' },

  // ── CONFIGURACIÓN ──────────────────────────────────
  { label: 'Configuración', section: true },
  { href: '/catalogos',       label: 'Catálogos',    icon: Library, modulo: 'catalogos' },
  { href: '/usuarios',        label: 'Usuarios',     icon: UserCog, modulo: 'usuarios' },
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
  return (
    <Suspense fallback={null}>
      <AppLayoutInner>{children}</AppLayoutInner>
    </Suspense>
  )
}

function AppLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const verActual = searchParams.get('ver') === 'proveedores' ? 'proveedores' : 'clientes'
  const router = useRouter()
  const [user, setUser] = useState<Usuario | null>(null)
  const [tc, setTc] = useState<TCWidget>({ ARS: null, CLP: null, CNY: null, fecha: '', hora: '', fuente: '' })
  const [utm, setUtm] = useState<{ valor: number; label: string } | null>(null)
  const [permisos, setPermisos] = useState<Record<string, string[]>>({})  // modulo → acciones permitidas
  const [esSuper, setEsSuper] = useState(false)
  const [rolNombre, setRolNombre] = useState('')
  const [modulosNuevosCount, setModulosNuevosCount] = useState(0)
  const [collapsed, setCollapsed] = useState(false)
  const supabase = useMemo(() => createClient(), [])
  const bannerTsRef = useRef(0)

  // Carga inicial: solo lo que NO cambia al navegar (usuario, nombre del rol, TC, UTM, listeners).
  useEffect(() => {
    // El middleware ya protege las rutas — aquí solo cargamos los datos del usuario
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.push('/'); return }
      const { data: u } = await supabase.from('usuarios').select('*').eq('auth_id', data.user.id).single()
      if (!u) { router.push('/'); return }
      setUser(u as Usuario)
      // Nombre del rol para la tarjeta inferior — el rol está en roles_ids[0]
      const rolId = Array.isArray((u as any).roles_ids) && (u as any).roles_ids.length > 0
        ? (u as any).roles_ids[0]
        : null
      if (rolId) {
        const { data: rol } = await supabase.from('roles').select('nombre').eq('id', rolId).single()
        setRolNombre((rol as any)?.nombre || '')
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
    loadUtm()
    return () => subscription.unsubscribe()
  }, [])

  // Refresco de permisos del sidebar: corre al montar y CADA vez que se navega (cambia pathname).
  // El layout es persistente (no se re-monta al cambiar de pantalla), por eso sin esto el menú
  // quedaba congelado hasta un F5. Usa cargarPermisos() — el MISMO caché (TTL 60s) que usan las
  // pantallas — así no consulta de más y el menú se sincroniza solo con los cambios de permisos.
  useEffect(() => {
    let cancelado = false
    ;(async () => {
      const map = await cargarPermisos()
      if (cancelado) return
      setPermisos(map)
      const sa = esSuperAdmin()
      setEsSuper(sa)
      if (!sa) { setModulosNuevosCount(0); return }
      // El aviso de "módulos sin configurar" solo aplica a super admin. Respetamos el mismo
      // TTL de 60s para no consultar modulos_revisados en cada clic del menú.
      const ahora = Date.now()
      if (ahora - bannerTsRef.current < 60_000) return
      bannerTsRef.current = ahora
      // Fuente de verdad ÚNICA: un módulo deja de ser "nuevo" cuando se confirmó con Guardar
      // en la matriz (tabla modulos_revisados). Igual criterio que la pantalla de Usuarios,
      // para que el aviso del sidebar y el cartel coincidan.
      const { data: revisados } = await supabase
        .from('modulos_revisados')
        .select('modulo, acciones')
      if (cancelado) return
      const revMap = new Map((revisados || []).map((p: any) => [p.modulo, (p.acciones || []) as string[]]))
      setModulosNuevosCount(modulosPendientesSet(revMap).size)
    })()
    return () => { cancelado = true }
  }, [pathname])

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

  async function loadUtm() {
    try {
      const { data } = await supabase
        .from('valores_utm')
        .select('anio, mes, valor_clp')
        .order('anio', { ascending: false })
        .order('mes', { ascending: false })
        .limit(1)
        .maybeSingle()
      const d = data as any
      if (d?.valor_clp != null) {
        const MESES_ABR = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
        setUtm({ valor: Number(d.valor_clp), label: `${MESES_ABR[d.mes - 1]} ${d.anio}` })
      }
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
            className="text-white/60 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10">
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        {/* ⚠ Alerta de módulos nuevos sin configurar — SOLO Super Administrador */}
        {esSuper && modulosNuevosCount > 0 && !collapsed && (
          <Link href="/usuarios"
            className="mx-3 mt-3 block rounded-xl overflow-hidden hover:brightness-105 transition-all"
            style={{ background: '#f59e0b', border: '1px solid #fbbf24' }}>
            <div className="px-3 py-2.5">
              <div className="flex items-center gap-1.5 mb-0.5">
                <AlertTriangle size={13} className="text-amber-950" />
                <span className="text-[11px] font-bold text-amber-950">
                  {modulosNuevosCount} módulo(s) nuevo(s)
                </span>
              </div>
              <div className="text-[9px] text-amber-900 leading-tight">
                Sin permisos configurados. Tocá para revisarlos en Usuarios →
              </div>
            </div>
          </Link>
        )}
        {/* Versión colapsada: solo el ícono de alerta */}
        {esSuper && modulosNuevosCount > 0 && collapsed && (
          <Link href="/usuarios" title={`${modulosNuevosCount} módulos nuevos sin configurar`}
            className="mx-2 mt-3 flex items-center justify-center py-2 rounded-lg hover:brightness-105"
            style={{ background: '#f59e0b' }}>
            <AlertTriangle size={15} className="text-amber-950" />
          </Link>
        )}

        {/* Fecha + TC Widget (compacto) */}
        {!collapsed && (
          <div className="mx-3 mt-3 mb-1 rounded-xl overflow-hidden" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.15)' }}>
            <div className="px-2.5 py-1.5 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <span className="text-[10px] text-white/80 font-medium capitalize">{hoy}</span>
              <Link href="/tipos-cambio" className="text-[9px] text-white/50 hover:text-white transition-colors">TC →</Link>
            </div>
            <div className="flex px-1.5 py-1.5">
              {[
                { moneda: 'AR ARS', valor: tc.ARS, decimals: 0 },
                { moneda: 'CL CLP', valor: tc.CLP, decimals: 0 },
                { moneda: 'CN CNY', valor: tc.CNY, decimals: 2 },
              ].map(({ moneda, valor, decimals }, i) => (
                <div key={moneda} className={`flex-1 text-center px-1 ${i === 1 ? 'border-x border-white/10' : ''}`}>
                  <div className="text-[9px] text-white/55 font-medium">{moneda}</div>
                  <div className="font-mono font-bold text-white text-[11px] leading-tight">
                    {valor !== null ? (decimals > 0 ? valor.toFixed(decimals) : Math.round(valor).toLocaleString('es-AR')) : '-'}
                  </div>
                </div>
              ))}
            </div>
            {utm !== null && (
              <div className="flex items-center justify-between px-2.5 py-1" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <span className="text-[9px] text-white/55 font-medium">UTM <span className="text-white/40">{utm.label}</span></span>
                <span className="font-mono font-bold text-white text-[10px]">$ {Math.round(utm.valor).toLocaleString('es-CL')}</span>
              </div>
            )}
            {tc.fecha && (
              <div className="px-2.5 pb-1">
                <span className="text-[8px] text-white/40">{tc.fuente} {tc.fecha ? tc.fecha.split('-').reverse().join('/') : ''} {tc.hora}</span>
              </div>
            )}
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 py-2 overflow-y-auto scrollbar-thin">
          {NAV.map((item, i) => {
            if (item.section) return (
              <div key={i} className={`${collapsed ? 'hidden' : ''} px-4 pt-3 pb-1 text-[10px] font-semibold text-white/40`}>
                {item.label}
              </div>
            )
            if (!item.href) return null
            const [hrefPath, hrefQuery] = item.href.split('?')
            let active = pathname === hrefPath || pathname.startsWith(hrefPath + '/')
            // Clientes y Proveedores comparten /clientes: desambiguar por ?ver
            if (active && hrefPath === '/clientes') {
              const hrefVer = (hrefQuery || '').includes('ver=proveedores') ? 'proveedores' : 'clientes'
              active = hrefVer === verActual
            }
            // Filtrar por permisos del rol.
            // REGLA DE ORO: el Super Administrador ve TODO (incluso módulos sin
            // permiso configurado aún). Para el resto: deny by default — si el
            // módulo no tiene 'ver' en sus permisos, se oculta.
            if (!esSuper && Object.keys(permisos).length > 0 && item.modulo) {
              const tienePermiso = permisos[item.modulo]?.includes('ver')
              if (!tienePermiso) return null
            }

            return (
              <div key={item.href} className="relative group">
                {item.soon ? (
                  <div className={`flex items-center gap-2 mx-2 px-3 py-1.5 rounded-lg text-[11px] mb-0.5 opacity-40 cursor-not-allowed ${collapsed ? 'justify-center' : ''}`}>
                    <span className="w-5 flex items-center justify-center flex-shrink-0 text-white/40">{item.icon && <item.icon size={collapsed ? 18 : 16} strokeWidth={1.75} />}</span>
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
                    <span className="w-5 flex items-center justify-center flex-shrink-0">{item.icon && <item.icon size={collapsed ? 18 : 16} strokeWidth={1.75} />}</span>
                    {!collapsed && <span className="truncate">{item.label}</span>}
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

        {/* User (compacto: una sola fila) */}
        <div className="px-3 py-2" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          {!collapsed ? (
            <div className="flex items-center gap-2">
              {user && (
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                  style={{ background: 'rgba(255,255,255,0.15)' }}>
                  {user.iniciales}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-white text-[11px] font-semibold truncate">{user?.nombre.split(' ')[0]}</div>
                <div className="text-white/50 text-[9px] truncate">{rolNombre.replace(/^\d+\s*-\s*/, '') || user?.rol}</div>
              </div>
              <Link href="/ayuda" title="Ayuda"
                className="text-white/55 hover:text-white hover:bg-white/10 rounded-lg p-1.5 transition-colors flex-shrink-0">
                <HelpCircle size={16} />
              </Link>
              <button onClick={handleLogout} title="Cerrar sesión"
                className="text-white/55 hover:text-white hover:bg-white/10 rounded-lg p-1.5 transition-colors flex-shrink-0">
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              {user && (
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[10px] font-bold"
                  style={{ background: 'rgba(255,255,255,0.15)' }}>
                  {user.iniciales}
                </div>
              )}
              <Link href="/ayuda" title="Ayuda"
                className="text-white/55 hover:text-white hover:bg-white/10 rounded-lg p-1.5 transition-colors">
                <HelpCircle size={16} />
              </Link>
              <button onClick={handleLogout} title="Cerrar sesión"
                className="text-white/55 hover:text-white hover:bg-white/10 rounded-lg p-1.5 transition-colors">
                <LogOut size={16} />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 overflow-y-auto bg-gray-50">
        {children}
      </main>
    </div>
  )
}
