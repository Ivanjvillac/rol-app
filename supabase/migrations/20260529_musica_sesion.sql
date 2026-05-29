-- Migración: añadir columna url_musica a la tabla sesiones
-- Ejecutar en Supabase SQL Editor
-- SIN RLS

ALTER TABLE public.sesiones
  ADD COLUMN IF NOT EXISTS url_musica text DEFAULT NULL;
