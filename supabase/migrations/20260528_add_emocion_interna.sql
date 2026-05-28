-- Migración: añadir columna 'emocion_interna' a la tabla 'entradas'
-- Ejecutar en Supabase SQL Editor
ALTER TABLE public.entradas
ADD COLUMN IF NOT EXISTS emocion_interna text DEFAULT NULL;

-- Tabla para emociones personalizadas por usuario
CREATE TABLE IF NOT EXISTS public.emociones_personalizadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Índice para cargar rápido las emociones del usuario
CREATE INDEX IF NOT EXISTS idx_emociones_personalizadas_user_id
  ON public.emociones_personalizadas(user_id);

-- RLS: cada usuario solo ve y gestiona sus propias emociones
ALTER TABLE public.emociones_personalizadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "emociones_select_own"
  ON public.emociones_personalizadas FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "emociones_insert_own"
  ON public.emociones_personalizadas FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "emociones_delete_own"
  ON public.emociones_personalizadas FOR DELETE
  USING (auth.uid() = user_id);
