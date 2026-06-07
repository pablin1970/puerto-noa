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
interface GastoArg {
  id: string
  desc: string
  tipoCalc: 'pct_cif' | 'fijo_usd' | 'fijo_ars'
  moneda: 'USD' | 'ARS'
  valor: number
  pisoUsd: number
  techoUsd: number
  usd: number  // calculado
  ars: number  // calculado
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
  origen:'Dalian, China (CNDAG)',ptoChile:'IQQ',destinoNoa:'Jujuy',incoterm:'FOB',transito:'44-46 días',refNaviero:'',cotProvId:'',cotProvLabel:'',notas:'',
  contenedores:[{tipo:'40HC',cantidad:1}],
  productos:[{descripcion:'',ncm:'',cantidad:1,precio_unit:0,subtotal:0,peso_unit:0,vol_unit:0,incoterm:'FOB'}],
  exwTransp:0,exwAgente:0,exwOtros:0,precioArgEquiv:0,
  rowsA:[],segModo:'pct',segVal:0.5,rowsC:[],
  optTransp:'A1',rowsDescon:[],
  almModoVol:'auto',almVolM3:0,almCostoDia:0,almDias:0,
  cargaModo:'fijo',cargaValor:0,
  ftCamion:0,nCamiones:1,ftIda:0,ftDev:0,ftRt:0,
  rowsE:[],gastosArg:[],feeCont:0,
  tcClp:950,regimen:'A',tcTrib:1000,derPct:18,
}

const REG_L: Record<string,string> = {
  A:'A — Persona jurídica · Comercialización',
  B:'B — Persona jurídica · Uso propio',
  C:'C — Persona física · Comercialización',
  D:'D — Persona física · Uso propio',
}

const inp = 'w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8] bg-white'
const sel = 'w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8] bg-white'
const parseNum = (v: string) => { const n = parseFloat(v.replace(',','.').replace(/[^0-9.-]/g,'')); return isNaN(n) ? 0 : n }
const parseInt2 = (v: string) => { const n = parseInt(v.replace(',','.').replace(/[^0-9-]/g,'')); return isNaN(n) ? 0 : n }

