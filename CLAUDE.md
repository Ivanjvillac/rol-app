# Tinta y Dados — CLAUDE.md

## Qué es este proyecto

App web de **rol narrativo escrito** (no combate, no dados frecuentes). Los jugadores escriben en un historial de chat compartido en tiempo real. El narrador (máster/dueño) controla la sesión.

Stack: **React 19.2.6 + Vite + Supabase** (PostgreSQL + Realtime + Storage). Desplegado en Vercel. PWA instalable.

---

## Estructura de ficheros clave

```
src/
  pages/
    Mesa.jsx          ← componente principal (~3100 líneas). Toda la lógica de juego.
    Home.jsx          ← landing
    Personajes.jsx    ← gestión de personajes fuera de mesa
    Universos.jsx     ← gestión de universos
    Perfil.jsx        ← perfil de usuario
    Auth.jsx          ← login/registro
    Admin.jsx         ← panel superadmin

  components/
    MensajeItem.jsx         ← render memoizado de un mensaje del historial
    FichaPersonaje.jsx      ← ficha de personaje (4 tabs: stats, equipo, relaciones, estado)
    SelectorImagenSticker.jsx ← selector de imagen/sticker para el chat
    PanelMapa.jsx           ← mapa del mundo con pins arrastrables + avatares de personajes
    PanelMapaRelaciones.jsx ← grafo SVG de relaciones entre personajes (force-directed)
    PanelBestiario.jsx      ← catálogo de criaturas
    PanelGaleria.jsx        ← galería de imágenes del universo
    PanelInvestigacion.jsx  ← panel de investigación/pistas
    PanelMisiones.jsx       ← tablero de misiones
    PanelObjetos.jsx        ← inventario compartido
    PanelDadoEvento.jsx     ← tablas de eventos aleatorios
    PanelNotasNarrador.jsx  ← bloc de notas privado del narrador (solo él lo ve)
    PanelTimeline.jsx       ← línea de tiempo de sesiones
    PanelJuramentos.jsx     ← juramentos entre personajes

  features/
    mesa/hooks/
      useMesaTimer.js     ← temporizador de sesión
      useMesaPresence.js  ← presencia realtime (quién está conectado)
      useMesaMusic.js     ← música de fondo (URL externa)

  lib/
    supabase.js        ← cliente Supabase singleton
    compressImage.js   ← compresión de imágenes antes de subir
    gemini.js          ← integración con Groq/Gemini para IA (opcional)
    parseMessage.js    ← parser de formato de mensajes (menciones, cursivas, etc.)
    supabaseHelpers.js ← helpers de queries

  hooks/
    useImageUpload.js  ← hook genérico para subir imágenes a Storage

  App.jsx             ← router simple (page state), navbar desktop + bottom nav móvil
  App.css             ← todos los estilos globales (CSS variables, componentes)
```

---

