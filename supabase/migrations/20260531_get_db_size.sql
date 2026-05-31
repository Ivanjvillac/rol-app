-- RPC para obtener el tamaño real de la base de datos y de las tablas principales.
-- Usado en el panel Admin para mostrar uso real en vez de una estimación.

create or replace function get_db_size()
returns json
language sql
security definer
as $$
  select json_build_object(
    'db_bytes',        pg_database_size(current_database()),
    'entradas_bytes',  pg_total_relation_size('entradas'),
    'sesiones_bytes',  pg_total_relation_size('sesiones'),
    'personajes_bytes',pg_total_relation_size('personajes'),
    'universos_bytes', pg_total_relation_size('universos')
  );
$$;
