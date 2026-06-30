'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { fmt, nowStr } from '@/lib/utils'
import { cargarPermisos, puede } from '@/lib/permisos'

type Regimen = 'A' | 'B' | 'C' | 'D'
type TipoTributo = 'pct' | 'fijo'

interface TributoConfig {
  id: string
  regimen: Regimen
  codigo: string
  concepto: string
  tipo: TipoTributo
  valor: number
  aplica: boolean
  orden: number
  modificado_por: string
  updated_at: string
}

interface AuditEntry {
  id: string
  campo: string
  valor_anterior: string
  valor_nuevo: string
  usuario_nombre: string
  created_at: string
}

const REGIMENES: { key: Regimen; label: string; sub: string }[] = [
  { key: 'A', label: 'Régimen A', sub: 'Persona jurídica · Comercialización' },
  { key: 'B', label: 'Régimen B', sub: 'Persona jurídica · Uso propio' },
  { key: 'C', label: 'Régimen C', sub: 'Persona física · Comercialización' },
  { key: 'D', label: 'Régimen D', sub: 'Persona física · Uso propio' },
]

export default function TributosConfig() {
  const [regimen, setRegimen] = useState<Regimen>('A')
  const [rows, setRows] = useState<TributoConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [histModal, setHistModal] = useState<{ id: string; concepto: string } | null>(null)
  const [histData, setHistData] = useState<AuditEntry[]>([])
  const [currentUser, setCurrentUser] = useState<{ id: string; nombre: string } | null>(null)
  const supabase = createClient()

  const [permisos, setPermisos] = useState<Record<string, string[]>>({})
  const [permListos, setPermListos] = useState(false)
  useEffect(() => { cargarPermisos().then(p => { setPermisos(p); setPermListos(true) }) }, [])

  useEffect(() => {
    loadUser()
  }, [])

  useEffect(() => {
    loadData()
  }, [regimen])

  async function loadUser() {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return
    const { data: u } = await supabase.from('usuarios').select('id, nombre').eq('auth_id', auth.user.id).single()
    if (u) setCurrentUser(u as any)
  }

  async function loadData() {
    setLoading(true)
    const { data } = await supabase
      .from('tributos_config')
      .select('*')
      .eq('regimen', regimen)
      .order('orden')
    if (data) setRows(data as TributoConfig[])
    setLoading(false)
  }

  async function saveField(row: TributoConfig, field: string, newVal: any) {
    if (!currentUser) return
    setSaving(row.id)
    const oldVal = (row as any)[field]

    await (supabase.from('tributos_config') as any).update({
      [field]: newVal,
      modificado_por: currentUser.nombre,
      modificado_por_id: currentUser.id,
      updated_at: new Date().toISOString(),
    }).eq('id', row.id)

    // Audit log
    await (supabase.from('audit_log') as any).insert({
      tabla: 'tributos_config',
      registro_id: row.id,
      campo: field,
      valor_anterior: String(oldVal),
      valor_nuevo: String(newVal),
      usuario_id: currentUser.id,
      usuario_nombre: currentUser.nombre,
    })

    setSaving(null)
    loadData()
  }

  async function addRow() {
    if (!currentUser) return
    const maxOrden = rows.length ? Math.max(...rows.map(r => r.orden)) + 1 : 1
    await (supabase.from('tributos_config') as any).insert({
      regimen,
      codigo: 'NUEVO',
      concepto: 'Nuevo tributo',
      tipo: 'pct',
      valor: 0,
      aplica: true,
      orden: maxOrden,
      modificado_por: currentUser.nombre,
      modificado_por_id: currentUser.id,
    })
    loadData()
  }

  async function deleteRow(id: string) {
    if (!confirm('¿Eliminar este tributo?')) return
    await supabase.from('tributos_config').delete().eq('id', id)
    loadData()
  }

  async function loadHistory(id: string) {
    const { data } = await supabase
      .from('audit_log')
      .select('*')
      .eq('tabla', 'tributos_config')
      .eq('registro_id', id)
      .order('created_at', { ascending: false })
    if (data) setHistData(data as AuditEntry[])
  }

  const totalAplicados = rows.filter(r => r.aplica).length

  if (permListos && !puede(permisos, 'tributos', 'ver')) {
    return (
      <div className="py-12 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-3">🔒</div>
          <h2 className="text-lg font-bold text-gray-700">Sin acceso</h2>
          <p className="text-sm text-gray-400 mt-1">No tenés permiso para ver esta sección. Si creés que es un error, contactá al administrador.</p>
        </div>
      </div>
    )
  }

  const pCrear = puede(permisos, 'tributos', 'crear')
  const pEditar = puede(permisos, 'tributos', 'editar')
  const pEliminar = puede(permisos, 'tributos', 'eliminar')

  return (
    <div className="space-y-4">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Tributos ARCA</h1>
          <p className="text-xs text-gray-400 mt-0.5">Solo Admin — Configuración de tributos por régimen de importación</p>
        </div>
        <span className="px-3 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl text-[10px] font-bold">🔐 Admin</span>
      </div>

      {/* Tabs regímenes */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {REGIMENES.map(r => (
          <button
            key={r.key}
            onClick={() => setRegimen(r.key)}
            className={`px-4 py-2.5 rounded-xl text-xs font-semibold transition-all text-left shadow-sm ${
              regimen === r.key
                ? 'bg-[#1168F8] text-white shadow-md'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <div className="font-bold">{r.label}</div>
            <div className={`text-[10px] mt-0.5 ${regimen === r.key ? 'text-blue-100' : 'text-gray-400'}`}>{r.sub}</div>
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
        {/* Header tabla */}
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <span className="font-medium text-sm text-gray-900">
              {REGIMENES.find(r => r.key === regimen)?.label} — {REGIMENES.find(r => r.key === regimen)?.sub}
            </span>
            <span className="ml-3 text-xs text-gray-400">{totalAplicados} tributos activos de {rows.length}</span>
          </div>
          {pCrear && (
          <button
            onClick={addRow}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1168F8] text-white rounded-lg text-xs font-medium hover:bg-[#0a4fc4] transition-colors"
          >
            + Agregar tributo
          </button>
          )}
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Cargando...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-2.5 text-[10px] text-gray-400 font-medium uppercase tracking-wide w-8">Activo</th>
                  <th className="text-left px-4 py-2.5 text-[10px] text-gray-400 font-medium uppercase tracking-wide w-20">Código</th>
                  <th className="text-left px-4 py-2.5 text-[10px] text-gray-400 font-medium uppercase tracking-wide">Concepto</th>
                  <th className="text-left px-4 py-2.5 text-[10px] text-gray-400 font-medium uppercase tracking-wide w-28">Tipo</th>
                  <th className="text-right px-4 py-2.5 text-[10px] text-gray-400 font-medium uppercase tracking-wide w-32">% / Importe</th>
                  <th className="text-left px-4 py-2.5 text-[10px] text-gray-400 font-medium uppercase tracking-wide">Última modif.</th>
                  <th className="px-4 py-2.5 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr
                    key={row.id}
                    className={`border-b border-gray-50 transition-colors ${!row.aplica ? 'opacity-40' : 'hover:bg-gray-50'}`}
                  >
                    {/* Toggle aplica */}
                    <td className="px-4 py-3">
                      <button
                        onClick={() => { if (pEditar) saveField(row, 'aplica', !row.aplica) }}
                        disabled={!pEditar}
                        className={`w-8 h-4 rounded-full transition-colors relative ${row.aplica ? 'bg-[#1168F8]' : 'bg-gray-200'} ${!pEditar ? 'opacity-60 cursor-not-allowed' : ''}`}
                      >
                        <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all ${row.aplica ? 'left-4.5' : 'left-0.5'}`} style={{ left: row.aplica ? '18px' : '2px' }} />
                      </button>
                    </td>

                    {/* Código */}
                    <td className="px-4 py-3">
                      <input
                        defaultValue={row.codigo}
                        readOnly={!pEditar}
                        onBlur={e => { if (pEditar && e.target.value !== row.codigo) saveField(row, 'codigo', e.target.value) }}
                        className="w-16 px-2 py-1 border border-transparent rounded hover:border-gray-200 focus:border-[#1168F8] focus:outline-none text-xs font-mono font-medium text-gray-700"
                      />
                    </td>

                    {/* Concepto */}
                    <td className="px-4 py-3">
                      <input
                        defaultValue={row.concepto}
                        readOnly={!pEditar}
                        onBlur={e => { if (pEditar && e.target.value !== row.concepto) saveField(row, 'concepto', e.target.value) }}
                        className="w-full px-2 py-1 border border-transparent rounded hover:border-gray-200 focus:border-[#1168F8] focus:outline-none text-xs text-gray-800"
                      />
                    </td>

                    {/* Tipo */}
                    <td className="px-4 py-3">
                      <select
                        value={row.tipo}
                        disabled={!pEditar}
                        onChange={e => { if (pEditar) saveField(row, 'tipo', e.target.value) }}
                        className={`px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:border-[#1168F8] bg-white ${!pEditar ? 'opacity-60 cursor-not-allowed' : ''}`}
                      >
                        <option value="pct">Porcentaje (%)</option>
                        <option value="fijo">Importe fijo (ARS)</option>
                      </select>
                    </td>

                    {/* Valor */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <input
                          type="text" inputMode="decimal" onFocus={(e)=>e.target.select()}
                          defaultValue={row.valor}
                          readOnly={!pEditar}
                          step={row.tipo === 'pct' ? 0.5 : 1}
                          onBlur={e => {
                            const v = parseFloat(e.target.value)
                            if (pEditar && v !== row.valor) saveField(row, 'valor', v)
                          }}
                          className="w-20 px-2 py-1 border border-transparent rounded hover:border-gray-200 focus:border-[#1168F8] focus:outline-none text-xs text-right font-mono"
                        />
                        <span className="text-gray-400 text-[10px] w-8">{row.tipo === 'pct' ? '%' : 'ARS'}</span>
                      </div>
                    </td>

                    {/* Última modificación */}
                    <td className="px-4 py-3">
                      <div className="text-[10px] text-gray-400">
                        {row.modificado_por && (
                          <>
                            <span className="font-medium text-gray-600">{row.modificado_por}</span>
                            <span className="mx-1">·</span>
                          </>
                        )}
                        {row.updated_at ? new Date(row.updated_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </div>
                    </td>

                    {/* Acciones */}
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5 justify-end">
                        <button
                          onClick={async () => {
                            setHistModal({ id: row.id, concepto: row.concepto })
                            await loadHistory(row.id)
                          }}
                          className="p-1.5 border border-gray-200 rounded-md hover:bg-gray-100 text-gray-400 transition-colors text-[10px]"
                          title="Ver historial"
                        >
                          📋
                        </button>
                        {pEliminar && (
                        <button
                          onClick={() => deleteRow(row.id)}
                          className="p-1.5 border border-gray-200 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors text-[10px]"
                          title="Eliminar"
                        >
                          🗑
                        </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}

                {!rows.length && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                      Sin tributos configurados para este régimen.
                      {pCrear && <button onClick={addRow} className="ml-2 text-[#1168F8] hover:underline">Agregar uno →</button>}
                    </td>
                  </tr>
                )}
              </tbody>

              {/* Totales */}
              {rows.filter(r => r.aplica && r.tipo === 'pct').length > 0 && (
                <tfoot>
                  <tr className="bg-[#EBF2FF] border-t-2 border-[#93B8FC]">
                    <td colSpan={4} className="px-4 py-2.5 text-xs font-semibold text-[#052698]">
                      Suma de porcentajes activos
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-[#052698]">
                      {fmt(rows.filter(r => r.aplica && r.tipo === 'pct').reduce((s, r) => s + r.valor, 0), 1)}%
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {/* Nota */}
      <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
        💡 Los cambios se guardan automáticamente al hacer click fuera del campo. El código <strong>010 (Derechos de importación)</strong> usa el porcentaje configurado aquí como valor default — se puede ajustar en cada cotización según el NCM específico.
      </div>

      {/* Modal historial */}
      {histModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <span className="font-medium text-sm text-gray-900">Historial de cambios</span>
                <span className="text-xs text-gray-400 ml-2">{histModal.concepto}</span>
              </div>
              <button onClick={() => { setHistModal(null); setHistData([]) }} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {histData.length ? (
                <div className="divide-y divide-gray-50">
                  {histData.map(h => (
                    <div key={h.id} className="px-5 py-3 text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-gray-800">{h.usuario_nombre}</span>
                        <span className="text-gray-400 text-[10px]">{new Date(h.created_at).toLocaleString('es-AR')}</span>
                      </div>
                      <div className="text-gray-500">
                        Campo <span className="font-mono text-gray-700">{h.campo}</span>:
                        <span className="ml-1 line-through text-red-400">{h.valor_anterior}</span>
                        <span className="mx-1 text-gray-300">→</span>
                        <span className="text-green-700 font-medium">{h.valor_nuevo}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-5 py-8 text-center text-gray-400 text-sm">Sin historial de cambios.</div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
              <button onClick={() => { setHistModal(null); setHistData([]) }} className="px-4 py-2 border border-gray-200 rounded-lg text-xs hover:bg-gray-50">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