function Field({label,children}:{label:string;children:React.ReactNode}){
  return <div><label className="block text-[10px] font-medium text-gray-500 mb-1">{label}</label>{children}</div>
}
function Card({title,children}:{title:string;children:React.ReactNode}){
  return <div className="bg-white border border-gray-100 rounded-xl overflow-hidden"><div className="px-5 py-3 border-b border-gray-100 bg-gray-50 font-medium text-sm text-gray-900">{title}</div><div className="px-5 py-4">{children}</div></div>
}
function SecCard({letter,label,sub,sub2,children,loadBtn}:{letter:string;label:string;sub?:string;sub2:number;children:React.ReactNode;loadBtn?:React.ReactNode}){
  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
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
      {/* Encabezados */}
      {rows.length>0&&(
        <div style={{display:'grid',gridTemplateColumns:cols,gap:'6px'}} className="mb-1 text-[10px] text-gray-400 font-medium uppercase tracking-wide">
          <div>Descripción</div>
          <div className="text-right">Cant.</div>
          <div className="text-right">Precio USD</div>
          {withIva&&<div>IVA Chile</div>}
          <div></div>
        </div>
      )}
      {rows.map((r,i)=>(
        <div key={r.id} style={{display:'grid',gridTemplateColumns:cols,gap:'6px',alignItems:'center'}} className="mb-2">
          <input
            value={r.desc}
            onChange={e=>{const n=[...rows];n[i]={...n[i],desc:e.target.value};onChange(n)}}
            className={inp}
            placeholder="Descripción"
          />
          <input
            type="text" inputMode="decimal"
            value={r.cant}
            onFocus={e=>e.target.select()}
            onChange={e=>{const n=[...rows];n[i]={...n[i],cant:parseNum(e.target.value)||1};onChange(n)}}
            className={inp+' text-right'}
          />
          <input
            type="text" inputMode="decimal"
            value={r.unitario}
            onFocus={e=>e.target.select()}
            onChange={e=>{const n=[...rows];n[i]={...n[i],unitario:parseNum(e.target.value)};onChange(n)}}
            className={inp+' text-right'}
            placeholder="0.00"
          />
          {withIva&&(
            <select value={r.ivaChile||'exento'} onChange={e=>{const n=[...rows];n[i]={...n[i],ivaChile:e.target.value as any};onChange(n)}} className={sel}>
              <option value="exento">Exento</option>
              <option value="gravado">Grav. 19%</option>
            </select>
          )}
          <button onClick={()=>onChange(rows.filter((_,j)=>j!==i))} className="text-gray-400 hover:text-red-500 text-xs">🗑</button>
        </div>
      ))}
      {/* Subtotales por fila */}
      {rows.filter(r=>r.cant>0&&r.unitario>0).length>0&&(
        <div className="mt-2 pt-2 border-t border-gray-100 flex flex-wrap gap-x-4 gap-y-1">
          {rows.filter(r=>r.cant>0&&r.unitario>0).map((r,i)=>(
            <div key={r.id} className="text-[10px] text-gray-500">
              <span className="font-medium text-gray-700">{r.desc||`Ítem ${i+1}`}</span>
              <span className="mx-1 text-gray-300">·</span>
              <span className="font-mono">{r.cant} × USD {fmt(r.unitario)}</span>
              <span className="mx-1 text-gray-300">=</span>
              <span className="font-mono font-semibold text-[#052698]">USD {fmt(r.cant*r.unitario)}</span>
            </div>
          ))}
        </div>
      )}
      <button onClick={()=>onChange([...rows,{id:Math.random().toString(36).slice(2),desc:'',cant:1,unitario:0,ivaChile:'exento',tipoCalc:'fijo'}])} className="text-xs text-[#1168F8] hover:underline mt-2 block">+ Agregar ítem</button>
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
            <option value="fijo">Fijo (USD)</option><option value="m3">Por m³</option>
          </select>
          {r.tipoCalc==='fijo'
            ?<input type="text" inputMode="decimal" value={r.cant} onFocus={e=>e.target.select()} onChange={e=>{const n=[...rows];n[i]={...n[i],cant:parseNum(e.target.value)||1};onChange(n)}} className={inp+' text-right'} placeholder="Cant."/>
            :<div className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-right font-mono">{fmt(totalM3,2)} m³</div>
          }
          <input type="text" inputMode="decimal" value={r.unitario} onFocus={e=>e.target.select()} onChange={e=>{const n=[...rows];n[i]={...n[i],unitario:parseNum(e.target.value)};onChange(n)}} className={inp+' text-right'} placeholder={r.tipoCalc==='m3'?'USD/m³':'USD'}/>
          <button onClick={()=>onChange(rows.filter((_,j)=>j!==i))} className="text-gray-400 hover:text-red-500 text-xs pb-1">🗑</button>
        </div>
      ))}
      <button onClick={()=>onChange([...rows,{id:Math.random().toString(36).slice(2),desc:'',cant:1,unitario:0,tipoCalc:'fijo'}])} className="text-xs text-[#1168F8] hover:underline mt-1">+ Agregar ítem</button>
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
  const [tribCfg,setTribCfg]=useState<TribCfg[]>([])
  const [saving,setSaving]=useState(false)
  const supabase=createClient()
  const router=useRouter()

  useEffect(()=>{
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
        // Pre-cargar gastos Argentina
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
  // Actualizar filas A y transporte terrestre cuando cambian contenedores o tarifas
  useEffect(()=>{
    if(tarifas.length===0) return
    setS(p=>{
      // Sección A — flete marítimo por tipo de contenedor
      const filasA = p.contenedores.map(c=>{
        const tarifa = tarifas.find(t=>t.tipo==='maritima' && t.tipo_contenedor===c.tipo)
        const precio = tarifa?.valor || 0
        const naviera = tarifa?.naviera || ''
        const existing = p.rowsA.find(r=>r.desc.includes(c.tipo))
        return {
          id: existing?.id || Math.random().toString(36).slice(2),
          desc: `Flete marítimo ${c.tipo}${naviera?' ('+naviera+')':''}`,
          cant: c.cantidad,
          unitario: existing?.unitario ?? precio,
          ivaChile: 'exento' as const,
          tipoCalc: 'fijo' as const
        }
      })
      // Transporte terrestre — buscar tarifa terrestre según destino NOA
      const tarifaTerrestre = tarifas.find(t=>
        t.tipo==='terrestre' && t.ruta.toLowerCase().includes(p.destinoNoa.toLowerCase())
      ) || tarifas.find(t=>t.tipo==='terrestre')
      const precioTerrestre = tarifaTerrestre?.valor || 0
      const ncTotal = p.contenedores.reduce((s,c)=>s+c.cantidad,0) || 1
      // Solo actualizar si no fue editado manualmente
      const nuevoFtCamion = p.ftCamion === 0 ? precioTerrestre : p.ftCamion
      const nuevoNCamiones = p.nCamiones === 1 ? ncTotal : p.nCamiones
      return {
        ...p,
        rowsA: filasA,
        ftCamion: nuevoFtCamion,
        nCamiones: nuevoNCamiones,
      }
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

  // Calcular gastos Argentina con lógica piso/techo — DESPUÉS de cif
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
      ? `Cotiz. específica ${opRef.num} · ${cot.proveedor} · ${cot.fecha}`
      : `Cotiz. genérica · ${cot.proveedor} · ${cot.fecha}`
    setS(p => {
      const filasA = p.contenedores.map(c => {
        const item = cot.items?.find((i:any) => i.tipo_servicio === 'maritima' && i.tipo_equipo === c.tipo)
          || cot.items?.find((i:any) => i.tipo_servicio === 'maritima')
        return {
          id: Math.random().toString(36).slice(2),
          desc: `${item?.descripcion || 'Flete marítimo'} ${c.tipo} · ${label}`,
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
      ? `Cotiz. específica ${opRef.num} · ${cot.proveedor} · ${cot.fecha}`
      : `Cotiz. genérica · ${cot.proveedor} · ${cot.fecha}`
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
      ? `Cotiz. específica ${opRef.num} · ${cot.proveedor} · ${cot.fecha}`
      : `Cotiz. genérica · ${cot.proveedor} · ${cot.fecha}`
    const items = cot.items?.filter((i:any) => i.tipo_servicio === 'argentina') || []
    if (!items.length) return
    setS(p => ({
      ...p,
      cotArgId: cotId,
      cotArgLabel: label,
      gastosArg: items.map((i:any) => ({
        id: Math.random().toString(36).slice(2),
        desc: `${i.descripcion} · ${label}`,
        tipoCalc: (i.tipo_calculo||'fijo_usd') as 'pct_cif'|'fijo_usd'|'fijo_ars',
        moneda: (i.moneda||'USD') as 'USD'|'ARS',
        valor: i.valor||0,
        pisoUsd: i.piso_usd||0,
        techoUsd: i.techo_usd||0,
        usd: 0, ars: 0,
      }))
    }))
  }

  function cargarSeccionA(){
    const mar=tarifas.filter(t=>(t.tipo as string)==='maritima')
    setS(p=>{
      const filasA = p.contenedores.map(c=>{
        const tarifa = mar.find(t=>t.tipo_contenedor===c.tipo)
        return {
          id: Math.random().toString(36).slice(2),
          desc: `Flete marítimo ${c.tipo}${tarifa?.naviera?' ('+tarifa.naviera+')':''}`,
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

  function aplicarTarifas(){
    const pto=tarifas.filter(t=>(t.tipo as string)==='puerto')
    // Generar filas A basadas en contenedores seleccionados
    setS(p=>{
      const filasA = p.contenedores.map(c=>{
        const tarifa = tarifas.find(t=>t.tipo==='maritima' && t.tipo_contenedor===c.tipo)
        const precio = tarifa?.valor || 0
        const naviera = tarifa?.naviera || ''
        return {
          id: Math.random().toString(36).slice(2),
          desc: `Flete marítimo ${c.tipo}${naviera?' ('+naviera+')':''}`,
          cant: c.cantidad,
          unitario: precio,
          ivaChile: 'exento' as const,
          tipoCalc: 'fijo' as const
        }
      })
      const filasC = pto.map(t=>({
        id:Math.random().toString(36).slice(2),
        desc:t.ruta,
        cant: p.contenedores.reduce((s,c)=>s+c.cantidad,0)||1,
        unitario:t.valor,
        ivaChile:(t.iva_chile||'exento') as 'exento'|'gravado',
        tipoCalc:'fijo' as const
      }))
      return {...p, rowsA: filasA, rowsC: filasC}
    })
  }

  async function guardar(){
    if(!s.cliente){alert('Ingresá el nombre del cliente.');return}
    setSaving(true)
    try {
      const {data:cots}=await supabase.from('cotizaciones').select('num')
      const num=nextCotNum(cots||[])
      const {data:user}=await supabase.auth.getUser()
      if(!user.user){alert('Tu sesión expiró. Por favor ingresá nuevamente.');setSaving(false);return}
      const {data:uDB}=await supabase.from('usuarios').select('id').eq('auth_id',user.user.id).single()
      const uid=(uDB as any)?.id||''
      const presupuesto=[
        ...(subA>0?[{etapa:'maritimo',tipo:'flete',concepto:'Flete marítimo y cargos naviero',usd:subA}]:[]),
        ...(seg>0?[{etapa:'maritimo',tipo:'seguro',concepto:'Seguro mercadería',usd:seg}]:[]),
        ...(subC>0?[{etapa:'chile',tipo:'servicios',concepto:'Gastos puerto Chile',usd:subC}]:[]),
        ...(subD>0?[{etapa:'chile',tipo:'desconsolidacion',concepto:`Desconsolidación (Opción ${s.optTransp})`,usd:subD}]:[]),
        ...(subTransp>0?[{etapa:'terrestre',tipo:'flete',concepto:'Transporte terrestre',usd:subTransp}]:[]),
        ...(subE>0?[{etapa:'argentina',tipo:'servicios',concepto:'Gastos Argentina',usd:subE}]:[]),
        ...(subGastosArg>0?[{etapa:'argentina',tipo:'gastos_arg',concepto:'Gastos Argentina (despachante y otros)',usd:subGastosArg}]:[]),
        ...(totalTribUSD>0?[{etapa:'tributos',tipo:'tributos',concepto:`Tributos ARCA Régimen ${s.regimen}`,usd:totalTribUSD}]:[]),
        ...(fee>0?[{etapa:'fee',tipo:'fee',concepto:'Fee Puerto NOA',usd:fee}]:[]),
      ]
      const {error}=await (supabase.from('cotizaciones') as any).insert({
        num,version:1,
        cliente:s.cliente,cuit:s.cuit,email_cliente:s.email,telefono_cliente:s.telefono,
        origen:s.origen,puerto_chile:s.ptoChile,destino_noa:s.destinoNoa,incoterm:s.incoterm,
        transito:s.transito,ref_naviero:s.refNaviero,notas:s.notas,
        tipo_contenedores:s.contenedores,productos:s.productos,
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

  const TABS=[{key:'embarque',label:'Embarque'},{key:'logistica',label:'Logística'},{key:'tributos',label:'Tributos ARCA'},{key:'resumen',label:'Resumen'}] as const

  return (
    <div className="p-6">
      <div className="mb-5 flex items-center gap-4">
        <Image src="/logo.png" alt="Puertonoa" width={140} height={40} style={{objectFit:'contain'}}/>
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Nueva cotización</h1>
          <p className="text-xs text-gray-400 mt-0.5">Módulo 1 — Cotizador logístico China → NOA</p>
        </div>
      </div>

      <div className="flex gap-2 mb-5 flex-wrap items-center">
        {TABS.map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key as Tab)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${tab===t.key?'bg-[#1168F8] text-white':'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{t.label}</button>
        ))}
        <div className="ml-auto flex items-center gap-2 text-[10px] text-gray-400">
          <Image src="/logo.png" alt="Puertonoa" width={80} height={22} style={{objectFit:'contain',opacity:0.6}}/>
        </div>
      </div>

      {/* ── EMBARQUE ── */}
      {tab==='embarque'&&(
        <div className="space-y-4">
          <Card title="Cliente y operación">
            <div className="grid grid-cols-4 gap-3 mb-3">
              <div className="col-span-2"><Field label="Razón social"><input value={s.cliente} onChange={e=>u('cliente',e.target.value)} className={inp} placeholder="Razón social completa del cliente"/></Field></div>
              <Field label="CUIT"><input value={s.cuit} onChange={e=>u('cuit',e.target.value)} className={inp} placeholder="XX-XXXXXXXX-X"/></Field>
              <Field label="Teléfono"><input value={s.telefono} onChange={e=>u('telefono',e.target.value)} className={inp} placeholder="+54 9 388..."/></Field>
            </div>
            <div className="grid grid-cols-4 gap-3 mb-3">
              <div className="col-span-2"><Field label="Email"><input type="email" value={s.email} onChange={e=>u('email',e.target.value)} className={inp} placeholder="correo@empresa.com"/></Field></div>
              <Field label="Despachante de aduana"><input value={s.despachante} onChange={e=>u('despachante',e.target.value)} className={inp} placeholder="Nombre / CUIT"/></Field>
              <Field label="Condición IVA"><select value={s.ivaCondicion} onChange={e=>u('ivaCondicion',e.target.value)} className={sel}>{['Responsable Inscripto','Monotributista','Exento','Consumidor Final'].map(v=><option key={v}>{v}</option>)}</select></Field>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <Field label="Validez oferta"><select value={s.validez} onChange={e=>u('validez',e.target.value)} className={sel}><option value="">Sin especificar</option><option value="15 días">15 días</option><option value="30 días">30 días</option><option value="45 días">45 días</option></select></Field>
              <div className="col-span-3"><Field label="Notas internas"><input value={s.notas} onChange={e=>u('notas',e.target.value)} className={inp} placeholder="Observaciones"/></Field></div>
            </div>
          </Card>

          <Card title="Ruta del embarque">
            <div className="grid grid-cols-4 gap-3 mb-3">
              <Field label="Origen"><input value={s.origen} onChange={e=>u('origen',e.target.value)} className={inp}/></Field>
              <Field label="Puerto Chile"><select value={s.ptoChile} onChange={e=>u('ptoChile',e.target.value)} className={sel}>{Object.entries(PUERTOS_L).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field>
              <Field label="Destino NOA"><select value={s.destinoNoa} onChange={e=>u('destinoNoa',e.target.value)} className={sel}>{['Jujuy','Salta','Tucumán','Catamarca','La Rioja'].map(v=><option key={v}>{v}</option>)}</select></Field>
              <Field label="Incoterm"><select value={s.incoterm} onChange={e=>u('incoterm',e.target.value)} className={sel}>{['FOB','EXW','CIF','CFR'].map(v=><option key={v}>{v}</option>)}</select></Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Tránsito estimado"><input value={s.transito} onChange={e=>u('transito',e.target.value)} className={inp}/></Field>
              <Field label="Cotización naviero">
                {cotNavieras.length > 0 ? (
                  <div className="space-y-1.5">
                    <select
                      value={s.cotProvId}
                      onChange={e => {
                        if (e.target.value === '__manual__') {
                          u('cotProvId', '')
                        } else if (e.target.value) {
                          aplicarCotNaviera(e.target.value)
                        } else {
                          u('cotProvId', '')
                        }
                      }}
                      className={sel}
                    >
                      <option value="">— Seleccionar cotización —</option>
                      {cotNavieras.filter((c:any)=>c.tipo==='especifica').length>0 && (
                        <optgroup label="🎯 Específicas para esta operación">
                          {cotNavieras.filter((c:any)=>c.tipo==='especifica').map((c:any)=>{
                            const op=(c.operacion as any)?.cotizacion
                            return <option key={c.id} value={c.id}>{c.proveedor} · {c.fecha}{op?` · ${op.num}`:''}</option>
                          })}
                        </optgroup>
                      )}
                      <optgroup label="📋 Genéricas vigentes">
                        {cotNavieras.filter((c:any)=>c.tipo==='generica').map((c:any)=>(
                          <option key={c.id} value={c.id}>{c.proveedor} · {c.referencia||c.fecha}</option>
                        ))}
                      </optgroup>
                      <option value="__manual__">✏ Ingresar manualmente</option>
                    </select>
                    {(!s.cotProvId || s.cotProvId === '__manual__') && (
                      <input value={s.refNaviero} onChange={e=>u('refNaviero',e.target.value)} className={inp} placeholder="ej. Q-AR-DR... (Hellmann)"/>
                    )}
                    {s.cotProvId && s.cotProvId !== '__manual__' && (
                      <div className="text-[10px] text-[#1168F8] bg-[#EBF2FF] px-2.5 py-1.5 rounded-lg">
                        ✓ {s.cotProvLabel} — precios cargados en sección A
                      </div>
                    )}
                  </div>
                ) : (
                  <input value={s.refNaviero} onChange={e=>u('refNaviero',e.target.value)} className={inp} placeholder="ej. Q-AR-DR... (Hellmann)"/>
                )}
              </Field>
            </div>
          </Card>

          {/* Contenedores — chips */}
          <Card title="Contenedores">
            <div className="flex flex-wrap gap-2 items-center mb-3">
              {s.contenedores.map((c,i)=>(
                <div key={i} className="flex items-center gap-2 bg-[#EBF2FF] border border-[#93B8FC] rounded-lg px-3 py-2">
                  <select value={c.tipo} onChange={e=>{const n=[...s.contenedores];n[i]={...n[i],tipo:e.target.value};u('contenedores',n)}} className="border-0 bg-transparent text-xs font-semibold text-[#1168F8] focus:outline-none">
                    {Object.keys(CONT_CAPS).map(k=><option key={k}>{k}</option>)}
                  </select>
                  <span className="text-[#93B8FC] text-xs">×</span>
                  <input type="text" inputMode="decimal" value={c.cantidad} min={1} onFocus={e=>e.target.select()} onChange={e=>{const n=[...s.contenedores];n[i]={...n[i],cantidad:parseInt2(e.target.value)||1};u('contenedores',n)}} className="w-10 text-center text-xs border-0 bg-transparent focus:outline-none font-bold text-[#052698]"/>
                  {s.contenedores.length>1&&<button onClick={()=>u('contenedores',s.contenedores.filter((_,j)=>j!==i))} className="text-[#93B8FC] hover:text-red-400 text-xs">✕</button>}
                </div>
              ))}
              <button onClick={()=>u('contenedores',[...s.contenedores,{tipo:'40HC',cantidad:1}])} className="text-xs text-[#1168F8] hover:underline px-2">+ Agregar tipo</button>
            </div>
            <div className="text-xs text-gray-500">Total: <strong className="text-gray-800">{nc} contenedor(es)</strong> · {s.contenedores.map(c=>`${c.cantidad}× ${c.tipo}`).join(', ')}</div>
          </Card>

          {/* Productos */}
          <Card title="Productos de China">
            <div className="overflow-x-auto">
              <table className="w-full text-xs mb-2">
                <thead><tr className="bg-gray-50">{['Descripción','NCM','Cant.','Precio unit. USD','Subtotal','Peso kg/u','Vol m³/u','Incoterm',''].map(h=><th key={h} className="text-left px-2 py-2 text-[10px] text-gray-400 font-medium uppercase tracking-wide whitespace-nowrap">{h}</th>)}</tr></thead>
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
                      <td className="px-2 py-1.5"><button onClick={()=>u('productos',s.productos.filter((_,j)=>j!==i))} className="text-gray-400 hover:text-red-500 text-xs">🗑</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={()=>u('productos',[...s.productos,{descripcion:'',ncm:'',cantidad:1,precio_unit:0,subtotal:0,peso_unit:0,vol_unit:0,incoterm:s.incoterm}])} className="text-xs text-[#1168F8] hover:underline">+ Agregar producto</button>
            <div className="grid grid-cols-4 gap-3 mt-4">
              {[{label:'Total FOB/EXW (USD)',value:`USD ${fmt(totalFOB)}`},{label:'Peso total',value:`${fmt(cap.totalKg,0)} kg`},{label:'Volumen total',value:`${fmt(cap.totalM3,2)} m³`},{label:'Productos',value:String(s.productos.length)}].map(it=>(
                <div key={it.label} className="bg-gray-50 border border-gray-100 rounded-lg p-3"><div className="text-[10px] text-gray-400 mb-1">{it.label}</div><div className="font-semibold text-sm text-gray-800">{it.value}</div></div>
              ))}
            </div>
            {nc>0&&(cap.totalKg>0||cap.totalM3>0)&&(
              <div className="grid grid-cols-3 gap-3 mt-3">
                {[{label:'PESO',pct:cap.pctKg,curr:fmt(cap.totalKg,0)+' kg',max:fmt(cap.capKg,0)+' kg'},{label:'VOLUMEN',pct:cap.pctM3,curr:fmt(cap.totalM3,2)+' m³',max:fmt(cap.capM3,1)+' m³'}].map(it=>{
                  const st=it.pct>100?'bg-red-50 border-red-200 text-red-700':it.pct>85?'bg-amber-50 border-amber-200 text-amber-700':'bg-green-50 border-green-200 text-green-700'
                  const bc=it.pct>100?'#A32D2D':it.pct>85?'#EF9F27':'#1168F8'
                  return <div key={it.label} className={`border rounded-lg p-3 ${st}`}><div className="text-[9px] font-bold uppercase tracking-wider mb-1">{it.label}</div><div className="text-xl font-semibold">{fmt(it.pct,1)}%</div><div className="text-[10px] mt-1 opacity-80">{it.curr} de {it.max}</div><div className="h-1.5 bg-white/50 rounded-full overflow-hidden mt-2"><div className="h-full rounded-full" style={{width:`${Math.min(it.pct,100)}%`,background:bc}}/></div></div>
                })}
                <div className="bg-[#EBF2FF] border border-[#93B8FC] rounded-lg p-3"><div className="text-[9px] font-bold uppercase tracking-wider text-[#052698] mb-1">CONTENEDORES</div><div className="text-xl font-semibold text-[#1168F8]">{nc}</div><div className="text-[10px] text-[#1168F8] mt-1">{s.contenedores.map(c=>`${c.cantidad}× ${c.tipo}`).join(', ')}</div></div>
              </div>
            )}
            {s.incoterm==='EXW'&&(
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="text-xs font-medium text-gray-700 mb-3">Puesta a FOB (precio EXW)</div>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Transporte interno China (USD)"><input type="text" inputMode="decimal" onFocus={e=>e.target.select()} value={s.exwTransp} onChange={e=>u('exwTransp',parseNum(e.target.value))} className={inp}/></Field>
                  <Field label="Agente exportación (USD)"><input type="text" inputMode="decimal" onFocus={e=>e.target.select()} value={s.exwAgente} onChange={e=>u('exwAgente',parseNum(e.target.value))} className={inp}/></Field>
                  <Field label="Otros gastos origen (USD)"><input type="text" inputMode="decimal" onFocus={e=>e.target.select()} value={s.exwOtros} onChange={e=>u('exwOtros',parseNum(e.target.value))} className={inp}/></Field>
                </div>
              </div>
            )}
            <div className="mt-4 pt-4 border-t border-gray-100">
              <Field label="Precio equivalente en Argentina (USD) · para comparativa"><input type="text" inputMode="decimal" onFocus={e=>e.target.select()} value={s.precioArgEquiv||''} onChange={e=>u('precioArgEquiv',parseNum(e.target.value))} className={inp} placeholder="0.00"/></Field>
            </div>
          </Card>
          <div className="flex justify-end"><button onClick={()=>setTab('logistica')} className="bg-[#1168F8] text-white px-5 py-2 rounded-lg text-xs font-medium hover:bg-[#0a4fc4] transition-colors">Logística →</button></div>
        </div>
      )}

      {/* ── LOGÍSTICA ── */}
      {tab==='logistica'&&(
        <div className="space-y-4">
          <div className="flex gap-4 items-center px-4 py-2.5 bg-white border border-gray-100 rounded-xl text-xs flex-wrap">
            <span className="font-medium text-gray-700">Tipos de cambio:</span>
            <div className="flex items-center gap-2"><label className="text-gray-500">USD/ARS</label><input type="text" inputMode="decimal" onFocus={e=>e.target.select()} value={s.tcTrib} onChange={e=>u('tcTrib',parseNum(e.target.value)||1000)} className="w-20 px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8]"/></div>
            <div className="flex items-center gap-2"><label className="text-gray-500">USD/CLP</label><input type="text" inputMode="decimal" onFocus={e=>e.target.select()} value={s.tcClp} onChange={e=>u('tcClp',parseNum(e.target.value)||950)} className="w-20 px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8]"/></div>
          </div>

          <SecCard letter="A" label="Flete marítimo internacional" sub="China → Puerto Chile" sub2={subA}
            loadBtn={<button onClick={cargarSeccionA} className="text-[10px] text-[#1168F8] hover:underline flex items-center gap-1">⬇ Cargar tarifa base</button>}>
            <LogRows rows={s.rowsA} onChange={r=>u('rowsA',r)}/>
          </SecCard>

          <SecCard letter="B" label="Seguro de la mercadería" sub2={seg}>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Modalidad"><select value={s.segModo} onChange={e=>u('segModo',e.target.value as any)} className={sel}><option value="pct">% sobre FOB + flete</option><option value="fijo">Monto fijo (USD)</option></select></Field>
              <Field label={s.segModo==='pct'?'Tasa seguro (%)':'Monto fijo (USD)'}><input type="text" inputMode="decimal" onFocus={e=>e.target.select()} value={s.segVal} step={0.1} onChange={e=>u('segVal',parseNum(e.target.value))} className={inp}/></Field>
              <Field label="Seguro calculado"><div className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-right font-mono">USD {fmt(seg)}</div></Field>
            </div>
          </SecCard>

          <SecCard letter="C" label="Gastos en puerto Chile" sub="THC, handling, manipulación · IVA Chile discriminado" sub2={subC}
            loadBtn={<button onClick={cargarSeccionC} className="text-[10px] text-[#1168F8] hover:underline flex items-center gap-1">⬇ Cargar tarifa base</button>}>
            <LogRows rows={s.rowsC} onChange={r=>u('rowsC',r)} withIva/>
          </SecCard>

          {/* D — Modalidad de transporte */}
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#1168F8] text-white text-[10px] font-bold">D</span>
              <span className="font-medium text-sm text-gray-900">Modalidad de transporte desde Chile</span>
            </div>
            <div className="px-5 py-4">
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[{key:'A1',label:'Opción A1',sub:'Desconsolidar + cargar directo al camión'},{key:'A2',label:'Opción A2',sub:'Desconsolidar + almacenar + cargar al camión'},{key:'B',label:'Opción B',sub:'Contenedor completo hasta Argentina'}].map(o=>(
                  <button key={o.key} onClick={()=>u('optTransp',o.key as OptTransp)} className={`px-3 py-2.5 rounded-lg border text-left transition-colors ${s.optTransp===o.key?'border-[#1168F8] bg-[#EBF2FF] text-[#052698]':'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    <div className="text-xs font-semibold">{o.label}</div><div className="text-[10px] opacity-70 mt-0.5">{o.sub}</div>
                  </button>
                ))}
              </div>

              {s.optTransp!=='B'&&(
                <div className="space-y-4">
                  <div>
                    <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Gastos de desconsolidación</div>
                    <DesconRows rows={s.rowsDescon} onChange={r=>u('rowsDescon',r)} totalM3={totalM3}/>
                    {subDescon>0&&<div className="text-right text-xs text-gray-500 mt-1">Subtotal desconsolidación: <strong className="font-mono">USD {fmt(subDescon)}</strong></div>}
                  </div>

                  {s.optTransp==='A2'&&(
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <div className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider mb-3">Almacenaje en Chile</div>
                      <div className="grid grid-cols-4 gap-3 mb-3">
                        <Field label="Volumen a almacenar">
                          <div className="flex gap-1">
                            <select value={s.almModoVol} onChange={e=>u('almModoVol',e.target.value as any)} className={sel+' flex-shrink-0 w-20'}><option value="auto">Auto</option><option value="manual">Manual</option></select>
                            {s.almModoVol==='manual'
                              ?<input type="text" inputMode="decimal" onFocus={e=>e.target.select()} value={s.almVolM3} step={0.1} onChange={e=>u('almVolM3',parseNum(e.target.value))} className={inp} placeholder="m³"/>
                              :<div className="px-2.5 py-1.5 bg-white border border-amber-200 rounded-lg text-xs font-mono flex-1 text-right">{fmt(totalM3,2)} m³</div>
                            }
                          </div>
                        </Field>
                        <Field label="Costo por m³/día (USD)"><input type="text" inputMode="decimal" onFocus={e=>e.target.select()} value={s.almCostoDia} step={0.01} onChange={e=>u('almCostoDia',parseNum(e.target.value))} className={inp}/></Field>
                        <Field label="Días estimados"><input type="text" inputMode="decimal" onFocus={e=>e.target.select()} value={s.almDias} min={1} onChange={e=>u('almDias',parseInt2(e.target.value)||0)} className={inp}/></Field>
                        <Field label="Subtotal almacenaje"><div className="px-2.5 py-1.5 bg-white border border-amber-200 rounded-lg text-xs font-mono text-right font-semibold text-amber-800">USD {fmt(subAlm)}</div></Field>
                      </div>
                      {subAlm>0&&<div className="text-[10px] text-amber-600 bg-white/60 rounded px-3 py-1.5">{fmt(volAlm,2)} m³ × USD {fmt(s.almCostoDia)} × {s.almDias} día(s) = USD {fmt(subAlm)}</div>}
                    </div>
                  )}

                  <div>
                    <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Carga al camión</div>
                    <div className="grid grid-cols-4 gap-3">
                      <Field label="Modalidad cálculo"><select value={s.cargaModo} onChange={e=>u('cargaModo',e.target.value as any)} className={sel}><option value="fijo">Importe fijo (USD)</option><option value="m3">Por m³ (USD/m³)</option></select></Field>
                      <Field label={s.cargaModo==='fijo'?'Importe fijo (USD)':'USD por m³'}><input type="text" inputMode="decimal" onFocus={e=>e.target.select()} value={s.cargaValor} step={0.01} onChange={e=>u('cargaValor',parseNum(e.target.value))} className={inp}/></Field>
                      {s.cargaModo==='m3'&&<Field label="m³ totales"><div className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono text-right">{fmt(totalM3,2)}</div></Field>}
                      <Field label="Subtotal carga"><div className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono text-right font-semibold">USD {fmt(subCarga)}</div></Field>
                    </div>
                    {s.cargaModo==='m3'&&s.cargaValor>0&&<div className="text-[10px] text-gray-500 mt-1.5 px-1">{fmt(totalM3,2)} m³ × USD {fmt(s.cargaValor)} = USD {fmt(subCarga)}</div>}
                  </div>

                  <div className="flex justify-end items-center gap-2 pt-2 border-t border-gray-100 text-xs text-gray-500">
                    Subtotal sección D: <span className="font-mono font-semibold text-gray-800">USD {fmt(subD)}</span>
                  </div>
                </div>
              )}

              {s.optTransp==='B'&&(
                <div>
                  <div className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-lg px-3 py-2 mb-3">El round trip (ida + devolución en un contrato) suele ser más económico. El sistema elige automáticamente.</div>
                  <div className="grid grid-cols-4 gap-3">
                    <Field label="Flete ida (USD/cont)"><input type="text" inputMode="decimal" onFocus={e=>e.target.select()} value={s.ftIda} onChange={e=>u('ftIda',parseNum(e.target.value))} className={inp}/></Field>
                    <Field label="Devolución (USD/cont)"><input type="text" inputMode="decimal" onFocus={e=>e.target.select()} value={s.ftDev} onChange={e=>u('ftDev',parseNum(e.target.value))} className={inp}/></Field>
                    <Field label="Round trip disponible (USD/cont)"><input type="text" inputMode="decimal" onFocus={e=>e.target.select()} value={s.ftRt} onChange={e=>u('ftRt',parseNum(e.target.value))} className={inp} placeholder="0 = no disponible"/></Field>
                    <Field label="Elegido (USD total)"><div className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono text-right">USD {fmt(subTransp)}</div></Field>
                  </div>
                  {s.ftRt>0&&s.ftRt<(s.ftIda+s.ftDev)*nc&&<p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mt-2">✓ Round trip USD {fmt(s.ftRt*nc)} más económico. Ahorro: USD {fmt((s.ftIda+s.ftDev)*nc-s.ftRt*nc)}</p>}
                </div>
              )}
            </div>
            <div className="flex justify-end items-center gap-2 px-5 py-2.5 bg-gray-50 border-t border-gray-100 text-xs text-gray-500">
              Subtotal sección D: <strong className="font-mono text-gray-800">USD {fmt(s.optTransp==='B'?0:subD)}</strong>
            </div>
          </div>

          <SecCard letter="E" label="Transporte terrestre Chile → NOA" sub2={subTransp}
            loadBtn={s.optTransp!=='B'?<button onClick={cargarSeccionE} className="text-[10px] text-[#1168F8] hover:underline flex items-center gap-1">⬇ Cargar tarifa base</button>:undefined}>
            {s.optTransp!=='B'?(
              <div>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <Field label="Flete terrestre (USD/camión)"><input type="text" inputMode="decimal" onFocus={e=>e.target.select()} value={s.ftCamion} onChange={e=>u('ftCamion',parseNum(e.target.value))} className={inp}/></Field>
                  <Field label="N° camiones"><input type="text" inputMode="decimal" onFocus={e=>e.target.select()} value={s.nCamiones} min={1} onChange={e=>u('nCamiones',parseInt2(e.target.value)||1)} className={inp}/></Field>
                  <Field label="Subtotal transporte"><div className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono text-right">USD {fmt(subTransp)}</div></Field>
                </div>
                {s.nCamiones>0&&s.ftCamion>0&&(
                  <div className="bg-[#EBF2FF] border border-[#93B8FC] rounded-lg px-4 py-2.5 text-xs">
                    <div className="font-medium text-[#052698] mb-1">Detalle de camiones</div>
                    <div className="flex flex-wrap gap-3 text-[#1168F8]">
                      <span>{s.nCamiones} camión{s.nCamiones>1?'es':''}</span><span>×</span><span>USD {fmt(s.ftCamion)} por camión</span><span>=</span><span className="font-semibold">USD {fmt(subTransp)} total</span>
                    </div>
                  </div>
                )}
              </div>
            ):(
              <div>
                <div className="text-xs text-gray-500 mb-3">Opción B — Contenedor completo. El flete se calcula en la sección D.</div>
                <div className="bg-[#EBF2FF] border border-[#93B8FC] rounded-lg px-4 py-2.5 text-xs text-[#052698]">Flete elegido: <strong className="font-mono">USD {fmt(subTransp)}</strong></div>
              </div>
            )}
          </SecCard>

          {/* F: Gastos Argentina */}
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#1168F8] text-white text-[10px] font-bold">F</span>
              <span className="font-medium text-sm text-gray-900">Gastos en Argentina</span>
              <span className="text-[10px] text-gray-400">Despachante, desconsolidación, almacenaje, traslado</span>
              <div className="ml-auto flex items-center gap-2">
                {cotArgentina.length>0&&(
                  <select value={s.cotArgId} onChange={e=>e.target.value?aplicarCotArgentina(e.target.value):u('cotArgId','')}
                    className="px-2 py-1 border border-gray-200 rounded-lg text-[10px] bg-white focus:outline-none focus:border-[#1168F8]">
                    <option value="">— Cotización proveedor —</option>
                    {cotArgentina.filter((c:any)=>c.tipo==='especifica').length>0&&(
                      <optgroup label="🎯 Específicas">
                        {cotArgentina.filter((c:any)=>c.tipo==='especifica').map((c:any)=>{
                          const op=(c.operacion as any)?.cotizacion
                          return <option key={c.id} value={c.id}>{c.proveedor} · {c.fecha}{op?` · ${op.num}`:''}</option>
                        })}
                      </optgroup>
                    )}
                    <optgroup label="📋 Genéricas">
                      {cotArgentina.filter((c:any)=>c.tipo==='generica').map((c:any)=>(
                        <option key={c.id} value={c.id}>{c.proveedor} · {c.referencia||c.fecha}</option>
                      ))}
                    </optgroup>
                  </select>
                )}
                <button onClick={cargarSeccionF} className="text-[10px] text-[#1168F8] hover:underline flex items-center gap-1">⬇ Tarifa base</button>
              </div>
            </div>
            <div className="px-5 py-4">
              {/* Badge cotización Argentina */}
              {s.cotArgId&&<div className="text-[10px] text-[#1168F8] bg-[#EBF2FF] px-2.5 py-1.5 rounded-lg mb-3">✓ {s.cotArgLabel}</div>}
              {/* Gastos con lógica especial (% CIF, piso, techo) */}
              {s.gastosArg.length > 0 && (
                <div className="mb-4">
                  <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Gastos pre-configurados</div>
                  <div className="grid gap-2 mb-1 text-[10px] text-gray-400 font-medium uppercase tracking-wide" style={{display:'grid',gridTemplateColumns:'1.5fr 110px 80px 80px 80px 80px 80px',gap:'6px'}}>
                    <div>Concepto</div><div>Tipo</div><div>Valor</div><div>Piso USD</div><div>Techo USD</div><div className="text-right">USD</div><div className="text-right">ARS</div>
                  </div>
                  {s.gastosArg.map((g,i)=>{
                    const usd = calcGastoArg(g, cif, s.tcTrib)
                    const arsEquiv = usd * s.tcTrib
                    return (
                      <div key={g.id} className="mb-2 p-3 bg-gray-50 rounded-lg border border-gray-100">
                        <div style={{display:'grid',gridTemplateColumns:'1fr 110px 90px 90px 90px',gap:'6px',alignItems:'center'}} className="mb-2">
                          {/* Concepto */}
                          <input
                            type="text"
                            value={g.desc}
                            onChange={e=>{const n=[...s.gastosArg];n[i]={...n[i],desc:e.target.value};u('gastosArg',n)}}
                            className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8] bg-white"
                            placeholder="Concepto"
                          />
                          {/* Tipo */}
                          <select value={g.tipoCalc} onChange={e=>{const n=[...s.gastosArg];n[i]={...n[i],tipoCalc:e.target.value as any};u('gastosArg',n)}} className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8] bg-white">
                            <option value="pct_cif">% sobre CIF</option>
                            <option value="fijo_usd">Fijo USD</option>
                            <option value="fijo_ars">Fijo ARS</option>
                          </select>
                          {/* Valor */}
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-gray-400 flex-shrink-0">{g.tipoCalc==='pct_cif'?'%':g.tipoCalc==='fijo_ars'?'ARS':'USD'}</span>
                            <input type="text" inputMode="decimal" value={g.valor||''} placeholder="0" onFocus={e=>e.target.select()} onChange={e=>{const n=[...s.gastosArg];n[i]={...n[i],valor:parseNum(e.target.value)};u('gastosArg',n)}} className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8] text-right font-mono bg-white"/>
                          </div>
                          {/* Piso */}
                          {g.tipoCalc==='pct_cif'
                            ?<div className="flex items-center gap-1"><span className="text-[10px] text-gray-400 flex-shrink-0">Piso</span><input type="text" inputMode="decimal" value={g.pisoUsd||''} placeholder="0" onFocus={e=>e.target.select()} onChange={e=>{const n=[...s.gastosArg];n[i]={...n[i],pisoUsd:parseNum(e.target.value)};u('gastosArg',n)}} className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8] text-right font-mono bg-white"/></div>
                            :<div/>
                          }
                          {/* Techo */}
                          {g.tipoCalc==='pct_cif'
                            ?<div className="flex items-center gap-1"><span className="text-[10px] text-gray-400 flex-shrink-0">Techo</span><input type="text" inputMode="decimal" value={g.techoUsd||''} placeholder="0" onFocus={e=>e.target.select()} onChange={e=>{const n=[...s.gastosArg];n[i]={...n[i],techoUsd:parseNum(e.target.value)};u('gastosArg',n)}} className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8] text-right font-mono bg-white" /></div>
                            :<div/>
                          }
                        </div>
                        {/* Resultado + botón eliminar */}
                        <div className="flex items-center justify-between">
                          <button onClick={()=>u('gastosArg',s.gastosArg.filter((_,j)=>j!==i))} className="text-[10px] text-red-400 hover:text-red-600 transition-colors">🗑 Eliminar</button>
                          <div className="text-right text-xs">
                            <span className="font-mono font-semibold text-[#052698]">USD {fmt(usd)}</span>
                            <span className="text-gray-300 mx-2">·</span>
                            <span className="font-mono text-gray-500 text-[10px]">ARS {Math.round(arsEquiv).toLocaleString('es-AR')}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  <button onClick={()=>u('gastosArg',[...s.gastosArg,{id:Math.random().toString(36).slice(2),desc:'',tipoCalc:'fijo_usd',moneda:'USD',valor:0,pisoUsd:0,techoUsd:0,usd:0,ars:0}])} className="text-xs text-[#1168F8] hover:underline mt-1">+ Agregar gasto</button>
                  <div className="mt-2 pt-2 border-t border-gray-100 flex justify-between text-xs">
                    <span className="text-gray-500">Subtotal gastos Argentina:</span>
                    <div className="text-right">
                      <span className="font-mono font-semibold text-[#052698]">USD {fmt(subGastosArg)}</span>
                      <span className="text-gray-400 ml-2 font-mono text-[10px]">ARS {Math.round(subGastosArg*s.tcTrib).toLocaleString('es-AR')}</span>
                    </div>
                  </div>
                </div>
              )}
              {/* Otros gastos adicionales */}
              {s.rowsE.length > 0 && <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2 mt-3">Otros gastos adicionales</div>}
              <LogRows rows={s.rowsE} onChange={r=>u('rowsE',r)}/>
            </div>
            <div className="flex justify-end items-center gap-3 px-5 py-2.5 bg-gray-50 border-t border-gray-100 text-xs text-gray-500">
              Subtotal sección F: <strong className="font-mono text-gray-800">USD {fmt(subE+subGastosArg)}</strong>
              <span className="text-gray-300">·</span>
              <span className="font-mono text-[10px] text-gray-400">ARS {Math.round((subE+subGastosArg)*s.tcTrib).toLocaleString('es-AR')}</span>
            </div>
          </div>

          <SecCard letter="G" label="Fee Puerto NOA" sub2={fee}>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Fee por contenedor (USD)"><input type="text" inputMode="decimal" onFocus={e=>e.target.select()} value={s.feeCont} onChange={e=>u('feeCont',parseNum(e.target.value))} className={inp}/></Field>
              <Field label="N° contenedores"><div className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-right">{nc}</div></Field>
              <Field label="Fee total (USD)"><div className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono text-right">USD {fmt(fee)}</div></Field>
            </div>
          </SecCard>

          <div className="flex justify-between">
            <button onClick={()=>setTab('embarque')} className="px-4 py-2 border border-gray-200 rounded-lg text-xs hover:bg-gray-50">← Anterior</button>
            <button onClick={()=>setTab('tributos')} className="bg-[#1168F8] text-white px-5 py-2 rounded-lg text-xs font-medium hover:bg-[#0a4fc4]">Tributos ARCA →</button>
          </div>
        </div>
      )}

      {/* ── TRIBUTOS ── */}
      {tab==='tributos'&&(
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[
              {label:'FOB China',value:`USD ${fmt(totalFOB,0)}`,sub:'Precio mercadería + puesta a FOB',bg:'bg-[#EBF2FF] border-[#93B8FC]',tl:'text-[#052698]',tv:'text-[#1168F8]',ts:'text-[#1168F8]'},
              {label:'Flete hasta Jama + Seguro',value:`USD ${fmt(subA+seg,0)}`,sub:'Flete marítimo + seguro',bg:'bg-[#EBF2FF] border-[#93B8FC]',tl:'text-[#052698]',tv:'text-[#1168F8]',ts:'text-[#1168F8]'},
              {label:'Valor CIF Jama — base imponible',value:`USD ${fmt(cif,0)}`,sub:`ARS ${Math.round(cifARS).toLocaleString('es-AR')}`,bg:'bg-[#052698] border-[#052698]',tl:'text-blue-200',tv:'text-white',ts:'text-blue-300'},
            ].map(b=><div key={b.label} className={`${b.bg} border rounded-xl p-4`}><div className={`text-[10px] mb-1 ${b.tl}`}>{b.label}</div><div className={`text-xl font-semibold ${b.tv}`}>{b.value}</div><div className={`text-[10px] mt-1 ${b.ts}`}>{b.sub}</div></div>)}
          </div>

          <Card title="Liquidación ARCA — Aduana Jujuy">
            <div className="grid grid-cols-4 gap-3 mb-4">
              <Field label="Régimen de importación"><select value={s.regimen} onChange={e=>u('regimen',e.target.value as any)} className={sel}>{Object.entries(REG_L).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field>
              <Field label="TC oficial BNA (ARS/USD)"><div className="px-2.5 py-1.5 bg-[#EBF2FF] border border-[#93B8FC] rounded-lg text-xs font-mono text-right font-semibold text-[#052698]">ARS {fmt(s.tcTrib,0)}</div></Field>
              <Field label="Derechos importación % (NCM)"><input type="text" inputMode="decimal" onFocus={e=>e.target.select()} value={s.derPct} step={0.5} onChange={e=>u('derPct',parseNum(e.target.value))} className={inp}/></Field>
              <Field label="NCM principal"><div className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono">{s.productos.find(p=>p.ncm)?.ncm||'—'}</div></Field>
            </div>
            {tribCfg.length===0?(
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-700">No hay tributos configurados para el Régimen {s.regimen}. Configuralos en <strong>Tributos ARCA</strong> (menú lateral).</div>
            ):(
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
                <div className="text-[10px] font-semibold text-gray-500 mb-3 uppercase tracking-wider">RÉGIMEN {s.regimen} — {REG_L[s.regimen]} · SIM Aduana Jujuy</div>
                <div className="grid grid-cols-5 gap-2 text-[9px] font-semibold text-gray-400 uppercase tracking-wide pb-2 border-b border-gray-200 mb-1">
                  <div>Cód.</div><div className="col-span-2">Concepto</div><div className="text-right">Tasa</div><div className="text-right">Importe ARS</div>
                </div>
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
                <div className="text-right text-[10px] text-gray-400 mt-1">Equiv. USD ref.: USD {fmt(totalTribUSD,0)}</div>
              </div>
            )}
          </Card>

          <div className="flex justify-between">
            <button onClick={()=>setTab('logistica')} className="px-4 py-2 border border-gray-200 rounded-lg text-xs hover:bg-gray-50">← Anterior</button>
            <button onClick={()=>setTab('resumen')} className="bg-[#1168F8] text-white px-5 py-2 rounded-lg text-xs font-medium hover:bg-[#0a4fc4]">Ver resumen →</button>
          </div>
        </div>
      )}

      {/* ── RESUMEN ── */}
      {tab==='resumen'&&(
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3 items-center">
            <div className="bg-white border border-gray-100 border-t-4 border-t-[#1168F8] rounded-xl p-5 text-center">
              <div className="text-[10px] text-gray-400 mb-1">Costo total China → {s.destinoNoa}</div>
              <div className="text-2xl font-semibold text-gray-900">USD {fmt(totalLanded,0)}</div>
              <div className="text-[10px] text-gray-400 mt-1">producto + logística + tributos</div>
            </div>
            <div className="text-center text-sm text-gray-400 font-semibold">VS</div>
            <div className="bg-white border border-gray-100 border-t-4 border-t-blue-300 rounded-xl p-5 text-center">
              <div className="text-[10px] text-gray-400 mb-1">Precio equivalente en Argentina</div>
              <div className="text-2xl font-semibold text-gray-900">{s.precioArgEquiv>0?`USD ${fmt(s.precioArgEquiv,0)}`:'—'}</div>
              <div className="text-[10px] text-gray-400 mt-1">precio ingresado</div>
            </div>
          </div>
          {s.precioArgEquiv>0&&(()=>{const d=s.precioArgEquiv-totalLanded;return <div className={`text-xs px-4 py-3 rounded-xl text-center font-medium ${d>0?'bg-[#EBF2FF] text-[#052698] border border-[#93B8FC]':'bg-red-50 text-red-700 border border-red-200'}`}>{d>0?`✓ Importar desde China es USD ${fmt(Math.abs(d),0)} más económico (${Math.round(Math.abs(d)/s.precioArgEquiv*100)}% de ahorro)`:`✗ Importar desde China resulta USD ${fmt(Math.abs(d),0)} más caro que el precio local`}</div>})()}

          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 font-medium text-sm text-gray-900">Desglose completo de costos</div>
            <table className="w-full text-xs">
              <thead><tr className="bg-gray-50"><th className="text-left px-4 py-2.5 text-[10px] text-gray-400 font-medium uppercase tracking-wide">Sección</th><th className="text-left px-4 py-2.5 text-[10px] text-gray-400 font-medium uppercase tracking-wide">Concepto</th><th className="text-right px-4 py-2.5 text-[10px] text-gray-400 font-medium uppercase tracking-wide">USD</th></tr></thead>
              <tbody>
                {[
                  {sec:'Producto',concepto:`Precio mercadería China (${s.incoterm})`,v:totalFOB},
                  ...(s.incoterm==='EXW'?[{sec:'Puesta a FOB',concepto:'Transporte + agente + otros',v:s.exwTransp+s.exwAgente+s.exwOtros}]:[]),
                  {sec:'A — Flete marítimo',concepto:`China → ${PUERTOS_L[s.ptoChile]}`,v:subA},
                  {sec:'B — Seguro',concepto:s.segModo==='pct'?`${s.segVal}% sobre FOB+flete`:'Monto fijo',v:seg},
                  {sec:'C — Puerto Chile',concepto:'THC, handling, gastos portuarios',v:subC},
                  ...(s.optTransp!=='B'&&subDescon>0?[{sec:'D — Desconsolidación',concepto:'Gastos desconsolidación',v:subDescon}]:[]),
                  ...(s.optTransp==='A2'&&subAlm>0?[{sec:'D — Almacenaje',concepto:`${fmt(volAlm,2)} m³ × ${s.almDias} días`,v:subAlm}]:[]),
                  ...(subCarga>0?[{sec:'D — Carga al camión',concepto:s.cargaModo==='m3'?`${fmt(totalM3,2)} m³ × USD ${fmt(s.cargaValor)}`:'Importe fijo',v:subCarga}]:[]),
                  {sec:'E — Transporte terrestre',concepto:s.optTransp!=='B'?`${s.nCamiones} camión(es) × USD ${fmt(s.ftCamion)}`:`${PUERTOS_L[s.ptoChile]} → ${s.destinoNoa}`,v:subTransp},
                  ...(subGastosArg>0?[{sec:'F — Gastos Argentina',concepto:`Despachante y honorarios · ARS ${Math.round(subGastosArg*s.tcTrib).toLocaleString('es-AR')}`,v:subGastosArg}]:[]),
                  ...(subE>0?[{sec:'F — Gastos Argentina',concepto:'Otros gastos',v:subE}]:[]),
                  ...(fee>0?[{sec:'G — Fee Puerto NOA',concepto:`${nc} cont. × USD ${s.feeCont}`,v:fee}]:[]),
                  {sec:'Tributos ARCA',concepto:`Régimen ${s.regimen} · Base CIF Jama`,v:totalTribUSD},
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

          {/* Resumen de totales reorganizado */}
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 font-medium text-sm text-gray-900">Composición del costo total</div>
            <div className="p-4 space-y-2">
              {/* Producto */}
              <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 rounded-lg">
                <div>
                  <div className="text-xs font-medium text-gray-700">Valor mercadería China ({s.incoterm})</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">{s.productos.filter(p=>p.subtotal>0).length} producto(s) · {s.contenedores.map(c=>`${c.cantidad}× ${c.tipo}`).join(', ')}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-semibold text-gray-800">USD {fmt(totalFOB,0)}</div>
                  <div className="text-[10px] text-gray-400 font-mono">{fmt(totalFOB/totalLanded*100,1)}% del total</div>
                </div>
              </div>
              {/* Logística */}
              <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 rounded-lg">
                <div>
                  <div className="text-xs font-medium text-gray-700">Costos logísticos</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">Flete · Seguro · Puerto · Transporte · Gastos Argentina · Fee</div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-semibold text-gray-800">USD {fmt(totalLog,0)}</div>
                  <div className="text-[10px] text-gray-400 font-mono">{fmt(totalLog/totalLanded*100,1)}% del total</div>
                </div>
              </div>
              {/* Tributos */}
              <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 rounded-lg">
                <div>
                  <div className="text-xs font-medium text-gray-700">Tributos ARCA — Aduana Argentina</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">Régimen {s.regimen} · {REG_L[s.regimen]} · Base CIF Jama</div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-semibold text-gray-800">USD {fmt(totalTribUSD,0)}</div>
                  <div className="font-mono text-[10px] text-[#052698] font-medium">ARS {Math.round(totalTribARS).toLocaleString('es-AR')}</div>
                  <div className="text-[10px] text-gray-400 font-mono">{fmt(totalTribUSD/totalLanded*100,1)}% del total</div>
                </div>
              </div>
              {/* Total */}
              <div className="flex items-center justify-between px-3 py-3 bg-[#052698] rounded-lg mt-1">
                <div>
                  <div className="text-xs font-semibold text-white">TOTAL LANDED EN DESTINO</div>
                  <div className="text-[10px] text-blue-200 mt-0.5">USD {fmt(totalLanded/nc,0)} por contenedor · {nc} contenedor(es)</div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold text-white text-xl">USD {fmt(totalLanded,0)}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Tributos y gastos en ARS con TC */}
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 font-medium text-sm text-gray-900">Pagos en Argentina (ARS)</div>
            <div className="divide-y divide-gray-50">
              {/* Tributos aduana */}
              <div className="px-5 py-3.5 flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-gray-700">Tributos Aduana Argentina</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">
                    Régimen {s.regimen} · TC ref. <span className="font-mono font-semibold text-gray-600">ARS {fmt(s.tcTrib,0)}</span> por USD · Se abona al TC oficial del día del despacho
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-semibold text-gray-800 text-base">ARS {Math.round(totalTribARS).toLocaleString('es-AR')}</div>
                  <div className="text-[10px] text-gray-400 font-mono">≈ USD {fmt(totalTribUSD,0)}</div>
                </div>
              </div>
              {/* Gastos Argentina */}
              {(subE+subGastosArg)>0&&(
                <div className="px-5 py-3.5 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium text-gray-700">Gastos Argentina (despachante y otros)</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      TC ref. <span className="font-mono font-semibold text-gray-600">ARS {fmt(s.tcTrib,0)}</span> por USD · Cotización del día del pago efectivo
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-semibold text-gray-800 text-base">ARS {Math.round((subE+subGastosArg)*s.tcTrib).toLocaleString('es-AR')}</div>
                    <div className="text-[10px] text-gray-400 font-mono">≈ USD {fmt(subE+subGastosArg,0)}</div>
                  </div>
                </div>
              )}
              {/* Total ARS */}
              <div className="px-5 py-3 bg-gray-50 flex items-center justify-between">
                <div className="text-xs font-semibold text-gray-700">Total estimado en pesos</div>
                <div className="text-right">
                  <div className="font-mono font-bold text-gray-900 text-base">ARS {Math.round(totalTribARS+(subE+subGastosArg)*s.tcTrib).toLocaleString('es-AR')}</div>
                  <div className="text-[10px] text-gray-400">Tributos + Gastos Argentina</div>
                </div>
              </div>
            </div>
          </div>

          {/* TC consolidado */}
          <div className="bg-white border border-gray-100 rounded-xl px-5 py-3.5">
            <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Tipos de cambio aplicados en esta cotización</div>
            <div className="flex flex-wrap gap-4 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-gray-500">TC oficial BNA (ARS/USD)</span>
                <span className="font-mono font-semibold text-gray-800 bg-[#EBF2FF] px-2 py-0.5 rounded">ARS {fmt(s.tcTrib,0)}</span>
                <span className="text-[10px] text-gray-400">para tributos y gastos locales</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-500">CLP/USD</span>
                <span className="font-mono font-semibold text-gray-800 bg-gray-100 px-2 py-0.5 rounded">CLP {fmt(s.tcClp,0)}</span>
                <span className="text-[10px] text-gray-400">para gastos en Chile</span>
              </div>
            </div>
            <div className="text-[10px] text-amber-600 mt-2">⚠ Valores de referencia a la fecha de cotización. Los pagos se realizarán al TC oficial del día efectivo.</div>
          </div>

          <div className="flex justify-between">
            <button onClick={()=>setTab('tributos')} className="px-4 py-2 border border-gray-200 rounded-lg text-xs hover:bg-gray-50">← Anterior</button>
            <button onClick={guardar} disabled={saving} className="bg-[#1168F8] text-white px-6 py-2 rounded-lg text-xs font-medium hover:bg-[#0a4fc4] disabled:opacity-60">
              {saving?'Guardando...':'✓ Guardar cotización'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
