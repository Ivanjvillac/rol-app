/**
 * Wrapper centralizado para queries de Supabase con manejo de errores.
 * Uso: const { data, error } = await supaQuery(() => supabase.from('x').select())
 */
export async function supaQuery(fn) {
  try {
    const { data, error } = await fn()
    if (error) throw error
    return { data, error: null }
  } catch (err) {
    console.error('[Supabase]', err.message)
    return { data: null, error: err.message }
  }
}
