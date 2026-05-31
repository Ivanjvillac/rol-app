import imageCompression from 'browser-image-compression'

const LIMITS = {
  avatar: 0.05,  // 50 KB
  chat:   0.2,   // 200 KB
  npc:    0.2,   // 200 KB
  mapa:   0.5,   // 500 KB
}

const MAX_DIM = {
  avatar: 400,
  mapa:   2048,
}

export async function compressImage(file, type = 'chat') {
  const maxSizeMB = LIMITS[type] ?? LIMITS.chat

  const options = {
    maxSizeMB,
    maxWidthOrHeight: MAX_DIM[type] ?? 1024,
    initialQuality: 0.7,
    useWebWorker: true,
    fileType: 'image/jpeg',
  }

  let result
  try {
    result = await imageCompression(file, options)
  } catch (err) {
    console.warn('[compressImage] Error al comprimir:', err)
    result = file
  }

  // Límite duro: rechazar si sigue siendo demasiado grande tras el fallback
  if (result.size > maxSizeMB * 1024 * 1024 * 1.1) {
    throw new Error(`La imagen es demasiado grande (máx. ${maxSizeMB * 1000} KB). Usa una imagen más pequeña o en formato JPEG.`)
  }

  return result
}
