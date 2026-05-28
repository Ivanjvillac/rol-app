-- Migración: tabla 'juramentos' (Vínculos y Juramentos)
-- Ejecutar en Supabase SQL Editor
CREATE TABLE IF NOT EXISTS public.juramentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  personaje_id uuid NOT NULL REFERENCES public.personajes(id) ON DELETE CASCADE,
  descripcion text NOT NULL,
  estado text NOT NULL DEFAULT 'activo'
    CONSTRAINT juramentos_estado_check CHECK (estado IN ('activo', 'cumplido', 'roto')),
  creado_en timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_juramentos_personaje_id
  ON public.juramentos(personaje_id);
