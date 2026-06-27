'use client'
import { useState, useMemo } from 'react'

// ── Pestaña "Tipos de cambio" de Inteligencia de Precios ─────────────────────
// Multi-selección de TC (ARS, CLP, CLP fiscal SII, CNY, UTM) + dos modos de ver:
//  · Comparar (base 100): todo en un gráfico, indexado, para comparar evolución.
//  · Absolutos (grilla): un mini-gráfico por TC, cada uno con su escala real.
// Período: presets (mes, 3m, 6m, año, todo) + opción Desde / Hasta.

interface Punto { created_at: string; [k: string]: any }
interface Props { tcHistorico: Punto[]; utmHistorico: Punto[] }

const TC_DEFS = [
  { key: 'ars',  col: 'ars',         label: 'ARS/USD',          flag: '🇦🇷', color: '#2a78d6', dec: 0, fuente: 'tc' as const },
  { key: 'clp',  col: 'clp',         label: 'CLP/USD',          flag: '🇨🇱', color: '#1baf7a', dec: 0, fuente: 'tc' as const },
  { key: 'clpf', col: 'clp_fiscal',  label: 'CLP fiscal (SII)', flag: '🇨🇱', color: '#eda100', dec: 0, fuente: 'tc' as const },
  { key: 'cny',  col: 'cny',         label: 'CNY/USD',          flag: '🇨🇳', color: '#4a3aa7', dec: 3, fuente: 'tc' as const },
  { key: 'utm',  col: 'utm',         label: 'UTM (CLP)',        flag: '🇨🇱', color: '#e34948', dec: 0, fuente: 'utm' as const },
]

function fmtVal(v: number, dec: number): string {
  return dec ? v.toFixed(dec) : Math.round(v).toLocaleString('es-AR')
}
const fmtDM = (t: number) => new Date(t).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
const fmtDMY = (t: number) => new Date(t).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })

