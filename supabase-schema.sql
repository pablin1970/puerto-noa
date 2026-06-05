-- ============================================================
-- PUERTO NOA SpA — Schema Supabase
-- Ejecutar en: Supabase Dashboard > SQL Editor > New Query
-- ============================================================

-- Habilitar UUID
create extension if not exists "uuid-ossp";

-- ─── USUARIOS ────────────────────────────────────────────────
create table if not exists usuarios (
  id uuid primary key default uuid_generate_v4(),
  auth_id uuid references auth.users(id) on delete set null,
  nombre text not null,
  email text not null unique,
  rol text not null check (rol in ('admin','ejecutivo','operaciones','gerencia')),
  iniciales text not null,
  activo boolean default true,
  created_at timestamptz default now()
);

-- ─── COTIZACIONES ────────────────────────────────────────────
create table if not exists cotizaciones (
  id uuid primary key default uuid_generate_v4(),
  num text not null unique,
  version int default 1,
  cliente text not null,
  cuit text default '',
  email_cliente text default '',
  telefono_cliente text default '',
  origen text default 'China',
  puerto_chile text default 'IQQ',
  destino_noa text default 'Jujuy',
  incoterm text default 'FOB',
  transito text default '44-46 días',
  ref_naviero text default '',
  tipo_contenedores jsonb default '[]',
  productos jsonb default '[]',
  total_fob numeric default 0,
  total_logistico numeric default 0,
  total_tributos_usd numeric default 0,
  total_tributos_ars numeric default 0,
  total_landed numeric default 0,
  precio_arg_equiv numeric,
  regimen text default 'A' check (regimen in ('A','B')),
  tc_ars numeric default 1000,
  derechos_pct numeric default 18,
  opcion_transporte text default 'desconsolidar',
  validez text default '',
  notas text default '',
  estado text default 'borrador' check (estado in ('borrador','enviada','aceptada','rechazada','vencida')),
  ejecutivo_id uuid references usuarios(id),
  creado_por uuid references usuarios(id),
  modificado_por uuid references usuarios(id),
  presupuesto jsonb default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─── OPERACIONES ─────────────────────────────────────────────
create table if not exists operaciones (
  id uuid primary key default uuid_generate_v4(),
  cotizacion_id uuid references cotizaciones(id) on delete cascade unique,
  estado text default 'activa' check (estado in ('activa','cerrada')),
  pasos jsonb default '[false,false,false,false,false]',
  fecha_cierre date,
  hist_cierre jsonb default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─── GASTOS ──────────────────────────────────────────────────
create table if not exists gastos (
  id uuid primary key default uuid_generate_v4(),
  operacion_id uuid references operaciones(id) on delete cascade,
  fecha date not null,
  etapa text not null,
  concepto text not null,
  moneda text default 'USD',
  monto numeric default 0,
  tc numeric default 1,
  usd numeric default 0,
  estado text default 'pendiente' check (estado in ('pendiente','pagado','parcial')),
  ref text default '',
  notas text default '',
  created_at timestamptz default now()
);

-- ─── MOVIMIENTOS CUENTA CORRIENTE ────────────────────────────
create table if not exists movimientos_cc (
  id uuid primary key default uuid_generate_v4(),
  operacion_id uuid references operaciones(id) on delete cascade,
  tipo text not null check (tipo in ('ingreso','egreso')),
  concepto text not null,
  moneda text default 'USD',
  monto numeric default 0,
  tc numeric default 1,
  usd numeric default 0,
  fecha date not null,
  ref text default '',
  created_at timestamptz default now()
);

-- ─── MINUTA DE PAGO ──────────────────────────────────────────
create table if not exists minuta_items (
  id uuid primary key default uuid_generate_v4(),
  operacion_id uuid references operaciones(id) on delete cascade,
  proveedor text not null,
  concepto text default '',
  moneda text default 'USD',
  monto numeric default 0,
  fecha_vto date,
  banco text default '',
  cuenta text default '',
  swift text default '',
  notas text default '',
  created_at timestamptz default now()
);

-- ─── TARIFAS BASE ────────────────────────────────────────────
create table if not exists tarifas (
  id uuid primary key default uuid_generate_v4(),
  tipo text not null check (tipo in ('maritima','terrestre','puerto')),
  ruta text not null,
  tipo_contenedor text default '',
  valor numeric default 0,
  naviera text default '',
  iva_chile text default 'exento',
  obs text default '',
  activo boolean default true,
  created_at timestamptz default now()
);

-- ─── UPDATED_AT TRIGGER ──────────────────────────────────────
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger cotizaciones_updated_at before update on cotizaciones
  for each row execute function update_updated_at();

create trigger operaciones_updated_at before update on operaciones
  for each row execute function update_updated_at();

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────
alter table usuarios enable row level security;
alter table cotizaciones enable row level security;
alter table operaciones enable row level security;
alter table gastos enable row level security;
alter table movimientos_cc enable row level security;
alter table minuta_items enable row level security;
alter table tarifas enable row level security;

-- Políticas: usuarios autenticados ven todo (simplificado para esta versión)
create policy "Usuarios autenticados leen usuarios" on usuarios
  for select to authenticated using (true);

create policy "Usuarios autenticados leen cotizaciones" on cotizaciones
  for select to authenticated using (true);

create policy "Usuarios autenticados escriben cotizaciones" on cotizaciones
  for all to authenticated using (true) with check (true);

create policy "Usuarios autenticados leen operaciones" on operaciones
  for select to authenticated using (true);

create policy "Usuarios autenticados escriben operaciones" on operaciones
  for all to authenticated using (true) with check (true);

create policy "Usuarios autenticados leen gastos" on gastos
  for select to authenticated using (true);

create policy "Usuarios autenticados escriben gastos" on gastos
  for all to authenticated using (true) with check (true);

create policy "Usuarios autenticados leen movimientos" on movimientos_cc
  for select to authenticated using (true);

create policy "Usuarios autenticados escriben movimientos" on movimientos_cc
  for all to authenticated using (true) with check (true);

create policy "Usuarios autenticados leen minutas" on minuta_items
  for select to authenticated using (true);

create policy "Usuarios autenticados escriben minutas" on minuta_items
  for all to authenticated using (true) with check (true);

create policy "Usuarios autenticados leen tarifas" on tarifas
  for select to authenticated using (true);

create policy "Usuarios autenticados escriben tarifas" on tarifas
  for all to authenticated using (true) with check (true);

create policy "Admin gestiona usuarios" on usuarios
  for all to authenticated using (true) with check (true);

-- ─── DATOS INICIALES ─────────────────────────────────────────
insert into tarifas (tipo, ruta, tipo_contenedor, valor, naviera, iva_chile) values
  ('maritima', 'China–Iquique', '40HC', 5500, 'Hellmann', 'exento'),
  ('maritima', 'China–Iquique', '40OT', 5500, 'Hellmann', 'exento'),
  ('maritima', 'China–Antofagasta', '40HC', 5800, '', 'exento'),
  ('maritima', 'China–Arica', '40HC', 5200, '', 'exento'),
  ('terrestre', 'Iquique–Jujuy', 'Camión', 1800, '', 'exento'),
  ('terrestre', 'Iquique–Salta', 'Camión', 1900, '', 'exento'),
  ('terrestre', 'Antofagasta–Jujuy', 'Camión', 2200, '', 'exento'),
  ('puerto', 'THC destino (por BL)', '', 500, '', 'exento'),
  ('puerto', 'Handling destino (por cont.)', '', 1200, '', 'exento'),
  ('puerto', 'Container Handling', '', 200, '', 'exento'),
  ('puerto', 'Desconsolidación y gastos', '', 1900, '', 'exento');
