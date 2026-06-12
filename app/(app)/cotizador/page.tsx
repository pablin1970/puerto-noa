'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { fmt, calcCapacidad, CONT_CAPS, PUERTOS_L, nextCotNum } from '@/lib/utils'
import type { ContenedorCot, ProductoCot, Tarifa } from '@/types'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

type Tab = 'embarque' | 'logistica' | 'tributos' | 'resumen'
type OptTransp = 'A1' | 'A2' | 'B'

interface ItemLog { id: string; desc: string; cant: number; unitario: number; ivaChile?: 'exento'|'gravado'; tipoCalc?: 'fijo'|'m3' }
interface Proforma {
  id: string
  numero: string
  proveedor: string
  fecha: string
  archivo_url?: string
  archivo_nombre?: string
}

interface GastoArg {
  id: string
  desc: string
  tipoCalc: 'pct_cif' | 'fijo_usd' | 'fijo_ars'
  moneda: 'USD' | 'ARS'
  valor: number
  pisoUsd: number
  techoUsd: number
  usd: number
  ars: number
}
interface TribCfg { id: string; codigo: string; concepto: string; tipo: 'pct'|'fijo'; valor: number; aplica: boolean; orden: number }
interface CotState {
  cliente: string; cuit: string; email: string; telefono: string
  despachante: string; ivaCondicion: string; validez: string
  origen: string; ptoChile: string; destinoNoa: string; incoterm: string
  transito: string; refNaviero: string; cotProvId: string; cotProvLabel: string
  cotTranspId: string; cotTranspLabel: string
  cotArgId: string; cotArgLabel: string; notas: string
  contenedores: ContenedorCot[]; productos: ProductoCot[]
  exwTransp: number; exwAgente: number; exwOtros: number; precioArgEquiv: number
  proformas: Proforma[]
  rowsA: ItemLog[]; segModo: 'pct'|'fijo'; segVal: number
  rowsC: ItemLog[]
  optTransp: OptTransp; rowsDescon: ItemLog[]
  almModoVol: 'auto'|'manual'; almVolM3: number; almCostoDia: number; almDias: number
  cargaModo: 'fijo'|'m3'; cargaValor: number
  ftCamion: number; nCamiones: number; ftIda: number; ftDev: number; ftRt: number
  rowsE: ItemLog[]; gastosArg: GastoArg[]; feeCont: number
  tcClp: number; regimen: 'A'|'B'|'C'|'D'; tcTrib: number; derPct: number
}

const INIT: CotState = {
  cliente:'',cuit:'',email:'',telefono:'',despachante:'',ivaCondicion:'Responsable Inscripto',validez:'',
  origen:'Dalian, China (CNDAG)',ptoChile:'IQQ',destinoNoa:'Jujuy',incoterm:'FOB',transito:'44-46 dias',refNaviero:'',cotProvId:'',cotProvLabel:'',cotTranspId:'',cotTranspLabel:'',cotArgId:'',cotArgLabel:'',notas:'',
  contenedores:[{tipo:'40HC',cantidad:1}],
  productos:[{descripcion:'',ncm:'',cantidad:1,precio_unit:0,subtotal:0,peso_unit:0,vol_unit:0,incoterm:'FOB'}],
  exwTransp:0,exwAgente:0,exwOtros:0,precioArgEquiv:0,proformas:[],
  rowsA:[],segModo:'pct',segVal:0.5,rowsC:[],
  optTransp:'A1',rowsDescon:[],
  almModoVol:'auto',almVolM3:0,almCostoDia:0,almDias:0,
  cargaModo:'fijo',cargaValor:0,
  ftCamion:0,nCamiones:1,ftIda:0,ftDev:0,ftRt:0,
  rowsE:[],gastosArg:[],feeCont:0,
  tcClp:950,regimen:'A',tcTrib:1000,derPct:18,
}

const REG_L: Record<string,string> = {
  A:'A — Persona juridica - Comercializacion',
  B:'B — Persona juridica - Uso propio',
  C:'C — Persona fisica - Comercializacion',
  D:'D — Persona fisica - Uso propio',
}

const inp = 'w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8] bg-white'
const sel = 'w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8] bg-white'
const parseNum = (v: string) => { const n = parseFloat(v.replace(',','.').replace(/[^0-9.-]/g,'')); return isNaN(n) ? 0 : n }
const parseInt2 = (v: string) => { const n = parseInt(v.replace(',','.').replace(/[^0-9-]/g,'')); return isNaN(n) ? 0 : n }

function Field({label,children}:{label:string;children:React.ReactNode}){
  return <div><label className="block text-[10px] font-medium text-gray-500 mb-1">{label}</label>{children}</div>
}
function Card({title,children}:{title:string;children:React.ReactNode}){
  return <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm"><div className="px-5 py-3 border-b border-gray-100 bg-gray-50 font-medium text-sm text-gray-900">{title}</div><div className="px-5 py-4">{children}</div></div>
}
function SecCard({letter,label,sub,sub2,children,loadBtn}:{letter:string;label:string;sub?:string;sub2:number;children:React.ReactNode;loadBtn?:React.ReactNode}){
  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#1168F8] text-white text-[10px] font-bold">{letter}</span>
        <span className="font-medium text-sm text-gray-900">{label}</span>
        {sub&&<span className="text-[10px] text-gray-400">{sub}</span>}
        {loadBtn&&<div className="ml-auto">{loadBtn}</div>}
      </div>
      <div className="px-5 py-4">{children}</div>
      <div className="flex justify-end items-center gap-2 px-5 py-2.5 bg-gray-50 border-t border-gray-100 text-xs text-gray-500">
        Subtotal: <strong className="font-mono text-gray-800">USD {fmt(sub2)}</strong>
      </div>
    </div>
  )
}
function LogRows({rows,onChange,withIva}:{rows:ItemLog[];onChange:(r:ItemLog[])=>void;withIva?:boolean}){
  const cols = withIva ? '1fr 70px 110px 90px 28px' : '1fr 70px 110px 28px'
  return (
    <div>
      {rows.length>0&&(
        <div style={{display:'grid',gridTemplateColumns:cols,gap:'6px'}} className="mb-1 text-[10px] text-gray-400 font-medium uppercase tracking-wide">
          <div>Descripcion</div>
          <div className="text-right">Cant.</div>
          <div className="text-right">Precio USD</div>
          {withIva&&<div>IVA Chile</div>}
          <div></div>
        </div>
      )}
      {rows.map((r,i)=>(
        <div key={r.id} style={{display:'grid',gridTemplateColumns:cols,gap:'6px',alignItems:'center'}} className="mb-2">
          <input value={r.desc} onChange={e=>{const n=[...rows];n[i]={...n[i],desc:e.target.value};onChange(n)}} className={inp} placeholder="Descripcion"/>
          <input type="text" inputMode="decimal" value={r.cant} onFocus={e=>e.target.select()} onChange={e=>{const n=[...rows];n[i]={...n[i],cant:parseNum(e.target.value)||1};onChange(n)}} className={inp+' text-right'}/>
          <input type="text" inputMode="decimal" value={r.unitario} onFocus={e=>e.target.select()} onChange={e=>{const n=[...rows];n[i]={...n[i],unitario:parseNum(e.target.value)};onChange(n)}} className={inp+' text-right'} placeholder="0.00"/>
          {withIva&&(
            <select value={r.ivaChile||'exento'} onChange={e=>{const n=[...rows];n[i]={...n[i],ivaChile:e.target.value as any};onChange(n)}} className={sel}>
              <option value="exento">Exento</option>
              <option value="gravado">Grav. 19%</option>
            </select>
          )}
          <button onClick={()=>onChange(rows.filter((_,j)=>j!==i))} className="text-gray-400 hover:text-red-500 text-xs">X</button>
        </div>
      ))}
      {rows.filter(r=>r.cant>0&&r.unitario>0).length>0&&(
        <div className="mt-2 pt-2 border-t border-gray-100 flex flex-wrap gap-x-4 gap-y-1">
          {rows.filter(r=>r.cant>0&&r.unitario>0).map((r,i)=>(
            <div key={r.id} className="text-[10px] text-gray-500">
              <span className="font-medium text-gray-700">{r.desc||`Item ${i+1}`}</span>
              <span className="mx-1 text-gray-300">-</span>
              <span className="font-mono">{r.cant} x USD {fmt(r.unitario)}</span>
              <span className="mx-1 text-gray-300">=</span>
              <span className="font-mono font-semibold text-[#052698]">USD {fmt(r.cant*r.unitario)}</span>
            </div>
          ))}
        </div>
      )}
      <button onClick={()=>onChange([...rows,{id:Math.random().toString(36).slice(2),desc:'',cant:1,unitario:0,ivaChile:'exento',tipoCalc:'fijo'}])} className="text-xs text-[#1168F8] hover:underline mt-2 block">+ Agregar item</button>
    </div>
  )
}
function DesconRows({rows,onChange,totalM3}:{rows:ItemLog[];onChange:(r:ItemLog[])=>void;totalM3:number}){
  return (
    <div>
      {rows.map((r,i)=>(
        <div key={r.id} style={{display:'grid',gridTemplateColumns:'2.5fr 100px 1fr 1fr auto',gap:'7px',alignItems:'end'}} className="mb-2">
          <input value={r.desc} onChange={e=>{const n=[...rows];n[i]={...n[i],desc:e.target.value};onChange(n)}} className={inp} placeholder="Concepto"/>
          <select value={r.tipoCalc||'fijo'} onChange={e=>{const n=[...rows];n[i]={...n[i],tipoCalc:e.target.value as any};onChange(n)}} className={sel}>
            <option value="fijo">Fijo (USD)</option><option value="m3">Por m3</option>
          </select>
          {r.tipoCalc==='fijo'
            ?<input type="text" inputMode="decimal" value={r.cant} onFocus={e=>e.target.select()} onChange={e=>{const n=[...rows];n[i]={...n[i],cant:parseNum(e.target.value)||1};onChange(n)}} className={inp+' text-right'} placeholder="Cant."/>
            :<div className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-right font-mono">{fmt(totalM3,2)} m3</div>
          }
          <input type="text" inputMode="decimal" value={r.unitario} onFocus={e=>e.target.select()} onChange={e=>{const n=[...rows];n[i]={...n[i],unitario:parseNum(e.target.value)};onChange(n)}} className={inp+' text-right'} placeholder={r.tipoCalc==='m3'?'USD/m3':'USD'}/>
          <button onClick={()=>onChange(rows.filter((_,j)=>j!==i))} className="text-gray-400 hover:text-red-500 text-xs pb-1">X</button>
        </div>
      ))}
      <button onClick={()=>onChange([...rows,{id:Math.random().toString(36).slice(2),desc:'',cant:1,unitario:0,tipoCalc:'fijo'}])} className="text-xs text-[#1168F8] hover:underline mt-1">+ Agregar item</button>
    </div>
  )
}

