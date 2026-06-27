'use client'
import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { cargarPermisos, esSuperAdmin } from '@/lib/permisos'

// ── Aviso in-app de "login fuera de zona" ────────────────────────────────────
// Le aparece al super admin (que es quien recibe el mail de alerta) un pop-up
// arriba a la derecha con cada conexión fuera de zona que todavía no atendió:
// usuario, lugar, IP y fecha. Se cierra con la × (o "Cerrar"), y al cerrarlo
// queda marcado como visto (alerta_vista=true) para no repetirse.

interface AlertaLogin {
  id: string
  usuario_id: string
  nombre: string
  ip: string | null
  ciudad: string | null
  region: string | null
  pais: string | null
  created_at: string
}

export default function AlertaFueraDeZona() {
  const supabase = useMemo(() => createClient(), [])
  const [alertas, setAlertas] = useState<AlertaLogin[]>([])
  const [activo, setActivo] = useState(false)

  const cargar = useCallback(async () => {
    if (!esSuperAdmin()) return
    // Ventana de 30 días: no traemos avisos viejísimos, solo lo reciente sin atender.
    const desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const { data: logs } = await supabase
      .from('login_historial')
      .select('id, usuario_id, ip, ciudad, region, pais, created_at')
      .eq('fuera_de_zona', true)
      .eq('alerta_vista', false)
      .gte('created_at', desde)
      .order('created_at', { ascending: false })
      .limit(10)

    if (!logs || !logs.length) { setAlertas([]); return }

    const ids = Array.from(new Set((logs as any[]).map(l => l.usuario_id).filter(Boolean)))
    const nombres: Record<string, string> = {}
    if (ids.length) {
      const { data: us } = await supabase.from('usuarios').select('id, nombre').in('id', ids)
      for (const u of (us || []) as any[]) nombres[u.id] = u.nombre
    }
    setAlertas((logs as any[]).map(l => ({ ...l, nombre: nombres[l.usuario_id] || 'Usuario' })))
  }, [supabase])

  useEffect(() => {
    let vivo = true
    let timer: ReturnType<typeof setInterval> | null = null
    ;(async () => {
      await cargarPermisos()
      if (!vivo || !esSuperAdmin()) return
      setActivo(true)
      await cargar()
      timer = setInterval(cargar, 60000)  // refresca cada minuto
    })()
    return () => { vivo = false; if (timer) clearInterval(timer) }
  }, [cargar])

  async function cerrar(id: string) {
    setAlertas(prev => prev.filter(a => a.id !== id))
    try { await (supabase.from('login_historial') as any).update({ alerta_vista: true }).eq('id', id) } catch {}
  }

  async function cerrarTodas() {
    const ids = alertas.map(a => a.id)
    setAlertas([])
    try { await (supabase.from('login_historial') as any).update({ alerta_vista: true }).in('id', ids) } catch {}
  }

  if (!activo || !alertas.length) return null

  const fmt = (s: string) => new Date(s).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 9999, width: 340, maxWidth: 'calc(100vw - 32px)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {alertas.length > 1 && (
        <button onClick={cerrarTodas}
          style={{ alignSelf: 'flex-end', fontSize: 11, fontWeight: 600, color: '#6b7280', background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: '3px 10px', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          Cerrar todas ({alertas.length})
        </button>
      )}
      {alertas.map(a => (
        <div key={a.id} style={{ background: 'white', border: '1px solid #fecaca', borderLeft: '4px solid #E11D48', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: '12px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#E11D48', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>⚠</span> Login fuera de zona
            </div>
            <button onClick={() => cerrar(a.id)} aria-label="Cerrar"
              style={{ color: '#9ca3af', fontSize: 20, lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>×</button>
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: '#111827', fontWeight: 600 }}>{a.nombre}</div>
          <div style={{ marginTop: 4, fontSize: 12, color: '#4b5563' }}>
            {[a.ciudad, a.region, a.pais].filter(Boolean).join(', ') || 'ubicación desconocida'}
          </div>
          <div style={{ marginTop: 2, fontSize: 12, color: '#6b7280', fontFamily: 'monospace' }}>IP {a.ip || '—'}</div>
          <div style={{ marginTop: 2, fontSize: 11, color: '#9ca3af' }}>{fmt(a.created_at)}</div>
          <button onClick={() => cerrar(a.id)}
            style={{ marginTop: 8, fontSize: 11, fontWeight: 600, color: '#E11D48', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '4px 12px', cursor: 'pointer' }}>
            Cerrar
          </button>
        </div>
      ))}
    </div>
  )
}
