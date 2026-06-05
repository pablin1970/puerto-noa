'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { Tarifa, TarifaInsert } from '@/types'
import { fmt } from '@/lib/utils'

export default function TarifasPage() {
  const [tarifas, setTarifas] = useState<Tarifa[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data } = await supabase.from('tarifas').select('*').order('tipo').order('ruta')
    if (data) setTarifas(data as Tarifa[])
    setLoading(false)
  }

  async function addTarifa(tipo: 'maritima' | 'terrestre' | 'puerto') {
    await supabase.from('tarifas').insert({ tipo, ruta: 'Nueva tarifa', valor: 0 } as TarifaInsert)
    loadData()
  }

  async function updateTarifa(id: string, field: string, value: string | number) {
    await supabase.from('tarifas').update({ [field]: value }).eq('id', id)
  }

  async function deleteTarifa(id: string) {
    if (!confirm('¿Eliminar esta tarifa?')) return
    await supabase.from('tarifas').delete().eq('id', id)
    loadData()
  }

  const maritimas = tarifas.filter(t => t.tipo === 'maritima')
  const terrestres = tarifas.filter(t => t.tipo === 'terrestre')
  const puerto = tarifas.filter(t => t.tipo === 'puerto')

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-gray-900">Tarifas base</h1>
        <p className="text-xs text-gray-400 mt-0.5">Módulo 1 — Valores de referencia para el cotizador</p>
      </div>

      {[
        { label: 'Fletes marítimos (USD/contenedor)', tipo: 'maritima' as const, data: maritimas, cols: ['Ruta', 'Tipo cont.', 'USD', 'Naviera'] },
        { label: 'Fletes terrestres Chile → NOA (USD/camión)', tipo: 'terrestre' as const, data: terrestres, cols: ['Ruta', 'Tipo', 'USD', 'Observaciones'] },
        { label: 'Gastos puerto Chile (USD/contenedor)', tipo: 'puerto' as const, data: puerto, cols: ['Descripción', '', 'USD', 'IVA Chile'] },
      ].map(section => (
        <div key={section.tipo} className="bg-white border border-gray-100 rounded-xl overflow-hidden mb-4">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <span className="font-medium text-sm text-gray-900">{section.label}</span>
            <button onClick={() => addTarifa(section.tipo)} className="flex items-center gap-1 text-xs text-[#1D9E75] hover:underline">+ Agregar</button>
          </div>
          {loading ? (
            <div className="p-4 text-center text-gray-400 text-xs">Cargando...</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {section.cols.map(h => <th key={h} className="text-left px-4 py-2 text-[10px] font-medium text-gray-400 uppercase tracking-wide">{h}</th>)}
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {section.data.map(t => (
                  <tr key={t.id} className="border-b border-gray-50">
                    <td className="px-4 py-2.5">
                      <input defaultValue={t.ruta} onBlur={e => updateTarifa(t.id, 'ruta', e.target.value)} className="w-full px-2 py-1 border border-transparent rounded hover:border-gray-200 focus:border-[#1D9E75] focus:outline-none text-xs" />
                    </td>
                    <td className="px-4 py-2.5">
                      {section.tipo === 'puerto' ? (
                        <select defaultValue={t.iva_chile || 'exento'} onBlur={e => updateTarifa(t.id, 'iva_chile', e.target.value)} className="px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:border-[#1D9E75] bg-white">
                          <option value="exento">Exento</option>
                          <option value="gravado">Gravado 19%</option>
                        </select>
                      ) : (
                        <input defaultValue={t.tipo_contenedor} onBlur={e => updateTarifa(t.id, 'tipo_contenedor', e.target.value)} className="w-full px-2 py-1 border border-transparent rounded hover:border-gray-200 focus:border-[#1D9E75] focus:outline-none text-xs" />
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <input type="number" defaultValue={t.valor} onBlur={e => updateTarifa(t.id, 'valor', parseFloat(e.target.value) || 0)} className="w-28 px-2 py-1 border border-transparent rounded hover:border-gray-200 focus:border-[#1D9E75] focus:outline-none text-xs text-right font-mono" />
                    </td>
                    <td className="px-4 py-2.5">
                      <input defaultValue={section.tipo === 'puerto' ? t.obs : t.naviera} onBlur={e => updateTarifa(t.id, section.tipo === 'puerto' ? 'obs' : 'naviera', e.target.value)} className="w-full px-2 py-1 border border-transparent rounded hover:border-gray-200 focus:border-[#1D9E75] focus:outline-none text-xs" />
                    </td>
                    <td className="px-4 py-2.5">
                      <button onClick={() => deleteTarifa(t.id)} className="text-gray-400 hover:text-red-500 transition-colors">🗑</button>
                    </td>
                  </tr>
                ))}
                {!section.data.length && (
                  <tr><td colSpan={5} className="px-4 py-4 text-center text-gray-400">Sin tarifas. <button onClick={() => addTarifa(section.tipo)} className="text-[#1D9E75] hover:underline">Agregar una →</button></td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      ))}

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-700">
        💡 Los valores se guardan automáticamente al hacer click fuera del campo. Las tarifas se aplican como valores de referencia en el cotizador.
      </div>
    </div>
  )
}
