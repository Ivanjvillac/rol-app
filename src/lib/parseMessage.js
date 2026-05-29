/**
 * parseMessage(text, miNombre?, tipoPorDefecto?)
 *
 * Convierte un string de texto híbrido en un array de SEGMENTOS renderizables.
 *
 * ── Sintaxis para ACCIONES inline (dentro de la burbuja): ──
 *   *texto entre asteriscos*  → segmento inline-action (línea propia, ⚡, cursiva, color diferente)
 *
 * ── Atajos de tono (ya existentes, afectan al texto del diálogo): ──
 *   /s/ texto /s/   → susurro   (.text-whisper)
 *   /g/ texto /g/   → grito     (.text-shout)
 *   /p/ texto /p/   → pensamiento (.text-thought)
 *
 * ── Markdown inline (en texto de diálogo): ──
 *   **texto**   → negrita
 *   __texto__   → subrayado
 *   @Nombre     → mención
 *
 * ── Devuelve: ──
 *   Array<{ type: 'dialogo'|'inline-action', segments: Segment[] }>
 *
 * Segment: { text: string, classes: string[] }
 */

// ─── Parser de inline (solo para partes de diálogo) ──────────────────────────

function tokenizeDialogo(text, miNombre) {
  if (!text) return []

  const patterns = [
    { re: /\/s\/([\s\S]*?)\/s\//g,   classes: ['text-whisper'] },
    { re: /\/g\/([\s\S]*?)\/g\//g,   classes: ['text-shout'] },
    { re: /\/p\/([\s\S]*?)\/p\//g,   classes: ['text-thought'] },
    { re: /\*\*([\s\S]*?)\*\*/g,     classes: ['text-bold'] },
    { re: /__([\s\S]*?)__/g,         classes: ['text-underline'] },
    { re: /(@[\w][\w\s]*)/g,         classes: ['text-mention'] },
  ]

  const ranges = []

  for (const { re, classes } of patterns) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(text)) !== null) {
      const start = m.index
      const end = m.index + m[0].length
      const solapo = ranges.some(r => start < r.end && end > r.start)
      if (!solapo) {
        ranges.push({
          start, end,
          inner: m[1] !== undefined ? m[1] : m[0],
          classes,
        })
      }
    }
  }

  ranges.sort((a, b) => a.start - b.start)

  const result = []
  let cursor = 0

  for (const r of ranges) {
    if (r.start > cursor) {
      result.push({ text: text.slice(cursor, r.start), classes: [] })
    }
    let finalClasses = [...r.classes]
    if (r.classes.includes('text-mention') && miNombre) {
      const nombreMencionado = r.inner.slice(1).trim().toLowerCase()
      if (
        miNombre.toLowerCase().includes(nombreMencionado) ||
        nombreMencionado.includes(miNombre.toLowerCase())
      ) {
        finalClasses = [...finalClasses, 'text-mention-own']
      }
    }
    result.push({ text: r.inner, classes: finalClasses })
    cursor = r.end
  }

  if (cursor < text.length) {
    result.push({ text: text.slice(cursor), classes: [] })
  }

  return result.filter(s => s.text.length > 0)
}

// ─── Parser principal ─────────────────────────────────────────────────────────

/**
 * Divide el texto en bloques de diálogo e inline-action.
 * Las acciones inline van entre *asteriscos simples*.
 * Un ** doble NO cuenta como acción (se procesa como negrita en tokenizeDialogo).
 */
export function parseMessage(text, miNombre = '') {
  if (!text) return []

  const blocks = []
  // Detecta *acción* (asterisco simple) pero NO **negrita** (doble asterisco)
  // Usamos un lookahead/lookbehind para que ** no coincida
  const accionRe = /(?<!\*)\*(?!\*)([\s\S]*?)(?<!\*)\*(?!\*)/g
  let lastIndex = 0
  let m

  while ((m = accionRe.exec(text)) !== null) {
    // Texto de diálogo antes de la acción
    if (m.index > lastIndex) {
      const dialogoText = text.slice(lastIndex, m.index)
      if (dialogoText.replace(/\s/g, '').length > 0) {
        blocks.push({ type: 'dialogo', raw: dialogoText })
      }
    }
    // Acción inline (m[1] sin los asteriscos)
    if (m[1].replace(/\s/g, '').length > 0) {
      blocks.push({ type: 'inline-action', raw: m[1] })
    }
    lastIndex = m.index + m[0].length
  }

  // Texto de diálogo restante
  if (lastIndex < text.length) {
    const rest = text.slice(lastIndex)
    if (rest.replace(/\s/g, '').length > 0) {
      blocks.push({ type: 'dialogo', raw: rest })
    }
  }

  // Si no había acciones inline, todo es diálogo
  if (blocks.length === 0) {
    blocks.push({ type: 'dialogo', raw: text })
  }

  // Tokenizar solo los bloques de diálogo (las acciones inline no tienen sub-marcado)
  return blocks.map(block => ({
    type: block.type,
    segments: block.type === 'dialogo'
      ? tokenizeDialogo(block.raw, miNombre)
      : [{ text: block.raw, classes: [] }],
  }))
}
