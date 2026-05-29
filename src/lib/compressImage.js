import imageCompression from 'browser-image-compression'

/**
 * Comprime una imagen antes de subirla a Supabase Storage.
 *
 * @param {File} file  - El archivo original seleccionado por el usuario.
 * @param {'avatar'|'chat'|'npc'} type - El contexto de uso de la imagen.
 * @returns {Promise<File>} - Archivo comprimido listo para subir.
 */
export async function compressImage(file, type = 'chat') {
  let options

  if (type === 'avatar') {
    options = {
      maxSizeMB: 0.05,        // 50 KB
      maxWidthOrHeight: 400,
      initialQuality: 0.7,
      useWebWorker: true,
      fileType: 'image/jpeg',
    }
  } else {
    // 'chat' | 'npc' | cualquier otro
    options = {
      maxSizeMB: 0.2,         // 200 KB
      maxWidthOrHeight: 1024,
      initialQuality: 0.7,
      useWebWorker: true,
      fileType: 'image/jpeg',
    }
  }

  try {
    const compressed = await imageCompression(file, options)
    return compressed
  } catch (err) {
    console.warn('[compressImage] Error al comprimir, se usará el archivo original:', err)
    return file
  }
}
