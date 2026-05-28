-- Migración: añadir columna 'nivel_tension' a la tabla 'sesiones'
-- Ejecutar en Supabase SQL Editor
ALTER TABLE public.sesiones
ADD COLUMN IF NOT EXISTS nivel_tension integer DEFAULT 1 NOT NULL
  CONSTRAINT sesiones_nivel_tension_check CHECK (nivel_tension >= 1 AND nivel_tension <= 10);
