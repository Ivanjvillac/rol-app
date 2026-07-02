// src/sw.js — Service Worker personalizado para Tinta y Dados
// Vite PWA (injectManifest) inyectara el precache de Workbox aqui
import { precacheAndRoute } from 'workbox-precaching'

// Workbox precache (Vite PWA inyecta self.__WB_MANIFEST aqui)
precacheAndRoute(self.__WB_MANIFEST)

// -- PUSH NOTIFICATIONS --

self.addEventListener('push', (event) => {
  if (!event.data) return

  let data = {}
  try {
    data = event.data.json()
  } catch {
    data = { title: 'Tinta y Dados', body: event.data.text() }
  }

  const title = data.title || 'Tinta y Dados'
  const options = {
    body: data.body || 'Tienes un nuevo mensaje',
    icon: '/icon-192.png',
    badge: '/favicon-32.png',
    tag: data.tag || 'tyd-notif',
    renotify: true,
    data: { url: data.url || '/' },
    silent: false,
    vibrate: [200, 100, 200],
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus()
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url)
      }
    })
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'CLEAR_NOTIFICATIONS') {
    self.registration.getNotifications().then((notifications) => {
      notifications.forEach((n) => n.close())
    })
  }
})
