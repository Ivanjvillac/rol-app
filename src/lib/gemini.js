const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY

export async function generarResumenConIA(sesionNombre, entradas) {
  if (!GEMINI_API_KEY) return null

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

  const prompt = `Eres un asistente de juego de rol de mesa. Genera un resumen narrativo conciso de esta sesión de rol llamada "${sesionNombre}". Escríbelo en pasado, estilo literario, máximo 300 palabras. No uses listas, escribe párrafos fluidos.\n\nTranscripción:\n${transcripcion}`

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 500, temperature: 0.7 },
      }),
    }
  )

  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text || null
}
