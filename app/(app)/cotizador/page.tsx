'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { fmt, calcCapacidad, CONT_CAPS, PUERTOS_L, nextCotNum } from '@/lib/utils'
import type { ContenedorCot, ProductoCot } from '@/types'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import CotizacionDoc from '@/components/CotizacionDoc'

type Tab = 'embarque' | 'mercaderia' | 'logistica' | 'tributos' | 'resumen'
type OptTransp = 'A' | 'B1' | 'B2'

interface ItemLog { id: string; desc: string; cant: number; unitario: number; ivaChile?: 'exento'|'gravado'; tipoCalc?: 'fijo'|'m3' }
interface Proforma {
  id: string; numero: string; proveedor: string; fecha: string
  archivo_url?: string; archivo_nombre?: string
}
interface GastoArg {
  id: string; desc: string; tipoCalc: 'pct_cif'|'fijo_usd'|'fijo_ars'
  moneda: 'USD'|'ARS'; valor: number; pisoUsd: number; techoUsd: number
  usd: number; ars: number
}
interface TribCfg { id: string; codigo: string; concepto: string; tipo: 'pct'|'fijo'; valor: number; aplica: boolean; orden: number }

// Ítem seleccionado de una cotización de proveedor
interface ItemSelProv {
  itemId: string
  descripcion: string
  tipo_calculo: string
  valorUnit: number
  cantCotizada: number
  cantUsar: number
  tipoContenedor: string
  subtotal: number
  seleccionado: boolean
  origen_id?: string|null
  destino_id?: string|null
  paso_id?: string|null
  tipo_flete?: string|null
  // Campos de producto (solo mercadería)
  ncm?: string
  pesoUnit?: number
  volUnit?: number
  incoterm?: string
}
// Cotización de proveedor seleccionada (FW, transporte Chile, transporte terrestre)
interface CotProvSel {
  uid: string
  cotProvId: string
  proveedorNombre: string
  referencia: string
  fechaEmision: string
  fechaVencimiento: string
  tipo: 'generica'|'especifica'
  clienteId: string|null
  estado: string
  usadaEnCots: string[]
  items: ItemSelProv[]
  elegida: boolean
  seguroIncluido: boolean
  seguroModo: 'pct'|'fijo'
  seguroMonto: number
  segAlcance: 'no'|'maritimo'|'punta_a_punta'
  esManual?: boolean
  manualMonto?: number
}
// Gastos post-entrega Chile (modo manual, cuando no hay cotización del sistema)
interface GastoChile {
  id: string; desc: string; proveedor: string
  tipoCalc: 'fijo'|'m3'; valor: number; ivaChile: 'exento'|'gravado'
}

interface CotState {
  cliente: string; cuit: string; email: string; telefono: string
  despachante: string; ivaCondicion: string; validez: string
  origen: string; ptoChile: string; destinoNoa: string; incoterm: string
  transito: string; notas: string
  // IDs de catálogos geográficos
  puertoChiId: string; puertoChileId: string; pasoId: string; ciudadDestinoId: string
  sentido: 'importacion' | 'exportacion'
  bloquesActivos: string[]
  incluirArca: boolean
  observaciones: string[]
  modalidadCarga: 'contenedor' | 'bulk' | 'mixta'
  bulkDescripcion: string; bulkPesoTon: number; bulkVolM3: number
  cantBigbags: number
  contenedores: ContenedorCot[]; productos: ProductoCot[]
  exwTransp: number; exwAgente: number; exwOtros: number; precioArgEquiv: number
  proformas: Proforma[]
  // Bloque 1 - ForWarders (nuevo sistema item-a-item)
  cotsProvFW: CotProvSel[]
  segModoIndep: 'pct'|'fijo'; segValIndep: number
  // Bloque 2 - Transporte Chile-NOA
  cotsProvChile: CotProvSel[]
  gastosChile: GastoChile[]
  // Bloque 0 - Mercadería (proformas del proveedor)
  cotsProvMerc: CotProvSel[]
  // Bloque 3 - Transporte terrestre
  cotsProvTransp: CotProvSel[]
  // Bloque 3 - Transporte terrestre (igual que antes)
  optTransp: OptTransp; rowsDescon: ItemLog[]
  almModoVol: 'auto'|'manual'; almVolM3: number; almCostoDia: number; almDias: number
  cargaModo: 'fijo'|'m3'; cargaValor: number
  ftCamion: number; nCamiones: number; ftIda: number; ftDev: number; ftRt: number
  estadiaCargaVal: number; estadiaCargaDias: number; estadiaDescargaVal: number; estadiaDescargaDias: number
  // Bloque 4 - Gastos Argentina
  // Sección A: honorario único del despachante + items adicionales del despachante
  honTipo: 'pct_cif'|'fijo_usd'|'fijo_ars'
  honValor: number; honPiso: number; honTecho: number
  gastosDesp: GastoArg[]
  // Sección B: otros gastos en Argentina con tipoCalc completo
  rowsE: GastoArg[]
  // Bloque 5 - Fee
  feeModo: 'cont'|'pct'
  feeCont: number
  feePct: number
  // TC y tributos
  tcClp: number; regimen: 'A'|'B'|'C'|'D'; tcTrib: number; derPct: number
}

