const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY

async function llamarGroq(prompt, maxTokens = 500, temperature = 0.7) {
  if (!GROQ_API_KEY) return null
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature,
      }),
    })
    const data = await res.json()
    return data.choices?.[0]?.message?.content?.trim() || null
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

  return llamarGroq(
    `Eres un asistente de juego de rol de mesa. Genera un resumen narrativo conciso de esta sesión de rol llamada "${sesionNombre}". Escríbelo en pasado, estilo literario, máximo 300 palabras. No uses listas, escribe párrafos fluidos.\n\nTranscripción:\n${transcripcion}`,
    500, 0.7
  )
}

export async function generarDescripcionPersonaje(nombre, rol, descripcionActual) {
  const contexto = descripcionActual?.trim() ? ` Contexto adicional: ${descripcionActual}` : ''
  return llamarGroq(
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

  return llamarGroq(
    `Eres el narrador de una partida de rol de fantasía. ${quien} acaba de tirar un dado de ${caras} caras y ha sacado un ${resultado} (${nivel}). Escribe UNA sola frase dramática y evocadora describiendo este momento. Solo la frase, sin comillas ni explicaciones.`,
    80, 0.9
  )
}

export async function generarDescripcionEscena(ubicacion, universoNombre) {
  const ctx = universoNombre ? ` en el universo de "${universoNombre}"` : ''
  return llamarGroq(
    `Eres el narrador de una partida de rol de fantasía${ctx}. Expande esta descripción de escena en un párrafo atmosférico y evocador listo para leer a los jugadores: "${ubicacion}". Escribe en segunda persona del plural ("Os encontráis...", "Ante vosotros..."), máximo 4 frases. Solo el texto, sin introducción ni comillas.`,
    200, 0.85
  )
}

export async function generarNPC(universoNombre) {
  const ctx = universoNombre ? ` del universo "${universoNombre}"` : ''
  return llamarGroq(
    `Eres el máster de una partida de rol de fantasía${ctx}. Genera un PNJ (personaje no jugador) con este formato exacto:\nNombre: [nombre]\nRol: [rol o profesión]\nRasgo: [un rasgo de personalidad distintivo]\nGancho: [un detalle narrativo que lo conecta con posibles aventuras]\nSolo el formato indicado, sin texto adicional.`,
    120, 0.9
  )
}

export async function generarMision(universoNombre) {
  const ctx = universoNombre ? ` en el universo de "${universoNombre}"` : ''
  return llamarGroq(
    `Eres el máster de una partida de rol de fantasía${ctx}. Genera una misión con este formato exacto:\nTítulo: [título breve]\nObjetivo: [qué deben hacer]\nObstáculo: [qué lo complica]\nRecompensa: [qué obtienen]\nSolo el formato indicado, sin introducciones ni texto adicional.`,
    150, 0.85
  )
}

export async function generarTrasfondo(nombre, rol, descripcion) {
  const contexto = descripcion?.trim() ? ` Contexto: ${descripcion}` : ''
  return llamarGroq(
    `Eres un escritor de juego de rol de fantasía. Genera el trasfondo de un personaje llamado "${nombre}" con el rol de "${rol}".${contexto} Incluye su origen, una motivación que lo impulsa y un secreto que guarda. Estilo literario en prosa, máximo 4 frases. Sin listas ni introducciones.`,
    200, 0.85
  )
}

export const tieneApiKey = () => !!GROQ_API_KEY
