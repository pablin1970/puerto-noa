'use client'
import { useEffect, useState, useMemo, useRef, Fragment } from 'react'
import type { KeyboardEvent } from 'react'
import { createClient } from '@/lib/supabase'
import { cargarPermisos, puede as puedeAccion } from '@/lib/permisos'
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
  firma_url?: string
  cargo?: string
  telefono?: string
  pais_operacion?: string
  provincia_operacion?: string
  last_login_at?: string
  last_login_ip?: string
  last_login_ciudad?: string
  last_login_region?: string
  last_login_pais?: string
  created_at: string
}

interface Role {
  id: string
  nombre: string
  descripcion: string
  color: string
  activo: boolean
  es_super_admin?: boolean
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
  region?: string
  pais: string
  pais_codigo: string
  fuera_de_zona?: boolean
  user_agent: string
  metodo?: string
  created_at: string
}

// ── Definición completa de módulos y permisos ──────────────────────
import { ACCIONES, MODULOS_PERMISOS, modulosPendientesSet, ACCIONES_POR_MODULO } from '@/lib/modulos'
import type { Accion } from '@/lib/modulos'

// P-25 · Permisos de cuentas por rol. Cada cuenta se administra como modulo='cuenta:<id>'
// reutilizando rol_permisos + puede(). Acciones propias (no entran en la matriz global).
const ACCIONES_CUENTA: string[] = ['ver', 'ingresar', 'egresar']
// Columnas de la matriz = acciones estándar + las dos propias de cuentas (ingresar/egresar).
const COLS_MATRIZ: string[] = [...ACCIONES, 'ingresar', 'egresar']
const COL_LABEL: Record<string, string> = {
  ver: 'Ver', crear: 'Crear', editar: 'Editar', eliminar: 'Elim.', descargar: 'Descargar',
  solicitar: 'Solicitar', autorizar: 'Autorizar', ingresar: 'Ingresar', egresar: 'Egresar',
}
import { PAISES_OPERACION, terminoRegion, regionesDe } from '@/lib/geografiaPaises'
import { abrirConMarca } from '@/lib/documentos'

const COLORES_ROL = ['#1168F8', '#052698', '#0a9e6e', '#b45309', '#6b21a8', '#dc2626', '#0891b2']
const inp = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white'
const HEAD_BG = '#f9fafb'   // gray-50 sólido para celdas fijas

