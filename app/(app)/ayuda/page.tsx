'use client'
import { useState, useRef, useEffect } from 'react'

interface Mensaje { rol: 'user' | 'assistant'; texto: string }

const CONTEXTO_SISTEMA = `Eres el asistente de ayuda del sistema Puerto NOA SpA, un sistema de gestión logística y contable para importaciones y exportaciones entre China, Chile y la región NOA de Argentina.

El sistema tiene los siguientes módulos:

VENTAS:
- Cotizador al cliente: Permite crear cotizaciones logísticas seleccionando sentido (importación/exportación), bloques activos (Marítimo, Chile, Terrestre, Argentina, Fee PN) y tributos ARCA. Genera PDF profesional.
- Cotizaciones: Listado con estados (borrador, enviada, aceptada, rechazada).
- Clientes y Proveedores: Base de datos con contactos, documentación y historial.

OPERACIONES:
- Operaciones activas: Seguimiento de embarques con presupuesto vs gastos reales.
- Liquidación y cierre: Cierre formal con rendición de fondos.
- Cotizaciones proveedores: Registro de cotizaciones de forwarders, transportistas, despachantes. Multi-bloque.
- Inteligencia de precios: Histórico de tarifas.

FINANZAS CLIENTES:
- Facturas emitidas: Facturas PN al cliente (fee + recupero).
- Facturas recibidas: Facturas de proveedores.
- Cta. cte. clientes/proveedores: Saldos y movimientos.
- Fondos en custodia: Administración de fondos anticipados.

TESORERÍA:
- Flujo de cuentas: Transferencias ARG↔CHL con conversión de TC.
- Tipos de cambio: ARS/USD, CLP/USD, CNY/USD. Actualización automática diaria.

CONTABILIDAD:
- Libro IVA: Débito/crédito fiscal mensual. Cálculo F29 automático.
- Gastos fijos PN: Gastos operativos mensuales con conversión a USD.
- Resultados: Margen bruto por operación y margen neto con 4 criterios de prorrateo.

CONFIGURACIÓN:
- Catálogos: Puertos, pasos, ciudades, contenedores, bloques, categorías, cuentas, datos empresa.
- Tributos ARCA: Regímenes aduaneros, derechos, tasas.
- Usuarios: Roles (Super Admin, Admin, Ejecutivo, Operaciones, Contabilidad, Gerencia) con permisos por módulo.

INTEGRACIONES AUTOMÁTICAS:
- Cotización aceptada → abre operación automáticamente
- Factura emitida → impacta Libro IVA ventas
- Factura recibida → impacta Libro IVA compras
- Operación cerrada → aparece en Resultados
- Tipos de cambio → usados en todo el sistema

FLUJO TÍPICO: Cotización → Aceptación → Operación → Facturación → Cierre → Resultado

Responde en español, de forma clara y concisa. Si no sabes algo específico del sistema, dilo honestamente.`

const SUGERENCIAS = [
  '¿Cómo creo una cotización de importación?',
  '¿Cómo funciona el Libro IVA?',
  '¿Qué son los fondos en custodia?',
  '¿Cómo calculo el margen de una operación?',
  '¿Cómo agrego un proveedor al sistema?',
  '¿Qué diferencia hay entre importación y exportación en el cotizador?',
]

