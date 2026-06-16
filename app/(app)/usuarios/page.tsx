'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import type { Rol } from '@/types'

interface Usuario {
  id: string
  auth_id: string
  nombre: string
  email: string
  rol: Rol
  roles_ids: string[]
  iniciales: string
  activo: boolean
  foto_url?: string
  force_password_change?: boolean
  last_login_at?: string
  last_login_ip?: string
  last_login_ciudad?: string
  last_login_pais?: string
  created_at: string
}

interface Role {
  id: string
  nombre: string
  descripcion: string
  color: string
  activo: boolean
}

interface Permiso {
  id: string
  rol_id: string
  modulo: string
  accion: string
  permitido: boolean
}

interface LoginLog {
  id: string
  ip: string
  ciudad: string
  pais: string
  pais_codigo: string
  user_agent: string
  created_at: string
}

// ── Definición completa de módulos y permisos ──────────────────────
const ACCIONES = ['ver', 'crear', 'editar', 'eliminar', 'descargar'] as const
type Accion = typeof ACCIONES[number]

interface ModuloItem {
  modulo: string
  label: string
  acciones: Accion[]        // cuáles aplican
  subitem?: boolean
  soloVer?: boolean         // para módulos de solo lectura
}

interface ModuloSeccion {
  section: string
  items: ModuloItem[]
}

const MODULOS_PERMISOS: ModuloSeccion[] = [
  {
    section: 'General',
    items: [
      { modulo: 'dashboard',            label: 'Dashboard logístico',  acciones: ['ver'], soloVer: true },
      { modulo: 'dashboard_financiero', label: 'Dashboard financiero', acciones: ['ver'], soloVer: true },
    ]
  },
  {
    section: 'Ventas',
    items: [
      { modulo: 'cotizaciones',        label: 'Cotizaciones',       acciones: ['ver','crear','editar','eliminar','descargar'] },
      { modulo: 'cotizaciones_estado', label: '→ Cambiar estado',   acciones: ['ver','editar'], subitem: true },
      { modulo: 'clientes',            label: 'Clientes',           acciones: ['ver','crear','editar','eliminar','descargar'] },
    ]
  },
  {
    section: 'Operaciones',
    items: [
      { modulo: 'operaciones',              label: 'Operaciones activas',      acciones: ['ver','crear','editar','eliminar','descargar'] },
      { modulo: 'cierre',                   label: 'Liquidación y cierre',     acciones: ['ver','editar'] },
      { modulo: 'cotizaciones_proveedores', label: 'Cotiz. proveedores',       acciones: ['ver','crear','editar','eliminar','descargar'] },
      { modulo: 'precios',                  label: 'Inteligencia de precios',  acciones: ['ver'], soloVer: true },
      { modulo: 'proveedores',              label: 'Proveedores',              acciones: ['ver','crear','editar','eliminar'] },
    ]
  },
  {
    section: 'Finanzas clientes',
    items: [
      { modulo: 'facturas_emitidas',        label: 'Facturas emitidas',       acciones: ['ver','crear','editar','eliminar','descargar'] },
      { modulo: 'facturas_emitidas_anular', label: '→ Anular factura',        acciones: ['ver','editar'], subitem: true },
      { modulo: 'facturas_recibidas',       label: 'Facturas recibidas',      acciones: ['ver','crear','editar','eliminar','descargar'] },
      { modulo: 'cte_clientes',             label: 'Cta. cte. clientes',      acciones: ['ver','crear','editar'] },
      { modulo: 'cte_proveedores',          label: 'Cta. cte. proveedores',   acciones: ['ver','crear','editar'] },
      { modulo: 'fondos_custodia',          label: 'Fondos en custodia',      acciones: ['ver','crear','editar','eliminar','descargar'] },
    ]
  },
  {
    section: 'Tesorería',
    items: [
      { modulo: 'flujo_cuentas', label: 'Flujo cuentas ARG↔CHL', acciones: ['ver','crear','editar','descargar'] },
      { modulo: 'tipos_cambio',  label: 'Tipos de cambio',        acciones: ['ver','editar'] },
    ]
  },
  {
    section: 'Contabilidad',
    items: [
      { modulo: 'iva',          label: 'Libro IVA',        acciones: ['ver','editar','descargar'] },
      { modulo: 'gastos_fijos', label: 'Gastos fijos PN',  acciones: ['ver','crear','editar','eliminar','descargar'] },
      { modulo: 'resultados',   label: 'Resultados',       acciones: ['ver'], soloVer: true },
    ]
  },
  {
    section: 'Configuración',
    items: [
      { modulo: 'catalogos',    label: 'Catálogos',          acciones: ['ver','crear','editar','eliminar'] },
      { modulo: 'cuentas_abm',  label: '→ Cuentas (caja y bancos)', acciones: ['ver','crear','editar','eliminar'], subitem: true },
      { modulo: 'tributos',     label: 'Tributos ARCA',      acciones: ['ver','editar'] },
      { modulo: 'usuarios',     label: 'Usuarios',           acciones: ['ver','crear','editar','eliminar'] },
    ]
  },
]

