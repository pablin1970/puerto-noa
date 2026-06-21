<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Puerto NOA · Dashboard Financiero (simulación)</title>
<style>
  :root{
    --azul:#1168F8; --azulOsc:#052698; --verde:#0a9e6e; --ambar:#ef9f27;
    --violeta:#7C3AED; --rojo:#E11D48; --teal:#0d9488; --coral:#FB7185;
    --g50:#f8fafc; --g100:#f1f5f9; --g200:#e2e8f0; --g400:#94a3b8; --g500:#64748b; --g700:#334155; --g900:#0f172a;
  }
  *{box-sizing:border-box; margin:0; padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; background:var(--g50); color:var(--g900); padding:24px}
  .wrap{max-width:1180px; margin:0 auto}
  .card{background:#fff; border:1px solid var(--g100); border-radius:18px; box-shadow:0 1px 3px rgba(15,23,42,.04)}
  .row{display:grid; gap:14px}
  .mono{font-variant-numeric:tabular-nums}
  .lbl{font-size:10px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; color:var(--g400)}
  .pill{display:inline-flex; align-items:center; gap:4px; border-radius:999px; font-weight:800; font-size:9px; padding:3px 9px}
  .bar{width:100%; background:var(--g100); border-radius:999px; overflow:hidden; height:7px}
  .bar>div{height:7px; border-radius:999px}
  .big{font-weight:800; letter-spacing:-.02em}
</style>
</head>
<body>
<div class="wrap">

  <!-- Header -->
  <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; margin-bottom:18px">
    <div>
      <h1 style="font-size:22px; font-weight:800">Dashboard financiero 💰</h1>
      <p style="font-size:12px; color:var(--g400); margin-top:2px">Puerto NOA SpA · Junio 2026 · año en curso · TC USD/CLP 912</p>
    </div>
    <div style="display:flex; gap:8px">
      <span class="card" style="padding:7px 13px; font-size:11px; color:var(--g500); font-weight:600">Libro IVA</span>
      <span class="card" style="padding:7px 13px; font-size:11px; color:var(--g500); font-weight:600">Gastos</span>
      <span class="card" style="padding:7px 13px; font-size:11px; color:var(--g500); font-weight:600">Resultados</span>
    </div>
  </div>

  <!-- HERO Resultado -->
  <div style="border-radius:22px; padding:24px; margin-bottom:14px; background:linear-gradient(135deg,#1168F8 0%,#052698 100%); color:#fff; display:grid; grid-template-columns:1.3fr 1fr; gap:20px; box-shadow:0 8px 24px rgba(17,104,248,.22)">
    <div>
      <div style="font-size:10px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; opacity:.75">Margen neto · año en curso</div>
      <div class="big mono" style="font-size:42px; margin-top:4px">USD 49.300</div>
      <div style="display:flex; gap:10px; margin-top:6px">
        <span style="background:rgba(255,255,255,.16); border-radius:999px; padding:3px 10px; font-size:11px; font-weight:700">▲ 17,2% margen</span>
        <span style="background:rgba(255,255,255,.16); border-radius:999px; padding:3px 10px; font-size:11px; font-weight:700">+12% vs 2025</span>
      </div>
      <div style="display:flex; gap:26px; margin-top:20px">
        <div><div style="font-size:10px; opacity:.7; text-transform:uppercase; letter-spacing:.04em">Margen bruto</div><div class="big mono" style="font-size:20px; margin-top:2px">USD 71.000</div></div>
        <div><div style="font-size:10px; opacity:.7; text-transform:uppercase; letter-spacing:.04em">Gastos fijos</div><div class="big mono" style="font-size:20px; margin-top:2px">USD 21.700</div></div>
        <div><div style="font-size:10px; opacity:.7; text-transform:uppercase; letter-spacing:.04em">Operaciones</div><div class="big mono" style="font-size:20px; margin-top:2px">18 cerradas</div></div>
      </div>
      <!-- sparkline margen -->
      <svg viewBox="0 0 320 48" width="100%" height="48" style="margin-top:16px; opacity:.95">
        <polyline fill="none" stroke="rgba(255,255,255,.9)" stroke-width="2.5" points="0,34 29,30 58,32 87,22 116,25 145,14 174,30 203,24 232,20 261,15 290,9 319,16"/>
        <polygon fill="rgba(255,255,255,.12)" points="0,34 29,30 58,32 87,22 116,25 145,14 174,30 203,24 232,20 261,15 290,9 319,16 319,48 0,48"/>
      </svg>
    </div>
    <div style="background:rgba(255,255,255,.1); border-radius:16px; padding:18px; display:flex; align-items:center; gap:16px">
      <div style="position:relative; width:120px; height:120px; flex-shrink:0">
        <svg width="120" height="120" viewBox="0 0 120 120">
          <g transform="rotate(-90 60 60)">
            <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="16"/>
            <circle cx="60" cy="60" r="50" fill="none" stroke="#7CF5C4" stroke-width="16" stroke-dasharray="75.9 238.3" stroke-dashoffset="0"/>
            <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="16" stroke-dasharray="238.3 75.9" stroke-dashoffset="-75.9"/>
          </g>
        </svg>
        <div style="position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center">
          <span class="big" style="font-size:22px">24%</span>
          <span style="font-size:8px; opacity:.8; text-transform:uppercase">margen br.</span>
        </div>
      </div>
      <div style="font-size:12px">
        <div style="display:flex; align-items:center; gap:7px; margin-bottom:8px"><span style="width:10px;height:10px;border-radius:3px;background:rgba(255,255,255,.6)"></span><span style="opacity:.85">Costos</span><b style="margin-left:auto">USD 223k</b></div>
        <div style="display:flex; align-items:center; gap:7px; margin-bottom:8px"><span style="width:10px;height:10px;border-radius:3px;background:#7CF5C4"></span><span style="opacity:.85">Margen</span><b style="margin-left:auto">USD 71k</b></div>
        <div style="display:flex; align-items:center; gap:7px; padding-top:8px; border-top:1px solid rgba(255,255,255,.2)"><span style="opacity:.85">Ingresos</span><b style="margin-left:auto">USD 294k</b></div>
      </div>
    </div>
  </div>

  <!-- KPI pills -->
  <div class="row" style="grid-template-columns:repeat(5,1fr); margin-bottom:14px">
    <div class="card" style="padding:15px"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px"><span class="lbl">Ingresos YTD</span><span style="font-size:14px">📈</span></div><div class="big mono" style="font-size:19px; color:var(--azul)">USD 294k</div><div class="bar" style="margin-top:8px"><div style="width:100%; background:var(--azul)"></div></div></div>
    <div class="card" style="padding:15px"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px"><span class="lbl">Costos YTD</span><span style="font-size:14px">📉</span></div><div class="big mono" style="font-size:19px; color:var(--violeta)">USD 223k</div><div class="bar" style="margin-top:8px"><div style="width:76%; background:var(--violeta)"></div></div></div>
    <div class="card" style="padding:15px"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px"><span class="lbl">IVA a pagar · jun</span><span style="font-size:14px">🧾</span></div><div class="big mono" style="font-size:19px; color:var(--rojo)">$ 920.000</div><div style="font-size:9px; color:var(--g400); margin-top:7px; font-weight:600">F29 línea 48</div></div>
    <div class="card" style="padding:15px"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px"><span class="lbl">Por cobrar</span><span style="font-size:14px">📥</span></div><div class="big mono" style="font-size:19px; color:var(--teal)">USD 96k</div><div class="bar" style="margin-top:8px"><div style="width:78%; background:var(--teal)"></div></div><div style="font-size:9px; color:var(--g400); margin-top:5px; font-weight:600">78% cobrado</div></div>
    <div class="card" style="padding:15px"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px"><span class="lbl">Por pagar</span><span style="font-size:14px">📤</span></div><div class="big mono" style="font-size:19px; color:var(--coral)">USD 58k</div><div class="bar" style="margin-top:8px"><div style="width:71%; background:var(--coral)"></div></div><div style="font-size:9px; color:var(--g400); margin-top:5px; font-weight:600">71% pagado</div></div>
  </div>

  <!-- Evolución mensual -->
  <div class="card" style="padding:20px; margin-bottom:14px">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px">
      <span class="lbl">Evolución mensual · ingresos vs costos · margen neto</span>
      <div style="display:flex; gap:14px; font-size:11px; color:var(--g500)">
        <span style="display:flex; align-items:center; gap:5px"><span style="width:10px;height:10px;border-radius:3px;background:var(--azul)"></span>Ingresos</span>
        <span style="display:flex; align-items:center; gap:5px"><span style="width:10px;height:10px;border-radius:3px;background:#c7d2fe"></span>Costos</span>
        <span style="display:flex; align-items:center; gap:5px"><span style="width:14px;height:3px;border-radius:3px;background:var(--verde)"></span>Margen neto</span>
      </div>
    </div>
    <svg id="chart" viewBox="0 0 1100 230" width="100%" height="230"></svg>
  </div>

  <!-- IVA F29 + Recupero -->
  <div class="row" style="grid-template-columns:1fr 1fr; margin-bottom:14px">
    <div class="card" style="padding:20px">
      <div class="lbl" style="margin-bottom:14px">IVA del mes · F29 (Junio)</div>
      <div style="display:flex; flex-direction:column; gap:12px">
        <div><div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:4px"><span style="color:var(--g500)">Débito fiscal (ventas)</span><b class="mono">$ 4.180.000</b></div><div class="bar"><div style="width:100%; background:var(--ambar)"></div></div></div>
        <div><div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:4px"><span style="color:var(--g500)">Crédito fiscal (compras)</span><b class="mono">$ 3.260.000</b></div><div class="bar"><div style="width:78%; background:var(--verde)"></div></div></div>
      </div>
      <div style="margin-top:16px; background:#fff1f2; border-radius:14px; padding:14px; display:flex; justify-content:space-between; align-items:center">
        <div><div style="font-size:10px; font-weight:700; color:var(--rojo); text-transform:uppercase">A pagar al SII</div><div style="font-size:9px; color:#fb7185; margin-top:1px">vence 12/07</div></div>
        <div class="big mono" style="font-size:22px; color:var(--rojo)">$ 920.000</div>
      </div>
    </div>
    <div class="card" style="padding:20px">
      <div class="lbl" style="margin-bottom:14px">Recupero de gastos (pass-through)</div>
      <div style="display:flex; align-items:center; justify-content:space-around; text-align:center; margin-bottom:8px">
        <div><div style="font-size:10px; color:var(--g500)">Cobrado a clientes</div><div class="big mono" style="font-size:22px; color:var(--teal); margin-top:3px">142k</div></div>
        <div style="font-size:20px; color:var(--g400)">→</div>
        <div><div style="font-size:10px; color:var(--g500)">Pagado a proveedores</div><div class="big mono" style="font-size:22px; color:var(--coral); margin-top:3px">128k</div></div>
      </div>
      <div style="margin-top:12px; background:#ecfdf5; border-radius:14px; padding:14px; display:flex; justify-content:space-between; align-items:center">
        <div style="font-size:11px; font-weight:700; color:var(--verde); text-transform:uppercase">Markup recupero</div>
        <div class="big mono" style="font-size:20px; color:var(--verde)">+ USD 14.000</div>
      </div>
      <div style="font-size:10px; color:var(--g400); margin-top:10px; line-height:1.5">El recupero pasa por Puerto NOA: lo que se factura de más sobre lo que se paga es ganancia real de gestión.</div>
    </div>
  </div>

  <!-- Cobranzas + Pagos (aging) -->
  <div class="row" style="grid-template-columns:1fr 1fr; margin-bottom:14px">
    <div class="card" style="padding:20px">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px"><span class="lbl">Por cobrar a clientes</span><span class="big mono" style="font-size:18px; color:var(--teal)">USD 96.400</span></div>
      <div style="display:flex; height:12px; border-radius:999px; overflow:hidden; margin-bottom:10px">
        <div style="width:74%; background:var(--teal)"></div><div style="width:18%; background:var(--ambar)"></div><div style="width:8%; background:var(--rojo)"></div>
      </div>
      <div style="display:flex; gap:14px; font-size:10px; color:var(--g500)">
        <span><b style="color:var(--teal)">●</b> Al día 71k</span><span><b style="color:var(--ambar)">●</b> 1-30d 17k</span><span><b style="color:var(--rojo)">●</b> Vencido +30d 8k</span>
      </div>
      <div style="margin-top:14px; font-size:11px; color:var(--g500)">Top deudores</div>
      <div style="margin-top:6px; font-size:12px">
        <div style="display:flex; justify-content:space-between; padding:5px 0; border-bottom:1px solid var(--g100)"><span>Andes Trading Group</span><b class="mono">USD 28.400</b></div>
        <div style="display:flex; justify-content:space-between; padding:5px 0; border-bottom:1px solid var(--g100)"><span>Minera Atacama Ltda.</span><b class="mono">USD 22.100</b></div>
        <div style="display:flex; justify-content:space-between; padding:5px 0"><span>Importadora del Norte</span><b class="mono">USD 14.900</b></div>
      </div>
    </div>
    <div class="card" style="padding:20px">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px"><span class="lbl">Por pagar a proveedores</span><span class="big mono" style="font-size:18px; color:var(--coral)">USD 58.200</span></div>
      <div style="display:flex; height:12px; border-radius:999px; overflow:hidden; margin-bottom:10px">
        <div style="width:76%; background:var(--azul)"></div><div style="width:14%; background:var(--ambar)"></div><div style="width:10%; background:var(--rojo)"></div>
      </div>
      <div style="display:flex; gap:14px; font-size:10px; color:var(--g500)">
        <span><b style="color:var(--azul)">●</b> Al día 44k</span><span><b style="color:var(--ambar)">●</b> 1-30d 8k</span><span><b style="color:var(--rojo)">●</b> Vencido +30d 6k</span>
      </div>
      <div style="margin-top:14px; background:#eff6ff; border-radius:14px; padding:12px; display:flex; justify-content:space-between; align-items:center">
        <span style="font-size:11px; font-weight:700; color:var(--azulOsc); text-transform:uppercase">Posición neta</span>
        <span class="big mono" style="font-size:18px; color:var(--azulOsc)">+ USD 38.200</span>
      </div>
      <div style="font-size:10px; color:var(--g400); margin-top:8px">Cobramos más de lo que debemos: capital de trabajo a favor.</div>
    </div>
  </div>

  <!-- Tesorería + Gastos -->
  <div class="row" style="grid-template-columns:1fr 1fr; margin-bottom:6px">
    <div class="card" style="padding:20px">
      <div class="lbl" style="margin-bottom:14px">Tesorería · cuentas propias Puerto NOA</div>
      <div style="display:flex; gap:10px; margin-bottom:14px">
        <div style="flex:1; background:var(--g50); border-radius:14px; padding:12px"><div style="font-size:10px; color:var(--g500)">🇨🇱 CLP</div><div class="big mono" style="font-size:15px; margin-top:3px">$ 42,3M</div></div>
        <div style="flex:1; background:var(--g50); border-radius:14px; padding:12px"><div style="font-size:10px; color:var(--g500)">💵 USD</div><div class="big mono" style="font-size:15px; margin-top:3px">28.900</div></div>
        <div style="flex:1; background:var(--g50); border-radius:14px; padding:12px"><div style="font-size:10px; color:var(--g500)">🇦🇷 ARS</div><div class="big mono" style="font-size:15px; margin-top:3px">$ 6,8M</div></div>
      </div>
      <div style="background:linear-gradient(135deg,#0d9488,#0f766e); border-radius:14px; padding:14px; color:#fff; display:flex; justify-content:space-between; align-items:center">
        <div><div style="font-size:10px; opacity:.85; text-transform:uppercase; font-weight:700">Liquidez consolidada</div><div style="font-size:9px; opacity:.75">equivalente USD</div></div>
        <div class="big mono" style="font-size:22px">USD 75.100</div>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px; padding:10px 0 0; border-top:1px dashed var(--g200)">
        <span style="font-size:11px; color:var(--g500)">🏦 Fondos en custodia (clientes)</span>
        <span class="big mono" style="font-size:15px; color:var(--g700)">USD 318.000</span>
      </div>
    </div>
    <div class="card" style="padding:20px">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px"><span class="lbl">Gastos fijos del mes</span><span class="big mono" style="font-size:16px; color:var(--ambar)">$ 3,29M</span></div>
      <div id="gastos"></div>
    </div>
  </div>

  <p style="text-align:center; font-size:11px; color:var(--g400); margin:18px 0 0">Simulación con datos de ejemplo — propuesta de diseño del dashboard financiero.</p>
</div>

<script>
  // ── Gráfico evolución mensual ──
  const M=['Jul','Ago','Sep','Oct','Nov','Dic','Ene','Feb','Mar','Abr','May','Jun'];
  const ing=[38,42,35,51,47,58,33,44,49,55,61,52];
  const cost=[29,31,27,39,35,44,26,34,37,41,46,39];
  const mn=ing.map((v,i)=>v-cost[i]-3); // margen neto aprox
  const W=1100,H=230,padB=28,padT=10,plot=H-padB-padT,maxV=65;
  const gw=W/12, bw=18;
  const y=v=>padT+plot-(v/maxV*plot);
  let s='';
  // gridlines
  [0,20,40,60].forEach(g=>{ s+=`<line x1="0" y1="${y(g)}" x2="${W}" y2="${y(g)}" stroke="#eef2f7"/><text x="2" y="${y(g)-3}" font-size="9" fill="#94a3b8">${g}k</text>`; });
  ing.forEach((v,i)=>{
    const cx=i*gw+gw/2;
    s+=`<rect x="${cx-bw-2}" y="${y(v)}" width="${bw}" height="${y(0)-y(v)}" rx="4" fill="#1168F8"/>`;
    s+=`<rect x="${cx+2}" y="${y(cost[i])}" width="${bw}" height="${y(0)-y(cost[i])}" rx="4" fill="#c7d2fe"/>`;
    s+=`<text x="${cx}" y="${H-10}" font-size="10" fill="#64748b" text-anchor="middle">${M[i]}</text>`;
  });
  // línea margen neto
  let pts=mn.map((v,i)=>`${i*gw+gw/2},${y(v)}`).join(' ');
  s+=`<polyline fill="none" stroke="#0a9e6e" stroke-width="2.5" points="${pts}"/>`;
  mn.forEach((v,i)=>{ s+=`<circle cx="${i*gw+gw/2}" cy="${y(v)}" r="3" fill="#0a9e6e"/>`; });
  document.getElementById('chart').innerHTML=s;

  // ── Gastos por categoría ──
  const cats=[['Sueldos y honorarios',2100,'#1168F8'],['Oficina y arriendo',480,'#7C3AED'],['Servicios básicos',320,'#0d9488'],['Software y sistemas',180,'#ef9f27'],['Otros',210,'#FB7185']];
  const tot=cats.reduce((t,c)=>t+c[1],0);
  document.getElementById('gastos').innerHTML=cats.map(c=>`
    <div style="margin-bottom:12px">
      <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:4px"><span style="color:#334155">${c[0]}</span><b class="mono" style="color:#64748b">$ ${(c[1]/1000).toLocaleString('es-CL',{minimumFractionDigits:2})}M · ${Math.round(c[1]/tot*100)}%</b></div>
      <div style="width:100%; background:#f1f5f9; border-radius:999px; height:7px; overflow:hidden"><div style="width:${c[1]/tot*100}%; height:7px; border-radius:999px; background:${c[2]}"></div></div>
    </div>`).join('');
</script>
</body>
</html>