export default function UsuariosPage() {
  const supabase = useMemo(() => createClient(), [])
  const [tab, setTab] = useState<'usuarios' | 'roles'>('usuarios')
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [permisos, setPermisos] = useState<Permiso[]>([])
  const [loading, setLoading] = useState(true)

  const [modalUsuario, setModalUsuario] = useState<{ type: 'nuevo' | 'editar' | 'historial'; usuario?: Usuario } | null>(null)
  const [modalRol, setModalRol] = useState<{ type: 'nuevo' | 'editar'; rol?: Role } | null>(null)
  const [historialLogs, setHistorialLogs] = useState<LoginLog[]>([])
  const [formU, setFormU] = useState({ nombre: '', email: '', iniciales: '', roles_ids: [] as string[], activo: true, cargo: '', telefono: '', pais_operacion: '', provincia_operacion: '' })
  // URLs firmadas para previsualizar foto/firma del bucket privado en el modal
  const [previewFoto, setPreviewFoto] = useState<string>('')
  const [previewFirma, setPreviewFirma] = useState<string>('')
  const [imgPaths, setImgPaths] = useState<{ foto: string; firma: string }>({ foto: '', firma: '' })
  const [subiendoImg, setSubiendoImg] = useState<'foto' | 'firma' | null>(null)
  // Lugares de operación (varios por usuario; provincia '' = todo el país)
  const [lugares, setLugares] = useState<{ pais: string; provincia: string }[]>([])
  const [nlPais, setNlPais] = useState('')
  const [nlProv, setNlProv] = useState('')
  const [lugaresMsg, setLugaresMsg] = useState('')
  const [formR, setFormR] = useState({ nombre: '', descripcion: '', color: '#1168F8' })
  const [saving, setSaving] = useState(false)
  const [permisosModificados, setPermisosModificados] = useState<Record<string, boolean>>({})
  // P-25 · cuentas activas (propias + custodia) para la sección de permisos de cuentas
  const [cuentasPerm, setCuentasPerm] = useState<{ id: string; nombre: string; tipo: string; pais: string; moneda: string; numero_interno: string | null; ambito: 'propia' | 'custodia' }[]>([])
  const [savingPermisos, setSavingPermisos] = useState(false)
  // Módulos ya confirmados con "Guardar" (tabla modulos_revisados) + los marcados en esta sesión sin guardar aún
  const [modulosRevisados, setModulosRevisados] = useState<Map<string, string[]>>(new Map())
  const [modulosRevisadosLocal, setModulosRevisadosLocal] = useState<Set<string>>(new Set())

  // Refs y medición para la matriz con cabecera/columna fijas
  const matrizScrollRef = useRef<HTMLDivElement | null>(null)
  const headRow1Ref = useRef<HTMLTableRowElement | null>(null)
  const [row1H, setRow1H] = useState(34)

  const [permUser, setPermUser] = useState<Record<string, string[]>>({})
  const [permUserListos, setPermUserListos] = useState(false)
  useEffect(() => { cargarPermisos().then(p => { setPermUser(p); setPermUserListos(true) }) }, [])

  useEffect(() => { loadAll() }, [])

  // Mide la altura de la primera fila del encabezado para apilar la segunda fila sticky justo debajo
  useEffect(() => {
    function measure() { if (headRow1Ref.current) setRow1H(headRow1Ref.current.offsetHeight) }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [roles, tab])

  // Desplazamiento de la matriz con las flechas del teclado (la grilla debe tener foco)
  function handleMatrizKey(e: KeyboardEvent<HTMLDivElement>) {
    const el = matrizScrollRef.current
    if (!el) return
    const STEP = 64
    switch (e.key) {
      case 'ArrowRight': el.scrollLeft += STEP; e.preventDefault(); break
      case 'ArrowLeft':  el.scrollLeft -= STEP; e.preventDefault(); break
      case 'ArrowDown':  el.scrollTop  += STEP; e.preventDefault(); break
      case 'ArrowUp':    el.scrollTop  -= STEP; e.preventDefault(); break
      case 'PageDown':   el.scrollTop  += el.clientHeight * 0.85; e.preventDefault(); break
      case 'PageUp':     el.scrollTop  -= el.clientHeight * 0.85; e.preventDefault(); break
      case 'Home':       el.scrollLeft = 0; e.preventDefault(); break
      case 'End':        el.scrollLeft = el.scrollWidth; e.preventDefault(); break
    }
  }

  async function loadAll() {
    setLoading(true)
    const { data: authData } = await supabase.auth.getUser()
    const [uRes, rRes, pRes, mrRes, cpRes, fcRes] = await Promise.all([
      supabase.from('usuarios').select('*').order('nombre'),
      supabase.from('roles').select('*').order('nombre'),
      supabase.from('rol_permisos').select('*'),
      supabase.from('modulos_revisados').select('modulo, acciones'),
      (supabase.from('cuentas_pn') as any).select('id,nombre,tipo,pais,moneda,numero_interno').eq('activo', true).order('nombre'),
      (supabase.from('fondos_cuentas') as any).select('id,nombre,tipo,pais,moneda,numero_interno').eq('activo', true).order('orden'),
    ])
    if (uRes.data) setUsuarios(uRes.data as Usuario[])
    if (rRes.data) {
      // Super Administrador primero (jerarquía visual), luego el resto por nombre
      const ordenados = (rRes.data as Role[]).sort((a, b) => {
        if (a.es_super_admin && !b.es_super_admin) return -1
        if (!a.es_super_admin && b.es_super_admin) return 1
        return a.nombre.localeCompare(b.nombre)
      })
      setRoles(ordenados)
    }
    if (pRes.data) setPermisos(pRes.data as Permiso[])
    if (mrRes.data) setModulosRevisados(new Map((mrRes.data as any[]).map(r => [r.modulo, (r.acciones || []) as string[]])))
    const cuentas: { id: string; nombre: string; tipo: string; pais: string; moneda: string; numero_interno: string | null; ambito: 'propia' | 'custodia' }[] = []
    if (cpRes.data) (cpRes.data as any[]).forEach(c => cuentas.push({ ...c, ambito: 'propia' }))
    if (fcRes.data) (fcRes.data as any[]).forEach(c => cuentas.push({ ...c, ambito: 'custodia' }))
    setCuentasPerm(cuentas)
    setLoading(false)
  }

  // ── Detección de módulos nuevos sin configurar ────────────────────
  // Un módulo está "configurado" SOLO cuando se confirmó con Guardar (tabla modulos_revisados).
  // Entrar a ver no lo confirma. Puede quedar sin permisos para nadie y aun así estar revisado.
  // Pendiente = módulo nuevo O módulo existente al que se le agregó una acción nueva.
  const modulosNuevos = useMemo(() => {
    const pend = modulosPendientesSet(modulosRevisados)
    const deModulos = MODULOS_PERMISOS
      .flatMap(s => s.items)
      .filter(it => pend.has(it.modulo))
      .map(it => ({ modulo: it.modulo, label: it.label.replace(/^→\s*/, ''), acciones: it.acciones as string[] }))
    // Una cuenta es "nueva" hasta que se confirma (asignándole permisos o confirmando sin permisos).
    // Por defecto no la ve nadie, así que el aviso ámbar recuerda ir a asignarle permisos.
    const deCuentas = cuentasPerm
      .filter(c => !modulosRevisados.has(`cuenta:${c.id}`))
      .map(c => ({ modulo: `cuenta:${c.id}`, label: c.ambito === 'custodia' ? `${c.nombre} · custodia` : c.nombre, acciones: ACCIONES_CUENTA }))
    return [...deModulos, ...deCuentas]
  }, [modulosRevisados, cuentasPerm])

  // Set de módulos nuevos (sin confirmar) para resaltar su fila en verde
  const modulosNuevosSet = useMemo(() => new Set(modulosNuevos.map(m => m.modulo)), [modulosNuevos])

  // P-25 · La matriz = secciones del código + una sección "Cuentas" generada con las cuentas activas.
  // Cada cuenta es un ítem modulo='cuenta:<id>' con acciones ver/ingresar/egresar.
  const seccionesMatriz = useMemo(() => {
    const base = MODULOS_PERMISOS as { section: string; icono?: string; items: any[] }[]
    if (cuentasPerm.length === 0) return base
    return [...base, {
      section: 'Cuentas — cajas, bancos y custodia', icono: '💳',
      items: cuentasPerm.map(c => ({
        modulo: `cuenta:${c.id}`,
        label: c.ambito === 'custodia' ? `${c.nombre} · custodia` : c.nombre,
        acciones: ACCIONES_CUENTA,
      })),
    }]
  }, [cuentasPerm])

  // Total de cambios pendientes de guardar = permisos tocados + módulos confirmados en esta sesión
  const totalCambios = Object.keys(permisosModificados).length + modulosRevisadosLocal.size

  function isPermitido(rolId: string, modulo: string, accion: string): boolean {
    return permisos.some(p => p.rol_id === rolId && p.modulo === modulo && p.accion === accion && p.permitido)
  }

  function togglePermiso(rolId: string, modulo: string, accion: string) {
    const key = `${rolId}|${modulo}|${accion}`
    const current = permisosModificados.hasOwnProperty(key)
      ? permisosModificados[key]
      : isPermitido(rolId, modulo, accion)
    setPermisosModificados(pm => ({ ...pm, [key]: !current }))
    // Si es un módulo nuevo, tocarle un permiso ya lo cuenta como revisado (se confirma al guardar)
    if (modulosNuevosSet.has(modulo)) {
      setModulosRevisadosLocal(prev => prev.has(modulo) ? prev : new Set(prev).add(modulo))
    }
  }

  // Marcar/desmarcar un módulo nuevo como "revisado" sin asignarle permisos (se confirma al guardar)
  function toggleRevisadoLocal(modulo: string) {
    setModulosRevisadosLocal(prev => {
      const n = new Set(prev)
      if (n.has(modulo)) n.delete(modulo); else n.add(modulo)
      return n
    })
  }

  function isPermitidoEfectivo(rolId: string, modulo: string, accion: string): boolean {
    const key = `${rolId}|${modulo}|${accion}`
    if (permisosModificados.hasOwnProperty(key)) return permisosModificados[key]
    return isPermitido(rolId, modulo, accion)
  }

  // Tilde/destilde toda una columna (rol + accion) para todos los módulos que la soporten
  function toggleColumna(rolId: string, accion: string) {
    const todosModulos = seccionesMatriz.flatMap(s => s.items).filter(it => (it.acciones as string[]).includes(accion))
    const todosActivos = todosModulos.every(it => isPermitidoEfectivo(rolId, it.modulo, accion))
    const updates: Record<string, boolean> = {}
    todosModulos.forEach(it => {
      updates[`${rolId}|${it.modulo}|${accion}`] = !todosActivos
    })
    setPermisosModificados(pm => ({ ...pm, ...updates }))
  }

  function columnaTodasActivas(rolId: string, accion: string): boolean {
    const modulos = seccionesMatriz.flatMap(s => s.items).filter(it => (it.acciones as string[]).includes(accion))
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
    // Confirmar como "revisados": los marcados manualmente + TODO módulo nuevo cuyos
    // permisos se tocaron en esta sesión (incluye el tilde de columna entera, que antes
    // llenaba rol_permisos pero no confirmaba el módulo y dejaba el cartel pegado).
    const aConfirmar = new Set<string>(modulosRevisadosLocal)
    Object.keys(permisosModificados).forEach(key => {
      const modulo = key.split('|')[1]
      if (modulosNuevosSet.has(modulo)) aConfirmar.add(modulo)
    })
    if (aConfirmar.size > 0) {
      const filas = Array.from(aConfirmar).map(m => ({ modulo: m, acciones: m.startsWith('cuenta:') ? ACCIONES_CUENTA : (ACCIONES_POR_MODULO[m] || []) }))
      await (supabase.from('modulos_revisados') as any).upsert(filas, { onConflict: 'modulo' })
    }
    setPermisosModificados({})
    setModulosRevisadosLocal(new Set())
    await loadAll()
    setSavingPermisos(false)
  }

  async function guardarUsuario() {
    if (!formU.nombre || !formU.email) return
    setSaving(true)
    const iniciales = formU.iniciales || formU.nombre.split(' ').map((x: string) => x[0]).join('').slice(0, 3).toUpperCase()
    let usuarioId: string | null = null
    if (modalUsuario?.type === 'nuevo') {
      // Acceso solo con Google: la cuenta de autenticación se crea automáticamente la
      // primera vez que el usuario entra con su cuenta @puertonoa.com. Acá solo
      // registramos el usuario; el auth_id se vincula por email en /auth/callback.
      const { data, error } = await (supabase.from('usuarios') as any).insert({
        auth_id: null,
        nombre: formU.nombre, email: formU.email.trim().toLowerCase(), iniciales,
        rol: 'ejecutivo', roles_ids: formU.roles_ids, activo: formU.activo,
        cargo: formU.cargo || null, telefono: formU.telefono || null,
      }).select('id').single()
      if (error) { alert('Error al crear el usuario: ' + error.message); setSaving(false); return }
      usuarioId = (data as any)?.id || null
    } else if (modalUsuario?.usuario) {
      await (supabase.from('usuarios') as any).update({
        nombre: formU.nombre, email: formU.email, iniciales, roles_ids: formU.roles_ids, activo: formU.activo,
        cargo: formU.cargo || null, telefono: formU.telefono || null,
      }).eq('id', modalUsuario.usuario.id)
      usuarioId = modalUsuario.usuario.id
    }

    // Sincronizar lugares de operación (reemplazo completo de la lista del usuario)
    if (usuarioId) {
      await supabase.from('usuario_lugares').delete().eq('usuario_id', usuarioId)
      if (lugares.length) {
        await (supabase.from('usuario_lugares') as any).insert(
          lugares.map(l => ({ usuario_id: usuarioId, pais: l.pais, provincia: l.provincia || null }))
        )
      }
    }

    setModalUsuario(null)
    await loadAll()
    setSaving(false)
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

  // Sube foto o firma al bucket PRIVADO usuarios_privado. Guarda el PATH (no URL pública).
  // Requiere permiso usuarios_imagenes.crear (o ser el propio usuario / super admin, vía RLS).
  async function subirImagen(usuario: Usuario, tipo: 'foto' | 'firma', file: File) {
    setSubiendoImg(tipo)
    const ext = (file.name.split('.').pop() || 'png').toLowerCase()
    const path = `${usuario.id}/${tipo}.${ext}`
    const { error } = await supabase.storage.from('usuarios_privado').upload(path, file, { upsert: true })
    if (error) { alert('No se pudo subir la imagen: ' + error.message); setSubiendoImg(null); return }
    const campo = tipo === 'foto' ? 'foto_url' : 'firma_url'
    await (supabase.from('usuarios') as any).update({ [campo]: path }).eq('id', usuario.id)
    setImgPaths(prev => ({ ...prev, [tipo]: path }))
    // Refrescar la previsualización con URL firmada
    try {
      const { data: s } = await supabase.storage.from('usuarios_privado').createSignedUrl(path, 3600)
      if (s?.signedUrl) { tipo === 'foto' ? setPreviewFoto(s.signedUrl) : setPreviewFirma(s.signedUrl) }
    } catch {}
    await loadAll()
    setSubiendoImg(null)
  }

  // Descarga el ORIGINAL limpio (sin marca). Gobernado por usuarios_imagenes.descargar (RLS).
  async function descargarImagen(path: string) {
    try {
      const { data } = await supabase.storage.from('usuarios_privado').createSignedUrl(path, 60, { download: true })
      if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noreferrer')
      else alert('No tenés permiso para descargar esta imagen.')
    } catch { alert('No tenés permiso para descargar esta imagen.') }
  }

  // Genera URLs firmadas para previsualizar foto/firma al abrir la edición.
  async function cargarPreviewImagenes(u: Usuario) {
    setPreviewFoto(''); setPreviewFirma('')
    setImgPaths({ foto: (u as any).foto_url && !(u as any).foto_url.startsWith('http') ? (u as any).foto_url : '', firma: (u as any).firma_url || '' })
    for (const [campo, set] of [['foto_url', setPreviewFoto], ['firma_url', setPreviewFirma]] as const) {
      const p = (u as any)[campo]
      if (p && !p.startsWith('http')) {
        try {
          const { data: s } = await supabase.storage.from('usuarios_privado').createSignedUrl(p, 3600)
          if (s?.signedUrl) set(s.signedUrl)
        } catch {}
      } else if (p) { set(p) }
    }
  }

  // ── Lugares de operación ──
  async function cargarLugares(usuarioId: string) {
    setLugares([]); setNlPais(''); setNlProv(''); setLugaresMsg('')
    const { data } = await supabase.from('usuario_lugares').select('pais, provincia').eq('usuario_id', usuarioId).order('pais')
    if (data) setLugares((data as any[]).map(l => ({ pais: l.pais, provincia: l.provincia || '' })))
  }

  // Regla por país: país entero XOR provincias. Agregar una provincia saca el "país entero";
  // no se permite "país entero" si ya hay provincias de ese país.
  function agregarLugar() {
    setLugaresMsg('')
    const p = nlPais, r = nlProv
    if (!p) { setLugaresMsg('Elegí un país.'); return }
    if (!r) {
      if (lugares.some(l => l.pais === p && l.provincia)) {
        setLugaresMsg(`${p} ya tiene provincias cargadas. Quitalas si querés tomar el país entero.`); return
      }
      if (!lugares.some(l => l.pais === p && !l.provincia)) setLugares(prev => [...prev, { pais: p, provincia: '' }])
    } else {
      setLugares(prev => {
        const base = prev.filter(l => !(l.pais === p && !l.provincia))  // saca "país entero" de ese país
        if (base.some(l => l.pais === p && l.provincia === r)) return base  // ya existe, no duplica
        return [...base, { pais: p, provincia: r }]
      })
      setNlProv('')
    }
  }

  function quitarLugar(i: number) {
    setLugares(prev => prev.filter((_, idx) => idx !== i))
    setLugaresMsg('')
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

  const accionLabel = COL_LABEL

  if (permUserListos && !puedeAccion(permUser, 'usuarios', 'ver')) {
    return (
      <div className="p-6 bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-3">🔒</div>
          <h2 className="text-lg font-bold text-gray-700">Sin acceso</h2>
          <p className="text-sm text-gray-400 mt-1">No tenés permiso para ver esta sección. Si creés que es un error, contactá al administrador.</p>
        </div>
      </div>
    )
  }

  const puedeCrearU = puedeAccion(permUser,'usuarios','crear')
  const puedeEditarU = puedeAccion(permUser,'usuarios','editar')
  const puedeCrearR = puedeAccion(permUser,'roles','crear')
  const puedeEditarR = puedeAccion(permUser,'roles','editar')
  const puedeEliminarR = puedeAccion(permUser,'roles','eliminar')
  const puedeVerHistorial = puedeAccion(permUser,'usuarios_historial','ver')
  const puedeVerImg = puedeAccion(permUser,'usuarios_imagenes','ver')
  const puedeCrearImg = puedeAccion(permUser,'usuarios_imagenes','crear')
  const puedeDescargarImg = puedeAccion(permUser,'usuarios_imagenes','descargar')

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Usuarios y roles</h1>
          <p className="text-xs text-gray-400 mt-0.5">{usuarios.filter(u => u.activo).length} activos · {roles.length} roles</p>
        </div>
        <div className="flex gap-2">
          {tab === 'usuarios' && puedeCrearU && (
            <button onClick={() => { setFormU({ nombre: '', email: '', iniciales: '', roles_ids: [], activo: true, cargo: '', telefono: '', pais_operacion: '', provincia_operacion: '' }); setPreviewFoto(''); setPreviewFirma(''); setImgPaths({ foto: '', firma: '' }); setLugares([]); setNlPais(''); setNlProv(''); setLugaresMsg(''); setModalUsuario({ type: 'nuevo' }) }}
              className="px-5 py-2.5 bg-[#1168F8] text-white rounded-xl text-sm font-bold hover:bg-[#0a4fc4] shadow-sm">
              + Nuevo usuario
            </button>
          )}
          {tab === 'roles' && puedeCrearR && (
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
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-[11px] font-bold" style={{ background: '#1168F8' }}>{u.iniciales}</div>
                          </div>
                          <div>
                            <div className="font-semibold text-gray-900 flex items-center gap-1.5">
                              {u.nombre}
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
                        {u.last_login_ciudad ? <div className="text-xs text-gray-600">{[u.last_login_ciudad, u.last_login_region, u.last_login_pais].filter(Boolean).join(', ')}</div> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        {puedeEditarU ? (
                        <button onClick={() => toggleActivo(u)}
                          className={`inline-flex px-3 py-1 rounded-full text-[10px] font-bold border transition-colors ${u.activo ? 'bg-green-50 text-green-700 border-green-200 hover:bg-red-50 hover:text-red-700 hover:border-red-200' : 'bg-red-50 text-red-700 border-red-200 hover:bg-green-50 hover:text-green-700 hover:border-green-200'}`}>
                          {u.activo ? 'Activo' : 'Pausado'}
                        </button>
                        ) : <span className={`inline-flex px-3 py-1 rounded-full text-[10px] font-bold border ${u.activo ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>{u.activo ? 'Activo' : 'Pausado'}</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex gap-1.5">
                          {puedeEditarU && <button onClick={() => { setFormU({ nombre: u.nombre, email: u.email, iniciales: u.iniciales, roles_ids: u.roles_ids || [], activo: u.activo, cargo: u.cargo || '', telefono: u.telefono || '', pais_operacion: u.pais_operacion || '', provincia_operacion: u.provincia_operacion || '' }); cargarPreviewImagenes(u); cargarLugares(u.id); setModalUsuario({ type: 'editar', usuario: u }) }}
                            className="p-1.5 border border-gray-200 rounded-lg hover:bg-[#EBF2FF] hover:border-[#93B8FC] text-gray-500 hover:text-[#1168F8] transition-colors" title="Editar">✏</button>}
                          {puedeVerHistorial && <button onClick={() => verHistorial(u)}
                            className="p-1.5 border border-gray-200 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors" title="Historial">📋</button>}
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
          {/* Tira compacta de roles */}
          <div className="flex flex-wrap gap-2 mb-4">
            {roles.map(r => (
              <div key={r.id} title={r.descripcion}
                className="group flex items-center gap-2 bg-white border border-gray-100 rounded-xl pl-2 pr-1.5 py-1.5 shadow-sm">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ background: r.color }}>
                  {r.nombre.slice(0, 2).toUpperCase()}
                </div>
                <div className="leading-tight">
                  <div className="font-bold text-[11px] text-gray-900 whitespace-nowrap">{r.nombre}</div>
                  <div className="text-[9px] text-gray-400">{usuarios.filter(u => (u.roles_ids || []).includes(r.id)).length} usuario(s)</div>
                </div>
                <div className="flex gap-0.5 ml-0.5 opacity-40 group-hover:opacity-100 transition-opacity">
                  {puedeEditarR && <button onClick={() => { setFormR({ nombre: r.nombre, descripcion: r.descripcion, color: r.color }); setModalRol({ type: 'editar', rol: r }) }}
                    className="text-gray-400 hover:text-[#1168F8] text-[11px] p-1">✏</button>}
                  {puedeEliminarR && <button onClick={() => eliminarRol(r.id)} className="text-gray-400 hover:text-red-500 text-[11px] p-1">🗑</button>}
                </div>
              </div>
            ))}
          </div>

          {/* Matriz de permisos */}
          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="font-bold text-sm text-gray-900">Matriz de permisos</div>
                <div className="text-[10px] text-gray-400 mt-0.5">
                  El checkbox del encabezado activa/desactiva toda la columna · cabecera y primera columna fijas · clic en la grilla + flechas del teclado para desplazarte
                </div>
              </div>
              {totalCambios > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-amber-700 font-medium bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200">
                    {totalCambios} cambio(s) sin guardar
                  </span>
                  <button onClick={() => { setPermisosModificados({}); setModulosRevisadosLocal(new Set()) }}
                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50">Descartar</button>
                  {puedeEditarR && <button onClick={guardarPermisos} disabled={savingPermisos}
                    className="px-4 py-1.5 bg-[#1168F8] text-white rounded-lg text-xs font-bold disabled:opacity-50">
                    {savingPermisos ? 'Guardando...' : 'Guardar permisos'}
                  </button>}
                </div>
              )}
            </div>

            {/* ⚠ AVISO: módulos nuevos detectados sin configurar */}
            {modulosNuevos.length > 0 && (
              <div className="mx-4 mt-4 mb-1 border-2 border-amber-400 bg-amber-50 rounded-xl overflow-hidden">
                <div className="bg-amber-400 px-4 py-2 flex items-center gap-2">
                  <span className="text-lg">⚠️</span>
                  <span className="font-bold text-sm text-amber-900">
                    {modulosNuevos.length} módulo(s) nuevo(s) detectado(s) sin configurar
                  </span>
                </div>
                <div className="px-4 py-3">
                  <p className="text-xs text-amber-900 mb-2">
                    Estos módulos existen en el sistema pero todavía no tienen permisos cargados para ningún rol.
                    Por seguridad están <strong>bloqueados para todos</strong> (excepto Super Administrador, que siempre tiene acceso).
                    Configurá sus permisos en la matriz de abajo, o si necesitás ayuda, copiá este detalle y pasáselo a tu desarrollador:
                  </p>
                  <div className="bg-white border border-amber-200 rounded-lg p-3 font-mono text-[10px] text-gray-700 whitespace-pre-wrap select-all">
                    {`MÓDULOS NUEVOS SIN CONFIGURAR (${modulosNuevos.length}):\n` +
                      modulosNuevos.map(m => `• ${m.modulo} — "${m.label}" — acciones: [${m.acciones.join(', ')}]`).join('\n')}
                  </div>
                </div>
              </div>
            )}
            <div
              ref={matrizScrollRef}
              tabIndex={0}
              onKeyDown={handleMatrizKey}
              className="overflow-auto focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#1168F8]/30"
              style={{ maxHeight: 'calc(100vh - 70px)', minHeight: 600, WebkitOverflowScrolling: 'touch' }}>
              <table className="text-xs border-separate" style={{ minWidth: '1200px', width: 'max-content', borderSpacing: 0 }}>
                <thead>
                  {/* Fila 1: nombres de roles */}
                  <tr ref={headRow1Ref}>
                    <th className="sticky left-0 top-0 z-30 px-4 py-2 border-r border-b border-gray-200"
                      style={{ background: HEAD_BG, minWidth: 184, boxShadow: '2px 0 5px -3px rgba(0,0,0,0.12)' }} />
                    {roles.map(r => (
                      <th key={r.id} colSpan={COLS_MATRIZ.length}
                        className="sticky top-0 z-20 text-center py-2.5 px-2 text-[11px] font-bold whitespace-nowrap"
                        style={{ color: r.color, background: HEAD_BG, borderBottom: `3px solid ${r.color}`, borderLeft: `2px solid ${r.color}33` }}>
                        <div className="flex flex-col items-center gap-0.5">
                          <span>{r.nombre}</span>
                          {r.es_super_admin && (
                            <span className="text-[8px] font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full border border-green-300 normal-case">
                              ★ Acceso total
                            </span>
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                  {/* Fila 2: acciones + checkbox tilde-todo */}
                  <tr>
                    <th className="sticky left-0 z-30 px-4 py-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider border-r border-b border-gray-200"
                      style={{ top: row1H, background: HEAD_BG, minWidth: 184, boxShadow: '2px 2px 5px -3px rgba(0,0,0,0.14)' }}>
                      Módulo
                    </th>
                    {roles.map(r => (
                      COLS_MATRIZ.map((ac: string) => (
                        <th key={`${r.id}-${ac}`}
                          className="sticky z-20 text-center px-2 py-2 text-[10px] text-gray-500 font-semibold border-b border-gray-200 whitespace-nowrap"
                          style={{ top: row1H, background: HEAD_BG, ...(ac === 'ver' ? { borderLeft: `2px solid ${r.color}33` } : {}) }}>
                          <div className="flex flex-col items-center gap-1">
                            <input type="checkbox"
                              checked={r.es_super_admin ? true : columnaTodasActivas(r.id, ac)}
                              disabled={r.es_super_admin || !puedeEditarR}
                              onChange={() => { if (!r.es_super_admin && puedeEditarR) toggleColumna(r.id, ac) }}
                              title={r.es_super_admin ? 'El Super Administrador siempre tiene acceso total' : `Tildar/destildar "${accionLabel[ac]}" en todos los módulos`}
                              className={`w-3.5 h-3.5 ${r.es_super_admin ? 'cursor-not-allowed accent-green-600 opacity-70' : !puedeEditarR ? 'cursor-not-allowed accent-gray-400' : 'cursor-pointer accent-[#1168F8]'}`}/>
                            <span>{accionLabel[ac]}</span>
                          </div>
                        </th>
                      ))
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {seccionesMatriz.map(seccion => (
                    <Fragment key={seccion.section}>
                      {/* Encabezado de sección */}
                      <tr>
                        <td colSpan={1 + roles.length * COLS_MATRIZ.length}
                          className="px-4 py-2 border-y-2 border-[#1168F8]/20"
                          style={{ background: 'linear-gradient(90deg, #e8eeff 0%, #f0f4fa 100%)' }}>
                          <span className="text-[11px] font-black text-[#052698] uppercase tracking-widest flex items-center gap-1.5"
                            style={{ position: 'sticky', left: '1rem', display: 'inline-flex' }}>
                            {seccion.icono && <span className="text-sm">{seccion.icono}</span>}
                            {seccion.section}
                          </span>
                        </td>
                      </tr>
                      {/* Filas de módulos */}
                      {seccion.items.map(item => {
                        const esNuevo = modulosNuevosSet.has(item.modulo)
                        return (
                        <tr key={item.modulo} className={`group border-b transition-colors ${esNuevo ? 'border-green-200 bg-green-50' : 'border-gray-50 hover:bg-blue-50/10'}`}>
                          <td className={`sticky left-0 z-10 px-4 py-2.5 border-r border-gray-200 ${esNuevo ? 'bg-green-50 group-hover:bg-green-100' : 'bg-white group-hover:bg-[#f4f8ff]'} ${item.subitem ? 'pl-8 text-gray-400 text-[11px]' : 'text-gray-800 font-medium text-xs'}`}
                            style={{ minWidth: 184, boxShadow: '2px 0 5px -3px rgba(0,0,0,0.08)' }}>
                            {item.label}
                            {item.soloVer && <span className="ml-2 text-[9px] text-gray-300 font-normal">solo lectura</span>}
                            {esNuevo && (
                              <div className="mt-1 flex items-center gap-1.5">
                                {modulosRevisadosLocal.has(item.modulo) ? (
                                  <>
                                    <span className="text-[9px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded-full border border-blue-300 normal-case">✓ confirmado · guardar</span>
                                    <button onClick={() => toggleRevisadoLocal(item.modulo)} className="text-[9px] text-gray-400 hover:text-gray-600 underline normal-case">deshacer</button>
                                  </>
                                ) : (
                                  <>
                                    <span className="text-[9px] font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full border border-green-300 normal-case">● sin asignar</span>
                                    {puedeEditarR && <button onClick={() => toggleRevisadoLocal(item.modulo)} className="text-[9px] text-green-700 hover:text-green-900 underline normal-case" title="Confirmar este módulo aunque no le asignes permisos a nadie">confirmar sin permisos</button>}
                                  </>
                                )}
                              </div>
                            )}
                          </td>
                          {roles.map(r => (
                            COLS_MATRIZ.map((ac: string) => {
                              const aplica = (item.acciones as string[]).includes(ac)
                              const esSA = !!r.es_super_admin
                              // Super Administrador: siempre marcado y bloqueado (acceso total garantizado)
                              const activo = esSA ? aplica : (aplica ? isPermitidoEfectivo(r.id, item.modulo, ac) : false)
                              const modificado = permisosModificados.hasOwnProperty(`${r.id}|${item.modulo}|${ac}`)
                              return (
                                <td key={`${r.id}-${ac}`}
                                  className={`text-center px-2 py-2 ${modificado ? 'bg-amber-100/70' : ''} ${esSA ? 'bg-green-50/40' : ''}`}
                                  style={ac === 'ver' ? { borderLeft: `2px solid ${r.color}33` } : undefined}>
                                  {aplica ? (
                                    <input type="checkbox"
                                      checked={activo}
                                      disabled={esSA || !puedeEditarR}
                                      onChange={() => { if (!esSA && puedeEditarR) togglePermiso(r.id, item.modulo, ac) }}
                                      className={`w-3.5 h-3.5 ${esSA ? 'cursor-not-allowed accent-green-600 opacity-70' : !puedeEditarR ? 'cursor-not-allowed accent-gray-400' : 'cursor-pointer accent-[#1168F8]'}`}/>
                                  ) : (
                                    <span className="text-gray-200 text-[10px]">—</span>
                                  )}
                                </td>
                              )
                            })
                          ))}
                        </tr>
                        )
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Botón guardar abajo también */}
          {totalCambios > 0 && (
            <div className="flex items-center justify-between mt-4 px-5 py-3 bg-amber-50 border border-amber-200 rounded-2xl">
              <span className="text-xs text-amber-800 font-medium">{totalCambios} cambio(s) sin guardar</span>
              <div className="flex gap-2">
                <button onClick={() => { setPermisosModificados({}); setModulosRevisadosLocal(new Set()) }}
                  className="px-4 py-2 border border-amber-200 rounded-xl text-xs text-amber-700 hover:bg-amber-100">Descartar</button>
                {puedeEditarR && <button onClick={guardarPermisos} disabled={savingPermisos}
                  className="px-5 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold disabled:opacity-50">
                  {savingPermisos ? 'Guardando...' : 'Guardar permisos'}
                </button>}
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
              <button onClick={() => setModalUsuario(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="px-5 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Nombre completo</label>
                  <input value={formU.nombre} onChange={e => setFormU(f => ({ ...f, nombre: e.target.value }))} className={inp} placeholder="Nombre Apellido"/>
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Email <span className="text-[#1168F8] normal-case font-medium">· va a la firma</span></label>
                  <input type="email" value={formU.email} onChange={e => setFormU(f => ({ ...f, email: e.target.value }))} className={inp} placeholder="correo@empresa.com"/>
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Cargo <span className="text-[#1168F8] normal-case font-medium">· va a la firma</span></label>
                  <input value={formU.cargo} onChange={e => setFormU(f => ({ ...f, cargo: e.target.value }))} className={inp} placeholder="Ej: Ejecutivo de Comercio Exterior"/>
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Teléfono <span className="text-[#1168F8] normal-case font-medium">· va a la firma</span></label>
                  <input value={formU.telefono} onChange={e => setFormU(f => ({ ...f, telefono: e.target.value }))} className={inp} placeholder="+54 388 ..."/>
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
              {/* ── Lugares de operación (control de seguridad del login) ── */}
              <div className="border-t border-gray-100 pt-3">
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Lugares de operación <span className="text-gray-400 normal-case font-normal">· avisa si entra fuera de zona</span></label>
                <p className="text-[11px] text-gray-400 mb-2 leading-snug">En zona si coincide con alguno. Por país: país entero o provincias, no las dos.</p>

                <div className="flex flex-wrap gap-2 mb-2">
                  {lugares.length === 0
                    ? <span className="text-[11px] text-gray-400 italic">Sin lugares: no se evalúa zona para este usuario.</span>
                    : lugares.map((l, i) => (
                      <span key={i} className="inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-[#1168F8] rounded-full pl-3 pr-1.5 py-1 text-[11px]">
                        <span><span className="font-semibold">{l.pais}</span> · {l.provincia || <span className="opacity-75">todo el país</span>}</span>
                        <button type="button" onClick={() => quitarLugar(i)} aria-label="Quitar lugar" className="w-4 h-4 inline-flex items-center justify-center rounded-full hover:bg-blue-100 text-sm leading-none">×</button>
                      </span>
                    ))}
                </div>

                <div className="bg-gray-50 rounded-xl p-2.5 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-1">País</label>
                      <select value={nlPais} onChange={e => { setNlPais(e.target.value); setNlProv(''); setLugaresMsg('') }} className={inp}>
                        <option value="">—</option>
                        {PAISES_OPERACION.map(p => <option key={p.codigo} value={p.nombre}>{p.nombre}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-1">{terminoRegion(nlPais)}</label>
                      <select value={nlProv} onChange={e => setNlProv(e.target.value)} disabled={!nlPais} className={inp + (!nlPais ? ' opacity-50' : '')}>
                        <option value="">— Todo el país —</option>
                        {regionesDe(nlPais).map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                  </div>
                  <button type="button" onClick={agregarLugar} disabled={!nlPais}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1168F8] border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-50 disabled:opacity-40">
                    + Agregar lugar
                  </button>
                  {lugaresMsg && <div className="text-[11px] text-amber-600">{lugaresMsg}</div>}
                </div>
              </div>

              {/* ── Foto y firma (bucket privado, permiso usuarios_imagenes) ── */}
              <div className="border-t border-gray-100 pt-3">
                <label className="block text-[10px] font-semibold text-gray-500 mb-2 uppercase">Foto y firma <span className="text-gray-400 normal-case font-normal">· datos sensibles, protegidos por permiso</span></label>
                {modalUsuario.type === 'nuevo' ? (
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-[11px] text-amber-700">
                    Guardá primero el usuario para poder cargar la foto y la firma.
                  </div>
                ) : !puedeCrearImg ? (
                  <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-[11px] text-gray-500">
                    No tenés permiso para cargar imágenes de usuario.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-1">Foto</label>
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                          {previewFoto ? <img src={previewFoto} alt="Foto" className="w-full h-full object-cover"/> : <span className="text-[9px] text-gray-400">sin foto</span>}
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="px-2 py-1 border border-gray-200 rounded-lg text-[10px] cursor-pointer hover:bg-gray-50 text-center">
                            {subiendoImg === 'foto' ? 'Subiendo…' : 'Subir'}
                            <input type="file" accept="image/png,image/jpeg" className="hidden"
                              onChange={e => { const f = e.target.files?.[0]; if (f && modalUsuario.usuario) subirImagen(modalUsuario.usuario, 'foto', f) }}/>
                          </label>
                          {imgPaths.foto && (
                            <div className="flex gap-1">
                              {puedeVerImg && <button onClick={() => abrirConMarca('usuarios_privado', imgPaths.foto)} className="text-[10px] text-[#1168F8] hover:underline">Ver</button>}
                              {puedeDescargarImg && <button onClick={() => descargarImagen(imgPaths.foto)} className="text-[10px] text-gray-500 hover:underline">Descargar</button>}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-1">Firma manuscrita</label>
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-12 rounded-xl bg-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                          {previewFirma ? <img src={previewFirma} alt="Firma" className="w-full h-full object-contain"/> : <span className="text-[9px] text-gray-400">sin firma</span>}
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="px-2 py-1 border border-gray-200 rounded-lg text-[10px] cursor-pointer hover:bg-gray-50 text-center">
                            {subiendoImg === 'firma' ? 'Subiendo…' : 'Subir'}
                            <input type="file" accept="image/png,image/jpeg" className="hidden"
                              onChange={e => { const f = e.target.files?.[0]; if (f && modalUsuario.usuario) subirImagen(modalUsuario.usuario, 'firma', f) }}/>
                          </label>
                          {imgPaths.firma && (
                            <div className="flex gap-1">
                              {puedeVerImg && <button onClick={() => abrirConMarca('usuarios_privado', imgPaths.firma)} className="text-[10px] text-[#1168F8] hover:underline">Ver</button>}
                              {puedeDescargarImg && <button onClick={() => descargarImagen(imgPaths.firma)} className="text-[10px] text-gray-500 hover:underline">Descargar</button>}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Vista previa en vivo de la firma del documento ── */}
              <div className="border-t border-gray-100 pt-3">
                <label className="block text-[10px] font-semibold text-gray-500 mb-2 uppercase">Vista previa de la firma</label>
                <div className="border border-gray-200 rounded-xl p-3 inline-block min-w-[200px]">
                  <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mb-1">Por Puerto NOA SpA</div>
                  {previewFirma
                    ? <img src={previewFirma} alt="Firma" style={{ display: 'block', maxHeight: '40px', maxWidth: '160px', objectFit: 'contain', marginBottom: '2px' }}/>
                    : <div style={{ height: '22px' }}/>}
                  <div className="border-b border-gray-300 mb-1"/>
                  <div className="text-[11px] font-bold text-gray-900">{formU.nombre || '—'}</div>
                  {formU.cargo && <div className="text-[10px] text-gray-500">{formU.cargo}</div>}
                  {formU.email && <div className="text-[10px] text-[#1168F8]">{formU.email}</div>}
                  {formU.telefono && <div className="text-[10px] text-gray-500">{formU.telefono}</div>}
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
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-[11px] text-blue-700">
                El usuario ingresa con el botón <b>Continuar con Google</b> usando esta cuenta de correo. El sistema no maneja contraseñas.
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-between">
              <button onClick={() => setModalUsuario(null)} className="px-4 py-2 border border-gray-200 rounded-xl text-xs hover:bg-gray-50">Cancelar</button>
              <button onClick={guardarUsuario} disabled={saving}
                className="px-5 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold disabled:opacity-50">
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
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
                      {['Fecha y hora', 'Método', 'IP', 'Ciudad', 'Región', 'País', 'Zona', 'Navegador'].map(h => (
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
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600">
                            <svg width="11" height="11" viewBox="0 0 18 18"><path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/><path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2.01c-.72.48-1.63.76-2.7.76-2.08 0-3.84-1.4-4.47-3.29H1.87v2.07A8 8 0 0 0 8.98 17z"/><path fill="#FBBC05" d="M4.51 10.52A4.8 4.8 0 0 1 4.26 9c0-.53.09-1.04.25-1.52V5.41H1.87A8 8 0 0 0 .98 9c0 1.29.31 2.51.89 3.59l2.64-2.07z"/><path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 8.98 1 8 8 0 0 0 1.87 5.41l2.64 2.07c.63-1.89 2.39-3.3 4.47-3.3z"/></svg>
                            {log.metodo && log.metodo !== 'google' ? log.metodo : 'Google'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-gray-500">{log.ip || '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{log.ciudad || '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{log.region || '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{log.pais || '—'}</td>
                        <td className="px-4 py-3">
                          {log.fuera_de_zona
                            ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-600 border border-red-200">⚠ Fuera de zona</span>
                            : <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-50 text-green-600 border border-green-200">En zona</span>}
                        </td>
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