// Permisos por defecto para cada rol (rol_nombre → modulo → acciones)
const DEFAULTS: Record<string, Record<string, Accion[]>> = {

  // ── SUPER ADMINISTRADOR: acceso total a todo ───────────────────
  'Super Administrador': {
    dashboard: ['ver'], dashboard_financiero: ['ver'],
    cotizaciones: ['ver','crear','editar','eliminar','descargar'], cotizaciones_estado: ['ver','editar'],
    clientes: ['ver','crear','editar','eliminar','descargar'],
    operaciones: ['ver','crear','editar','eliminar','descargar'], cierre: ['ver','editar'],
    cotizaciones_proveedores: ['ver','crear','editar','eliminar','descargar'],
    precios: ['ver'],
    proveedores: ['ver','crear','editar','eliminar'],
    facturas_emitidas: ['ver','crear','editar','eliminar','descargar'], facturas_emitidas_anular: ['ver','editar'],
    facturas_recibidas: ['ver','crear','editar','eliminar','descargar'],
    cte_clientes: ['ver','crear','editar'], cte_proveedores: ['ver','crear','editar'],
    fondos_custodia: ['ver','crear','editar','eliminar','descargar'],
    flujo_cuentas: ['ver','crear','editar','descargar'], tipos_cambio: ['ver','editar'],
    iva: ['ver','editar','descargar'], gastos_fijos: ['ver','crear','editar','eliminar','descargar'], resultados: ['ver'],
    catalogos: ['ver','crear','editar','eliminar'], cuentas_abm: ['ver','crear','editar','eliminar'],
    tributos: ['ver','editar'], usuarios: ['ver','crear','editar','eliminar'],
  },

  // ── ADMINISTRADOR: todo excepto eliminar usuarios y tributos ───
  'Administrador': {
    dashboard: ['ver'], dashboard_financiero: ['ver'],
    cotizaciones: ['ver','crear','editar','eliminar','descargar'], cotizaciones_estado: ['ver','editar'],
    clientes: ['ver','crear','editar','descargar'],
    operaciones: ['ver','crear','editar','descargar'], cierre: ['ver','editar'],
    cotizaciones_proveedores: ['ver','crear','editar','descargar'],
    precios: ['ver'],
    proveedores: ['ver','crear','editar'],
    facturas_emitidas: ['ver','crear','editar','descargar'], facturas_emitidas_anular: ['ver','editar'],
    facturas_recibidas: ['ver','crear','editar','descargar'],
    cte_clientes: ['ver','crear','editar'], cte_proveedores: ['ver','crear','editar'],
    fondos_custodia: ['ver','crear','editar','descargar'],
    flujo_cuentas: ['ver','crear','editar','descargar'], tipos_cambio: ['ver','editar'],
    iva: ['ver','editar','descargar'], gastos_fijos: ['ver','crear','editar','descargar'], resultados: ['ver'],
    catalogos: ['ver','crear','editar','eliminar'], cuentas_abm: ['ver','crear','editar','eliminar'],
    tributos: ['ver'], usuarios: ['ver','crear','editar'],
  },

  // ── EJECUTIVO COMERCIAL: foco en ventas y seguimiento ─────────
  'Ejecutivo comercial': {
    dashboard: ['ver'],
    cotizaciones: ['ver','crear','editar','descargar'], cotizaciones_estado: ['ver','editar'],
    clientes: ['ver','crear','editar','descargar'],
    operaciones: ['ver','descargar'], cierre: ['ver'],
    cotizaciones_proveedores: ['ver','crear','editar','descargar'],
    precios: ['ver'],
    proveedores: ['ver'],
    tipos_cambio: ['ver'],
  },

  // ── OPERACIONES: foco logístico, sin acceso financiero ────────
  'Operaciones': {
    dashboard: ['ver'],
    cotizaciones: ['ver'],
    clientes: ['ver'],
    operaciones: ['ver','crear','editar','descargar'], cierre: ['ver','editar'],
    cotizaciones_proveedores: ['ver','crear','editar','descargar'],
    precios: ['ver'],
    proveedores: ['ver','crear','editar'],
    fondos_custodia: ['ver','descargar'],
    tipos_cambio: ['ver'],
  },

  // ── CONTABILIDAD: foco financiero y contable ──────────────────
  'Contabilidad': {
    dashboard: ['ver'], dashboard_financiero: ['ver'],
    cotizaciones: ['ver'], operaciones: ['ver','descargar'], cierre: ['ver'],
    facturas_emitidas: ['ver','crear','editar','descargar'], facturas_emitidas_anular: ['ver','editar'],
    facturas_recibidas: ['ver','crear','editar','descargar'],
    cte_clientes: ['ver','crear','editar'], cte_proveedores: ['ver','crear','editar'],
    fondos_custodia: ['ver','crear','editar','descargar'],
    flujo_cuentas: ['ver','crear','editar','descargar'], tipos_cambio: ['ver'],
    iva: ['ver','editar','descargar'], gastos_fijos: ['ver','crear','editar','descargar'], resultados: ['ver'],
  },

  // ── GERENCIA: visión total solo lectura + resultados ──────────
  'Gerencia': {
    dashboard: ['ver'], dashboard_financiero: ['ver'],
    cotizaciones: ['ver','descargar'], cotizaciones_estado: ['ver'],
    clientes: ['ver','descargar'], operaciones: ['ver','descargar'], cierre: ['ver'],
    cotizaciones_proveedores: ['ver','descargar'], precios: ['ver'], proveedores: ['ver'],
    facturas_emitidas: ['ver','descargar'], facturas_recibidas: ['ver','descargar'],
    cte_clientes: ['ver'], cte_proveedores: ['ver'],
    fondos_custodia: ['ver','descargar'], flujo_cuentas: ['ver','descargar'], tipos_cambio: ['ver'],
    iva: ['ver','descargar'], gastos_fijos: ['ver','descargar'], resultados: ['ver'],
  },
}

