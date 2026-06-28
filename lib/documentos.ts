// ─────────────────────────────────────────────────────────────────────────────
// Acceso a documentos · Puerto NOA
// "Ver" un documento pasa por el motor /api/ver-documento, que valida el permiso
// (vía el token del usuario + RLS) y, si es PDF, le estampa una marca de agua con
// el usuario y la fecha. "Descargar" NO usa esto: cada pantalla genera un enlace
// firmado al original limpio, gobernado por el permiso 'descargar'.
//
// La extensión real se pasa con `nombre` (el nombre original del archivo), porque
// el path guardado en storage puede no tenerla. Sin eso, la previsualización no
// sabe el tipo y el navegador termina descargando en vez de mostrar.
// ─────────────────────────────────────────────────────────────────────────────

export function urlVerConMarca(bucket: string, path: string, nombre?: string): string {
  const base = `/api/ver-documento?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(path)}`
  return nombre ? `${base}&nombre=${encodeURIComponent(nombre)}` : base
}

export function abrirConMarca(bucket: string, path: string, nombre?: string) {
  if (typeof window !== 'undefined') {
    window.open(urlVerConMarca(bucket, path, nombre), '_blank', 'noreferrer')
  }
}
