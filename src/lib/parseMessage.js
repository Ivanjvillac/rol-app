/**
 * parseMessage(text, miNombre?)
 *
 * Convierte un string de texto híbrido en un array de fragmentos renderizables.
 *
 * Sintaxis soportada (nivel superior — separa bloques):
 *   "texto"      → tipo 'dialogo'  (burbuja de conversación)
 *   texto libre  → tipo 'accion'   (narrativa en cursiva)
 *
 * Atajos inline (dentro de cualquier bloque):
 *   /s/ texto /s/   → susurro   (.text-whisper)
 *   /g/ texto /g/   → grito     (.text-shout)
 *   /p/ texto /p/   → pensamiento (.text-thought)
 *
 * Markdown inline (dentro de cualquier bloque):
 *   **texto**   → negrita
 *   __texto__   → subrayado
 *   *texto*     → cursiva
 *   @Nombre     → mención (highlight especial si es el propio usuario)
 *
 * Devuelve:
 *   Array<{ type: 'dialogo'|'accion', segments: Array<Segment> }>
 *
 * Segment: { text: string, classes: string[], bold: bool, italic: bool, underline: bool, mention: bool, ownMention: bool }
 */

// ─── Parser de inline ────────────────────────────────────────────────────────

// Tokeniza un texto en tokens planos y marcados
function tokenizeInline(text, miNombre) {
  if (!text) return []

  // Orden: primero los atajos (más largo primero), luego markdown
  const patterns = [
    { re: /\/s\/([\s\S]*?)\/s\//g,   classes: ['text-whisper'] },
    { re: /\/g\/([\s\S]*?)\/g\//g,   classes: ['text-shout'] },
    { re: /\/p\/([\s\S]*?)\/p\//g,   classes: ['text-thought'] },
    { re: /\*\*([\s\S]*?)\*\*/g,     classes: ['text-bold'] },
    { re: /__([\s\S]*?)__/g,         classes: ['text-underline'] },
    { re: /\*([\s\S]*?)\*/g,         classes: ['text-italic'] },
    { re: /(@[\w][\w\s]*)/g,         classes: ['text-mention'] },
  ]

  // Construimos un array de rangos [start, end, innerText, classesArr]
  const ranges = []

  for (const { re, classes } of patterns) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(text)) !== null) {
      const start = m.index
      const end = m.index + m[0].length
      // No solapar con rangos ya definidos
      const solapo = ranges.some(r => start < r.end && end > r.start)
      if (!solapo) {
        ranges.push({
          start,
          end,
          inner: m[1] !== undefined ? m[1] : m[0],
          classes,
          raw: m[0],
        })
      }
    }
  }

  ranges.sort((a, b) => a.start - b.start)

  const result = []
  let cursor = 0

  for (const r of ranges) {
    // Texto plano antes del token
    if (r.start > cursor) {
      result.push({ text: text.slice(cursor, r.start), classes: [] })
    }
    // Determinar si es mención propia
    let finalClasses = [...r.classes]
    if (r.classes.includes('text-mention') && miNombre) {
      const nombreMencionado = r.inner.slice(1).trim().toLowerCase()
      if (miNombre.toLowerCase().includes(nombreMencionado) || nombreMencionado.includes(miNombre.toLowerCase())) {
        finalClasses = [...finalClasses, 'text-mention-own']
      }
    }
    result.push({ text: r.inner, classes: finalClasses })
    cursor = r.end
  }

  // Texto plano restante
  if (cursor < text.length) {
    result.push({ text: text.slice(cursor), classes: [] })
  }

  return result.filter(s => s.text.length > 0)
}

// ─── Parser principal ─────────────────────────────────────────────────────────

export function parseMessage(text, miNombre = '') {
  if (!text) return []

  const chunks = []
  // Detectar fragmentos de diálogo: texto entre <<...>> o «...»
  const dialogoRe = /(?:<<|«)([\s\S]*?)(?:>>|»)/g
  let lastIndex = 0
  let m

  while ((m = dialogoRe.exec(text)) !== null) {
    // Texto antes del diálogo → acción
    if (m.index > lastIndex) {
      const actionText = text.slice(lastIndex, m.index)
      if (actionText.replace(/\s/g, '').length > 0) {
        chunks.push({ type: 'accion', raw: actionText })
      }
    }
    // Diálogo (m[1] tiene el texto interno, sin los delimitadores)
    chunks.push({ type: 'dialogo', raw: m[1] })
    lastIndex = m.index + m[0].length
  }

  // Texto restante tras el último diálogo → acción
  if (lastIndex < text.length) {
    const rest = text.slice(lastIndex)
    if (rest.replace(/\s/g, '').length > 0) {
      chunks.push({ type: 'accion', raw: rest })
    }
  }

  // Si no había ningún diálogo, todo es acción
  if (chunks.length === 0) {
    chunks.push({ type: 'accion', raw: text })
  }

  // Tokenizar inline cada chunk
  return chunks.map(chunk => ({
    type: chunk.type,
    segments: tokenizeInline(chunk.raw, miNombre),
  }))
}
