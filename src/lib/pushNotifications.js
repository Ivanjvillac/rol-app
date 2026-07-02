// src/lib/pushNotifications.js
// Logica de suscripcion a Web Push

import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

// Convierte la clave VAPID base64url a Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

// Suscribir al usuario a Web Push y guardar en Supabase
export async function suscribirPush(userId) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
  if (!VAPID_PUBLIC_KEY) return

  try {
    const reg = await navigator.serviceWorker.ready
    let subscription = await reg.pushManager.getSubscription()

    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
    }

    // Guardar en Supabase (upsert para no duplicar)
    const subJson = subscription.toJSON()
    await supabase.from('push_subscriptions').upsert(
      { user_id: userId, subscription: subJson },
      { onConflict: 'user_id,subscription' }
    )

    console.log('[Push] Suscripcion registrada')
  } catch (err) {
    console.warn('[Push] No se pudo suscribir:', err.message)
  }
}

// Limpiar notificaciones del SW cuando el usuario vuelve a la app
export async function limpiarNotificaciones() {
  if (!('serviceWorker' in navigator)) return
  try {
    const reg = await navigator.serviceWorker.ready
    reg.active?.postMessage({ type: 'CLEAR_NOTIFICATIONS' })
  } catch {}
}
