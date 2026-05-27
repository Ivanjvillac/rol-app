import { useState, useRef, useEffect } from 'react'
import { useApp } from '../context/AppContext'

export default function Mesa({ navigate, selectedUniverso }) {
  const { getPersonajesDeUniverso, addEntrada, getSesion, cargarSesion, suscribirMesa, invitarUsuario, getInvitaciones, esPropietario } = useApp()
  const [personajeActivo, setPersonajeActivo] = useState(null)
  const [texto, setTexto] = useState('')
  const [modoEntrada, setModoEntrada] = useState('dialogo')
  const [comandoSugerido, setComandoSugerido] = useState(null)
  const [showInvitar, setShowInvitar] = useState(false)
  const [emailInvitar, setEmailInvitar] = useState('')
  const [invitaciones, setInvitaciones] = useState([])
  const [msgInvitar, setMsgInvitar] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [showDados, setShowDados] = useState(false)
  const [resultadoDado, setResultadoDado] = useState(null)
  const historialRef = useRef(null)
  const inputRef = useRef(null)

  if (!selectedUniverso) {
    return (
      <div className="page">
        <div className="empty-state">
          <span>🌍</span>
          <p>Selecciona un universo primero.</p>
          <button className="btn-primary" onClick={() => navigate('universos')}>Ir a Universos</button>
        </div>
      </div>
    )
  }

  const personajes = getPersonajesDeUniverso(selectedUniverso.id)
  const sesion = getSesion(selectedUniverso.id)
  const esDueno = esPropietario(selectedUniverso.id)

  useEffect(() => {
    cargarSesion(selectedUniverso.id)
    const unsub = suscribirMesa(selectedUniverso.id, (nueva) => {
      // El tiempo real añade entradas de otros usuarios
    })
    return unsub
  }, [selectedUniverso.id])

  useEffect(() => {
    if (historialRef.current) {
      historialRef.current.scrollTop = historialRef.current.scrollHeight
    }
  }, [sesion])

  const procesarComando = (input) => {
    if (!input.startsWith('/')) return null
    const partes = input.slice(1).split(' ')
    const cmd = partes[0].toLowerCase()
    const contenido = partes.slice(1).join(' ')
    if (cmd === 'narrador') return { tipo: 'narrador', contenido, personaje: null }
    if (cmd === 'me' || cmd === 'accion') {
      if (personajeActivo) return { tipo: 'accion', contenido, personaje: personajeActivo }
    }
    const pMatch = personajes.find(p => p.nombre.toLowerCase().startsWith(cmd))
    if (pMatch && contenido) return { tipo: 'dialogo', contenido, personaje: pMatch }
    return null
  }

  const handleTextoChange = (e) => {
    const val = e.target.value
    setTexto(val)
    setComandoSugerido(val.startsWith('/') ? procesarComando(val) : null)
  }

  const enviar = async () => {
    const t = texto.trim()
    if (!t) return
    let entrada = null
    if (t.startsWith('/')) {
      entrada = procesarComando(t)
      if (!entrada) return
    } else {
      if (modoEntrada === 'narrador') {
        entrada = { tipo: 'narrador', contenido: t, personaje: null }
      } else if (!personajeActivo) return
      else entrada = { tipo: modoEntrada, contenido: t, personaje: personajeActivo }
    }
    await addEntrada(selectedUniverso.id, entrada)
    setTexto('')
    setComandoSugerido(null)
    inputRef.current?.focus()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() }
  }

  const formatHora = (ts) => {
    const d = new Date(ts)
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }

  const exportarSesion = () => {
    const lineas = sesion.map(e => {
      if (e.tipo === 'narrador') return `[NARRADOR] ${e.contenido}`
      if (e.tipo === 'dialogo') return `${e.personaje?.nombre}: "${e.contenido}"`
      if (e.tipo === 'accion') return `* ${e.personaje?.nombre} ${e.contenido} *`
      return e.contenido
    })
    const blob = new Blob([lineas.join('\n\n')], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${selectedUniverso.nombre}-sesion.txt`
    a.click()
  }

  const tirarDado = (caras) => {
    const resultado = Math.floor(Math.random() * caras) + 1
    setResultadoDado({ caras, resultado })
  }

  const abrirInvitar = async () => {
    setShowInvitar(true)
    const invs = await getInvitaciones(selectedUniverso.id)
    setInvitaciones(invs)
  }

  const handleInvitar = async () => {
    if (!emailInvitar.trim()) return
    setEnviando(true)
    setMsgInvitar(null)
    const { data, error } = await invitarUsuario(selectedUniverso.id, emailInvitar.trim())
    if (error) {
      setMsgInvitar({ tipo: 'error', texto: 'Error al crear la invitación.' })
    } else {
      const link = `${window.location.origin}?invitacion=${data.token}`
      setMsgInvitar({ tipo: 'ok', texto: `Invitación creada. Comparte este enlace:`, link })
      setEmailInvitar('')
      const invs = await getInvitaciones(selectedUniverso.id)
      setInvitaciones(invs)
    }
    setEnviando(false)
  }

  return (
    <div className="mesa">
      {/* Sidebar */}
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
              <div><span>{p.nombre}</span><small>{p.rol}</small></div>
            </div>
          ))}
          {personajes.length === 0 && <p className="sidebar-empty">Sin personajes en este universo.</p>}
        </div>

        {personajeActivo && (
          <div className="sidebar-section">
            <h4>Modo</h4>
            <div className="modo-btns">
              <button className={modoEntrada === 'dialogo' ? 'modo-btn activo' : 'modo-btn'} onClick={() => setModoEntrada('dialogo')}>💬 Diálogo</button>
              <button className={modoEntrada === 'accion' ? 'modo-btn activo' : 'modo-btn'} onClick={() => setModoEntrada('accion')}>⚡ Acción</button>
            </div>
          </div>
        )}

        <div className="sidebar-section">
          <h4>Dados</h4>
          <div className="dados-grid">
            {[4, 6, 8, 10, 12, 20].map(c => (
              <button key={c} className="dado-btn" onClick={() => tirarDado(c)}>d{c}</button>
            ))}
          </div>
        {resultadoDado && (
  <div className="dado-resultado">
    <span>🎲 d{resultadoDado.caras}: <strong>{resultadoDado.resultado}</strong></span>
    <button onClick={() => setResultadoDado(null)}>✕</button>
  </div>
)}
        </div>

        <div className="sidebar-section">
          <h4>Comandos</h4>
          <div className="comandos-list">
            <code>/narrador texto</code>
            <code>/[nombre] texto</code>
            <code>/me acción</code>
          </div>
        </div>

        <div className="sidebar-section">
          <h4>Sesión</h4>
          <button className="modo-btn" onClick={exportarSesion}>📄 Exportar TXT</button>
          {esDueno && <button className="modo-btn" style={{ marginTop: '0.4rem' }} onClick={abrirInvitar}>✉️ Invitar jugador</button>}
        </div>
      </aside>

      {/* Main */}
      <main className="mesa-main">
        <div className="mesa-header">
          <h3>Sesión — {selectedUniverso.nombre}</h3>
          <span className="sesion-count">{sesion.length} entradas</span>
        </div>

        <div className="historial" ref={historialRef}>
          {sesion.length === 0 && (
            <div className="historial-empty">
              <p>La sesión está en blanco.</p>
              <p>Selecciona un personaje o usa el modo Narrador para comenzar.</p>
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
                  <div className="entrada-avatar" style={{ background: e.personaje?.color }}>{e.personaje?.iniciales}</div>
                  <div className="entrada-burbuja">
                    <span className="entrada-nombre" style={{ color: e.personaje?.color }}>{e.personaje?.nombre}</span>
                    <p>"{e.contenido}"</p>
                    <span className="entrada-hora">{formatHora(e.timestamp)}</span>
                  </div>
                </div>
              )}
              {e.tipo === 'accion' && (
                <div className="entrada-accion">
                  <div className="entrada-avatar" style={{ background: e.personaje?.color }}>{e.personaje?.iniciales}</div>
                  <div className="entrada-accion-texto">
                    <span style={{ color: e.personaje?.color }}>{e.personaje?.nombre}</span>
                    <em> {e.contenido}</em>
                    <span className="entrada-hora">{formatHora(e.timestamp)}</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {comandoSugerido && (
          <div className="comando-preview">
            {comandoSugerido.tipo === 'narrador' && <span>📖 Narrador: {comandoSugerido.contenido}</span>}
            {comandoSugerido.tipo === 'dialogo' && <span style={{ color: comandoSugerido.personaje?.color }}>💬 {comandoSugerido.personaje?.nombre}: "{comandoSugerido.contenido}"</span>}
            {comandoSugerido.tipo === 'accion' && <span style={{ color: comandoSugerido.personaje?.color }}>⚡ {comandoSugerido.personaje?.nombre} {comandoSugerido.contenido}</span>}
          </div>
        )}

        <div className="mesa-input-bar">
          <div className="input-contexto">
            {modoEntrada === 'narrador' || !personajeActivo
              ? <div className="personaje-avatar-sm narrador-avatar">📖</div>
              : <div className="personaje-avatar-sm" style={{ background: personajeActivo.color }}>{personajeActivo.iniciales}</div>
            }
            <span className="input-modo">
              {!personajeActivo ? 'Narrador' : `${personajeActivo.nombre} · ${modoEntrada === 'dialogo' ? 'Diálogo' : 'Acción'}`}
            </span>
          </div>
          <div className="input-row">
            <textarea
              ref={inputRef}
              className="mesa-textarea"
              placeholder={
                !personajeActivo && modoEntrada !== 'narrador' ? 'Selecciona un personaje o escribe /narrador...'
                : modoEntrada === 'narrador' ? 'Narra lo que ocurre en la escena...'
                : modoEntrada === 'dialogo' ? `¿Qué dice ${personajeActivo?.nombre}?`
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

      {/* Modal invitar */}
      {showInvitar && (
        <div className="modal-overlay" onClick={() => setShowInvitar(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Invitar jugador</h3>
            <p style={{ color: 'var(--text2)', fontSize: '0.95rem', marginBottom: '1.2rem' }}>
              Genera un enlace de invitación para que otra persona se una a <strong>{selectedUniverso.nombre}</strong>.
            </p>
            <div className="form-group">
              <label>Email del jugador (opcional, solo para tu referencia)</label>
              <input
                placeholder="jugador@email.com"
                value={emailInvitar}
                onChange={e => setEmailInvitar(e.target.value)}
              />
            </div>
            {msgInvitar && (
              <div className={msgInvitar.tipo === 'ok' ? 'auth-mensaje' : 'auth-error'} style={{ marginBottom: '1rem' }}>
                {msgInvitar.texto}
                {msgInvitar.link && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <input
                      readOnly
                      value={msgInvitar.link}
                      style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.4rem 0.7rem', borderRadius: '6px', fontSize: '0.8rem' }}
                      onClick={e => e.target.select()}
                    />
                  </div>
                )}
              </div>
            )}
            {invitaciones.length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text3)', fontFamily: 'Cinzel, serif', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Invitaciones anteriores</label>
                {invitaciones.map(inv => (
                  <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text2)', padding: '0.3rem 0', borderBottom: '1px solid var(--border)' }}>
                    <span>{inv.email || 'Sin email'}</span>
                    <span style={{ color: inv.estado === 'aceptada' ? '#2ecc71' : 'var(--text3)' }}>{inv.estado}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setShowInvitar(false)}>Cerrar</button>
              <button className="btn-primary" onClick={handleInvitar} disabled={enviando}>
                {enviando ? 'Generando...' : 'Generar enlace'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
