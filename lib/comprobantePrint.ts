// Impresión de comprobantes de tesorería (recibo, orden de pago) con identidad Puerto NOA.
// No usa librerías: arma el HTML y abre la ventana de impresión del navegador.
// Documento interno (no DTE): lleva leyenda aclaratoria según normativa chilena.

export interface EmpresaCfg {
  razon_social?: string | null
  rut?: string | null
  giro?: string | null
  direccion?: string | null
  ciudad?: string | null
  logo_url?: string | null
  representante_legal?: string | null
  email?: string | null
  telefono?: string | null
}

export interface ImprimirOpts {
  empresa: EmpresaCfg
  tipoDoc: string            // 'RECIBO DE DINERO' | 'ORDEN DE PAGO'
  numero: string
  fecha: string
  receptorLabel: string      // 'Recibí de' | 'Pagado a'
  receptor: { razon_social?: string | null; nro_doc?: string | null }
  concepto?: string | null
  moneda: string
  monto: number
  montoUsd?: number | null
  imputaciones?: { etiqueta: string; monto: number }[]
  leyendaPie?: string
}

const fmt = (n: number) => Math.round(n || 0).toLocaleString('es-CL')
const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

const UNI = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE']
const DEC = ['', '', 'VEINTI', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA']
const CEN = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS']

function centenas(n: number): string {
  if (n === 0) return ''
  if (n === 100) return 'CIEN'
  let r = ''
  const c = Math.floor(n / 100), resto = n % 100
  if (c) r += CEN[c] + ' '
  if (resto <= 20) r += UNI[resto]
  else { const d = Math.floor(resto / 10), u = resto % 10; r += (d === 2 ? 'VEINTI' + UNI[u] : DEC[d] + (u ? ' Y ' + UNI[u] : '')) }
  return r.trim()
}
function numeroALetras(num: number): string {
  num = Math.round(num)
  if (num === 0) return 'CERO'
  const millones = Math.floor(num / 1_000_000)
  const miles = Math.floor((num % 1_000_000) / 1000)
  const resto = num % 1000
  let r = ''
  if (millones) r += (millones === 1 ? 'UN MILLÓN ' : centenas(millones) + ' MILLONES ')
  if (miles) r += (miles === 1 ? 'MIL ' : centenas(miles) + ' MIL ')
  if (resto) r += centenas(resto)
  return r.trim()
}

export function imprimirComprobante(o: ImprimirOpts) {
  const e = o.empresa || {}
  const imps = o.imputaciones || []
  const logo = e.logo_url
    ? `<img src="${esc(e.logo_url)}" style="max-height:64px;max-width:200px;object-fit:contain" />`
    : `<div style="font-size:22px;font-weight:800;color:#1168F8;letter-spacing:.5px">${esc(e.razon_social || 'PUERTO NOA SPA')}</div>`

  const filasImput = imps.length
    ? `<table style="width:100%;border-collapse:collapse;margin-top:6px;font-size:12px">
        <thead><tr style="background:#f3f4f6"><th style="text-align:left;padding:6px 8px;border:1px solid #e5e7eb">Aplicado a</th><th style="text-align:right;padding:6px 8px;border:1px solid #e5e7eb">Monto</th></tr></thead>
        <tbody>${imps.map(i => `<tr><td style="padding:6px 8px;border:1px solid #e5e7eb">${esc(i.etiqueta)}</td><td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:right;font-family:monospace">${fmt(i.monto)}</td></tr>`).join('')}</tbody>
      </table>`
    : ''

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(o.tipoDoc)} ${esc(o.numero)}</title>
  <style>
    * { box-sizing:border-box } body { font-family:'Segoe UI',Arial,sans-serif; color:#1f2937; margin:0; padding:32px; }
    .doc { max-width:720px; margin:0 auto; border:1px solid #e5e7eb; border-radius:12px; padding:28px 32px; }
    .top { display:flex; justify-content:space-between; align-items:flex-start; gap:24px; border-bottom:2px solid #1168F8; padding-bottom:16px; }
    .emisor { font-size:11px; color:#6b7280; line-height:1.5; margin-top:6px }
    .emisor b { color:#374151 }
    .box { border:2px solid #E11D48; border-radius:8px; padding:10px 16px; text-align:center; min-width:180px }
    .box .t { font-size:11px; font-weight:700; color:#E11D48; letter-spacing:.5px }
    .box .n { font-size:22px; font-weight:800; font-family:monospace; color:#111827 }
    .box .r { font-size:11px; color:#6b7280; margin-top:2px }
    .row { display:flex; justify-content:space-between; margin-top:18px; font-size:12px }
    .receptor { margin-top:18px; font-size:13px } .receptor .lbl { font-size:11px; color:#6b7280; text-transform:uppercase }
    .monto { margin-top:18px; background:#EBF2FF; border:1px solid #93B8FC; border-radius:8px; padding:14px 18px }
    .monto .big { font-size:24px; font-weight:800; font-family:monospace; color:#052698 }
    .letras { font-size:11px; color:#374151; margin-top:4px; font-style:italic }
    .concepto { margin-top:16px; font-size:13px } .concepto .lbl { font-size:11px; color:#6b7280; text-transform:uppercase }
    .firma { margin-top:48px; display:flex; justify-content:flex-end }
    .firma .l { border-top:1px solid #9ca3af; padding-top:6px; width:240px; text-align:center; font-size:11px; color:#6b7280 }
    .pie { margin-top:24px; font-size:10px; color:#9ca3af; text-align:center; border-top:1px solid #f3f4f6; padding-top:10px }
    @media print { body { padding:0 } .doc { border:none } .noprint { display:none } }
    .btn { background:#1168F8; color:#fff; border:none; padding:10px 20px; border-radius:8px; font-weight:700; cursor:pointer; font-size:13px }
  </style></head><body>
  <div class="noprint" style="max-width:720px;margin:0 auto 16px;text-align:right">
    <button class="btn" onclick="window.print()">🖨 Imprimir</button>
  </div>
  <div class="doc">
    <div class="top">
      <div>
        ${logo}
        <div class="emisor">
          ${e.rut ? `<div><b>RUT:</b> ${esc(e.rut)}</div>` : ''}
          ${e.giro ? `<div><b>Giro:</b> ${esc(e.giro)}</div>` : ''}
          ${e.direccion ? `<div>${esc(e.direccion)}${e.ciudad ? ', ' + esc(e.ciudad) : ''}</div>` : (e.ciudad ? `<div>${esc(e.ciudad)}</div>` : '')}
          ${e.telefono ? `<div>${esc(e.telefono)}</div>` : ''}
          ${e.email ? `<div>${esc(e.email)}</div>` : ''}
        </div>
      </div>
      <div class="box">
        <div class="t">${esc(o.tipoDoc)}</div>
        <div class="n">${esc(o.numero)}</div>
        <div class="r">Fecha: ${esc(o.fecha)}</div>
      </div>
    </div>

    <div class="receptor">
      <div class="lbl">${esc(o.receptorLabel)}</div>
      <div style="font-weight:700;font-size:15px">${esc(o.receptor?.razon_social || '—')}</div>
      ${o.receptor?.nro_doc ? `<div style="font-size:12px;color:#6b7280">RUT/Doc: ${esc(o.receptor.nro_doc)}</div>` : ''}
    </div>

    <div class="monto">
      <div class="big">${esc(o.moneda)} $ ${fmt(o.monto)}</div>
      <div class="letras">Son: ${esc(numeroALetras(o.monto))} ${esc(o.moneda)}${o.montoUsd ? ` — (equiv. USD ${fmt(o.montoUsd)})` : ''}</div>
    </div>

    ${o.concepto ? `<div class="concepto"><div class="lbl">Concepto</div><div>${esc(o.concepto)}</div></div>` : ''}
    ${filasImput}

    <div class="firma"><div class="l">${esc(e.representante_legal || '')}<br/>${esc(e.razon_social || '')}</div></div>

    <div class="pie">
      ${esc(o.leyendaPie || 'Documento interno de control — no constituye documento tributario electrónico (DTE).')}
    </div>
  </div>
  <script>setTimeout(function(){ try { window.focus() } catch(e){} }, 200)</script>
  </body></html>`

  const w = window.open('', '_blank', 'width=820,height=900')
  if (!w) { alert('Habilitá las ventanas emergentes para imprimir el comprobante.'); return }
  w.document.open(); w.document.write(html); w.document.close()
}
