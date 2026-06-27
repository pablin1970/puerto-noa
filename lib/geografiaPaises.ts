// ── Referencia geográfica para "datos de operación" del usuario ──────────────
// País + subdivisión de primer nivel. El término cambia por país (provincia /
// región / etc.) y la lista es cerrada para que no se cargue cualquier cosa y
// para que matchee con lo que devuelve la geolocalización del login.
// Para sumar un país nuevo: agregarlo acá con su término y su lista.

export interface PaisGeo {
  codigo: string      // ISO alpha-2 (para comparar con la geolocalización)
  nombre: string
  termino: string     // cómo se llama la subdivisión en ese país
  regiones: string[]
}

export const PAISES_OPERACION: PaisGeo[] = [
  {
    codigo: 'AR',
    nombre: 'Argentina',
    termino: 'Provincia',
    regiones: [
      'Buenos Aires', 'Ciudad Autónoma de Buenos Aires', 'Catamarca', 'Chaco',
      'Chubut', 'Córdoba', 'Corrientes', 'Entre Ríos', 'Formosa', 'Jujuy',
      'La Pampa', 'La Rioja', 'Mendoza', 'Misiones', 'Neuquén', 'Río Negro',
      'Salta', 'San Juan', 'San Luis', 'Santa Cruz', 'Santa Fe',
      'Santiago del Estero', 'Tierra del Fuego', 'Tucumán',
    ],
  },
  {
    codigo: 'CL',
    nombre: 'Chile',
    termino: 'Región',
    regiones: [
      'Arica y Parinacota', 'Tarapacá', 'Antofagasta', 'Atacama', 'Coquimbo',
      'Valparaíso', 'Metropolitana de Santiago', "O'Higgins", 'Maule', 'Ñuble',
      'Biobío', 'La Araucanía', 'Los Ríos', 'Los Lagos', 'Aysén', 'Magallanes',
    ],
  },
  {
    codigo: 'CN',
    nombre: 'China',
    termino: 'Provincia / Región',
    regiones: [
      'Anhui', 'Fujian', 'Gansu', 'Guangdong', 'Guizhou', 'Hainan', 'Hebei',
      'Heilongjiang', 'Henan', 'Hubei', 'Hunan', 'Jiangsu', 'Jiangxi', 'Jilin',
      'Liaoning', 'Qinghai', 'Shaanxi', 'Shandong', 'Shanxi', 'Sichuan',
      'Yunnan', 'Zhejiang', 'Guangxi', 'Mongolia Interior', 'Ningxia', 'Tíbet',
      'Xinjiang', 'Beijing', 'Chongqing', 'Shanghái', 'Tianjin', 'Hong Kong',
      'Macao',
    ],
  },
]

export function paisGeoPorNombre(nombre?: string | null): PaisGeo | undefined {
  if (!nombre) return undefined
  const n = normalizarGeo(nombre)
  return PAISES_OPERACION.find(p => normalizarGeo(p.nombre) === n || normalizarGeo(p.codigo) === n)
}

export function terminoRegion(paisNombre?: string | null): string {
  return paisGeoPorNombre(paisNombre)?.termino || 'Provincia / región'
}

export function regionesDe(paisNombre?: string | null): string[] {
  return paisGeoPorNombre(paisNombre)?.regiones || []
}

// Normaliza para comparar: minúsculas, sin acentos, sin espacios extremos.
export function normalizarGeo(s?: string | null): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

// ¿La conexión cayó fuera del lugar de operación del usuario?
// - Si tiene país de operación y el país del login no coincide -> fuera de zona.
// - Si además tiene provincia/región y la del login no coincide -> fuera de zona.
// - Si no tiene país de operación cargado -> no se evalúa (false).
// El país es señal confiable; la región por IP es aproximada (best-effort).
export function esFueraDeZona(
  paisOperacion?: string | null,
  provinciaOperacion?: string | null,
  paisLogin?: string | null,
  regionLogin?: string | null,
): boolean {
  if (!paisOperacion) return false
  const pOp = normalizarGeo(paisOperacion)
  const pLog = normalizarGeo(paisLogin)
  // país del login vacío -> no podemos afirmar nada, no marcamos
  if (!pLog) return false
  if (pOp !== pLog) {
    // matcheo por código ISO también (Argentina vs AR)
    const geo = paisGeoPorNombre(paisOperacion)
    if (!geo || normalizarGeo(geo.codigo) !== pLog) return true
  }
  if (provinciaOperacion && regionLogin) {
    if (normalizarGeo(provinciaOperacion) !== normalizarGeo(regionLogin)) return true
  }
  return false
}

export interface LugarOperacion { pais: string; provincia?: string | null }

// Versión multi-lugar: el usuario puede tener varios lugares habilitados.
// EN ZONA si la conexión coincide con ALGUNA línea:
//   - mismo país (por nombre o código ISO) Y
//   - línea sin provincia -> matchea todo el país
//   - línea con provincia -> matchea si coincide la región del login
//     (si la región del login es desconocida, se da por buena: la región por IP
//      es best-effort y no queremos falsas alarmas; el país sí es confiable).
// Sin lugares cargados -> no se evalúa (false). País del login desconocido -> false.
export function esFueraDeZonaMulti(
  lugares?: LugarOperacion[] | null,
  paisLogin?: string | null,
  regionLogin?: string | null,
): boolean {
  if (!lugares || !lugares.length) return false
  const pLog = normalizarGeo(paisLogin)
  if (!pLog) return false
  const rLog = normalizarGeo(regionLogin)

  const matchPais = (paisOp: string): boolean => {
    if (normalizarGeo(paisOp) === pLog) return true
    const geo = paisGeoPorNombre(paisOp)
    return !!geo && normalizarGeo(geo.codigo) === pLog
  }

  for (const l of lugares) {
    if (!l || !l.pais || !matchPais(l.pais)) continue
    const prov = normalizarGeo(l.provincia)
    if (!prov || !rLog || prov === rLog) return false  // alguna línea coincide -> en zona
  }
  return true  // ninguna línea coincidió -> fuera de zona
}
