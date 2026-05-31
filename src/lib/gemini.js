const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY

async function llamarGemini(prompt, maxTokens = 500, temperature = 0.7) {
  if (!GEMINI_API_KEY) return null
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: maxTokens, temperature },
        }),
      }
    )
    const data = await res.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null
  } catch {
    return null
  }
}

export async function generarResumenConIA(sesionNombre, entradas) {
  const transcripcion = entradas
    .slice(-200)
    .map(e => {
      if (e.tipo === 'narrador') return `[NARRADOR]: ${e.contenido}`
      if (e.tipo === 'dialogo') return `${e.personaje_nombre || 'Personaje'}: "${e.contenido}"`
      if (e.tipo === 'accion') return `* ${e.personaje_nombre || 'Personaje'} ${e.contenido} *`
      return null
    })
    .filter(Boolean)
    .join('\n')

  if (!transcripcion) return null

  return llamarGemini(
    `Eres un asistente de juego de rol de mesa. Genera un resumen narrativo conciso de esta sesión de rol llamada "${sesionNombre}". Escríbelo en pasado, estilo literario, máximo 300 palabras. No uses listas, escribe párrafos fluidos.\n\nTranscripción:\n${transcripcion}`,
    500, 0.7
  )
}

export async function generarDescripcionPersonaje(nombre, rol, descripcionActual) {
  const contexto = descripcionActual?.trim() ? ` Contexto adicional: ${descripcionActual}` : ''
  return llamarGemini(
    `Eres un escritor de juego de rol de fantasía. Genera una descripción narrativa y evocadora para un personaje llamado "${nombre}" con el rol de "${rol}".${contexto} Escríbela en tercera persona, estilo literario, máximo 3 frases. Sin introducción, solo la descripción.`,
    150, 0.85
  )
}

export async function generarDescripcionDado(caras, resultado, personajeNombre) {
  const quien = personajeNombre || 'el personaje'
  const nivel = resultado === caras ? 'resultado perfecto y épico, el máximo posible'
    : resultado === 1 ? 'resultado catastrófico, el peor posible'
    : resultado >= Math.ceil(caras * 0.7) ? 'resultado bueno, éxito claro'
    : resultado <= Math.ceil(caras * 0.3) ? 'resultado malo, casi un fallo'
    : 'resultado mediocre, incierto'

  return llamarGemini(
    `Eres el narrador de una partida de rol de fantasía. ${quien} acaba de tirar un dado de ${caras} caras y ha sacado un ${resultado} (${nivel}). Escribe UNA sola frase dramática y evocadora describiendo este momento. Solo la frase, sin comillas ni explicaciones.`,
    80, 0.9
  )
}

export const tieneApiKey = () => !!GEMINI_API_KEY