export default function TCEvolucion({ tcHistorico, utmHistorico }: Props) {
  const [sel, setSel] = useState<string[]>(['ars'])
  const [modo, setModo] = useState<'indexado' | 'absoluto'>('absoluto')
  const [meses, setMeses] = useState(12)
  const [custom, setCustom] = useState(false)
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [hov, setHov] = useState<{ x: number; y: number; color: string; titulo: string; val: string; fecha: string } | null>(null)

  const series = useMemo(() => {
    const inRange = (created_at: string) => {
      const d = new Date(created_at).getTime()
      if (custom) {
        if (desde && d < new Date(desde + 'T00:00:00').getTime()) return false
        if (hasta && d > new Date(hasta + 'T23:59:59').getTime()) return false
        return true
      }
      const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - meses)
      return d >= cutoff.getTime()
    }
    return sel.map(key => {
      const def = TC_DEFS.find(d => d.key === key)!
      const fuente = def.fuente === 'utm' ? utmHistorico : tcHistorico
      const puntos = (fuente || [])
        .filter(t => t[def.col] != null && inRange(t.created_at))
        .map(t => ({ t: new Date(t.created_at).getTime(), v: Number(t[def.col]) }))
        .sort((a, b) => a.t - b.t)
      return { def, puntos }
    }).filter(s => s.puntos.length > 0)
  }, [sel, tcHistorico, utmHistorico, meses, custom, desde, hasta])

  function toggle(key: string) {
    setSel(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
    setHov(null)
  }

  const resumen = series.map(s => {
    const first = s.puntos[0].v, last = s.puntos[s.puntos.length - 1].v
    return { def: s.def, last, chg: first ? (last / first - 1) * 100 : 0, n: s.puntos.length }
  })

  const inp = 'px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:border-[#1168F8]'

  return (
    <div className="space-y-4">
      {/* Controles */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm space-y-3">
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Tipos de cambio · tildá los que quieras comparar</label>
          <div className="flex gap-2 flex-wrap">
            {TC_DEFS.map(d => {
              const on = sel.includes(d.key)
              return (
                <button key={d.key} onClick={() => toggle(d.key)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5"
                  style={on
                    ? { background: d.color + '1a', borderColor: d.color, color: d.color }
                    : { background: 'white', borderColor: '#e5e7eb', color: '#6b7280' }}>
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color, opacity: on ? 1 : 0.3 }} />
                  {d.flag} {d.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex gap-4 items-end flex-wrap">
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Vista</label>
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
              {([['indexado', 'Comparar (base 100)'], ['absoluto', 'Absolutos (grilla)']] as const).map(([m, lbl]) => (
                <button key={m} onClick={() => { setModo(m); setHov(null) }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${modo === m ? 'bg-white text-[#052698] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Período</label>
            <select value={custom ? 'custom' : String(meses)}
              onChange={e => { const v = e.target.value; if (v === 'custom') { setCustom(true) } else { setCustom(false); setMeses(Number(v)) } }}
              className={inp}>
              <option value="1">Último mes</option>
              <option value="3">Últimos 3 meses</option>
              <option value="6">Últimos 6 meses</option>
              <option value="12">Último año</option>
              <option value="120">Todo el historial</option>
              <option value="custom">Desde / Hasta…</option>
            </select>
          </div>
          {custom && (
            <>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Desde</label>
                <input type="date" value={desde} max={hasta || undefined} onChange={e => setDesde(e.target.value)} className={inp} />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Hasta</label>
                <input type="date" value={hasta} min={desde || undefined} onChange={e => setHasta(e.target.value)} className={inp} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Tarjetas resumen (valor real + variación) */}
      {resumen.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {resumen.map(r => (
            <div key={r.def.key} className="bg-white border border-gray-100 rounded-2xl p-3 shadow-sm">
              <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mb-1">
                <span className="w-2 h-2 rounded-sm" style={{ background: r.def.color }} />{r.def.flag} {r.def.label}
              </div>
              <div className="font-mono font-bold text-lg text-gray-900">{fmtVal(r.last, r.def.dec)}</div>
              <div className="text-[11px]" style={{ color: r.chg >= 0 ? '#16a34a' : '#dc2626' }}>
                {r.chg >= 0 ? '+' : ''}{r.chg.toFixed(1)}% en el rango
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Gráfico(s) */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        {series.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-center">
            <div>
              <div className="text-4xl mb-2">📭</div>
              <div className="text-sm text-gray-400">{sel.length === 0 ? 'Elegí al menos un tipo de cambio.' : 'Sin datos en el período elegido.'}</div>
            </div>
          </div>
        ) : modo === 'indexado' ? (
          <GraficoIndexado series={series} hov={hov} setHov={setHov} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {series.map(s => <MiniAbsoluto key={s.def.key} serie={s} />)}
          </div>
        )}
      </div>

      {/* Tabla últimos registros */}
      {tcHistorico.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <span className="font-semibold text-sm text-gray-900">Últimos 10 registros</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Fecha', 'ARS/USD', 'CLP/USD', 'CLP fiscal', 'CNY/USD'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...tcHistorico].reverse().slice(0, 10).map((t, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-blue-50/20">
                    <td className="px-4 py-2.5 font-mono text-[11px] text-gray-500">{fmtDMY(new Date(t.created_at).getTime())}</td>
                    <td className="px-4 py-2.5 font-mono font-semibold text-gray-800">{t.ars ? Math.round(t.ars).toLocaleString('es-AR') : '—'}</td>
                    <td className="px-4 py-2.5 font-mono font-semibold text-gray-800">{t.clp ? Math.round(t.clp).toLocaleString('es-AR') : '—'}</td>
                    <td className="px-4 py-2.5 font-mono font-semibold text-[#854F0B]">{t.clp_fiscal ? Math.round(t.clp_fiscal).toLocaleString('es-AR') : '—'}</td>
                    <td className="px-4 py-2.5 font-mono font-semibold text-gray-800">{t.cny ? Number(t.cny).toFixed(4) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Gráfico indexado (base 100): todas las series superpuestas ───────────────
function GraficoIndexado({ series, hov, setHov }: {
  series: { def: typeof TC_DEFS[number]; puntos: { t: number; v: number }[] }[]
  hov: any; setHov: (h: any) => void
}) {
  const W = 900, H = 320, padL = 48, padR = 16, padT = 16, padB = 28
  // Base común: el último "primer dato" entre las series elegidas. Así todas
  // arrancan parejas el mismo día (base 100 honesta) y ninguna queda comprimida
  // por otra de historia más larga (ej. UTM mensual estira el eje).
  const tMin = Math.max(...series.map(s => s.puntos[0].t))
  const tMax = Math.max(...series.map(s => s.puntos[s.puntos.length - 1].t))
  const all = series.map(s => {
    const P = s.puntos
    // valor base = último dato vigente en tMin (carry-forward, p/ UTM escalonada)
    let base = P[0].v
    for (const p of P) { if (p.t <= tMin) base = p.v; else break }
    const pts: { t: number; v: number }[] = [{ t: tMin, v: base }]
    for (const p of P) { if (p.t > tMin && p.t <= tMax) pts.push({ t: p.t, v: p.v }) }
    if (pts[pts.length - 1].t < tMax) pts.push({ t: tMax, v: pts[pts.length - 1].v })
    return { def: s.def, pts: pts.map(p => ({ t: p.t, v: p.v, i: base ? (p.v / base) * 100 : 100 })) }
  })
  const ts = all.flatMap(s => s.pts.map(p => p.t))
  const is = all.flatMap(s => s.pts.map(p => p.i))
  let iMin = Math.min(...is), iMax = Math.max(...is)
  const pad = (iMax - iMin) * 0.15 || 2; iMin -= pad; iMax += pad
  const xOf = (t: number) => tMax === tMin ? (W - padL - padR) / 2 + padL : padL + ((t - tMin) / (tMax - tMin)) * (W - padL - padR)
  const yOf = (i: number) => iMax === iMin ? H / 2 : (H - padB) - ((i - iMin) / (iMax - iMin)) * (H - padT - padB)

  const tsUnicos = Array.from(new Set(ts)).sort((a, b) => a - b)
  const stepX = Math.max(1, Math.floor(tsUnicos.length / 7))

  return (
    <div>
      <div className="text-xs text-gray-400 mb-3">Base 100 = primer día con dato común a todas las elegidas · cada línea parte de 100 y muestra el % que se movió desde ahí.</div>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible" onMouseLeave={() => setHov(null)}>
        {[0, 0.25, 0.5, 0.75, 1].map(p => {
          const i = iMin + p * (iMax - iMin); const y = yOf(i)
          return (
            <g key={p}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#f1f5f9" strokeWidth="1" />
              <text x={padL - 5} y={y + 3} textAnchor="end" fontSize="9" fill="#9ca3af">{i.toFixed(0)}</text>
            </g>
          )
        })}
        {tsUnicos.filter((_, idx) => idx % stepX === 0).map((t, i) => (
          <text key={i} x={xOf(t)} y={H - 8} textAnchor="middle" fontSize="9" fill="#9ca3af">{fmtDM(t)}</text>
        ))}
        {all.map(s => (
          <path key={s.def.key}
            d={s.pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xOf(p.t)} ${yOf(p.i)}`).join(' ')}
            fill="none" stroke={s.def.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {all.map(s => s.pts.map((p, i) => (
          <circle key={s.def.key + i} cx={xOf(p.t)} cy={yOf(p.i)} r="6" fill="transparent"
            onMouseEnter={() => setHov({ x: xOf(p.t), y: yOf(p.i), color: s.def.color, titulo: `${s.def.flag} ${s.def.label}`, val: `${p.i.toFixed(1)}  (${fmtVal(p.v, s.def.dec)})`, fecha: fmtDMY(p.t) })} />
        )))}
        {hov && (
          <g>
            <circle cx={hov.x} cy={hov.y} r="5" fill={hov.color} stroke="white" strokeWidth="2" />
            <rect x={Math.min(Math.max(hov.x - 75, 2), W - 152)} y={Math.max(hov.y - 56, 2)} width="150" height="46" rx="6" fill="white" stroke="#e5e7eb" strokeWidth="1" />
            <text x={Math.min(Math.max(hov.x - 75, 2), W - 152) + 75} y={Math.max(hov.y - 56, 2) + 16} textAnchor="middle" fontSize="10" fontWeight="700" fill={hov.color}>{hov.titulo}</text>
            <text x={Math.min(Math.max(hov.x - 75, 2), W - 152) + 75} y={Math.max(hov.y - 56, 2) + 29} textAnchor="middle" fontSize="11" fontWeight="700" fill="#111827">{hov.val}</text>
            <text x={Math.min(Math.max(hov.x - 75, 2), W - 152) + 75} y={Math.max(hov.y - 56, 2) + 40} textAnchor="middle" fontSize="8" fill="#6b7280">{hov.fecha}</text>
          </g>
        )}
      </svg>
      <div className="flex flex-wrap gap-4 mt-3 justify-center">
        {all.map(s => (
          <div key={s.def.key} className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="w-3 h-3 rounded-sm" style={{ background: s.def.color }} />{s.def.flag} {s.def.label}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Mini-gráfico absoluto (una serie, su propia escala) ──────────────────────
function MiniAbsoluto({ serie }: { serie: { def: typeof TC_DEFS[number]; puntos: { t: number; v: number }[] } }) {
  const { def, puntos } = serie
  const W = 320, H = 130, padL = 40, padR = 8, padT = 10, padB = 18
  const vals = puntos.map(p => p.v)
  const tMin = puntos[0].t, tMax = puntos[puntos.length - 1].t
  let mn = Math.min(...vals), mx = Math.max(...vals)
  const pd = (mx - mn) * 0.2 || mx * 0.02 || 1; const lo = mn - pd, hi = mx + pd
  const xOf = (t: number) => tMax === tMin ? (W - padL - padR) / 2 + padL : padL + ((t - tMin) / (tMax - tMin)) * (W - padL - padR)
  const yOf = (v: number) => hi === lo ? H / 2 : (H - padB) - ((v - lo) / (hi - lo)) * (H - padT - padB)
  const last = vals[vals.length - 1], first = vals[0]
  const chg = first ? (last / first - 1) * 100 : 0
  const linePath = puntos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xOf(p.t)} ${yOf(p.v)}`).join(' ')
  const areaPath = `${linePath} L ${xOf(tMax)} ${H - padB} L ${xOf(tMin)} ${H - padB} Z`

  return (
    <div className="border border-gray-100 rounded-xl p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mb-0.5">
        <span className="w-2 h-2 rounded-sm" style={{ background: def.color }} />{def.flag} {def.label}
      </div>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="font-mono font-bold text-lg text-gray-900">{fmtVal(last, def.dec)}</span>
        <span className="text-[11px]" style={{ color: chg >= 0 ? '#16a34a' : '#dc2626' }}>{chg >= 0 ? '+' : ''}{chg.toFixed(1)}%</span>
      </div>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
        {[0, 0.5, 1].map(p => {
          const v = lo + p * (hi - lo); const y = yOf(v)
          return (
            <g key={p}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#f1f5f9" strokeWidth="1" />
              <text x={padL - 4} y={y + 3} textAnchor="end" fontSize="8" fill="#9ca3af">
                {def.dec ? v.toFixed(2) : (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : Math.round(v))}
              </text>
            </g>
          )
        })}
        <text x={padL} y={H - 4} textAnchor="start" fontSize="8" fill="#9ca3af">{fmtDM(tMin)}</text>
        <text x={W - padR} y={H - 4} textAnchor="end" fontSize="8" fill="#9ca3af">{fmtDM(tMax)}</text>
        {puntos.length > 1 && <path d={areaPath} fill={def.color} fillOpacity="0.10" />}
        {puntos.length > 1 && <path d={linePath} fill="none" stroke={def.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
        {puntos.length === 1 && <circle cx={xOf(tMin)} cy={yOf(last)} r="3" fill={def.color} />}
      </svg>
      <div className="flex justify-between text-[10px] text-gray-400 mt-1">
        <span>mín {fmtVal(mn, def.dec)}</span><span>máx {fmtVal(mx, def.dec)}</span>
      </div>
    </div>
  )
}
