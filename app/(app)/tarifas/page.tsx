'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { Tarifa, TarifaInsert } from '@/types'
import { fmt } from '@/lib/utils'

interface AuditEntry {
  id: string
  campo: string
  valor_anterior: string
  valor_nuevo: string
  usuario_nombre: string
  created_at: string
}

export default function TarifasPage() {
  const [tarifas, setTarifas] = useState<Tarifa[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<{ id: string; nombre: string } | null>(null)
  const [histModal, setHistModal] = useState<{ id: string; ruta: string } | null>(null)
  const [histData, setHistData] = useState<AuditEntry[]>([])
  const supabase = createClient()

  useEffect(() => {
    loadUser()
    loadData()
  }, [])

  async function loadUser() {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return
    const { data: u } = await supabase.from('usuarios').select('id, nombre').eq('auth_id', auth.user.id).single()
    if (u) setCurrentUser(u as any)
  }

  async function loadData() {
    const { data } = await supabase.from('tarifas').select('*').order('tipo').order('ruta')
    if (data) setTarifas(data as Tarifa[])
    setLoading(false)
  }

  async function addTarifa(tipo: 'maritima' | 'terrestre' | 'puerto') {
    if (!currentUser) return
    await (supabase.from('tarifas') as any).insert({
      tipo, ruta: 'Nueva tarifa', valor: 0,
      modificado_por: currentUser.nombre,
      modificado_por_id: currentUser.id,
    } as TarifaInsert)
    loadData()
  }

  async function updateTarifa(tarifa: Tarifa, field: string, value: string | number) {
    if (!currentUser) return
    const oldVal = (tarifa as any)[field]
    if (String(oldVal) === String(value)) return

    await (supabase.from('tarifas') as any).update({
      [field]: value,
      modificado_por: currentUser.nombre,
      modificado_por_id: currentUser.id,
      updated_at: new Date().toISOString(),
    }).eq('id', tarifa.id)

    // Audit log
    await (supabase.from('audit_log') as any).insert({
      tabla: 'tarifas',
      registro_id: tarifa.id,
      campo: field,
      valor_anterior: String(oldVal),
      valor_nuevo: String(value),
      usuario_id: currentUser.id,
      usuario_nombre: currentUser.nombre,
    })

    loadData()
  }

  async function deleteTarifa(id: string) {
    if (!confirm('¿Eliminar esta tarifa?')) return
    await supabase.from('tarifas').delete().eq('id', id)
    loadData()
  }

  async function loadHistory(id: string) {
    const { data } = await supabase
      .from('audit_log')
      .select('*')
      .eq('tabla', 'tarifas')
      .eq('registro_id', id)
      .order('created_at', { ascending: false })
    if (data) setHistData(data as AuditEntry[])
  }

  const maritimas = tarifas.filter(t => t.tipo === 'maritima')
  const terrestres = tarifas.filter(t => t.tipo === 'terrestre')
  const puerto = tarifas.filter(t => t.tipo === 'puerto')

  const sections = [
    {
      label: 'Fletes marítimos (USD/contenedor)',
      tipo: 'maritima' as const,
      data: maritimas,
      cols: ['Ruta', 'Tipo cont.', 'USD', 'Naviera', 'Última modif.', ''],
    },
    {
      label: 'Fletes terrestres Chile → NOA (USD/camión)',
      tipo: 'terrestre' as const,
      data: terrestres,
      cols: ['Ruta', 'Tipo', 'USD', 'Observaciones', 'Última modif.', ''],
    },
    {
      label: 'Gastos puerto Chile (USD/contenedor)',
      tipo: 'puerto' as const,
      data: puerto,
      cols: ['Descripción', 'IVA Chile', 'USD', 'Observaciones', 'Última modif.', ''],
    },
  ]

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-gray-900">Tarifas base</h1>
        <p className="text-xs text-gray-400 mt-0.5">Módulo 1 — Valores de referencia para el cotizador</p>
      </div>

      {sections.map(section => (
        <div key={section.tipo} className="bg-white border border-gray-100 rounded-xl overflow-hidden mb-4">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <span className="font-medium text-sm text-gray-900">{section.label}</span>
            <button
              onClick={() => addTarifa(section.tipo)}
              className="flex items-center gap-1 text-xs text-[#1168F8] hover:underline"
            >
              + Agregar
            </button>
          </div>
          {loading ? (
            <div className="p-4 text-center text-gray-400 text-xs">Cargando...</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {section.cols.map(h => (
                    <th key={h} className="text-left px-4 py-2 text-[10px] font-medium text-gray-400 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {section.data.map(t => (
                  <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50">
                    {/* Ruta / Descripción */}
                    <td className="px-4 py-2.5">
                      <input
                        defaultValue={t.ruta}
                        onBlur={e => updateTarifa(t, 'ruta', e.target.value)}
                        className="w-full px-2 py-1 border border-transparent rounded hover:border-gray-200 focus:border-[#1168F8] focus:outline-none text-xs"
                      />
                    </td>

                    {/* Tipo / IVA Chile */}
                    <td className="px-4 py-2.5">
                      {section.tipo === 'puerto' ? (
                        <select
                          defaultValue={t.iva_chile || 'exento'}
                          onBlur={e => updateTarifa(t, 'iva_chile', e.target.value)}
                          className="px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:border-[#1168F8] bg-white"
                        >
                          <option value="exento">Exento</option>
                          <option value="gravado">Gravado 19%</option>
                        </select>
                      ) : (
                        <input
                          defaultValue={t.tipo_contenedor}
                          onBlur={e => updateTarifa(t, 'tipo_contenedor', e.target.value)}
                          className="w-full px-2 py-1 border border-transparent rounded hover:border-gray-200 focus:border-[#1168F8] focus:outline-none text-xs"
                          placeholder="ej. 40HC"
                        />
                      )}
                    </td>

                    {/* Valor USD */}
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-gray-400">USD</span>
                        <input
                          type="text" inputMode="decimal" onFocus={(e)=>e.target.select()}
                          defaultValue={t.valor}
                          onBlur={e => updateTarifa(t, 'valor', parseFloat(e.target.value) || 0)}
                          className="w-24 px-2 py-1 border border-transparent rounded hover:border-gray-200 focus:border-[#1168F8] focus:outline-none text-xs text-right font-mono"
                        />
                      </div>
                    </td>

                    {/* Naviera / Observaciones */}
                    <td className="px-4 py-2.5">
                      <input
                        defaultValue={section.tipo === 'puerto' ? t.obs : t.naviera}
                        onBlur={e => updateTarifa(t, section.tipo === 'puerto' ? 'obs' : 'naviera', e.target.value)}
                        className="w-full px-2 py-1 border border-transparent rounded hover:border-gray-200 focus:border-[#1168F8] focus:outline-none text-xs text-gray-500"
                        placeholder="Opcional"
                      />
                    </td>

                    {/* Última modificación */}
                    <td className="px-4 py-2.5">
                      <div className="text-[10px] text-gray-400">
                        {(t as any).modificado_por ? (
                          <>
                            <span className="font-medium text-gray-600">{(t as any).modificado_por}</span>
                            <span className="mx-1">·</span>
                            <span>{(t as any).updated_at ? new Date((t as any).updated_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                          </>
                        ) : (
                          <span className="text-gray-300">Sin modificaciones</span>
                        )}
                      </div>
                    </td>

                    {/* Acciones */}
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1.5">
                        <button
                          onClick={async () => {
                            setHistModal({ id: t.id, ruta: t.ruta })
                            await loadHistory(t.id)
                          }}
                          className="p-1.5 border border-gray-200 rounded-md hover:bg-gray-100 text-gray-400 transition-colors text-[10px]"
                          title="Ver historial"
                        >
                          📋
                        </button>
                        <button
                          onClick={() => deleteTarifa(t.id)}
                          className="p-1.5 border border-gray-200 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors text-[10px]"
                          title="Eliminar"
                        >
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!section.data.length && (
                  <tr>
                    <td colSpan={6} className="px-4 py-4 text-center text-gray-400">
                      Sin tarifas.{' '}
                      <button onClick={() => addTarifa(section.tipo)} className="text-[#1168F8] hover:underline">
                        Agregar una →
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      ))}

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-700">
        💡 Los valores se guardan automáticamente al hacer click fuera del campo. Cada cambio queda registrado con fecha y usuario.
      </div>

      {/* Modal historial */}
      {histModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <span className="font-medium text-sm text-gray-900">Historial de cambios</span>
                <span className="text-xs text-gray-400 ml-2">{histModal.ruta}</span>
              </div>
              <button
                onClick={() => { setHistModal(null); setHistData([]) }}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {histData.length ? (
                <div className="divide-y divide-gray-50">
                  {histData.map(h => (
                    <div key={h.id} className="px-5 py-3 text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-gray-800">{h.usuario_nombre}</span>
                        <span className="text-gray-400 text-[10px]">
                          {new Date(h.created_at).toLocaleString('es-AR')}
                        </span>
                      </div>
                      <div className="text-gray-500">
                        Campo <span className="font-mono text-gray-700">{h.campo}</span>:{' '}
                        <span className="line-through text-red-400">{h.valor_anterior}</span>
                        <span className="mx-1 text-gray-300">→</span>
                        <span className="text-green-700 font-medium">{h.valor_nuevo}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-5 py-8 text-center text-gray-400 text-sm">
                  Sin historial de cambios.
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => { setHistModal(null); setHistData([]) }}
                className="px-4 py-2 border border-gray-200 rounded-lg text-xs hover:bg-gray-50"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
