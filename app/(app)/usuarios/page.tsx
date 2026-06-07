'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import type { Usuario, Rol } from '@/types'
import { ROL_L } from '@/lib/utils'

const ROL_CLS: Record<string, string> = {
  admin: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
  ejecutivo: 'bg-green-50 text-green-700 border border-green-200',
  operaciones: 'bg-amber-50 text-amber-700 border border-amber-200',
  gerencia: 'bg-blue-50 text-[#1168F8] border border-blue-200',
}

const ROL_ICON: Record<string, string> = {
  admin: '👑', ejecutivo: '💼', operaciones: '🚢', gerencia: '📊',
}

const ROL_DESC: Record<string, string> = {
  admin: 'Acceso total al sistema. Gestión de usuarios, tarifas y tributos.',
  ejecutivo: 'Crear y gestionar cotizaciones. Ver todo el sistema.',
  operaciones: 'Ver operaciones aceptadas. Cargar costos y documentos.',
  gerencia: 'Solo lectura. Ver cotizaciones y reportes.',
}

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ nombre: '', email: '', rol: 'ejecutivo' as Rol, iniciales: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data } = await supabase.from('usuarios').select('*').order('created_at')
    if (data) setUsuarios(data as Usuario[])
    setLoading(false)
  }

  async function agregarUsuario() {
    if (!form.nombre || !form.email) { setError('Completá nombre y email.'); return }
    setSaving(true); setError(''); setSuccess('')
    const iniciales = form.iniciales || form.nombre.split(' ').map((x: string) => x[0]).join('').slice(0, 3).toUpperCase()
    const { data: authData } = await supabase.auth.admin.createUser({
      email: form.email, password: 'PuertoNOA2026!', email_confirm: true,
    })
    const { error: dbErr } = await (supabase.from('usuarios') as any).insert({
      auth_id: authData?.user?.id || null, nombre: form.nombre, email: form.email,
      rol: form.rol, iniciales, activo: true,
    })
    if (dbErr) setError('Error al guardar el usuario.')
    else { setSuccess(`Usuario ${form.nombre} creado correctamente.`); setForm({ nombre: '', email: '', rol: 'ejecutivo', iniciales: '' }); loadData() }
    setSaving(false)
  }

  async function toggleActivo(u: Usuario) {
    await (supabase.from('usuarios') as any).update({ activo: !u.activo }).eq('id', u.id)
    loadData()
  }

  async function cambiarRol(u: Usuario, rol: Rol) {
    await (supabase.from('usuarios') as any).update({ rol }).eq('id', u.id)
    loadData()
  }

  const activos = usuarios.filter(u => u.activo).length

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Usuarios del sistema</h1>
          <p className="text-xs text-gray-400 mt-0.5">Gestión de accesos y roles · {activos} usuario(s) activo(s)</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5 mb-5">
        {/* Formulario */}
        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
          <h2 className="font-bold text-sm text-gray-900 mb-4 flex items-center gap-2">
            <span className="w-6 h-6 bg-[#1168F8] rounded-lg flex items-center justify-center text-white text-[10px]">+</span>
            Agregar usuario
          </h2>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Nombre completo</label>
                <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white"
                  placeholder="Nombre Apellido" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Email</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white"
                  placeholder="correo@empresa.com" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Rol</label>
                <select value={form.rol} onChange={e => setForm(f => ({ ...f, rol: e.target.value as Rol }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white">
                  {Object.entries(ROL_L).map(([k, v]) => <option key={k} value={k}>{ROL_ICON[k]} {v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Iniciales (máx. 3)</label>
                <input value={form.iniciales} onChange={e => setForm(f => ({ ...f, iniciales: e.target.value.toUpperCase() }))}
                  maxLength={3} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] font-mono tracking-widest"
                  placeholder="PVN" />
              </div>
            </div>
            {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">❌ {error}</div>}
            {success && <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2">✅ {success}</div>}
            <div className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
              🔐 Contraseña inicial: <strong>PuertoNOA2026!</strong> — el usuario debe cambiarla al primer ingreso.
            </div>
            <button onClick={agregarUsuario} disabled={saving}
              className="w-full bg-[#1168F8] text-white py-2.5 rounded-xl text-xs font-bold hover:bg-[#0a4fc4] transition-colors disabled:opacity-60 shadow-sm">
              {saving ? 'Guardando...' : '+ Crear usuario'}
            </button>
          </div>
        </div>

        {/* Roles */}
        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
          <h2 className="font-bold text-sm text-gray-900 mb-4 flex items-center gap-2">
            <span className="w-6 h-6 bg-[#EBF2FF] rounded-lg flex items-center justify-center text-[#052698] text-[10px]">🔑</span>
            Roles y permisos
          </h2>
          <div className="space-y-3">
            {Object.entries(ROL_L).map(([k, v]) => (
              <div key={k} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold flex-shrink-0 mt-0.5 ${ROL_CLS[k]}`}>
                  {ROL_ICON[k]} {v}
                </span>
                <span className="text-xs text-gray-500 leading-relaxed">{ROL_DESC[k]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Lista usuarios */}
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <span className="font-bold text-sm text-gray-900">Usuarios registrados</span>
          <span className="text-xs text-gray-400">{usuarios.length} en total · {activos} activos</span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Cargando...</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {usuarios.map(u => (
              <div key={u.id} className={`flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors ${!u.activo ? 'opacity-50' : ''}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0 ${ROL_CLS[u.rol]}`}>
                  {u.iniciales || u.nombre?.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-gray-900 flex items-center gap-2">
                    {u.nombre}
                    {!u.activo && <span className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">Inactivo</span>}
                  </div>
                  <div className="text-xs text-gray-400">{u.email}</div>
                </div>
                <select value={u.rol} onChange={e => cambiarRol(u, e.target.value as Rol)}
                  className="px-2.5 py-1.5 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:border-[#1168F8]">
                  {Object.entries(ROL_L).map(([k, v]) => <option key={k} value={k}>{ROL_ICON[k]} {v}</option>)}
                </select>
                <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-semibold ${u.activo ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}>
                  {u.activo ? '● Activo' : '○ Inactivo'}
                </span>
                <button onClick={() => toggleActivo(u)}
                  className={`px-3 py-1.5 border rounded-xl text-[10px] font-semibold transition-colors ${u.activo ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-green-200 text-green-700 hover:bg-green-50'}`}>
                  {u.activo ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
