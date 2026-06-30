// lib/liquidacion.ts
// ─────────────────────────────────────────────────────────────────────────────
// P-21 — Liquidación impositiva ARCA: fuente ÚNICA de verdad del cálculo.
//
// Lo usan dos pantallas:
//   1) Cotizador  → sella la liquidación PRESUPUESTADA al guardar la cotización.
//   2) Operación  → el pop-up arma la liquidación REAL (el usuario destilda los
//      ítems que la aduana no tomó al CIF) y la guarda en operaciones.liquidacion_arca.
//
// Si cambia la forma de calcular el CIF o los tributos, se cambia ACÁ y ambas
// pantallas quedan sincronizadas automáticamente. No duplicar este cálculo.
// ─────────────────────────────────────────────────────────────────────────────

// Config de un tributo del régimen (espejo de la tabla tributos_config).
export interface TribCfg {
  id?: string
  codigo: string
  concepto: string
  tipo: 'pct' | 'fijo'
  valor: number
  aplica?: boolean
  orden?: number
}

// Un gasto individual que compone el CIF imponible.
// al_cif = false  →  destildado: NO entra a la base imponible real.
export interface ComponenteCif {
  id: string        // identificador estable del ítem (ej: 'fob', 'origen', 'chile:0', 'fee')
  etapa: string     // bloque: mercaderia | origen | maritimo | terrestre | chile | deposito | fee
  label: string     // texto que ve el usuario
  usd: number       // monto en USD que aporta al CIF
  al_cif: boolean   // si computa a la base imponible
  nota?: string     // aclaración opcional (ej: 'solo tramo intl · 60%')
}

export interface TributoCalc extends TribCfg {
  imp: number       // importe del tributo en ARS
}

export interface LiquidacionResultado {
  cifUsd: number          // CIF imponible: suma de los componentes con al_cif = true
  cifArs: number          // CIF en ARS (cifUsd * tc)
  tributos: TributoCalc[] // los 7 tributos del régimen, ya recalculados
  totalTribArs: number
  totalTribUsd: number
}

// Snapshot sellado en cotizaciones.liquidacion_presupuestada (jsonb) y, una vez
// ajustado, en operaciones.liquidacion_arca (jsonb).
export interface LiquidacionSnapshot {
  cif_usd: number
  cif_ars: number
  tc: number
  der_pct: number
  regimen: string
  componentes: ComponenteCif[]
  tributos: TributoCalc[]
  total_trib_ars: number
  total_trib_usd: number
}

// ── Cálculo de tributos — IDÉNTICO al del cotizador (no modificar sin replicar). ──
// 010 = derechos de importación (usa derPct y eleva la base); 011 = tasa de
// estadística (suma a la base); 'fijo' = monto plano (ej: arancel SIM); resto =
// alícuota sobre la base acumulada.
export function calcTrib(cfg: TribCfg[], cifArs: number, derPct: number): TributoCalc[] {
  const VA = cifArs
  let base = VA
  return cfg.map(t => {
    let imp = 0
    if (t.codigo === '010') { imp = VA * derPct / 100; base = VA + imp }
    else if (t.codigo === '011') { const e = VA * t.valor / 100; imp = e; base += e }
    else if (t.tipo === 'fijo') { imp = t.valor }
    else { imp = base * t.valor / 100 }
    return { ...t, imp }
  })
}

// ── Liquida una lista de componentes ──
// Suma los componentes tildados (al_cif = true), los pasa a ARS con el TC sellado
// y recalcula los tributos. Es lo que llama el pop-up cada vez que se destilda algo.
export function liquidar(
  componentes: ComponenteCif[],
  cfg: TribCfg[],
  tc: number,
  derPct: number,
): LiquidacionResultado {
  const cifUsd = componentes.reduce((t, c) => t + (c.al_cif ? c.usd : 0), 0)
  const cifArs = cifUsd * tc
  const tributos = calcTrib(cfg, cifArs, derPct)
  const totalTribArs = tributos.reduce((t, r) => t + r.imp, 0)
  const totalTribUsd = tc ? totalTribArs / tc : 0
  return { cifUsd, cifArs, tributos, totalTribArs, totalTribUsd }
}

// Arma el snapshot completo a partir de los componentes (lo usa el cotizador
// para sellar la presupuestada y el pop-up para guardar la real).
export function armarSnapshot(
  componentes: ComponenteCif[],
  cfg: TribCfg[],
  tc: number,
  derPct: number,
  regimen: string,
): LiquidacionSnapshot {
  const r = liquidar(componentes, cfg, tc, derPct)
  return {
    cif_usd: r.cifUsd,
    cif_ars: r.cifArs,
    tc,
    der_pct: derPct,
    regimen,
    componentes,
    tributos: r.tributos,
    total_trib_ars: r.totalTribArs,
    total_trib_usd: r.totalTribUsd,
  }
}
