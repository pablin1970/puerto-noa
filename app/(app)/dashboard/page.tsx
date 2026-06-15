'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

const fmtN = (n: number) => (n||0).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtUSD = (n: number) => `USD ${fmtN(n)}`
const fmtDate = (d: string) => d ? d.split('T')[0].split('-').reverse().join('/') : '—'

export default function DashboardLogisticoPage() {
  const supabase = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(true)
  const [usuario, setUsuario] = useState('')
  const [d, setD] = useState<any>({
    opsActivas: [], opsPorEtapa: {}, cotsRecientes: [],
    cotsPendientes: 0, cotsEnviadas: 0, cotsBorrador: 0,
    fondosTotal: 0, factPendCobro: 0,
    alertas: [], provVencimientos: [],
    tcARS: null, tcCLP: null, tcFecha: '', tcOk: true,
  })

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: auth } = await supabase.auth.getUser()
    if (auth?.user) {
      const { data: u } = await supabase.from('usuarios').select('nombre').eq('auth_id', auth.user.id).single()
      setUsuario((u as any)?.nombre?.split(' ')[0] || '')
    }

    const hoy = new Date()
    const hace30 = new Date(hoy); hace30.setDate(hoy.getDate() - 30)
    const en30  = new Date(hoy); en30.setDate(hoy.getDate() + 30)

    const [opsRes, cotsRes, tcRes, facRes, fondosRes, cotProvRes] = await Promise.all([
      supabase.from('operaciones').select('id,estado,created_at,cotizacion:cotizaciones(num,cliente,destino_noa,total_landed)').order('created_at', { ascending: false }),
      supabase.from('cotizaciones').select('id,num,cliente,estado,total_landed,created_at').order('created_at', { ascending: false }).limit(8),
      supabase.from('tipos_cambio_eventos').select('ars,clp,cny,fecha,created_at').order('created_at', { ascending: false }).limit(1),
      supabase.from('facturas_emitidas').select('id,total,estado').order('created_at', { ascending: false }).limit(200),
      (supabase.from('fondos_cuentas') as any).select('id').limit(1),
      supabase.from('cotizaciones_proveedor_v2').select('id,proveedor_nombre,fecha_vencimiento,estado').eq('estado','vigente'),
    ])

    const ops = (opsRes.data || []) as any[]
    const cots = (cotsRes.data || []) as any[]
    const tc = tcRes.data?.[0] as any
    const facs = (facRes.data || []) as any[]
    const cotsProv = (cotProvRes.data || []) as any[]

    const opsActivas = ops.filter(o => o.estado !== 'cerrada' && o.estado !== 'cancelada')

    // Etapas simuladas desde estado
    const ETAPA_LABEL: Record<string,string> = {
      'en_proceso': 'En tránsito', 'pendiente': 'Pendiente inicio',
      'abierta': 'Abierta', 'en_transito': 'En tránsito',
    }
    const opsPorEtapa: Record<string,any[]> = {
      'Marítimo': opsActivas.filter(o => ['maritimo','en_transito_maritimo'].includes(o.estado)),
      'Puerto Chile': opsActivas.filter(o => ['puerto_chile','aduana_chile'].includes(o.estado)),
      'Terrestre': opsActivas.filter(o => ['terrestre','en_transito_terrestre'].includes(o.estado)),
      'En proceso': opsActivas.filter(o => !['maritimo','en_transito_maritimo','puerto_chile','aduana_chile','terrestre','en_transito_terrestre'].includes(o.estado)),
    }

    // Fondos en custodia — total aproximado desde movimientos
    const { data: movFondos } = await (supabase.from('fondos_movimientos') as any).select('tipo,monto,moneda')
    const fondosTotal = (movFondos||[]).reduce((t: number, m: any) => {
      const monto = m.monto || 0
      return ['ingreso','deposito','credito'].includes(m.tipo) ? t + monto : t - monto
    }, 0)

    // Facturas pendientes de cobro
    const factPendCobro = facs.filter(f => ['pendiente','emitida'].includes(f.estado)).reduce((t, f) => t + (f.total||0), 0)

    // Cotizaciones de proveedores próximas a vencer
    const provVencimientos = cotsProv.filter(c => {
      if (!c.fecha_vencimiento) return false
      const venc = new Date(c.fecha_vencimiento)
      return venc >= hoy && venc <= en30
    }).sort((a, b) => new Date(a.fecha_vencimiento).getTime() - new Date(b.fecha_vencimiento).getTime()).slice(0, 5)

    // TC ok si fue hoy
    const tcFechaHoy = tc?.created_at ? new Date(tc.created_at).toDateString() === hoy.toDateString() : false

    // Alertas
    const alertas: any[] = []
    if (!tcFechaHoy) alertas.push({ tipo: 'warn', msg: 'Tipo de cambio no actualizado hoy', href: '/tipos-cambio' })
    const cotsBorrador = cots.filter(c => c.estado === 'borrador').length
    const cotsEnviadas = cots.filter(c => c.estado === 'enviada').length
    if (cotsBorrador > 0) alertas.push({ tipo: 'info', msg: `${cotsBorrador} cotización(es) en borrador sin enviar`, href: '/registro' })
    if (cotsEnviadas > 0) alertas.push({ tipo: 'info', msg: `${cotsEnviadas} cotización(es) esperando respuesta del cliente`, href: '/registro' })
    if (provVencimientos.length > 0) alertas.push({ tipo: 'warn', msg: `${provVencimientos.length} cotización(es) de proveedores vencen en 30 días`, href: '/cotizaciones-proveedores' })
    if (factPendCobro > 0) alertas.push({ tipo: 'info', msg: `Facturas pendientes de cobro: ${fmtUSD(factPendCobro)}`, href: '/facturacion/emitidas' })

    setD({
      opsActivas, opsPorEtapa,
      cotsRecientes: cots,
      cotsPendientes: cots.filter(c => c.estado === 'enviada').length,
      cotsEnviadas: cots.filter(c => c.estado === 'aceptada').length,
      cotsBorrador,
      fondosTotal, factPendCobro,
      alertas, provVencimientos,
      tcARS: tc?.ars, tcCLP: tc?.clp, tcFecha: tc?.fecha || '',
      tcOk: tcFechaHoy,
    })
    setLoading(false)
  }

  const hora = new Date().getHours()
  const saludo = hora < 12 ? 'Buenos días' : hora < 20 ? 'Buenas tardes' : 'Buenas noches'

  if (loading) return <div className="p-12 text-center text-gray-400">Cargando...</div>

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{saludo}{usuario ? `, ${usuario}` : ''} 👋</h1>
          <p className="text-xs text-gray-400 mt-0.5">Puerto NOA SpA — {new Date().toLocaleDateString('es-AR', { weekday:'long', day:'numeric', month:'long' })}</p>
        </div>
        <div className="flex items-center gap-3">
          {[{ label:'AR ARS', val:d.tcARS, dec:0 },{ label:'CL CLP', val:d.tcCLP, dec:0 }].map(t => (
            <div key={t.label} className={`px-3 py-1.5 rounded-xl border text-xs font-mono ${d.tcOk?'bg-white border-gray-200':'bg-amber-50 border-amber-200'}`}>
              <span className="text-gray-400 mr-1">{t.label}</span>
              <span className="font-bold text-gray-900">{t.val ? t.val.toLocaleString('es-CL',{maximumFractionDigits:t.dec}) : '—'}</span>
            </div>
          ))}
          {!d.tcOk && <span className="text-[10px] text-amber-600 font-semibold">⚠ TC desactualizado</span>}
        </div>
      </div>

      {/* FILA 1 — KPIs principales */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        {[
          { label:'Operaciones activas', val: d.opsActivas.length, icon:'🚢', color:'text-[#1168F8]', href:'/operaciones' },
          { label:'Cotizaciones enviadas', val: d.cotsPendientes, icon:'📋', color:'text-amber-600', href:'/registro' },
          { label:'Fondos administrados', val: `USD ${fmtN(d.fondosTotal)}`, icon:'🏦', color:'text-teal-600', href:'/fondos' },
          { label:'Facturas por cobrar', val: fmtUSD(d.factPendCobro), icon:'📄', color:'text-purple-600', href:'/facturacion/emitidas' },
        ].map((k, i) => (
          <Link key={i} href={k.href} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:border-[#1168F8] transition-colors group">
            <div className="flex items-center justify-between mb-2">
              <span className="text-lg">{k.icon}</span>
              <span className="text-[9px] text-gray-400 group-hover:text-[#1168F8]">Ver →</span>
            </div>
            <div className={`text-2xl font-bold font-mono ${k.color}`}>{k.val}</div>
            <div className="text-[10px] text-gray-400 mt-1">{k.label}</div>
          </Link>
        ))}
      </div>

      {/* FILA 2 — Pipeline logístico */}
      <div className="mb-5">
        <div className="text-[10px] font-semibold text-gray-400 uppercase mb-2">Pipeline logístico</div>
        <div className="grid grid-cols-4 gap-3">
          {[
            { etapa:'Marítimo', icon:'🌊', color:'bg-blue-50 border-blue-100', text:'text-blue-700' },
            { etapa:'Puerto Chile', icon:'⚓', color:'bg-teal-50 border-teal-100', text:'text-teal-700' },
            { etapa:'Terrestre', icon:'🚛', color:'bg-amber-50 border-amber-100', text:'text-amber-700' },
            { etapa:'En proceso', icon:'📦', color:'bg-gray-50 border-gray-200', text:'text-gray-600' },
          ].map(e => {
            const ops = d.opsPorEtapa[e.etapa] || []
            return (
              <div key={e.etapa} className={`border rounded-2xl p-3 ${e.color}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span>{e.icon}</span>
                  <span className={`text-[10px] font-bold uppercase ${e.text}`}>{e.etapa}</span>
                </div>
                <div className={`text-3xl font-bold font-mono ${e.text}`}>{ops.length}</div>
                <div className="text-[10px] text-gray-400 mt-1">operación{ops.length !== 1 ? 'es' : ''}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* FILA 3 — Alertas + Cotiz proveedores por vencer */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        {/* Alertas */}
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <div className="text-[10px] font-semibold text-gray-400 uppercase mb-3">Alertas y pendientes</div>
          {d.alertas.length === 0 ? (
            <div className="flex items-center gap-2 text-green-700 text-xs">
              <span className="text-lg">✅</span> Todo al día — sin alertas pendientes
            </div>
          ) : d.alertas.map((a: any, i: number) => (
            <Link key={i} href={a.href} className={`flex items-start gap-2 py-2 border-b border-gray-50 last:border-0 hover:opacity-70 transition-opacity`}>
              <span className="flex-shrink-0 mt-0.5">{a.tipo === 'warn' ? '⚠️' : 'ℹ️'}</span>
              <span className={`text-xs ${a.tipo === 'warn' ? 'text-amber-700' : 'text-gray-600'}`}>{a.msg}</span>
            </Link>
          ))}
        </div>

        {/* Cotizaciones proveedores por vencer */}
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <div className="text-[10px] font-semibold text-gray-400 uppercase mb-3">Cotizaciones proveedores por vencer</div>
          {d.provVencimientos.length === 0 ? (
            <div className="text-xs text-gray-400">Sin vencimientos en los próximos 30 días</div>
          ) : d.provVencimientos.map((c: any) => {
            const dias = Math.ceil((new Date(c.fecha_vencimiento).getTime() - new Date().getTime()) / 86400000)
            return (
              <div key={c.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <span className="text-xs text-gray-700 font-medium">{c.proveedor_nombre}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${dias <= 7 ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                  {dias}d
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* FILA 4 — Actividad reciente */}
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <span className="font-bold text-sm text-gray-900">Cotizaciones recientes</span>
          <Link href="/registro" className="text-[10px] text-[#1168F8] hover:underline">Ver todas →</Link>
        </div>
        <table className="w-full text-xs">
          <tbody>
            {d.cotsRecientes.length === 0 ? (
              <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-400">Sin cotizaciones</td></tr>
            ) : d.cotsRecientes.map((c: any) => (
              <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-5 py-3 font-mono font-bold text-[#052698]">{c.num}</td>
                <td className="px-4 py-3 font-medium text-gray-800">{c.cliente}</td>
                <td className="px-4 py-3 font-mono text-gray-500">{c.total_landed ? fmtUSD(c.total_landed) : '—'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    c.estado==='aceptada'?'bg-green-50 text-green-700':
                    c.estado==='enviada'?'bg-blue-50 text-blue-700':
                    c.estado==='rechazada'?'bg-red-50 text-red-700':
                    'bg-gray-100 text-gray-500'}`}>{c.estado}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
