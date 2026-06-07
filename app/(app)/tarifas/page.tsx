'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { fmt } from '@/lib/utils'

interface TarifaRow {
  id: string
  tipo: string
  ruta: string
  tipo_contenedor: string
  valor: number
  naviera: string
  iva_chile: string
  obs: string
  activo: boolean
  tipo_calculo: string
  piso_usd: number
  techo_usd: number
  moneda: string
  modificado_por: string
  updated_at: string
  cotizacion_url?: string
  cotizacion_nombre?: string
  cotizacion_fecha?: string
  operacion_ref?: string
  subido_por?: string
  subido_at?: string
  cotizacion_ref_id?: string
}

interface AuditEntry {
  id: string
  campo: string
  valor_anterior: string
  valor_nuevo: string
  usuario_nombre: string
  created_at: string
}

export default function TarifasPage() {
  const [tarifas, setTarifas] = useState<TarifaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<{ id: string; nombre: string } | null>(null)
  const [histModal, setHistModal] = useState<{ id: string; ruta: string } | null>(null)
  const [histData, setHistData] = useState<AuditEntry[]>([])
  const [cotModal, setCotModal] = useState<{ tarifa: TarifaRow; sugerencia?: TarifaRow } | null>(null)
  const [cotFile, setCotFile] = useState<File | null>(null)
  const [cotFecha, setCotFecha] = useState('')
  const [cotOpRef, setCotOpRef] = useState('')
  const [previewModal, setPreviewModal] = useState<{ url: string; nombre: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const supabase = createClient()

  useEffect(() => { loadUser(); loadData() }, [])

  async function loadUser() {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return
    const { data: u } = await supabase.from('usuarios').select('id, nombre').eq('auth_id', auth.user.id).single()
    if (u) setCurrentUser(u as any)
  }

  async function loadData() {
    const { data } = await supabase.from('tarifas').select('*').order('tipo').order('ruta')
    if (data) setTarifas(data as TarifaRow[])
    setLoading(false)
  }

  async function uploadCotizacion(tarifaId: string, file: File, fecha: string, opRef: string) {
    if (!currentUser) return
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `tarifas/${tarifaId}.${ext}`
    await supabase.storage.from('comprobantes').upload(path, file, { upsert: true })
    const { data } = supabase.storage.from('comprobantes').getPublicUrl(path)
    if (data?.publicUrl) {
      await (supabase.from('tarifas') as any).update({
        cotizacion_url: data.publicUrl,
        cotizacion_nombre: file.name,
        cotizacion_fecha: fecha || null,
        operacion_ref: opRef || null,
        subido_por: currentUser.nombre,
        subido_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', tarifaId)
      // audit log
      await (supabase.from('audit_log') as any).insert({
        tabla: 'tarifas', registro_id: tarifaId, campo: 'cotizacion',
        valor_anterior: '', valor_nuevo: file.name,
        usuario_id: currentUser.id, usuario_nombre: currentUser.nombre,
      })
    }
    setUploading(false)
    setCotModal(null)
    setCotFile(null)
    setCotFecha('')
    setCotOpRef('')
    loadData()
  }

  function getSugerencia(t: TarifaRow): TarifaRow | undefined {
    // Find most recent cotizacion for same service (tipo + ruta + tipo_contenedor)
    return tarifas
      .filter(x => x.id !== t.id && x.tipo === t.tipo && x.cotizacion_url &&
        x.ruta.toLowerCase().includes(t.ruta.toLowerCase().split(' ')[0]) &&
        x.tipo_contenedor === t.tipo_contenedor)
      .sort((a, b) => new Date(b.subido_at || 0).getTime() - new Date(a.subido_at || 0).getTime())[0]
  }

  async function addTarifa(tipo: string, tipoCalculo = 'fijo_usd') {
    if (!currentUser) return
    await (supabase.from('tarifas') as any).insert({
      tipo, ruta: 'Nueva tarifa', valor: 0,
      tipo_calculo: tipoCalculo, piso_usd: 0, techo_usd: 0, moneda: 'USD',
      modificado_por: currentUser.nombre, modificado_por_id: currentUser.id,
    })
    loadData()
  }

  async function updateTarifa(tarifa: TarifaRow, field: string, value: any) {
    if (!currentUser) return
    const oldVal = (tarifa as any)[field]
    if (String(oldVal) === String(value)) return
    await (supabase.from('tarifas') as any).update({
      [field]: value,
      modificado_por: currentUser.nombre,
      modificado_por_id: currentUser.id,
      updated_at: new Date().toISOString(),
    }).eq('id', tarifa.id)
    await (supabase.from('audit_log') as any).insert({
      tabla: 'tarifas', registro_id: tarifa.id, campo: field,
      valor_anterior: String(oldVal), valor_nuevo: String(value),
      usuario_id: currentUser.id, usuario_nombre: currentUser.nombre,
    })
    loadData()
  }

  async function deleteTarifa(id: string) {
    if (!confirm('¿Eliminar esta tarifa?')) return
    await supabase.from('tarifas').delete().eq('id', id)
    loadData()
  }

  async function loadHistory(id: string) {
    const { data } = await supabase.from('audit_log').select('*')
      .eq('tabla', 'tarifas').eq('registro_id', id).order('created_at', { ascending: false })
    if (data) setHistData(data as AuditEntry[])
  }

  const maritimas = tarifas.filter(t => t.tipo === 'maritima')
  const terrestres = tarifas.filter(t => t.tipo === 'terrestre')
  const puerto = tarifas.filter(t => t.tipo === 'puerto')
  const argentina = tarifas.filter(t => t.tipo === 'argentina')

  const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

  function AuditCell({ t }: { t: TarifaRow }) {
    return (
      <div className="text-[10px] text-gray-400">
        {t.modificado_por ? (
          <><span className="font-medium text-gray-600">{t.modificado_por}</span><span className="mx-1">·</span><span>{fmtDate(t.updated_at)}</span></>
        ) : <span className="text-gray-300">—</span>}
      </div>
    )
  }

  function Actions({ t }: { t: TarifaRow }) {
    return (
      <div className="flex gap-1.5">
        <button onClick={async () => { setHistModal({ id: t.id, ruta: t.ruta }); await loadHistory(t.id) }}
          className="p-1.5 border border-gray-200 rounded-md hover:bg-gray-100 text-gray-400 text-[10px]" title="Ver historial">📋</button>
        <button onClick={() => deleteTarifa(t.id)}
          className="p-1.5 border border-gray-200 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500 text-[10px]" title="Eliminar">🗑</button>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-gray-900">Tarifas base</h1>
        <p className="text-xs text-gray-400 mt-0.5">Módulo 1 — Valores de referencia para el cotizador</p>
      </div>

      {/* FLETES MARÍTIMOS */}
      <Section title="Fletes marítimos (USD/contenedor)" onAdd={() => addTarifa('maritima')} loading={loading} empty={maritimas.length === 0} onAddEmpty={() => addTarifa('maritima')}>
        <thead><tr className="bg-gray-50 border-b border-gray-100">{['Ruta','Tipo cont.','USD','Naviera','Última modif.',''].map(h=><th key={h} className="text-left px-4 py-2 text-[10px] font-medium text-gray-400 uppercase tracking-wide">{h}</th>)}</tr></thead>
        <tbody>
          {maritimas.map(t => (
            <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="px-4 py-2.5"><InlineInput value={t.ruta} onSave={v => updateTarifa(t, 'ruta', v)} /></td>
              <td className="px-4 py-2.5"><InlineInput value={t.tipo_contenedor} onSave={v => updateTarifa(t, 'tipo_contenedor', v)} placeholder="ej. 40HC" /></td>
              <td className="px-4 py-2.5"><div className="flex items-center gap-1"><span className="text-[10px] text-gray-400">USD</span><InlineNum value={t.valor} onSave={v => updateTarifa(t, 'valor', v)} /></div></td>
              <td className="px-4 py-2.5"><InlineInput value={t.naviera} onSave={v => updateTarifa(t, 'naviera', v)} placeholder="Naviera" /></td>
              <td className="px-4 py-2.5">
                {t.cotizacion_url ? (
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setPreviewModal({ url: t.cotizacion_url!, nombre: t.cotizacion_nombre || 'cotizacion' })}
                      className="flex items-center gap-1 px-2 py-1 bg-[#EBF2FF] text-[#1168F8] rounded text-[10px] hover:bg-[#93B8FC] transition-colors">
                      📄 Ver
                    </button>
                    <div className="text-[9px] text-gray-400">
                      {t.cotizacion_fecha && <div>{t.cotizacion_fecha}</div>}
                      {t.operacion_ref && <div className="text-[#1168F8]">{t.operacion_ref}</div>}
                    </div>
                  </div>
                ) : (
                  <button onClick={() => { const sug = getSugerencia(t); setCotModal({ tarifa: t, sugerencia: sug }); setCotFecha(''); setCotOpRef(''); setCotFile(null) }}
                    className="flex items-center gap-1 px-2 py-1 border border-dashed border-gray-200 rounded text-[10px] text-gray-400 hover:border-[#1168F8] hover:text-[#1168F8] cursor-pointer transition-colors">
                    📎 Adjuntar
                  </button>
                )}
              </td>
              <td className="px-4 py-2.5"><AuditCell t={t} /></td>
              <td className="px-4 py-2.5"><Actions t={t} /></td>
            </tr>
          ))}
        </tbody>
      </Section>

      {/* FLETES TERRESTRES */}
      <Section title="Fletes terrestres Chile → NOA (USD/camión)" onAdd={() => addTarifa('terrestre')} loading={loading} empty={terrestres.length === 0} onAddEmpty={() => addTarifa('terrestre')}>
        <thead><tr className="bg-gray-50 border-b border-gray-100">{['Ruta','Tipo','USD','Observaciones','Última modif.',''].map(h=><th key={h} className="text-left px-4 py-2 text-[10px] font-medium text-gray-400 uppercase tracking-wide">{h}</th>)}</tr></thead>
        <tbody>
          {terrestres.map(t => (
            <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="px-4 py-2.5"><InlineInput value={t.ruta} onSave={v => updateTarifa(t, 'ruta', v)} /></td>
              <td className="px-4 py-2.5"><InlineInput value={t.tipo_contenedor} onSave={v => updateTarifa(t, 'tipo_contenedor', v)} /></td>
              <td className="px-4 py-2.5"><div className="flex items-center gap-1"><span className="text-[10px] text-gray-400">USD</span><InlineNum value={t.valor} onSave={v => updateTarifa(t, 'valor', v)} /></div></td>
              <td className="px-4 py-2.5"><InlineInput value={t.obs} onSave={v => updateTarifa(t, 'obs', v)} placeholder="Opcional" /></td>
              <td className="px-4 py-2.5">
                {t.cotizacion_url ? (
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setPreviewModal({ url: t.cotizacion_url!, nombre: t.cotizacion_nombre || 'cotizacion' })}
                      className="flex items-center gap-1 px-2 py-1 bg-[#EBF2FF] text-[#1168F8] rounded text-[10px] hover:bg-[#93B8FC] transition-colors">
                      📄 Ver
                    </button>
                    <div className="text-[9px] text-gray-400">
                      {t.cotizacion_fecha && <div>{t.cotizacion_fecha}</div>}
                      {t.operacion_ref && <div className="text-[#1168F8]">{t.operacion_ref}</div>}
                    </div>
                  </div>
                ) : (
                  <button onClick={() => { const sug = getSugerencia(t); setCotModal({ tarifa: t, sugerencia: sug }); setCotFecha(''); setCotOpRef(''); setCotFile(null) }}
                    className="flex items-center gap-1 px-2 py-1 border border-dashed border-gray-200 rounded text-[10px] text-gray-400 hover:border-[#1168F8] hover:text-[#1168F8] cursor-pointer transition-colors">
                    📎 Adjuntar
                  </button>
                )}
              </td>
              <td className="px-4 py-2.5"><AuditCell t={t} /></td>
              <td className="px-4 py-2.5"><Actions t={t} /></td>
            </tr>
          ))}
        </tbody>
      </Section>

      {/* GASTOS PUERTO CHILE */}
      <Section title="Gastos puerto Chile (USD/contenedor)" onAdd={() => addTarifa('puerto')} loading={loading} empty={puerto.length === 0} onAddEmpty={() => addTarifa('puerto')}>
        <thead><tr className="bg-gray-50 border-b border-gray-100">{['Descripción','IVA Chile','USD','Observaciones','Última modif.',''].map(h=><th key={h} className="text-left px-4 py-2 text-[10px] font-medium text-gray-400 uppercase tracking-wide">{h}</th>)}</tr></thead>
        <tbody>
          {puerto.map(t => (
            <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="px-4 py-2.5"><InlineInput value={t.ruta} onSave={v => updateTarifa(t, 'ruta', v)} /></td>
              <td className="px-4 py-2.5">
                <select defaultValue={t.iva_chile || 'exento'} onBlur={e => updateTarifa(t, 'iva_chile', e.target.value)}
                  className="px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:border-[#1168F8] bg-white">
                  <option value="exento">Exento</option>
                  <option value="gravado">Gravado 19%</option>
                </select>
              </td>
              <td className="px-4 py-2.5"><div className="flex items-center gap-1"><span className="text-[10px] text-gray-400">USD</span><InlineNum value={t.valor} onSave={v => updateTarifa(t, 'valor', v)} /></div></td>
              <td className="px-4 py-2.5"><InlineInput value={t.obs} onSave={v => updateTarifa(t, 'obs', v)} placeholder="Opcional" /></td>
              <td className="px-4 py-2.5">
                {t.cotizacion_url ? (
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setPreviewModal({ url: t.cotizacion_url!, nombre: t.cotizacion_nombre || 'cotizacion' })}
                      className="flex items-center gap-1 px-2 py-1 bg-[#EBF2FF] text-[#1168F8] rounded text-[10px] hover:bg-[#93B8FC] transition-colors">
                      📄 Ver
                    </button>
                    <div className="text-[9px] text-gray-400">
                      {t.cotizacion_fecha && <div>{t.cotizacion_fecha}</div>}
                      {t.operacion_ref && <div className="text-[#1168F8]">{t.operacion_ref}</div>}
                    </div>
                  </div>
                ) : (
                  <button onClick={() => { const sug = getSugerencia(t); setCotModal({ tarifa: t, sugerencia: sug }); setCotFecha(''); setCotOpRef(''); setCotFile(null) }}
                    className="flex items-center gap-1 px-2 py-1 border border-dashed border-gray-200 rounded text-[10px] text-gray-400 hover:border-[#1168F8] hover:text-[#1168F8] cursor-pointer transition-colors">
                    📎 Adjuntar
                  </button>
                )}
              </td>
              <td className="px-4 py-2.5"><AuditCell t={t} /></td>
              <td className="px-4 py-2.5"><Actions t={t} /></td>
            </tr>
          ))}
        </tbody>
      </Section>

      {/* GASTOS ARGENTINA */}
      <Section title="Gastos en Argentina" onAdd={() => addTarifa('argentina', 'fijo_usd')} loading={loading} empty={argentina.length === 0} onAddEmpty={() => addTarifa('argentina', 'fijo_usd')}>
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100">
            {['Concepto','Tipo cálculo','Moneda','Valor','Piso USD','Techo USD','Observaciones','Última modif.',''].map(h =>
              <th key={h} className="text-left px-4 py-2 text-[10px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
            )}
          </tr>
        </thead>
        <tbody>
          {argentina.map(t => (
            <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="px-4 py-2.5 min-w-48"><InlineInput value={t.ruta} onSave={v => updateTarifa(t, 'ruta', v)} /></td>
              <td className="px-4 py-2.5">
                <select defaultValue={t.tipo_calculo || 'fijo_usd'}
                  onBlur={e => updateTarifa(t, 'tipo_calculo', e.target.value)}
                  className="px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:border-[#1168F8] bg-white whitespace-nowrap">
                  <option value="pct_cif">% sobre CIF</option>
                  <option value="fijo_usd">Fijo USD</option>
                  <option value="fijo_ars">Fijo ARS</option>
                </select>
              </td>
              <td className="px-4 py-2.5">
                <select defaultValue={t.moneda || 'USD'}
                  onBlur={e => updateTarifa(t, 'moneda', e.target.value)}
                  className="px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:border-[#1168F8] bg-white">
                  <option value="USD">USD</option>
                  <option value="ARS">ARS</option>
                </select>
              </td>
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-gray-400">{(t.tipo_calculo || 'fijo_usd') === 'pct_cif' ? '%' : (t.moneda || 'USD')}</span>
                  <InlineNum value={t.valor} onSave={v => updateTarifa(t, 'valor', v)} />
                </div>
              </td>
              <td className="px-4 py-2.5">
                {(t.tipo_calculo || 'fijo_usd') === 'pct_cif'
                  ? <div className="flex items-center gap-1"><span className="text-[10px] text-gray-400">USD</span><InlineNum value={t.piso_usd || 0} onSave={v => updateTarifa(t, 'piso_usd', v)} /></div>
                  : <span className="text-[10px] text-gray-300">—</span>
                }
              </td>
              <td className="px-4 py-2.5">
                {(t.tipo_calculo || 'fijo_usd') === 'pct_cif'
                  ? <div className="flex items-center gap-1"><span className="text-[10px] text-gray-400">USD</span><InlineNum value={t.techo_usd || 0} onSave={v => updateTarifa(t, 'techo_usd', v)} placeholder="0=sin techo" /></div>
                  : <span className="text-[10px] text-gray-300">—</span>
                }
              </td>
              <td className="px-4 py-2.5"><InlineInput value={t.obs} onSave={v => updateTarifa(t, 'obs', v)} placeholder="Opcional" /></td>
              <td className="px-4 py-2.5">
                {t.cotizacion_url ? (
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setPreviewModal({ url: t.cotizacion_url!, nombre: t.cotizacion_nombre || 'cotizacion' })}
                      className="flex items-center gap-1 px-2 py-1 bg-[#EBF2FF] text-[#1168F8] rounded text-[10px] hover:bg-[#93B8FC] transition-colors">
                      📄 Ver
                    </button>
                    <div className="text-[9px] text-gray-400">
                      {t.cotizacion_fecha && <div>{t.cotizacion_fecha}</div>}
                      {t.operacion_ref && <div className="text-[#1168F8]">{t.operacion_ref}</div>}
                    </div>
                  </div>
                ) : (
                  <button onClick={() => { const sug = getSugerencia(t); setCotModal({ tarifa: t, sugerencia: sug }); setCotFecha(''); setCotOpRef(''); setCotFile(null) }}
                    className="flex items-center gap-1 px-2 py-1 border border-dashed border-gray-200 rounded text-[10px] text-gray-400 hover:border-[#1168F8] hover:text-[#1168F8] cursor-pointer transition-colors">
                    📎 Adjuntar
                  </button>
                )}
              </td>
              <td className="px-4 py-2.5"><AuditCell t={t} /></td>
              <td className="px-4 py-2.5"><Actions t={t} /></td>
            </tr>
          ))}
        </tbody>
      </Section>

      {/* Modal cotizacion */}
      {cotModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <span className="font-medium text-sm text-gray-900">Adjuntar cotización</span>
                <span className="text-xs text-gray-400 ml-2">{cotModal.tarifa.ruta}</span>
              </div>
              <button onClick={() => setCotModal(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="px-5 py-4 space-y-3">
              {cotModal.sugerencia && (
                <div className="bg-[#EBF2FF] border border-[#93B8FC] rounded-lg p-3 text-xs">
                  <div className="font-medium text-[#052698] mb-1">📋 Cotización de referencia disponible</div>
                  <div className="text-gray-600">{cotModal.sugerencia.cotizacion_nombre}</div>
                  <div className="text-gray-400 mt-0.5">
                    {cotModal.sugerencia.cotizacion_fecha} · {cotModal.sugerencia.subido_por}
                    {cotModal.sugerencia.operacion_ref && ` · ${cotModal.sugerencia.operacion_ref}`}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => setPreviewModal({ url: cotModal.sugerencia!.cotizacion_url!, nombre: cotModal.sugerencia!.cotizacion_nombre || '' })}
                      className="text-[#1168F8] hover:underline text-[10px]">👁 Ver referencia</button>
                    <button onClick={async () => {
                      await (supabase.from('tarifas') as any).update({
                        cotizacion_ref_id: cotModal.sugerencia!.id,
                        cotizacion_url: cotModal.sugerencia!.cotizacion_url,
                        cotizacion_nombre: cotModal.sugerencia!.cotizacion_nombre,
                        cotizacion_fecha: cotModal.sugerencia!.cotizacion_fecha,
                        operacion_ref: cotModal.sugerencia!.operacion_ref,
                        subido_por: currentUser?.nombre,
                        subido_at: new Date().toISOString(),
                      }).eq('id', cotModal.tarifa.id)
                      setCotModal(null); loadData()
                    }} className="text-[#1168F8] hover:underline text-[10px] font-medium">✓ Usar esta referencia</button>
                  </div>
                </div>
              )}
              <div>
                <label className="block text-[10px] text-gray-500 font-medium mb-1">Archivo (PDF o imagen)</label>
                <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-lg text-xs text-gray-500 hover:border-[#1168F8] cursor-pointer transition-colors">
                  📎 {cotFile ? cotFile.name : 'Seleccionar archivo'}
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => setCotFile(e.target.files?.[0] || null)} />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-gray-500 font-medium mb-1">Fecha de la cotización</label>
                  <input type="date" value={cotFecha} onChange={e => setCotFecha(e.target.value)} className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8]" />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 font-medium mb-1">Referencia operación/cliente</label>
                  <input value={cotOpRef} onChange={e => setCotOpRef(e.target.value)} placeholder="ej. PNOA-2026-0001" className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8]" />
                </div>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-between">
              <button onClick={() => setCotModal(null)} className="px-4 py-2 border border-gray-200 rounded-lg text-xs hover:bg-gray-50">Cancelar</button>
              <button
                disabled={!cotFile || uploading}
                onClick={() => cotFile && uploadCotizacion(cotModal.tarifa.id, cotFile, cotFecha, cotOpRef)}
                className="px-4 py-2 bg-[#1168F8] text-white rounded-lg text-xs font-medium hover:bg-[#0a4fc4] disabled:opacity-50">
                {uploading ? 'Subiendo...' : '✓ Guardar cotización'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview modal */}
      {previewModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setPreviewModal(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <span className="font-medium text-sm text-gray-900 truncate">{previewModal.nombre}</span>
              <div className="flex gap-2">
                <a href={previewModal.url} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-[#1168F8] text-white rounded-lg text-xs hover:bg-[#0a4fc4]">🔗 Abrir</a>
                <button onClick={() => setPreviewModal(null)} className="text-gray-400 hover:text-gray-600 text-xl px-1">×</button>
              </div>
            </div>
            <div className="overflow-auto max-h-[75vh] p-2">
              {previewModal.nombre.toLowerCase().endsWith('.pdf')
                ? <iframe src={previewModal.url} className="w-full h-[70vh] border-0" title={previewModal.nombre} />
                : <img src={previewModal.url} alt={previewModal.nombre} className="max-w-full mx-auto rounded" />
              }
            </div>
          </div>
        </div>
      )}

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-700">
        💡 Los valores se guardan automáticamente al hacer click fuera del campo. Para gastos <strong>% sobre CIF</strong>: Techo 0 = sin techo máximo.
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
              <button onClick={() => { setHistModal(null); setHistData([]) }} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
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
                        Campo <span className="font-mono text-gray-700">{h.campo}</span>:{' '}
                        <span className="line-through text-red-400">{h.valor_anterior}</span>
                        <span className="mx-1 text-gray-300">→</span>
                        <span className="text-green-700 font-medium">{h.valor_nuevo}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-5 py-8 text-center text-gray-400 text-sm">Sin historial.</div>
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

function Section({ title, onAdd, loading, empty, onAddEmpty, children }: {
  title: string; onAdd: () => void; loading: boolean; empty: boolean; onAddEmpty: () => void; children: React.ReactNode
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden mb-4">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <span className="font-medium text-sm text-gray-900">{title}</span>
        <button onClick={onAdd} className="text-xs text-[#1168F8] hover:underline">+ Agregar</button>
      </div>
      {loading ? (
        <div className="p-4 text-center text-gray-400 text-xs">Cargando...</div>
      ) : empty ? (
        <div className="px-4 py-4 text-center text-gray-400 text-xs">
          Sin tarifas. <button onClick={onAddEmpty} className="text-[#1168F8] hover:underline">Agregar una →</button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            {children}
          </table>
        </div>
      )}
    </div>
  )
}

function InlineInput({ value, onSave, placeholder }: { value: string; onSave: (v: string) => void; placeholder?: string }) {
  return (
    <input
      defaultValue={value}
      onBlur={e => onSave(e.target.value)}
      className="w-full px-2 py-1 border border-transparent rounded hover:border-gray-200 focus:border-[#1168F8] focus:outline-none text-xs"
      placeholder={placeholder}
    />
  )
}

function InlineNum({ value, onSave, placeholder }: { value: number; onSave: (v: number) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      inputMode="decimal"
      defaultValue={value}
      onFocus={e => e.target.select()}
      onBlur={e => {
        const n = parseFloat(e.target.value.replace(',', '.').replace(/[^0-9.-]/g, ''))
        onSave(isNaN(n) ? 0 : n)
      }}
      className="w-24 px-2 py-1 border border-transparent rounded hover:border-gray-200 focus:border-[#1168F8] focus:outline-none text-xs text-right font-mono"
      placeholder={placeholder || '0'}
    />
  )
}
