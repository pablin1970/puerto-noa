'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

interface Ent {
  id: string
  pais: string
  tipo: string
  codigo: string | null
  nombre: string
  nombre_corto: string | null
  activo: boolean
}

// Normaliza el país que viene de las distintas pantallas de cuentas:
// FondosCuentasABM usa 'Argentina'/'Chile'; CuentasABM usa 'AR'/'CL'.
function normPais(p?: string): string {
  const s = (p || '').toLowerCase()
  if (s === 'ar' || s.startsWith('arg')) return 'AR'
  if (s === 'cl' || s.startsWith('chil')) return 'CL'
  if (s === 'cn' || s.startsWith('chin')) return 'CN'
  if (s === 'us' || s.startsWith('est') || s.startsWith('eeuu') || s.startsWith('united')) return 'US'
  return (p || '').toUpperCase()
}

export default function SelectorBanco({ pais, value, onChange, className }: {
  pais?: string
  value: string
  onChange: (nombre: string) => void
  className?: string
}) {
  const supabase = createClient()
  const [ents, setEnts] = useState<Ent[]>([])

  useEffect(() => {
    (async () => {
      const { data } = await (supabase.from('entidades_financieras') as any)
        .select('*').eq('activo', true).order('tipo', { ascending: true }).order('orden', { ascending: true })
      setEnts(data || [])
    })()
  }, [])

  const code = normPais(pais)
  const delPais = ents.filter(e => e.pais === code)
  const bancos = delPais.filter(e => e.tipo === 'banco')
  const fintechs = delPais.filter(e => e.tipo === 'fintech')
  const alycs = delPais.filter(e => e.tipo === 'alyc')
  const enLista = delPais.some(e => e.nombre === value)

  return (
    <select value={value || ''} onChange={e => onChange(e.target.value)} className={className}>
      <option value="">— elegí entidad —</option>
      {value && !enLista && <option value={value}>{value} (actual)</option>}
      {bancos.length > 0 && (
        <optgroup label="Bancos">
          {bancos.map(e => <option key={e.id} value={e.nombre}>{e.codigo ? e.codigo + ' · ' : ''}{e.nombre}</option>)}
        </optgroup>
      )}
      {fintechs.length > 0 && (
        <optgroup label="Fintech / billeteras">
          {fintechs.map(e => <option key={e.id} value={e.nombre}>{e.nombre}</option>)}
        </optgroup>
      )}
      {alycs.length > 0 && (
        <optgroup label="ALyC / Agentes de inversión">
          {alycs.map(e => <option key={e.id} value={e.nombre}>{e.nombre}</option>)}
        </optgroup>
      )}
    </select>
  )
}
