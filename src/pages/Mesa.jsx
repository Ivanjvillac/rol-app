import { useState, useRef, useEffect } from 'react'
import { useApp } from '../context/AppContext'

export default function Mesa({ navigate, selectedUniverso }) {
  const { getPersonajesDeUniverso, addEntrada, getSesion, cargarSesion} = useApp()
  const [personajeActivo, setPersonajeActivo] = useState(null)
  const [texto, setTexto] = useState('')
  const [modoEntrada, setModoEntrada] = useState('dialogo') // dialogo | accion | narrador
  const [comandoSugerido, setComandoSugerido] = useState(null)
  const historialRef = useRef(null)
  const inputRef = useRef(null)

  if (!selectedUniverso) {
    return (
      <div className="page">
        <div className="empty-state">
          <span>🌍</span>
          <p>Selecciona un universo primero para entrar a la mesa de rol.</p>
          <button className="btn-primary" onClick={() => navigate('universos')}>Ir a Universos</button>
        </div>
      </div>
    )
  }

  const personajes = getPersonajesDeUniverso(selectedUniverso.id)
  const sesion = getSesion(selectedUniverso.id)
useEffect(() => {
  cargarSesion(selectedUniverso.id)
}, [selectedUniverso.id])
  useEffect(() => {
    if (historialRef.current) {
      historialRef.current.scrollTop = historialRef.current.scrollHeight
    }
  }, [sesion])

  // Procesar comandos tipo /juan Hola mundo o /narrador El sol...
  const procesarComando = (input) => {
    if (!input.startsWith('/')) return null
    const partes = input.slice(1).split(' ')
    const cmd = partes[0].toLowerCase()
    const contenido = partes.slice(1).join(' ')

    if (cmd === 'narrador') return { tipo: 'narrador', contenido, personaje: null }
    if (cmd === 'accion' || cmd === 'me') {
      if (personajeActivo) return { tipo: 'accion', contenido, personaje: personajeActivo }
    }

    const pMatch = personajes.find(p => p.nombre.toLowerCase().startsWith(cmd))
    if (pMatch && contenido) return { tipo: 'dialogo', contenido, personaje: pMatch }

    return null
  }

  const handleTextoChange = (e) => {
    const val = e.target.value
    setTexto(val)
    if (val.startsWith('/')) {
      const sugerido = procesarComando(val)
      setComandoSugerido(sugerido)
    } else {
      setComandoSugerido(null)
    }
  }

  const enviar = () => {
    const t = texto.trim()
    if (!t) return

    let entrada = null

    if (t.startsWith('/')) {
      entrada = procesarComando(t)
      if (!entrada) return
    } else {
      if (modoEntrada === 'narrador') {
        entrada = { tipo: 'narrador', contenido: t, personaje: null }
      } else if (!personajeActivo) {
        return
      } else {
        entrada = { tipo: modoEntrada, contenido: t, personaje: personajeActivo }
      }
    }

    addEntrada(selectedUniverso.id, entrada)
    setTexto('')
    setComandoSugerido(null)
    inputRef.current?.focus()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      enviar()
    }
  }

  const formatHora = (ts) => {
    const d = new Date(ts)
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }

  return (
    <div className="mesa">
      {/* Panel lateral */}
      <aside className="mesa-sidebar">
        <div className="sidebar-section">
          <h4>Universo</h4>
          <div className="universo-tag" style={{ borderColor: selectedUniverso.color }}>
            <span style={{ background: selectedUniverso.color }} className="universo-dot" />
            {selectedUniverso.nombre}
          </div>
        </div>

        <div className="sidebar-section">
          <h4>Personajes</h4>
          <div
            className={`personaje-btn narrador-btn ${modoEntrada === 'narrador' && !personajeActivo ? 'activo' : ''}`}
            onClick={() => { setPersonajeActivo(null); setModoEntrada('narrador') }}
          >
            <div className="personaje-avatar-sm narrador-avatar">📖</div>
            <span>Narrador</span>
          </div>
          {personajes.map(p => (
            <div
              key={p.id}
              className={`personaje-btn ${personajeActivo?.id === p.id ? 'activo' : ''}`}
              onClick={() => { setPersonajeActivo(p); setModoEntrada('dialogo') }}
            >
              <div className="personaje-avatar-sm" style={{ background: p.color }}>{p.iniciales}</div>
              <div>
                <span>{p.nombre}</span>
                <small>{p.rol}</small>
              </div>
            </div>
          ))}
          {personajes.length === 0 && (
            <p className="sidebar-empty">No hay personajes en este universo.</p>
          )}
        </div>

        {personajeActivo && (
          <div className="sidebar-section">
            <h4>Modo de entrada</h4>
            <div className="modo-btns">
              <button
                className={modoEntrada === 'dialogo' ? 'modo-btn activo' : 'modo-btn'}
                onClick={() => setModoEntrada('dialogo')}
              >💬 Diálogo</button>
              <button
                className={modoEntrada === 'accion' ? 'modo-btn activo' : 'modo-btn'}
                onClick={() => setModoEntrada('accion')}
              >⚡ Acción</button>
            </div>
          </div>
        )}

        <div className="sidebar-section">
          <h4>Comandos rápidos</h4>
          <div className="comandos-list">
            <code>/narrador texto</code>
            <code>/[nombre] texto</code>
            <code>/me acción</code>
          </div>
        </div>
      </aside>

      {/* Área principal */}
      <main className="mesa-main">
        <div className="mesa-header">
          <h3>Sesión activa — {selectedUniverso.nombre}</h3>
          <span className="sesion-count">{sesion.length} entradas</span>
        </div>

        {/* Historial */}
        <div className="historial" ref={historialRef}>
          {sesion.length === 0 && (
            <div className="historial-empty">
              <p>La sesión está en blanco.</p>
              <p>Selecciona un personaje o usa el modo Narrador para comenzar tu historia.</p>
            </div>
          )}
          {sesion.map(e => (
            <div key={e.id} className={`entrada entrada-${e.tipo}`}>
              {e.tipo === 'narrador' && (
                <div className="entrada-narrador">
                  <span className="entrada-label">📖 Narrador</span>
                  <p>{e.contenido}</p>
                  <span className="entrada-hora">{formatHora(e.timestamp)}</span>
                </div>
              )}
              {e.tipo === 'dialogo' && (
                <div className="entrada-dialogo">
                  <div className="entrada-avatar" style={{ background: e.personaje.color }}>
                    {e.personaje.iniciales}
                  </div>
                  <div className="entrada-burbuja">
                    <span className="entrada-nombre" style={{ color: e.personaje.color }}>{e.personaje.nombre}</span>
                    <p>"{e.contenido}"</p>
                    <span className="entrada-hora">{formatHora(e.timestamp)}</span>
                  </div>
                </div>
              )}
              {e.tipo === 'accion' && (
                <div className="entrada-accion">
                  <div className="entrada-avatar" style={{ background: e.personaje.color }}>
                    {e.personaje.iniciales}
                  </div>
                  <div className="entrada-accion-texto">
                    <span style={{ color: e.personaje.color }}>{e.personaje.nombre}</span>
                    <em> {e.contenido}</em>
                    <span className="entrada-hora">{formatHora(e.timestamp)}</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Sugerencia de comando */}
        {comandoSugerido && (
          <div className="comando-preview">
            {comandoSugerido.tipo === 'narrador' && <span>📖 Narrador: {comandoSugerido.contenido}</span>}
            {comandoSugerido.tipo === 'dialogo' && <span style={{ color: comandoSugerido.personaje?.color }}>💬 {comandoSugerido.personaje?.nombre}: "{comandoSugerido.contenido}"</span>}
            {comandoSugerido.tipo === 'accion' && <span style={{ color: comandoSugerido.personaje?.color }}>⚡ {comandoSugerido.personaje?.nombre} {comandoSugerido.contenido}</span>}
          </div>
        )}

        {/* Barra de escritura */}
        <div className="mesa-input-bar">
          <div className="input-contexto">
            {modoEntrada === 'narrador' || !personajeActivo ? (
              <div className="personaje-avatar-sm narrador-avatar">📖</div>
            ) : (
              <div className="personaje-avatar-sm" style={{ background: personajeActivo.color }}>
                {personajeActivo.iniciales}
              </div>
            )}
            <span className="input-modo">
              {!personajeActivo ? 'Narrador' : `${personajeActivo.nombre} · ${modoEntrada === 'dialogo' ? 'Diálogo' : 'Acción'}`}
            </span>
          </div>
          <div className="input-row">
            <textarea
              ref={inputRef}
              className="mesa-textarea"
              placeholder={
                !personajeActivo && modoEntrada !== 'narrador'
                  ? 'Selecciona un personaje o escribe /narrador...'
                  : modoEntrada === 'narrador'
                  ? 'Narra lo que ocurre en la escena...'
                  : modoEntrada === 'dialogo'
                  ? `¿Qué dice ${personajeActivo?.nombre}?`
                  : `¿Qué hace ${personajeActivo?.nombre}?`
              }
              value={texto}
              onChange={handleTextoChange}
              onKeyDown={handleKeyDown}
              rows={2}
            />
            <button className="btn-enviar" onClick={enviar}>↵</button>
          </div>
          <span className="input-hint">Enter para enviar · Shift+Enter para nueva línea</span>
        </div>
      </main>
    </div>
  )
}
