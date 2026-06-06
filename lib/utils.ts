import type { TributoRow, ContenedorCot, ProductoCot } from '@/types'

export const fmt = (v: number, d = 2) =>
  v.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d })

export const fmtK = (v: number) =>
  v >= 1000 ? `USD ${fmt(v / 1000, 0)}k` : `USD ${fmt(v, 0)}`

export const CONT_CAPS: Record<string, { kg: number; m3: number }> = {
  '20GP': { kg: 28000, m3: 33.2 },
  '40GP': { kg: 26500, m3: 67.7 },
  '40HC': { kg: 26500, m3: 76.3 },
  '40OT': { kg: 26500, m3: 72.3 },
  '20RF': { kg: 27400, m3: 31.2 },
}

export const ETAPAS_L: Record<string, string> = {
  china: 'China (origen)',
  maritimo: 'Flete marítimo',
  chile: 'Puerto Chile',
  terrestre: 'Transporte terrestre',
  argentina: 'Argentina',
  tributos: 'Tributos ARCA',
  fee: 'Fee Puerto NOA',
  otro: 'Otro',
}

export const ETAPAS_ORD = ['china', 'maritimo', 'chile', 'terrestre', 'argentina', 'tributos', 'fee', 'otro']

export const ESTADOS_L: Record<string, string> = {
  borrador: 'Borrador',
  enviada: 'Enviada',
  aceptada: 'Aceptada',
  rechazada: 'Rechazada',
  vencida: 'Vencida',
}

export const ROL_L: Record<string, string> = {
  admin: 'Admin',
  ejecutivo: 'Ejecutivo',
  operaciones: 'Operaciones',
  gerencia: 'Gerencia',
}

export const PUERTOS_L: Record<string, string> = {
  IQQ: 'Iquique (CLIQQ)',
  ANF: 'Antofagasta (CLANF)',
  ARI: 'Arica (CLARI)',
}

export function getTributos(reg: 'A' | 'B', cifARS: number, derPct: number): TributoRow[] {
  const VA = cifARS
  const der = VA * derPct / 100
  const est = VA * 3 / 100
  const B = VA + der + est

  if (reg === 'A') return [
    { cod: '010', con: 'Derechos de importación', tasa: `${derPct}%`, base: VA, imp: der },
    { cod: '011', con: 'Tasa de estadística', tasa: '3%', base: VA, imp: est },
    { cod: '415', con: 'I.V.A. (10,5%)', tasa: '10,5%', base: B, imp: B * 10.5 / 100 },
    { cod: '422', con: 'IVA adicional inscr. (10%)', tasa: '10%', base: B, imp: B * 10 / 100 },
    { cod: '424', con: 'Imp. a las Ganancias (6%)', tasa: '6%', base: B, imp: B * 6 / 100 },
    { cod: '500', con: 'Arancel SIM', tasa: 'Fijo', base: 0, imp: 10 },
    { cod: '900', con: 'Ingresos Brutos (3%)', tasa: '3%', base: B, imp: B * 3 / 100 },
  ]

  return [
    { cod: '010', con: 'Derechos de importación', tasa: `${derPct}%`, base: VA, imp: der },
    { cod: '011', con: 'Tasa de estadística', tasa: '3%', base: VA, imp: est },
    { cod: '415', con: 'I.V.A. (10,5%)', tasa: '10,5%', base: B, imp: B * 10.5 / 100 },
    { cod: '424', con: 'Imp. a las Ganancias (11%)', tasa: '11%', base: B, imp: B * 11 / 100 },
    { cod: '500', con: 'Arancel SIM', tasa: 'Fijo', base: 0, imp: 10 },
  ]
}

export function calcCapacidad(contenedores: ContenedorCot[], productos: ProductoCot[]) {
  let capKg = 0, capM3 = 0
  for (const c of contenedores) {
    const cap = CONT_CAPS[c.tipo] || { kg: 26500, m3: 76.3 }
    capKg += cap.kg * c.cantidad
    capM3 += cap.m3 * c.cantidad
  }
  let totalKg = 0, totalM3 = 0
  for (const p of productos) {
    totalKg += (p.peso_unit || 0) * p.cantidad
    totalM3 += (p.vol_unit || 0) * p.cantidad
  }
  const pctKg = capKg > 0 ? totalKg / capKg * 100 : 0
  const pctM3 = capM3 > 0 ? totalM3 / capM3 * 100 : 0
  const status = pctKg > 100 || pctM3 > 100 ? 'over' : pctKg > 85 || pctM3 > 85 ? 'warn' : 'ok'
  return { pctKg, pctM3, totalKg, totalM3, capKg, capM3, status }
}

export function nowDate() {
  return new Date().toISOString().slice(0, 10)
}

export function nowStr() {
  return new Date().toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

export function nextCotNum(cotizaciones: { num: string }[]) {
  const year = new Date().getFullYear()
  const prefix = `PNOA-${year}-`
  const nums = cotizaciones
    .filter(c => c.num && c.num.startsWith(prefix))
    .map(c => {
      const part = c.num.replace(prefix, '')
      const n = parseInt(part)
      return isNaN(n) ? 0 : n
    })
  const max = nums.length ? Math.max(...nums) : 0
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}
