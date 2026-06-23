'use client'
import TributosConfig from '../catalogos/TributosConfig'

// La configuración de Tributos ARCA ahora vive como pestaña dentro de Catálogos.
// Esta ruta se mantiene por compatibilidad (enlaces/favoritos) y reutiliza el
// mismo componente, agregando el marco de página.
export default function TributosConfigPage() {
  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <TributosConfig />
    </div>
  )
}
