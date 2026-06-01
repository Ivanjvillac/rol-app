import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const AUTOSAVE_DELAY = 1200

export default function PanelNotasNarrador({ universoId, userId, onCerrar }) {
  const [notas, setNotas]         = useState([])
  const [notaActual, setNotaActual] = useState(null) // { id, titulo, contenido }
  const [estado, setEstado]       = useState('ok') // 'ok' | 'guardando' | 'error'
  const [cargando, setCargando]   = useState(true)
  const timerRef  = useRef(null)
  const dirtyRef  = useRef(false)

  /* ── Cargar notas ── */
  useEffect(() => {
    cargar()
  }, [universoId])

  const cargar = async () => {
    setCargando(true)
    const { data } = await supabase
      .from('notas_narrador')
      .select('id, titulo, contenido, updated_at')
      .eq('universo_id', universoId)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
    const lista = data || []
    setNotas(lista)
    setNotaActual(lista[0] || null)
    setCargando(false)
  }

  /* ── Autosave ── */
  const programarGuardado = useCallback((nota) => {
    dirtyRef.current = true
    setEstado('guardando')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      const { error } = await supabase
        .from('notas_narrador')
        .update({ titulo: nota.titulo, contenido: nota.contenido, updated_at: new Date().toISOString() })
        .eq('id', nota.id)
      setEstado(error ? 'error' : 'ok')
      dirtyRef.current = false
      if (!error) {
        setNotas(prev => prev.map(n => n.id === nota.id ? { ...n, titulo: nota.titulo, contenido: nota.contenido } : n))
      }
    }, AUTOSAVE_DELAY)
  }, [])

  /* ── Guardar al cerrar si hay cambios pendientes ── */
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (dirtyRef.current && notaActual) {
        supabase.from('notas_narrador')
          .update({ titulo: notaActual.titulo, contenido: notaActual.contenido, updated_at: new Date().toISOString() })
          .eq('id', notaActual.id)
      }
    }
  }, [notaActual])

  /* ── Nueva nota ── */
  const nuevaNota = async () => {
    const { data, error } = await supabase
      .from('notas_narrador')
      .insert({ universo_id: universoId, user_id: userId, titulo: 'Nueva nota', contenido: '' })
      .select('id, titulo, contenido, updated_at')
      .single()
    if (!error && data) {
      setNotas(prev => [data, ...prev])
      setNotaActual(data)
    }
  }

  /* ── Eliminar nota ── */
  const eliminarNota = async (id, e) => {
    e.stopPropagation()
    if (!window.confirm('¿Eliminar esta nota?')) return
    await supabase.from('notas_narrador').delete().eq('id', id)
    setNotas(prev => {
      const nuevas = prev.filter(n => n.id !== id)
      if (notaActual?.id === id) setNotaActual(nuevas[0] || null)
      return nuevas
    })
  }

  /* ── Editar campos ── */
  const setTitulo = (titulo) => {
    const actualizada = { ...notaActual, titulo }
    setNotaActual(actualizada)
    programarGuardado(actualizada)
  }

  const setContenido = (contenido) => {
    const actualizada = { ...notaActual, contenido }
    setNotaActual(actualizada)
    programarGuardado(actualizada)
  }

  /* ── Seleccionar nota ── */
  const seleccionar = (nota) => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    if (dirtyRef.current && notaActual) {
      supabase.from('notas_narrador')
        .update({ titulo: notaActual.titulo, contenido: notaActual.contenido, updated_at: new Date().toISOString() })
        .eq('id', notaActual.id)
      dirtyRef.current = false
    }
    setNotaActual(nota)
    setEstado('ok')
  }

  const fechaCorta = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })
  }

  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '780px', width: '95vw', maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
          padding: 0, overflow: 'hidden',
          background: 'var(--bg2)', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <span style={{ fontSize: '1.2rem' }}>📝</span>
          <h3 style={{ margin: 0, flex: 1, fontSize: '1rem' }}>Notas privadas</h3>
          <span style={{
            fontSize: '0.72rem', color: estado === 'ok' ? 'var(--text3)' : estado === 'error' ? '#e74c3c' : 'var(--accent)',
            fontStyle: 'italic', minWidth: '70px', textAlign: 'right',
          }}>
            {estado === 'guardando' ? 'Guardando…' : estado === 'error' ? 'Error al guardar' : notas.length > 0 ? '✓ Guardado' : ''}
          </span>
          <button onClick={onCerrar}
            style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: '1.1rem', cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>

        {/* Body */}
        {cargando ? (
          <p style={{ color: 'var(--text3)', padding: '2rem', textAlign: 'center' }}>Cargando…</p>
        ) : (
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

            {/* Sidebar — lista de notas */}
            <div style={{
              width: '200px', flexShrink: 0, borderRight: '1px solid var(--border)',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}>
              <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                <button
                  onClick={nuevaNota}
                  style={{
                    width: '100%', background: 'var(--accent)', color: '#fff',
                    border: 'none', borderRadius: 'var(--radius)', padding: '0.35rem 0.5rem',
                    cursor: 'pointer', fontSize: '0.8rem', boxShadow: 'var(--accent-glow)',
                  }}
                >+ Nueva nota</button>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '0.4rem' }}>
                {notas.length === 0 && (
                  <p style={{ color: 'var(--text3)', fontSize: '0.8rem', textAlign: 'center', padding: '1rem 0.5rem', fontStyle: 'italic' }}>
                    Sin notas todavía.
                  </p>
                )}
                {notas.map(n => (
                  <div
                    key={n.id}
                    onClick={() => seleccionar(n)}
                    style={{
                      padding: '0.45rem 0.5rem', borderRadius: 'var(--radius)',
                      cursor: 'pointer', marginBottom: '0.2rem',
                      background: notaActual?.id === n.id ? 'var(--bg4)' : 'transparent',
                      border: notaActual?.id === n.id ? '1px solid var(--border2)' : '1px solid transparent',
                      display: 'flex', alignItems: 'flex-start', gap: '0.3rem',
                      transition: 'background 0.1s',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: '0.82rem', color: 'var(--text)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {(notaActual?.id === n.id ? notaActual.titulo : n.titulo) || 'Sin título'}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text3)' }}>{fechaCorta(n.updated_at)}</div>
                    </div>
                    <button
                      onClick={e => eliminarNota(n.id, e)}
                      style={{
                        background: 'none', border: 'none', color: 'var(--text3)',
                        cursor: 'pointer', fontSize: '0.7rem', padding: '0 0.1rem',
                        flexShrink: 0, opacity: 0.6, lineHeight: 1,
                      }}
                      title="Eliminar"
                    >✕</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Editor */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
              {!notaActual ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: '0.9rem', flexDirection: 'column', gap: '1rem' }}>
                  <span style={{ fontSize: '2rem', opacity: 0.3 }}>📝</span>
                  <span>Crea una nota para empezar</span>
                  <button onClick={nuevaNota}
                    style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius)', padding: '0.4rem 1rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                    + Nueva nota
                  </button>
                </div>
              ) : (
                <>
                  {/* Título */}
                  <div style={{ padding: '0.75rem 1rem 0', flexShrink: 0 }}>
                    <input
                      value={notaActual.titulo}
                      onChange={e => setTitulo(e.target.value)}
                      placeholder="Título de la nota…"
                      style={{
                        width: '100%', background: 'none', border: 'none', borderBottom: '1px solid var(--border)',
                        color: 'var(--text)', fontSize: '1rem', fontFamily: "'Cinzel', serif",
                        fontWeight: 600, padding: '0 0 0.4rem', outline: 'none', boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  {/* Contenido */}
                  <textarea
                    value={notaActual.contenido}
                    onChange={e => setContenido(e.target.value)}
                    placeholder="Escribe aquí tus notas privadas…&#10;&#10;Solo tú puedes ver esto."
                    spellCheck
                    style={{
                      flex: 1, resize: 'none', background: 'none', border: 'none', outline: 'none',
                      color: 'var(--text2)', fontSize: '0.9rem', lineHeight: 1.7,
                      padding: '0.75rem 1rem 1rem', fontFamily: 'inherit', boxSizing: 'border-box',
                    }}
                  />
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