## Variables de entorno requeridas

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_SUPERADMIN_EMAIL   ← email que puede acceder al panel Admin
VITE_GROQ_API_KEY       ← opcional, para funciones de IA (resumen sesión, generación NPC, etc.)
```

---

## Supabase

### Tablas principales

| Tabla | Descripción |
|-------|-------------|
| `universos` | Universos de juego (uno por campaña) |
| `sesiones` | Sesiones dentro de un universo. Tiene `escena_titulo`, `escena_descripcion`, `escena_imagen_url` |
| `entradas` | Mensajes del historial. Tipos: `narrador`, `dialogo`, `accion`, `dado` |
| `personajes` | Personajes y NPCs (`es_npc: bool`) |
| `atributos` / `atributos_historial` | Stats de la ficha de personaje |
| `condiciones_personaje` | Estados de condición activos por personaje |
| `personaje_relaciones` | Relaciones entre personajes (tipo: aliado/enemigo/amor/etc.) |
| `reacciones` | Emojis de reacción en mensajes |
| `mensajes_privados` | Chat privado entre jugadores |
| `menciones` | Notificaciones de @menciones |
| `misiones` | Tablero de misiones |
| `objetos` / `inventario` | Inventario compartido |
| `tablas_evento` | Tablas de dados de evento |
| `notas_narrador` | Notas privadas del narrador (RLS: solo el owner las ve) |
| `mapas` / `mapa_pins` | Mapa del mundo y sus pins. `mapa_pins` tiene `avatar_url` para pins de personaje |
| `bestias` | Bestiario |
| `calendario_universo` | Fecha actual del calendario in-game |
| `stickers` / `sticker_packs` | Stickers del usuario |
| `miembros` | Miembros de un universo |
| `sesion_miembros` | Presencia en sesión |
| `invitaciones` | Invitaciones a universo por email |
| `perfiles` | Perfil público de usuario (nombre, avatar) |

### Storage buckets (todos públicos)

- `avatares` — avatares de usuario
- `perfiles` — imágenes de perfil
- `imagenes-chat` — imágenes enviadas al chat
- `stickers` — stickers del usuario
- `personaje-imagenes` — imágenes de personaje/NPC
- `mapas` — imágenes de mapas del mundo

### Migraciones

**No hay Supabase CLI.** Las migraciones son ficheros SQL en `supabase/migrations/` que el usuario ejecuta manualmente en el SQL Editor de Supabase.

---

## Patrones importantes en Mesa.jsx

### Roles
- `esDueno` — el usuario es el narrador/propietario del universo
- `esMio` — el personaje activo pertenece al usuario actual

### Realtime
- Suscripciones via `postgres_changes` para entradas, personajes, condiciones, etc.
- Broadcast channels para escena activa y calendario in-game

### Estado del sidebar
Cada sección del sidebar persiste su estado abierto/cerrado en localStorage con prefijo `sidebar_`:
```js
const lsSec = (key, def) => { try { const v = localStorage.getItem(`sidebar_${key}`); return v === null ? def : v === '1' } catch { return def } }
```

### Paneles lazy
Todos los `Panel*` se importan con `React.lazy` + `<Suspense fallback={null}>`. Se cargan solo al abrirlos por primera vez. **No usar import estático para Panel*.**

### Virtual scroll del historial
El historial usa `@tanstack/react-virtual` (`useVirtualizer`). Para hacer scroll a un mensaje específico usar `scrollToEntrada(id)` (no `document.getElementById`). Para scroll al final usar `virtualizer.scrollToIndex(sesion.length - 1, ...)`.

### MensajeItem
`src/components/MensajeItem.jsx` — componente memoizado con comparación custom. Re-renderiza solo si cambia `e`, `esFijada`, `reacciones`, `isReactionOpen`, `userId` o `esDueno`.

---

## CSS

Todas las variables en `src/App.css`:
```css
var(--bg) var(--bg2) var(--bg3) var(--bg4)
var(--text) var(--text2) var(--text3)
var(--border) var(--border2)
var(--accent) var(--accent-glow)
var(--radius) var(--radius-lg)
var(--shadow)
```

Fuente principal decorativa: `'Cinzel', serif` (títulos, nombres de personaje).

---

## Compresión de imágenes

`src/lib/compressImage.js` — perfiles disponibles:

| Tipo | Límite | Dimensión máx |
|------|--------|---------------|
| `avatar` | 50 KB | 400px |
| `sticker` | 50 KB | 512px |
| `chat` | 150 KB | 1024px |
| `npc` | 150 KB | 1024px |
| `mapa` | 500 KB | 2048px |

---

## Navegación

Router manual con estado `page` en `App.jsx`. No usa react-router. Páginas: `home`, `universos`, `personajes`, `mesa`, `perfil`, `admin`.

---

## PWA

`vite.config.js` — `VitePWA` con `skipWaiting: true`, `clientsClaim: true`, `cleanupOutdatedCaches: true`. Ante problemas de caché, hacer Ctrl+Shift+R o forzar desde DevTools → Application → Service Workers.

---

## Comandos

```bash
npm run dev     # desarrollo
npm run build   # build producción (genera dist/ + SW)
npm run preview # preview del build
```

## Git

- Rama de desarrollo activa: `claude/zealous-mendel-aUuTx`
- Producción (Vercel): `main`
- Siempre hacer push a `main` para que Vercel despliegue