export default function AyudaPage() {
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'chat'|'docs'>('chat')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes])

  async function enviar(texto?: string) {
    const pregunta = texto || input.trim()
    if (!pregunta) return
    setInput('')
    setLoading(true)

    const nuevos: Mensaje[] = [...mensajes, { rol: 'user', texto: pregunta }]
    setMensajes(nuevos)

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          system: CONTEXTO_SISTEMA,
          messages: nuevos.map(m => ({
            role: m.rol === 'user' ? 'user' : 'assistant',
            content: m.texto
          }))
        })
      })
      const data = await response.json()
      const respuesta = data.content?.[0]?.text || 'No pude generar una respuesta.'
      setMensajes(prev => [...prev, { rol: 'assistant', texto: respuesta }])
    } catch {
      setMensajes(prev => [...prev, { rol: 'assistant', texto: 'Error al conectar con el asistente. Intentá de nuevo.' }])
    }
    setLoading(false)
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Centro de ayuda</h1>
          <p className="text-xs text-gray-400 mt-0.5">Documentación · Diagrama del sistema · Asistente IA</p>
        </div>
        <div className="flex gap-2">
          <button onClick={()=>setTab('chat')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${tab==='chat'?'bg-[#1168F8] text-white':'border border-gray-200 text-gray-600 hover:border-[#1168F8]'}`}>
            💬 Asistente IA
          </button>
          <button onClick={()=>setTab('docs')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${tab==='docs'?'bg-[#1168F8] text-white':'border border-gray-200 text-gray-600 hover:border-[#1168F8]'}`}>
            📄 Documentación
          </button>
        </div>
      </div>

      {/* Tab: Asistente IA */}
      {tab === 'chat' && (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Mensajes */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {mensajes.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-6 pb-10">
                <div className="text-center">
                  <div className="text-5xl mb-3">📖</div>
                  <h2 className="text-lg font-bold text-gray-800 mb-1">Asistente de Puerto NOA</h2>
                  <p className="text-sm text-gray-400 max-w-sm">Preguntame sobre cualquier módulo, proceso o funcionalidad del sistema.</p>
                </div>
                <div className="grid grid-cols-2 gap-2 w-full max-w-xl">
                  {SUGERENCIAS.map((s,i) => (
                    <button key={i} onClick={()=>enviar(s)}
                      className="text-left px-4 py-3 bg-white border border-gray-200 rounded-xl text-xs text-gray-600 hover:border-[#1168F8] hover:text-[#052698] hover:bg-[#EBF2FF] transition-all">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              mensajes.map((m, i) => (
                <div key={i} className={`flex ${m.rol==='user'?'justify-end':''}`}>
                  {m.rol === 'assistant' && (
                    <div className="w-7 h-7 rounded-full bg-[#052698] flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 mr-2 mt-0.5">PN</div>
                  )}
                  <div className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                    m.rol === 'user'
                      ? 'bg-[#1168F8] text-white rounded-br-sm'
                      : 'bg-white border border-gray-100 text-gray-800 rounded-bl-sm shadow-sm'
                  }`}>
                    {m.texto}
                  </div>
                </div>
              ))
            )}
            {loading && (
              <div className="flex">
                <div className="w-7 h-7 rounded-full bg-[#052698] flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 mr-2">PN</div>
                <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                  <div className="flex gap-1">
                    {[0,1,2].map(i => (
                      <div key={i} className="w-2 h-2 bg-[#1168F8] rounded-full animate-bounce" style={{animationDelay:`${i*0.15}s`}}/>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef}/>
          </div>

          {/* Input */}
          <div className="border-t border-gray-100 bg-white px-6 py-4 flex-shrink-0">
            <div className="flex gap-3 items-end max-w-3xl mx-auto">
              <textarea
                value={input}
                onChange={e=>setInput(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();enviar()}}}
                placeholder="Preguntá sobre cualquier módulo del sistema... (Enter para enviar)"
                rows={1}
                className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#1168F8] resize-none leading-relaxed"
                style={{minHeight:'44px', maxHeight:'120px'}}
              />
              <button onClick={()=>enviar()} disabled={!input.trim()||loading}
                className="px-5 py-3 bg-[#1168F8] text-white rounded-xl text-sm font-bold hover:bg-[#052698] transition-colors disabled:opacity-40 flex-shrink-0">
                Enviar
              </button>
            </div>
            {mensajes.length > 0 && (
              <div className="flex justify-center mt-2">
                <button onClick={()=>setMensajes([])} className="text-[10px] text-gray-400 hover:text-gray-600">
                  Limpiar conversación
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Documentación */}
      {tab === 'docs' && (
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="max-w-2xl mx-auto space-y-4">

            <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#EBF2FF] flex items-center justify-center text-2xl flex-shrink-0">📋</div>
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900 mb-1">Descripción del sistema</h3>
                  <p className="text-xs text-gray-500 mb-3 leading-relaxed">
                    Documento completo con la descripción de todos los módulos, flujo de trabajo, integraciones automáticas y roles de usuario. Ideal para nuevos usuarios o para presentar el sistema.
                  </p>
                  <div className="flex gap-2">
                    <a href="/puerto_noa_sistema.pdf" target="_blank" rel="noreferrer"
                      className="px-4 py-2 bg-[#1168F8] text-white rounded-xl text-xs font-bold hover:bg-[#052698] transition-colors">
                      📄 Ver PDF
                    </a>
                    <a href="/puerto_noa_sistema.pdf" download
                      className="px-4 py-2 border border-gray-200 text-gray-600 rounded-xl text-xs font-semibold hover:bg-gray-50 transition-colors">
                      ⬇ Descargar
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center text-2xl flex-shrink-0">🗺</div>
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900 mb-1">Diagrama integral del sistema</h3>
                  <p className="text-xs text-gray-500 mb-3 leading-relaxed">
                    Diagrama visual en formato A3 con todos los módulos, acciones disponibles en cada uno e integraciones automáticas entre ellos. Útil para entender el sistema de un vistazo.
                  </p>
                  <div className="flex gap-2">
                    <a href="/puerto_noa_diagrama.pdf" target="_blank" rel="noreferrer"
                      className="px-4 py-2 bg-[#0a9e6e] text-white rounded-xl text-xs font-bold hover:bg-[#087a54] transition-colors">
                      🗺 Ver diagrama
                    </a>
                    <a href="/puerto_noa_diagrama.pdf" download
                      className="px-4 py-2 border border-gray-200 text-gray-600 rounded-xl text-xs font-semibold hover:bg-gray-50 transition-colors">
                      ⬇ Descargar
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white border border-amber-100 rounded-2xl p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-2xl flex-shrink-0">📖</div>
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900 mb-1">Manual del sistema</h3>
                  <p className="text-xs text-gray-500 mb-3 leading-relaxed">
                    Manual detallado con instrucciones paso a paso para cada módulo. Incluirá capturas de pantalla y ejemplos reales de uso.
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl text-xs font-semibold">
                      🚧 En preparación
                    </span>
                    <span className="text-[10px] text-gray-400">Disponible próximamente</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-[#EBF2FF] border border-[#93B8FC] rounded-xl px-5 py-4 text-xs text-[#052698]">
              💡 <strong>Tip:</strong> Usá el <strong>Asistente IA</strong> para resolver dudas rápidas sobre cualquier módulo sin necesidad de buscar en el manual.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
