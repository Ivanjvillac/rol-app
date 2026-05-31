-- ============================================================
-- Condiciones de estado por personaje
-- ============================================================
CREATE TABLE IF NOT EXISTS condiciones_personaje (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  personaje_id uuid REFERENCES personajes(id) ON DELETE CASCADE,
  universo_id  uuid REFERENCES universos(id)  ON DELETE CASCADE,
  nombre      text NOT NULL,
  emoji       text NOT NULL DEFAULT '⚠️',
  color       text NOT NULL DEFAULT '#e74c3c',
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE condiciones_personaje ENABLE ROW LEVEL SECURITY;
CREATE POLICY "condiciones_access" ON condiciones_personaje FOR ALL USING (
  universo_id IN (
    SELECT id FROM universos WHERE user_id = auth.uid()
    UNION
    SELECT universo_id FROM miembros WHERE user_id = auth.uid()
  )
);
ALTER PUBLICATION supabase_realtime ADD TABLE condiciones_personaje;

-- ============================================================
-- Mapas del mundo
-- ============================================================
CREATE TABLE IF NOT EXISTS mapas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  universo_id uuid REFERENCES universos(id) ON DELETE CASCADE,
  nombre      text NOT NULL DEFAULT 'Mapa',
  imagen_url  text,
  user_id     uuid REFERENCES auth.users(id),
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE mapas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mapas_access" ON mapas FOR ALL USING (
  universo_id IN (
    SELECT id FROM universos WHERE user_id = auth.uid()
    UNION
    SELECT universo_id FROM miembros WHERE user_id = auth.uid()
  )
);

CREATE TABLE IF NOT EXISTS mapa_pins (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mapa_id     uuid REFERENCES mapas(id) ON DELETE CASCADE,
  nombre      text NOT NULL,
  descripcion text,
  x_pct       float NOT NULL,
  y_pct       float NOT NULL,
  color       text DEFAULT '#e67e22',
  visible     boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE mapa_pins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pins_access" ON mapa_pins FOR ALL USING (
  mapa_id IN (
    SELECT id FROM mapas WHERE universo_id IN (
      SELECT id FROM universos WHERE user_id = auth.uid()
      UNION
      SELECT universo_id FROM miembros WHERE user_id = auth.uid()
    )
  )
);

-- ============================================================
-- Bestiario
-- ============================================================
CREATE TABLE IF NOT EXISTS bestias (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  universo_id uuid REFERENCES universos(id) ON DELETE CASCADE,
  nombre      text NOT NULL,
  tipo        text DEFAULT 'bestia',
  descripcion text,
  stats       text,
  habilidades text,
  imagen_url  text,
  user_id     uuid REFERENCES auth.users(id),
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE bestias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bestias_access" ON bestias FOR ALL USING (
  universo_id IN (
    SELECT id FROM universos WHERE user_id = auth.uid()
    UNION
    SELECT universo_id FROM miembros WHERE user_id = auth.uid()
  )
);

-- ============================================================
-- Calendario in-game (una fila por universo)
-- ============================================================
CREATE TABLE IF NOT EXISTS calendario_universo (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  universo_id uuid UNIQUE REFERENCES universos(id) ON DELETE CASCADE,
  fecha_texto text DEFAULT '',
  updated_at  timestamptz DEFAULT now()
);
ALTER TABLE calendario_universo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "calendario_access" ON calendario_universo FOR ALL USING (
  universo_id IN (
    SELECT id FROM universos WHERE user_id = auth.uid()
    UNION
    SELECT universo_id FROM miembros WHERE user_id = auth.uid()
  )
);

-- ============================================================
-- Tarjeta de escena activa (columnas en sesiones)
-- ============================================================
ALTER TABLE sesiones
  ADD COLUMN IF NOT EXISTS escena_titulo      text,
  ADD COLUMN IF NOT EXISTS escena_descripcion text,
  ADD COLUMN IF NOT EXISTS escena_imagen_url  text;
