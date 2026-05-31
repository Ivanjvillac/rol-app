import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { compressImage } from '../lib/compressImage'

/**
 * Hook reutilizable para subir imágenes a Supabase Storage con compresión.
 *
 * @param {string} bucket - Nombre del bucket de Supabase Storage
 * @param {object} options
 * @param {'avatar'|'chat'|'npc'} options.compressionType - Perfil de compresión
 */
export function useImageUpload(bucket, { compressionType = 'chat' } = {}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)

  /**
   * Sube un archivo al bucket.
   * @param {File} file - Archivo a subir
   * @param {string|Function} path - Ruta en el bucket, o función (file) => string
   * @returns {Promise<{url: string|null, error: string|null}>}
   */
  const upload = async (file, path) => {
    setUploading(true)
    setError(null)
    try {
      const compressed = await compressImage(file, compressionType)
      const storagePath = typeof path === 'function' ? path(file) : path
      const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(storagePath, compressed, { upsert: true, contentType: 'image/jpeg' })
      if (upErr) throw upErr
      const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(storagePath)
      return { url: publicUrl, error: null }
    } catch (err) {
      const msg = err.message || 'Error al subir la imagen'
      setError(msg)
      alert(msg)
      return { url: null, error: msg }
    } finally {
      setUploading(false)
    }
  }

  const remove = async (path) => {
    try {
      await supabase.storage.from(bucket).remove([path])
    } catch (err) {
      console.error('[useImageUpload] remove error:', err.message)
    }
  }

  return { upload, remove, uploading, error }
}
