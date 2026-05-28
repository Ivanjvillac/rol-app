-- Migración: añadir columna 'tono' a la tabla 'entradas'
-- Ejecutar en Supabase SQL Editor
ALTER TABLE public.entradas
ADD COLUMN IF NOT EXISTS tono text DEFAULT 'normal' NOT NULL;