const INIT: CotState = {
  cliente:'',cuit:'',email:'',telefono:'',despachante:'',ivaCondicion:'Responsable Inscripto',validez:'',
  origen:'Dalian, China (CNDAG)',ptoChile:'IQQ',destinoNoa:'Jujuy',incoterm:'FOB',transito:'44-46 dias',notas:'',
  puertoChiId:'',puertoChileId:'',pasoId:'',ciudadDestinoId:'',
  sentido: 'importacion' as 'importacion'|'exportacion',
  bloquesActivos: [] as string[],  // IDs de bloques activos — vacío = todos activos
  incluirArca: true,
  observaciones: [] as string[],   // Filas de observaciones al final
  modalidadCarga:'contenedor',
  bulkDescripcion:'',bulkPesoTon:0,bulkVolM3:0,
  cantBigbags: 0,
  contenedores:[{tipo:'40HC',cantidad:1} as any],
  productos:[{descripcion:'',ncm:'',cantidad:1,precio_unit:0,subtotal:0,peso_unit:0,vol_unit:0,incoterm:'FOB'}],
  exwTransp:0,exwAgente:0,exwOtros:0,precioArgEquiv:0,proformas:[],
  cotsProvFW:[],
  segModoIndep:'pct',segValIndep:0.5,
  cotsProvChile:[],
  gastosChile:[],
  cotsProvTransp:[],
  cotsProvMerc:[],
  optTransp:'A',rowsDescon:[],
  almModoVol:'auto',almVolM3:0,almCostoDia:0,almDias:0,
  cargaModo:'fijo',cargaValor:0,
  ftCamion:0,nCamiones:1,ftIda:0,ftDev:0,ftRt:0,
  estadiaCargaVal:0,estadiaCargaDias:0,estadiaDescargaVal:0,estadiaDescargaDias:0,
  rowsE:[],gastosDesp:[],honTipo:'fijo_usd',honValor:0,honPiso:0,honTecho:0,feeModo:'cont',feeCont:0,feePct:0,
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
const uid2 = () => Math.random().toString(36).slice(2)

function Field({label,children}:{label:string;children:React.ReactNode}){
  return <div><label className="block text-[10px] font-medium text-gray-500 mb-1">{label}</label>{children}</div>
}
function Card({title,children}:{title:string;children:React.ReactNode}){
  return <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm"><div className="px-5 py-3 border-b border-gray-100 bg-gray-50 font-medium text-sm text-gray-900">{title}</div><div className="px-5 py-4">{children}</div></div>
}

function DesconRows({rows,onChange,totalM3}:{rows:ItemLog[];onChange:(r:ItemLog[])=>void;totalM3:number}){
  return (<div className="space-y-2">
    {rows.map((r,i)=>(
      <div key={r.id} className="grid grid-cols-4 gap-2 items-center">
        <input value={r.desc} onChange={e=>{const n=[...rows];n[i]={...n[i],desc:e.target.value};onChange(n)}}
          className="col-span-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8]" placeholder="Descripción"/>
        <select value={r.tipoCalc} onChange={e=>{const n=[...rows];n[i]={...n[i],tipoCalc:e.target.value as any};onChange(n)}}
          className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:border-[#1168F8]">
          <option value="fijo">Fijo (USD)</option><option value="m3">Por m3</option>
        </select>
        {r.tipoCalc==='m3'
          ?<div className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-right font-mono">{(totalM3||0).toFixed(2)} m3</div>
          :<input type="text" inputMode="decimal" value={r.cant||''} onFocus={e=>e.target.select()}
              onChange={e=>{const n=[...rows];n[i]={...n[i],cant:parseFloat(e.target.value)||0};onChange(n)}}
              className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-right font-mono focus:outline-none focus:border-[#1168F8]" placeholder="Cant."/>}
        <input type="text" inputMode="decimal" value={r.unitario||''} onFocus={e=>e.target.select()}
          onChange={e=>{const n=[...rows];n[i]={...n[i],unitario:parseFloat(e.target.value)||0};onChange(n)}}
          className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-right font-mono focus:outline-none focus:border-[#1168F8]" placeholder={r.tipoCalc==='m3'?'USD/m3':'USD'}/>
        <button onClick={()=>onChange(rows.filter((_,j)=>j!==i))} className="text-gray-400 hover:text-red-500 text-xs">✕</button>
      </div>
    ))}
    <button onClick={()=>onChange([...rows,{id:Math.random().toString(36).slice(2),desc:'',cant:1,unitario:0,ivaChile:'exento',tipoCalc:'fijo'}])}
      className="text-[10px] text-[#1168F8] hover:underline">+ Agregar item</button>
  </div>)
}

export default function CotizadorPage(){
const topRef=useRef<HTMLDivElement>(null)
const [s,setS]=useState<CotState>(INIT)
const [tab,setTab]=useState<Tab>('embarque')
// Catálogos geográficos
const [puertosChi,setPuertosChi]=useState<any[]>([])
const [puertosChile,setPuertosChile]=useState<any[]>([])
const [pasosFront,setPasosFront]=useState<any[]>([])
const [ciudadesArg,setCiudadesArg]=useState<any[]>([])
const [tiposCont,setTiposCont]=useState<any[]>([])
const [tiposCamion,setTiposCamion]=useState<any[]>([])
const [cotsFWDisponibles,setCotsFWDisponibles]=useState<any[]>([])
const [cotsTranspDisponibles,setCotsTranspDisponibles]=useState<any[]>([])
const [cotsMercDisponibles,setCotsMercDisponibles]=useState<any[]>([])
const [condicionesGenerales,setCondicionesGenerales]=useState<any[]>([])
const [cotsArgDisponibles,setCotsArgDisponibles]=useState<any[]>([])
const [cotsChileDisponibles,setCotsChileDisponibles]=useState<any[]>([])
// Cotizaciones de operaciones usadas (para detectar "ya usada en X")
const [cotsSistemaUsadas,setCotsSistemaUsadas]=useState<Record<string,string[]>>({})
// Rubros por bloque (desde cotizador_bloque_rubros)
const [rubrosBloque,setRubrosBloque]=useState<Record<number,string[]>>({1:[],2:[],3:[],4:[]})
const [bloques,setBloques]=useState<any[]>([])
const [bloqueMerc,setBloqueMerc]=useState<any>(null)
const [cotNumActual,setCotNumActual]=useState<string>('')
// Terceros proveedores por rubro (para búsqueda en carga manual)
const [tercerosProv,setTercerosProv]=useState<any[]>([])



// Cotizaciones de proveedores seleccionadas por bloque
const [provUsado,setProvUsado]=useState<Record<number,string|null>>({0:null,1:null,2:null,3:null,4:null})
const [terceros,setTerceros]=useState<any[]>([])
const [despachantes,setDespachantes]=useState<any[]>([])
const [despachanteSelId,setDespachanteSelId]=useState<string|null>(null)
const [cotDesp,setCotDesp]=useState<{id:string;referencia:string;fecha:string;tipo:'generica'|'especifica'}|null>(null)
const [buscarDespachante,setBuscarDespachante]=useState('')
const [showDespachanteDropdown,setShowDespachanteDropdown]=useState(false)
const [loadingDesp,setLoadingDesp]=useState(false)
const [buscarCliente,setBuscarCliente]=useState('')
const [showClienteDropdown,setShowClienteDropdown]=useState(false)
const [clienteSelId,setClienteSelId]=useState<string|null>(null)
const [histCliente,setHistCliente]=useState<any[]>([])
// Alta rápida de cliente no registrado
const [showAltaCli,setShowAltaCli]=useState(false)
const [altaCliNombre,setAltaCliNombre]=useState('')
const [altaCliTipoDoc,setAltaCliTipoDoc]=useState('CUIT')
const [altaCliNroDoc,setAltaCliNroDoc]=useState('')
const [altaCliIva,setAltaCliIva]=useState('')
const [altaCliSaving,setAltaCliSaving]=useState(false)
const [showHist,setShowHist]=useState(false)

const [tribCfg,setTribCfg]=useState<TribCfg[]>([])
const [saving,setSaving]=useState(false)
// Preview de impresión (Etapa 2): muestra el documento lindo antes de guardar
const [showPreview,setShowPreview]=useState(false)
const [previewCot,setPreviewCot]=useState<any>(null)
const [previewEjecutivo,setPreviewEjecutivo]=useState<any>(null)
const [previewCondGen,setPreviewCondGen]=useState<string[]>([])
const supabase=createClient()
const router=useRouter()

useEffect(()=>{
  supabase.from('tipos_cambio_eventos').select('ars,clp').order('created_at',{ascending:false}).limit(1)
    .then(({data})=>{
      if(data&&data.length>0){
        const row=data[0] as any
        if(row.ars) setS(p=>({...p,tcTrib:row.ars}))
        if(row.clp) setS(p=>({...p,tcClp:row.clp}))
      }
    })
  supabase.from('terceros').select('id,razon_social,nombre_fantasia,nro_doc,tipo_doc,condicion_iva,dir_fiscal_ciudad,pais,contactos:tercero_contactos(email,telefono,principal)')
    .eq('activo','true')
    .filter('tipo', 'cs', '{"cliente"}')
    .then(({data})=>{if(data) setTerceros(data)})
  // Cargar condiciones generales (catálogo) — activas, ordenadas
  supabase.from('condiciones_generales').select('texto,orden,activo').eq('activo',true).order('orden')
    .then(({data})=>{if(data) setCondicionesGenerales(data)})
  // Cargar despachantes (proveedores con rubro despachante de aduana)
  supabase.from('tercero_rubros')
    .select('tercero_id, rubro:proveedor_rubros!inner(nombre), tercero:terceros!inner(id,razon_social,activo)')
    .eq('rubro.nombre','Despachante de aduana')
    .then(({data})=>{
      if(data){
        const desps=(data as any[]).filter(r=>r.tercero?.activo!==false).map(r=>r.tercero)
        setDespachantes(desps)
      }
    })
  // Cargar cotizaciones por bloque_id + usadas + terceros
  Promise.all([
    supabase.from('cotizador_bloques').select('id,numero,nombre').eq('activo',true).order('numero'),
    supabase.from('cotizaciones_proveedor_v2')
      .select('*, items:cotizaciones_proveedor_v2_items(*)')
      .eq('estado','vigente')
      .order('fecha',{ascending:false}),
    supabase.from('cotizacion_proveedores_usados')
      .select('cotizacion_proveedor_id, cotizacion:cotizaciones!inner(num)')
      .limit(500),
    supabase.from('tercero_rubros')
      .select('tercero_id, rubro:proveedor_rubros!inner(nombre), tercero:terceros!inner(id,razon_social,activo)')
      .filter('tercero.activo','eq','true'),
  ]).then(([bloqRes,cotRes,usadasRes,trRes])=>{
    // Separar el bloque Mercadería (numero=0) de los bloques logísticos.
    // Los logísticos mantienen sus números 1-4 y los MISMOS índices de array de siempre
    // (0=Marítimo...3=Argentina), para no romper bloqueActivo(N)/bloques[N]/idPorNum existentes.
    const todos = (bloqRes.data || []) as any[]
    const bloqueMercaderia = todos.find(b=>b.numero===0 || /mercader/i.test(b.nombre||''))
    const logisticos = todos.filter(b=>!(b.numero===0 || /mercader/i.test(b.nombre||'')))
    if(bloqueMercaderia) setBloqueMerc(bloqueMercaderia)
    // Guardar nombres de bloques para UI (rubros por bloque sigue usando numero original)
    const rb:Record<number,string[]>={1:[],2:[],3:[],4:[]}
    for(const b of logisticos) rb[b.numero]=[b.nombre]
    setBloques(logisticos)
    setRubrosBloque(rb)
    // Terceros proveedores
    if(trRes.data){
      const provs=(trRes.data as any[])
        .filter(r=>r.tercero?.activo!==false)
        .map(r=>({...r.tercero, rubro:(r.rubro as any)?.nombre||''}))
      setTercerosProv(provs)
    }
    // Mapa de cotizaciones usadas
    const usadasMap:Record<string,string[]>={}
    if(usadasRes.data){
      for(const u of usadasRes.data as any[]){
        const pid=u.cotizacion_proveedor_id
        const num=(u.cotizacion as any)?.num||''
        if(!usadasMap[pid]) usadasMap[pid]=[]
        if(num) usadasMap[pid].push(num)
      }
    }
    setCotsSistemaUsadas(usadasMap)
    // Filtrar por bloque_id — directo y limpio
    if(cotRes.data && bloqRes.data){
      const cots=cotRes.data as any[]
      const idPorNum:Record<number,string>={}
      for(const b of bloqRes.data as any[]) idPorNum[b.numero]=b.id
      setCotsFWDisponibles(cots.filter(c=>c.bloque_id===idPorNum[1]))
      setCotsChileDisponibles(cots.filter(c=>c.bloque_id===idPorNum[2]))
      setCotsTranspDisponibles(cots.filter(c=>c.bloque_id===idPorNum[3]))
      setCotsArgDisponibles(cots.filter(c=>c.bloque_id===idPorNum[4]))
      setCotsMercDisponibles(cots.filter(c=>c.bloque_id===idPorNum[0]))
    }
  })
  // Catálogos geográficos y tipos de camión
  Promise.all([
    supabase.from('puertos_china').select('id,locode,nombre,ciudad').eq('activo','true').order('orden'),
    supabase.from('puertos_chile').select('id,locode,nombre,ciudad').eq('activo','true').order('orden'),
    supabase.from('pasos_fronterizos').select('id,nombre,provincia_argentina,restriccion_invierno').eq('activo','true').order('orden'),
    supabase.from('ciudades_destino_arg').select('id,ciudad,provincia').eq('activo','true').order('orden'),
    supabase.from('tipos_contenedor').select('id,codigo,nombre').eq('activo','true').order('orden'),
    supabase.from('tipos_camion').select('id,nombre,icono').eq('activo','true').order('orden'),
  ]).then(([ch,cl,ps,ci,tc,tca])=>{
    if(ch.data) setPuertosChi(ch.data)
    if(cl.data) setPuertosChile(cl.data)
    if(ps.data) setPasosFront(ps.data)
    if(ci.data) setCiudadesArg(ci.data)
    if(tc.data) setTiposCont(tc.data)
    if(tca.data) setTiposCamion(tca.data)
  })
},[])
useEffect(()=>{loadTrib()},[s.regimen])
useEffect(()=>{
  // Pre-cargar nCamiones según contenedores seleccionados
  setS(p=>{
    const ncTotal=p.contenedores.reduce((s,c)=>s+c.cantidad,0)||1
    return {...p,nCamiones:p.nCamiones===1?ncTotal:p.nCamiones}
  })
},[s.contenedores])

async function loadTrib(){
  const {data}=await supabase.from('tributos_config').select('*').eq('regimen',s.regimen).eq('aplica',true).order('orden')
  if(data){
    setTribCfg(data as TribCfg[])
    const der=(data as TribCfg[]).find(t=>t.codigo==='010')
    if(der) setS(p=>({...p,derPct:der.valor}))
  }
}

const u=<K extends keyof CotState>(k:K,v:CotState[K])=>setS(p=>({...p,[k]:v}))
const cambiarTab=(t:Tab)=>{setTab(t);setTimeout(()=>{topRef.current?.scrollIntoView({behavior:'smooth',block:'start'})},50)}
const nc=s.contenedores.reduce((t,c)=>t+c.cantidad,0)||1
// Bloque 0: Mercadería — proforma del proveedor elegida (sus productos)
const mercElegida = s.cotsProvMerc.find(c=>c.elegida)
const mercItems = mercElegida ? mercElegida.items : []
// FOB de la proforma: suma de (cantidad × precio unitario) de sus productos
const fobProforma = mercElegida
  ? mercItems.reduce((t,it)=>t + (it.cantUsar||it.cantCotizada||0)*(it.valorUnit||0), 0)
  : 0
// Si hay proforma elegida, el FOB sale de ella; si no, del modelo viejo (s.productos) por compatibilidad
const totalFOB = mercElegida
  ? fobProforma
  : s.productos.reduce((t,p)=>t+p.subtotal,0)+(s.incoterm==='EXW'?s.exwTransp+s.exwAgente+s.exwOtros:0)
const totalM3 = mercElegida
  ? mercItems.reduce((t,it)=>t + (it.cantUsar||it.cantCotizada||0)*((it as any).volUnit||0), 0)
  : s.productos.reduce((t,p)=>t+p.vol_unit*p.cantidad,0)

// Bloque 1: ForWarder elegido y sus ítems seleccionados
const fwElegida = s.cotsProvFW.find(c=>c.elegida)
const subFW = fwElegida
  ? fwElegida.esManual
    ? (fwElegida.manualMonto||0)
    : fwElegida.items.filter(i=>i.seleccionado).reduce((t,i)=>t+i.subtotal,0)
  : 0
const segFW = fwElegida?.segAlcance!=='no'
  ? (fwElegida?.seguroModo==='pct'
      ? totalFOB*(fwElegida?.seguroMonto||0)/100
      : (fwElegida?.seguroMonto||0))
  : 0
const segIndepCalc = fwElegida?.segAlcance==='maritimo'
  ? (s.segModoIndep==='pct'?(totalFOB+subFW)*s.segValIndep/100:s.segValIndep)
  : 0
const totalSeg = segFW
// Bloque 2: Transporte Chile-NOA (cotizaciones del sistema)
// Bloque 2: Transporte Chile-NOA (cotizaciones del sistema)
const transpChileElegida = s.cotsProvChile.find(c=>c.elegida)
const subTranspChile = transpChileElegida
  ? transpChileElegida.esManual
    ? (transpChileElegida.manualMonto||0)
    : transpChileElegida.items.filter(i=>i.seleccionado).reduce((t,i)=>t+i.subtotal,0)
  : 0
// Bloque 3: Flete terrestre (cotizaciones del sistema para B1/B2)
const transpTerrElegida = s.cotsProvTransp.find(c=>c.elegida)
const subTranspTerr = transpTerrElegida
  ? transpTerrElegida.esManual
    ? (transpTerrElegida.manualMonto||0)
    : transpTerrElegida.items.filter(i=>i.seleccionado).reduce((t,i)=>t+i.subtotal,0)
  : 0

// Bloque 2: Gastos Chile post-entrega
const subGastosChile=s.gastosChile.reduce((t,g)=>{
  const b=(g.tipoCalc==='m3'?g.valor*totalM3:g.valor)
  return t+(g.ivaChile==='gravado'?b*1.19:b)
},0)

// Bloque 3: Transporte + desconsolidacion
const volAlm=s.almModoVol==='auto'?totalM3:s.almVolM3
const subAlm=s.optTransp==='B2'?volAlm*s.almCostoDia*s.almDias:0
const subDescon=s.rowsDescon.reduce((t,r)=>t+(r.tipoCalc==='m3'?r.unitario*totalM3:r.cant*r.unitario),0)
const subCarga=s.optTransp!=='A'?(s.cargaModo==='m3'?s.cargaValor*totalM3:s.cargaValor):0
const subD=subDescon+subAlm+subCarga
// subTransp: usa cotizaciones del sistema si hay, sino cálculo manual
const subTransp=s.optTransp==='A'
  // Opción A: cotización del sistema si hay, sino ida/dev/rt manual
  ?(transpTerrElegida?subTranspTerr:(()=>{const ida=s.ftIda*nc,dev=s.ftDev*nc,rt=s.ftRt*nc;return rt>0&&rt<(ida+dev)?rt:ida+dev})())
  // B1/B2: usa cotizaciones del sistema si hay, sino inputs manuales
  :(transpTerrElegida?subTranspTerr:s.ftCamion*s.nCamiones)

// Estadias
const subEstadias=s.estadiaCargaVal*s.estadiaCargaDias+s.estadiaDescargaVal*s.estadiaDescargaDias
// Seguro terrestre (solo si seguro FW es maritimo)
// Bloque 4: Gastos Argentina
const calcGastoArg=(g:GastoArg,cifUsd:number,tcTrib:number):number=>{
  let usd=0
  if(g.tipoCalc==='pct_cif'){
    usd=cifUsd*g.valor/100
    if(g.pisoUsd>0&&usd<g.pisoUsd) usd=g.pisoUsd
    if(g.techoUsd>0&&usd>g.techoUsd) usd=g.techoUsd
  } else if(g.tipoCalc==='fijo_usd'){usd=g.valor}
  else {usd=g.valor/(tcTrib||1)}
  return usd
}
const cif=totalFOB+subFW+totalSeg
const cifARS=cif*s.tcTrib
// Honorario + gastos adicionales despachante (sección A)
const subHon=calcGastoArg({id:'hon',desc:'',tipoCalc:s.honTipo,moneda:'USD',valor:s.honValor,pisoUsd:s.honPiso,techoUsd:s.honTecho,usd:0,ars:0},cif,s.tcTrib)
const subGastosDesp=s.gastosDesp.reduce((t,g)=>t+calcGastoArg(g,cif,s.tcTrib),0)
const subGastosArg=subHon+subGastosDesp
// Otros gastos Argentina sección B
const subE=s.rowsE.reduce((t,r)=>t+calcGastoArg(r,cif,s.tcTrib),0)
// Base logística para el fee (sin FOB, sin ARCA, sin el propio fee)
const baseLogFee=subFW+totalSeg+subGastosChile+subD+subTransp+subEstadias+segIndepCalc+subE+subGastosArg
const fee=s.feeModo==='pct' ? baseLogFee*s.feePct/100 : s.feeCont*nc

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
// ── Mercadería como bloque: activa si su id está en bloquesActivos (o si la lista está vacía = todos activos) ──
const mercaderiaActiva = (): boolean => {
  if (!bloqueMerc) return s.incluirArca // fallback legacy si no se cargó el bloque
  if (s.bloquesActivos.length === 0) return true
  return s.bloquesActivos.includes(bloqueMerc.id)
}
// ── REGLA FUNDAMENTAL: ARCA solo existe si hay mercadería (base CIF) ──
// Sin mercadería no puede haber tributos aduaneros. La mercadería puede existir sin ARCA, pero no al revés.
// Mercadería "existe" si su bloque está activo Y tiene valor FOB cargado.
const hayMercaderia = mercaderiaActiva() && totalFOB > 0
const arcaActivo = hayMercaderia && s.incluirArca
const totalTribUSD = arcaActivo ? totalTribARS/s.tcTrib : 0
const totalLog=subFW+totalSeg+subGastosChile+subD+subTransp+subEstadias+segIndepCalc+subE+subGastosArg+fee
const totalLanded=totalFOB+totalLog+totalTribUSD
const productosParaCap = mercElegida
  ? mercItems.map(it=>({vol_unit:(it as any).volUnit||0, cantidad:it.cantUsar||0, peso_unit:(it as any).pesoUnit||0} as any))
  : s.productos
const cap=calcCapacidad(s.contenedores,productosParaCap)

// ── Lógica adaptativa del resumen: solo se muestra lo que se cotiza ──
// Helper local (la función bloqueActivo se define más abajo; replicamos su lógica acá)
const bloqueActivoCalc = (idx:number):boolean => {
  if (s.bloquesActivos.length === 0) return true
  const bloque = bloques[idx]
  if (!bloque) return true
  return s.bloquesActivos.includes((bloque as any).id)
}
// Subtotales por bloque (ya con su condición de bloque activo)
const subBloque0 = bloqueActivoCalc(0) ? subFW+totalSeg : 0                    // marítimo (FW + seguro)
const subBloque1 = bloqueActivoCalc(1) ? subGastosChile+subDescon+subAlm+subCarga : 0  // Chile
const subBloque2 = bloqueActivoCalc(2) ? subTransp : 0                          // terrestre
const subBloque3 = bloqueActivoCalc(3) ? subE+subGastosArg : 0                  // Argentina
const subBloque4 = bloqueActivoCalc(4) ? fee : 0                                // fee
// Lista de bloques logísticos con valor > 0 (para contar cuántos hay y armar la etiqueta)
const bloquesConValor = [
  {idx:0, sub:subBloque0, etiqueta:'Flete marítimo'},
  {idx:1, sub:subBloque1, etiqueta:'Gastos en Chile'},
  {idx:2, sub:subBloque2, etiqueta:'Flete terrestre'},
  {idx:3, sub:subBloque3, etiqueta:'Gastos en Argentina'},
  {idx:4, sub:subBloque4, etiqueta:'Fee de servicio'},
].filter(b=>b.sub>0)
// Denominador para los porcentajes: el total REAL de lo que se cotiza (no un landed con mercadería inexistente)
const totalReal = totalLanded // ya incluye solo lo que tiene valor (FOB=0 si no hay merc, ARCA=0 si no aplica)
// Etiqueta adaptativa del total y del KPI principal
const etiquetaTotal = hayMercaderia
  ? 'Mercadería puesta en destino'
  : bloquesConValor.length===1
    ? bloquesConValor[0].etiqueta
    : (totalLog>0 ? 'Costo logístico total' : (arcaActivo ? 'Tributos ARCA' : 'Total de la operación'))



// ── Helpers para manejar CotProvSel genéricamente ──────────────
const isVigente = (fv:string) => !fv || new Date(fv) >= new Date()

// Filtro por sentido: muestra las cotizaciones del sentido actual + las sin sentido (legacy)
const coincideSentido = (c:any) => !c.sentido || c.sentido === s.sentido

// Coincidencia de ruta de una cotización terrestre con la operación actual.
// Devuelve 'fuerte' (origen+paso+destino igual), 'parcial' (destino+paso igual, otro origen) o '' (no coincide / sin datos).
// En impo: origen=puerto Chile, destino=ciudad NOA. En expo: origen=ciudad NOA, destino=puerto Chile.
const coincidenciaRuta = (c:any): ''|'parcial'|'fuerte' => {
  const items = c.items || []
  if(items.length===0) return ''
  const esExpo = s.sentido==='exportacion'
  const opOrigen  = esExpo ? s.ciudadDestinoId : s.puertoChileId   // de dónde sale el camión
  const opDestino = esExpo ? s.puertoChileId : s.ciudadDestinoId   // a dónde llega
  const opPaso    = s.pasoId
  // Si la operación no tiene destino ni paso definidos, no podemos evaluar
  if(!opDestino && !opPaso) return ''
  let fuerte=false, parcial=false
  for(const it of items){
    const okDestino = opDestino && it.destino_id===opDestino
    const okPaso    = !opPaso || it.paso_id===opPaso
    const okOrigen  = opOrigen && it.origen_id===opOrigen
    if(okDestino && okPaso && okOrigen) fuerte=true
    else if(okDestino && okPaso) parcial=true
  }
  return fuerte ? 'fuerte' : parcial ? 'parcial' : ''
}

// ¿Un ítem terrestre (tarifa) pertenece al tramo que coincide con la ruta de la operación?
// El par {origen,destino} se compara SIN orden, así ida, vuelta y round trip del mismo tramo coinciden todas.
const itemCoincideRuta = (it:any): boolean => {
  const ptoChile = s.puertoChileId
  const ciudadNoa = s.ciudadDestinoId
  const opPaso = s.pasoId
  if(!ptoChile || !ciudadNoa) return false
  const par = new Set([it.origen_id, it.destino_id])
  const coincidePar = par.has(ptoChile) && par.has(ciudadNoa)
  const coincidePaso = !opPaso || it.paso_id===opPaso
  return coincidePar && coincidePaso
}

// ── Forwarder (Bloque 1): coincidencia por puertos China ↔ Chile ──
// Coincidencia de una cotización de forwarder con la ruta marítima de la operación.
const coincidenciaRutaFW = (c:any): ''|'parcial'|'fuerte' => {
  const items = c.items || []
  const china = s.puertoChiId
  const chile = s.puertoChileId
  if(!china && !chile) return ''
  // Usa la ruta de cabecera de la cotización si los ítems no tienen puntos
  const checkPar = (oId:any,dId:any) => {
    const par = new Set([oId,dId])
    const okChina = !china || par.has(china)
    const okChile = !chile || par.has(chile)
    return { fuerte: (china&&chile)? (par.has(china)&&par.has(chile)) : false, parcial: okChina||okChile }
  }
  let fuerte=false, parcial=false
  if(items.length>0){
    for(const it of items){
      const r=checkPar(it.origen_id,it.destino_id)
      if(r.fuerte) fuerte=true; else if(r.parcial) parcial=true
    }
  }
  // fallback a cabecera
  const rc=checkPar(c.puerto_china_id,c.puerto_chile_id)
  if(rc.fuerte) fuerte=true; else if(rc.parcial) parcial=true
  return fuerte ? 'fuerte' : parcial ? 'parcial' : ''
}
// ¿Un ítem de forwarder coincide con la ruta marítima? (par puertos sin orden)
const itemCoincideRutaFW = (it:any): boolean => {
  const china = s.puertoChiId
  const chile = s.puertoChileId
  if(!china || !chile) return false
  const par = new Set([it.origen_id, it.destino_id])
  return par.has(china) && par.has(chile)
}

// Listas filtradas por sentido — reaccionan al cambiar s.sentido
const cotsFW = cotsFWDisponibles.filter(coincideSentido)
const cotsChile = cotsChileDisponibles.filter(coincideSentido)
const cotsTransp = cotsTranspDisponibles.filter(coincideSentido)
const cotsArg = cotsArgDisponibles.filter(coincideSentido)

// Verificar si un bloque está activo (por índice 0-based en array de bloques cargados)
const bloqueActivo = (idx: number): boolean => {
  if (s.bloquesActivos.length === 0) return true
  const bloque = bloques[idx]
  if (!bloque) return true
  return s.bloquesActivos.includes((bloque as any).id)
}
const fmtFecha = (f:string) => f ? f.split('-').reverse().join('/') : '—'

// Proforma de mercadería desde el sistema: mapea productos con su cantidad real, NCM, peso, volumen
function cotMercDesdeSistema(cot:any, usadas:string[]): CotProvSel {
  const items: ItemSelProv[] = (cot.items||[]).map((it:any)=>{
    const cant = parseNum(String(it.cantidad||0)) || 1
    const valorUnit = parseNum(String(it.valor||0))
    return {
      itemId: it.id||uid2(),
      descripcion: it.descripcion||'',
      tipo_calculo: 'producto',
      valorUnit,
      cantCotizada: cant,
      cantUsar: cant,
      tipoContenedor: '',
      subtotal: valorUnit * cant,
      seleccionado: true, // en mercadería todos los productos van juntos
      origen_id: null, destino_id: null, paso_id: null, tipo_flete: null,
      // datos de producto extra (para mostrar y para cálculos futuros por NCM)
      ncm: it.ncm||'',
      pesoUnit: parseNum(String(it.peso_unit||0)),
      volUnit: parseNum(String(it.vol_unit||0)),
      incoterm: it.incoterm||'FOB',
    } as any
  })
  return {
    uid: uid2(),
    cotProvId: cot.id,
    proveedorNombre: cot.proveedor_nombre||'',
    referencia: cot.referencia||'',
    fechaEmision: cot.fecha||'',
    fechaVencimiento: cot.fecha_vencimiento||'',
    tipo: cot.tipo==='especifica'?'especifica':'generica',
    clienteId: cot.cliente_id||null,
    estado: isVigente(cot.fecha_vencimiento||'')?'vigente':'vencida',
    usadaEnCots: usadas,
    items,
    elegida: false,
    seguroIncluido: false, seguroModo: 'pct', seguroMonto: 0, segAlcance: 'no',
  }
}

function cotProvDesdeSistema(cot:any, contenedoresH1:{tipo:string;cantidad:number}[], usadas:string[]): CotProvSel {
  const items: ItemSelProv[] = (cot.items||[]).map((it:any)=>{
    const esBigbag = it.tipo_calculo === 'por_bigbag'
    const cantSug = esBigbag
      ? (contenedoresH1 as any).__bigbags__ || 1
      : contenedoresH1.find(c=>c.tipo===it.tipo_contenedor)?.cantidad || 1
    const valorUnit = parseNum(String(it.valor||0))
    return {
      itemId: it.id||uid2(),
      descripcion: it.descripcion||'',
      tipo_calculo: it.tipo_calculo||'fijo_usd',
      valorUnit,
      cantCotizada: cantSug,
      cantUsar: cantSug,
      tipoContenedor: it.tipo_contenedor||'',
      subtotal: valorUnit * cantSug,
      seleccionado: false,
      origen_id: it.origen_id||null,
      destino_id: it.destino_id||null,
      paso_id: it.paso_id||null,
      tipo_flete: it.tipo_flete||null,
    }
  })
  return {
    uid: uid2(),
    cotProvId: cot.id,
    proveedorNombre: cot.proveedor_nombre||'',
    referencia: cot.referencia||'',
    fechaEmision: cot.fecha||'',
    fechaVencimiento: cot.fecha_vencimiento||'',
    tipo: cot.tipo==='especifica'?'especifica':'generica',
    clienteId: cot.cliente_id||null,
    estado: isVigente(cot.fecha_vencimiento||'')?'vigente':'vencida',
    usadaEnCots: usadas,
    items,
    elegida: false,
    seguroIncluido: cot.seguro_incluido||false,
    seguroModo: (cot.seguro_modo||'pct') as 'pct'|'fijo',
    seguroMonto: parseNum(String(cot.seguro_monto||0)),
    segAlcance: (cot.seguro_incluido?'maritimo':'no') as any,
  }
}

// FW desde sistema
function agregarFWDesdeSistema(cotId:string){
  const cot = cotsFWDisponibles.find(c=>c.id===cotId)
  if(!cot) return
  const usadas = cotsSistemaUsadas[cotId]||[]
  const nueva = cotProvDesdeSistema(cot, s.contenedores, usadas)
  nueva.elegida = s.cotsProvFW.length===0
  setS(p=>({...p, cotsProvFW:[...p.cotsProvFW, nueva]}))
  setProvUsado(pv=>({...pv,1:cotId}))
}

function agregarFWManual(){
  const nueva: CotProvSel = {
    uid:uid2(), cotProvId:'', proveedorNombre:'', referencia:'',
    fechaEmision:new Date().toISOString().slice(0,10), fechaVencimiento:'',
    tipo:'generica', clienteId:null, estado:'vigente', usadaEnCots:[],
    items:[{itemId:uid2(),descripcion:'Flete marítimo',tipo_calculo:'fijo_usd',valorUnit:0,cantCotizada:nc,cantUsar:nc,tipoContenedor:'',subtotal:0,seleccionado:true}],
    elegida:s.cotsProvFW.length===0,
    seguroIncluido:false, seguroModo:'pct', seguroMonto:0, segAlcance:'no',
    esManual:false,
  }
  setS(p=>({...p, cotsProvFW:[...p.cotsProvFW, nueva]}))
}

function elegirCotProv(campo:'cotsProvFW'|'cotsProvChile'|'cotsProvTransp'|'cotsProvMerc', uid:string){
  setS(p=>({...p, [campo]:p[campo].map((c:CotProvSel)=>({...c,elegida:c.uid===uid}))}))
}

function eliminarCotProv(campo:'cotsProvFW'|'cotsProvChile'|'cotsProvTransp'|'cotsProvMerc', uid:string){
  setS(p=>{
    const nuevas = (p[campo] as CotProvSel[]).filter(c=>c.uid!==uid)
    if(nuevas.length>0&&!nuevas.some(c=>c.elegida)) nuevas[0].elegida=true
    return {...p,[campo]:nuevas}
  })
}

function toggleItemCotProv(campo:'cotsProvFW'|'cotsProvChile'|'cotsProvTransp'|'cotsProvMerc', cotUid:string, itemId:string){
  setS(p=>({...p,[campo]:(p[campo] as CotProvSel[]).map(c=>{
    if(c.uid!==cotUid) return c
    return {...c,items:c.items.map(i=>{
      if(i.itemId!==itemId) return i
      const sel = !i.seleccionado
      return {...i,seleccionado:sel,subtotal:sel?i.valorUnit*i.cantUsar:0}
    })}
  })}))
}

function setCantUsarCotProv(campo:'cotsProvFW'|'cotsProvChile'|'cotsProvTransp'|'cotsProvMerc', cotUid:string, itemId:string, cant:number){
  setS(p=>({...p,[campo]:(p[campo] as CotProvSel[]).map(c=>{
    if(c.uid!==cotUid) return c
    return {...c,items:c.items.map(i=>{
      if(i.itemId!==itemId) return i
      return {...i,cantUsar:cant,subtotal:i.seleccionado?i.valorUnit*cant:0}
    })}
  })}))
}

function updateSegAlcanceFW(cotUid:string, segAlcance:'no'|'maritimo'|'punta_a_punta'){
  setS(p=>({...p,cotsProvFW:p.cotsProvFW.map(c=>c.uid===cotUid?{...c,segAlcance}:c)}))
}

// Transporte Chile desde sistema
function agregarTranspChileDesdeSistema(cotId:string){
  const cot = cotsChileDisponibles.find(c=>c.id===cotId)
  if(!cot) return
  const usadas = cotsSistemaUsadas[cotId]||[]
  const nueva = cotProvDesdeSistema(cot, s.contenedores, usadas)
  nueva.elegida = s.cotsProvChile.length===0
  setS(p=>({...p, cotsProvChile:[...p.cotsProvChile, nueva]}))
  setProvUsado(pv=>({...pv,2:cotId}))
}

// Transporte terrestre desde sistema
function agregarTranspTerrDesdeSistema(cotId:string){
  const cot = cotsTranspDisponibles.find(c=>c.id===cotId)
  if(!cot) return
  const usadas = cotsSistemaUsadas[cotId]||[]
  const nueva = cotProvDesdeSistema(cot, s.contenedores, usadas)
  nueva.elegida = s.cotsProvTransp.length===0
  setS(p=>({...p, cotsProvTransp:[...p.cotsProvTransp, nueva]}))
  setProvUsado(pv=>({...pv,3:cotId}))
}

// Mercadería: agregar proforma del sistema. Reemplaza la elegida (solo una proforma activa a la vez).
function agregarMercDesdeSistema(cotId:string){
  const cot = cotsMercDisponibles.find(c=>c.id===cotId)
  if(!cot) return
  const usadas = cotsSistemaUsadas[cotId]||[]
  const nueva = cotMercDesdeSistema(cot, usadas)
  nueva.elegida = true
  // Al elegir una proforma, las demás dejan de estar elegidas
  setS(p=>({...p, cotsProvMerc:[...p.cotsProvMerc.map(c=>({...c,elegida:false})), nueva]}))
  setProvUsado(pv=>({...pv,0:cotId}))
}

// Buscar terceros proveedores por rubros del bloque
function tercerosPorBloque(bloque:number){
  const rubros=rubrosBloque[bloque]||[]
  if(rubros.length===0) return tercerosProv
  return tercerosProv.filter(t=>rubros.includes(t.rubro))
}

// Crear tercero mínimo desde el cotizador
async function crearTerceroMinimo(razonSocial:string, rubro:string):Promise<string|null>{
  const {data,error}=await (supabase.from('terceros') as any).insert({
    razon_social:razonSocial,
    tipo:['proveedor'],
    activo:true,
    pais:'',
  }).select('id').single()
  if(error||!data) return null
  const terceroId=(data as any).id
  // Buscar id del rubro
  const {data:rubroData}=await supabase.from('proveedor_rubros').select('id').eq('nombre',rubro).limit(1)
  if(rubroData&&rubroData.length>0){
    await (supabase.from('tercero_rubros') as any).insert({tercero_id:terceroId,rubro_id:(rubroData[0] as any).id})
  }
  // Refrescar tercerosProv
  const {data:newT}=await supabase.from('terceros').select('id,razon_social').eq('id',terceroId).single()
  if(newT) setTercerosProv(p=>[...p,{...(newT as any),rubro}])
  return terceroId
}





  // Gastos Chile manual (cuando no hay cotización del sistema)
function agregarGastoChileDesdeSistema(cotId:string){
  const cot=cotsChileDisponibles.find(c=>c.id===cotId)
  if(!cot) return
  const nuevos:GastoChile[]=(cot.items||[]).map((it:any)=>({
    id:uid2(),desc:it.descripcion,proveedor:cot.proveedor_nombre,
    tipoCalc:(it.tipo_calculo==='por_m3'?'m3':'fijo') as 'fijo'|'m3',
    valor:it.valor||0,ivaChile:'exento' as const,
  }))
  setS(p=>({...p,gastosChile:[...p.gastosChile,...nuevos]}))
}

async function seleccionarDespachante(d:any){
  setDespachanteSelId(d.id)
  u('despachante',d.razon_social)
  setBuscarDespachante('')
  setShowDespachanteDropdown(false)
  setLoadingDesp(true)
  const {data:cots}=await supabase.from('cotizaciones_proveedor_v2')
    .select('*,items:cotizaciones_proveedor_v2_items(*)')
    .eq('tercero_id',d.id)
    .eq('estado','vigente')
    .order('fecha',{ascending:false})
    .limit(1)
  if(cots&&cots.length>0){
    const cot=cots[0] as any
    const items=cot.items||[]
    const it=items[0] as any
    if(it){
      setS(p=>({...p,
        honTipo:(it.tipo_calculo==='pct_cif'?'pct_cif':it.tipo_calculo==='fijo_ars'?'fijo_ars':'fijo_usd') as any,
        honValor:it.valor||0,honPiso:it.piso_usd||0,honTecho:it.techo_usd||0,
        gastosDesp:items.slice(1).map((x:any)=>({id:uid2(),desc:x.descripcion,tipoCalc:(x.tipo_calculo==='pct_cif'?'pct_cif':x.tipo_calculo==='fijo_ars'?'fijo_ars':'fijo_usd') as any,moneda:'USD' as const,valor:x.valor||0,pisoUsd:x.piso_usd||0,techoUsd:x.techo_usd||0,usd:0,ars:0})),
      }))
    }
    setProvUsado(pv=>({...pv,4:cot.id}))
    setCotDesp({id:cot.id,referencia:cot.referencia||'',fecha:cot.fecha||'',tipo:(cot.tipo==='especifica'?'especifica':'generica')})
  } else {
    setS(p=>({...p,honTipo:'fijo_usd',honValor:0,honPiso:0,honTecho:0,gastosDesp:[]}))
    setCotDesp(null)
  }
  setLoadingDesp(false)
}

async function selectCliente(t:any){
  const contactoPpal=t.contactos?.find((c:any)=>c.principal)||t.contactos?.[0]
  u('cliente',t.razon_social);u('cuit',t.nro_doc||'');u('email',contactoPpal?.email||'');u('telefono',contactoPpal?.telefono||'')
  u('ivaCondicion',t.condicion_iva||'Responsable Inscripto')
  setClienteSelId(t.id);setBuscarCliente(t.razon_social);setShowClienteDropdown(false)
  const {data}=await supabase.from('cotizaciones').select('id,num,estado,total_landed,created_at').eq('tercero_id',t.id).order('created_at',{ascending:false}).limit(5)
  if(data) setHistCliente(data)
  setShowHist(true)
}

// ── Alta rápida de cliente no registrado ──
function abrirAltaCliente(){
  setAltaCliNombre(s.cliente||buscarCliente||'')
  setAltaCliTipoDoc('CUIT')
  setAltaCliNroDoc(s.cuit||'')
  setAltaCliIva('')
  setShowClienteDropdown(false)
  setShowAltaCli(true)
}
async function crearClienteRapido(){
  if(!altaCliNombre.trim()){alert('Ingresá la razón social');return}
  setAltaCliSaving(true)
  try {
    const payload:any={ razon_social:altaCliNombre.trim(), tipo:['cliente'], activo:true, pais:'Argentina' }
    if(altaCliNroDoc.trim()){ payload.tipo_doc=altaCliTipoDoc; payload.nro_doc=altaCliNroDoc.trim() }
    if(altaCliIva){ payload.condicion_iva=altaCliIva }
    const {data:nuevo,error}=await (supabase.from('terceros') as any)
      .insert(payload).select('id,razon_social,nro_doc,tipo_doc,condicion_iva').single()
    if(error||!nuevo){alert('Error al crear el cliente: '+(error?.message||''));setAltaCliSaving(false);return}
    // Vincular a la cotización
    u('cliente',nuevo.razon_social)
    u('cuit',nuevo.nro_doc||'')
    if(nuevo.condicion_iva) u('ivaCondicion',nuevo.condicion_iva)
    setClienteSelId(nuevo.id)
    setBuscarCliente(nuevo.razon_social)
    // Agregar a la lista local para que quede disponible enseguida
    setTerceros((prev:any[])=>[...prev,{id:nuevo.id,razon_social:nuevo.razon_social,nro_doc:nuevo.nro_doc,tipo_doc:nuevo.tipo_doc,condicion_iva:nuevo.condicion_iva,contactos:[]}])
    setShowAltaCli(false)
    setShowHist(false)
    setAltaCliSaving(false)
  } catch(e:any){
    console.error('Error en alta rápida de cliente:',e)
    alert('Error al crear el cliente: '+(e?.message||'revisá la consola'))
    setAltaCliSaving(false)
  }
}

async function duplicarCotizacion(cotId:string){
  const {data:orig}=await supabase.from('cotizaciones').select('*').eq('id',cotId).single()
  if(!orig) return
  const {data:tcData}=await supabase.from('tipos_cambio_eventos').select('ars,clp').order('created_at',{ascending:false}).limit(1).single()
  const tcArs=(tcData as any)?.ars
  const tcClp=(tcData as any)?.clp
  const snap=(orig as any).estado_cotizador
  if(snap && typeof snap==='object'){
    // Duplicación completa: cargamos el estado entero y solo pisamos TC actualizado + limpiamos notas
    setS(p=>({
      ...p,           // base por si el snapshot viejo no tiene algún campo nuevo
      ...snap,
      tcTrib: tcArs || snap.tcTrib || p.tcTrib,
      tcClp:  tcClp || snap.tcClp  || p.tcClp,
      notas:'',
    }))
  } else {
    // Cotización vieja sin snapshot: copiamos lo básico que está persistido (fallback)
    setS(p=>({...p,
      cliente:(orig as any).cliente,cuit:(orig as any).cuit||'',
      productos:(orig as any).productos||p.productos,
      contenedores:(orig as any).tipo_contenedores||p.contenedores,
      origen:(orig as any).origen||p.origen,ptoChile:(orig as any).puerto_chile||p.ptoChile,
      destinoNoa:(orig as any).destino_noa||p.destinoNoa,incoterm:(orig as any).incoterm||p.incoterm,
      transito:(orig as any).transito||p.transito,
      puertoChiId:(orig as any).puerto_china_id||p.puertoChiId,
      puertoChileId:(orig as any).puerto_chile_id||p.puertoChileId,
      pasoId:(orig as any).paso_id||p.pasoId,
      ciudadDestinoId:(orig as any).ciudad_destino_id||p.ciudadDestinoId,
      regimen:(orig as any).regimen||p.regimen,derPct:(orig as any).derechos_pct||p.derPct,
      optTransp:(orig as any).opcion_transporte||p.optTransp,validez:(orig as any).validez||p.validez,
      observaciones:Array.isArray((orig as any).condiciones_particulares)?(orig as any).condiciones_particulares:p.observaciones,
      tcTrib:tcArs||p.tcTrib,tcClp:tcClp||p.tcClp,notas:'',
    }))
  }
  // Re-vincular el cliente (preselección + historial)
  if((orig as any).tercero_id){
    setClienteSelId((orig as any).tercero_id)
    setBuscarCliente((orig as any).cliente||'')
    const {data:hist}=await supabase.from('cotizaciones').select('id,num,estado,total_landed,created_at').eq('tercero_id',(orig as any).tercero_id).order('created_at',{ascending:false}).limit(5)
    if(hist) setHistCliente(hist)
  }
  setCotNumActual('')  // será una cotización nueva
  cambiarTab('embarque')
  alert('Cotización duplicada con la fecha y el tipo de cambio actualizados. Revisá los valores, ajustá lo que necesites y guardá.')
}

// Filtra cotizaciones por bloque: especificas del cliente primero, luego genericas
function filtrarCotsBloque(cots: any[], clienteId: string|null) {
  const especificas = cots.filter(c => c.tipo === 'especifica' && clienteId && c.cliente_id === clienteId)
  const genericas = cots.filter(c => c.tipo === 'generica')
  return { especificas, genericas }
}

async function guardar(){
  if(!s.cliente){alert('Ingresa el nombre del cliente.');return}
  setSaving(true)
  try {
    const {data:cots}=await supabase.from('cotizaciones').select('num')
    const num=nextCotNum(cots||[])
    setCotNumActual(num)
    const {data:user}=await supabase.auth.getUser()
    if(!user.user){alert('Sesion expirada.');setSaving(false);return}
    const {data:uDB}=await supabase.from('usuarios').select('id').eq('auth_id',user.user.id).single()
    const uid=(uDB as any)?.id||''
    const presupuesto=[
      ...(subFW>0?[{etapa:'forwarder',tipo:'flete',concepto:`ForWarder: ${fwElegida?.proveedorNombre||'Manual'}`,usd:subFW}]:[]),
      ...(totalSeg>0?[{etapa:'forwarder',tipo:'seguro',concepto:'Seguro mercaderia',usd:totalSeg}]:[]),
      ...(subGastosChile>0?[{etapa:'chile',tipo:'servicios',concepto:'Gastos post-entrega Chile',usd:subGastosChile}]:[]),
      ...(subD>0?[{etapa:'chile',tipo:'desconsolidacion',concepto:`Desconsolidacion (Opcion ${s.optTransp})`,usd:subD}]:[]),
      ...(subTransp>0?[{etapa:'terrestre',tipo:'flete',concepto:'Transporte terrestre',usd:subTransp}]:[]),
      ...(subEstadias>0?[{etapa:'terrestre',tipo:'estadia',concepto:'Estadias por demora',usd:subEstadias}]:[]),
      ...(segIndepCalc>0?[{etapa:'terrestre',tipo:'seguro',concepto:'Seguro terrestre',usd:segIndepCalc}]:[]),
      ...(subE>0?[{etapa:'argentina',tipo:'servicios',concepto:'Gastos Argentina',usd:subE}]:[]),
      ...(subGastosArg>0?[{etapa:'argentina',tipo:'gastos_arg',concepto:'Gastos Argentina (despachante)',usd:subGastosArg}]:[]),
      ...(totalTribUSD>0?[{etapa:'tributos',tipo:'tributos',concepto:`Tributos ARCA Regimen ${s.regimen}`,usd:totalTribUSD}]:[]),
      ...(fee>0?[{etapa:'fee',tipo:'fee',concepto:'Fee Puerto NOA',usd:fee}]:[]),
    ]
    const {error}=await (supabase.from('cotizaciones') as any).insert({
      num,version:1,
      cliente:s.cliente,cuit:s.cuit,email_cliente:s.email,telefono_cliente:s.telefono,
      tercero_id:clienteSelId||null,
      origen:s.origen,puerto_chile:s.ptoChile,destino_noa:s.destinoNoa,incoterm:s.incoterm,
      transito:s.transito,notas:s.notas,
      condiciones_particulares:s.observaciones.filter((o:string)=>o&&o.trim()),
      puerto_china_id:s.puertoChiId||null,
      puerto_chile_id:s.puertoChileId||null,
      paso_id:s.pasoId||null,
      ciudad_destino_id:s.ciudadDestinoId||null,
      tipo_contenedores:s.contenedores,productos:s.productos,proformas:s.proformas,
      total_fob:totalFOB,total_logistico:totalLog,
      total_tributos_usd:totalTribUSD,total_tributos_ars:totalTribARS,
      total_landed:totalLanded,precio_arg_equiv:s.precioArgEquiv||null,
      regimen:s.regimen,tc_ars:s.tcTrib,derechos_pct:s.derPct,
      opcion_transporte:s.optTransp,validez:s.validez,estado:'borrador',
      estado_cotizador:s,
      ejecutivo_id:uid,creado_por:uid,modificado_por:uid,presupuesto,
    })
    if(error){alert('Error al guardar: '+error.message);setSaving(false);return}
    // Obtener el id de la cotizacion recien creada
    const {data:cotGuardada}=await supabase.from('cotizaciones').select('id').eq('num',num).single()
    if(cotGuardada) {
      const provUsados=Object.entries(provUsado)
        .filter(([_,cotProvId])=>cotProvId)
        .map(([bloque,cotProvId])=>({
          cotizacion_id:(cotGuardada as any).id,
          cotizacion_proveedor_id:cotProvId,
          bloque:parseInt(bloque)
        }))
      if(provUsados.length>0){
        await (supabase.from('cotizacion_proveedores_usados') as any).insert(provUsados)
      }
    }
    router.push('/registro')
  } catch(e:any){alert('Error inesperado: '+e.message);setSaving(false)}
}

const clientesFiltrados=terceros.filter(t=>
  t.razon_social.toLowerCase().includes((buscarCliente||s.cliente).toLowerCase())||
  (t.nro_doc||'').includes(buscarCliente||s.cliente)||
  (t.nombre_fantasia||'').toLowerCase().includes((buscarCliente||s.cliente).toLowerCase())
).slice(0,8)

  // ── Etapa 2: arma el objeto cot (forma que espera CotizacionDoc) desde el estado actual y abre el preview ──
  async function abrirPreview() {
    if(!s.cliente){alert('Ingresá el nombre del cliente antes de previsualizar.');return}
    const presupuesto=[
      ...(subFW>0?[{etapa:'forwarder',tipo:'flete',concepto:`ForWarder: ${fwElegida?.proveedorNombre||'Manual'}`,usd:subFW}]:[]),
      ...(totalSeg>0?[{etapa:'forwarder',tipo:'seguro',concepto:'Seguro mercaderia',usd:totalSeg}]:[]),
      ...(subGastosChile>0?[{etapa:'chile',tipo:'servicios',concepto:'Gastos post-entrega Chile',usd:subGastosChile}]:[]),
      ...(subD>0?[{etapa:'chile',tipo:'desconsolidacion',concepto:`Desconsolidacion (Opcion ${s.optTransp})`,usd:subD}]:[]),
      ...(subTransp>0?[{etapa:'terrestre',tipo:'flete',concepto:'Transporte terrestre',usd:subTransp}]:[]),
      ...(subEstadias>0?[{etapa:'terrestre',tipo:'estadia',concepto:'Estadias por demora',usd:subEstadias}]:[]),
      ...(segIndepCalc>0?[{etapa:'terrestre',tipo:'seguro',concepto:'Seguro terrestre',usd:segIndepCalc}]:[]),
      ...(subE>0?[{etapa:'argentina',tipo:'servicios',concepto:'Gastos Argentina',usd:subE}]:[]),
      ...(subGastosArg>0?[{etapa:'argentina',tipo:'gastos_arg',concepto:'Gastos Argentina (despachante)',usd:subGastosArg}]:[]),
      ...(totalTribUSD>0?[{etapa:'tributos',tipo:'tributos',concepto:`Tributos ARCA Regimen ${s.regimen}`,usd:totalTribUSD}]:[]),
      ...(fee>0?[{etapa:'fee',tipo:'fee',concepto:'Fee Puerto NOA',usd:fee}]:[]),
    ]
    const cot={
      num: cotNumActual||'BORRADOR',
      cliente:s.cliente, cuit:s.cuit, email_cliente:s.email, telefono_cliente:s.telefono,
      despachante:s.despachante,
      origen:s.origen, puerto_chile:s.ptoChile, destino_noa:s.destinoNoa, incoterm:s.incoterm,
      transito:s.transito, notas:s.notas, validez:s.validez, estado:'borrador',
      condiciones_particulares:s.observaciones.filter((o:string)=>o&&o.trim()),
      tipo_contenedores:s.contenedores, productos:s.productos,
      total_fob:totalFOB, total_logistico:totalLog,
      total_tributos_usd:totalTribUSD, total_tributos_ars:totalTribARS,
      total_landed:totalLanded, precio_arg_equiv:s.precioArgEquiv||0,
      regimen:s.regimen, tc_ars:s.tcTrib, derechos_pct:s.derPct,
      opcion_transporte:s.optTransp, presupuesto,
      created_at:new Date().toISOString(),
    }
    // Ejecutivo (firma) para el documento
    try{
      const {data:user}=await supabase.auth.getUser()
      if(user.user){
        const {data:uDB}=await supabase.from('usuarios').select('*').eq('auth_id',user.user.id).single()
        if(uDB) setPreviewEjecutivo(uDB)
      }
    }catch(e){/* sin ejecutivo, el doc usa placeholder */}
    setPreviewCondGen(condicionesGenerales.map((c:any)=>c.texto))
    setPreviewCot(cot)
    setShowPreview(true)
  }

  // Confirmar desde el preview: guarda y redirige a la página de registro (documento imprimible)
  async function confirmarYGuardar() {
    setShowPreview(false)
    await guardar()
  }

  function generarImpresion() {
    const esExpo = s.sentido==='exportacion'
    const destinoLabel = esExpo ? (s.origen?s.origen.split(' (')[0]:'Origen') : (s.destinoNoa||'Destino')
    const ruta = esExpo
      ? [s.destinoNoa||'Argentina', s.pasoId?pasosFront.find((p:any)=>p.id===s.pasoId)?.nombre||'Paso':'', s.ptoChile||'Puerto Chile'].filter(Boolean).join(' → ')
      : [s.origen?s.origen.split(' (')[0]:'Origen', s.ptoChile||'Puerto Chile', s.pasoId?pasosFront.find((p:any)=>p.id===s.pasoId)?.nombre||'Paso':'', s.destinoNoa||'Destino'].filter(Boolean).join(' → ')
    const fecha = new Date().toLocaleDateString('es-AR',{day:'2-digit',month:'long',year:'numeric'})

    const filas = [
      ...(hayMercaderia?[{sec:'Mercadería',concepto:'Valor '+s.incoterm+' · precio en origen',v:totalFOB,sub:false,mercaderia:true}]:[]),
      ...(hayMercaderia&&s.incoterm==='EXW'&&(s.exwTransp+s.exwAgente+s.exwOtros)>0?[{sec:'· Puesta a FOB',concepto:'Transporte + agente + otros',v:s.exwTransp+s.exwAgente+s.exwOtros,sub:true}]:[]),
      ...(bloqueActivo(0)&&subFW>0?[{sec:'· '+( bloques[0]?.nombre||'Marítimo'),concepto:fwElegida?.proveedorNombre||'ForWarder',v:subFW,sub:true}]:[]),
      ...(bloqueActivo(0)&&totalSeg>0?[{sec:'· Seguro',concepto:segFW>0?'Incluido en ForWarder':'Independiente',v:totalSeg,sub:true}]:[]),
      ...(bloqueActivo(1)&&(subGastosChile+subDescon+subAlm+subCarga)>0?[{sec:'· '+(bloques[1]?.nombre||'Chile'),concepto:'Gastos en Chile · Op. '+s.optTransp,v:subGastosChile+subDescon+subAlm+subCarga,sub:true}]:[]),
      ...(bloqueActivo(2)&&subTransp>0?[{sec:'· '+(bloques[2]?.nombre||'Terrestre'),concepto:'Flete terrestre',v:subTransp,sub:true}]:[]),
      ...(bloqueActivo(3)&&(subE+subGastosArg)>0?[{sec:'· '+(bloques[3]?.nombre||'Argentina'),concepto:'Despachante + honorarios + otros',v:subE+subGastosArg,sub:true}]:[]),
      ...(bloqueActivo(4)&&fee>0?[{sec:'· '+(bloques[4]?.nombre||'Fee PN'),concepto:'Fee de servicio logístico',v:fee,sub:true}]:[]),
    ].filter(r=>r.v>0)

    const pagosARS = [
      ...(arcaActivo&&totalTribUSD>0?[{concepto:'Tributos ARCA',quien:'AFIP / aduana argentina',monto:Math.round(totalTribARS).toLocaleString('es-AR'),moneda:'ARS'}]:[]),
      ...(bloqueActivo(3)&&subGastosArg>0?[{concepto:'Despachante de aduana',quien:'Honorarios + gastos despacho',monto:Math.round(subGastosArg*s.tcTrib).toLocaleString('es-AR'),moneda:'ARS'}]:[]),
      ...(bloqueActivo(2)&&subTransp>0?[{concepto:'Flete terrestre',quien:esExpo?'NOA → Puerto Chile':'Puerto Chile → destino NOA',monto:Math.round(subTransp*s.tcTrib).toLocaleString('es-AR'),moneda:'ARS'}]:[]),
    ]
    const totalPagosARS = Math.round((arcaActivo?totalTribARS:0)+(bloqueActivo(3)&&subGastosArg>0?subGastosArg*s.tcTrib:0)+(bloqueActivo(2)&&subTransp>0?subTransp*s.tcTrib:0))

    const bloquesActivos2 = [...(hayMercaderia?[bloqueMerc?.nombre||'Mercadería']:[]), ...bloques.filter((_:any,i:number)=>bloqueActivo(i)).map((b:any)=>b.nombre)].join(' · ')

    const css = `
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:Arial,sans-serif;font-size:11px;color:#111;background:white}
      .page{padding:14mm 14mm 12mm;min-height:267mm;position:relative;}
      .page-break{page-break-before:always}
      .hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;padding-bottom:10px;border-bottom:2px solid #1168F8}
      .hdr-right{text-align:right}
      .num{font-size:15px;font-weight:700;color:#052698;font-family:monospace}
      .fecha{font-size:10px;color:#666;margin-top:2px}
      .sec-t{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#666;margin-bottom:5px;padding-bottom:3px;border-bottom:1px solid #eee}
      .kpi-box{border:1px solid #e0e8ff;border-top:3px solid #1168F8;border-radius:6px;padding:12px 16px;margin-bottom:14px}
      .kpi-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#666;margin-bottom:3px}
      .kpi-val{font-size:28px;font-weight:700;color:#111;font-family:monospace}
      .kpi-sub{font-size:10px;color:#888;margin-top:3px}
      .kpi-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}
      table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:11px}
      thead tr{background:#052698}
      thead th{color:white;font-size:9px;font-weight:700;text-transform:uppercase;padding:6px 10px;text-align:left}
      th.r{text-align:right}
      tbody tr{border-bottom:1px solid #f0f0f0}
      tbody td{padding:6px 10px;vertical-align:middle}
      .td-r{text-align:right;font-family:monospace;font-weight:600}
      .td-pct{text-align:right;color:#888;font-size:10px}
      .td-merc{font-weight:700;font-size:12px;color:#052698}
      .td-sub{color:#888;font-size:10px;padding-left:18px}
      .td-sep{background:#f5f5f5;font-weight:700;font-size:10px;color:#444;text-transform:uppercase;letter-spacing:.06em;padding:4px 10px}
      .row-subtot{border-top:2px solid #ccc;background:#fafafa}
      .row-subtot td{font-weight:700;font-size:12px;color:#111}
      .row-arca{border-top:2px solid #ef9f27;background:#faeeda}
      .row-arca td{font-weight:700;font-size:12px;color:#412402}
      .row-total{border-top:2px solid #1168F8;background:#EBF2FF}
      .row-total td{font-weight:700;font-size:13px;color:#052698}
      .ars-box{border:1px solid #ef9f27;border-left:3px solid #ef9f27;border-radius:6px;overflow:hidden;margin-bottom:14px}
      .ars-hdr{background:#faeeda;padding:8px 12px;font-weight:700;font-size:11px;color:#633806;border-bottom:1px solid #ef9f27}
      .row-ars-tot{background:#faeeda;border-top:2px solid #ef9f27}
      .row-ars-tot td{font-weight:700;color:#412402;font-size:12px}
      .pill-ars{display:inline-block;padding:1px 6px;border-radius:10px;background:#EBF2FF;color:#052698;font-size:9px;font-weight:700}
      .pill-amber{background:#faeeda;color:#412402}
      .tc-box{background:#f5f5f5;border-radius:4px;padding:8px 12px;display:flex;gap:20px;font-size:10px;color:#666}
      .tc-val{font-family:monospace;font-weight:700;color:#111}
      .footer{position:fixed;bottom:0;left:0;right:0;padding:8mm 14mm 6mm;border-top:1px solid #eee;display:flex;justify-content:space-between;align-items:flex-end;font-size:9px;color:#999;background:white}
      .footer-r{font-style:italic;font-family:Georgia,serif}
      .badges{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
      .badge{display:inline-block;padding:2px 7px;border-radius:10px;font-size:9px;font-weight:700;background:#EBF2FF;color:#052698}
      .badge-amber{background:#faeeda;color:#633806}
      .obs-list{counter-reset:item;list-style:none}
      .obs-list li{counter-increment:item;padding:4px 0;border-bottom:1px solid #f5f5f5;font-size:11px}
      .obs-list li::before{content:counter(item) '. ';color:#888}
      @media print{body{font-size:10.5px}@page{margin:0;size:A4}.page{padding:12mm 12mm 10mm}.footer{position:fixed}}
    `

    const filasHTML = filas.map(r=>{
      if((r as any).mercaderia) return '<tr><td class="td-merc">'+r.sec+'</td><td style="color:#666;font-size:11px">'+r.concepto+'</td><td class="td-r" style="font-size:13px;color:#052698">'+fmt(r.v)+'</td><td class="td-pct">'+fmt(r.v/totalReal*100,1)+'%</td></tr>'
        // tras la fila de mercadería, insertar el separador "Logística"
        + (totalLog>0?'<tr><td class="td-sep" colspan="4">Logística</td></tr>':'')
      if(!r.sub) return ''
      return '<tr><td class="td-sub">'+r.sec+'</td><td style="color:#999;font-size:10px">'+r.concepto+'</td><td class="td-r" style="color:#888">'+fmt(r.v)+'</td><td class="td-pct">'+fmt(r.v/totalReal*100,1)+'%</td></tr>'
    }).join('')

    const pagosHTML = pagosARS.map(p=>'<tr><td style="font-weight:600">'+p.concepto+'</td><td style="color:#888;font-size:10px">'+p.quien+'</td><td class="td-r">'+p.monto+'</td><td style="text-align:right"><span class="pill-ars">'+p.moneda+'</span></td></tr>').join('')

    const obsHTML = s.observaciones.filter((o:string)=>o.trim()).length>0
      ? '<div class="sec-t" style="margin-top:10px">Condiciones particulares de esta cotización</div><ol class="obs-list">'+s.observaciones.filter((o:string)=>o.trim()).map((o:string)=>'<li>'+o+'</li>').join('')+'</ol>'
      : ''

    // Condiciones generales del catálogo (activas, ordenadas)
    const condGenHTML = condicionesGenerales.length>0
      ? '<div class="sec-t" style="margin-top:14px">Condiciones generales</div><ol class="obs-list">'+condicionesGenerales.map((c:any)=>'<li>'+c.texto+'</li>').join('')+'</ol>'
      : ''

    const html = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><title>Cotización '+(cotNumActual||'')+'</title><style>'+css+'</style></head><body>'
      // PÁGINA 1
      +'<div class="page">'
      +'<div class="hdr"><div><img src="'+window.location.origin+'/logo.png" alt="Puerto NOA" style="height:36px;object-fit:contain;"/><div style="font-size:10px;color:#666;margin-top:3px">SpA · Servicios logísticos de importación/exportación</div></div><div class="hdr-right"><div class="num">'+(cotNumActual||'BORRADOR')+'</div><div class="fecha">'+fecha+'</div>'+(s.validez?'<div style="font-size:10px;color:#666;margin-top:2px">Válida por '+s.validez+'</div>':'')+'</div></div>'
      // Cliente + ruta
      +'<div class="kpi-grid" style="margin-bottom:10px"><div><div class="sec-t">Cliente</div><div style="font-size:13px;font-weight:700;color:#111">'+(s.cliente||'—')+'</div>'+(s.cuit?'<div style="font-size:10px;color:#666">CUIT '+s.cuit+'</div>':'')+'</div><div><div class="sec-t">Ruta</div><div style="font-size:11px;color:#333"><span style="background:#EBF2FF;color:#052698;border-radius:10px;padding:1px 7px;font-size:9px;font-weight:700;margin-right:6px">'+(esExpo?'EXPORTACIÓN':'IMPORTACIÓN')+'</span>'+ruta+'</div><div class="badges">'+(bloquesActivos2 ? bloquesActivos2.split(' · ').map((b:string)=>'<span class="badge">'+b+'</span>').join(''):'')+(arcaActivo?'<span class="badge badge-amber">ARCA</span>':'')+'</div></div></div>'
      // KPI
      +'<div class="kpi-box"><div class="kpi-label">'+etiquetaTotal+' · '+destinoLabel+'</div><div class="kpi-val">USD '+fmt(totalReal,0)+'</div><div class="kpi-sub">'+nc+' contenedor(es) · USD '+fmt(totalReal/nc,0)+' c/u · '+[hayMercaderia?'mercadería':null,totalLog>0?'logística':null,arcaActivo?'tributos ARCA':null].filter(Boolean).join(' + ')+'</div></div>'
      // Tabla desglose
      +'<div class="sec-t">Desglose por bloque</div>'
      +'<table><thead><tr><th style="width:22%">Bloque</th><th>Concepto</th><th class="r" style="width:16%">USD</th><th class="r" style="width:10%">%</th></tr></thead><tbody>'
      +filasHTML
      +(totalLog>0&&(hayMercaderia||arcaActivo)?'<tr class="row-subtot"><td colspan="2">Subtotal logístico</td><td class="td-r" style="font-size:13px">'+fmt(totalLog)+'</td><td class="td-pct">'+fmt(totalLog/totalReal*100,1)+'%</td></tr>':'')
      +(arcaActivo&&totalTribUSD>0?'<tr class="row-arca"><td>Tributos ARCA</td><td style="font-size:10px;color:#633806">Régimen '+s.regimen+' — base CIF Jama</td><td class="td-r" style="font-size:13px">'+fmt(totalTribUSD)+'</td><td class="td-pct" style="color:#854f0b">'+fmt(totalTribUSD/totalReal*100,1)+'%</td></tr>':'')
      +'<tr class="row-total"><td colspan="2">Total — '+etiquetaTotal.toLowerCase()+'</td><td class="td-r" style="font-size:14px">'+fmt(totalReal)+'</td><td class="td-pct" style="color:#052698">100%</td></tr>'
      +'</tbody></table>'
      +'</div>'
      // PÁGINA 2
      +(pagosARS.length>0||obsHTML||condGenHTML?'<div class="page page-break">'
        +'<div class="hdr"><div><img src="'+window.location.origin+'/logo.png" alt="Puerto NOA" style="height:36px;object-fit:contain;"/></div><div class="hdr-right"><div class="num">'+(cotNumActual||'BORRADOR')+'</div><div class="fecha">'+fecha+' · Página 2</div></div></div>'
        +(pagosARS.length>0?
          '<div class="ars-box"><div class="ars-hdr">Pagos estimados en pesos argentinos</div>'
          +'<table style="margin-bottom:0"><thead><tr><th>Concepto</th><th>A quién se paga</th><th class="r">Importe</th><th class="r">Moneda</th></tr></thead><tbody>'
          +pagosHTML
          +'<tr class="row-ars-tot"><td colspan="2" style="font-size:12px">Total a desembolsar en ARS</td><td class="td-r" style="font-size:13px">'+totalPagosARS.toLocaleString('es-AR')+'</td><td style="text-align:right"><span class="pill-ars pill-amber">ARS</span></td></tr>'
          +'</tbody></table>'
          +'<div style="padding:6px 12px;background:#f5f5f5;font-size:9px;color:#888">TC aplicado: ARS '+fmt(s.tcTrib,0)+' · Los importes son estimativos según TC al momento del despacho.</div>'
          +'</div>'
        :'')
        +obsHTML
        +condGenHTML
        +'</div>':'')
      +'<div class="footer"><div>'+(s.validez?'Oferta válida por <strong>'+s.validez+'</strong> desde la fecha de emisión<br/>':'')+'<div class="tc-box" style="margin-top:4px">'+(s.tcTrib?'<span>ARS/USD <span class="tc-val">'+fmt(s.tcTrib,0)+'</span></span>':'')+(s.tcClp?'<span>CLP/USD <span class="tc-val">'+fmt(s.tcClp,0)+'</span></span>':'')+'</div></div><div class="footer-r">Developed by Pablin</div></div>'
      +'<script>window.onload=function(){window.print();}</script></body></html>'

    const win = window.open('','_blank','width=900,height=700')
    if(win){ win.document.write(html); win.document.close() }
  }

  return (
    <div ref={topRef} className="p-6 bg-gray-50 min-h-screen" onClick={()=>setShowClienteDropdown(false)}>
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
        {([{key:'embarque',label:'Embarque'},{key:'mercaderia',label:'Mercadería'},{key:'logistica',label:'Logistica'},{key:'tributos',label:'Tributos ARCA'},{key:'resumen',label:'Resumen'}] as {key:string,label:string}[]).map(t=>(
          <button key={t.key} onClick={()=>{setTab(t.key as Tab);setTimeout(()=>{topRef.current?.scrollIntoView({behavior:'smooth',block:'start'})},50)}} className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all shadow-sm ${tab===t.key?'bg-[#1168F8] text-white shadow-md':'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{t.label}</button>
        ))}
        <div className="ml-auto">
          <Image src="/logo.png" alt="Puertonoa" width={80} height={22} style={{objectFit:'contain',opacity:0.6}}/>
        </div>
      </div>

      {/* ── EMBARQUE (sin cambios) ── */}
      {tab==='embarque'&&(
        <div className="space-y-4">

          {/* ── PANEL: SENTIDO Y BLOQUES ACTIVOS ── rediseño compacto ── */}
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
            {/* Fila superior: sentido */}
            <div className="px-5 pt-4 pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Sentido</span>
              </div>
              <div className="flex gap-2">
                {[
                  { key:'importacion', label:'Importación', icon:'📦', desc:'Origen → Argentina/NOA' },
                  { key:'exportacion', label:'Exportación', icon:'🚢', desc:'Argentina/NOA → Destino' },
                ].map(o => (
                  <button key={o.key} onClick={()=>u('sentido',o.key as any)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all text-left ${s.sentido===o.key?'border-[#1168F8] bg-[#EBF2FF] text-[#052698]':'border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50'}`}>
                    <span className="text-base leading-none">{o.icon}</span>
                    <div>
                      <div className={`text-xs font-bold leading-tight ${s.sentido===o.key?'text-[#052698]':'text-gray-700'}`}>{o.label}</div>
                      <div className="text-[9px] text-gray-400 leading-tight mt-0.5">{o.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            {/* Fila inferior: bloques + ARCA en una línea */}
            <div className="px-5 py-3 flex items-center gap-3 flex-wrap">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex-shrink-0">Bloques</span>
              {bloques.length === 0 ? (
                <span className="text-[10px] text-gray-300">Cargando...</span>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {/* Pill MERCADERÍA — primero. Al desactivarlo, se apaga ARCA en cascada. */}
                  {bloqueMerc && (()=>{
                    const idsTodos = [bloqueMerc.id, ...bloques.map((x:any)=>x.id)]
                    const activo = s.bloquesActivos.length === 0 || s.bloquesActivos.includes(bloqueMerc.id)
                    return (
                      <button key={bloqueMerc.id} onClick={()=>{
                        if (s.bloquesActivos.length === 0) {
                          // estaban todos activos → desactivo solo mercadería y apago ARCA
                          u('bloquesActivos', idsTodos.filter((id:string)=>id!==bloqueMerc.id))
                          u('incluirArca', false)
                        } else if (activo) {
                          u('bloquesActivos', s.bloquesActivos.filter((id:string)=>id!==bloqueMerc.id))
                          u('incluirArca', false) // cascada: sin mercadería no hay ARCA
                        } else {
                          u('bloquesActivos', [...s.bloquesActivos, bloqueMerc.id])
                        }
                      }}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-all ${activo?'bg-[#1168F8] border-[#1168F8] text-white':'bg-gray-100 border-gray-200 text-gray-400 line-through'}`}>
                        {activo && <span className="w-1.5 h-1.5 rounded-full bg-white/60 flex-shrink-0"/>}
                        {bloqueMerc.nombre}
                      </button>
                    )
                  })()}
                  {bloques.map((b:any) => {
                    const activo = s.bloquesActivos.length === 0 || s.bloquesActivos.includes(b.id)
                    return (
                      <button key={b.id} onClick={()=>{
                        const idsTodos = bloqueMerc ? [bloqueMerc.id, ...bloques.map((x:any)=>x.id)] : bloques.map((x:any)=>x.id)
                        if (s.bloquesActivos.length === 0) {
                          u('bloquesActivos', idsTodos.filter((id:string)=>id!==b.id))
                        } else if (activo) {
                          u('bloquesActivos', s.bloquesActivos.filter((id:string)=>id!==b.id))
                        } else {
                          u('bloquesActivos', [...s.bloquesActivos, b.id])
                        }
                      }}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-all ${activo?'bg-[#052698] border-[#052698] text-white':'bg-gray-100 border-gray-200 text-gray-400 line-through'}`}>
                        {activo && <span className="w-1.5 h-1.5 rounded-full bg-white/60 flex-shrink-0"/>}
                        {b.nombre}
                      </button>
                    )
                  })}
                </div>
              )}
              {/* Separador */}
              <div className="h-5 w-px bg-gray-200 mx-1 flex-shrink-0"/>
              {/* ARCA como pill — deshabilitado si no hay bloque mercadería activo (sin mercadería no hay tributos) */}
              {(()=>{
                const mercOn = mercaderiaActiva()
                return (
                  <button onClick={()=>{ if(mercOn) u('incluirArca',!s.incluirArca) }}
                    disabled={!mercOn}
                    title={mercOn?'':'Requiere el bloque Mercadería activo'}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-all flex-shrink-0 ${!mercOn?'bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed':s.incluirArca?'bg-amber-500 border-amber-500 text-white':'bg-gray-100 border-gray-200 text-gray-400 line-through'}`}>
                    {mercOn && s.incluirArca && <span className="w-1.5 h-1.5 rounded-full bg-white/60 flex-shrink-0"/>}
                    Tributos ARCA
                    {!mercOn && <span className="text-[9px] font-normal ml-0.5">(requiere mercadería)</span>}
                  </button>
                )
              })()}
            </div>
          </div>

          <Card title="Cliente">
            {/* Buscador */}
            <div className="relative mb-3">
              <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Buscá por nombre, CUIT/RUT o fantasía</label>
              <input value={buscarCliente||s.cliente}
                onChange={e=>{setBuscarCliente(e.target.value);u('cliente',e.target.value);setShowClienteDropdown(e.target.value.length>0);if(!e.target.value){setClienteSelId(null);setShowHist(false)}}}
                onFocus={()=>setShowClienteDropdown(true)} onClick={e=>e.stopPropagation()}
                className={inp} placeholder="Buscar por nombre, CUIT/RUT o fantasía..."/>
              {showClienteDropdown&&(
                <div className="absolute z-50 top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl max-h-52 overflow-y-auto mt-1" onClick={e=>e.stopPropagation()}>
                  {clientesFiltrados.length>0?clientesFiltrados.map(t=>(
                    <button key={t.id} onMouseDown={()=>selectCliente(t)} className="w-full text-left px-4 py-2.5 hover:bg-[#EBF2FF] transition-colors border-b border-gray-50 last:border-0">
                      <div className="font-semibold text-sm text-gray-900">{t.razon_social}</div>
                      <div className="text-[10px] text-gray-400 flex gap-2 mt-0.5">
                        {t.nro_doc&&<span className="font-mono">{t.tipo_doc}: {t.nro_doc}</span>}
                        {t.dir_fiscal_ciudad&&<span>{t.dir_fiscal_ciudad}, {t.pais}</span>}
                      </div>
                    </button>
                  )):(
                    <div className="px-4 py-3 text-xs text-gray-400">
                      {terceros.length===0?'Cargando clientes...':'Sin coincidencias'}
                    </div>
                  )}
                  {/* Si no hay coincidencia exacta y hay texto, ofrecer crear el cliente */}
                  {terceros.length>0 && (buscarCliente||s.cliente).length>0 && !clientesFiltrados.some(t=>t.razon_social.toLowerCase()===(buscarCliente||s.cliente).toLowerCase()) && (
                    <button onMouseDown={abrirAltaCliente}
                      className="w-full text-left px-4 py-2.5 hover:bg-green-50 text-xs border-t border-gray-100 bg-green-50/40">
                      <span className="font-semibold text-green-700">+ Crear cliente «{buscarCliente||s.cliente}»</span>
                      <span className="block text-[10px] text-gray-400 mt-0.5">No está registrado — cargalo ahora para vincularlo</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Preview del cliente seleccionado */}
            {clienteSelId&&terceros.find(t=>t.id===clienteSelId)&&(
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 mb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#EBF2FF] flex items-center justify-center text-[#052698] text-sm font-black flex-shrink-0">
                      {terceros.find(t=>t.id===clienteSelId)!.razon_social.slice(0,2).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-semibold text-sm text-gray-900">{terceros.find(t=>t.id===clienteSelId)!.razon_social}</div>
                      {terceros.find(t=>t.id===clienteSelId)!.nombre_fantasia&&(
                        <div className="text-[10px] text-gray-400">{terceros.find(t=>t.id===clienteSelId)!.nombre_fantasia}</div>
                      )}
                      <div className="flex gap-3 mt-1 text-[10px] text-gray-500 flex-wrap">
                        {terceros.find(t=>t.id===clienteSelId)!.nro_doc&&<span className="font-mono">{terceros.find(t=>t.id===clienteSelId)!.tipo_doc}: {terceros.find(t=>t.id===clienteSelId)!.nro_doc}</span>}
                        {terceros.find(t=>t.id===clienteSelId)!.pais&&<span>{terceros.find(t=>t.id===clienteSelId)!.pais}</span>}
                        {terceros.find(t=>t.id===clienteSelId)!.dir_fiscal_ciudad&&<span>{terceros.find(t=>t.id===clienteSelId)!.dir_fiscal_ciudad}</span>}
                        {terceros.find(t=>t.id===clienteSelId)!.condicion_iva&&<span>{terceros.find(t=>t.id===clienteSelId)!.condicion_iva}</span>}
                      </div>
                      {(terceros.find(t=>t.id===clienteSelId)!.contactos?.find((c:any)=>c.principal)||terceros.find(t=>t.id===clienteSelId)!.contactos?.[0])&&(
                        <div className="flex gap-3 mt-1 text-[10px] text-[#1168F8] flex-wrap">
                          {(terceros.find(t=>t.id===clienteSelId)!.contactos?.find((c:any)=>c.principal)||terceros.find(t=>t.id===clienteSelId)!.contactos?.[0])?.email&&(
                            <span>✉ {(terceros.find(t=>t.id===clienteSelId)!.contactos?.find((c:any)=>c.principal)||terceros.find(t=>t.id===clienteSelId)!.contactos?.[0])?.email}</span>
                          )}
                          {(terceros.find(t=>t.id===clienteSelId)!.contactos?.find((c:any)=>c.principal)||terceros.find(t=>t.id===clienteSelId)!.contactos?.[0])?.telefono&&(
                            <span>📞 {(terceros.find(t=>t.id===clienteSelId)!.contactos?.find((c:any)=>c.principal)||terceros.find(t=>t.id===clienteSelId)!.contactos?.[0])?.telefono}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <button onClick={()=>{setClienteSelId(null);setBuscarCliente('');u('cliente','');setShowHist(false)}}
                    className="text-[10px] text-gray-400 hover:text-red-500 flex-shrink-0">Cambiar</button>
                </div>
              </div>
            )}

            {/* Historial */}
            {showHist&&histCliente.length>0&&(
              <div className="mb-3 bg-[#EBF2FF] border border-[#93B8FC] rounded-xl p-3">
                <div className="text-[10px] font-bold text-[#052698] mb-2">Cotizaciones anteriores</div>
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
                        <button onMouseDown={()=>duplicarCotizacion(c.id)} className="px-2 py-0.5 bg-[#1168F8] text-white rounded text-[9px] font-bold hover:bg-[#052698]">Duplicar</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Solo validez editable */}
            <div className="grid grid-cols-3 gap-3">
              <Field label="Validez oferta">
                <select value={s.validez} onChange={e=>u('validez',e.target.value)} className={sel}>
                  <option value="">Sin especificar</option>
                  <option value="15 dias">15 dias</option>
                  <option value="30 dias">30 dias</option>
                  <option value="45 dias">45 dias</option>
                </select>
              </Field>
              <div className="col-span-2">
                <Field label="Notas internas"><input value={s.notas} onChange={e=>u('notas',e.target.value)} className={inp} placeholder="Observaciones internas..."/></Field>
              </div>
            </div>
          </Card>

          {/* ── BLOQUE A: RUTA ── */}
          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#1168F8] text-white text-[11px] font-bold">A</span>
              <span className="font-semibold text-sm text-gray-900">Ruta del embarque</span>
            </div>
            <div className="px-5 py-4 space-y-3">
              {/* Indicador visual de dirección */}
              <div className="flex items-center gap-2 text-[10px] text-gray-400 mb-1">
                {s.sentido==='exportacion' ? (
                  <>
                    {bloqueActivo(3)&&<span className="px-2 py-0.5 bg-[#EBF2FF] text-[#052698] rounded-full font-semibold">Argentina</span>}
                    {(bloqueActivo(2)||bloqueActivo(1))&&<><span>→</span><span className="px-2 py-0.5 bg-green-50 text-green-700 rounded-full font-semibold">Chile</span></>}
                    {bloqueActivo(0)&&<><span>→</span><span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full font-semibold">Destino</span></>}
                  </>
                ) : (
                  <>
                    {bloqueActivo(0)&&<span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full font-semibold">Origen</span>}
                    {(bloqueActivo(1)||bloqueActivo(2))&&<><span>→</span><span className="px-2 py-0.5 bg-green-50 text-green-700 rounded-full font-semibold">Chile</span></>}
                    {bloqueActivo(3)&&<><span>→</span><span className="px-2 py-0.5 bg-[#EBF2FF] text-[#052698] rounded-full font-semibold">Argentina/NOA</span></>}
                  </>
                )}
              </div>

              {s.sentido==='exportacion' ? (
                /* ── EXPORTACIÓN: Argentina → Chile → Destino ── */
                <>
                  {/* 1. Tramo terrestre de salida: ciudad origen Argentina → paso → puerto Chile destino */}
                  {(bloqueActivo(3) || bloqueActivo(2)) && (
                    <div>
                      <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Tramo terrestre (salida)</div>
                      <div className="grid grid-cols-3 gap-3">
                        <Field label="Ciudad origen Argentina">
                          <select value={s.ciudadDestinoId} onChange={e=>{
                            u('ciudadDestinoId',e.target.value)
                            const c=ciudadesArg.find((x:any)=>x.id===e.target.value)
                            if(c) u('destinoNoa',c.ciudad)
                          }} className={sel}>
                            <option value="">— Seleccionar ciudad —</option>
                            {ciudadesArg.map((c:any)=><option key={c.id} value={c.id}>{c.ciudad} ({c.provincia})</option>)}
                          </select>
                        </Field>
                        {(bloqueActivo(2)||bloqueActivo(1)||bloqueActivo(3)) && (
                          <Field label="Paso fronterizo">
                            <select value={s.pasoId} onChange={e=>{u('pasoId',e.target.value)}} className={sel}>
                              <option value="">— Seleccionar paso —</option>
                              {pasosFront.map((p:any)=>(
                                <option key={p.id} value={p.id}>{p.nombre} {p.restriccion_invierno?'⚠️':''} ({p.provincia_argentina})</option>
                              ))}
                            </select>
                          </Field>
                        )}
                        {/* Puerto Chile destino del camión — misma condición que ciudad/paso; se oculta si el marítimo ya lo muestra abajo */}
                        {(bloqueActivo(2)||bloqueActivo(3)) && !(bloqueActivo(1)||bloqueActivo(0)) && (
                          <Field label="Puerto Chile (destino camión)">
                            <select value={s.puertoChileId} onChange={e=>{
                              u('puertoChileId',e.target.value)
                              const p=puertosChile.find((x:any)=>x.id===e.target.value)
                              if(p) u('ptoChile',p.locode)
                            }} className={sel}>
                              <option value="">— Seleccionar puerto —</option>
                              {puertosChile.map((p:any)=><option key={p.id} value={p.id}>{p.nombre} ({p.locode})</option>)}
                            </select>
                          </Field>
                        )}
                      </div>
                    </div>
                  )}
                  {/* 2. Puerto Chile embarque marítimo + destino final */}
                  {(bloqueActivo(1) || bloqueActivo(0)) && (
                    <div className="pt-3 border-t border-gray-100">
                      <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Puerto Chile (carga) · Destino</div>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Puerto Chile (embarque)">
                          <select value={s.puertoChileId} onChange={e=>{
                            u('puertoChileId',e.target.value)
                            const p=puertosChile.find((x:any)=>x.id===e.target.value)
                            if(p) u('ptoChile',p.locode)
                          }} className={sel}>
                            <option value="">— Seleccionar puerto —</option>
                            {puertosChile.map((p:any)=><option key={p.id} value={p.id}>{p.nombre} ({p.locode})</option>)}
                          </select>
                        </Field>
                        {bloqueActivo(0) && (
                          <Field label="Puerto de destino">
                            <select value={s.puertoChiId} onChange={e=>{
                              u('puertoChiId',e.target.value)
                              const p=puertosChi.find((x:any)=>x.id===e.target.value)
                              if(p) u('origen',`${p.nombre} (${p.locode})`)
                            }} className={sel}>
                              <option value="">— Seleccionar puerto —</option>
                              {puertosChi.map((p:any)=><option key={p.id} value={p.id}>{p.nombre} — {p.ciudad}</option>)}
                            </select>
                          </Field>
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                /* ── IMPORTACIÓN: Origen → Chile → Argentina ── */
                <>
                  {/* 1. Tramo marítimo */}
                  {bloqueActivo(0) && (
                    <div>
                      <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Tramo marítimo</div>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Puerto de origen (China)">
                          <select value={s.puertoChiId} onChange={e=>{
                            u('puertoChiId',e.target.value)
                            const p=puertosChi.find((x:any)=>x.id===e.target.value)
                            if(p) u('origen',`${p.nombre} (${p.locode})`)
                          }} className={sel}>
                            <option value="">— Seleccionar puerto —</option>
                            {puertosChi.map((p:any)=><option key={p.id} value={p.id}>{p.nombre} — {p.ciudad}</option>)}
                          </select>
                        </Field>
                        <Field label="Puerto Chile (descarga)">
                          <select value={s.puertoChileId} onChange={e=>{
                            u('puertoChileId',e.target.value)
                            const p=puertosChile.find((x:any)=>x.id===e.target.value)
                            if(p) u('ptoChile',p.locode)
                          }} className={sel}>
                            <option value="">— Seleccionar puerto —</option>
                            {puertosChile.map((p:any)=><option key={p.id} value={p.id}>{p.nombre} ({p.locode})</option>)}
                          </select>
                        </Field>
                      </div>
                    </div>
                  )}
                  {/* Puerto Chile solo si B1 no activo */}
                  {!bloqueActivo(0) && bloqueActivo(1) && (
                    <div>
                      <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Puerto Chile</div>
                      <Field label="Puerto Chile (descarga)">
                        <select value={s.puertoChileId} onChange={e=>{
                          u('puertoChileId',e.target.value)
                          const p=puertosChile.find((x:any)=>x.id===e.target.value)
                          if(p) u('ptoChile',p.locode)
                        }} className={sel}>
                          <option value="">— Seleccionar puerto —</option>
                          {puertosChile.map((p:any)=><option key={p.id} value={p.id}>{p.nombre} ({p.locode})</option>)}
                        </select>
                      </Field>
                    </div>
                  )}
                  {/* 2. Tramo terrestre */}
                  {(bloqueActivo(1) || bloqueActivo(2) || bloqueActivo(3)) && (
                    <div className={(bloqueActivo(0)||bloqueActivo(1))?"pt-3 border-t border-gray-100":""}>
                      <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Tramo terrestre</div>
                      <div className="grid grid-cols-3 gap-3">
                        {/* Puerto Chile origen del camión — misma condición que paso/ciudad (se muestra con el tramo terrestre) */}
                        {(bloqueActivo(1)||bloqueActivo(2)||bloqueActivo(3)) && (
                          <Field label="Puerto Chile (origen camión)">
                            <select value={s.puertoChileId} onChange={e=>{
                              u('puertoChileId',e.target.value)
                              const p=puertosChile.find((x:any)=>x.id===e.target.value)
                              if(p) u('ptoChile',p.locode)
                            }} className={sel}>
                              <option value="">— Seleccionar puerto —</option>
                              {puertosChile.map((p:any)=><option key={p.id} value={p.id}>{p.nombre} ({p.locode})</option>)}
                            </select>
                          </Field>
                        )}
                        {(bloqueActivo(1)||bloqueActivo(2)||bloqueActivo(3)) && (
                          <Field label="Paso fronterizo">
                            <select value={s.pasoId} onChange={e=>{u('pasoId',e.target.value)}} className={sel}>
                              <option value="">— Seleccionar paso —</option>
                              {pasosFront.map((p:any)=>(
                                <option key={p.id} value={p.id}>{p.nombre} {p.restriccion_invierno?'⚠️':''} ({p.provincia_argentina})</option>
                              ))}
                            </select>
                          </Field>
                        )}
                        {(bloqueActivo(2)||bloqueActivo(3)) && (
                          <Field label="Ciudad destino Argentina">
                            <select value={s.ciudadDestinoId} onChange={e=>{
                              u('ciudadDestinoId',e.target.value)
                              const c=ciudadesArg.find((x:any)=>x.id===e.target.value)
                              if(c) u('destinoNoa',c.ciudad)
                            }} className={sel}>
                              <option value="">— Seleccionar ciudad —</option>
                              {ciudadesArg.map((c:any)=><option key={c.id} value={c.id}>{c.ciudad} ({c.provincia})</option>)}
                            </select>
                          </Field>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ── BLOQUE B: TIPO DE CARGA ── */}
          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#0a9e6e] text-white text-[11px] font-bold">B</span>
              <span className="font-semibold text-sm text-gray-900">Tipo de carga</span>
            </div>
            <div className="px-5 py-4">
              {/* Modalidad */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  {key:'contenedor',label:'Contenedorizada',icon:'📦',desc:'Todo en contenedores ISO'},
                  {key:'bulk',label:'Bulk cargo',icon:'⚓',desc:'Todo a granel sin contenedor'},
                  {key:'mixta',label:'Mixta',icon:'🔀',desc:'Contenedores + carga suelta'},
                ].map(m=>(
                  <button key={m.key} onClick={()=>u('modalidadCarga',m.key as any)}
                    className={`px-4 py-3 rounded-xl border-2 text-left transition-all ${s.modalidadCarga===m.key?'border-[#0a9e6e] bg-green-50':'border-gray-200 hover:bg-gray-50'}`}>
                    <div className="text-xl mb-1">{m.icon}</div>
                    <div className="text-xs font-bold text-gray-900">{m.label}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">{m.desc}</div>
                  </button>
                ))}
              </div>

              {/* Parte contenedorizada — para contenedor y mixta */}
              {(s.modalidadCarga==='contenedor'||s.modalidadCarga==='mixta')&&(
                <div className={s.modalidadCarga==='mixta'?'mb-4':''}>
                  {s.modalidadCarga==='mixta'&&(
                    <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Parte contenedorizada</div>
                  )}
                  <div className="grid text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-2 gap-3" style={{gridTemplateColumns:'1fr 60px 1.5fr auto'}}>
                    <div>Tipo contenedor</div><div>Cant.</div><div>Tipo de camion</div><div></div>
                  </div>
                  {s.contenedores.map((c,i)=>(
                    <div key={i} className="grid gap-3 mb-2 items-center" style={{gridTemplateColumns:'1fr 60px 1.5fr auto'}}>
                      <select value={c.tipo} onChange={e=>{const n=[...s.contenedores];(n[i] as any).tipo=e.target.value;u('contenedores',n)}}
                        className="px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white">
                        {tiposCont.length>0
                          ? tiposCont.map((t:any)=><option key={t.codigo} value={t.codigo}>{t.codigo} — {t.nombre}</option>)
                          : Object.keys(CONT_CAPS).map(k=><option key={k}>{k}</option>)}
                      </select>
                      <input type="text" inputMode="decimal" value={c.cantidad} min={1} onFocus={e=>e.target.select()}
                        onChange={e=>{const n=[...s.contenedores];n[i]={...n[i],cantidad:parseInt2(e.target.value)||1};u('contenedores',n)}}
                        className="px-3 py-2 border border-gray-200 rounded-xl text-xs text-center focus:outline-none focus:border-[#1168F8] bg-white font-bold"/>
                      <select value={(c as any).tipoCamionId||''} onChange={e=>{const n=[...s.contenedores];(n[i] as any).tipoCamionId=e.target.value;u('contenedores',n)}}
                        className="px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#1168F8] bg-white">
                        <option value="">— Tipo de camion —</option>
                        {tiposCamion.map((t:any)=><option key={t.id} value={t.id}>{t.icono} {t.nombre}</option>)}
                      </select>
                      {s.contenedores.length>1&&(
                        <button onClick={()=>u('contenedores',s.contenedores.filter((_,j)=>j!==i))}
                          className="text-gray-400 hover:text-red-500 text-xs p-1">X</button>
                      )}
                    </div>
                  ))}
                  <button onClick={()=>u('contenedores',[...s.contenedores,{tipo:'40HC',cantidad:1} as any])}
                    className="text-xs text-[#1168F8] hover:underline mt-1">+ Agregar contenedor</button>
                  <div className="mt-2 text-xs text-gray-500">
                    Total: <strong className="text-gray-800">{nc} contenedor(es)</strong> — {s.contenedores.map(c=>`${c.cantidad}x ${c.tipo}`).join(', ')}
                  </div>
                </div>
              )}

              {/* Parte bulk — para bulk y mixta */}
              {(s.modalidadCarga==='bulk'||s.modalidadCarga==='mixta')&&(
                <div className={s.modalidadCarga==='mixta'?'pt-4 border-t border-gray-100':''}>
                  {s.modalidadCarga==='mixta'&&(
                    <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Parte bulk cargo</div>
                  )}
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <div className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider mb-3">
                      {s.modalidadCarga==='mixta'?'Carga suelta / granel':'Bulk cargo — carga a granel'}
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <Field label="Descripcion de la carga">
                        <input value={s.bulkDescripcion} onChange={e=>u('bulkDescripcion',e.target.value)}
                          className={inp} placeholder="ej. Mineral, graneles solidos"/>
                      </Field>
                      <Field label="Peso estimado (toneladas)">
                        <input type="text" inputMode="decimal" value={s.bulkPesoTon||''} onFocus={e=>e.target.select()}
                          onChange={e=>u('bulkPesoTon',parseNum(e.target.value))} className={inp} placeholder="0.00"/>
                      </Field>
                      <Field label="Volumen estimado (m3)">
                        <input type="text" inputMode="decimal" value={s.bulkVolM3||''} onFocus={e=>e.target.select()}
                          onChange={e=>u('bulkVolM3',parseNum(e.target.value))} className={inp} placeholder="0.00"/>
                      </Field>
                    </div>
                    <div className="mt-2 text-[10px] text-amber-600">
                      El Freight Forwarder especificara modo de transporte, tipo de embarcacion y costos en su cotizacion.
                    </div>
                  </div>
                </div>
              )}
              {/* Big bags — siempre visible independiente de la modalidad */}
              <div className="pt-3 border-t border-gray-100">
                <div className="flex items-center gap-3">
                  <Field label="Cantidad de big bags (si aplica)">
                    <input type="text" inputMode="decimal" value={s.cantBigbags||''} onFocus={e=>e.target.select()}
                      onChange={e=>u('cantBigbags',parseNum(e.target.value))}
                      className={inp} placeholder="0 — completar si se cobra por big bag"/>
                  </Field>
                  {s.cantBigbags > 0 && (
                    <div className="text-[10px] text-gray-400 mt-4">
                      Se usará como cantidad en ítems cotizados <strong>por big bag</strong>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── CONDICIONES PARTICULARES DE ESTA COTIZACIÓN ── */}
          <div className="bg-white border-2 border-[#1168F8]/20 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between" style={{background:'#EBF2FF'}}>
              <div className="flex items-center gap-2">
                <span className="text-lg">📝</span>
                <div>
                  <span className="font-bold text-sm text-[#052698]">Condiciones particulares de esta cotización</span>
                  <div className="text-[10px] text-gray-500">Notas propias de esta operación. Las condiciones generales se cargan en Catálogos y salen automáticamente.</div>
                </div>
              </div>
              <button onClick={()=>u('observaciones',[...s.observaciones,''])}
                className="px-3 py-1.5 bg-[#1168F8] text-white rounded-lg text-[11px] font-bold hover:bg-[#0a4fc4] whitespace-nowrap shadow-sm">+ Agregar condición</button>
            </div>
            <div className="px-5 py-4 space-y-2">
              {s.observaciones.length === 0 ? (
                <div className="text-xs text-gray-400 text-center py-4 bg-gray-50 rounded-xl">
                  Sin condiciones particulares. Hacé click en <strong className="text-[#1168F8]">+ Agregar condición</strong> para sumar notas específicas de esta cotización (visibles en la impresión).
                </div>
              ) : s.observaciones.map((obs:string, i:number) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400 font-mono w-4 flex-shrink-0">{i+1}.</span>
                  <input value={obs}
                    onChange={e=>{const n=[...s.observaciones];n[i]=e.target.value;u('observaciones',n)}}
                    className={inp+' flex-1'} placeholder={`Condición particular ${i+1}...`}/>
                  <button onClick={()=>u('observaciones',s.observaciones.filter((_:string,j:number)=>j!==i))}
                    className="text-gray-300 hover:text-red-500 text-xs flex-shrink-0">✕</button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end"><button onClick={()=>cambiarTab('mercaderia')} className="bg-[#1168F8] text-white px-5 py-2 rounded-lg text-xs font-medium hover:bg-[#0a4fc4]">Mercadería →</button></div>
        </div>
      )}

      {/* ── MERCADERÍA (bloque 0) ── */}
      {tab==='mercaderia'&&(
        <div className="space-y-4">
          {mercaderiaActiva() ? (
          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-[11px] font-bold" style={{background:'#ca8a04'}}>📦</span>
              <span className="font-semibold text-sm text-gray-900">{bloqueMerc?.nombre || 'Mercadería'}</span>
              <span className="text-[10px] text-gray-400">Proforma del proveedor · base imponible CIF</span>
              <div className="ml-auto flex items-center gap-2 flex-wrap">
                <select onChange={e=>{if(e.target.value){agregarMercDesdeSistema(e.target.value);e.target.value=''}}}
                  className="px-2 py-1 border border-gray-200 rounded-lg text-[10px] bg-white focus:outline-none focus:border-[#ca8a04]" defaultValue="">
                  <option value="">+ Cargar del sistema</option>
                  {(()=>{
                    const esp=cotsMercDisponibles.filter((c:any)=>c.tipo==='especifica'&&clienteSelId&&c.cliente_id===clienteSelId)
                    const gen=cotsMercDisponibles.filter((c:any)=>c.tipo!=='especifica'||!clienteSelId||c.cliente_id!==clienteSelId)
                    return(<>
                      {esp.length>0&&(<optgroup label="⭐ Específicas para este cliente">{esp.map((c:any)=>{const cli=terceros.find(t=>t.id===c.cliente_id);return(<option key={c.id} value={c.id}>⭐ {c.proveedor_nombre}{cli?` · ${cli.razon_social}`:''} — {c.referencia||c.fecha}</option>)})}</optgroup>)}
                      <optgroup label="Proformas vigentes">{gen.filter((c:any)=>isVigente(c.fecha_vencimiento||'')).map((c:any)=>(<option key={c.id} value={c.id}>{c.proveedor_nombre} — {c.referencia||c.fecha}</option>))}</optgroup>
                    </>)
                  })()}
                </select>
                <button onClick={()=>{
                  window.open(`/cotizaciones-proveedores?nuevo=1&bloque=0&rubro=proveedor_mercaderia&cliente_id=${clienteSelId||''}&cliente_nombre=${encodeURIComponent(s.cliente||'')}`, '_blank')
                }} className="px-3 py-1 text-white rounded-lg text-[10px] font-bold whitespace-nowrap" style={{background:'#ca8a04'}}>+ Manual</button>
              </div>
            </div>
            <div className="px-5 py-4">
              {s.cotsProvMerc.length===0?(
                <div className="text-xs text-gray-400 bg-gray-50 rounded-xl px-4 py-3 text-center">
                  Sin proforma de mercadería. Cargala del sistema (proformas de proveedores de mercadería) o creá una nueva con + Manual.
                </div>
              ):(
                <div>
                  {s.cotsProvMerc.map(mc=>{
                    const vigente=isVigente(mc.fechaVencimiento)
                    const totalFob=mc.items.reduce((t,i)=>t+(i.cantUsar||0)*(i.valorUnit||0),0)
                    return (
                      <div key={mc.uid} className={`border-2 rounded-xl overflow-hidden mb-3 ${mc.elegida?'border-[#ca8a04]':'border-gray-200'}`}>
                        <div className={`flex items-center gap-0 ${mc.elegida?'bg-amber-50':'bg-gray-50'}`}>
                          <button onClick={()=>elegirCotProv('cotsProvMerc',mc.uid)} className="w-10 flex-shrink-0 flex items-center justify-center self-stretch hover:bg-black/5">
                            <div className={`w-4 h-4 rounded-full border-2 ${mc.elegida?'border-[#ca8a04] bg-[#ca8a04]':'border-gray-300 bg-white'}`}>{mc.elegida&&<div className="w-1.5 h-1.5 bg-white rounded-full mx-auto mt-0.5"/>}</div>
                          </button>
                          <div className="flex-1 px-3 py-2.5">
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                              <span className="font-semibold text-sm text-gray-900">{mc.proveedorNombre}</span>
                              {mc.tipo==='especifica'?<span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#EEEDFE] text-[#3C3489]">⭐ Específica</span>:<span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500">Genérica</span>}
                              {vigente?<span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-50 text-green-700">vigente</span>:<span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-700">vencida</span>}
                              {mc.elegida&&<span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#ca8a04] text-white">ELEGIDA</span>}
                            </div>
                            <div className="flex gap-4 text-[10px] text-gray-500">
                              {mc.referencia&&<span className="font-mono">Ref: {mc.referencia}</span>}
                              {mc.fechaEmision&&<span>Emitida: {fmtFecha(mc.fechaEmision)}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 px-3">
                            {mc.elegida&&totalFob>0&&<span className="font-mono font-bold text-[#ca8a04] text-sm">FOB USD {fmt(totalFob)}</span>}
                            <button onClick={()=>eliminarCotProv('cotsProvMerc',mc.uid)} className="text-gray-300 hover:text-red-500 text-xs">✕</button>
                          </div>
                        </div>
                        <table className="w-full text-xs border-t border-gray-100">
                          <thead><tr className="bg-gray-50 border-b border-gray-100">
                            <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase">Producto</th>
                            <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase w-28">NCM</th>
                            <th className="text-right px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase w-20">Cant.</th>
                            <th className="text-right px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase w-24">Precio U.</th>
                            <th className="text-right px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase w-28">Subtotal</th>
                          </tr></thead>
                          <tbody>
                            {mc.items.map(it=>(
                              <tr key={it.itemId} className="border-b border-gray-50">
                                <td className="px-3 py-2 font-medium text-gray-800">{it.descripcion}</td>
                                <td className="px-3 py-2 font-mono text-gray-500">{(it as any).ncm||'—'}</td>
                                <td className="px-3 py-2 text-right font-mono text-gray-700">{(it.cantUsar||0).toLocaleString('es-AR')}</td>
                                <td className="px-3 py-2 text-right font-mono text-gray-700">USD {fmt(it.valorUnit)}</td>
                                <td className="px-3 py-2 text-right font-mono font-semibold text-[#052698]">USD {fmt((it.cantUsar||0)*(it.valorUnit||0))}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  })}
                </div>
              )}
              {/* Precio equivalente en Argentina */}
              <div className="mt-4 pt-4 border-t border-gray-100">
                <Field label="Precio equivalente en Argentina (USD)"><input type="text" inputMode="decimal" onFocus={e=>e.target.select()} value={s.precioArgEquiv||''} onChange={e=>u('precioArgEquiv',parseNum(e.target.value))} className={inp} placeholder="0.00"/></Field>
              </div>
            </div>
            <div className="flex justify-end items-center gap-2 px-5 py-2.5 bg-gray-50 border-t border-gray-100 text-xs text-gray-500">
              FOB mercadería: <strong className="font-mono text-gray-800">USD {fmt(totalFOB)}</strong>
            </div>
          </div>
          ) : (
            <div className="bg-white border border-gray-100 rounded-2xl p-10 shadow-sm text-center">
              <div className="text-4xl mb-3">📦</div>
              <div className="font-semibold text-gray-700 mb-1">El bloque Mercadería está desactivado</div>
              <div className="text-xs text-gray-400 mb-4">Activalo desde los pills de la pestaña Embarque para cargar la proforma del proveedor.</div>
              <button onClick={()=>cambiarTab('embarque')} className="px-4 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold hover:bg-[#0a4fc4]">Ir a Embarque</button>
            </div>
          )}
          <div className="flex justify-between">
            <button onClick={()=>cambiarTab('embarque')} className="px-4 py-2 border border-gray-200 rounded-lg text-xs hover:bg-gray-50">Anterior</button>
            <button onClick={()=>cambiarTab('logistica')} className="bg-[#1168F8] text-white px-5 py-2 rounded-lg text-xs font-medium hover:bg-[#0a4fc4]">Logística →</button>
          </div>
        </div>
      )}

      {/* ── LOGÍSTICA REDISEÑADA ── */}
      {tab==='logistica'&&(
        <div className="space-y-4">
          {/* TC */}
          <div className="flex gap-4 items-center px-4 py-2.5 bg-white border border-gray-100 rounded-xl text-xs flex-wrap">
            <span className="font-medium text-gray-700">Tipos de cambio:</span>
            <div className="flex items-center gap-2"><label className="text-gray-500">USD/ARS</label><input type="text" inputMode="decimal" onFocus={e=>e.target.select()} value={s.tcTrib} onChange={e=>u('tcTrib',parseNum(e.target.value)||1000)} className="w-20 px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8]"/></div>
            <div className="flex items-center gap-2"><label className="text-gray-500">USD/CLP</label><input type="text" inputMode="decimal" onFocus={e=>e.target.select()} value={s.tcClp} onChange={e=>u('tcClp',parseNum(e.target.value)||950)} className="w-20 px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8]"/></div>
          </div>

          {/* Bloques 1-4: orden normal en impo, invertido en expo */}
          <div className={`flex flex-col gap-4 ${s.sentido==='exportacion'?'flex-col-reverse':''}`}>
          {/* ── BLOQUE 1: COTIZACIONES FORWARDER ── */}
          <div className={`bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm ${!bloqueActivo(0)?'hidden':''}`}>
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#1168F8] text-white text-[10px] font-bold">1</span>
              <span className="font-medium text-sm text-gray-900">{bloques[0]?.nombre || 'Bloque 1'}</span>
              <span className="text-[10px] text-gray-400">Flete marítimo · handling · gastos naviero</span>
              <div className="ml-auto flex items-center gap-2 flex-wrap">
                {/* Info hoja 1 */}
                {s.contenedores.length>0&&(
                  <div className="flex gap-1.5">
                    {s.contenedores.map((c,i)=>(
                      <span key={i} className="px-2 py-0.5 bg-[#EBF2FF] text-[#052698] rounded-full text-[10px] font-bold">{c.cantidad}×{c.tipo}</span>
                    ))}
                  </div>
                )}
                <select onChange={e=>{if(e.target.value){agregarFWDesdeSistema(e.target.value);e.target.value=''}}}
                    className="px-2 py-1 border border-gray-200 rounded-lg text-[10px] bg-white focus:outline-none focus:border-[#1168F8]" defaultValue="">
                    <option value="">+ Cargar del sistema</option>
                    {(()=>{
                      const especificas=cotsFW.filter(c=>c.tipo==='especifica'&&clienteSelId&&c.cliente_id===clienteSelId)
                      const genericas=cotsFW.filter(c=>c.tipo!=='especifica'||!clienteSelId||c.cliente_id!==clienteSelId)
                      return(<>
                        {especificas.length>0&&(<optgroup label="⭐ Específicas para este cliente">
                          {especificas.map((c:any)=>{const cli=terceros.find(t=>t.id===c.cliente_id);return(<option key={c.id} value={c.id}>⭐ {c.proveedor_nombre}{cli?` · ${cli.razon_social}`:''} — {c.referencia||c.fecha}{!isVigente(c.fecha_vencimiento||'')?'  (VENCIDA)':''}</option>)})}
                        </optgroup>)}
                        <optgroup label="Genéricas vigentes">
                          {genericas.filter((c:any)=>isVigente(c.fecha_vencimiento||'')).map((c:any)=>({c,m:coincidenciaRutaFW(c)})).sort((a:any,b:any)=>{const r:any={fuerte:0,parcial:1,'':2};return r[a.m]-r[b.m]}).map(({c,m}:any)=>(<option key={c.id} value={c.id}>{m==='fuerte'?'✓ ':m==='parcial'?'~ ':''}{c.proveedor_nombre} — {c.referencia||c.fecha}{m==='fuerte'?'  · coincide ruta':m==='parcial'?'  · mismo puerto':''}</option>))}
                        </optgroup>
                      </>)
                    })()}
                  </select>
                <button onClick={()=>{
                  const rubroCod=(rubrosBloque[1]||[]).length>0?(rubrosBloque[1][0]).toLowerCase().replace(/ /g,'_'):'forwarder'
                  window.open(`/cotizaciones-proveedores?nuevo=1&bloque=1&rubro=${rubroCod}&cliente_id=${clienteSelId||''}&cliente_nombre=${encodeURIComponent(s.cliente||'')}`, '_blank')
                }} className="px-3 py-1 bg-[#1168F8] text-white rounded-lg text-[10px] font-bold hover:bg-[#0a4fc4]">+ Manual</button>
              </div>
            </div>
            <div className="px-5 py-4">
              {s.cotsProvFW.length===0?(
                <div className="text-xs text-gray-400 bg-gray-50 rounded-xl px-4 py-3 text-center">
                  Sin cotizaciones de ForWarder. Cargalas del sistema o ingresalas manualmente.
                </div>
              ):(
                <div>
                  {s.cotsProvFW.map(fw=>{
                    const vigente=isVigente(fw.fechaVencimiento)
                    const totalSel=fw.esManual?(fw.manualMonto||0):fw.items.filter(i=>i.seleccionado).reduce((t,i)=>t+i.subtotal,0)
                    return (
                      <div key={fw.uid} className={`border-2 rounded-xl overflow-hidden mb-3 transition-all ${fw.elegida?'border-[#1168F8]':!vigente?'border-red-200 opacity-60':'border-gray-200'}`}>
                        {/* Header */}
                        <div className={`flex items-center gap-0 ${fw.elegida?'bg-[#EBF2FF]':!vigente?'bg-red-50':'bg-gray-50'}`}>
                          <button onClick={()=>elegirCotProv('cotsProvFW',fw.uid)} disabled={!vigente}
                            className="w-10 flex-shrink-0 flex items-center justify-center self-stretch hover:bg-black/5">
                            <div className={`w-4 h-4 rounded-full border-2 transition-all ${fw.elegida?'border-[#1168F8] bg-[#1168F8]':'border-gray-300 bg-white'}`}>
                              {fw.elegida&&<div className="w-1.5 h-1.5 bg-white rounded-full mx-auto mt-0.5"/>}
                            </div>
                          </button>
                          <div className="flex-1 px-3 py-2.5 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              {fw.esManual?(
                                <input value={fw.proveedorNombre}
                                  onChange={e=>setS(p=>({...p,cotsProvFW:p.cotsProvFW.map(c=>c.uid===fw.uid?{...c,proveedorNombre:e.target.value}:c)}))}
                                  className="font-semibold text-sm text-gray-900 bg-transparent border-b border-dashed border-gray-300 focus:outline-none focus:border-[#1168F8] min-w-32"
                                  placeholder="Nombre ForWarder"/>
                              ):(
                                <span className="font-semibold text-sm text-gray-900">{fw.proveedorNombre}</span>
                              )}
                              {fw.tipo==='especifica'?(
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#EEEDFE] text-[#3C3489]">
                                  ⭐ Específica{fw.clienteId&&terceros.find(t=>t.id===fw.clienteId)?` · ${terceros.find(t=>t.id===fw.clienteId)!.razon_social}`:''}
                                </span>
                              ):(
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500">Genérica</span>
                              )}
                              {vigente?(
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-50 text-green-700">vigente</span>
                              ):(
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-700">vencida {fmtFecha(fw.fechaVencimiento)}</span>
                              )}
                              {fw.usadaEnCots.length>0&&(
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">⚠ Usada en {fw.usadaEnCots.join(', ')}</span>
                              )}
                              {fw.elegida&&<span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#1168F8] text-white">ELEGIDA</span>}
                            </div>
                            {!fw.esManual&&(
                              <div className="flex gap-4 text-[10px] text-gray-500 flex-wrap">
                                {fw.referencia&&<span className="font-mono">Ref: {fw.referencia}</span>}
                                {fw.fechaEmision&&<span>Emitida: {fmtFecha(fw.fechaEmision)}</span>}
                                {fw.fechaVencimiento&&<span className={!vigente?'text-red-500 font-semibold':''}>Vence: {fmtFecha(fw.fechaVencimiento)}</span>}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-3 px-3 flex-shrink-0">
                            {fw.elegida&&totalSel>0&&(
                              <div className="text-right">
                                <div className="text-[10px] text-gray-400">Seleccionado</div>
                                <div className="font-mono font-bold text-[#052698] text-sm">USD {fmt(totalSel)}</div>
                              </div>
                            )}
                            <button onClick={()=>eliminarCotProv('cotsProvFW',fw.uid)} className="text-gray-300 hover:text-red-500 text-xs">✕</button>
                          </div>
                        </div>

                        {/* Items o manual */}
                        <div className="border-t border-gray-100">
                          {fw.esManual?(
                            <div className="px-4 py-3 flex items-center gap-3">
                              <span className="text-xs text-gray-500">Monto total USD</span>
                              <input type="text" inputMode="decimal" value={fw.manualMonto||''} onFocus={e=>e.target.select()}
                                onChange={e=>setS(p=>({...p,cotsProvFW:p.cotsProvFW.map(c=>c.uid===fw.uid?{...c,manualMonto:parseNum(e.target.value)}:c)}))}
                                className="w-32 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-right font-mono focus:outline-none focus:border-[#1168F8] bg-white" placeholder="0.00"/>
                              <span className="text-xs text-gray-400">USD</span>
                            </div>
                          ):(
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-gray-50 border-b border-gray-100">
                                  <th className="w-8 px-2 py-2"></th>
                                  <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase">Ítem cotizado</th>
                                  <th className="text-right px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase w-28">Precio unit.</th>
                                  <th className="text-center px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase w-24">Cant. cot.</th>
                                  <th className="text-center px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase w-28">Cant. a usar</th>
                                  <th className="text-right px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase w-28">Subtotal</th>
                                </tr>
                              </thead>
                              <tbody>
                                {fw.items.map(it=>{
                                  const coincide=s.contenedores.some(c=>c.tipo===it.tipoContenedor)
                                  const cantSug=s.contenedores.find(c=>c.tipo===it.tipoContenedor)?.cantidad
                                  return (
                                    <tr key={it.itemId} className={`border-b border-gray-50 ${itemCoincideRutaFW(it)?'bg-green-50 border-l-4 border-l-green-500':it.seleccionado?'bg-[#EBF2FF]/60':'hover:bg-gray-50'}`}>
                                      <td className="px-2 py-2.5 text-center">
                                        <button onClick={()=>toggleItemCotProv('cotsProvFW',fw.uid,it.itemId)}>
                                          <div className={`w-4 h-4 rounded border-2 mx-auto flex items-center justify-center ${it.seleccionado?'bg-[#1168F8] border-[#1168F8]':'border-gray-300 hover:border-[#1168F8]'}`}>
                                            {it.seleccionado&&<div className="w-2 h-1.5 border-l-2 border-b-2 border-white" style={{transform:'rotate(-45deg) translate(1px,-1px)'}}/>}
                                          </div>
                                        </button>
                                      </td>
                                      <td className="px-3 py-2.5">
                                        <div className="font-medium text-gray-800">{it.descripcion}</div>
                                        <div className="flex gap-1.5 mt-0.5 flex-wrap">
                                          {it.tipoContenedor&&<span className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{it.tipoContenedor}</span>}
                                          {coincide&&<span className="text-[9px] bg-[#EBF2FF] text-[#052698] border border-[#93B8FC] px-1.5 py-0.5 rounded-full font-semibold">✓ coincide hoja 1</span>}
                                        </div>
                                      </td>
                                      <td className="px-3 py-2.5 text-right font-mono text-gray-700">USD {fmt(it.valorUnit)}</td>
                                      <td className="px-3 py-2.5 text-center text-gray-400 font-mono">{it.cantCotizada>0?it.cantCotizada:'—'}</td>
                                      <td className="px-3 py-2.5 text-center">
                                        {it.seleccionado?(
                                          <div className="flex flex-col items-center gap-0.5">
                                            <input type="text" inputMode="decimal" value={it.cantUsar} onFocus={e=>e.target.select()}
                                              onChange={e=>setCantUsarCotProv('cotsProvFW',fw.uid,it.itemId,parseNum(e.target.value)||1)}
                                              className="w-16 px-2 py-1 border border-[#93B8FC] rounded-lg text-xs text-right font-mono bg-white focus:outline-none focus:border-[#1168F8]"/>
                                            {cantSug&&cantSug!==it.cantUsar&&<div className="text-[9px] text-amber-600">hoja 1: {cantSug}</div>}
                                          </div>
                                        ):<span className="text-gray-300">—</span>}
                                      </td>
                                      <td className="px-3 py-2.5 text-right">
                                        {it.seleccionado?<span className="font-mono font-semibold text-[#052698]">USD {fmt(it.subtotal)}</span>:<span className="text-gray-300">—</span>}
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          )}

                          {/* Seguro alcance */}
                          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
                            <div className="text-[10px] text-gray-500 font-medium mb-2">Alcance del seguro</div>
                            <div className="flex gap-2 flex-wrap">
                              {([{k:'no',l:'Sin seguro'},{k:'maritimo',l:'Solo tramo marítimo'},{k:'punta_a_punta',l:'Origen a destino final'}] as const).map(o=>(
                                <button key={o.k} onClick={()=>updateSegAlcanceFW(fw.uid,o.k)}
                                  className={`px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-colors ${fw.segAlcance===o.k?'bg-[#1168F8] text-white border-[#1168F8]':'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                                  {o.l}
                                </button>
                              ))}
                              {fw.segAlcance!=='no'&&(
                                <div className="flex items-center gap-2 mt-2 w-full flex-wrap">
                                  <select value={fw.seguroModo} onChange={e=>setS(p=>({...p,cotsProvFW:p.cotsProvFW.map(c=>c.uid===fw.uid?{...c,seguroModo:e.target.value as any}:c)}))}
                                    className="px-2 py-1 border border-[#93B8FC] rounded text-xs focus:outline-none bg-white">
                                    <option value="pct">% sobre FOB</option><option value="fijo">Monto fijo USD</option>
                                  </select>
                                  <input type="text" inputMode="decimal" value={fw.seguroMonto||''} onFocus={e=>e.target.select()}
                                    onChange={e=>setS(p=>({...p,cotsProvFW:p.cotsProvFW.map(c=>c.uid===fw.uid?{...c,seguroMonto:parseNum(e.target.value)}:c)}))}
                                    className="w-24 px-2 py-1 border border-[#93B8FC] rounded text-xs text-right font-mono bg-white focus:outline-none" placeholder="0.00"/>
                                  <span className="text-[10px] text-gray-400">{fw.seguroModo==='pct'?'%':'USD'}</span>
                                  {fw.seguroModo==='pct'&&totalFOB>0&&(
                                    <span className="text-[10px] font-mono text-[#052698] bg-[#EBF2FF] px-2 py-0.5 rounded">= USD {fmt(totalFOB*fw.seguroMonto/100)}</span>
                                  )}
                                  {fw.segAlcance==='maritimo'&&<span className="text-[9px] text-amber-600 font-medium">→ Se habilitará seguro terrestre en Bloque 3</span>}
                                  {fw.segAlcance==='punta_a_punta'&&<span className="text-[9px] text-green-600 font-medium">→ No requiere seguro terrestre adicional</span>}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Fila total */}
                          {fw.elegida&&(
                            <div className="flex justify-end px-4 py-2 border-t border-gray-100">
                              <span className="font-mono font-bold text-[#052698] text-sm">
                                Total seleccionado: USD {fmt(totalSel)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

            </div>
            <div className="flex justify-between items-center px-5 py-2.5 bg-gray-50 border-t border-gray-100 text-xs text-gray-500">
              <span>{fwElegida?`ForWarder elegido: ${fwElegida.proveedorNombre||'Manual'}`:s.cotsProvFW.length>0?'Ninguno elegido':'Sin cotizaciones'}</span>
              <span>Flete: <strong className="font-mono text-gray-800">USD {fmt(subFW)}</strong> + Seguro: <strong className="font-mono text-gray-800">USD {fmt(totalSeg)}</strong></span>
            </div>
          </div>

                    {/* ── BLOQUE 2: MODALIDAD + GASTOS POST-ENTREGA CHILE ── */}
          <div className={`bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm ${!bloqueActivo(1)?'hidden':''}`}>
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#0a9e6e] text-white text-[10px] font-bold">2</span>
              <span className="font-medium text-sm text-gray-900">{bloques[1]?.nombre || 'Bloque 2'}</span>
            </div>
            <div className="px-5 py-4">
              {/* Opciones A / B1 / B2 */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                {(s.sentido==='exportacion'
  ? [{key:'A',label:'Opcion A',sub:'Contenedor completo desde Argentina'},{key:'B1',label:'Opcion B1',sub:'Descarga directa de camion + consolidar'},{key:'B2',label:'Opcion B2',sub:'Descargar camion + almacenar + consolidar'}]
  : [{key:'A',label:'Opcion A',sub:'Contenedor completo hasta Argentina'},{key:'B1',label:'Opcion B1',sub:'Desconsolidar + cargar directo al camion'},{key:'B2',label:'Opcion B2',sub:'Desconsolidar + almacenar + cargar al camion'}]
).map(o=>(
                  <button key={o.key} onClick={()=>u('optTransp',o.key as OptTransp)} className={`px-3 py-2.5 rounded-lg border text-left transition-colors ${s.optTransp===o.key?'border-[#0a9e6e] bg-green-50 text-green-800':'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    <div className="text-xs font-semibold">{o.label}</div><div className="text-[10px] opacity-70 mt-0.5">{o.sub}</div>
                  </button>
                ))}
              </div>

              {/* Cotizaciones transporte Chile-NOA — A, B1 y B2 */}
              <div className="border-t border-gray-100 pt-3 mb-3">
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Gastos en Chile</div>
                  <div className="flex items-center gap-2">
                    <select onChange={e=>{if(e.target.value){agregarTranspChileDesdeSistema(e.target.value);e.target.value=''}}}
                      className="px-2 py-1 border border-gray-200 rounded-lg text-[10px] bg-white focus:outline-none focus:border-[#0a9e6e]" defaultValue="">
                      <option value="">+ Cargar del sistema</option>
                      {(()=>{
                        const esp=cotsChile.filter(c=>c.tipo==='especifica'&&clienteSelId&&c.cliente_id===clienteSelId)
                        const gen=cotsChile.filter(c=>c.tipo!=='especifica'||!clienteSelId||c.cliente_id!==clienteSelId)
                        return(<>
                          {esp.length>0&&(<optgroup label="⭐ Específicas para este cliente">{esp.map((c:any)=>{const cli=terceros.find(t=>t.id===c.cliente_id);return(<option key={c.id} value={c.id}>⭐ {c.proveedor_nombre}{cli?` · ${cli.razon_social}`:''} — {c.referencia||c.fecha}</option>)})}</optgroup>)}
                          <optgroup label="Genéricas vigentes">{gen.filter((c:any)=>isVigente(c.fecha_vencimiento||'')).map((c:any)=>(<option key={c.id} value={c.id}>{c.proveedor_nombre} — {c.referencia||c.fecha}</option>))}</optgroup>
                        </>)
                      })()}
                    </select>
                    <button onClick={()=>{
                      const rubroCod=(rubrosBloque[2]||[]).length>0?(rubrosBloque[2][0]).toLowerCase().replace(/ /g,'_'):'transporte_chile'
                      window.open(`/cotizaciones-proveedores?nuevo=1&bloque=2&opcion=${s.optTransp}&rubro=${rubroCod}&cliente_id=${clienteSelId||''}&cliente_nombre=${encodeURIComponent(s.cliente||'')}`, '_blank')
                    }} className="px-3 py-1 bg-[#0a9e6e] text-white rounded-lg text-[10px] font-bold hover:bg-[#087a55] whitespace-nowrap">+ Manual</button>
                  </div>
                </div>
                {s.cotsProvChile.length===0&&(
                  <div className="text-xs text-gray-400 bg-gray-50 rounded-xl px-4 py-3 text-center mb-2">
                    Sin cotizaciones de gastos en Chile. Cargalas del sistema o ingresalas con + Manual.
                  </div>
                )}
                {s.cotsProvChile.length>0&&(
                  <div>
                  {s.cotsProvChile.map(ct=>{
                    const vigente=isVigente(ct.fechaVencimiento)
                    const totalSel=ct.esManual?(ct.manualMonto||0):ct.items.filter(i=>i.seleccionado).reduce((t,i)=>t+i.subtotal,0)
                    return (
                      <div key={ct.uid} className={`border-2 rounded-xl overflow-hidden mb-2 ${ct.elegida?'border-[#0a9e6e]':'border-gray-200'}`}>
                        <div className={`flex items-center gap-0 ${ct.elegida?'bg-green-50':'bg-gray-50'}`}>
                          <button onClick={()=>elegirCotProv('cotsProvChile',ct.uid)} className="w-10 flex-shrink-0 flex items-center justify-center self-stretch hover:bg-black/5">
                            <div className={`w-4 h-4 rounded-full border-2 ${ct.elegida?'border-[#0a9e6e] bg-[#0a9e6e]':'border-gray-300 bg-white'}`}>{ct.elegida&&<div className="w-1.5 h-1.5 bg-white rounded-full mx-auto mt-0.5"/>}</div>
                          </button>
                          <div className="flex-1 px-3 py-2.5">
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                              <span className="font-semibold text-sm text-gray-900">{ct.proveedorNombre}</span>
                              {ct.tipo==='especifica'?<span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#EEEDFE] text-[#3C3489]">⭐ Específica{ct.clienteId&&terceros.find(t=>t.id===ct.clienteId)?` · ${terceros.find(t=>t.id===ct.clienteId)!.razon_social}`:''}</span>:<span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500">Genérica</span>}
                              {vigente?<span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-50 text-green-700">vigente</span>:<span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-700">vencida {fmtFecha(ct.fechaVencimiento)}</span>}
                              {ct.usadaEnCots.length>0&&<span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">⚠ Usada en {ct.usadaEnCots.join(', ')}</span>}
                              {ct.elegida&&<span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#0a9e6e] text-white">ELEGIDA</span>}
                            </div>
                            <div className="flex gap-4 text-[10px] text-gray-500">
                              {ct.referencia&&<span className="font-mono">Ref: {ct.referencia}</span>}
                              {ct.fechaEmision&&<span>Emitida: {fmtFecha(ct.fechaEmision)}</span>}
                              {ct.fechaVencimiento&&<span>Vence: {fmtFecha(ct.fechaVencimiento)}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 px-3">
                            {ct.elegida&&totalSel>0&&<span className="font-mono font-bold text-[#0a9e6e] text-sm">USD {fmt(totalSel)}</span>}
                            <button onClick={()=>eliminarCotProv('cotsProvChile',ct.uid)} className="text-gray-300 hover:text-red-500 text-xs">✕</button>
                          </div>
                        </div>
                        <table className="w-full text-xs border-t border-gray-100">
                          <thead><tr className="bg-gray-50 border-b border-gray-100">
                            <th className="w-8 px-2 py-2"></th>
                            <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase">Ítem</th>
                            <th className="text-right px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase w-28">Precio unit.</th>
                            <th className="text-center px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase w-24">Cant. cot.</th>
                            <th className="text-center px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase w-28">Cant. a usar</th>
                            <th className="text-right px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase w-28">Subtotal</th>
                          </tr></thead>
                          <tbody>
                            {ct.items.map(it=>{
                              const coincide=s.contenedores.some(c=>c.tipo===it.tipoContenedor)
                              return (
                                <tr key={it.itemId} className={`border-b border-gray-50 ${it.seleccionado?'bg-green-50/40':'hover:bg-gray-50'}`}>
                                  <td className="px-2 py-2 text-center">
                                    <button onClick={()=>toggleItemCotProv('cotsProvChile',ct.uid,it.itemId)}>
                                      <div className={`w-4 h-4 rounded border-2 mx-auto flex items-center justify-center ${it.seleccionado?'bg-[#0a9e6e] border-[#0a9e6e]':'border-gray-300 hover:border-[#0a9e6e]'}`}>
                                        {it.seleccionado&&<div className="w-2 h-1.5 border-l-2 border-b-2 border-white" style={{transform:'rotate(-45deg) translate(1px,-1px)'}}/>}
                                      </div>
                                    </button>
                                  </td>
                                  <td className="px-3 py-2">
                                    <div className="font-medium text-gray-800">{it.descripcion}</div>
                                    {coincide&&<span className="text-[9px] bg-green-50 text-green-700 border border-green-200 px-1.5 py-0.5 rounded-full font-semibold">✓ coincide hoja 1</span>}
                                  </td>
                                  <td className="px-3 py-2 text-right font-mono text-gray-700">USD {fmt(it.valorUnit)}</td>
                                  <td className="px-3 py-2 text-center text-gray-400 font-mono">{it.cantCotizada>0?it.cantCotizada:'—'}</td>
                                  <td className="px-3 py-2 text-center">
                                    {it.seleccionado?(
                                      <input type="text" inputMode="decimal" value={it.cantUsar} onFocus={e=>e.target.select()}
                                        onChange={e=>setCantUsarCotProv('cotsProvChile',ct.uid,it.itemId,parseNum(e.target.value)||1)}
                                        className="w-16 px-2 py-1 border border-green-200 rounded-lg text-xs text-right font-mono bg-white focus:outline-none focus:border-[#0a9e6e]"/>
                                    ):<span className="text-gray-300">—</span>}
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    {it.seleccionado?<span className="font-mono font-semibold text-[#0a9e6e]">USD {fmt(it.subtotal)}</span>:<span className="text-gray-300">—</span>}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )
                  })}
                  </div>
                )}
              </div>



              Subtotal bloque 2: <strong className="font-mono text-gray-800">USD {fmt(subD+subGastosChile)}</strong>
            </div>
          </div>

          {/* ── BLOQUE 3: FLETE TERRESTRE ── */}
          <div className={`bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm ${!bloqueActivo(2)?'hidden':''}`}>
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#b45309] text-white text-[10px] font-bold">3</span>
              <span className="font-medium text-sm text-gray-900">{bloques[2]?.nombre || 'Bloque 3'}</span>
              <span className="text-[10px] text-gray-400">{s.optTransp==='A'?'Contenedor completo — ida / devolucion / round trip':'Camion de carga — flete ida'}</span>
            </div>
            <div className="px-5 py-4 space-y-4">
              {/* Opcion A: cotizaciones del sistema + inputs manuales */}
              {s.optTransp==='A'&&(
                <div>
                  {/* Header con selector del sistema y botón manual */}
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Cotización flete terrestre</div>
                    <div className="flex items-center gap-2">
                      <select onChange={e=>{if(e.target.value){agregarTranspTerrDesdeSistema(e.target.value);e.target.value=''}}}
                        className="px-2 py-1 border border-gray-200 rounded-lg text-[10px] bg-white focus:outline-none focus:border-[#b45309]" defaultValue="">
                        <option value="">+ Cargar del sistema</option>
                        {(()=>{
                          const esp=cotsTransp.filter(c=>c.tipo==='especifica'&&clienteSelId&&c.cliente_id===clienteSelId)
                          const gen=cotsTransp.filter(c=>c.tipo!=='especifica'||!clienteSelId||c.cliente_id!==clienteSelId)
                          return(<>
                            {esp.length>0&&(<optgroup label="⭐ Específicas para este cliente">{esp.map((c:any)=>{const cli=terceros.find(t=>t.id===c.cliente_id);return(<option key={c.id} value={c.id}>⭐ {c.proveedor_nombre}{cli?` · ${cli.razon_social}`:''} — {c.referencia||c.fecha}</option>)})}</optgroup>)}
                            <optgroup label="Genéricas vigentes">{gen.filter((c:any)=>isVigente(c.fecha_vencimiento||'')).map((c:any)=>({c,m:coincidenciaRuta(c)})).sort((a:any,b:any)=>{const r:any={fuerte:0,parcial:1,'':2};return r[a.m]-r[b.m]}).map(({c,m}:any)=>(<option key={c.id} value={c.id}>{m==='fuerte'?'✓ ':m==='parcial'?'~ ':''}{c.proveedor_nombre} — {c.referencia||c.fecha}{m==='fuerte'?'  · coincide ruta':m==='parcial'?'  · mismo destino/paso':''}</option>))}</optgroup>
                          </>)
                        })()}
                      </select>
                      <button onClick={()=>{
                        const rubroCod=(rubrosBloque[3]||[]).length>0?(rubrosBloque[3][0]).toLowerCase().replace(/ /g,'_'):'transporte_terrestre'
                        window.open(`/cotizaciones-proveedores?nuevo=1&bloque=3&opcion=A&rubro=${rubroCod}&cliente_id=${clienteSelId||''}&cliente_nombre=${encodeURIComponent(s.cliente||'')}`, '_blank')
                      }} className="px-3 py-1 bg-[#b45309] text-white rounded-lg text-[10px] font-bold hover:bg-[#92400e] whitespace-nowrap">+ Manual</button>
                    </div>
                  </div>
                  {/* Paneles de cotizaciones cargadas */}
                  {s.cotsProvTransp.length===0?(
                    <div className="text-xs text-gray-400 bg-gray-50 rounded-xl px-4 py-3 text-center mb-3">
                      Sin cotizaciones de flete terrestre. Cargalas del sistema o ingresalas con + Manual.
                    </div>
                  ):(
                    s.cotsProvTransp.map(ct=>{
                      const vigente=isVigente(ct.fechaVencimiento)
                      const totalSel=ct.esManual?(ct.manualMonto||0):ct.items.filter(i=>i.seleccionado).reduce((t,i)=>t+i.subtotal,0)
                      return (
                        <div key={ct.uid} className={`border-2 rounded-xl overflow-hidden mb-3 ${ct.elegida?'border-[#b45309]':'border-gray-200'}`}>
                          <div className={`flex items-center gap-0 ${ct.elegida?'bg-amber-50':'bg-gray-50'}`}>
                            <button onClick={()=>elegirCotProv('cotsProvTransp',ct.uid)} className="w-10 flex-shrink-0 flex items-center justify-center self-stretch hover:bg-black/5">
                              <div className={`w-4 h-4 rounded-full border-2 ${ct.elegida?'border-[#b45309] bg-[#b45309]':'border-gray-300 bg-white'}`}>{ct.elegida&&<div className="w-1.5 h-1.5 bg-white rounded-full mx-auto mt-0.5"/>}</div>
                            </button>
                            <div className="flex-1 px-3 py-2.5">
                              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                <span className="font-semibold text-sm text-gray-900">{ct.proveedorNombre}</span>
                                {ct.tipo==='especifica'?<span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#EEEDFE] text-[#3C3489]">⭐ Específica{ct.clienteId&&terceros.find(t=>t.id===ct.clienteId)?` · ${terceros.find(t=>t.id===ct.clienteId)!.razon_social}`:''}</span>:<span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500">Genérica</span>}
                                {vigente?<span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-50 text-green-700">vigente</span>:<span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-700">vencida {fmtFecha(ct.fechaVencimiento)}</span>}
                                {ct.usadaEnCots.length>0&&<span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">⚠ Usada en {ct.usadaEnCots.join(', ')}</span>}
                                {ct.elegida&&<span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#b45309] text-white">ELEGIDA</span>}
                              </div>
                              <div className="flex gap-4 text-[10px] text-gray-500">
                                {ct.referencia&&<span className="font-mono">Ref: {ct.referencia}</span>}
                                {ct.fechaEmision&&<span>Emitida: {fmtFecha(ct.fechaEmision)}</span>}
                                {ct.fechaVencimiento&&<span>Vence: {fmtFecha(ct.fechaVencimiento)}</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-3 px-3">
                              {ct.elegida&&totalSel>0&&<span className="font-mono font-bold text-[#b45309] text-sm">USD {fmt(totalSel)}</span>}
                              <button onClick={()=>eliminarCotProv('cotsProvTransp',ct.uid)} className="text-gray-300 hover:text-red-500 text-xs">✕</button>
                            </div>
                          </div>
                          <table className="w-full text-xs border-t border-gray-100">
                            <thead><tr className="bg-gray-50 border-b border-gray-100">
                              <th className="w-8 px-2 py-2"></th>
                              <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase">Ítem</th>
                              <th className="text-right px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase w-28">Precio unit.</th>
                              <th className="text-center px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase w-24">Cant. cot.</th>
                              <th className="text-center px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase w-28">Cant. a usar</th>
                              <th className="text-right px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase w-28">Subtotal</th>
                            </tr></thead>
                            <tbody>
                              {ct.items.map(it=>{
                                const coincide=s.contenedores.some(c=>c.tipo===it.tipoContenedor)
                                return (
                                  <tr key={it.itemId} className={`border-b border-gray-50 ${itemCoincideRuta(it)?'bg-green-50 border-l-4 border-l-green-500':it.seleccionado?'bg-amber-50/40':'hover:bg-gray-50'}`}>
                                    <td className="px-2 py-2 text-center">
                                      <button onClick={()=>toggleItemCotProv('cotsProvTransp',ct.uid,it.itemId)}>
                                        <div className={`w-4 h-4 rounded border-2 mx-auto flex items-center justify-center ${it.seleccionado?'bg-[#b45309] border-[#b45309]':'border-gray-300 hover:border-[#b45309]'}`}>
                                          {it.seleccionado&&<div className="w-2 h-1.5 border-l-2 border-b-2 border-white" style={{transform:'rotate(-45deg) translate(1px,-1px)'}}/>}
                                        </div>
                                      </button>
                                    </td>
                                    <td className="px-3 py-2">
                                      <div className="font-medium text-gray-800">{it.descripcion}</div>
                                      {coincide&&<span className="text-[9px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full font-semibold">✓ coincide hoja 1</span>}
                                      {itemCoincideRuta(it)&&<span className="text-[9px] bg-green-100 text-green-700 border border-green-300 px-1.5 py-0.5 rounded-full font-semibold ml-1">✓ tu ruta</span>}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono text-gray-700">USD {fmt(it.valorUnit)}</td>
                                    <td className="px-3 py-2 text-center text-gray-400 font-mono">{it.cantCotizada>0?it.cantCotizada:'—'}</td>
                                    <td className="px-3 py-2 text-center">
                                      {it.seleccionado?(
                                        <input type="text" inputMode="decimal" value={it.cantUsar} onFocus={e=>e.target.select()}
                                          onChange={e=>setCantUsarCotProv('cotsProvTransp',ct.uid,it.itemId,parseNum(e.target.value)||1)}
                                          className="w-16 px-2 py-1 border border-amber-200 rounded-lg text-xs text-right font-mono bg-white focus:outline-none focus:border-[#b45309]"/>
                                      ):<span className="text-gray-300">—</span>}
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                      {it.seleccionado?<span className="font-mono font-semibold text-[#b45309]">USD {fmt(it.subtotal)}</span>:<span className="text-gray-300">—</span>}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      )
                    })
                  )}

                </div>
              )}
              {/* Opciones B1/B2: cotizaciones de flete terrestre */}
              {s.optTransp!=='A'&&(
                <div>
                  {/* Selector del sistema */}
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <span className="text-[10px] text-gray-500">Cotizaciones:</span>
                  {cotsTransp.length>0&&(
                    <select onChange={e=>{if(e.target.value){agregarTranspTerrDesdeSistema(e.target.value);e.target.value=''}}}
                      className="px-2 py-1 border border-gray-200 rounded-lg text-[10px] bg-white focus:outline-none focus:border-[#b45309]" defaultValue="">
                      <option value="">+ Cargar del sistema</option>
                        {(()=>{
                          const esp=cotsTransp.filter(c=>c.tipo==='especifica'&&clienteSelId&&c.cliente_id===clienteSelId)
                          const gen=cotsTransp.filter(c=>c.tipo!=='especifica'||!clienteSelId||c.cliente_id!==clienteSelId)
                          return(<>
                            {esp.length>0&&(<optgroup label="⭐ Específicas para este cliente">{esp.map((c:any)=>{const cli=terceros.find(t=>t.id===c.cliente_id);return(<option key={c.id} value={c.id}>⭐ {c.proveedor_nombre}{cli?` · ${cli.razon_social}`:''} — {c.referencia||c.fecha}</option>)})}</optgroup>)}
                            <optgroup label="Genéricas vigentes">{gen.filter((c:any)=>isVigente(c.fecha_vencimiento||'')).map((c:any)=>({c,m:coincidenciaRuta(c)})).sort((a:any,b:any)=>{const r:any={fuerte:0,parcial:1,'':2};return r[a.m]-r[b.m]}).map(({c,m}:any)=>(<option key={c.id} value={c.id}>{m==='fuerte'?'✓ ':m==='parcial'?'~ ':''}{c.proveedor_nombre} — {c.referencia||c.fecha}{m==='fuerte'?'  · coincide ruta':m==='parcial'?'  · mismo destino/paso':''}</option>))}</optgroup>
                          </>)
                        })()}
                    </select>
                  )}
                    <button onClick={()=>{
                      const rubroCod=(rubrosBloque[3]||[]).length>0?(rubrosBloque[3][0]).toLowerCase().replace(/ /g,'_'):'transporte_terrestre'
                      window.open(`/cotizaciones-proveedores?nuevo=1&bloque=3&rubro=${rubroCod}&cliente_id=${clienteSelId||''}&cliente_nombre=${encodeURIComponent(s.cliente||'')}`, '_blank')
                    }} className="px-3 py-1 bg-[#b45309] text-white rounded-lg text-[10px] font-bold hover:bg-[#92400e] whitespace-nowrap">+ Manual</button>
                  </div>


                  {/* Paneles de cotizaciones cargadas */}
                  {s.cotsProvTransp.map(ct=>{
                    const vigente=isVigente(ct.fechaVencimiento)
                    const totalSel=ct.esManual?(ct.manualMonto||0):ct.items.filter(i=>i.seleccionado).reduce((t,i)=>t+i.subtotal,0)
                    return (
                      <div key={ct.uid} className={`border-2 rounded-xl overflow-hidden mb-3 ${ct.elegida?'border-[#b45309]':'border-gray-200'}`}>
                        <div className={`flex items-center gap-0 ${ct.elegida?'bg-amber-50':'bg-gray-50'}`}>
                          <button onClick={()=>elegirCotProv('cotsProvTransp',ct.uid)} className="w-10 flex-shrink-0 flex items-center justify-center self-stretch hover:bg-black/5">
                            <div className={`w-4 h-4 rounded-full border-2 ${ct.elegida?'border-[#b45309] bg-[#b45309]':'border-gray-300 bg-white'}`}>{ct.elegida&&<div className="w-1.5 h-1.5 bg-white rounded-full mx-auto mt-0.5"/>}</div>
                          </button>
                          <div className="flex-1 px-3 py-2.5">
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                              <span className="font-semibold text-sm text-gray-900">{ct.proveedorNombre}</span>
                              {ct.tipo==='especifica'?<span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#EEEDFE] text-[#3C3489]">⭐ Específica{ct.clienteId&&terceros.find(t=>t.id===ct.clienteId)?` · ${terceros.find(t=>t.id===ct.clienteId)!.razon_social}`:''}</span>:<span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500">Genérica</span>}
                              {vigente?<span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-50 text-green-700">vigente</span>:<span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-700">vencida {fmtFecha(ct.fechaVencimiento)}</span>}
                              {ct.usadaEnCots.length>0&&<span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">⚠ Usada en {ct.usadaEnCots.join(', ')}</span>}
                              {ct.elegida&&<span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#b45309] text-white">ELEGIDA</span>}
                            </div>
                            <div className="flex gap-4 text-[10px] text-gray-500">
                              {ct.referencia&&<span className="font-mono">Ref: {ct.referencia}</span>}
                              {ct.fechaEmision&&<span>Emitida: {fmtFecha(ct.fechaEmision)}</span>}
                              {ct.fechaVencimiento&&<span>Vence: {fmtFecha(ct.fechaVencimiento)}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 px-3">
                            {ct.elegida&&totalSel>0&&<span className="font-mono font-bold text-[#b45309] text-sm">USD {fmt(totalSel)}</span>}
                            <button onClick={()=>eliminarCotProv('cotsProvTransp',ct.uid)} className="text-gray-300 hover:text-red-500 text-xs">✕</button>
                          </div>
                        </div>
                        <table className="w-full text-xs border-t border-gray-100">
                          <thead><tr className="bg-gray-50 border-b border-gray-100">
                            <th className="w-8 px-2 py-2"></th>
                            <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase">Ítem</th>
                            <th className="text-right px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase w-28">Precio unit.</th>
                            <th className="text-center px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase w-24">Cant. cot.</th>
                            <th className="text-center px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase w-28">Cant. a usar</th>
                            <th className="text-right px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase w-28">Subtotal</th>
                          </tr></thead>
                          <tbody>
                            {ct.items.map(it=>{
                              const coincide=s.contenedores.some(c=>c.tipo===it.tipoContenedor)
                              return (
                                <tr key={it.itemId} className={`border-b border-gray-50 ${itemCoincideRuta(it)?'bg-green-50 border-l-4 border-l-green-500':it.seleccionado?'bg-amber-50/40':'hover:bg-gray-50'}`}>
                                  <td className="px-2 py-2 text-center">
                                    <button onClick={()=>toggleItemCotProv('cotsProvTransp',ct.uid,it.itemId)}>
                                      <div className={`w-4 h-4 rounded border-2 mx-auto flex items-center justify-center ${it.seleccionado?'bg-[#b45309] border-[#b45309]':'border-gray-300 hover:border-[#b45309]'}`}>
                                        {it.seleccionado&&<div className="w-2 h-1.5 border-l-2 border-b-2 border-white" style={{transform:'rotate(-45deg) translate(1px,-1px)'}}/>}
                                      </div>
                                    </button>
                                  </td>
                                  <td className="px-3 py-2">
                                    <div className="font-medium text-gray-800">{it.descripcion}</div>
                                    {coincide&&<span className="text-[9px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full font-semibold">✓ coincide hoja 1</span>}
                                      {itemCoincideRuta(it)&&<span className="text-[9px] bg-green-100 text-green-700 border border-green-300 px-1.5 py-0.5 rounded-full font-semibold ml-1">✓ tu ruta</span>}
                                  </td>
                                  <td className="px-3 py-2 text-right font-mono text-gray-700">USD {fmt(it.valorUnit)}</td>
                                  <td className="px-3 py-2 text-center text-gray-400 font-mono">{it.cantCotizada>0?it.cantCotizada:'—'}</td>
                                  <td className="px-3 py-2 text-center">
                                    {it.seleccionado?(
                                      <input type="text" inputMode="decimal" value={it.cantUsar} onFocus={e=>e.target.select()}
                                        onChange={e=>setCantUsarCotProv('cotsProvTransp',ct.uid,it.itemId,parseNum(e.target.value)||1)}
                                        className="w-16 px-2 py-1 border border-amber-200 rounded-lg text-xs text-right font-mono bg-white focus:outline-none focus:border-[#b45309]"/>
                                    ):<span className="text-gray-300">—</span>}
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    {it.seleccionado?<span className="font-mono font-semibold text-[#b45309]">USD {fmt(it.subtotal)}</span>:<span className="text-gray-300">—</span>}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )
                  })}



                </div>
              )}

              {/* Seguro terrestre — solo si FW elegido tiene alcance maritimo */}
              {fwElegida?.segAlcance==='maritimo'&&(
                <div className="pt-3 border-t border-gray-100">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Seguro terrestre</div>
                    <span className="text-[9px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium">Requerido — seguro maritimo no cubre este tramo</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Modalidad"><select value={s.segModoIndep} onChange={e=>u('segModoIndep',e.target.value as any)} className={sel}><option value="pct">% sobre CIF</option><option value="fijo">Monto fijo (USD)</option></select></Field>
                    <Field label={s.segModoIndep==='pct'?'Tasa (%)':'Monto (USD)'}><input type="text" inputMode="decimal" onFocus={e=>e.target.select()} value={s.segValIndep} onChange={e=>u('segValIndep',parseNum(e.target.value))} className={inp}/></Field>
                    <Field label="Seguro calculado"><div className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-right font-mono">USD {fmt(segIndepCalc)}</div></Field>
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end items-center gap-2 px-5 py-2.5 bg-gray-50 border-t border-gray-100 text-xs text-gray-500">
              Subtotal bloque 3: <strong className="font-mono text-gray-800">USD {fmt(subTransp+subEstadias+segIndepCalc)}</strong>
            </div>
          </div>

          {/* ── BLOQUE 4: GASTOS ARGENTINA ── */}
          <div className={`bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm ${!bloqueActivo(3)?'hidden':''}`}>
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#6b21a8] text-white text-[10px] font-bold">4</span>
              <span className="font-medium text-sm text-gray-900">{bloques[3]?.nombre || 'Bloque 4'}</span>
            </div>
            <div className="px-5 py-4">
              {/* Seccion A — Despachante de aduana */}
              <div className="mb-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#6b21a8]/20 text-[#6b21a8] text-[10px] font-bold border border-[#6b21a8]/30">A</span>
                    <span className="text-xs font-semibold text-gray-700">Despachante de aduana</span>
                  </div>
                  <button onClick={()=>u('gastosDesp',[...s.gastosDesp,{id:uid2(),desc:'',tipoCalc:'fijo_usd',moneda:'USD',valor:0,pisoUsd:0,techoUsd:0,usd:0,ars:0}])}
                    className="text-[10px] text-[#6b21a8] hover:underline">+ Agregar gasto</button>
                </div>
                {/* Buscador despachante + selector cotización del sistema */}
                <div className="flex gap-2 mb-3">
                  <div className="relative flex-1">
                    <input
                      value={despachanteSelId ? despachantes.find((d:any)=>d.id===despachanteSelId)?.razon_social||'' : buscarDespachante}
                      onChange={e=>{setBuscarDespachante(e.target.value);setShowDespachanteDropdown(e.target.value.length>0);if(!e.target.value){setDespachanteSelId(null);u('despachante','')}}}
                      onFocus={()=>setShowDespachanteDropdown(true)}
                      onClick={e=>e.stopPropagation()}
                      className={inp} placeholder="Buscar despachante de aduana..."/>
                    {showDespachanteDropdown&&despachantes.filter((d:any)=>!buscarDespachante||d.razon_social?.toLowerCase().includes(buscarDespachante.toLowerCase())).length>0&&(
                      <div className="absolute z-50 top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl max-h-40 overflow-y-auto mt-1" onClick={e=>e.stopPropagation()}>
                        {despachantes.filter((d:any)=>!buscarDespachante||d.razon_social?.toLowerCase().includes(buscarDespachante.toLowerCase())).map((d:any)=>(
                          <button key={d.id} onMouseDown={()=>seleccionarDespachante(d)} className="w-full text-left px-4 py-2.5 hover:bg-[#EBF2FF] text-xs border-b border-gray-50 last:border-0">
                            <div className="font-semibold text-gray-900">{d.razon_social}</div>
                          </button>
                        ))}
                      </div>
                    )}
                    {despachantes.length===0&&<div className="mt-1 text-[9px] text-amber-600">Sin despachantes. Agregalos en Clientes y Proveedores con rubro Despachante de aduana.</div>}
                  </div>

                </div>
                {loadingDesp&&<div className="text-[10px] text-gray-400 mb-2">Cargando condiciones del despachante...</div>}
                {despachanteSelId&&(
                  <div className="mb-3 flex items-center gap-2 flex-wrap">
                    <span className="text-[9px] text-green-600 font-medium bg-green-50 px-2 py-0.5 rounded-full">
                      ✓ {despachantes.find((d:any)=>d.id===despachanteSelId)?.razon_social}
                    </span>
                    {cotDesp ? (
                      <span className={`text-[9px] font-medium px-2 py-0.5 rounded-full ${cotDesp.tipo==='especifica'?'bg-amber-50 text-amber-700 border border-amber-200':'bg-gray-100 text-gray-500'}`}>
                        {cotDesp.tipo==='especifica'?'⭐ Cotizacion especifica':'Cotizacion generica'}
                        {cotDesp.referencia?' — '+cotDesp.referencia:''}
                        {cotDesp.fecha?' ('+cotDesp.fecha.slice(0,10).split('-').reverse().join('/')+')':''}
                      </span>
                    ) : (
                      <span className="text-[9px] text-gray-400 italic">Sin cotizacion del sistema — valores manuales</span>
                    )}
                    <button onClick={()=>{setDespachanteSelId(null);u('despachante','');setBuscarDespachante('');setCotDesp(null);setS(p=>({...p,honTipo:'fijo_usd',honValor:0,honPiso:0,honTecho:0,gastosDesp:[]}))}}
                      className="text-[9px] text-gray-400 hover:text-red-500">Cambiar</button>
                  </div>
                )}
                {/* Honorario — fijo, siempre visible. Fila 1: tipo+valor. Fila 2 (solo si %): piso+techo */}
                <div className="p-3 bg-purple-50 rounded-lg border border-purple-100 mb-2">
                  <div className="text-[10px] font-semibold text-[#6b21a8] mb-2">Honorario despachante de aduana</div>
                  <div className="flex gap-2 items-center mb-2">
                    <select value={s.honTipo} onChange={e=>u('honTipo',e.target.value as any)}
                      className="px-2 py-1.5 border border-purple-200 rounded-lg text-xs focus:outline-none bg-white w-36 flex-shrink-0">
                      <option value="pct_cif">% sobre CIF</option>
                      <option value="fijo_usd">Fijo USD</option>
                      <option value="fijo_ars">Fijo ARS</option>
                    </select>
                    <span className="text-[10px] text-gray-500 flex-shrink-0">{s.honTipo==='pct_cif'?'%':s.honTipo==='fijo_ars'?'ARS':'USD'}</span>
                    <input type="text" inputMode="decimal" value={s.honValor||''} placeholder="0" onFocus={e=>e.target.select()}
                      onChange={e=>u('honValor',parseNum(e.target.value))}
                      className="w-32 px-2 py-1.5 border border-purple-200 rounded-lg text-xs text-right font-mono bg-white focus:outline-none focus:border-[#6b21a8]"/>
                  </div>
                  {s.honTipo==='pct_cif'&&(
                    <div className="flex gap-2 items-center mb-1">
                      <span className="text-[10px] text-gray-400 w-36 flex-shrink-0 text-right">Piso USD</span>
                      <input type="text" inputMode="decimal" value={s.honPiso||''} placeholder="0" onFocus={e=>e.target.select()}
                        onChange={e=>u('honPiso',parseNum(e.target.value))}
                        className="w-32 px-2 py-1.5 border border-purple-200 rounded-lg text-xs text-right font-mono bg-white focus:outline-none focus:border-[#6b21a8]"/>
                      <span className="text-[10px] text-gray-400 ml-2 flex-shrink-0">Techo USD</span>
                      <input type="text" inputMode="decimal" value={s.honTecho||''} placeholder="0" onFocus={e=>e.target.select()}
                        onChange={e=>u('honTecho',parseNum(e.target.value))}
                        className="w-32 px-2 py-1.5 border border-purple-200 rounded-lg text-xs text-right font-mono bg-white focus:outline-none focus:border-[#6b21a8]"/>
                    </div>
                  )}
                  <div className="flex justify-end mt-1">
                    <span className="font-mono font-semibold text-[#6b21a8] text-xs">USD {fmt(subHon)}</span>
                    <span className="text-gray-300 mx-2">—</span>
                    <span className="font-mono text-gray-500 text-[10px]">ARS {Math.round(subHon*s.tcTrib).toLocaleString('es-AR')}</span>
                  </div>
                </div>
                {/* Gastos adicionales del despachante — misma estructura, eliminables */}
                {s.gastosDesp.map((g,i)=>{
                  const usdItem=calcGastoArg(g,cif,s.tcTrib)
                  return (
                    <div key={g.id} className="p-3 bg-purple-50 rounded-lg border border-purple-100 mb-2">
                      <div className="flex gap-2 items-center mb-2">
                        <input value={g.desc} onChange={e=>{const n=[...s.gastosDesp];n[i]={...n[i],desc:e.target.value};u('gastosDesp',n)}}
                          className="flex-1 px-2.5 py-1.5 border border-purple-200 rounded-lg text-xs focus:outline-none focus:border-[#6b21a8] bg-white" placeholder="Concepto (ej. Gastos administrativos)"/>
                        <select value={g.tipoCalc} onChange={e=>{const n=[...s.gastosDesp];n[i]={...n[i],tipoCalc:e.target.value as any};u('gastosDesp',n)}}
                          className="px-2 py-1.5 border border-purple-200 rounded-lg text-xs focus:outline-none bg-white w-36 flex-shrink-0">
                          <option value="pct_cif">% sobre CIF</option>
                          <option value="fijo_usd">Fijo USD</option>
                          <option value="fijo_ars">Fijo ARS</option>
                        </select>
                        <span className="text-[10px] text-gray-500 flex-shrink-0">{g.tipoCalc==='pct_cif'?'%':g.tipoCalc==='fijo_ars'?'ARS':'USD'}</span>
                        <input type="text" inputMode="decimal" value={g.valor||''} placeholder="0" onFocus={e=>e.target.select()}
                          onChange={e=>{const n=[...s.gastosDesp];n[i]={...n[i],valor:parseNum(e.target.value)};u('gastosDesp',n)}}
                          className="w-28 px-2 py-1.5 border border-purple-200 rounded-lg text-xs text-right font-mono bg-white focus:outline-none"/>
                        <button onClick={()=>u('gastosDesp',s.gastosDesp.filter((_,j)=>j!==i))} className="text-gray-400 hover:text-red-500 text-xs flex-shrink-0">X</button>
                      </div>
                      {g.tipoCalc==='pct_cif'&&(
                        <div className="flex gap-2 items-center mb-1">
                          <span className="text-[10px] text-gray-400 flex-shrink-0 ml-1">Piso USD</span>
                          <input type="text" inputMode="decimal" value={g.pisoUsd||''} placeholder="0" onFocus={e=>e.target.select()}
                            onChange={e=>{const n=[...s.gastosDesp];n[i]={...n[i],pisoUsd:parseNum(e.target.value)};u('gastosDesp',n)}}
                            className="w-28 px-2 py-1.5 border border-purple-200 rounded-lg text-xs text-right font-mono bg-white focus:outline-none"/>
                          <span className="text-[10px] text-gray-400 ml-2 flex-shrink-0">Techo USD</span>
                          <input type="text" inputMode="decimal" value={g.techoUsd||''} placeholder="0" onFocus={e=>e.target.select()}
                            onChange={e=>{const n=[...s.gastosDesp];n[i]={...n[i],techoUsd:parseNum(e.target.value)};u('gastosDesp',n)}}
                            className="w-28 px-2 py-1.5 border border-purple-200 rounded-lg text-xs text-right font-mono bg-white focus:outline-none"/>
                        </div>
                      )}
                      <div className="flex justify-end mt-1">
                        <span className="font-mono font-semibold text-[#6b21a8] text-xs">USD {fmt(usdItem)}</span>
                        <span className="text-gray-300 mx-2">—</span>
                        <span className="font-mono text-gray-500 text-[10px]">ARS {Math.round(usdItem*s.tcTrib).toLocaleString('es-AR')}</span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Seccion B — Otros gastos en Argentina */}
              <div className="pt-4 border-t border-gray-100">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 text-gray-600 text-[10px] font-bold">B</span>
                    <span className="text-xs font-semibold text-gray-700">Otros gastos en Argentina</span>
                    <span className="text-[10px] text-gray-400">Transporte interno, almacenaje, etc.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <select onChange={e=>{
                      if(!e.target.value) return
                      const cot=cotsArgDisponibles.find((c:any)=>c.id===e.target.value)
                      if(!cot) return
                      const items=(cot.items||[]) as any[]
                      const nuevos=items.map((x:any)=>({id:uid2(),desc:x.descripcion||'',tipoCalc:(x.tipo_calculo==='pct_cif'?'pct_cif':x.tipo_calculo==='fijo_ars'?'fijo_ars':'fijo_usd') as any,moneda:'USD' as const,valor:x.valor||0,pisoUsd:x.piso_usd||0,techoUsd:x.techo_usd||0,usd:0,ars:0}))
                      setS(p=>({...p,rowsE:[...p.rowsE,...nuevos]}))
                      setProvUsado(pv=>({...pv,4:cot.id}))
                      e.target.value=''
                    }} className="px-2 py-1 border border-gray-200 rounded-lg text-[10px] bg-white focus:outline-none focus:border-[#6b21a8]" defaultValue="">
                      <option value="">+ Cargar del sistema</option>
                      {(()=>{
                        const esp=cotsArg.filter(c=>c.tipo==='especifica'&&clienteSelId&&c.cliente_id===clienteSelId)
                        const gen=cotsArg.filter(c=>c.tipo!=='especifica'||!clienteSelId||c.cliente_id!==clienteSelId)
                        return(<>
                          {esp.length>0&&(<optgroup label="⭐ Específicas para este cliente">{esp.map((c:any)=>{const cli=terceros.find(t=>t.id===c.cliente_id);return(<option key={c.id} value={c.id}>⭐ {c.proveedor_nombre}{cli?` · ${cli.razon_social}`:''} — {c.referencia||c.fecha}</option>)})}</optgroup>)}
                          <optgroup label="Genéricas vigentes">{gen.filter((c:any)=>isVigente(c.fecha_vencimiento||'')).map((c:any)=>(<option key={c.id} value={c.id}>{c.proveedor_nombre} — {c.referencia||c.fecha}</option>))}</optgroup>
                        </>)
                      })()}
                    </select>
                    <button onClick={()=>{
                      window.open(`/cotizaciones-proveedores?nuevo=1&bloque=4&cliente_id=${clienteSelId||''}&cliente_nombre=${encodeURIComponent(s.cliente||'')}`, '_blank')
                    }} className="px-3 py-1 bg-[#6b21a8] text-white rounded-lg text-[10px] font-bold hover:bg-[#581c87] whitespace-nowrap">+ Manual</button>

                  </div>
                </div>
                {s.rowsE.length===0&&(
                  <div className="text-[10px] text-gray-400 bg-gray-50 rounded-lg px-3 py-2">Sin gastos adicionales.</div>
                )}
                {s.rowsE.map((r,i)=>{
                  const usdR=calcGastoArg(r,cif,s.tcTrib)
                  return (
                    <div key={r.id} className="p-3 bg-gray-50 rounded-lg border border-gray-100 mb-2">
                      <div className="flex gap-2 items-center mb-2">
                        <input value={r.desc} onChange={e=>{const n=[...s.rowsE];n[i]={...n[i],desc:e.target.value};u('rowsE',n)}}
                          className="flex-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1168F8] bg-white" placeholder="Descripcion del gasto"/>
                        <select value={r.tipoCalc} onChange={e=>{const n=[...s.rowsE];n[i]={...n[i],tipoCalc:e.target.value as any};u('rowsE',n)}}
                          className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none bg-white w-36 flex-shrink-0">
                          <option value="pct_cif">% sobre CIF</option>
                          <option value="fijo_usd">Fijo USD</option>
                          <option value="fijo_ars">Fijo ARS</option>
                        </select>
                        <span className="text-[10px] text-gray-500 flex-shrink-0">{r.tipoCalc==='pct_cif'?'%':r.tipoCalc==='fijo_ars'?'ARS':'USD'}</span>
                        <input type="text" inputMode="decimal" value={r.valor||''} placeholder="0" onFocus={e=>e.target.select()}
                          onChange={e=>{const n=[...s.rowsE];n[i]={...n[i],valor:parseNum(e.target.value)};u('rowsE',n)}}
                          className="w-28 px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-right font-mono bg-white focus:outline-none focus:border-[#1168F8]"/>
                        <button onClick={()=>u('rowsE',s.rowsE.filter((_,j)=>j!==i))} className="text-gray-400 hover:text-red-500 text-xs flex-shrink-0">X</button>
                      </div>
                      {r.tipoCalc==='pct_cif'&&(
                        <div className="flex gap-2 items-center mb-1">
                          <span className="text-[10px] text-gray-400 flex-shrink-0 ml-1">Piso USD</span>
                          <input type="text" inputMode="decimal" value={r.pisoUsd||''} placeholder="0" onFocus={e=>e.target.select()}
                            onChange={e=>{const n=[...s.rowsE];n[i]={...n[i],pisoUsd:parseNum(e.target.value)};u('rowsE',n)}}
                            className="w-28 px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-right font-mono bg-white focus:outline-none focus:border-[#1168F8]"/>
                          <span className="text-[10px] text-gray-400 ml-2 flex-shrink-0">Techo USD</span>
                          <input type="text" inputMode="decimal" value={r.techoUsd||''} placeholder="0" onFocus={e=>e.target.select()}
                            onChange={e=>{const n=[...s.rowsE];n[i]={...n[i],techoUsd:parseNum(e.target.value)};u('rowsE',n)}}
                            className="w-28 px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-right font-mono bg-white focus:outline-none focus:border-[#1168F8]"/>
                        </div>
                      )}
                      <div className="flex justify-end mt-1">
                        <span className="font-mono font-semibold text-gray-700 text-xs">USD {fmt(usdR)}</span>
                        <span className="text-gray-300 mx-2">—</span>
                        <span className="font-mono text-gray-500 text-[10px]">ARS {Math.round(usdR*s.tcTrib).toLocaleString('es-AR')}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="flex justify-end items-center gap-2 px-5 py-2.5 bg-gray-50 border-t border-gray-100 text-xs text-gray-500">
              Subtotal bloque 4: <strong className="font-mono text-gray-800">USD {fmt(subE+subGastosArg)}</strong>
            </div>
          </div>

          </div>{/* fin wrapper bloques 1-4 */}

          {/* ── BLOQUE 5: FEE PUERTO NOA ── */}
          <div className={`bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm ${!bloqueActivo(4)?'hidden':''}`}>
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#052698] text-white text-[10px] font-bold">5</span>
              <span className="font-medium text-sm text-gray-900">{bloques[4]?.nombre || 'Bloque 5 — Fee Puerto NOA'}</span>
            </div>
            <div className="px-5 py-4">
              {/* Selector de modalidad */}
              <div className="flex gap-2 mb-4">
                {[{k:'cont',l:'USD por contenedor'},{k:'pct',l:'% sobre logística'}].map(o=>(
                  <button key={o.k} onClick={()=>u('feeModo',o.k as any)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${s.feeModo===o.k?'bg-[#052698] text-white border-[#052698]':'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    {o.l}
                  </button>
                ))}
              </div>
              {s.feeModo==='cont'&&(
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Fee por contenedor (USD)"><input type="text" inputMode="decimal" onFocus={e=>e.target.select()} value={s.feeCont} onChange={e=>u('feeCont',parseNum(e.target.value))} className={inp}/></Field>
                  <Field label="N contenedores"><div className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-right">{nc}</div></Field>
                  <Field label="Fee total (USD)"><div className="px-2.5 py-1.5 bg-[#EBF2FF] border border-[#93B8FC] rounded-lg text-xs font-mono text-right font-semibold text-[#052698]">USD {fmt(fee)}</div></Field>
                </div>
              )}
              {s.feeModo==='pct'&&(
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Porcentaje (%)"><input type="text" inputMode="decimal" onFocus={e=>e.target.select()} value={s.feePct} onChange={e=>u('feePct',parseNum(e.target.value))} className={inp}/></Field>
                  <Field label="Base logística (USD)">
                    <div className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono text-right text-gray-500">USD {fmt(baseLogFee)}</div>
                  </Field>
                  <Field label="Fee total (USD)"><div className="px-2.5 py-1.5 bg-[#EBF2FF] border border-[#93B8FC] rounded-lg text-xs font-mono text-right font-semibold text-[#052698]">USD {fmt(fee)}</div></Field>
                </div>
              )}
              {s.feeModo==='pct'&&(
                <div className="mt-2 text-[10px] text-gray-400">Base: ForWarder + seguro + gastos Chile + transporte + estadías + gastos Argentina. No incluye mercadería ni tributos ARCA.</div>
              )}
            </div>
            <div className="flex justify-end items-center gap-2 px-5 py-2.5 bg-gray-50 border-t border-gray-100 text-xs text-gray-500">
              Subtotal bloque 5: <strong className="font-mono text-gray-800">USD {fmt(fee)}</strong>
            </div>
          </div>

          {/* Resumen logistica */}
          <div className="bg-[#052698] rounded-2xl px-5 py-4 flex flex-wrap items-center gap-4 text-xs">
            {[
              {label:'ForWarder + seguro',v:subFW+totalSeg},
              {label:'Gastos Chile',v:subGastosChile},
              {label:'Transporte',v:subD+subTransp},
              {label:'Gastos Argentina',v:subE+subGastosArg},
              {label:'Fee',v:fee},
            ].map(it=>(
              <div key={it.label} className="text-center">
                <div className="text-blue-300 text-[9px] uppercase tracking-wide">{it.label}</div>
                <div className="font-mono font-semibold text-white text-sm">USD {fmt(it.v,0)}</div>
              </div>
            ))}
            <div className="ml-auto text-right">
              <div className="text-blue-200 text-[10px]">Total logistico</div>
              <div className="font-mono font-bold text-white text-xl">USD {fmt(totalLog,0)}</div>
            </div>
          </div>

          <div className="flex justify-between">
            <button onClick={()=>cambiarTab('mercaderia')} className="px-4 py-2 border border-gray-200 rounded-lg text-xs hover:bg-gray-50">Anterior</button>
            <button onClick={()=>cambiarTab(s.incluirArca?'tributos':'resumen')} className="bg-[#1168F8] text-white px-5 py-2 rounded-lg text-xs font-medium hover:bg-[#0a4fc4]">{s.incluirArca?'Tributos ARCA':'Ver resumen'}</button>
          </div>
        </div>
      )}

      {/* ── TRIBUTOS (igual que antes) ── */}
      {tab==='tributos'&&(
        s.incluirArca ? (
        <div className="space-y-4">
          {!hayMercaderia && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2.5">
              <span className="text-lg leading-none">⚠️</span>
              <div>
                <div className="text-xs font-semibold text-amber-800">Tributos ARCA activado, pero falta cargar mercadería</div>
                <div className="text-[11px] text-amber-700 mt-0.5">La liquidación necesita una proforma de mercadería con valor FOB para calcular la base imponible CIF. Cargala en la pestaña <button onClick={()=>cambiarTab('mercaderia')} className="underline font-semibold hover:text-amber-900">Mercadería</button> y los tributos se calcularán automáticamente.</div>
              </div>
            </div>
          )}
          {/* Fórmula del CIF — tira compacta horizontal */}
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-2.5 border-b border-gray-50 flex items-center gap-2">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Base imponible</span>
              <span className="text-[10px] text-gray-300">· cómo se llega al valor CIF</span>
            </div>
            <div className="flex items-stretch divide-x divide-gray-100">
              <div className="flex-1 px-5 py-3.5">
                <div className="text-[10px] text-gray-400 mb-0.5">FOB origen</div>
                <div className="text-lg font-bold font-mono text-gray-800">USD {fmt(totalFOB,0)}</div>
                <div className="text-[9px] text-gray-400 mt-0.5">Mercadería + puesta a FOB</div>
              </div>
              <div className="flex items-center justify-center px-2 text-gray-300 text-lg font-light">+</div>
              <div className="flex-1 px-5 py-3.5">
                <div className="text-[10px] text-gray-400 mb-0.5">Flete + seguro</div>
                <div className="text-lg font-bold font-mono text-gray-800">USD {fmt(subFW+totalSeg,0)}</div>
                <div className="text-[9px] text-gray-400 mt-0.5">ForWarder elegido</div>
              </div>
              <div className="flex items-center justify-center px-2 text-gray-300 text-lg font-light">=</div>
              <div className="flex-1 px-5 py-3.5" style={{background:'#052698'}}>
                <div className="text-[10px] text-blue-200 mb-0.5">Valor CIF Jama</div>
                <div className="text-lg font-bold font-mono text-white">USD {fmt(cif,0)}</div>
                <div className="text-[9px] text-blue-300 mt-0.5 font-mono">ARS {Math.round(cifARS).toLocaleString('es-AR')}</div>
              </div>
            </div>
          </div>
          <Card title="Liquidacion ARCA — Aduana Jujuy">
            <div className="grid grid-cols-4 gap-3 mb-4">
              <Field label="Regimen de importacion"><select value={s.regimen} onChange={e=>u('regimen',e.target.value as any)} className={sel}>{Object.entries(REG_L).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field>
              <Field label="TC oficial BNA (ARS/USD)"><div className="px-2.5 py-1.5 bg-[#EBF2FF] border border-[#93B8FC] rounded-lg text-xs font-mono text-right font-semibold text-[#052698]">ARS {fmt(s.tcTrib,0)}</div></Field>
              <Field label="Derechos importacion % (NCM)"><input type="text" inputMode="decimal" onFocus={e=>e.target.select()} value={s.derPct} step={0.5} onChange={e=>u('derPct',parseNum(e.target.value))} className={inp}/></Field>
              <Field label="NCM principal"><div className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono">{(mercElegida ? mercItems.find(it=>(it as any).ncm)?.ncm : s.productos.find(p=>p.ncm)?.ncm)||'—'}</div></Field>
            </div>
            {tribCfg.length===0?(
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-700">No hay tributos configurados para el Regimen {s.regimen}.</div>
            ):(
              <div className="border border-gray-100 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{background:'#052698'}}>
                      <th className="text-left px-3 py-2.5 text-[9px] font-bold text-blue-200 uppercase tracking-wider w-16">Código</th>
                      <th className="text-left px-3 py-2.5 text-[9px] font-bold text-blue-100 uppercase tracking-wider">Concepto</th>
                      <th className="text-right px-3 py-2.5 text-[9px] font-bold text-blue-200 uppercase tracking-wider w-20">Alícuota</th>
                      <th className="text-right px-4 py-2.5 text-[9px] font-bold text-blue-100 uppercase tracking-wider w-32">Importe ARS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tributos.map((t:any)=>(
                      <tr key={t.codigo} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                        <td className="px-3 py-2.5">
                          <span className="inline-block font-mono text-[10px] text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">{t.codigo}</span>
                        </td>
                        <td className="px-3 py-2.5 text-gray-700">{t.concepto}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-gray-400 text-[11px]">{t.tipo==='pct'?(t.codigo==='010'?`${s.derPct}%`:`${t.valor}%`):'Fijo'}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold text-gray-800">{Math.round(t.imp).toLocaleString('es-AR')}</td>
                      </tr>
                    ))}
                    <tr style={{background:'#EBF2FF'}} className="border-t-2 border-[#1168F8]">
                      <td colSpan={2} className="px-3 py-3 font-bold text-sm text-[#052698]">Total pagado a aduana</td>
                      <td className="px-3 py-3 text-right text-[10px] text-[#1168F8]/60 font-mono">Régimen {s.regimen}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-base text-[#052698]">{Math.round(totalTribARS).toLocaleString('es-AR')}</td>
                    </tr>
                  </tbody>
                </table>
                <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-[9px] text-gray-400 uppercase tracking-wider font-semibold">SIM Aduana Jujuy · Régimen {s.regimen}</span>
                  <span className="text-[10px] text-gray-500 font-mono">≈ USD {fmt(totalTribUSD,0)} <span className="text-gray-300">@ {fmt(s.tcTrib,0)}</span></span>
                </div>
              </div>
            )}
          </Card>
          <div className="flex justify-between">
            <button onClick={()=>cambiarTab('logistica')} className="px-4 py-2 border border-gray-200 rounded-lg text-xs hover:bg-gray-50">Anterior</button>
            <button onClick={()=>cambiarTab('resumen')} className="bg-[#1168F8] text-white px-5 py-2 rounded-lg text-xs font-medium hover:bg-[#0a4fc4]">Ver resumen</button>
          </div>
        </div>
        ) : (
        <div className="space-y-4">
          <div className="bg-white border border-gray-100 rounded-2xl p-10 shadow-sm text-center">
            <div className="text-4xl mb-3">§</div>
            <div className="font-semibold text-gray-700 mb-1">Los tributos ARCA están desactivados</div>
            <div className="text-xs text-gray-400 mb-4">Activá el toggle "Tributos ARCA" desde los pills de la pestaña Embarque. Requiere tener el bloque Mercadería activo.</div>
            <button onClick={()=>cambiarTab('embarque')} className="px-4 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold hover:bg-[#0a4fc4]">Ir a Embarque</button>
          </div>
          <div className="flex justify-between">
            <button onClick={()=>cambiarTab('logistica')} className="px-4 py-2 border border-gray-200 rounded-lg text-xs hover:bg-gray-50">Anterior</button>
            <button onClick={()=>cambiarTab('resumen')} className="bg-[#1168F8] text-white px-5 py-2 rounded-lg text-xs font-medium hover:bg-[#0a4fc4]">Ver resumen</button>
          </div>
        </div>
        )
      )}
      {tab==='resumen'&&(
        <div className="space-y-4">
          <style>{`
            @media print {
              aside, nav, header, [data-sidebar] { display: none !important; }
              .print\:hidden { display: none !important; }
              .print-only { display: block !important; }
              body { background: white !important; }
              @page { margin: 15mm 12mm; size: A4; }
              tr { page-break-inside: avoid; }
              .page-break { page-break-before: always; }
            }
            .print-only { display: none; }
          `}</style>

          {/* Header con botón imprimir */}
          <div className="flex items-center justify-between print:hidden">
            <div>
              <h2 className="font-bold text-base text-gray-900">
                {s.sentido==='exportacion'?'Resumen cotización exportación':'Resumen cotización importación'}
              </h2>
              <div className="flex gap-2 mt-1 flex-wrap">
                {mercaderiaActiva()&&hayMercaderia&&<span className="px-2 py-0.5 bg-[#EBF2FF] text-[#1168F8] rounded-full text-[9px] font-semibold">{bloqueMerc?.nombre||'Mercadería'}</span>}
                {bloques.filter((_:any,i:number)=>bloqueActivo(i)).map((b:any)=>(
                  <span key={b.id} className="px-2 py-0.5 bg-[#EBF2FF] text-[#052698] rounded-full text-[9px] font-semibold">{b.nombre}</span>
                ))}
                {arcaActivo&&<span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full text-[9px] font-semibold">Tributos ARCA</span>}
              </div>
            </div>
            <button onClick={abrirPreview}
              className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-50 flex items-center gap-1.5">
              👁 Vista previa
            </button>
          </div>

          {/* KPI principal */}
          <div className="bg-white border border-gray-100 border-t-4 border-t-[#1168F8] rounded-xl p-5">
            <div className="text-[10px] text-gray-400 mb-1 uppercase tracking-wider font-semibold">{etiquetaTotal}</div>
            <div className="text-3xl font-bold text-gray-900 font-mono">USD {fmt(totalReal,0)}</div>
            <div className="text-xs text-gray-400 mt-1.5 flex items-center gap-2 flex-wrap">
              <span>{s.sentido==='exportacion'
                ? (s.origen?s.origen.split(' (')[0]:'Origen')
                : (s.destinoNoa||'destino final')}</span>
              <span className="text-gray-200">·</span>
              <span>{nc} contenedor(es) {nc>0&&`— USD ${fmt(totalReal/nc,0)} c/u`}</span>
              <span className="text-gray-200">·</span>
              <span>{[hayMercaderia?'mercadería':null, totalLog>0?'logística':null, arcaActivo?'tributos ARCA':null].filter(Boolean).join(' + ')}</span>
            </div>
          </div>

          {/* Cuadro 1: Desglose por bloque */}
          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-3.5 border-b border-gray-100 font-semibold text-sm text-gray-900">Desglose por bloque</div>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-5 py-2.5 text-[10px] text-gray-400 font-semibold uppercase tracking-wider w-[22%]">Bloque</th>
                  <th className="text-left px-3 py-2.5 text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Concepto</th>
                  <th className="text-right px-5 py-2.5 text-[10px] text-gray-400 font-semibold uppercase tracking-wider w-[16%]">USD</th>
                  <th className="text-right px-5 py-2.5 text-[10px] text-gray-400 font-semibold uppercase tracking-wider w-[10%]">%</th>
                </tr>
              </thead>
              <tbody>
                {/* Mercadería — fila principal destacada */}
                {hayMercaderia&&(
                  <tr className="border-t-2 border-gray-300">
                    <td className="px-5 py-3 font-semibold text-sm text-gray-900">Mercadería</td>
                    <td className="px-3 py-3 text-gray-500 text-[11px]">Valor {s.incoterm} · precio en origen</td>
                    <td className="px-5 py-3 text-right font-semibold text-sm font-mono text-gray-900">{fmt(totalFOB)}</td>
                    <td className="px-5 py-3 text-right font-semibold text-gray-500">{fmt(totalFOB/totalReal*100,1)}%</td>
                  </tr>
                )}
                {hayMercaderia&&s.incoterm==='EXW'&&(s.exwTransp+s.exwAgente+s.exwOtros)>0&&(
                  <tr className="border-t border-gray-50 bg-gray-50">
                    <td className="px-5 py-2 pl-8 text-gray-400 text-[11px]">· Puesta a FOB</td>
                    <td className="px-3 py-2 text-gray-400 text-[11px]">Transporte + agente + otros</td>
                    <td className="px-5 py-2 text-right font-mono text-gray-500">{fmt(s.exwTransp+s.exwAgente+s.exwOtros)}</td>
                    <td className="px-5 py-2 text-right text-gray-400">{fmt((s.exwTransp+s.exwAgente+s.exwOtros)/totalReal*100,1)}%</td>
                  </tr>
                )}

                {/* Separador logística */}
                {totalLog>0&&(
                  <tr className="border-t-2 border-gray-300">
                    <td colSpan={4} className="px-5 py-1.5 bg-gray-50">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Logística</span>
                    </td>
                  </tr>
                )}

                {/* Subrubros logísticos */}
                {bloqueActivo(0)&&subFW>0&&(
                  <tr className="border-t border-gray-50">
                    <td className="px-5 py-2.5 pl-8 text-gray-400 text-[11px]">· {bloques[0]?.nombre||'Marítimo'}</td>
                    <td className="px-3 py-2.5 text-gray-400 text-[11px]">{fwElegida?.proveedorNombre||'ForWarder'}{fwElegida?.referencia?` — ${fwElegida.referencia}`:''}</td>
                    <td className="px-5 py-2.5 text-right font-mono text-gray-500">{fmt(subFW)}</td>
                    <td className="px-5 py-2.5 text-right text-gray-400">{fmt(subFW/totalReal*100,1)}%</td>
                  </tr>
                )}
                {bloqueActivo(0)&&totalSeg>0&&(
                  <tr className="border-t border-gray-50">
                    <td className="px-5 py-2.5 pl-8 text-gray-400 text-[11px]">· Seguro</td>
                    <td className="px-3 py-2.5 text-gray-400 text-[11px]">{segFW>0?'Incluido en ForWarder':'Contratado independiente'}</td>
                    <td className="px-5 py-2.5 text-right font-mono text-gray-500">{fmt(totalSeg)}</td>
                    <td className="px-5 py-2.5 text-right text-gray-400">{fmt(totalSeg/totalReal*100,1)}%</td>
                  </tr>
                )}
                {bloqueActivo(1)&&(subGastosChile+subDescon+subAlm+subCarga)>0&&(
                  <tr className="border-t border-gray-50">
                    <td className="px-5 py-2.5 pl-8 text-gray-400 text-[11px]">· {bloques[1]?.nombre||'Chile'}</td>
                    <td className="px-3 py-2.5 text-gray-400 text-[11px]">Gastos en Chile · Op. {s.optTransp}</td>
                    <td className="px-5 py-2.5 text-right font-mono text-gray-500">{fmt(subGastosChile+subDescon+subAlm+subCarga)}</td>
                    <td className="px-5 py-2.5 text-right text-gray-400">{fmt((subGastosChile+subDescon+subAlm+subCarga)/totalReal*100,1)}%</td>
                  </tr>
                )}
                {bloqueActivo(2)&&subTransp>0&&(
                  <tr className="border-t border-gray-50">
                    <td className="px-5 py-2.5 pl-8 text-gray-400 text-[11px]">· {bloques[2]?.nombre||'Terrestre'}</td>
                    <td className="px-3 py-2.5 text-gray-400 text-[11px]">Flete terrestre</td>
                    <td className="px-5 py-2.5 text-right font-mono text-gray-500">{fmt(subTransp)}</td>
                    <td className="px-5 py-2.5 text-right text-gray-400">{fmt(subTransp/totalReal*100,1)}%</td>
                  </tr>
                )}
                {bloqueActivo(3)&&(subE+subGastosArg)>0&&(
                  <tr className="border-t border-gray-50">
                    <td className="px-5 py-2.5 pl-8 text-gray-400 text-[11px]">· {bloques[3]?.nombre||'Argentina'}</td>
                    <td className="px-3 py-2.5 text-gray-400 text-[11px]">Despachante + honorarios + otros</td>
                    <td className="px-5 py-2.5 text-right font-mono text-gray-500">{fmt(subE+subGastosArg)}</td>
                    <td className="px-5 py-2.5 text-right text-gray-400">{fmt((subE+subGastosArg)/totalReal*100,1)}%</td>
                  </tr>
                )}
                {bloqueActivo(4)&&fee>0&&(
                  <tr className="border-t border-gray-50">
                    <td className="px-5 py-2.5 pl-8 text-gray-400 text-[11px]">· {bloques[4]?.nombre||'Fee PN'}</td>
                    <td className="px-3 py-2.5 text-gray-400 text-[11px]">Fee de servicio logístico</td>
                    <td className="px-5 py-2.5 text-right font-mono text-gray-500">{fmt(fee)}</td>
                    <td className="px-5 py-2.5 text-right text-gray-400">{fmt(fee/totalReal*100,1)}%</td>
                  </tr>
                )}

                {/* Subtotal logístico — solo tiene sentido mostrarlo si hay mercadería o ARCA arriba/abajo que lo separe del total */}
                {totalLog>0&&(hayMercaderia||arcaActivo)&&(
                  <tr className="border-t-2 border-gray-300">
                    <td colSpan={2} className="px-5 py-3 font-semibold text-sm text-gray-900">Subtotal logístico</td>
                    <td className="px-5 py-3 text-right font-semibold text-sm font-mono text-gray-900">{fmt(totalLog)}</td>
                    <td className="px-5 py-3 text-right font-semibold text-gray-500">{fmt(totalLog/totalReal*100,1)}%</td>
                  </tr>
                )}

                {/* ARCA — solo si hay mercadería + toggle activo + tributos > 0 */}
                {arcaActivo&&totalTribUSD>0&&(
                  <tr className="border-t-2" style={{borderColor:'#ef9f27',background:'#faeeda'}}>
                    <td className="px-5 py-3 font-semibold text-sm" style={{color:'#412402'}}>Tributos ARCA</td>
                    <td className="px-3 py-3 text-[11px]" style={{color:'#633806'}}>Régimen {s.regimen} — base CIF Jama</td>
                    <td className="px-5 py-3 text-right font-semibold text-sm font-mono" style={{color:'#412402'}}>{fmt(totalTribUSD)}</td>
                    <td className="px-5 py-3 text-right font-semibold" style={{color:'#854f0b'}}>{fmt(totalTribUSD/totalReal*100,1)}%</td>
                  </tr>
                )}

                {/* Total — etiqueta adaptativa */}
                <tr className="border-t-2 border-[#1168F8] bg-[#EBF2FF]">
                  <td colSpan={2} className="px-5 py-3.5 font-bold text-sm text-[#052698]">Total — {etiquetaTotal.toLowerCase()}</td>
                  <td className="px-5 py-3.5 text-right font-bold text-base font-mono text-[#052698]">{fmt(totalReal)}</td>
                  <td className="px-5 py-3.5 text-right font-bold text-[#052698]">100%</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Cuadro 2: Pagos en ARS — solo si hay algo que pagar en pesos */}
          {(arcaActivo||bloqueActivo(3)||bloqueActivo(2))&&(subGastosArg>0||subE>0||subTransp>0||totalTribUSD>0)&&(
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm" style={{borderLeft:'3px solid #ef9f27'}}>
              <div className="px-5 py-3.5 border-b flex items-center gap-2" style={{borderColor:'#ef9f27',background:'#faeeda'}}>
                <span className="text-base">💵</span>
                <span className="font-semibold text-sm" style={{color:'#633806'}}>Pagos estimados en pesos argentinos</span>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left px-5 py-2.5 text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Concepto</th>
                    <th className="text-left px-3 py-2.5 text-[10px] text-gray-400 font-semibold uppercase tracking-wider">A quién se paga</th>
                    <th className="text-right px-5 py-2.5 text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Importe</th>
                    <th className="text-right px-5 py-2.5 text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Moneda</th>
                  </tr>
                </thead>
                <tbody>
                  {arcaActivo&&totalTribUSD>0&&(
                    <tr className="border-t border-gray-50">
                      <td className="px-5 py-3 text-gray-800 font-semibold">Tributos ARCA</td>
                      <td className="px-3 py-3 text-gray-400">AFIP / aduana argentina</td>
                      <td className="px-5 py-3 text-right font-mono font-semibold text-gray-900">{Math.round(totalTribARS).toLocaleString('es-AR')}</td>
                      <td className="px-5 py-3 text-right"><span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-[10px] font-bold">ARS</span></td>
                    </tr>
                  )}
                  {bloqueActivo(3)&&subGastosArg>0&&(
                    <tr className="border-t border-gray-50">
                      <td className="px-5 py-3 text-gray-800 font-semibold">Despachante de aduana</td>
                      <td className="px-3 py-3 text-gray-400">Honorarios + gastos despacho</td>
                      <td className="px-5 py-3 text-right font-mono font-semibold text-gray-900">{Math.round(subGastosArg*s.tcTrib).toLocaleString('es-AR')}</td>
                      <td className="px-5 py-3 text-right"><span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-[10px] font-bold">ARS</span></td>
                    </tr>
                  )}
                  {bloqueActivo(2)&&subTransp>0&&(
                    <tr className="border-t border-gray-50">
                      <td className="px-5 py-3 text-gray-800 font-semibold">Flete terrestre</td>
                      <td className="px-3 py-3 text-gray-400">{s.sentido==='exportacion'?'NOA → Puerto Chile':'Puerto Chile → destino NOA'}</td>
                      <td className="px-5 py-3 text-right font-mono font-semibold text-gray-900">{Math.round(subTransp*s.tcTrib).toLocaleString('es-AR')}</td>
                      <td className="px-5 py-3 text-right"><span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-[10px] font-bold">ARS</span></td>
                    </tr>
                  )}
                  <tr className="border-t-2" style={{borderColor:'#ef9f27',background:'#faeeda'}}>
                    <td colSpan={2} className="px-5 py-3.5 font-bold text-sm" style={{color:'#412402'}}>Total a desembolsar en ARS</td>
                    <td className="px-5 py-3.5 text-right font-bold text-sm font-mono" style={{color:'#412402'}}>
                      {Math.round((arcaActivo?totalTribARS:0)+(bloqueActivo(3)&&subGastosArg>0?subGastosArg*s.tcTrib:0)+(bloqueActivo(2)&&subTransp>0?subTransp*s.tcTrib:0)).toLocaleString('es-AR')}
                    </td>
                    <td className="px-5 py-3.5 text-right"><span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{background:'#ef9f27',color:'#412402'}}>ARS</span></td>
                  </tr>
                </tbody>
              </table>
              <div className="px-5 py-2.5 bg-gray-50 border-t border-gray-100 text-[10px] text-gray-400">
                TC aplicado: ARS {fmt(s.tcTrib,0)} · Los importes son estimativos y pueden variar según TC vigente al momento del despacho.
              </div>
            </div>
          )}

          {/* Composición + TC */}
          <div className="grid grid-cols-2 gap-3">
            {/* Torta SVG — solo si hay 2+ componentes (con 1 solo es 100%, no aporta) */}
            {(()=>{
              const componentes = [hayMercaderia, totalLog>0, arcaActivo].filter(Boolean).length
              if(componentes < 2) return null
              return (
            <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
              <div className="font-semibold text-sm text-gray-900 mb-4">Composición del costo total</div>
              <div className="flex items-center gap-4">
                {(()=>{
                  const mercPct = totalReal>0&&hayMercaderia?totalFOB/totalReal:0
                  const logPct  = totalReal>0?totalLog/totalReal:0
                  const arcPct  = totalReal>0&&arcaActivo?totalTribUSD/totalReal:0
                  const r = 52, cx = 60, cy = 60
                  function slice(start:number, end:number, color:string, key:string) {
                    if(end-start<0.001) return null
                    if(end-start>0.999) return <circle key={key} cx={cx} cy={cy} r={r} fill={color}/>
                    const s1 = start*2*Math.PI - Math.PI/2
                    const e1 = end*2*Math.PI - Math.PI/2
                    const x1=cx+r*Math.cos(s1),y1=cy+r*Math.sin(s1)
                    const x2=cx+r*Math.cos(e1),y2=cy+r*Math.sin(e1)
                    const large=end-start>0.5?1:0
                    return <path key={key} d={`M${cx},${cy} L${x1},${y1} A${r},${r},0,${large},1,${x2},${y2} Z`} fill={color}/>
                  }
                  const s0=0, s1=mercPct, s2=s1+logPct, s3=s2+arcPct
                  return (
                    <svg width="120" height="120" viewBox="0 0 120 120">
                      {slice(s0,s1,'#1168F8','merc')}
                      {slice(s1,s2,'#93B8FC','log')}
                      {slice(s2,s3,'#ef9f27','arc')}
                      <circle cx="60" cy="60" r="32" fill="white"/>
                      <text x="60" y="57" textAnchor="middle" fontSize="10" fontFamily="monospace" fill="#052698" fontWeight="bold">USD</text>
                      <text x="60" y="70" textAnchor="middle" fontSize="9" fontFamily="monospace" fill="#6b7280">{fmt(totalReal,0)}</text>
                    </svg>
                  )
                })()}
                <div className="flex flex-col gap-3 flex-1">
                  {hayMercaderia&&<div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{background:'#1168F8'}}/>
                    <div><div className="text-xs font-semibold text-gray-800">Mercadería</div><div className="text-[10px] text-gray-400">USD {fmt(totalFOB,0)} · {fmt(totalFOB/totalReal*100,1)}%</div></div>
                  </div>}
                  {totalLog>0&&<div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{background:'#93B8FC'}}/>
                    <div><div className="text-xs font-semibold text-gray-800">Logística</div><div className="text-[10px] text-gray-400">USD {fmt(totalLog,0)} · {fmt(totalLog/totalReal*100,1)}%</div></div>
                  </div>}
                  {arcaActivo&&totalTribUSD>0&&<div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{background:'#ef9f27'}}/>
                    <div><div className="text-xs font-semibold" style={{color:'#633806'}}>Tributos ARCA</div><div className="text-[10px]" style={{color:'#854f0b'}}>USD {fmt(totalTribUSD,0)} · {fmt(totalTribUSD/totalReal*100,1)}%</div></div>
                  </div>}
                </div>
              </div>
            </div>
              )
            })()}

            {/* TC y validez */}
            <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
              <div className="font-semibold text-sm text-gray-900 mb-4">Tipos de cambio · Validez</div>
              <div className="space-y-3">
                {s.tcTrib>0&&<div className="flex justify-between items-center py-2 border-b border-gray-50">
                  <span className="text-xs text-gray-500">ARS / USD</span>
                  <span className="font-mono font-semibold text-sm text-gray-900">ARS {fmt(s.tcTrib,0)}</span>
                </div>}
                {s.tcClp>0&&<div className="flex justify-between items-center py-2 border-b border-gray-50">
                  <span className="text-xs text-gray-500">CLP / USD</span>
                  <span className="font-mono font-semibold text-sm text-gray-900">CLP {fmt(s.tcClp,0)}</span>
                </div>}
                {s.validez&&<div className="flex justify-between items-center py-2">
                  <span className="text-xs text-gray-500">Validez de la oferta</span>
                  <span className="font-semibold text-sm text-gray-900">{s.validez}</span>
                </div>}
              </div>
            </div>
          </div>

          {/* Condiciones particulares */}
          {s.observaciones.filter((o:string)=>o.trim()).length>0&&(
            <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
              <div className="font-semibold text-sm text-gray-900 mb-3">Condiciones particulares de esta cotización</div>
              <ol className="space-y-1.5 list-none">
                {s.observaciones.filter((o:string)=>o.trim()).map((obs:string,i:number)=>(
                  <li key={i} className="flex gap-2 text-xs text-gray-700">
                    <span className="text-gray-400 font-mono flex-shrink-0">{i+1}.</span>
                    <span>{obs}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {/* Condiciones generales (catálogo) */}
          {condicionesGenerales.length>0&&(
            <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
              <div className="font-semibold text-sm text-gray-900 mb-1">Condiciones generales</div>
              <div className="text-[10px] text-gray-400 mb-3">Fijas del sistema · se gestionan en Catálogos</div>
              <ol className="space-y-1.5 list-none">
                {condicionesGenerales.map((c:any,i:number)=>(
                  <li key={i} className="flex gap-2 text-xs text-gray-600">
                    <span className="text-gray-400 font-mono flex-shrink-0">{i+1}.</span>
                    <span>{c.texto}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Botones */}
          <div className="flex justify-between print:hidden">
            <button onClick={()=>cambiarTab(s.incluirArca?'tributos':'logistica')}
              className="px-4 py-2 border border-gray-200 rounded-lg text-xs hover:bg-gray-50">Anterior</button>
            <div className="flex gap-2">
              <button onClick={abrirPreview}
                className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-50">
                👁 Vista previa
              </button>
              <button onClick={guardar} disabled={saving}
                className="bg-[#1168F8] text-white px-6 py-2 rounded-lg text-xs font-medium hover:bg-[#0a4fc4] disabled:opacity-60">
                {saving?'Guardando...':'Guardar cotización'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal alta rápida de cliente */}
      {showAltaCli && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4 print:hidden" onClick={()=>!altaCliSaving&&setShowAltaCli(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e=>e.stopPropagation()}>
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2" style={{background:'#EBF2FF'}}>
              <span className="text-lg">👤</span>
              <span className="font-semibold text-sm text-[#052698]">Nuevo cliente</span>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="text-[11px] text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                Cargá lo mínimo para vincularlo a la cotización. Después podés completar el resto (dirección, contactos, datos bancarios) en Clientes.
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Razón social *</label>
                <input value={altaCliNombre} onChange={e=>setAltaCliNombre(e.target.value)} className={inp} placeholder="Nombre del cliente" autoFocus/>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Tipo doc</label>
                  <select value={altaCliTipoDoc} onChange={e=>setAltaCliTipoDoc(e.target.value)} className={sel}>
                    {['CUIT','CUIL','RUT','DNI','Pasaporte'].map(v=><option key={v}>{v}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">N° documento</label>
                  <input value={altaCliNroDoc} onChange={e=>setAltaCliNroDoc(e.target.value)} className={inp} placeholder="Opcional"/>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Condición IVA</label>
                <select value={altaCliIva} onChange={e=>setAltaCliIva(e.target.value)} className={sel}>
                  <option value="">— Sin especificar —</option>
                  {['Responsable Inscripto','Monotributo','Exento','Consumidor Final','No Responsable'].map(v=><option key={v}>{v}</option>)}
                </select>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={()=>setShowAltaCli(false)} disabled={altaCliSaving}
                className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold hover:bg-gray-50 disabled:opacity-50">Cancelar</button>
              <button onClick={crearClienteRapido} disabled={altaCliSaving}
                className="px-5 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold hover:bg-[#0a4fc4] disabled:opacity-50">
                {altaCliSaving?'Creando...':'Crear y usar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal preview de impresión (Etapa 2) */}
      {showPreview && previewCot && (
        <div className="fixed inset-0 z-[70] bg-gray-200 flex flex-col print:hidden">
          {/* Barra superior fija con acciones */}
          <div className="flex-shrink-0 bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <span className="text-lg">👁</span>
              <div>
                <div className="font-semibold text-sm text-gray-900">Vista previa de la cotización</div>
                <div className="text-[11px] text-gray-400">Revisá que esté todo correcto. Nada se guardó todavía.</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={()=>setShowPreview(false)}
                className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-50">
                ← Volver a editar
              </button>
              <button onClick={confirmarYGuardar} disabled={saving}
                className="px-5 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold hover:bg-[#0a4fc4] disabled:opacity-60">
                {saving?'Guardando...':'✓ Confirmar y guardar'}
              </button>
            </div>
          </div>
          {/* Documento con scroll */}
          <div className="flex-1 overflow-y-auto">
            <CotizacionDoc cot={previewCot} ejecutivo={previewEjecutivo} condGenerales={previewCondGen} />
          </div>
        </div>
      )}
    </div>
  )
}