const COLORES_ROL = ['#1168F8', '#052698', '#0a9e6e', '#b45309', '#6b21a8', '#dc2626', '#0891b2']
const inp = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white'

export default function UsuariosPage() {
  const supabase = useMemo(() => createClient(), [])
  const [tab, setTab] = useState<'usuarios' | 'roles'>('usuarios')
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [permisos, setPermisos] = useState<Permiso[]>([])
  const [loading, setLoading] = useState(true)

  const [modalUsuario, setModalUsuario] = useState<{ type: 'nuevo' | 'editar' | 'historial' | 'password'; usuario?: Usuario } | null>(null)
  const [modalRol, setModalRol] = useState<{ type: 'nuevo' | 'editar'; rol?: Role } | null>(null)
  const [historialLogs, setHistorialLogs] = useState<LoginLog[]>([])
  const [formU, setFormU] = useState({ nombre: '', email: '', iniciales: '', roles_ids: [] as string[], activo: true })
  const [formR, setFormR] = useState({ nombre: '', descripcion: '', color: '#1168F8' })
  const [generatedPassword, setGeneratedPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploadingFoto, setUploadingFoto] = useState<string | null>(null)
  const [permisosModificados, setPermisosModificados] = useState<Record<string, boolean>>({})
  const [savingPermisos, setSavingPermisos] = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const { data: authData } = await supabase.auth.getUser()
    const [uRes, rRes, pRes] = await Promise.all([
      supabase.from('usuarios').select('*').order('nombre'),
      supabase.from('roles').select('*').order('nombre'),
      supabase.from('rol_permisos').select('*'),
    ])
    if (uRes.data) setUsuarios(uRes.data as Usuario[])
    if (rRes.data) setRoles(rRes.data as Role[])
    if (pRes.data) setPermisos(pRes.data as Permiso[])
    setLoading(false)
  }

  function isPermitido(rolId: string, modulo: string, accion: string): boolean {
    return permisos.some(p => p.rol_id === rolId && p.modulo === modulo && p.accion === accion && p.permitido)
  }

  function togglePermiso(rolId: string, modulo: string, accion: string) {
    const key = `${rolId}|${modulo}|${accion}`
    const current = permisosModificados.hasOwnProperty(key)
      ? permisosModificados[key]
      : isPermitido(rolId, modulo, accion)
    setPermisosModificados(pm => ({ ...pm, [key]: !current }))
  }

  function isPermitidoEfectivo(rolId: string, modulo: string, accion: string): boolean {
    const key = `${rolId}|${modulo}|${accion}`
    if (permisosModificados.hasOwnProperty(key)) return permisosModificados[key]
    return isPermitido(rolId, modulo, accion)
  }

  // Tilde/destilde toda una columna (rol + accion) para todos los módulos que la soporten
  function toggleColumna(rolId: string, accion: Accion) {
    const todosModulos = MODULOS_PERMISOS.flatMap(s => s.items).filter(it => it.acciones.includes(accion))
    const todosActivos = todosModulos.every(it => isPermitidoEfectivo(rolId, it.modulo, accion))
    const updates: Record<string, boolean> = {}
    todosModulos.forEach(it => {
      updates[`${rolId}|${it.modulo}|${accion}`] = !todosActivos
    })
    setPermisosModificados(pm => ({ ...pm, ...updates }))
  }

  function columnaTodasActivas(rolId: string, accion: Accion): boolean {
    const modulos = MODULOS_PERMISOS.flatMap(s => s.items).filter(it => it.acciones.includes(accion))
    return modulos.length > 0 && modulos.every(it => isPermitidoEfectivo(rolId, it.modulo, accion))
  }

  async function guardarPermisos() {
    setSavingPermisos(true)
    for (const [key, valor] of Object.entries(permisosModificados)) {
      const [rolId, modulo, accion] = key.split('|')
      const existing = permisos.find(p => p.rol_id === rolId && p.modulo === modulo && p.accion === accion)
      if (existing) {
        await (supabase.from('rol_permisos') as any).update({ permitido: valor }).eq('id', existing.id)
      } else if (valor) {
        await (supabase.from('rol_permisos') as any).insert({ rol_id: rolId, modulo, accion, permitido: true })
      }
    }
    setPermisosModificados({})
    await loadAll()
    setSavingPermisos(false)
  }

  function generarPassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$'
    return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  }

  async function guardarUsuario() {
    if (!formU.nombre || !formU.email) return
    setSaving(true)
    const iniciales = formU.iniciales || formU.nombre.split(' ').map((x: string) => x[0]).join('').slice(0, 3).toUpperCase()
    if (modalUsuario?.type === 'nuevo') {
      const tempPwd = generarPassword()
      const res = await fetch('/api/admin-usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'crear', email: formU.email, password: tempPwd }),
      })
      const data = await res.json()
      if (!res.ok) { alert('Error: ' + (data.error || 'Error desconocido')); setSaving(false); return }
      await (supabase.from('usuarios') as any).insert({
        auth_id: data.user?.id || null,
        nombre: formU.nombre, email: formU.email, iniciales,
        rol: 'ejecutivo', roles_ids: formU.roles_ids, activo: formU.activo, force_password_change: true,
      })
      setGeneratedPassword(tempPwd)
    } else if (modalUsuario?.usuario) {
      await (supabase.from('usuarios') as any).update({
        nombre: formU.nombre, email: formU.email, iniciales, roles_ids: formU.roles_ids, activo: formU.activo,
      }).eq('id', modalUsuario.usuario.id)
      setModalUsuario(null)
    }
    await loadAll()
    setSaving(false)
  }

  async function resetPassword(usuario: Usuario) {
    const newPwd = generarPassword()
    const res = await fetch('/api/admin-usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset_password', auth_id: usuario.auth_id, password: newPwd }),
    })
    const data = await res.json()
    if (!res.ok) { alert('Error: ' + (data.error || 'Error desconocido')); return }
    await (supabase.from('usuarios') as any).update({ force_password_change: true }).eq('id', usuario.id)
    setGeneratedPassword(newPwd)
    await loadAll()
  }

  async function toggleActivo(u: Usuario) {
    await (supabase.from('usuarios') as any).update({ activo: !u.activo }).eq('id', u.id)
    setUsuarios(prev => prev.map(x => x.id === u.id ? { ...x, activo: !x.activo } : x))
  }

  async function verHistorial(u: Usuario) {
    const { data } = await supabase.from('login_historial').select('*').eq('usuario_id', u.id).order('created_at', { ascending: false }).limit(20)
    if (data) setHistorialLogs(data as LoginLog[])
    setModalUsuario({ type: 'historial', usuario: u })
  }

  async function subirFoto(usuario: Usuario, file: File) {
    setUploadingFoto(usuario.id)
    const ext = file.name.split('.').pop()
    const path = `${usuario.id}.${ext}`
    await supabase.storage.from('avatares').upload(path, file, { upsert: true })
    const { data } = supabase.storage.from('avatares').getPublicUrl(path)
    if (data?.publicUrl) {
      await (supabase.from('usuarios') as any).update({ foto_url: data.publicUrl }).eq('id', usuario.id)
      await loadAll()
    }
    setUploadingFoto(null)
  }

  async function guardarRol() {
    if (!formR.nombre) return
    setSaving(true)
    if (modalRol?.type === 'nuevo') {
      await (supabase.from('roles') as any).insert(formR)
    } else if (modalRol?.rol) {
      await (supabase.from('roles') as any).update(formR).eq('id', modalRol.rol.id)
    }
    await loadAll()
    setModalRol(null)
    setSaving(false)
  }

  async function eliminarRol(id: string) {
    if (!confirm('¿Eliminar este rol?')) return
    await supabase.from('roles').delete().eq('id', id)
    await loadAll()
  }

  function getRolesDeUsuario(u: Usuario): Role[] {
    return roles.filter(r => (u.roles_ids || []).includes(r.id))
  }

  const accionLabel: Record<Accion, string> = { ver: 'Ver', crear: 'Crear', editar: 'Editar', eliminar: 'Elim.', descargar: 'Descargar' }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Usuarios y roles</h1>
          <p className="text-xs text-gray-400 mt-0.5">{usuarios.filter(u => u.activo).length} activos · {roles.length} roles</p>
        </div>
        <div className="flex gap-2">
          {tab === 'usuarios' && (
            <button onClick={() => { setFormU({ nombre: '', email: '', iniciales: '', roles_ids: [], activo: true }); setGeneratedPassword(''); setModalUsuario({ type: 'nuevo' }) }}
              className="px-5 py-2.5 bg-[#1168F8] text-white rounded-xl text-sm font-bold hover:bg-[#0a4fc4] shadow-sm">
              + Nuevo usuario
            </button>
          )}
          {tab === 'roles' && (
            <button onClick={() => { setFormR({ nombre: '', descripcion: '', color: '#1168F8' }); setModalRol({ type: 'nuevo' }) }}
              className="px-5 py-2.5 bg-[#1168F8] text-white rounded-xl text-sm font-bold hover:bg-[#0a4fc4] shadow-sm">
              + Nuevo rol
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        {[{ key: 'usuarios', label: `Usuarios (${usuarios.length})` }, { key: 'roles', label: `Roles y permisos (${roles.length})` }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${tab === t.key ? 'bg-[#1168F8] text-white shadow-md' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── USUARIOS ── */}
      {tab === 'usuarios' && (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
          {loading ? <div className="p-8 text-center text-gray-400">Cargando...</div> : (
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Usuario', 'Roles', 'Último acceso', 'Ubicación', 'Estado', 'Acciones'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {usuarios.map(u => {
                  const rolesU = getRolesDeUsuario(u)
                  const lastLogin = u.last_login_at ? new Date(u.last_login_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'
                  return (
                    <tr key={u.id} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${!u.activo ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="relative flex-shrink-0">
                            {u.foto_url
                              ? <img src={u.foto_url} alt={u.nombre} className="w-9 h-9 rounded-xl object-cover"/>
                              : <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-[11px] font-bold" style={{ background: '#1168F8' }}>{u.iniciales}</div>
                            }
                            <label className="absolute -bottom-1 -right-1 w-4 h-4 bg-white border border-gray-200 rounded-full flex items-center justify-center cursor-pointer hover:bg-gray-50">
                              <span className="text-[8px] text-gray-500">📷</span>
                              <input type="file" accept="image/*" className="hidden" disabled={uploadingFoto === u.id}
                                onChange={e => { const f = e.target.files?.[0]; if (f) subirFoto(u, f) }}/>
                            </label>
                          </div>
                          <div>
                            <div className="font-semibold text-gray-900 flex items-center gap-1.5">
                              {u.nombre}
                              {u.force_password_change && <span className="text-[9px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full border border-amber-200">Debe cambiar pwd</span>}
                            </div>
                            <div className="text-[10px] text-gray-400">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex gap-1 flex-wrap">
                          {rolesU.length > 0 ? rolesU.map(r => (
                            <span key={r.id} className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold text-white" style={{ background: r.color }}>{r.nombre}</span>
                          )) : <span className="text-gray-300 text-[10px]">Sin roles</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-mono text-[11px] text-gray-600">{lastLogin}</div>
                        {u.last_login_ip && <div className="text-[10px] text-gray-400 font-mono">{u.last_login_ip}</div>}
                      </td>
                      <td className="px-4 py-3.5">
                        {u.last_login_ciudad ? <div className="text-xs text-gray-600">{u.last_login_ciudad}, {u.last_login_pais}</div> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        <button onClick={() => toggleActivo(u)}
                          className={`inline-flex px-3 py-1 rounded-full text-[10px] font-bold border transition-colors ${u.activo ? 'bg-green-50 text-green-700 border-green-200 hover:bg-red-50 hover:text-red-700 hover:border-red-200' : 'bg-red-50 text-red-700 border-red-200 hover:bg-green-50 hover:text-green-700 hover:border-green-200'}`}>
                          {u.activo ? 'Activo' : 'Pausado'}
                        </button>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex gap-1.5">
                          <button onClick={() => { setFormU({ nombre: u.nombre, email: u.email, iniciales: u.iniciales, roles_ids: u.roles_ids || [], activo: u.activo }); setGeneratedPassword(''); setModalUsuario({ type: 'editar', usuario: u }) }}
                            className="p-1.5 border border-gray-200 rounded-lg hover:bg-[#EBF2FF] hover:border-[#93B8FC] text-gray-500 hover:text-[#1168F8] transition-colors" title="Editar">✏</button>
                          <button onClick={() => verHistorial(u)}
                            className="p-1.5 border border-gray-200 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors" title="Historial">📋</button>
                          <button onClick={() => { setGeneratedPassword(''); setModalUsuario({ type: 'password', usuario: u }) }}
                            className="p-1.5 border border-amber-200 rounded-lg hover:bg-amber-50 text-amber-700 transition-colors" title="Reset contraseña">🔑</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── ROLES Y PERMISOS ── */}
      {tab === 'roles' && (
        <div>
          {/* Cards de roles */}
          <div className="grid grid-cols-6 gap-3 mb-5">
            {roles.map(r => (
              <div key={r.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                <div className="flex items-start justify-between mb-2">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold" style={{ background: r.color }}>
                    {r.nombre.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => { setFormR({ nombre: r.nombre, descripcion: r.descripcion, color: r.color }); setModalRol({ type: 'editar', rol: r }) }}
                      className="text-gray-400 hover:text-[#1168F8] text-xs p-1">✏</button>
                    <button onClick={() => eliminarRol(r.id)} className="text-gray-400 hover:text-red-500 text-xs p-1">🗑</button>
                  </div>
                </div>
                <div className="font-bold text-xs text-gray-900 mb-0.5">{r.nombre}</div>
                <div className="text-[10px] text-gray-400 leading-tight">{r.descripcion}</div>
                <div className="text-[9px] text-gray-300 mt-2">{usuarios.filter(u => (u.roles_ids || []).includes(r.id)).length} usuario(s)</div>
              </div>
            ))}
          </div>

          {/* Matriz de permisos */}
          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <div className="font-bold text-sm text-gray-900">Matriz de permisos</div>
                <div className="text-[10px] text-gray-400 mt-0.5">El checkbox en el encabezado de cada columna activa/desactiva todos los módulos para esa acción</div>
              </div>
              {Object.keys(permisosModificados).length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-amber-700 font-medium bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200">
                    {Object.keys(permisosModificados).length} cambio(s) sin guardar
                  </span>
                  <button onClick={() => setPermisosModificados({})}
                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50">Descartar</button>
                  <button onClick={guardarPermisos} disabled={savingPermisos}
                    className="px-4 py-1.5 bg-[#1168F8] text-white rounded-lg text-xs font-bold disabled:opacity-50">
                    {savingPermisos ? 'Guardando...' : 'Guardar permisos'}
                  </button>
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse" style={{ minWidth: '900px' }}>
                <thead>
                  {/* Fila 1: nombres de roles */}
                  <tr>
                    <th className="w-44 bg-gray-50 border-b border-r border-gray-100 px-4 py-2"/>
                    {roles.map(r => (
                      <th key={r.id} colSpan={4}
                        className="text-center py-2 text-[11px] font-bold border-b border-l-2 border-gray-200"
                        style={{ color: r.color, background: r.color + '08' }}>
                        {r.nombre}
                      </th>
                    ))}
                  </tr>
                  {/* Fila 2: acciones + checkbox tilde-todo */}
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-r border-gray-100">
                      Módulo
                    </th>
                    {roles.map(r => (
                      ACCIONES.map(ac => (
                        <th key={`${r.id}-${ac}`}
                          className={`text-center px-1 py-2 text-[10px] text-gray-400 font-semibold ${ac === 'ver' ? 'border-l-2 border-gray-200' : ''}`}>
                          <div className="flex flex-col items-center gap-1">
                            <input type="checkbox"
                              checked={columnaTodasActivas(r.id, ac)}
                              onChange={() => toggleColumna(r.id, ac)}
                              className="w-3 h-3 cursor-pointer accent-[#1168F8]"/>
                            <span>{accionLabel[ac]}</span>
                          </div>
                        </th>
                      ))
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MODULOS_PERMISOS.map(seccion => (
                    <>
                      {/* Encabezado de sección */}
                      <tr key={seccion.section} className="bg-gray-50 border-b border-gray-100">
                        <td colSpan={1 + roles.length * 4}
                          className="px-4 py-1.5 text-[10px] font-black text-gray-400 uppercase tracking-widest border-r border-gray-100">
                          {seccion.section}
                        </td>
                      </tr>
                      {/* Filas de módulos */}
                      {seccion.items.map(item => (
                        <tr key={item.modulo} className="border-b border-gray-50 hover:bg-blue-50/20 transition-colors">
                          <td className={`px-4 py-2.5 border-r border-gray-100 ${item.subitem ? 'pl-8 text-gray-400 text-[11px]' : 'text-gray-800 font-medium text-xs'}`}>
                            {item.label}
                            {item.soloVer && <span className="ml-2 text-[9px] text-gray-300 font-normal">solo lectura</span>}
                          </td>
                          {roles.map(r => (
                            ACCIONES.map(ac => {
                              const aplica = item.acciones.includes(ac)
                              const activo = aplica ? isPermitidoEfectivo(r.id, item.modulo, ac) : false
                              const modificado = permisosModificados.hasOwnProperty(`${r.id}|${item.modulo}|${ac}`)
                              return (
                                <td key={`${r.id}-${ac}`}
                                  className={`text-center px-1 py-2 ${ac === 'ver' ? 'border-l-2 border-gray-200' : ''} ${modificado ? 'bg-amber-50/50' : ''}`}>
                                  {aplica ? (
                                    <input type="checkbox"
                                      checked={activo}
                                      onChange={() => togglePermiso(r.id, item.modulo, ac)}
                                      className="w-3.5 h-3.5 cursor-pointer accent-[#1168F8]"/>
                                  ) : (
                                    <span className="text-gray-200 text-[10px]">—</span>
                                  )}
                                </td>
                              )
                            })
                          ))}
                        </tr>
                      ))}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Botón guardar abajo también */}
          {Object.keys(permisosModificados).length > 0 && (
            <div className="flex items-center justify-between mt-4 px-5 py-3 bg-amber-50 border border-amber-200 rounded-2xl">
              <span className="text-xs text-amber-800 font-medium">{Object.keys(permisosModificados).length} cambio(s) sin guardar</span>
              <div className="flex gap-2">
                <button onClick={() => setPermisosModificados({})}
                  className="px-4 py-2 border border-amber-200 rounded-xl text-xs text-amber-700 hover:bg-amber-100">Descartar</button>
                <button onClick={guardarPermisos} disabled={savingPermisos}
                  className="px-5 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold disabled:opacity-50">
                  {savingPermisos ? 'Guardando...' : 'Guardar permisos'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── MODAL NUEVO/EDITAR USUARIO ── */}
      {modalUsuario && (modalUsuario.type === 'nuevo' || modalUsuario.type === 'editar') && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <span className="font-bold text-sm text-gray-900">{modalUsuario.type === 'nuevo' ? 'Nuevo usuario' : 'Editar usuario'}</span>
              <button onClick={() => { setModalUsuario(null); setGeneratedPassword('') }} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Nombre completo</label>
                  <input value={formU.nombre} onChange={e => setFormU(f => ({ ...f, nombre: e.target.value }))} className={inp} placeholder="Nombre Apellido"/>
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Email</label>
                  <input type="email" value={formU.email} onChange={e => setFormU(f => ({ ...f, email: e.target.value }))} className={inp} placeholder="correo@empresa.com"/>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Iniciales (máx. 3)</label>
                  <input value={formU.iniciales} onChange={e => setFormU(f => ({ ...f, iniciales: e.target.value.toUpperCase() }))} maxLength={3} className={inp + ' font-mono tracking-widest'} placeholder="RPM"/>
                </div>
                <div className="flex items-end gap-2 pb-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={formU.activo} onChange={e => setFormU(f => ({ ...f, activo: e.target.checked }))} className="w-4 h-4 rounded"/>
                    <span className="text-xs text-gray-600 font-medium">Usuario activo</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-2 uppercase">Roles asignados</label>
                <div className="flex flex-wrap gap-2">
                  {roles.map(r => {
                    const selected = formU.roles_ids.includes(r.id)
                    return (
                      <button key={r.id} onClick={() => setFormU(f => ({
                        ...f, roles_ids: selected ? f.roles_ids.filter(x => x !== r.id) : [...f.roles_ids, r.id]
                      }))}
                        className="px-3 py-1.5 rounded-xl text-[11px] font-bold border-2 transition-all"
                        style={selected ? { background: r.color, borderColor: r.color, color: 'white' } : { background: 'white', borderColor: '#e5e7eb', color: '#6b7280' }}>
                        {r.nombre}
                      </button>
                    )
                  })}
                </div>
              </div>
              {generatedPassword && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <div className="text-[10px] font-bold text-amber-800 mb-1">Contraseña temporal generada:</div>
                  <div className="font-mono text-lg font-black text-amber-900 tracking-widest">{generatedPassword}</div>
                  <div className="text-[10px] text-amber-600 mt-1">Comunicala al usuario. Deberá cambiarla al primer ingreso.</div>
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-between">
              <button onClick={() => { setModalUsuario(null); setGeneratedPassword('') }} className="px-4 py-2 border border-gray-200 rounded-xl text-xs hover:bg-gray-50">
                {generatedPassword ? 'Cerrar' : 'Cancelar'}
              </button>
              {!generatedPassword && (
                <button onClick={guardarUsuario} disabled={saving}
                  className="px-5 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold disabled:opacity-50">
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL RESET PASSWORD ── */}
      {modalUsuario?.type === 'password' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <span className="font-bold text-sm text-gray-900">Resetear contraseña</span>
              <button onClick={() => { setModalUsuario(null); setGeneratedPassword('') }} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="px-5 py-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-xs font-bold" style={{ background: '#1168F8' }}>{modalUsuario.usuario?.iniciales}</div>
                <div>
                  <div className="font-semibold text-sm text-gray-900">{modalUsuario.usuario?.nombre}</div>
                  <div className="text-xs text-gray-400">{modalUsuario.usuario?.email}</div>
                </div>
              </div>
              {generatedPassword ? (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                  <div className="text-[10px] font-bold text-amber-800 mb-2">Nueva contraseña temporal:</div>
                  <div className="font-mono text-2xl font-black text-amber-900 tracking-widest mb-2">{generatedPassword}</div>
                  <div className="text-[10px] text-amber-600">Comunicala al usuario. Deberá cambiarla al próximo ingreso.</div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-xs text-gray-600">Se generará una contraseña temporal aleatoria. El usuario deberá cambiarla al próximo ingreso.</div>
                  <button onClick={() => modalUsuario.usuario && resetPassword(modalUsuario.usuario)}
                    className="w-full py-2.5 bg-amber-600 text-white rounded-xl text-xs font-bold hover:bg-amber-700">Generar nueva contraseña</button>
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
              <button onClick={() => { setModalUsuario(null); setGeneratedPassword('') }} className="px-4 py-2 border border-gray-200 rounded-xl text-xs hover:bg-gray-50">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL HISTORIAL ── */}
      {modalUsuario?.type === 'historial' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <span className="font-bold text-sm text-gray-900">Historial de conexiones</span>
                <span className="text-xs text-gray-400 ml-2">{modalUsuario.usuario?.nombre}</span>
              </div>
              <button onClick={() => setModalUsuario(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="overflow-auto flex-1">
              {historialLogs.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">Sin registros de conexión.</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0">
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {['Fecha y hora', 'IP', 'Ciudad', 'País', 'Navegador'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {historialLogs.map(log => (
                      <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono text-[11px] text-gray-700">
                          {new Date(log.created_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-gray-500">{log.ip || '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{log.ciudad || '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{log.pais || '—'}</td>
                        <td className="px-4 py-3 text-gray-400 text-[10px] max-w-40 truncate">{log.user_agent?.split(' ')[0] || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL NUEVO/EDITAR ROL ── */}
      {modalRol && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <span className="font-bold text-sm text-gray-900">{modalRol.type === 'nuevo' ? 'Nuevo rol' : 'Editar rol'}</span>
              <button onClick={() => setModalRol(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Nombre del rol</label>
                <input value={formR.nombre} onChange={e => setFormR(f => ({ ...f, nombre: e.target.value }))} className={inp} placeholder="ej. Supervisor de operaciones"/>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Descripción</label>
                <input value={formR.descripcion} onChange={e => setFormR(f => ({ ...f, descripcion: e.target.value }))} className={inp} placeholder="¿Qué puede hacer este rol?"/>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-2 uppercase">Color</label>
                <div className="flex gap-2 flex-wrap">
                  {COLORES_ROL.map(c => (
                    <button key={c} onClick={() => setFormR(f => ({ ...f, color: c }))}
                      className={`w-7 h-7 rounded-lg transition-all ${formR.color === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-105'}`}
                      style={{ background: c }}/>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-xl" style={{ background: formR.color + '15', border: `1px solid ${formR.color}30` }}>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[10px] font-bold" style={{ background: formR.color }}>
                  {formR.nombre.slice(0, 2).toUpperCase() || 'RO'}
                </div>
                <span className="text-xs font-semibold" style={{ color: formR.color }}>{formR.nombre || 'Nuevo rol'}</span>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-between">
              <button onClick={() => setModalRol(null)} className="px-4 py-2 border border-gray-200 rounded-xl text-xs hover:bg-gray-50">Cancelar</button>
              <button onClick={guardarRol} disabled={saving}
                className="px-5 py-2 text-white rounded-xl text-xs font-bold disabled:opacity-50"
                style={{ background: formR.color }}>
                {saving ? 'Guardando...' : 'Guardar rol'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
