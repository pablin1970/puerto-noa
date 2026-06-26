// ─────────────────────────────────────────────────────────────────────────────
// Acceso a documentos · Puerto NOA
// "Ver" un documento pasa por el motor /api/ver-documento, que valida el permiso
// (vía el token del usuario + RLS) y, si es PDF, le estampa una marca de agua con
// el usuario y la fecha. "Descargar" NO usa esto: cada pantalla genera un enlace
// firmado al original limpio, gobernado por el permiso 'descargar'.
// ─────────────────────────────────────────────────────────────────────────────

export function urlVerConMarca(bucket: string, path: string): string {
  return `/api/ver-documento?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(path)}`
}

export function abrirConMarca(bucket: string, path: string) {
  if (typeof window !== 'undefined') {
    window.open(urlVerConMarca(bucket, path), '_blank', 'noreferrer')
  }
}
