-- Catálogo de objetos por universo
create table if not exists objetos (
  id uuid primary key default gen_random_uuid(),
  universo_id uuid references universos(id) on delete cascade not null,
  user_id uuid references auth.users(id) not null,
  nombre text not null,
  tipo text default 'objeto',
  descripcion text default '',
  estadisticas text default '',
  created_at timestamptz default now()
);
alter table objetos enable row level security;
create policy "read objetos" on objetos for select using (true);
create policy "insert objetos" on objetos for insert with check (auth.uid() = user_id);
create policy "update objetos" on objetos for update using (auth.uid() = user_id);
create policy "delete objetos" on objetos for delete using (auth.uid() = user_id);

-- Inventario: asignación objeto ↔ personaje
create table if not exists inventario (
  id uuid primary key default gen_random_uuid(),
  personaje_id uuid references personajes(id) on delete cascade not null,
  objeto_id uuid references objetos(id) on delete cascade not null,
  cantidad integer default 1,
  notas text default '',
  equipado boolean default false,
  created_at timestamptz default now()
);
alter table inventario enable row level security;
create policy "read inventario" on inventario for select using (true);
create policy "manage inventario" on inventario for all using (auth.uid() is not null);
