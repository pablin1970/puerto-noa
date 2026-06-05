'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { Usuario, Rol } from '@/types'
import { ROL_L } from '@/lib/utils'

const ROL_CLS: Record<string, string> = {
  admin: 'bg-indigo-50 text-indigo-700',
  ejecutivo: 'bg-green-50 text-green-700',
  operaciones: 'bg-amber-50 text-amber-700',
  gerencia: 'bg-blue-50 text-blue-700',
}

const ROL_DESC: Record<string, string> = {
  admin: 'Acceso total. Gestión de usuarios y cotizaciones.',
  ejecutivo: 'Crear y editar cotizaciones. Ver todo el sistema.',
  operaciones: 'Ver operaciones aceptadas. Cargar costos reales.',
  gerencia: 'Solo lectura. Ver todas las cotizaciones y reportes.',
}

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ nombre: '', email: '', rol: 'ejecutivo' as Rol, iniciales: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data } = await supabase.from('usuarios').select('*').order('created_at')
    if (data) setUsuarios(data as Usuario[])
    setLoading(false)
  }

  async function agregarUsuario() {
    if (!form.nombre || !form.email) { setError('Completá nombre y email.'); return }
    setSaving(true); setError('')
    const iniciales = form.iniciales || form.nombre.split(' ').map(x => x[0]).join('').slice(0, 3).toUpperCase()

    // Crear usuario en Supabase Auth
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email: form.email,
      password: 'PuertoNOA2026!', // Temporal, el usuario debe cambiarla
      email_confirm: true,
    })

    const { error: dbErr } = await supabase.from('usuarios').insert({
      auth_id: authData?.user?.id || null,
      nombre: form.nombre,
      email: form.email,
      rol: form.rol,
      iniciales,
      activo: true,
    })

    if (dbErr) setError('Error al guardar el usuario.')
    else { setForm({ nombre: '', email: '', rol: 'ejecutivo', iniciales: '' }); loadData() }
    setSaving(false)
  }

  async function toggleActivo(u: Usuario) {
    await supabase.from('usuarios').update({ activo: !u.activo }).eq('id', u.id)
    loadData()
  }

  async function cambiarRol(u: Usuario, rol: Rol) {
    await supabase.from('usuarios').update({ rol }).eq('id', u.id)
    loadData()
  }

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-gray-900">Usuarios del sistema</h1>
        <p className="text-xs text-gray-400 mt-0.5">Módulo 2 — Gestión de accesos y roles</p>
      </div>

      <div className="grid grid-cols-2 gap-5 mb-6">
        {/* Agregar usuario */}
        <div className="bg-white border border-gray-100 rounded-xl p-5">
          <h2 className="font-medium text-sm text-gray-900 mb-4">Agregar usuario</h2>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-medium text-gray-500 mb-1">Nombre completo</label>
                <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1D9E75]" placeholder="Nombre Apellido" />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-gray-500 mb-1">Email</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1D9E75]" placeholder="correo@empresa.com" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-medium text-gray-500 mb-1">Rol</label>
                <select value={form.rol} onChange={e => setForm(f => ({ ...f, rol: e.target.value as Rol }))} className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1D9E75] bg-white">
                  {Object.entries(ROL_L).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-gray-500 mb-1">Iniciales</label>
                <input value={form.iniciales} onChange={e => setForm(f => ({ ...f, iniciales: e.target.value.toUpperCase() }))} maxLength={3} className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1D9E75]" placeholder="PVN" />
              </div>
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              La contraseña inicial es <strong>PuertoNOA2026!</strong> — el usuario debe cambiarla al primer ingreso.
            </div>
            <button onClick={agregarUsuario} disabled={saving} className="w-full bg-[#1D9E75] text-white py-2 rounded-lg text-xs font-medium hover:bg-[#0F6E56] transition-colors disabled:opacity-60">
              {saving ? 'Guardando...' : '+ Agregar usuario'}
            </button>
          </div>
        </div>

        {/* Roles */}
        <div className="bg-white border border-gray-100 rounded-xl p-5">
          <h2 className="font-medium text-sm text-gray-900 mb-4">Roles y permisos</h2>
          <div className="space-y-3">
            {Object.entries(ROL_L).map(([k, v]) => (
              <div key={k} className="flex items-start gap-3">
                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium mt-0.5 flex-shrink-0 ${ROL_CLS[k]}`}>{v}</span>
                <span className="text-xs text-gray-500">{ROL_DESC[k]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Lista usuarios */}
      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100">
          <span className="font-medium text-sm text-gray-900">Usuarios registrados ({usuarios.length})</span>
        </div>
        {loading ? (
          <div className="p-6 text-center text-gray-400 text-sm">Cargando...</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {usuarios.map(u => (
              <div key={u.id} className="flex items-center gap-4 px-5 py-3.5">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${ROL_CLS[u.rol]}`}>
                  {u.iniciales}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-sm text-gray-900">{u.nombre}</div>
                  <div className="text-xs text-gray-400">{u.email}</div>
                </div>
                <select
                  value={u.rol}
                  onChange={e => cambiarRol(u, e.target.value as Rol)}
                  className="px-2.5 py-1 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:border-[#1D9E75]"
                >
                  {Object.entries(ROL_L).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${u.activo ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {u.activo ? 'Activo' : 'Inactivo'}
                </span>
                <button
                  onClick={() => toggleActivo(u)}
                  className="p-1.5 border border-gray-200 rounded-md hover:bg-gray-100 text-gray-500 text-xs transition-colors"
                  title={u.activo ? 'Desactivar' : 'Activar'}
                >
                  {u.activo ? '⏸' : '▶'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
