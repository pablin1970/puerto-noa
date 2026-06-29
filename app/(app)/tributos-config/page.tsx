'use client'
import { useEffect, useState } from 'react'
import { cargarPermisos, puede } from '@/lib/permisos'
import TributosConfig from '../catalogos/TributosConfig'

// La configuración de Tributos ARCA ahora vive como pestaña dentro de Catálogos.
// Esta ruta se mantiene por compatibilidad (enlaces/favoritos) y reutiliza el
// mismo componente, agregando el marco de página y el gate de permiso del módulo
// 'tributos' (los datos ya están protegidos por RLS; esto cierra el acceso visual).
export default function TributosConfigPage() {
  const [permisos, setPermisos] = useState<Record<string, string[]>>({})
  const [permListos, setPermListos] = useState(false)
  useEffect(() => { cargarPermisos().then(p => { setPermisos(p); setPermListos(true) }) }, [])

  if (permListos && !puede(permisos, 'tributos', 'ver')) {
    return (
      <div className="p-6 bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-3">🔒</div>
          <h2 className="text-lg font-bold text-gray-700">Sin acceso</h2>
          <p className="text-sm text-gray-400 mt-1">No tenés permiso para ver esta sección. Si creés que es un error, contactá al administrador.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <TributosConfig />
    </div>
  )
}
