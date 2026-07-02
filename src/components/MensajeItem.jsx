import { memo } from 'react'
import { parseMessage } from '../lib/parseMessage'

const EMOJIS_RAPIDOS = ['❤️', '😂', '😮', '👏', '🎲', '⚔️', '✨', '💀']

const renderMensaje = (texto, miNombre) => {
  if (!texto) return null
  const partes = texto.split(new RegExp(`(@${miNombre})`, 'gi'))
  return partes.map((p, i) =>
    p.toLowerCase() === `@${miNombre?.toLowerCase()}` ? <mark key={i} className="mencion-propia">{p}</mark> : <span key={i}>{p}</span>
  )
}

const formatHora = (ts) => {
  if (!ts) return ''
  let dStr = String(ts)
  if (!dStr.endsWith('Z') && !dStr.includes('+')) dStr += 'Z'
  const d = new Date(dStr)
  if (isNaN(d)) return `[NaN: ${ts}]`
  return `${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} [${ts}]`
}

function MensajeItem({
  e,
  userId,
  esDueno,
  miNombrePerfil,
  esFijada,
  reacciones,
  isReactionOpen,
  entradaMap,
  // callbacks (stable)
  setEditandoEntrada,
  setConfirmDeleteEntrada,
  toggleFijar,
  setShowReacciones,
  toggleReaccion,
  setRespondiendo,
  setShowVersiones,
  scrollToEntrada,
  inputRef,
}) {
  const refEntrada = e.responder_a_id ? entradaMap.get(e.responder_a_id) : null

  const horaEl = (versiones) => (
    <span className="entrada-hora">
      {formatHora(e.timestamp)}
      {e.editado && (versiones?.length > 0
        ? <span className="entrada-editado" style={{ cursor: 'pointer', textDecoration: 'underline dotted' }}
            onClick={ev => { ev.stopPropagation(); setShowVersiones(e) }}> · editado ({versiones.length})</span>
        : <span className="entrada-editado"> · editado</span>
      )}
    </span>
  )

  const accionesEl = e.user_id === userId && (
    <div className="entrada-acciones">
      {e.contenido && <button onClick={() => setEditandoEntrada({ id: e.id, contenido: e.contenido })}>✏️</button>}
      <button onClick={() => setConfirmDeleteEntrada(e)}>🗑️</button>
    </div>
  )

  return (
    <div id={`entrada-${e.id}`} className={`entrada entrada-${e.tipo}${esFijada ? ' entrada-fijada' : ''}`}>

      {/* Reply reference */}
      {refEntrada && (
        <div style={{ margin: '0.3rem 0.8rem 0', padding: '0.3rem 0.6rem', background: 'rgba(180,140,60,0.08)', borderLeft: '3px solid var(--accent)', borderRadius: '0 4px 4px 0', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--text3)' }}
          onClick={() => scrollToEntrada(refEntrada.id)}>
          {refEntrada.personaje_nombre && <span style={{ color: refEntrada.personaje_color, fontFamily: 'Cinzel, serif', marginRight: '0.3rem' }}>{refEntrada.personaje_nombre}:</span>}
          <span style={{ fontStyle: 'italic' }}>{refEntrada.contenido?.slice(0, 60)}{refEntrada.contenido?.length > 60 ? '…' : ''}</span>
        </div>
      )}

      {/* Narrador */}
      {e.tipo === 'narrador' && (
        <div className="entrada-narrador">
          <span className="entrada-label">📖 Narrador</span>
          {e.contenido && <p className={e.tono && e.tono !== 'normal' ? `entrada-tono-${e.tono}` : ''}>{renderMensaje(e.contenido, miNombrePerfil)}</p>}
          {e.imagen_url && <img src={e.imagen_url} alt="imagen" style={{ maxWidth: '240px', borderRadius: '8px', marginTop: '0.4rem', cursor: 'pointer' }} onClick={() => window.open(e.imagen_url, '_blank', 'noopener')} />}
          {horaEl(e.versiones)}
          {accionesEl}
        </div>
      )}

      {/* Diálogo / Acción */}
      {(e.tipo === 'dialogo' || e.tipo === 'accion') && (() => {
        const chunks = e.contenido ? parseMessage(e.contenido, miNombrePerfil) : []
        const esDialogo = e.tipo === 'dialogo'
        const containerClass = esDialogo
          ? `entrada-dialogo${e.tono && e.tono !== 'normal' ? ` entrada-tono-${e.tono}` : ''}`
          : `entrada-dialogo${e.tono && e.tono !== 'normal' ? ` entrada-tono-${e.tono}` : ''}`

        const avatar = e.personaje?.avatar_url
          ? <img src={e.personaje.avatar_url} alt={e.personaje.nombre} className="entrada-avatar avatar-img" />
          : <div className="entrada-avatar" style={{ background: e.personaje?.color }}>{e.personaje?.iniciales}</div>

        const renderChunks = (accion = false) => (
          <div className="burbuja-bloques">
            {chunks.map((chunk, ci) => {
              const inner = chunk.segments.map((seg, si) => (
                <span key={si} className={seg.classes.join(' ') || undefined}>{seg.text}</span>
              ))
              if (chunk.type === 'inline-action') {
                return (
                  <div key={ci} className="burbuja-inline-accion">
                    <span className="burbuja-inline-accion-icono">⚡</span>
                    <span>{inner}</span>
                  </div>
                )
              }
              return <span key={ci} className={accion ? 'burbuja-accion-texto' : 'burbuja-dialogo-texto'}>{inner}</span>
            })}
          </div>
        )

        return (
          <div className={containerClass}>
            {avatar}
            <div className={`entrada-burbuja${!esDialogo ? ' entrada-burbuja-accion' : ''}`}>
              <span className="entrada-nombre" style={{ color: e.personaje?.color }}>{e.personaje?.nombre}</span>
              {e.contenido && renderChunks(!esDialogo)}
              {e.imagen_url && <img src={e.imagen_url} alt="imagen" onClick={() => window.open(e.imagen_url, '_blank', 'noopener')} />}
              {horaEl(e.versiones)}
              {accionesEl}
            </div>
          </div>
        )
      })()}

      {/* Dado */}
      {e.tipo === 'dado' && (
        <div className="entrada-dado">
          <span className="entrada-dado-icono">🎲</span>
          <div className="entrada-dado-contenido">
            {e.personaje_nombre && <span style={{ color: e.personaje_color, fontFamily: 'Cinzel, serif', fontSize: '0.8rem' }}>{e.personaje_nombre}</span>}
            <span>{e.contenido}</span>
          </div>
          <span className="entrada-hora">{formatHora(e.timestamp)}</span>
        </div>
      )}

      {/* Hover actions */}
      {e.tipo !== 'dado' && (
        <div className="entrada-acciones-hover">
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowReacciones(prev => prev === e.id ? null : e.id)} title="Reaccionar">＋😊</button>
            {isReactionOpen && (
              <div style={{ position: 'absolute', bottom: '100%', right: 0, background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 'var(--radius)', padding: '0.4rem', display: 'flex', flexWrap: 'wrap', gap: '0.3rem', zIndex: 200, boxShadow: 'var(--shadow)', maxWidth: '200px', marginBottom: '0.3rem' }}>
                {EMOJIS_RAPIDOS.map(em => (
                  <button key={em} onClick={() => toggleReaccion(e.id, em)}
                    style={{ background: 'none', border: 'none', fontSize: '1.1rem', cursor: 'pointer', padding: '0.1rem', borderRadius: '4px' }}>{em}</button>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => { setRespondiendo(e); inputRef.current?.focus() }} title="Responder">↩️</button>
          {(e.user_id === userId || esDueno) && (
            <button onClick={() => toggleFijar(e)} title={esFijada ? 'Desfijar' : 'Fijar'}
              style={{ color: esFijada ? 'var(--accent)' : undefined }}>
              {esFijada ? '📌' : '📍'}
            </button>
          )}
        </div>
      )}

      {/* Reactions */}
      {e.tipo !== 'dado' && reacciones.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', padding: '0.1rem 0.8rem 0.3rem' }}>
          {reacciones.map(({ emoji, count, mia }) => (
            <button key={emoji} onClick={() => toggleReaccion(e.id, emoji)}
              style={{ background: mia ? 'rgba(180,140,60,0.15)' : 'var(--bg3)', border: `1px solid ${mia ? 'var(--accent)' : 'var(--border)'}`, borderRadius: '999px', padding: '0.1rem 0.5rem', fontSize: '0.82rem', cursor: 'pointer', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
              {emoji} <span style={{ fontSize: '0.75rem', color: mia ? 'var(--accent)' : 'var(--text3)' }}>{count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default memo(MensajeItem, (prev, next) => {
  return (
    prev.e === next.e &&
    prev.esFijada === next.esFijada &&
    prev.reacciones === next.reacciones &&
    prev.isReactionOpen === next.isReactionOpen &&
    prev.userId === next.userId &&
    prev.esDueno === next.esDueno &&
    prev.entradaMap === next.entradaMap
  )
})