export default function CotizadorPage(){
  const [s,setS]=useState<CotState>(INIT)
  const [tab,setTab]=useState<Tab>('embarque')
  const [tarifas,setTarifas]=useState<Tarifa[]>([])
  const [cotNavieras,setCotNavieras]=useState<any[]>([])
  const [cotTransporte,setCotTransporte]=useState<any[]>([])
  const [cotArgentina,setCotArgentina]=useState<any[]>([])
  const [terceros,setTerceros]=useState<any[]>([])
  const [buscarCliente,setBuscarCliente]=useState('')
  const [showClienteDropdown,setShowClienteDropdown]=useState(false)
  const [clienteSelId,setClienteSelId]=useState<string|null>(null)
  const [histCliente,setHistCliente]=useState<any[]>([])
  const [showHist,setShowHist]=useState(false)
  const [tribCfg,setTribCfg]=useState<TribCfg[]>([])
  const [saving,setSaving]=useState(false)
  const supabase=createClient()
  const router=useRouter()

  useEffect(()=>{
    // Load TC desde tipos_cambio_eventos
    supabase.from('tipos_cambio_eventos').select('ars,clp').order('created_at', { ascending: false }).limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) {
          if (data[0].ars) setS(p => ({ ...p, tcTrib: data[0].ars }))
          if (data[0].clp) setS(p => ({ ...p, tcClp: data[0].clp }))
        }
      })

    // Load terceros (clientes)
    supabase.from('terceros').select('id,razon_social,nombre_fantasia,nro_doc,tipo_doc,condicion_iva,email,telefono,dir_fiscal_ciudad,pais')
      .eq('activo', 'true')
      .then(({data,error})=>{ console.log('terceros loaded:', data?.length, error); if(data) setTerceros(data) })

    // Load cotizaciones de proveedores vigentes
    supabase.from('cotizaciones_proveedor')
      .select('*, items:cotizacion_proveedor_items(*), operacion:operaciones(cotizacion:cotizaciones(num,cliente))')
      .eq('estado','vigente')
      .order('fecha',{ascending:false})
      .then(({data})=>{
        if(data){
          setCotNavieras(data.filter((c:any)=>c.items?.some((i:any)=>i.tipo_servicio==='maritima')))
          setCotTransporte(data.filter((c:any)=>c.items?.some((i:any)=>i.tipo_servicio==='terrestre')))
          setCotArgentina(data.filter((c:any)=>c.items?.some((i:any)=>i.tipo_servicio==='argentina')))
        }
      })
    supabase.from('tarifas').select('*').eq('activo',true).then(({data})=>{
      if(data) {
        setTarifas(data as Tarifa[])
        const gastosArgTarifas = (data as any[]).filter((t:any) => t.tipo === 'argentina')
        if(gastosArgTarifas.length > 0) {
          setS(p => ({
            ...p,
            gastosArg: gastosArgTarifas.map((t:any) => ({
              id: Math.random().toString(36).slice(2),
              desc: t.ruta,
              tipoCalc: t.tipo_calculo || 'fijo_usd',
              moneda: t.moneda || 'USD',
              valor: t.valor || 0,
              pisoUsd: t.piso_usd || 0,
              techoUsd: t.techo_usd || 0,
              usd: 0,
              ars: 0,
            }))
          }))
        }
      }
    })
  },[])
  useEffect(()=>{loadTrib()},[s.regimen])
  useEffect(()=>{
    if(tarifas.length===0) return
    setS(p=>{
      const filasA = p.contenedores.map(c=>{
        const tarifa = tarifas.find(t=>t.tipo==='maritima' && t.tipo_contenedor===c.tipo)
        const precio = tarifa?.valor || 0
        const naviera = tarifa?.naviera || ''
        const existing = p.rowsA.find(r=>r.desc.includes(c.tipo))
        return {
          id: existing?.id || Math.random().toString(36).slice(2),
          desc: `Flete maritimo ${c.tipo}${naviera?' ('+naviera+')':''}`,
          cant: c.cantidad,
          unitario: existing?.unitario ?? precio,
          ivaChile: 'exento' as const,
          tipoCalc: 'fijo' as const
        }
      })
      const tarifaTerrestre = tarifas.find(t=>
        t.tipo==='terrestre' && t.ruta.toLowerCase().includes(p.destinoNoa.toLowerCase())
      ) || tarifas.find(t=>t.tipo==='terrestre')
      const precioTerrestre = tarifaTerrestre?.valor || 0
      const ncTotal = p.contenedores.reduce((s,c)=>s+c.cantidad,0) || 1
      const nuevoFtCamion = p.ftCamion === 0 ? precioTerrestre : p.ftCamion
      const nuevoNCamiones = p.nCamiones === 1 ? ncTotal : p.nCamiones
      return { ...p, rowsA: filasA, ftCamion: nuevoFtCamion, nCamiones: nuevoNCamiones }
    })
  },[s.contenedores, s.destinoNoa, tarifas])

  async function loadTrib(){
    const {data}=await supabase.from('tributos_config').select('*').eq('regimen',s.regimen).eq('aplica',true).order('orden')
    if(data){
      setTribCfg(data as TribCfg[])
      const der=(data as TribCfg[]).find(t=>t.codigo==='010')
      if(der)setS(p=>({...p,derPct:der.valor}))
    }
  }

  const u=<K extends keyof CotState>(k:K,v:CotState[K])=>setS(p=>({...p,[k]:v}))
  const nc=s.contenedores.reduce((t,c)=>t+c.cantidad,0)||1
  const totalFOB=s.productos.reduce((t,p)=>t+p.subtotal,0)+(s.incoterm==='EXW'?s.exwTransp+s.exwAgente+s.exwOtros:0)
  const subA=s.rowsA.reduce((t,r)=>t+r.cant*r.unitario,0)
  const seg=s.segModo==='pct'?(totalFOB+subA)*s.segVal/100:s.segVal
  const subC=s.rowsC.reduce((t,r)=>{const b=r.cant*r.unitario;return t+(r.ivaChile==='gravado'?b*1.19:b)},0)
  const totalM3=s.productos.reduce((t,p)=>t+p.vol_unit*p.cantidad,0)
  const volAlm=s.almModoVol==='auto'?totalM3:s.almVolM3
  const subAlm=s.optTransp==='A2'?volAlm*s.almCostoDia*s.almDias:0
  const subDescon=s.rowsDescon.reduce((t,r)=>t+(r.tipoCalc==='m3'?r.unitario*totalM3:r.cant*r.unitario),0)
  const subCarga=s.optTransp!=='B'?(s.cargaModo==='m3'?s.cargaValor*totalM3:s.cargaValor):0
  const subD=subDescon+subAlm+subCarga
  const subTransp=s.optTransp==='B'
    ?(()=>{const ida=s.ftIda*nc,dev=s.ftDev*nc,rt=s.ftRt*nc;return rt>0&&rt<(ida+dev)?rt:ida+dev})()
    :s.ftCamion*s.nCamiones
  const subE=s.rowsE.reduce((t,r)=>t+r.cant*r.unitario,0)
  const fee=s.feeCont*nc
  const cif=totalFOB+subA+seg
  const cifARS=cif*s.tcTrib

  const calcGastoArg = (g: GastoArg, cifUsd: number, tcTrib: number): number => {
    let usd = 0
    if(g.tipoCalc === 'pct_cif') {
      usd = cifUsd * g.valor / 100
      if(g.pisoUsd > 0 && usd < g.pisoUsd) usd = g.pisoUsd
      if(g.techoUsd > 0 && usd > g.techoUsd) usd = g.techoUsd
    } else if(g.tipoCalc === 'fijo_usd') {
      usd = g.valor
    } else {
      usd = g.valor / (tcTrib || 1)
    }
    return usd
  }
  const subGastosArg = s.gastosArg.reduce((t, g) => t + calcGastoArg(g, cif, s.tcTrib), 0)

  function calcTrib(cfg:TribCfg[],cifARS:number,derPct:number){
    const VA=cifARS; let base=VA
    return cfg.map(t=>{
      let imp=0
      if(t.codigo==='010'){imp=VA*derPct/100;base=VA+imp}
      else if(t.codigo==='011'){const e=VA*t.valor/100;imp=e;base+=e}
      else if(t.tipo==='fijo'){imp=t.valor}
      else{imp=base*t.valor/100}
      return {...t,imp}
    })
  }
  const tributos=calcTrib(tribCfg,cifARS,s.derPct)
  const totalTribARS=tributos.reduce((t,r)=>t+r.imp,0)
  const totalTribUSD=totalTribARS/s.tcTrib
  const totalLog=subA+seg+subC+subD+subTransp+subE+subGastosArg+fee
  const totalLanded=totalFOB+totalLog+totalTribUSD
  const cap=calcCapacidad(s.contenedores,s.productos)

  function aplicarCotNaviera(cotId: string) {
    const cot = cotNavieras.find((c:any) => c.id === cotId)
    if (!cot) return
    const opRef = (cot.operacion as any)?.cotizacion
    const label = cot.tipo === 'especifica' && opRef
      ? `Cotiz. especifica ${opRef.num} - ${cot.proveedor} - ${cot.fecha}`
      : `Cotiz. generica - ${cot.proveedor} - ${cot.fecha}`
    setS(p => {
      const filasA = p.contenedores.map(c => {
        const item = cot.items?.find((i:any) => i.tipo_servicio === 'maritima' && i.tipo_equipo === c.tipo)
          || cot.items?.find((i:any) => i.tipo_servicio === 'maritima')
        return {
          id: Math.random().toString(36).slice(2),
          desc: `${item?.descripcion || 'Flete maritimo'} ${c.tipo} - ${label}`,
          cant: c.cantidad,
          unitario: item?.valor || 0,
          ivaChile: 'exento' as const,
          tipoCalc: 'fijo' as const
        }
      })
      return { ...p, cotProvId: cotId, cotProvLabel: label, rowsA: filasA }
    })
  }

  function aplicarCotTransporte(cotId: string) {
    const cot = cotTransporte.find((c:any) => c.id === cotId)
    if (!cot) return
    const opRef = (cot.operacion as any)?.cotizacion
    const label = cot.tipo === 'especifica' && opRef
      ? `Cotiz. especifica ${opRef.num} - ${cot.proveedor} - ${cot.fecha}`
      : `Cotiz. generica - ${cot.proveedor} - ${cot.fecha}`
    const ncTotal = s.contenedores.reduce((t,c)=>t+c.cantidad,0)||1
    const item = cot.items?.find((i:any) =>
      i.tipo_servicio === 'terrestre' &&
      i.ruta_destino?.toLowerCase().includes(s.destinoNoa.toLowerCase())
    ) || cot.items?.find((i:any) => i.tipo_servicio === 'terrestre')
    setS(p => ({
      ...p,
      cotTranspId: cotId,
      cotTranspLabel: label,
      ftCamion: item?.valor || p.ftCamion,
      nCamiones: ncTotal,
    }))
  }

  function aplicarCotArgentina(cotId: string) {
    const cot = cotArgentina.find((c:any) => c.id === cotId)
    if (!cot) return
    const opRef = (cot.operacion as any)?.cotizacion
    const label = cot.tipo === 'especifica' && opRef
      ? `Cotiz. especifica ${opRef.num} - ${cot.proveedor} - ${cot.fecha}`
      : `Cotiz. generica - ${cot.proveedor} - ${cot.fecha}`
    const items = cot.items?.filter((i:any) => i.tipo_servicio === 'argentina') || []
    if (!items.length) return
    setS(p => ({
      ...p,
      cotArgId: cotId,
      cotArgLabel: label,
      gastosArg: items.map((i:any) => ({
        id: Math.random().toString(36).slice(2),
        desc: `${i.descripcion} - ${label}`,
        tipoCalc: (i.tipo_calculo||'fijo_usd') as 'pct_cif'|'fijo_usd'|'fijo_ars',
        moneda: (i.moneda||'USD') as 'USD'|'ARS',
        valor: i.valor||0,
        pisoUsd: i.piso_usd||0,
        techoUsd: i.techo_usd||0,
        usd: 0, ars: 0,
      }))
    }))
  }

  async function selectCliente(t: any) {
    u('cliente', t.razon_social)
    u('cuit', t.nro_doc || '')
    u('email', t.email || '')
    u('telefono', t.telefono || '')
    u('ivaCondicion', t.condicion_iva || 'Responsable Inscripto')
    setClienteSelId(t.id)
    setBuscarCliente(t.razon_social)
    setShowClienteDropdown(false)
    const {data} = await supabase.from('cotizaciones').select('id,num,estado,total_landed,created_at').eq('tercero_id', t.id).order('created_at',{ascending:false}).limit(5)
    if(data) setHistCliente(data)
    setShowHist(true)
  }

  async function duplicarCotizacion(cotId: string) {
    const {data: orig} = await supabase.from('cotizaciones').select('*').eq('id', cotId).single()
    if(!orig) return
    const {data: tcData} = await supabase.from('tipos_cambio_eventos').select('ars,clp').order('created_at',{ascending:false}).limit(1).single()
    const newState = {
      ...s,
      cliente: (orig as any).cliente,
      cuit: (orig as any).cuit || '',
      email: (orig as any).email_cliente || '',
      telefono: (orig as any).telefono_cliente || '',
      productos: (orig as any).productos || s.productos,
      contenedores: (orig as any).tipo_contenedores || s.contenedores,
      origen: (orig as any).origen || s.origen,
      ptoChile: (orig as any).puerto_chile || s.ptoChile,
      destinoNoa: (orig as any).destino_noa || s.destinoNoa,
      incoterm: (orig as any).incoterm || s.incoterm,
      transito: (orig as any).transito || s.transito,
      rowsA: (orig as any).presupuesto?.filter((p:any)=>p.etapa==='maritimo').map((p:any)=>({id:Math.random().toString(36).slice(2),desc:p.concepto,cant:1,unitario:p.usd,ivaChile:'exento' as const,tipoCalc:'fijo' as const})) || s.rowsA,
      tcTrib: (tcData as any)?.ars || s.tcTrib,
      tcClp: (tcData as any)?.clp || s.tcClp,
      notas: '',
    }
    setS(newState)
    setTab('embarque')
    alert('Cotizacion duplicada. Revisa los valores y guarda cuando este lista.')
  }

  function cargarSeccionA(){
    const mar=tarifas.filter(t=>(t.tipo as string)==='maritima')
    setS(p=>{
      const filasA = p.contenedores.map(c=>{
        const tarifa = mar.find(t=>t.tipo_contenedor===c.tipo)
        return {
          id: Math.random().toString(36).slice(2),
          desc: `Flete maritimo ${c.tipo}${tarifa?.naviera?' ('+tarifa.naviera+')':''}`,
          cant: c.cantidad,
          unitario: tarifa?.valor || 0,
          ivaChile: 'exento' as const,
          tipoCalc: 'fijo' as const
        }
      })
      return {...p, rowsA: filasA}
    })
  }

  function cargarSeccionC(){
    const pto=tarifas.filter(t=>(t.tipo as string)==='puerto')
    setS(p=>({...p,
      rowsC: pto.map(t=>({
        id: Math.random().toString(36).slice(2),
        desc: t.ruta,
        cant: p.contenedores.reduce((s,c)=>s+c.cantidad,0)||1,
        unitario: t.valor,
        ivaChile: (t.iva_chile||'exento') as 'exento'|'gravado',
        tipoCalc: 'fijo' as const
      }))
    }))
  }

  function cargarSeccionE(){
    const ter=tarifas.find(t=>(t.tipo as string)==='terrestre' && t.ruta.toLowerCase().includes(s.destinoNoa.toLowerCase()))
      || tarifas.find(t=>t.tipo==='terrestre')
    if(!ter) return
    const nc2=s.contenedores.reduce((t,c)=>t+c.cantidad,0)||1
    setS(p=>({...p, ftCamion: ter.valor, nCamiones: nc2}))
  }

  function cargarSeccionF(){
    const arg=tarifas.filter(t=>(t.tipo as string)==='argentina')
    if(!arg.length) return
    setS(p=>({...p,
      gastosArg: arg.map(t=>({
        id: Math.random().toString(36).slice(2),
        desc: t.ruta,
        tipoCalc: ((t as any).tipo_calculo||'fijo_usd') as 'pct_cif'|'fijo_usd'|'fijo_ars',
        moneda: ((t as any).moneda||'USD') as 'USD'|'ARS',
        valor: t.valor||0,
        pisoUsd: (t as any).piso_usd||0,
        techoUsd: (t as any).techo_usd||0,
        usd: 0, ars: 0
      }))
    }))
  }

  async function guardar(){
    if(!s.cliente){alert('Ingresa el nombre del cliente.');return}
    setSaving(true)
    try {
      const {data:cots}=await supabase.from('cotizaciones').select('num')
      const num=nextCotNum(cots||[])
      const {data:user}=await supabase.auth.getUser()
      if(!user.user){alert('Tu sesion expiro. Por favor ingresa nuevamente.');setSaving(false);return}
      const {data:uDB}=await supabase.from('usuarios').select('id').eq('auth_id',user.user.id).single()
      const uid=(uDB as any)?.id||''
      const presupuesto=[
        ...(subA>0?[{etapa:'maritimo',tipo:'flete',concepto:'Flete maritimo y cargos naviero',usd:subA}]:[]),
        ...(seg>0?[{etapa:'maritimo',tipo:'seguro',concepto:'Seguro mercaderia',usd:seg}]:[]),
        ...(subC>0?[{etapa:'chile',tipo:'servicios',concepto:'Gastos puerto Chile',usd:subC}]:[]),
        ...(subD>0?[{etapa:'chile',tipo:'desconsolidacion',concepto:`Desconsolidacion (Opcion ${s.optTransp})`,usd:subD}]:[]),
        ...(subTransp>0?[{etapa:'terrestre',tipo:'flete',concepto:'Transporte terrestre',usd:subTransp}]:[]),
        ...(subE>0?[{etapa:'argentina',tipo:'servicios',concepto:'Gastos Argentina',usd:subE}]:[]),
        ...(subGastosArg>0?[{etapa:'argentina',tipo:'gastos_arg',concepto:'Gastos Argentina (despachante y otros)',usd:subGastosArg}]:[]),
        ...(totalTribUSD>0?[{etapa:'tributos',tipo:'tributos',concepto:`Tributos ARCA Regimen ${s.regimen}`,usd:totalTribUSD}]:[]),
        ...(fee>0?[{etapa:'fee',tipo:'fee',concepto:'Fee Puerto NOA',usd:fee}]:[]),
      ]
      const {error}=await (supabase.from('cotizaciones') as any).insert({
        num,version:1,
        cliente:s.cliente,cuit:s.cuit,email_cliente:s.email,telefono_cliente:s.telefono,
        tercero_id: clienteSelId || null,
        origen:s.origen,puerto_chile:s.ptoChile,destino_noa:s.destinoNoa,incoterm:s.incoterm,
        transito:s.transito,ref_naviero:s.refNaviero,notas:s.notas,
        tipo_contenedores:s.contenedores,productos:s.productos,
        proformas:s.proformas,
        total_fob:totalFOB,total_logistico:totalLog,
        total_tributos_usd:totalTribUSD,total_tributos_ars:totalTribARS,
        total_landed:totalLanded,precio_arg_equiv:s.precioArgEquiv||null,
        regimen:s.regimen,tc_ars:s.tcTrib,derechos_pct:s.derPct,
        opcion_transporte:s.optTransp,validez:s.validez,estado:'borrador',
        ejecutivo_id:uid,creado_por:uid,modificado_por:uid,presupuesto,
      })
      if(error){
        console.error('Error guardando:', error)
        alert('Error al guardar: '+error.message)
        setSaving(false)
        return
      }
      router.push('/registro')
    } catch(e:any){
      console.error('Error inesperado:', e)
      alert('Error inesperado: '+e.message)
      setSaving(false)
    }
  }

  const clientesFiltrados = terceros.filter(t=>
    t.razon_social.toLowerCase().includes((buscarCliente||s.cliente).toLowerCase()) ||
    (t.nro_doc||'').includes(buscarCliente||s.cliente) ||
    (t.nombre_fantasia||'').toLowerCase().includes((buscarCliente||s.cliente).toLowerCase())
  ).slice(0,8)

  const TABS=[{key:'embarque',label:'Embarque'},{key:'logistica',label:'Logistica'},{key:'tributos',label:'Tributos ARCA'},{key:'resumen',label:'Resumen'}] as const

  return (
    <div className="p-6 bg-gray-50 min-h-screen" onClick={()=>setShowClienteDropdown(false)}>
      <div className="mb-5 flex items-center gap-4">
        <div className="bg-white border border-gray-100 rounded-2xl px-4 py-2.5 shadow-sm">
          <Image src="/logo.png" alt="Puertonoa" width={130} height={38} style={{objectFit:'contain'}}/>
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Nueva cotizacion</h1>
          <p className="text-xs text-gray-400 mt-0.5">Modulo 1 — Cotizador logistico China - NOA</p>
        </div>
      </div>

      <div className="flex gap-2 mb-5 flex-wrap items-center">
        {TABS.map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key as Tab)} className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all shadow-sm ${tab===t.key?'bg-[#1168F8] text-white shadow-md':'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{t.label}</button>
        ))}
        <div className="ml-auto flex items-center gap-2 text-[10px] text-gray-400">
          <Image src="/logo.png" alt="Puertonoa" width={80} height={22} style={{objectFit:'contain',opacity:0.6}}/>
        </div>
      </div>

      {tab==='embarque'&&(
        <div className="space-y-4">
          <Card title="Cliente y operacion">
            <div className="grid grid-cols-4 gap-3 mb-3">
              <div className="col-span-2">
                <Field label="Razon social">
                  <div className="relative">
                    <input
                      value={buscarCliente||s.cliente}
                      onChange={e=>{
                        setBuscarCliente(e.target.value)
                        u('cliente',e.target.value)
                        setShowClienteDropdown(e.target.value.length>0)
                        if(!e.target.value){setClienteSelId(null);setShowHist(false)}
                      }}
                      onFocus={()=>setShowClienteDropdown(true)}
                      onClick={e=>e.stopPropagation()}
                      className={inp} placeholder="Buscar o escribir razon social..."/>
                    {showClienteDropdown && (
                      <div className="absolute z-50 top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl max-h-52 overflow-y-auto mt-1" onClick={e=>e.stopPropagation()}>
                        {clientesFiltrados.length > 0 ? clientesFiltrados.map(t=>(
                          <button key={t.id} onMouseDown={()=>selectCliente(t)}
                            className="w-full text-left px-4 py-2.5 hover:bg-[#EBF2FF] transition-colors border-b border-gray-50 last:border-0">
                            <div className="font-semibold text-sm text-gray-900">{t.razon_social}</div>
                            <div className="text-[10px] text-gray-400 flex gap-2 mt-0.5">
                              {t.nro_doc&&<span className="font-mono">{t.tipo_doc}: {t.nro_doc}</span>}
                              {t.dir_fiscal_ciudad&&<span>{t.dir_fiscal_ciudad}, {t.pais}</span>}
                            </div>
                          </button>
                        )) : (
                          <div className="px-4 py-3 text-xs text-gray-400">
                            {terceros.length === 0 ? 'Cargando clientes...' : 'No encontrado — se cargara como nuevo cliente al guardar'}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </Field>
                {showHist && histCliente.length>0 && (
                  <div className="mt-2 bg-[#EBF2FF] border border-[#93B8FC] rounded-xl p-3">
                    <div className="text-[10px] font-bold text-[#052698] mb-2">Cotizaciones anteriores de este cliente</div>
                    <div className="space-y-1">
                      {histCliente.map(c=>(
                        <div key={c.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-1.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] font-bold text-[#1168F8]">{c.num}</span>
                            <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${c.estado==='aceptada'?'bg-green-50 text-green-700':c.estado==='enviada'?'bg-blue-50 text-[#1168F8]':'bg-gray-100 text-gray-500'}`}>{c.estado}</span>
                            <span className="text-[10px] text-gray-400">{c.created_at?.slice(0,10)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-gray-700">USD {Math.round(c.total_landed||0).toLocaleString('es-AR')}</span>
                            <button onMouseDown={()=>duplicarCotizacion(c.id)} className="px-2 py-0.5 bg-[#1168F8] text-white rounded text-[9px] font-bold hover:bg-[#052698] transition-colors">Duplicar</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <Field label="CUIT"><input value={s.cuit} onChange={e=>u('cuit',e.target.value)} className={inp} placeholder="XX-XXXXXXXX-X"/></Field>
              <Field label="Telefono"><input value={s.telefono} onChange={e=>u('telefono',e.target.value)} className={inp} placeholder="+54 9 388..."/></Field>
            </div>
            <div className="grid grid-cols-4 gap-3 mb-3">
              <div className="col-span-2"><Field label="Email"><input type="email" value={s.email} onChange={e=>u('email',e.target.value)} className={inp} placeholder="correo@empresa.com"/></Field></div>
              <Field label="Despachante de aduana"><input value={s.despachante} onChange={e=>u('despachante',e.target.value)} className={inp} placeholder="Nombre / CUIT"/></Field>
              <Field label="Condicion IVA"><select value={s.ivaCondicion} onChange={e=>u('ivaCondicion',e.target.value)} className={sel}>{['Responsable Inscripto','Monotributista','Exento','Consumidor Final'].map(v=><option key={v}>{v}</option>)}</select></Field>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <Field label="Validez oferta"><select value={s.validez} onChange={e=>u('validez',e.target.value)} className={sel}><option value="">Sin especificar</option><option value="15 dias">15 dias</option><option value="30 dias">30 dias</option><option value="45 dias">45 dias</option></select></Field>
              <div className="col-span-3"><Field label="Notas internas"><input value={s.notas} onChange={e=>u('notas',e.target.value)} className={inp} placeholder="Observaciones"/></Field></div>
            </div>
          </Card>

          <Card title="Ruta del embarque">
            <div className="grid grid-cols-4 gap-3 mb-3">
              <Field label="Origen"><input value={s.origen} onChange={e=>u('origen',e.target.value)} className={inp}/></Field>
              <Field label="Puerto Chile"><select value={s.ptoChile} onChange={e=>u('ptoChile',e.target.value)} className={sel}>{Object.entries(PUERTOS_L).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field>
              <Field label="Destino NOA"><select value={s.destinoNoa} onChange={e=>u('destinoNoa',e.target.value)} className={sel}>{['Jujuy','Salta','Tucuman','Catamarca','La Rioja'].map(v=><option key={v}>{v}</option>)}</select></Field>
              <Field label="Incoterm"><select value={s.incoterm} onChange={e=>u('incoterm',e.target.value)} className={sel}>{['FOB','EXW','CIF','CFR'].map(v=><option key={v}>{v}</option>)}</select></Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Transito estimado"><input value={s.transito} onChange={e=>u('transito',e.target.value)} className={inp}/></Field>
              <Field label="Cotizacion naviero">
                {cotNavieras.length > 0 ? (
                  <div className="space-y-1.5">
                    <select value={s.cotProvId} onChange={e => { if (e.target.value === '__manual__') { u('cotProvId', '') } else if (e.target.value) { aplicarCotNaviera(e.target.value) } else { u('cotProvId', '') } }} className={sel}>
                      <option value="">— Seleccionar cotizacion —</option>
                      {cotNavieras.filter((c:any)=>c.tipo==='especifica').length>0 && (
                        <optgroup label="Especificas para esta operacion">
                          {cotNavieras.filter((c:any)=>c.tipo==='especifica').map((c:any)=>{
                            const op=(c.operacion as any)?.cotizacion
                            return <option key={c.id} value={c.id}>{c.proveedor} - {c.fecha}{op?` - ${op.num}`:''}</option>
                          })}
                        </optgroup>
                      )}
                      <optgroup label="Genericas vigentes">
                        {cotNavieras.filter((c:any)=>c.tipo==='generica').map((c:any)=>(
                          <option key={c.id} value={c.id}>{c.proveedor} - {c.referencia||c.fecha}</option>
                        ))}
                      </optgroup>
                      <option value="__manual__">Ingresar manualmente</option>
                    </select>
                    {(!s.cotProvId || s.cotProvId === '__manual__') && (
                      <input value={s.refNaviero} onChange={e=>u('refNaviero',e.target.value)} className={inp} placeholder="ej. Q-AR-DR... (Hellmann)"/>
                    )}
                    {s.cotProvId && s.cotProvId !== '__manual__' && (
                      <div className="text-[10px] text-[#1168F8] bg-[#EBF2FF] px-2.5 py-1.5 rounded-lg">OK {s.cotProvLabel} — precios cargados en seccion A</div>
                    )}
                  </div>
                ) : (
                  <input value={s.refNaviero} onChange={e=>u('refNaviero',e.target.value)} className={inp} placeholder="ej. Q-AR-DR... (Hellmann)"/>
                )}
              </Field>
            </div>
          </Card>

          <Card title="Contenedores">
            <div className="flex flex-wrap gap-2 items-center mb-3">
              {s.contenedores.map((c,i)=>(
                <div key={i} className="flex items-center gap-2 bg-[#EBF2FF] border border-[#93B8FC] rounded-lg px-3 py-2">
                  <select value={c.tipo} onChange={e=>{const n=[...s.contenedores];n[i]={...n[i],tipo:e.target.value};u('contenedores',n)}} className="border-0 bg-transparent text-xs font-semibold text-[#1168F8] focus:outline-none">
                    {Object.keys(CONT_CAPS).map(k=><option key={k}>{k}</option>)}
                  </select>
                  <span className="text-[#93B8FC] text-xs">x</span>
                  <input type="text" inputMode="decimal" value={c.cantidad} min={1} onFocus={e=>e.target.select()} onChange={e=>{const n=[...s.contenedores];n[i]={...n[i],cantidad:parseInt2(e.target.value)||1};u('contenedores',n)}} className="w-10 text-center text-xs border-0 bg-transparent focus:outline-none font-bold text-[#052698]"/>
                  {s.contenedores.length>1&&<button onClick={()=>u('contenedores',s.contenedores.filter((_,j)=>j!==i))} className="text-[#93B8FC] hover:text-red-400 text-xs">X</button>}
                </div>
              ))}
              <button onClick={()=>u('contenedores',[...s.contenedores,{tipo:'40HC',cantidad:1}])} className="text-xs text-[#1168F8] hover:underline px-2">+ Agregar tipo</button>
            </div>
            <div className="text-xs text-gray-500">Total: <strong className="text-gray-800">{nc} contenedor(es)</strong> - {s.contenedores.map(c=>`${c.cantidad}x ${c.tipo}`).join(', ')}</div>
          </Card>

          <Card title="Productos de China">
            <div className="overflow-x-auto">
              <table className="w-full text-xs mb-2">
                <thead><tr className="bg-gray-50">{['Descripcion','NCM','Cant.','Precio unit. USD','Subtotal','Peso kg/u','Vol m3/u','Incoterm',''].map(h=><th key={h} className="text-left px-2 py-2 text-[10px] text-gray-400 font-medium uppercase tracking-wide whitespace-nowrap">{h}</th>)}</tr></thead>
                <tbody>
                  {s.productos.map((p,i)=>(
                    <tr key={i} className="border-b border-gray-50">
                      <td className="px-2 py-1.5"><input value={p.descripcion} onChange={e=>{const n=[...s.productos];n[i]={...n[i],descripcion:e.target.value};u('productos',n)}} className={inp} placeholder="Producto"/></td>
                      <td className="px-2 py-1.5"><input value={p.ncm} onChange={e=>{const n=[...s.productos];n[i]={...n[i],ncm:e.target.value};u('productos',n)}} className={inp} placeholder="0000.00.00"/></td>
                      <td className="px-2 py-1.5"><input type="text" inputMode="decimal" value={p.cantidad} onFocus={e=>e.target.select()} min={0} onChange={e=>{const n=[...s.productos];const q=parseNum(e.target.value);n[i]={...n[i],cantidad:q,subtotal:q*n[i].precio_unit};u('productos',n)}} className={inp+' text-right w-16'}/></td>
                      <td className="px-2 py-1.5"><input type="text" inputMode="decimal" value={p.precio_unit} onFocus={e=>e.target.select()} min={0} step={0.01} onChange={e=>{const n=[...s.productos];const pu=parseNum(e.target.value);n[i]={...n[i],precio_unit:pu,subtotal:pu*n[i].cantidad};u('productos',n)}} className={inp+' text-right w-24'}/></td>
                      <td className="px-2 py-1.5"><div className="px-2 py-1 bg-[#EBF2FF] border border-[#93B8FC] rounded font-mono text-[11px] text-right w-24 text-[#052698]">{fmt(p.subtotal)}</div></td>
                      <td className="px-2 py-1.5"><input type="text" inputMode="decimal" value={p.peso_unit} onFocus={e=>e.target.select()} min={0} onChange={e=>{const n=[...s.productos];n[i]={...n[i],peso_unit:parseNum(e.target.value)};u('productos',n)}} className={inp+' text-right w-20'}/></td>
                      <td className="px-2 py-1.5"><input type="text" inputMode="decimal" value={p.vol_unit} onFocus={e=>e.target.select()} min={0} step={0.001} onChange={e=>{const n=[...s.productos];n[i]={...n[i],vol_unit:parseNum(e.target.value)};u('productos',n)}} className={inp+' text-right w-20'}/></td>
                      <td className="px-2 py-1.5"><select value={p.incoterm} onChange={e=>{const n=[...s.productos];n[i]={...n[i],incoterm:e.target.value};u('productos',n)}} className={sel+' w-20'}>{['FOB','EXW','CIF'].map(v=><option key={v}>{v}</option>)}</select></td>
                      <td className="px-2 py-1.5"><button onClick={()=>u('productos',s.productos.filter((_,j)=>j!==i))} className="text-gray-400 hover:text-red-500 text-xs">X</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={()=>u('productos',[...s.productos,{descripcion:'',ncm:'',cantidad:1,precio_unit:0,subtotal:0,peso_unit:0,vol_unit:0,incoterm:s.incoterm,proformaId:''}])} className="text-xs text-[#1168F8] hover:underline">+ Agregar producto</button>
            <div className="grid grid-cols-4 gap-3 mt-4">
              {[{label:'Total FOB/EXW (USD)',value:`USD ${fmt(totalFOB)}`},{label:'Peso total',value:`${fmt(cap.totalKg,0)} kg`},{label:'Volumen total',value:`${fmt(cap.totalM3,2)} m3`},{label:'Productos',value:String(s.productos.length)}].map(it=>(
                <div key={it.label} className="bg-gray-50 border border-gray-100 rounded-lg p-3"><div className="text-[10px] text-gray-400 mb-1">{it.label}</div><div className="font-semibold text-sm text-gray-800">{it.value}</div></div>
              ))}
            </div>
            {nc>0&&(cap.totalKg>0||cap.totalM3>0)&&(
              <div className="grid grid-cols-3 gap-3 mt-3">
                {[{label:'PESO',pct:cap.pctKg,curr:fmt(cap.totalKg,0)+' kg',max:fmt(cap.capKg,0)+' kg'},{label:'VOLUMEN',pct:cap.pctM3,curr:fmt(cap.totalM3,2)+' m3',max:fmt(cap.capM3,1)+' m3'}].map(it=>{
                  const st=it.pct>100?'bg-red-50 border-red-200 text-red-700':it.pct>85?'bg-amber-50 border-amber-200 text-amber-700':'bg-green-50 border-green-200 text-green-700'
                  const bc=it.pct>100?'#A32D2D':it.pct>85?'#EF9F27':'#1168F8'
                  return <div key={it.label} className={`border rounded-lg p-3 ${st}`}><div className="text-[9px] font-bold uppercase tracking-wider mb-1">{it.label}</div><div className="text-xl font-semibold">{fmt(it.pct,1)}%</div><div className="text-[10px] mt-1 opacity-80">{it.curr} de {it.max}</div><div className="h-1.5 bg-white/50 rounded-full overflow-hidden mt-2"><div className="h-full rounded-full" style={{width:`${Math.min(it.pct,100)}%`,background:bc}}/></div></div>
                })}
                <div className="bg-[#EBF2FF] border border-[#93B8FC] rounded-lg p-3"><div className="text-[9px] font-bold uppercase tracking-wider text-[#052698] mb-1">CONTENEDORES</div><div className="text-xl font-semibold text-[#1168F8]">{nc}</div><div className="text-[10px] text-[#1168F8] mt-1">{s.contenedores.map(c=>`${c.cantidad}x ${c.tipo}`).join(', ')}</div></div>
              </div>
            )}
            {s.incoterm==='EXW'&&(
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="text-xs font-medium text-gray-700 mb-3">Puesta a FOB (precio EXW)</div>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Transporte interno China (USD)"><input type="text" inputMode="decimal" onFocus={e=>e.target.select()} value={s.exwTransp} onChange={e=>u('exwTransp',parseNum(e.target.value))} className={inp}/></Field>
                  <Field label="Agente exportacion (USD)"><input type="text" inputMode="decimal" onFocus={e=>e.target.select()} value={s.exwAgente} onChange={e=>u('exwAgente',parseNum(e.target.value))} className={inp}/></Field>
                  <Field label="Otros gastos origen (USD)"><input type="text" inputMode="decimal" onFocus={e=>e.target.select()} value={s.exwOtros} onChange={e=>u('exwOtros',parseNum(e.target.value))} className={inp}/></Field>
                </div>
              </div>
            )}
            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-medium text-gray-700">Proformas del proveedor</div>
                <button onClick={()=>u('proformas',[...s.proformas,{id:Math.random().toString(36).slice(2),numero:'',proveedor:'',fecha:new Date().toISOString().slice(0,10)}])} className="text-xs text-[#1168F8] hover:underline">+ Agregar proforma</button>
              </div>
              {s.proformas.length===0 ? (
                <div className="text-[10px] text-gray-400 bg-gray-50 rounded-lg px-3 py-2">Sin proformas adjuntas.</div>
              ) : (
                <div className="space-y-2">
                  {s.proformas.map((pf,pi)=>(
                    <div key={pf.id} className="flex items-center gap-2 p-3 bg-[#EBF2FF] border border-[#93B8FC] rounded-lg">
                      <div className="grid grid-cols-3 gap-2 flex-1">
                        <input value={pf.numero} onChange={e=>{const n=[...s.proformas];n[pi]={...n[pi],numero:e.target.value};u('proformas',n)}} className="px-2 py-1 border border-[#93B8FC] rounded text-xs focus:outline-none focus:border-[#1168F8] bg-white" placeholder="N proforma"/>
                        <input value={pf.proveedor} onChange={e=>{const n=[...s.proformas];n[pi]={...n[pi],proveedor:e.target.value};u('proformas',n)}} className="px-2 py-1 border border-[#93B8FC] rounded text-xs focus:outline-none focus:border-[#1168F8] bg-white" placeholder="Proveedor chino"/>
                        <input type="date" value={pf.fecha} onChange={e=>{const n=[...s.proformas];n[pi]={...n[pi],fecha:e.target.value};u('proformas',n)}} className="px-2 py-1 border border-[#93B8FC] rounded text-xs focus:outline-none focus:border-[#1168F8] bg-white"/>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {pf.archivo_url ? (
                          <a href={pf.archivo_url} target="_blank" rel="noreferrer" className="px-2 py-1 bg-white text-[#1168F8] rounded text-[10px] border border-[#93B8FC] hover:bg-[#93B8FC] transition-colors">Ver</a>
                        ) : (
                          <label className="px-2 py-1 border border-dashed border-[#93B8FC] rounded text-[10px] text-[#1168F8] hover:bg-white cursor-pointer transition-colors">
                            PDF
                            <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={async e=>{
                              const f=e.target.files?.[0]; if(!f) return
                              const { data:auth } = await createClient().auth.getUser()
                              if(!auth.user) return
                              const ext=f.name.split('.').pop()
                              const path=`proformas/${pf.id}.${ext}`
                              const sb=createClient()
                              await sb.storage.from('comprobantes').upload(path,f,{upsert:true})
                              const {data:urlData}=sb.storage.from('comprobantes').getPublicUrl(path)
                              if(urlData?.publicUrl){const n=[...s.proformas];n[pi]={...n[pi],archivo_url:urlData.publicUrl,archivo_nombre:f.name};u('proformas',n)}
                            }}/>
                          </label>
                        )}
                        <button onClick={()=>u('proformas',s.proformas.filter((_,j)=>j!==pi))} className="text-[#93B8FC] hover:text-red-500 text-xs transition-colors">X</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {s.proformas.length>0&&s.productos.some(p=>p.subtotal>0)&&(
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="text-[10px] font-medium text-gray-500 mb-2">Referencia de proforma por producto</div>
                  <div className="space-y-1">
                    {s.productos.filter(p=>p.descripcion).map((p,pi)=>(
                      <div key={pi} className="flex items-center gap-2 text-xs">
                        <span className="text-gray-600 flex-1 truncate">{p.descripcion||`Producto ${pi+1}`}</span>
                        <select value={(p as any).proformaId||''} onChange={e=>{const n=[...s.productos];(n[pi] as any).proformaId=e.target.value;u('productos',n)}} className="px-2 py-1 border border-gray-200 rounded text-[10px] focus:outline-none focus:border-[#1168F8] bg-white">
                          <option value="">Sin proforma asignada</option>
                          {s.proformas.map(pf=>(<option key={pf.id} value={pf.id}>{pf.numero||'Sin numero'} - {pf.proveedor} - {pf.fecha}</option>))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100">
              <Field label="Precio equivalente en Argentina (USD)"><input type="text" inputMode="decimal" onFocus={e=>e.target.select()} value={s.precioArgEquiv||''} onChange={e=>u('precioArgEquiv',parseNum(e.target.value))} className={inp} placeholder="0.00"/></Field>
            </div>
          </Card>
          <div className="flex justify-end"><button onClick={()=>setTab('logistica')} className="bg-[#1168F8] text-white px-5 py-2 rounded-lg text-xs font-medium hover:bg-[#0a4fc4] transition-colors">Logistica</button></div>
        </div>
      )}

      {tab==='logistica'&&(
        <div className="space-y-4">
          <div className="flex gap-4 items-center px-4 py-2.5 bg-white border border-gray-100 rounded-xl text-xs flex-wrap">
            <span className="font-medium text-gray-700">Tipos de cambio:</span>
            <div className="flex items-center gap-2"><label className="text-gray-500">USD/ARS</label><input type="text" inputMode="decimal" onFocus={e=>e.target.select()} value={s.tcTrib} onChange={e=>u('tcTrib',parseNum(e.target.value)||1000)} className="w-20 px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8]"/></div>
            <div className="flex items-center gap-2"><label className="text-gray-500">USD/CLP</label><input type="text" inputMode="decimal" onFocus={e=>e.target.select()} value={s.tcClp} onChange={e=>u('tcClp',parseNum(e.target.value)||950)} className="w-20 px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8]"/></div>
          </div>

          <SecCard letter="A" label="Flete maritimo internacional" sub="China - Puerto Chile" sub2={subA} loadBtn={<button onClick={cargarSeccionA} className="text-[10px] text-[#1168F8] hover:underline">Cargar tarifa base</button>}>
            <LogRows rows={s.rowsA} onChange={r=>u('rowsA',r)}/>
          </SecCard>

          <SecCard letter="B" label="Seguro de la mercaderia" sub2={seg}>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Modalidad"><select value={s.segModo} onChange={e=>u('segModo',e.target.value as any)} className={sel}><option value="pct">% sobre FOB + flete</option><option value="fijo">Monto fijo (USD)</option></select></Field>
              <Field label={s.segModo==='pct'?'Tasa seguro (%)':'Monto fijo (USD)'}><input type="text" inputMode="decimal" onFocus={e=>e.target.select()} value={s.segVal} step={0.1} onChange={e=>u('segVal',parseNum(e.target.value))} className={inp}/></Field>
              <Field label="Seguro calculado"><div className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-right font-mono">USD {fmt(seg)}</div></Field>
            </div>
          </SecCard>

          <SecCard letter="C" label="Gastos en puerto Chile" sub="THC, handling" sub2={subC} loadBtn={<button onClick={cargarSeccionC} className="text-[10px] text-[#1168F8] hover:underline">Cargar tarifa base</button>}>
            <LogRows rows={s.rowsC} onChange={r=>u('rowsC',r)} withIva/>
          </SecCard>

          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#1168F8] text-white text-[10px] font-bold">D</span>
              <span className="font-medium text-sm text-gray-900">Modalidad de transporte desde Chile</span>
            </div>
            <div className="px-5 py-4">
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[{key:'A1',label:'Opcion A1',sub:'Desconsolidar + cargar directo al camion'},{key:'A2',label:'Opcion A2',sub:'Desconsolidar + almacenar + cargar al camion'},{key:'B',label:'Opcion B',sub:'Contenedor completo hasta Argentina'}].map(o=>(
                  <button key={o.key} onClick={()=>u('optTransp',o.key as OptTransp)} className={`px-3 py-2.5 rounded-lg border text-left transition-colors ${s.optTransp===o.key?'border-[#1168F8] bg-[#EBF2FF] text-[#052698]':'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    <div className="text-xs font-semibold">{o.label}</div><div className="text-[10px] opacity-70 mt-0.5">{o.sub}</div>
                  </button>
                ))}
              </div>
              {s.optTransp!=='B'&&(
                <div className="space-y-4">
                  <div>
                    <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Gastos de desconsolidacion</div>
                    <DesconRows rows={s.rowsDescon} onChange={r=>u('rowsDescon',r)} totalM3={totalM3}/>
                    {subDescon>0&&<div className="text-right text-xs text-gray-500 mt-1">Subtotal: <strong className="font-mono">USD {fmt(subDescon)}</strong></div>}
                  </div>
                  {s.optTransp==='A2'&&(
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <div className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider mb-3">Almacenaje en Chile</div>
                      <div className="grid grid-cols-4 gap-3 mb-3">
                        <Field label="Volumen a almacenar">
                          <div className="flex gap-1">
                            <select value={s.almModoVol} onChange={e=>u('almModoVol',e.target.value as any)} className={sel+' flex-shrink-0 w-20'}><option value="auto">Auto</option><option value="manual">Manual</option></select>
                            {s.almModoVol==='manual'?<input type="text" inputMode="decimal" onFocus={e=>e.target.select()} value={s.almVolM3} step={0.1} onChange={e=>u('almVolM3',parseNum(e.target.value))} className={inp} placeholder="m3"/>:<div className="px-2.5 py-1.5 bg-white border border-amber-200 rounded-lg text-xs font-mono flex-1 text-right">{fmt(totalM3,2)} m3</div>}
                          </div>
                        </Field>
                        <Field label="Costo por m3/dia (USD)"><input type="text" inputMode="decimal" onFocus={e=>e.target.select()} value={s.almCostoDia} step={0.01} onChange={e=>u('almCostoDia',parseNum(e.target.value))} className={inp}/></Field>
                        <Field label="Dias estimados"><input type="text" inputMode="decimal" onFocus={e=>e.target.select()} value={s.almDias} min={1} onChange={e=>u('almDias',parseInt2(e.target.value)||0)} className={inp}/></Field>
                        <Field label="Subtotal almacenaje"><div className="px-2.5 py-1.5 bg-white border border-amber-200 rounded-lg text-xs font-mono text-right font-semibold text-amber-800">USD {fmt(subAlm)}</div></Field>
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Carga al camion</div>
                    <div className="grid grid-cols-4 gap-3">
                      <Field label="Modalidad calculo"><select value={s.cargaModo} onChange={e=>u('cargaModo',e.target.value as any)} className={sel}><option value="fijo">Importe fijo (USD)</option><option value="m3">Por m3 (USD/m3)</option></select></Field>
                      <Field label={s.cargaModo==='fijo'?'Importe fijo (USD)':'USD por m3'}><input type="text" inputMode="decimal" onFocus={e=>e.target.select()} value={s.cargaValor} step={0.01} onChange={e=>u('cargaValor',parseNum(e.target.value))} className={inp}/></Field>
                      {s.cargaModo==='m3'&&<Field label="m3 totales"><div className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono text-right">{fmt(totalM3,2)}</div></Field>}
                      <Field label="Subtotal carga"><div className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono text-right font-semibold">USD {fmt(subCarga)}</div></Field>
                    </div>
                  </div>
                  <div className="flex justify-end items-center gap-2 pt-2 border-t border-gray-100 text-xs text-gray-500">
                    Subtotal seccion D: <span className="font-mono font-semibold text-gray-800">USD {fmt(subD)}</span>
                  </div>
                </div>
              )}
              {s.optTransp==='B'&&(
                <div>
                  <div className="grid grid-cols-4 gap-3">
                    <Field label="Flete ida (USD/cont)"><input type="text" inputMode="decimal" onFocus={e=>e.target.select()} value={s.ftIda} onChange={e=>u('ftIda',parseNum(e.target.value))} className={inp}/></Field>
                    <Field label="Devolucion (USD/cont)"><input type="text" inputMode="decimal" onFocus={e=>e.target.select()} value={s.ftDev} onChange={e=>u('ftDev',parseNum(e.target.value))} className={inp}/></Field>
                    <Field label="Round trip disponible (USD/cont)"><input type="text" inputMode="decimal" onFocus={e=>e.target.select()} value={s.ftRt} onChange={e=>u('ftRt',parseNum(e.target.value))} className={inp} placeholder="0 = no disponible"/></Field>
                    <Field label="Elegido (USD total)"><div className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono text-right">USD {fmt(subTransp)}</div></Field>
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end items-center gap-2 px-5 py-2.5 bg-gray-50 border-t border-gray-100 text-xs text-gray-500">
              Subtotal seccion D: <strong className="font-mono text-gray-800">USD {fmt(s.optTransp==='B'?0:subD)}</strong>
            </div>
          </div>

          <SecCard letter="E" label="Transporte terrestre Chile - NOA" sub2={subTransp} loadBtn={s.optTransp!=='B'?<button onClick={cargarSeccionE} className="text-[10px] text-[#1168F8] hover:underline">Cargar tarifa base</button>:undefined}>
            {s.optTransp!=='B'?(
              <div>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <Field label="Flete terrestre (USD/camion)"><input type="text" inputMode="decimal" onFocus={e=>e.target.select()} value={s.ftCamion} onChange={e=>u('ftCamion',parseNum(e.target.value))} className={inp}/></Field>
                  <Field label="N camiones"><input type="text" inputMode="decimal" onFocus={e=>e.target.select()} value={s.nCamiones} min={1} onChange={e=>u('nCamiones',parseInt2(e.target.value)||1)} className={inp}/></Field>
                  <Field label="Subtotal transporte"><div className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono text-right">USD {fmt(subTransp)}</div></Field>
                </div>
              </div>
            ):(
              <div>
                <div className="bg-[#EBF2FF] border border-[#93B8FC] rounded-lg px-4 py-2.5 text-xs text-[#052698]">Flete elegido: <strong className="font-mono">USD {fmt(subTransp)}</strong></div>
              </div>
            )}
          </SecCard>

          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#1168F8] text-white text-[10px] font-bold">F</span>
              <span className="font-medium text-sm text-gray-900">Gastos en Argentina</span>
              <div className="ml-auto flex items-center gap-2">
                {cotArgentina.length>0&&(
                  <select value={s.cotArgId} onChange={e=>e.target.value?aplicarCotArgentina(e.target.value):u('cotArgId','')} className="px-2 py-1 border border-gray-200 rounded-lg text-[10px] bg-white focus:outline-none focus:border-[#1168F8]">
                    <option value="">— Cotizacion proveedor —</option>
                    {cotArgentina.filter((c:any)=>c.tipo==='especifica').length>0&&(
                      <optgroup label="Especificas">
                        {cotArgentina.filter((c:any)=>c.tipo==='especifica').map((c:any)=>{
                          const op=(c.operacion as any)?.cotizacion
                          return <option key={c.id} value={c.id}>{c.proveedor} - {c.fecha}{op?` - ${op.num}`:''}</option>
                        })}
                      </optgroup>
                    )}
                    <optgroup label="Genericas">
                      {cotArgentina.filter((c:any)=>c.tipo==='generica').map((c:any)=>(<option key={c.id} value={c.id}>{c.proveedor} - {c.referencia||c.fecha}</option>))}
                    </optgroup>
                  </select>
                )}
                <button onClick={cargarSeccionF} className="text-[10px] text-[#1168F8] hover:underline">Tarifa base</button>
              </div>
            </div>
            <div className="px-5 py-4">
              {s.cotArgId&&<div className="text-[10px] text-[#1168F8] bg-[#EBF2FF] px-2.5 py-1.5 rounded-lg mb-3">OK {s.cotArgLabel}</div>}
              {s.gastosArg.length > 0 && (
                <div className="mb-4">
                  <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Gastos pre-configurados</div>
                  {s.gastosArg.map((g,i)=>{
                    const usd = calcGastoArg(g, cif, s.tcTrib)
                    const arsEquiv = usd * s.tcTrib
                    return (
                      <div key={g.id} className="mb-2 p-3 bg-gray-50 rounded-lg border border-gray-100">
                        <div style={{display:'grid',gridTemplateColumns:'1fr 110px 90px 90px 90px',gap:'6px',alignItems:'center'}} className="mb-2">
                          <input type="text" value={g.desc} onChange={e=>{const n=[...s.gastosArg];n[i]={...n[i],desc:e.target.value};u('gastosArg',n)}} className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8] bg-white" placeholder="Concepto"/>
                          <select value={g.tipoCalc} onChange={e=>{const n=[...s.gastosArg];n[i]={...n[i],tipoCalc:e.target.value as any};u('gastosArg',n)}} className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8] bg-white">
                            <option value="pct_cif">% sobre CIF</option>
                            <option value="fijo_usd">Fijo USD</option>
                            <option value="fijo_ars">Fijo ARS</option>
                          </select>
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-gray-400 flex-shrink-0">{g.tipoCalc==='pct_cif'?'%':g.tipoCalc==='fijo_ars'?'ARS':'USD'}</span>
                            <input type="text" inputMode="decimal" value={g.valor||''} placeholder="0" onFocus={e=>e.target.select()} onChange={e=>{const n=[...s.gastosArg];n[i]={...n[i],valor:parseNum(e.target.value)};u('gastosArg',n)}} className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8] text-right font-mono bg-white"/>
                          </div>
                          {g.tipoCalc==='pct_cif'?<div className="flex items-center gap-1"><span className="text-[10px] text-gray-400 flex-shrink-0">Piso</span><input type="text" inputMode="decimal" value={g.pisoUsd||''} placeholder="0" onFocus={e=>e.target.select()} onChange={e=>{const n=[...s.gastosArg];n[i]={...n[i],pisoUsd:parseNum(e.target.value)};u('gastosArg',n)}} className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8] text-right font-mono bg-white"/></div>:<div/>}
                          {g.tipoCalc==='pct_cif'?<div className="flex items-center gap-1"><span className="text-[10px] text-gray-400 flex-shrink-0">Techo</span><input type="text" inputMode="decimal" value={g.techoUsd||''} placeholder="0" onFocus={e=>e.target.select()} onChange={e=>{const n=[...s.gastosArg];n[i]={...n[i],techoUsd:parseNum(e.target.value)};u('gastosArg',n)}} className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8] text-right font-mono bg-white"/></div>:<div/>}
                        </div>
                        <div className="flex items-center justify-between">
                          <button onClick={()=>u('gastosArg',s.gastosArg.filter((_,j)=>j!==i))} className="text-[10px] text-red-400 hover:text-red-600 transition-colors">Eliminar</button>
                          <div className="text-right text-xs">
                            <span className="font-mono font-semibold text-[#052698]">USD {fmt(usd)}</span>
                            <span className="text-gray-300 mx-2">-</span>
                            <span className="font-mono text-gray-500 text-[10px]">ARS {Math.round(arsEquiv).toLocaleString('es-AR')}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  <button onClick={()=>u('gastosArg',[...s.gastosArg,{id:Math.random().toString(36).slice(2),desc:'',tipoCalc:'fijo_usd',moneda:'USD',valor:0,pisoUsd:0,techoUsd:0,usd:0,ars:0}])} className="text-xs text-[#1168F8] hover:underline mt-1">+ Agregar gasto</button>
                  <div className="mt-2 pt-2 border-t border-gray-100 flex justify-between text-xs">
                    <span className="text-gray-500">Subtotal gastos Argentina:</span>
                    <span className="font-mono font-semibold text-[#052698]">USD {fmt(subGastosArg)}</span>
                  </div>
                </div>
              )}
              <LogRows rows={s.rowsE} onChange={r=>u('rowsE',r)}/>
            </div>
            <div className="flex justify-end items-center gap-3 px-5 py-2.5 bg-gray-50 border-t border-gray-100 text-xs text-gray-500">
              Subtotal seccion F: <strong className="font-mono text-gray-800">USD {fmt(subE+subGastosArg)}</strong>
            </div>
          </div>

          <SecCard letter="G" label="Fee Puerto NOA" sub2={fee}>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Fee por contenedor (USD)"><input type="text" inputMode="decimal" onFocus={e=>e.target.select()} value={s.feeCont} onChange={e=>u('feeCont',parseNum(e.target.value))} className={inp}/></Field>
              <Field label="N contenedores"><div className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-right">{nc}</div></Field>
              <Field label="Fee total (USD)"><div className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono text-right">USD {fmt(fee)}</div></Field>
            </div>
          </SecCard>

          <div className="flex justify-between">
            <button onClick={()=>setTab('embarque')} className="px-4 py-2 border border-gray-200 rounded-lg text-xs hover:bg-gray-50">Anterior</button>
            <button onClick={()=>setTab('tributos')} className="bg-[#1168F8] text-white px-5 py-2 rounded-lg text-xs font-medium hover:bg-[#0a4fc4]">Tributos ARCA</button>
          </div>
        </div>
      )}

      {tab==='tributos'&&(
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[
              {label:'FOB China',value:`USD ${fmt(totalFOB,0)}`,sub:'Precio mercaderia + puesta a FOB',bg:'bg-[#EBF2FF] border-[#93B8FC]',tl:'text-[#052698]',tv:'text-[#1168F8]',ts:'text-[#1168F8]'},
              {label:'Flete hasta Jama + Seguro',value:`USD ${fmt(subA+seg,0)}`,sub:'Flete maritimo + seguro',bg:'bg-[#EBF2FF] border-[#93B8FC]',tl:'text-[#052698]',tv:'text-[#1168F8]',ts:'text-[#1168F8]'},
              {label:'Valor CIF Jama — base imponible',value:`USD ${fmt(cif,0)}`,sub:`ARS ${Math.round(cifARS).toLocaleString('es-AR')}`,bg:'bg-[#052698] border-[#052698]',tl:'text-blue-200',tv:'text-white',ts:'text-blue-300'},
            ].map(b=><div key={b.label} className={`${b.bg} border rounded-xl p-4`}><div className={`text-[10px] mb-1 ${b.tl}`}>{b.label}</div><div className={`text-xl font-semibold ${b.tv}`}>{b.value}</div><div className={`text-[10px] mt-1 ${b.ts}`}>{b.sub}</div></div>)}
          </div>
          <Card title="Liquidacion ARCA — Aduana Jujuy">
            <div className="grid grid-cols-4 gap-3 mb-4">
              <Field label="Regimen de importacion"><select value={s.regimen} onChange={e=>u('regimen',e.target.value as any)} className={sel}>{Object.entries(REG_L).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field>
              <Field label="TC oficial BNA (ARS/USD)"><div className="px-2.5 py-1.5 bg-[#EBF2FF] border border-[#93B8FC] rounded-lg text-xs font-mono text-right font-semibold text-[#052698]">ARS {fmt(s.tcTrib,0)}</div></Field>
              <Field label="Derechos importacion % (NCM)"><input type="text" inputMode="decimal" onFocus={e=>e.target.select()} value={s.derPct} step={0.5} onChange={e=>u('derPct',parseNum(e.target.value))} className={inp}/></Field>
              <Field label="NCM principal"><div className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono">{s.productos.find(p=>p.ncm)?.ncm||'—'}</div></Field>
            </div>
            {tribCfg.length===0?(
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-700">No hay tributos configurados para el Regimen {s.regimen}.</div>
            ):(
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
                <div className="text-[10px] font-semibold text-gray-500 mb-3 uppercase tracking-wider">REGIMEN {s.regimen} - SIM Aduana Jujuy</div>
                {tributos.map((t:any)=>(
                  <div key={t.codigo} className="grid grid-cols-5 gap-2 text-xs py-1.5 border-b border-gray-100">
                    <div className="font-mono text-[10px] text-gray-400">{t.codigo}</div>
                    <div className="col-span-2 text-gray-700">{t.concepto}</div>
                    <div className="text-right text-gray-500">{t.tipo==='pct'?(t.codigo==='010'?`${s.derPct}%`:`${t.valor}%`):'Fijo'}</div>
                    <div className="text-right font-mono font-medium text-gray-800">ARS {Math.round(t.imp).toLocaleString('es-AR')}</div>
                  </div>
                ))}
                <div className="flex justify-between pt-2 mt-1 border-t border-gray-200 font-semibold text-sm">
                  <span>TOTAL PAGADO ADUANA</span>
                  <span className="font-mono text-[#052698]">ARS {Math.round(totalTribARS).toLocaleString('es-AR')}</span>
                </div>
              </div>
            )}
          </Card>
          <div className="flex justify-between">
            <button onClick={()=>setTab('logistica')} className="px-4 py-2 border border-gray-200 rounded-lg text-xs hover:bg-gray-50">Anterior</button>
            <button onClick={()=>setTab('resumen')} className="bg-[#1168F8] text-white px-5 py-2 rounded-lg text-xs font-medium hover:bg-[#0a4fc4]">Ver resumen</button>
          </div>
        </div>
      )}

      {tab==='resumen'&&(
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3 items-center">
            <div className="bg-white border border-gray-100 border-t-4 border-t-[#1168F8] rounded-xl p-5 text-center">
              <div className="text-[10px] text-gray-400 mb-1">Costo total China - {s.destinoNoa}</div>
              <div className="text-2xl font-semibold text-gray-900">USD {fmt(totalLanded,0)}</div>
              <div className="text-[10px] text-gray-400 mt-1">producto + logistica + tributos</div>
            </div>
            <div className="text-center text-sm text-gray-400 font-semibold">VS</div>
            <div className="bg-white border border-gray-100 border-t-4 border-t-blue-300 rounded-xl p-5 text-center">
              <div className="text-[10px] text-gray-400 mb-1">Precio equivalente en Argentina</div>
              <div className="text-2xl font-semibold text-gray-900">{s.precioArgEquiv>0?`USD ${fmt(s.precioArgEquiv,0)}`:'—'}</div>
            </div>
          </div>
          {s.precioArgEquiv>0&&(()=>{const d=s.precioArgEquiv-totalLanded;return <div className={`text-xs px-4 py-3 rounded-xl text-center font-medium ${d>0?'bg-[#EBF2FF] text-[#052698] border border-[#93B8FC]':'bg-red-50 text-red-700 border border-red-200'}`}>{d>0?`Importar desde China es USD ${fmt(Math.abs(d),0)} mas economico (${Math.round(Math.abs(d)/s.precioArgEquiv*100)}% de ahorro)`:`Importar desde China resulta USD ${fmt(Math.abs(d),0)} mas caro que el precio local`}</div>})()}

          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-3.5 border-b border-gray-100 font-medium text-sm text-gray-900">Desglose completo de costos</div>
            <table className="w-full text-xs">
              <thead><tr className="bg-gray-50"><th className="text-left px-4 py-2.5 text-[10px] text-gray-400 font-medium uppercase">Seccion</th><th className="text-left px-4 py-2.5 text-[10px] text-gray-400 font-medium uppercase">Concepto</th><th className="text-right px-4 py-2.5 text-[10px] text-gray-400 font-medium uppercase">USD</th></tr></thead>
              <tbody>
                {[
                  {sec:'Producto',concepto:`Precio mercaderia China (${s.incoterm})`,v:totalFOB},
                  ...(s.incoterm==='EXW'?[{sec:'Puesta a FOB',concepto:'Transporte + agente + otros',v:s.exwTransp+s.exwAgente+s.exwOtros}]:[]),
                  {sec:'A - Flete maritimo',concepto:`China - ${PUERTOS_L[s.ptoChile]}`,v:subA},
                  {sec:'B - Seguro',concepto:s.segModo==='pct'?`${s.segVal}% sobre FOB+flete`:'Monto fijo',v:seg},
                  {sec:'C - Puerto Chile',concepto:'THC, handling, gastos portuarios',v:subC},
                  ...(s.optTransp!=='B'&&subDescon>0?[{sec:'D - Desconsolidacion',concepto:'Gastos desconsolidacion',v:subDescon}]:[]),
                  ...(s.optTransp==='A2'&&subAlm>0?[{sec:'D - Almacenaje',concepto:`${fmt(volAlm,2)} m3 x ${s.almDias} dias`,v:subAlm}]:[]),
                  ...(subCarga>0?[{sec:'D - Carga al camion',concepto:'Importe carga',v:subCarga}]:[]),
                  {sec:'E - Transporte terrestre',concepto:`${s.nCamiones} camion(es) x USD ${fmt(s.ftCamion)}`,v:subTransp},
                  ...(subGastosArg>0?[{sec:'F - Gastos Argentina',concepto:'Despachante y honorarios',v:subGastosArg}]:[]),
                  ...(subE>0?[{sec:'F - Gastos Argentina',concepto:'Otros gastos',v:subE}]:[]),
                  ...(fee>0?[{sec:'G - Fee Puerto NOA',concepto:`${nc} cont. x USD ${s.feeCont}`,v:fee}]:[]),
                  {sec:'Tributos ARCA',concepto:`Regimen ${s.regimen} - Base CIF Jama`,v:totalTribUSD},
                ].filter(r=>r.v>0).map((r,i)=>(
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-[10px] text-gray-400">{r.sec}</td>
                    <td className="px-4 py-2.5 text-gray-700">{r.concepto}</td>
                    <td className="px-4 py-2.5 font-mono text-right">{fmt(r.v)}</td>
                  </tr>
                ))}
                <tr className="bg-[#EBF2FF] font-semibold border-t-2 border-[#1168F8]">
                  <td className="px-4 py-3 text-sm text-[#052698]" colSpan={2}>TOTAL LANDED EN DESTINO</td>
                  <td className="px-4 py-3 font-mono text-right text-base text-[#052698]">{fmt(totalLanded)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-3.5 border-b border-gray-100 font-medium text-sm text-gray-900">Composicion del costo total</div>
            <div className="p-4 space-y-2">
              <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 rounded-lg">
                <div><div className="text-xs font-medium text-gray-700">Valor mercaderia China ({s.incoterm})</div></div>
                <div className="text-right"><div className="font-mono font-semibold text-gray-800">USD {fmt(totalFOB,0)}</div><div className="text-[10px] text-gray-400 font-mono">{fmt(totalFOB/totalLanded*100,1)}% del total</div></div>
              </div>
              <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 rounded-lg">
                <div><div className="text-xs font-medium text-gray-700">Costos logisticos</div></div>
                <div className="text-right"><div className="font-mono font-semibold text-gray-800">USD {fmt(totalLog,0)}</div><div className="text-[10px] text-gray-400 font-mono">{fmt(totalLog/totalLanded*100,1)}% del total</div></div>
              </div>
              <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 rounded-lg">
                <div><div className="text-xs font-medium text-gray-700">Tributos ARCA — Aduana Argentina</div><div className="text-[10px] text-gray-400 mt-0.5">Regimen {s.regimen}</div></div>
                <div className="text-right"><div className="font-mono font-semibold text-gray-800">USD {fmt(totalTribUSD,0)}</div><div className="font-mono text-[10px] text-[#052698] font-medium">ARS {Math.round(totalTribARS).toLocaleString('es-AR')}</div></div>
              </div>
              <div className="flex items-center justify-between px-3 py-3 bg-[#052698] rounded-lg mt-1">
                <div><div className="text-xs font-semibold text-white">TOTAL LANDED EN DESTINO</div><div className="text-[10px] text-blue-200 mt-0.5">USD {fmt(totalLanded/nc,0)} por contenedor</div></div>
                <div className="font-mono font-bold text-white text-xl">USD {fmt(totalLanded,0)}</div>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-xl px-5 py-3.5">
            <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Tipos de cambio aplicados</div>
            <div className="flex flex-wrap gap-4 text-xs">
              <div className="flex items-center gap-2"><span className="text-gray-500">TC oficial BNA (ARS/USD)</span><span className="font-mono font-semibold text-gray-800 bg-[#EBF2FF] px-2 py-0.5 rounded">ARS {fmt(s.tcTrib,0)}</span></div>
              <div className="flex items-center gap-2"><span className="text-gray-500">CLP/USD</span><span className="font-mono font-semibold text-gray-800 bg-gray-100 px-2 py-0.5 rounded">CLP {fmt(s.tcClp,0)}</span></div>
            </div>
          </div>

          <div className="flex justify-between">
            <button onClick={()=>setTab('tributos')} className="px-4 py-2 border border-gray-200 rounded-lg text-xs hover:bg-gray-50">Anterior</button>
            <button onClick={guardar} disabled={saving} className="bg-[#1168F8] text-white px-6 py-2 rounded-lg text-xs font-medium hover:bg-[#0a4fc4] disabled:opacity-60">
              {saving?'Guardando...':'Guardar cotizacion'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
