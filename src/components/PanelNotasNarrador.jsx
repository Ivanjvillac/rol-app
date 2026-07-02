import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

export default function PanelNotasNarrador({ universoId, userId, onCerrar }) {
  const [notas, setNotas]           = useState([])
  const [notaActual, setNotaActual] = useState(null)
  const [estado, setEstado]         = useState('ok') // 'ok' | 'guardando' | 'error' | 'guardado'
  const [cargando, setCargando]     = useState(true)
  const notaRef = useRef(null) // siempre tiene el valor más reciente sin stale closure

  /* ── Sincronizar ref ── */
  useEffect(() => { notaRef.current = notaActual }, [notaActual])

  /* ── Cargar ── */
  useEffect(() => { cargar() }, [universoId])

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

  /* ── Guardar al cerrar ── */
  useEffect(() => {
    return () => {
      const nota = notaRef.current
      if (nota) {
        supabase.from('notas_narrador')
          .update({ titulo: nota.titulo, contenido: nota.contenido, updated_at: new Date().toISOString() })
          .eq('id', nota.id)
      }
    }
  }, [])

  /* ── Nueva nota ── */
  const nuevaNota = async () => {
    const { data, error } = await supabase
      .from('notas_narrador')
      .insert({ universo_id: universoId, user_id: userId, titulo: 'Nueva nota', contenido: '' })
      .select('id, titulo, contenido, updated_at')
      .single()
    if (error || !data) return
    setNotas(prev => [data, ...prev])
    setNotaActual(data)
    setEstado('ok')
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

  /* ── Guardar manual ── */
  const guardarAhora = async () => {
    const nota = notaRef.current
    if (!nota) return
    setEstado('guardando')
    const { data, error } = await supabase
      .from('notas_narrador')
      .update({ titulo: nota.titulo, contenido: nota.contenido, updated_at: new Date().toISOString() })
      .eq('id', nota.id)
      .select()
    if (error || !data?.length) {
      setEstado('error')
    } else {
      setEstado('guardado')
      setNotas(prev => prev.map(n => n.id === nota.id ? { ...n, titulo: nota.titulo, contenido: nota.contenido } : n))
      setTimeout(() => setEstado('ok'), 2000)
    }
  }

  /* ── Seleccionar nota (guarda la actual antes) ── */
  const seleccionar = async (nota) => {
    if (notaActual && notaActual.id !== nota.id) await guardarAhora()
    setNotaActual(nota)
    setEstado('ok')
  }

  /* ── Editar campos ── */
  const setTitulo    = (titulo)    => { setNotaActual(prev => ({ ...prev, titulo }));    setEstado('ok') }
  const setContenido = (contenido) => { setNotaActual(prev => ({ ...prev, contenido })); setEstado('ok') }

  const fechaCorta = (iso) => {
    if (!iso) return ''
    return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })
  }

  const estadoLabel = { ok: '', guardando: 'Guardando…', guardado: '✓ Guardado', error: '⚠ Error al guardar' }
  const estadoColor = { ok: 'var(--text3)', guardando: 'var(--accent)', guardado: '#2ecc71', error: '#e74c3c' }

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <span style={{ fontSize: '1.2rem' }}>📝</span>
          <h3 style={{ margin: 0, flex: 1, fontSize: '1rem' }}>Notas privadas</h3>
          <span style={{ fontSize: '0.72rem', color: estadoColor[estado], fontStyle: 'italic', minWidth: '80px', textAlign: 'right', transition: 'color 0.2s' }}>
            {estadoLabel[estado]}
          </span>
          <button onClick={onCerrar} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: '1.1rem', cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>

        {/* Body */}
        {cargando ? (
          <p style={{ color: 'var(--text3)', padding: '2rem', textAlign: 'center' }}>Cargando…</p>
        ) : (
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

            {/* Sidebar */}
            <div style={{ width: '200px', flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                <button onClick={nuevaNota} style={{ width: '100%', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius)', padding: '0.35rem 0.5rem', cursor: 'pointer', fontSize: '0.8rem', boxShadow: 'var(--accent-glow)' }}>
                  + Nueva nota
                </button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '0.4rem' }}>
                {notas.length === 0 && (
                  <p style={{ color: 'var(--text3)', fontSize: '0.8rem', textAlign: 'center', padding: '1rem 0.5rem', fontStyle: 'italic' }}>Sin notas todavía.</p>
                )}
                {notas.map(n => (
                  <div key={n.id} onClick={() => seleccionar(n)} style={{
                    padding: '0.45rem 0.5rem', borderRadius: 'var(--radius)', cursor: 'pointer', marginBottom: '0.2rem',
                    background: notaActual?.id === n.id ? 'var(--bg4)' : 'transparent',
                    border: notaActual?.id === n.id ? '1px solid var(--border2)' : '1px solid transparent',
                    display: 'flex', alignItems: 'flex-start', gap: '0.3rem', transition: 'background 0.1s',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {(notaActual?.id === n.id ? notaActual.titulo : n.titulo) || 'Sin título'}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text3)' }}>{fechaCorta(n.updated_at)}</div>
                    </div>
                    <button onClick={e => eliminarNota(n.id, e)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: '0.7rem', padding: '0 0.1rem', flexShrink: 0, opacity: 0.6, lineHeight: 1 }} title="Eliminar">✕</button>
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
                  <button onClick={nuevaNota} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius)', padding: '0.4rem 1rem', cursor: 'pointer', fontSize: '0.85rem' }}>+ Nueva nota</button>
                </div>
              ) : (
                <>
                  {/* Título + guardar */}
                  <div style={{ padding: '0.75rem 1rem 0', flexShrink: 0, display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                    <input
                      value={notaActual.titulo}
                      onChange={e => setTitulo(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && guardarAhora()}
                      placeholder="Título de la nota…"
                      style={{ flex: 1, background: 'none', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--text)', fontSize: '1rem', fontFamily: "'Cinzel', serif", fontWeight: 600, padding: '0 0 0.4rem', outline: 'none', boxSizing: 'border-box' }}
                    />
                    <button onClick={guardarAhora} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius)', padding: '0.25rem 0.7rem', cursor: 'pointer', fontSize: '0.78rem', flexShrink: 0, boxShadow: 'var(--accent-glow)' }}>
                      💾 Guardar
                    </button>
                  </div>
                  {/* Contenido */}
                  <textarea
                    value={notaActual.contenido}
                    onChange={e => setContenido(e.target.value)}
                    onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); guardarAhora() } }}
                    placeholder="Escribe aquí tus notas privadas…&#10;&#10;Solo tú puedes ver esto."
                    spellCheck
                    style={{ flex: 1, resize: 'none', background: 'none', border: 'none', outline: 'none', color: 'var(--text2)', fontSize: '0.9rem', lineHeight: 1.7, padding: '0.75rem 1rem 1rem', fontFamily: 'inherit', boxSizing: 'border-box' }}
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
