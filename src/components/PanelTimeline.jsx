import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const TIPO_EMOJI = {
  narrador: '📖',
  dialogo:  '💬',
  accion:   '⚡',
}

const MESES_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

function formatFechaES(isoString) {
  if (!isoString) return ''
  const d = new Date(isoString)
  return `${d.getDate()} de ${MESES_ES[d.getMonth()]} ${d.getFullYear()}`
}

export default function PanelTimeline({ universoId, sesiones, onCerrar }) {
  const [entradasFijadas, setEntradasFijadas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [expandidos, setExpandidos] = useState({})

  // ── Load pinned entries ───────────────────────────────────────────────────
  useEffect(() => {
    if (!sesiones || sesiones.length === 0) {
      setCargando(false)
      return
    }
    const ids = sesiones.map(s => s.id)
    setCargando(true)
    supabase
      .from('entradas')
      .select('id, contenido, tipo, personaje_nombre, personaje_color, created_at, sesion_id, imagen_url')
      .in('sesion_id', ids)
      .eq('fijada', true)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        setEntradasFijadas(data || [])
        setCargando(false)
      })
  }, [sesiones])

  // ── Group pinned entries by sesion_id ─────────────────────────────────────
  const entradesPorSesion = {}
  for (const e of entradasFijadas) {
    if (!entradesPorSesion[e.sesion_id]) entradesPorSesion[e.sesion_id] = []
    entradesPorSesion[e.sesion_id].push(e)
  }

  // Sort sessions chronologically (oldest first)
  const sesionesSorted = [...(sesiones || [])].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  )

  const toggleExpand = (sesionId) => {
    setExpandidos(prev => ({ ...prev, [sesionId]: !prev[sesionId] }))
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  const lineStyle = {
    position: 'absolute',
    left: 19,
    top: 0,
    bottom: 0,
    width: 2,
    background: 'var(--border)',
    zIndex: 0,
  }

  const dotStyle = (hasPinned) => ({
    position: 'absolute',
    left: 10,
    top: 14,
    width: 18,
    height: 18,
    borderRadius: '50%',
    background: hasPinned ? 'var(--accent)' : 'var(--bg4)',
    border: `2px solid ${hasPinned ? 'var(--accent)' : 'var(--border2)'}`,
    boxShadow: hasPinned ? '0 0 8px rgba(201,168,76,0.35)' : 'none',
    zIndex: 1,
    flexShrink: 0,
  })

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div
        className="modal modal-timeline"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '600px',
          width: '100%',
          padding: '0',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '88vh',
        }}
      >
        {/* Header */}
        <div
          className="modal-header"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}
        >
          <h3 style={{ margin: 0 }}>📅 Línea de tiempo</h3>
          <button
            onClick={onCerrar}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text2)',
              fontSize: '1.2rem',
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >✕</button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 1.5rem 1.5rem 1.25rem' }}>
          {cargando ? (
            <p style={{ color: 'var(--text3)', textAlign: 'center', padding: '2rem 0' }}>
              Cargando...
            </p>
          ) : sesionesSorted.length === 0 ? (
            <div className="empty-state" style={{ padding: '2rem 0' }}>
              <p>No hay sesiones en este universo.</p>
            </div>
          ) : (
            <div style={{ position: 'relative', paddingLeft: '36px' }}>
              {/* Vertical line */}
              <div style={lineStyle} />

              {sesionesSorted.map((sesion, idx) => {
                const pinned = entradesPorSesion[sesion.id] || []
                const hasPinned = pinned.length > 0
                const isLast = idx === sesionesSorted.length - 1
                const expanded = !!expandidos[sesion.id]

                return (
                  <div
                    key={sesion.id}
                    style={{
                      position: 'relative',
                      marginBottom: isLast ? 0 : '1.5rem',
                    }}
                  >
                    {/* Dot */}
                    <div style={dotStyle(hasPinned)} />

                    {/* Session card */}
                    <div style={{ marginLeft: '8px' }}>
                      {/* Date */}
                      <div style={{
                        fontSize: '0.72rem',
                        color: 'var(--text3)',
                        marginBottom: '0.2rem',
                        letterSpacing: '0.03em',
                        paddingTop: '0.1rem',
                      }}>
                        {formatFechaES(sesion.created_at)}
                      </div>

                      {/* Session name row */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '0.5rem',
                          cursor: hasPinned ? 'pointer' : 'default',
                        }}
                        onClick={() => hasPinned && toggleExpand(sesion.id)}
                      >
                        <span style={{
                          fontFamily: "'Cinzel', serif",
                          fontSize: '0.95rem',
                          color: hasPinned ? 'var(--text)' : 'var(--text2)',
                          letterSpacing: '0.03em',
                        }}>
                          {sesion.nombre}
                        </span>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                          {hasPinned && (
                            <span style={{
                              fontSize: '0.72rem',
                              background: 'var(--accent-glow)',
                              color: 'var(--accent)',
                              border: '1px solid var(--accent2)',
                              borderRadius: '12px',
                              padding: '0.1rem 0.5rem',
                              fontFamily: "'Cinzel', serif",
                              letterSpacing: '0.03em',
                            }}>
                              {pinned.length} 📌
                            </span>
                          )}
                          {hasPinned && (
                            <span style={{
                              color: 'var(--text3)',
                              fontSize: '0.75rem',
                              transition: 'transform 0.15s',
                              display: 'inline-block',
                              transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
                            }}>
                              ▶
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Pinned entries */}
                      {expanded && hasPinned && (
                        <div style={{
                          marginTop: '0.6rem',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.5rem',
                        }}>
                          {pinned.map(entrada => {
                            const emoji = TIPO_EMOJI[entrada.tipo] || '📝'
                            const texto = entrada.contenido
                              ? entrada.contenido.slice(0, 150) + (entrada.contenido.length > 150 ? '…' : '')
                              : ''

                            return (
                              <div
                                key={entrada.id}
                                style={{
                                  background: 'var(--bg)',
                                  border: '1px solid var(--border)',
                                  borderRadius: 'var(--radius)',
                                  padding: '0.6rem 0.8rem',
                                  display: 'flex',
                                  gap: '0.6rem',
                                  alignItems: 'flex-start',
                                }}
                              >
                                {/* Type emoji */}
                                <span style={{ fontSize: '0.9rem', flexShrink: 0, marginTop: '1px' }}>
                                  {emoji}
                                </span>

                                {/* Content */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  {entrada.personaje_nombre && (
                                    <span style={{
                                      fontFamily: "'Cinzel', serif",
                                      fontSize: '0.75rem',
                                      fontWeight: 600,
                                      color: entrada.personaje_color || 'var(--accent)',
                                      letterSpacing: '0.03em',
                                      display: 'block',
                                      marginBottom: '0.2rem',
                                    }}>
                                      {entrada.personaje_nombre}
                                    </span>
                                  )}
                                  <p style={{
                                    fontSize: '0.88rem',
                                    color: 'var(--text2)',
                                    lineHeight: 1.5,
                                    margin: 0,
                                    wordBreak: 'break-word',
                                  }}>
                                    {texto}
                                  </p>

                                  {/* Thumbnail */}
                                  {entrada.imagen_url && (
                                    <img
                                      src={entrada.imagen_url}
                                      alt=""
                                      loading="lazy"
                                      style={{
                                        marginTop: '0.4rem',
                                        width: 64,
                                        height: 64,
                                        objectFit: 'cover',
                                        borderRadius: 'var(--radius)',
                                        border: '1px solid var(--border)',
                                        display: 'block',
                                      }}
                                    />
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
