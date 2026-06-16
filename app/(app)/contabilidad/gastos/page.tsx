'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'

const inp = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white'
const fmtN = (n: number) => (n||0).toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const parseN = (v: string) => { const n = parseFloat(String(v).replace(',','.').replace(/[^0-9.-]/g,'')); return isNaN(n)?0:n }
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export default function GastosFijosPage() {
  const supabase = useMemo(() => createClient(), [])
  const [gastos, setGastos] = useState<any[]>([])
  const [categorias, setCategorias] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [mes, setMes] = useState(new Date().getMonth() + 1)
  const [saving, setSaving] = useState(false)
  const [compFile, setCompFile] = useState<File|null>(null)
  const [previewModal, setPreviewModal] = useState<{url:string;nombre:string;tipo:string}|null>(null)
  const [tc, setTc] = useState<{ usd: number; ars: number }>({ usd: 908, ars: 0 })
  const [form, setForm] = useState({
    categoria_id: '', descripcion: '', moneda: 'CLP',
    monto: '', es_recurrente: false, notas: '', comprobante_ref: ''
  })

  useEffect(() => { loadCats(); loadTC() }, [])
  useEffect(() => { load() }, [anio, mes])

  async function loadTC() {
    const { data } = await (supabase.from('tipos_cambio_eventos') as any)
      .select('clp, ars').order('created_at', { ascending: false }).limit(1)
    if (data?.[0]) setTc({ usd: data[0].clp || 908, ars: data[0].ars || 0 })
  }

  async function loadCats() {
    const { data } = await (supabase.from('gastos_fijos_categorias') as any).select('*').eq('activo', true).order('orden')
    if (data) setCategorias(data)
  }

  async function load() {
    setLoading(true)
    const { data } = await (supabase.from('gastos_fijos_pn') as any)
      .select('*, categoria:gastos_fijos_categorias(nombre,codigo)')
      .eq('periodo_anio', anio).eq('periodo_mes', mes)
      .order('fecha', { ascending: false })
    if (data) setGastos(data)
    setLoading(false)
  }

  function calcClpEquiv(monto: number, moneda: string) {
    if (moneda === 'CLP') return monto
    if (moneda === 'USD') return monto * tc.usd
    if (moneda === 'ARS') return tc.ars > 0 ? (monto / tc.ars) * tc.usd : 0
    return monto
  }

  async function handleSave() {
    if (!form.categoria_id || !form.descripcion || !form.monto) { alert('Completá categoría, descripción y monto'); return }
    setSaving(true)
    const monto = parseN(form.monto)
    const clpEquiv = calcClpEquiv(monto, form.moneda)
    const { data: gastoData } = await (supabase.from('gastos_fijos_pn') as any).insert({
      categoria_id: form.categoria_id,
      descripcion: form.descripcion,
      moneda: form.moneda,
      [`monto_${form.moneda.toLowerCase()}`]: monto,
      monto_clp_equiv: clpEquiv,
      tipo_cambio_ref: form.moneda === 'CLP' ? null : form.moneda === 'USD' ? tc.usd : tc.ars,
      fecha: new Date().toISOString().slice(0,10),
      periodo_anio: anio,
      periodo_mes: mes,
      es_recurrente: form.es_recurrente,
      notas: form.notas || null,
      comprobante_ref: form.comprobante_ref || null,
    }).select('id').single()
    if (gastoData && compFile) {
      const ext = compFile.name.split('.').pop()
      const path = `gastos/${gastoData.id}.${ext}`
      await supabase.storage.from('comprobantes').upload(path, compFile, { upsert: true })
      const { data: urlData } = await supabase.storage.from('comprobantes').createSignedUrl(path, 3600)
      if (urlData?.signedUrl) {
        await (supabase.from('gastos_fijos_pn') as any).update({ archivo_url: urlData.signedUrl, archivo_nombre: compFile.name }).eq('id', gastoData.id)
      }
    }
    setForm({ categoria_id:'', descripcion:'', moneda:'CLP', monto:'', es_recurrente:false, notas:'', comprobante_ref:'' })
    setCompFile(null)
    setShowForm(false)
    await load()
    setSaving(false)
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar este gasto?')) return
    await (supabase.from('gastos_fijos_pn') as any).delete().eq('id', id)
    setGastos(prev => prev.filter(g => g.id !== id))
  }

  const totalClp = gastos.reduce((t, g) => t + (g.monto_clp_equiv || 0), 0)
  const porCategoria = categorias.map(c => ({
    ...c,
    total: gastos.filter(g => g.categoria_id === c.id).reduce((t, g) => t + (g.monto_clp_equiv || 0), 0),
    count: gastos.filter(g => g.categoria_id === c.id).length,
  })).filter(c => c.count > 0)

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Gastos fijos Puerto NOA</h1>
          <p className="text-xs text-gray-400 mt-0.5">Alquileres · sueldos · gastos bancarios · otros</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select value={mes} onChange={e => setMes(Number(e.target.value))} className="px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white">
            {MESES.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
          </select>
          <select value={anio} onChange={e => setAnio(Number(e.target.value))} className="px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white">
            {[2024,2025,2026,2027].map(a => <option key={a}>{a}</option>)}
          </select>
          <button onClick={() => setShowForm(true)} className="px-5 py-2.5 bg-[#1168F8] text-white rounded-xl text-sm font-bold hover:bg-[#0a4fc4] shadow-sm">+ Agregar gasto</button>
        </div>
      </div>

      {/* Resumen por categoría */}
      {porCategoria.length > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-6">
          {porCategoria.map(c => (
            <div key={c.id} className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-gray-700">{c.nombre}</div>
                <div className="text-[10px] text-gray-400">{c.count} registro(s)</div>
              </div>
              <div className="font-mono font-bold text-gray-900 text-sm">$ {fmtN(c.total)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Total del mes */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm mb-6 flex items-center justify-between">
        <div>
          <div className="text-[10px] font-semibold text-gray-400 uppercase">Total gastos fijos — {MESES[mes-1]} {anio}</div>
          <div className="text-xs text-gray-400 mt-0.5">Equivalente CLP al TC vigente</div>
        </div>
        <div className="text-3xl font-bold text-gray-900 font-mono">$ {fmtN(totalClp)}</div>
      </div>

      {/* Formulario nuevo gasto */}
      {showForm && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm mb-6">
          <h3 className="font-bold text-sm text-gray-900 mb-4">Nuevo gasto fijo</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Categoría *</label>
              <select value={form.categoria_id} onChange={e => setForm(f => ({...f, categoria_id: e.target.value}))} className={inp}>
                <option value="">— Seleccioná una categoría —</option>
                {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Descripción *</label>
              <input value={form.descripcion} onChange={e => setForm(f => ({...f, descripcion: e.target.value}))} className={inp} placeholder="ej. Alquiler oficina Jujuy — Julio 2026"/>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Moneda</label>
              <select value={form.moneda} onChange={e => setForm(f => ({...f, moneda: e.target.value}))} className={inp}>
                <option value="CLP">CLP — Peso chileno</option>
                <option value="USD">USD — Dólar</option>
                <option value="ARS">ARS — Peso argentino</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Monto *</label>
              <input type="text" inputMode="decimal" value={form.monto} onChange={e => setForm(f => ({...f, monto: e.target.value}))} className={inp + ' text-right font-mono'} placeholder="0"/>
            </div>
            {form.moneda !== 'CLP' && (
              <div className="col-span-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-xs text-blue-700">
                Equivalente CLP: $ {fmtN(calcClpEquiv(parseN(form.monto), form.moneda))} (TC USD: {fmtN(tc.usd)})
              </div>
            )}
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">N° Comprobante</label>
              <input value={form.comprobante_ref} onChange={e => setForm(f => ({...f, comprobante_ref: e.target.value}))} className={inp} placeholder="Boleta / factura ref."/>
            </div>
            <div className="flex items-center gap-2 pt-5">
              <input type="checkbox" checked={form.es_recurrente} onChange={e => setForm(f => ({...f, es_recurrente: e.target.checked}))} className="w-4 h-4"/>
              <label className="text-xs text-gray-600">Gasto recurrente mensual</label>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Notas</label>
              <input value={form.notas} onChange={e => setForm(f => ({...f, notas: e.target.value}))} className={inp} placeholder="Observaciones"/>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Comprobante (PDF / imagen)</label>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 px-3 py-2 border border-dashed border-gray-300 rounded-xl text-xs text-gray-500 hover:border-[#1168F8] hover:text-[#1168F8] cursor-pointer flex-1">
                  📎 {compFile ? compFile.name : 'Adjuntar archivo'}
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e=>setCompFile(e.target.files?.[0]||null)}/>
                </label>
                {compFile && <button onClick={()=>setCompFile(null)} className="text-gray-400 hover:text-red-500 text-xs">✕</button>}
              </div>
            </div>
          </div>
          <div className="flex justify-between mt-4">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-200 rounded-xl text-xs hover:bg-gray-50">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="px-6 py-2.5 bg-[#1168F8] text-white rounded-xl text-xs font-bold disabled:opacity-50">
              {saving ? 'Guardando...' : 'Guardar gasto'}
            </button>
          </div>
        </div>
      )}

      {/* Tabla de gastos */}
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
        {loading ? <div className="p-12 text-center text-gray-400">Cargando...</div> : gastos.length === 0 ? (
          <div className="p-12 text-center text-gray-400">Sin gastos registrados en {MESES[mes-1]} {anio}</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Categoría','Descripción','Moneda','Monto','Equiv. CLP','Comprobante',''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gastos.map(g => (
                <tr key={g.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3.5">
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-[10px] font-semibold">{g.categoria?.nombre||'—'}</span>
                  </td>
                  <td className="px-4 py-3.5 font-medium text-gray-800">{g.descripcion}</td>
                  <td className="px-4 py-3.5">
                    <span className="font-mono text-[10px] text-gray-500">{g.moneda}</span>
                  </td>
                  <td className="px-4 py-3.5 font-mono text-right">
                    {g.moneda==='CLP'?'$':g.moneda==='USD'?'U$':'AR$'} {fmtN(g.monto_clp||g.monto_usd||g.monto_ars||0)}
                  </td>
                  <td className="px-4 py-3.5 font-mono text-right font-bold text-gray-900">$ {fmtN(g.monto_clp_equiv)}</td>
                  <td className="px-4 py-3.5">
                    {g.archivo_url ? (
                      <button onClick={()=>setPreviewModal({url:g.archivo_url,nombre:g.archivo_nombre||'comprobante',tipo:g.archivo_nombre?.endsWith('.pdf')?'pdf':'img'})}
                        className="px-2 py-1 bg-[#EBF2FF] text-[#1168F8] rounded-lg text-[10px] font-medium hover:bg-[#93B8FC]">📄 Ver</button>
                    ) : g.comprobante_ref ? (
                      <span className="text-gray-400 text-[10px] font-mono">{g.comprobante_ref}</span>
                    ) : <span className="text-gray-300 text-[10px]">—</span>}
                  </td>
                  <td className="px-4 py-3.5">
                    <button onClick={() => eliminar(g.id)} className="text-gray-400 hover:text-red-500 text-xs">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {previewModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={()=>setPreviewModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <span className="font-medium text-sm truncate">{previewModal.nombre}</span>
              <div className="flex items-center gap-2">
                <a href={previewModal.url} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-[#1168F8] text-white rounded-lg text-xs">🔗 Abrir / Descargar</a>
                <button onClick={()=>setPreviewModal(null)} className="text-gray-400 text-xl px-1">×</button>
              </div>
            </div>
            {previewModal.tipo==='pdf'
              ? <iframe src={previewModal.url} className="w-full h-[70vh] border-0" title={previewModal.nombre}/>
              : <img src={previewModal.url} alt={previewModal.nombre} className="max-w-full mx-auto rounded p-4"/>}
          </div>
        </div>
      )}
    </div>
  )
}
