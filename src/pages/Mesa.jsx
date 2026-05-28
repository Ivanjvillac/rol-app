import { useState, useRef, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import SelectorImagenSticker from '../components/SelectorImagenSticker'
import FichaPersonaje from '../components/FichaPersonaje'
import { jsPDF } from 'jspdf'
const renderTexto = (texto) => {
  if (!texto) return null
  const partes = texto.split(/(\*\*[^*]+\*\*|__[^_]+__|_[^_]+_|\*[^*]+\*)/g)
  return partes.map((parte, i) => {
    if (parte.startsWith('**') && parte.endsWith('**'))
      return <strong key={i}>{parte.slice(2, -2)}</strong>
    if (parte.startsWith('__') && parte.endsWith('__'))
      return <u key={i}>{parte.slice(2, -2)}</u>
    if ((parte.startsWith('_') && parte.endsWith('_')) || (parte.startsWith('*') && parte.endsWith('*')))
      return <em key={i}>{parte.slice(1, -1)}</em>
    return parte
  })
}

function ChatPrivado({ universo, personajes, userId, onCerrar }) {
  const [conversaciones, setConversaciones] = useState({})
  const [destinatario, setDestinatario] = useState(null)
  const [miPersonaje, setMiPersonaje] = useState(null)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [showSelector, setShowSelector] = useState(false)
  const historialRef = useRef(null)

  const misPersonajes = personajes.filter(p => p.user_id === userId)
  const personajesOtros = personajes.filter(p => p.user_id !== userId)

  useEffect(() => {
    if (!miPersonaje || !destinatario) return
    cargarMensajes()
    const channel = supabase
      .channel(`privado-${universo.id}-${miPersonaje.id}-${destinatario.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes_privados', filter: `universo_id=eq.${universo.id}` }, (payload) => {
        const m = payload.new
        if ((m.remitente_id === miPersonaje.id && m.destinatario_id === destinatario.id) || (m.remitente_id === destinatario.id && m.destinatario_id === miPersonaje.id)) {
          setConversaciones(prev => {
            const key = claveConv(miPersonaje.id, destinatario.id)
            const actual = prev[key] || []
            if (actual.some(x => x.id === m.id)) return prev
            return { ...prev, [key]: [...actual, m] }
          })
          if (m.destinatario_user_id === userId) marcarLeido(m.id)
        }
      }).subscribe()
    return () => supabase.removeChannel(channel)
  }, [miPersonaje?.id, destinatario?.id])

  useEffect(() => {
    if (!historialRef.current) return
    const key = miPersonaje && destinatario ? claveConv(miPersonaje.id, destinatario.id) : null
    const msgs = key ? (conversaciones[key] || []) : []
    // Buscar primer mensaje no leído dirigido a mí
    const primerNoLeido = msgs.find(m => m.destinatario_user_id === userId && !m.leido)
    if (primerNoLeido) {
      const el = document.getElementById(`msg-${primerNoLeido.id}`)
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); return }
    }
    // Si no hay no leídos, ir al final
    historialRef.current.scrollTop = historialRef.current.scrollHeight
  }, [conversaciones, destinatario])

  const claveConv = (a, b) => [a, b].sort().join('-')
  const cargarMensajes = async () => {
    if (!miPersonaje || !destinatario) return
    const { data } = await supabase.from('mensajes_privados').select('*').eq('universo_id', universo.id)
      .or(`and(remitente_id.eq.${miPersonaje.id},destinatario_id.eq.${destinatario.id}),and(remitente_id.eq.${destinatario.id},destinatario_id.eq.${miPersonaje.id})`).order('created_at')
    const key = claveConv(miPersonaje.id, destinatario.id)
    setConversaciones(prev => ({ ...prev, [key]: data || [] }))
    const noLeidos = (data || []).filter(m => m.destinatario_user_id === userId && !m.leido)
    for (const m of noLeidos) marcarLeido(m.id)
  }
  const marcarLeido = async (id) => await supabase.from('mensajes_privados').update({ leido: true }).eq('id', id)
  const enviar = async () => {
    if (!texto.trim() || !miPersonaje || !destinatario) return
    setEnviando(true)
    await supabase.from('mensajes_privados').insert({ universo_id: universo.id, remitente_id: miPersonaje.id, destinatario_id: destinatario.id, remitente_user_id: userId, destinatario_user_id: destinatario.user_id, contenido: texto.trim() })
    setTexto(''); setEnviando(false)
  }
  const enviarImagenPrivado = async (url) => {
    if (!miPersonaje || !destinatario) return
    await supabase.from('mensajes_privados').insert({ universo_id: universo.id, remitente_id: miPersonaje.id, destinatario_id: destinatario.id, remitente_user_id: userId, destinatario_user_id: destinatario.user_id, contenido: '', imagen_url: url })
  }
  const handleKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }
  const formatHora = (ts) => { const d = new Date(ts); return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}` }
  const mensajesActuales = destinatario && miPersonaje ? (conversaciones[claveConv(miPersonaje.id, destinatario.id)] || []) : []

  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div className="modal modal-chat" onClick={e => e.stopPropagation()}>
        <div className="chat-header"><h3>💬 Mensajes privados</h3><button className="detalle-cerrar" onClick={onCerrar}>✕</button></div>
        {misPersonajes.length === 0 ? <p style={{ color: 'var(--text3)', fontStyle: 'italic', padding: '1rem' }}>Necesitas un personaje en este universo.</p> : (
          <div className="chat-layout">
            <div className="chat-sidebar">
              <div className="form-group" style={{ padding: '0.8rem', borderBottom: '1px solid var(--border)' }}>
                <label>Escribes como</label>
                <select value={miPersonaje?.id || ''} onChange={e => { const p = misPersonajes.find(x => x.id === e.target.value); setMiPersonaje(p); setDestinatario(null) }}>
                  <option value="">Selecciona tu personaje...</option>
                  {misPersonajes.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
              {miPersonaje && <div className="chat-lista">
                <p style={{ fontSize: '0.75rem', color: 'var(--text3)', padding: '0.6rem 0.8rem', fontFamily: 'Cinzel, serif', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Personajes</p>
                {personajesOtros.length === 0 && <p style={{ color: 'var(--text3)', fontSize: '0.9rem', padding: '0 0.8rem', fontStyle: 'italic' }}>No hay otros personajes.</p>}
                {personajesOtros.map(p => (
                  <div key={p.id} className={`chat-contacto ${destinatario?.id === p.id ? 'activo' : ''}`} onClick={() => setDestinatario(p)}>
                    {p.avatar_url ? <img src={p.avatar_url} alt={p.nombre} className="personaje-avatar-sm avatar-img" /> : <div className="personaje-avatar-sm" style={{ background: p.color }}>{p.iniciales}</div>}
                    <div><span>{p.nombre}</span><small>{p.rol}</small></div>
                  </div>
                ))}
              </div>}
            </div>
            <div className="chat-main">
              {!miPersonaje || !destinatario ? <div className="chat-vacio"><span>🔒</span><p>Selecciona tu personaje y con quién quieres hablar.</p></div> : <>
                <div className="chat-conv-header">
                  {destinatario.avatar_url ? <img src={destinatario.avatar_url} alt={destinatario.nombre} className="personaje-avatar-sm avatar-img" /> : <div className="personaje-avatar-sm" style={{ background: destinatario.color }}>{destinatario.iniciales}</div>}
                  <div><span style={{ fontFamily: 'Cinzel, serif', color: destinatario.color }}>{destinatario.nombre}</span><small style={{ color: 'var(--text3)', display: 'block' }}>{destinatario.rol}</small></div>
                </div>
                <div className="chat-historial" ref={historialRef}>
                  {mensajesActuales.length === 0 && <div className="chat-vacio"><span>🔐</span><p>Inicio de la conversación privada.</p></div>}
                  {mensajesActuales.map((m, idx) => {
                    const esMio = m.remitente_id === miPersonaje.id
                    const autor = esMio ? miPersonaje : destinatario
                    const esNoLeido = m.destinatario_user_id === userId && !m.leido
                    const esPrimerNoLeido = esNoLeido && !mensajesActuales.slice(0, idx).some(x => x.destinatario_user_id === userId && !x.leido)
                    return (
                      <div key={m.id} id={`msg-${m.id}`}>
                        {esPrimerNoLeido && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.5rem 0', opacity: 0.6 }}>
                            <div style={{ flex: 1, height: '1px', background: 'var(--accent)' }} />
                            <span style={{ fontSize: '0.7rem', color: 'var(--accent)', fontFamily: 'Cinzel, serif', whiteSpace: 'nowrap' }}>nuevos mensajes</span>
                            <div style={{ flex: 1, height: '1px', background: 'var(--accent)' }} />
                          </div>
                        )}
                      <div className={`chat-mensaje ${esMio ? 'propio' : 'ajeno'}`}>
                        {!esMio && (autor.avatar_url ? <img src={autor.avatar_url} alt={autor.nombre} className="personaje-avatar-sm avatar-img" /> : <div className="personaje-avatar-sm" style={{ background: autor.color }}>{autor.iniciales}</div>)}
                        <div className="chat-burbuja" style={{ borderColor: autor.color }}>
                          {m.contenido && <p>{m.contenido}</p>}
                          {m.imagen_url && <img src={m.imagen_url} alt="imagen" style={{ maxWidth: '180px', borderRadius: '8px', cursor: 'pointer' }} onClick={() => window.open(m.imagen_url, '_blank')} />}
                          <span className="entrada-hora">{formatHora(m.created_at)}</span>
                        </div>
                        {esMio && (autor.avatar_url ? <img src={autor.avatar_url} alt={autor.nombre} className="personaje-avatar-sm avatar-img" /> : <div className="personaje-avatar-sm" style={{ background: autor.color }}>{autor.iniciales}</div>)}
                      </div>
                      </div>
                    )
                  })}
                </div>
                <div className="chat-input" style={{ position: 'relative' }}>
                  {showSelector && <SelectorImagenSticker userId={userId} onEnviarImagen={enviarImagenPrivado} onEnviarSticker={enviarImagenPrivado} onCerrar={() => setShowSelector(false)} />}
                  <button className="btn-adjunto" onClick={() => setShowSelector(!showSelector)}>📎</button>
                  <textarea placeholder={`Escribe como ${miPersonaje.nombre}...`} value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={handleKey} rows={2} className="mesa-textarea" />
                  <button className="btn-enviar" onClick={enviar} disabled={enviando}>↵</button>
                </div>
              </>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Mesa({ navigate, selectedUniverso }) {
  const { getPersonajesDeUniverso, addEntrada, getSesion, cargarSesion, suscribirMesa, invitarUsuario, getInvitaciones, esPropietario, userId, cargarListaSesiones, crearSesion, eliminarSesion, listaSesiones, editarEntrada, borrarEntrada } = useApp()

  const [personajeActivo, setPersonajeActivo] = useState(null)
  const [texto, setTexto] = useState('')
  const [modoEntrada, setModoEntrada] = useState('dialogo')
  const [comandoSugerido, setComandoSugerido] = useState(null)
  const [showInvitar, setShowInvitar] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [showSelector, setShowSelector] = useState(false)
  const [emailInvitar, setEmailInvitar] = useState('')
  const [invitaciones, setInvitaciones] = useState([])
  const [miembrosUniverso, setMiembrosUniverso] = useState([])
  const [msgInvitar, setMsgInvitar] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [resultadoDado, setResultadoDado] = useState(null)
  const [notificaciones, setNotificaciones] = useState([])
  const [tieneNoLeidos, setTieneNoLeidos] = useState(false)
  const [sidebarAbierto, setSidebarAbierto] = useState(false)
  const [sesionActiva, setSesionActiva] = useState(null)
  const [showNuevaSesion, setShowNuevaSesion] = useState(false)
  const [nombreNuevaSesion, setNombreNuevaSesion] = useState('')
  const [confirmDeleteSesion, setConfirmDeleteSesion] = useState(null)
  const [sesionPrivada, setSesionPrivada] = useState(false)
  const [miembrosPrivados, setMiembrosPrivados] = useState([])
  const [gestionarSesion, setGestionarSesion] = useState(null)
  const [miembrosSesion, setMiembrosSesion] = useState([])
  const [loadingGestion, setLoadingGestion] = useState(false)
  const [usuariosUniverso, setUsuariosUniverso] = useState([])
  const [padreSesion, setPadreSesion] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [busquedaGlobal, setBusquedaGlobal] = useState('')
  const [resultadosGlobales, setResultadosGlobales] = useState([])
  const [buscandoGlobal, setBuscandoGlobal] = useState(false)
  const [showBusquedaGlobal, setShowBusquedaGlobal] = useState(false)
  const [editandoEntrada, setEditandoEntrada] = useState(null)
  const [confirmDeleteEntrada, setConfirmDeleteEntrada] = useState(null)
  const [fichaPersonaje, setFichaPersonaje] = useState(null)
  const [usuariosConectados, setUsuariosConectados] = useState([])
  const [otrosEscribiendo, setOtrosEscribiendo] = useState([])
  const [mostrarIrAbajo, setMostrarIrAbajo] = useState(false)
  const [showMusica, setShowMusica] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [showDados, setShowDados] = useState(false)
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [youtubeEmbed, setYoutubeEmbed] = useState(null)
  const [reacciones, setReacciones] = useState({})
  const [showReacciones, setShowReacciones] = useState(null)
  const [notifsSesion, setNotifsSesion] = useState({})
  const [fijadas, setFijadas] = useState({}) // { entrada_id: true/false } estado local
  const historialRef = useRef(null)
  const inputRef = useRef(null)
  const timeoutEscribiendoRef = useRef(null)
  const canalEscribiendoRef = useRef(null)
  const canalPresenciaRef = useRef(null)

  const [sesionesConMiembros, setSesionesConMiembros] = useState([])
  const [seccionSesiones, setSeccionSesiones] = useState(true)
  const [seccionPersonajes, setSeccionPersonajes] = useState(true)
  const [seccionConectados, setSeccionConectados] = useState(true)
  const [seccionOpciones, setSeccionOpciones] = useState(false)

  const personajesTodos = selectedUniverso ? getPersonajesDeUniverso(selectedUniverso.id) : []
  const personajes = personajesTodos.filter(p => !p.oculto || p.user_id === userId)
  const sesionCompleta = sesionActiva ? getSesion(sesionActiva.id) : []
  const sesion = busqueda.trim()
    ? sesionCompleta.filter(e =>
        e.contenido?.toLowerCase().includes(busqueda.toLowerCase()) ||
        e.personaje_nombre?.toLowerCase().includes(busqueda.toLowerCase())
      )
    : sesionCompleta
  const esDueno = selectedUniverso ? esPropietario(selectedUniverso.id) : false
  const sesiones = sesionesConMiembros.filter(s =>
    !s.es_privada || s.user_id === userId || (s.miembros || []).includes(userId)
  )

  useEffect(() => {
    if (!selectedUniverso) return
    const cargarSesionesConMiembros = async () => {
      const { data: sesData } = await supabase
        .from('sesiones')
        .select('*, sesion_miembros(user_id)')
        .eq('universo_id', selectedUniverso.id)
        .order('created_at')
      const sesFormateadas = (sesData || []).map(s => ({
        ...s,
        miembros: (s.sesion_miembros || []).map(m => m.user_id)
      }))
      setSesionesConMiembros(sesFormateadas)
    }
    cargarSesionesConMiembros()
  }, [selectedUniverso?.id])

  useEffect(() => {
    if (!showNuevaSesion || !selectedUniverso) return
    const cargar = async () => {
      const { data } = await supabase.from('miembros').select('user_id').eq('universo_id', selectedUniverso.id)
      const ids = (data || []).map(m => m.user_id)
      if (ids.length === 0) { setUsuariosUniverso([]); return }
      const { data: perfs } = await supabase.from('perfiles').select('id, nombre').in('id', ids)
      setUsuariosUniverso(perfs || [])
    }
    cargar()
  }, [showNuevaSesion])

  useEffect(() => {
    if (!sesionActiva) return
    cargarSesion(sesionActiva.id)
    const unsub = suscribirMesa(selectedUniverso.id, sesionActiva.id, () => {})
    return unsub
  }, [sesionActiva?.id])

  // Actualizar presencia cuando cambia el personaje activo
  useEffect(() => {
    if (!canalPresenciaRef.current || !canalPresenciaRef.current._nombre) return
    canalPresenciaRef.current.track({
      user_id: userId,
      nombre: canalPresenciaRef.current._nombre,
      personaje: personajeActivo ? { nombre: personajeActivo.nombre, color: personajeActivo.color, iniciales: personajeActivo.iniciales, avatar_url: personajeActivo.avatar_url } : null,
    })
  }, [personajeActivo?.id])

  useEffect(() => {
    if (!selectedUniverso || !userId) return
    const channel = supabase
      .channel(`notif-${selectedUniverso.id}-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes_privados', filter: `universo_id=eq.${selectedUniverso.id}` }, (payload) => {
        const m = payload.new
        if (m.destinatario_user_id === userId) {
          const remitente = personajes.find(p => p.id === m.remitente_id)
          const notif = { id: m.id, texto: `${remitente?.nombre || 'Alguien'} te ha enviado un mensaje privado`, color: remitente?.color || 'var(--accent)' }
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3')
          audio.volume = 0.3
          audio.play().catch(() => {})
          setNotificaciones(prev => [...prev, notif])
          setTieneNoLeidos(true)
          setTimeout(() => setNotificaciones(prev => prev.filter(n => n.id !== notif.id)), 5000)
        }
      }).subscribe()
    return () => supabase.removeChannel(channel)
  }, [selectedUniverso?.id, userId])

  useEffect(() => {
    if (!selectedUniverso || !userId) return
    const canal = supabase.channel(`presencia-${selectedUniverso.id}`, {
      config: { presence: { key: userId } }
    })
    canal
      .on('presence', { event: 'sync' }, () => {
        const estado = canal.presenceState()
        // Cada key del estado es un userId, su valor es un array de tracks
        // Tomamos solo el último track de cada usuario para evitar duplicados
        const conectados = Object.values(estado).map(tracks => {
          const ultimo = tracks[tracks.length - 1]
          return {
            userId: ultimo.user_id,
            nombre: ultimo.nombre || ultimo.user_id?.slice(0, 8),
            personaje: ultimo.personaje || null,
          }
        })
        setUsuariosConectados(conectados)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          const perfil = await supabase.from('perfiles').select('nombre').eq('id', userId).single()
          const nombrePerfil = perfil.data?.nombre || 'Jugador'
          canalPresenciaRef.current = canal
          canalPresenciaRef.current._nombre = nombrePerfil
          await canal.track({
            user_id: userId,
            nombre: nombrePerfil,
            personaje: personajeActivo ? { nombre: personajeActivo.nombre, color: personajeActivo.color, iniciales: personajeActivo.iniciales, avatar_url: personajeActivo.avatar_url } : null,
          })
        }
      })
    return () => {
      supabase.removeChannel(canal)
      canalPresenciaRef.current = null
    }
  }, [selectedUniverso?.id, userId])

  useEffect(() => {
    if (!selectedUniverso || !userId || !sesionActiva) return
    const canal = supabase.channel(`escribiendo-${selectedUniverso.id}-${sesionActiva.id}`)
      .on('broadcast', { event: 'escribiendo' }, ({ payload }) => {
        if (payload.userId === userId) return
        setOtrosEscribiendo(prev => {
          const sin = prev.filter(x => x.userId !== payload.userId)
          if (payload.activo) return [...sin, { userId: payload.userId, nombre: payload.nombre }]
          return sin
        })
      })
      .subscribe()
    canalEscribiendoRef.current = canal
    return () => {
      supabase.removeChannel(canal)
      canalEscribiendoRef.current = null
    }
  }, [selectedUniverso?.id, sesionActiva?.id, userId])

  useEffect(() => {
    if (historialRef.current) historialRef.current.scrollTop = historialRef.current.scrollHeight
  }, [sesionActiva])

  const handleScroll = () => {
    if (!historialRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = historialRef.current
    setMostrarIrAbajo(scrollHeight - scrollTop - clientHeight > 200)
  }

  const irAbajo = () => {
    if (historialRef.current) historialRef.current.scrollTop = historialRef.current.scrollHeight
  }

  const emitirEscribiendo = async (activo) => {
    if (!selectedUniverso || !canalEscribiendoRef.current) return
    const perfil = await supabase.from('perfiles').select('nombre').eq('id', userId).single()
    canalEscribiendoRef.current.send({
      type: 'broadcast',
      event: 'escribiendo',
      payload: { userId, nombre: perfil.data?.nombre || 'Alguien', activo }
    })
  }

  if (!selectedUniverso) {
    return (
      <div className="page">
        <div className="empty-state">
          <span>🌍</span><p>Selecciona un universo primero.</p>
          <button className="btn-primary" onClick={() => navigate('universos')}>Ir a Universos</button>
        </div>
      </div>
    )
  }

  const procesarComando = (input) => {
    if (!input.startsWith('/')) return null
    const partes = input.slice(1).split(' ')
    const cmd = partes[0].toLowerCase()
    const contenido = partes.slice(1).join(' ')
    if (cmd === 'narrador') return { tipo: 'narrador', contenido, personaje: null }
    if (cmd === 'me' || cmd === 'accion') { if (personajeActivo) return { tipo: 'accion', contenido, personaje: personajeActivo } }
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
    if (!sesionActiva) return
    const t = texto.trim()
    if (!t) return
    let entrada = null
    if (t.startsWith('/')) { entrada = procesarComando(t); if (!entrada) return }
    else if (modoEntrada === 'narrador' || !personajeActivo) entrada = { tipo: 'narrador', contenido: t, personaje: null }
    else entrada = { tipo: modoEntrada, contenido: t, personaje: personajeActivo }
    await addEntrada(selectedUniverso.id, entrada, sesionActiva.id)
    setTexto(''); setComandoSugerido(null)
    emitirEscribiendo(false)
    inputRef.current?.focus()
  }

  const enviarImagen = async (url) => {
    if (!sesionActiva) return
    const tipo = modoEntrada === 'narrador' || !personajeActivo ? 'narrador' : modoEntrada
    await addEntrada(selectedUniverso.id, { tipo, contenido: '', imagen_url: url, personaje: personajeActivo }, sesionActiva.id)
  }

  const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }

  const insertarFormato = (tipo) => {
    const ta = inputRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const seleccion = texto.slice(start, end)
    let antes, despues
    if (tipo === 'negrita') { antes = '**'; despues = '**' }
    else if (tipo === 'cursiva') { antes = '*'; despues = '*' }
    else if (tipo === 'subrayado') { antes = '__'; despues = '__' }
    const nuevoTexto = texto.slice(0, start) + antes + seleccion + despues + texto.slice(end)
    setTexto(nuevoTexto)
    setTimeout(() => {
      ta.focus()
      const pos = seleccion ? start + antes.length + seleccion.length + despues.length : start + antes.length
      ta.setSelectionRange(pos, pos)
    }, 0)
  }

  const handleEditarEntrada = async () => {
    if (!editandoEntrada) return
    await editarEntrada(editandoEntrada.id, editandoEntrada.contenido)
    setEditandoEntrada(null)
  }

  const formatHora = (ts) => { const d = new Date(ts); return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}` }

  const exportarSesion = () => {
    if (!sesionActiva) return
    const lineas = sesion.map(e => {
      if (e.tipo === 'narrador') return `[NARRADOR] ${e.contenido}`
      if (e.tipo === 'dialogo') return `${e.personaje?.nombre}: "${e.contenido}"`
      if (e.tipo === 'accion') return `* ${e.personaje?.nombre} ${e.contenido} *`
      return e.contenido
    })
    const blob = new Blob([lineas.join('\n\n')], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${selectedUniverso.nombre}-${sesionActiva.nombre}.txt`
    a.click()
  }

  const exportarPDF = () => {
    if (!sesionActiva || !sesionCompleta.length) return

    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const W = doc.internal.pageSize.getWidth()
    const H = doc.internal.pageSize.getHeight()
    const margen = 20
    const anchoTexto = W - margen * 2
    let y = margen

    const hexToRgb = (hex) => {
      if (!hex || !hex.startsWith('#')) return [180, 140, 60]
      const r = parseInt(hex.slice(1, 3), 16)
      const g = parseInt(hex.slice(3, 5), 16)
      const b = parseInt(hex.slice(5, 7), 16)
      return [r, g, b]
    }

    const saltarPaginaSiNecesario = (altoNecesario = 10) => {
      if (y + altoNecesario > H - margen) {
        doc.addPage()
        y = margen
        dibujarPie()
      }
    }

    const escribirTextoMultilinea = (texto, x, maxAncho, lineHeight) => {
      const lineas = doc.splitTextToSize(texto, maxAncho)
      lineas.forEach(linea => {
        saltarPaginaSiNecesario(lineHeight)
        doc.text(linea, x, y)
        y += lineHeight
      })
      return lineas.length
    }

    const dibujarPie = () => {
      const pageCount = doc.internal.getNumberOfPages()
      doc.setFontSize(8)
      doc.setTextColor(120, 100, 60)
      doc.text(`${selectedUniverso.nombre} · ${sesionActiva.nombre}`, margen, H - 10)
      doc.text(`Pág. ${pageCount}`, W - margen, H - 10, { align: 'right' })
    }

    // ── CABECERA ──
    // Fondo dorado oscuro
    doc.setFillColor(30, 22, 8)
    doc.rect(0, 0, W, 42, 'F')

    // Línea decorativa superior
    doc.setDrawColor(180, 140, 60)
    doc.setLineWidth(0.5)
    doc.line(margen, 8, W - margen, 8)

    // Título universo
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(20)
    doc.setTextColor(200, 160, 70)
    doc.text(selectedUniverso.nombre.toUpperCase(), W / 2, 20, { align: 'center' })

    // Nombre sesión
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(180, 160, 120)
    doc.text(sesionActiva.nombre, W / 2, 29, { align: 'center' })

    // Fecha y stats
    const fecha = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
    const numEntradas = sesionCompleta.filter(e => e.tipo !== 'dado').length
    doc.setFontSize(8)
    doc.setTextColor(140, 120, 80)
    doc.text(`${fecha}  ·  ${numEntradas} entradas`, W / 2, 36, { align: 'center' })

    // Línea decorativa inferior cabecera
    doc.setDrawColor(180, 140, 60)
    doc.line(margen, 40, W - margen, 40)

    y = 52

    // ── ENTRADAS ──
    sesionCompleta.forEach((e, idx) => {
      if (e.tipo === 'dado') return // omitir dados en el PDF

      saltarPaginaSiNecesario(16)

      if (e.tipo === 'narrador') {
        // Línea separadora suave antes del narrador (excepto el primero)
        if (idx > 0) {
          doc.setDrawColor(60, 50, 30)
          doc.setLineWidth(0.2)
          doc.line(margen + 10, y - 2, W - margen - 10, y - 2)
          y += 2
        }
        // Label narrador
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7)
        doc.setTextColor(140, 110, 50)
        doc.text('— NARRADOR —', margen, y)
        y += 5

        // Texto en cursiva
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(10.5)
        doc.setTextColor(200, 185, 155)
        escribirTextoMultilinea(e.contenido || '', margen, anchoTexto, 6)
        y += 4

      } else if (e.tipo === 'dialogo') {
        saltarPaginaSiNecesario(18)
        // Nombre personaje en su color
        const [r, g, b] = hexToRgb(e.personaje?.color)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        doc.setTextColor(r, g, b)
        doc.text((e.personaje?.nombre || 'Desconocido').toUpperCase(), margen, y)
        y += 5

        // Texto diálogo entre comillas
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10.5)
        doc.setTextColor(220, 210, 190)
        escribirTextoMultilinea(`"${e.contenido || ''}"`, margen + 3, anchoTexto - 3, 6)
        y += 3

      } else if (e.tipo === 'accion') {
        saltarPaginaSiNecesario(14)
        // Nombre personaje
        const [r, g, b] = hexToRgb(e.personaje?.color)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8.5)
        doc.setTextColor(r, g, b)
        const nombreAccion = e.personaje?.nombre || 'Desconocido'

        // Línea de acción: "⚡ NOMBRE  contenido"
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(10)
        doc.setTextColor(180, 165, 130)
        const textoAccion = `· ${nombreAccion} ${e.contenido || ''}`
        escribirTextoMultilinea(textoAccion, margen, anchoTexto, 6)
        y += 3
      }
    })

    // Pie de la última página
    dibujarPie()

    // ── PIE FINAL ──
    saltarPaginaSiNecesario(20)
    y += 6
    doc.setDrawColor(180, 140, 60)
    doc.setLineWidth(0.4)
    doc.line(margen, y, W - margen, y)
    y += 6
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8)
    doc.setTextColor(120, 100, 60)
    doc.text('Generado con Tinta y Dados', W / 2, y, { align: 'center' })

    doc.save(`${selectedUniverso.nombre} - ${sesionActiva.nombre}.pdf`)
  }

  const tirarDado = async (caras) => {
    const resultado = Math.floor(Math.random() * caras) + 1
    setResultadoDado({ caras, resultado })
    if (sesionActiva) {
      await addEntrada(selectedUniverso.id, {
        tipo: 'dado',
        contenido: `🎲 ${personajeActivo?.nombre || 'Narrador'} tiró d${caras} → ${resultado}`,
        personaje: personajeActivo
      }, sesionActiva.id)
    }
  }

  const abrirInvitar = async () => {
    setShowInvitar(true)
    setMsgInvitar(null)
    setEmailInvitar('')
    const invs = await getInvitaciones(selectedUniverso.id)
    setInvitaciones(invs)
    // Cargar miembros actuales del universo
    const { data: mbs } = await supabase.from('miembros').select('user_id').eq('universo_id', selectedUniverso.id)
    const ids = (mbs || []).map(m => m.user_id)
    if (ids.length > 0) {
      const { data: perfs } = await supabase.from('perfiles').select('id, nombre').in('id', ids)
      setMiembrosUniverso(perfs || [])
    } else {
      setMiembrosUniverso([])
    }
  }

  const handleAñadirDirecto = async () => {
    const email = emailInvitar.trim()
    if (!email) return
    setEnviando(true); setMsgInvitar(null)

    // Buscar usuario por email via RPC (accede a auth.users)
    const { data: usuarioData, error } = await supabase
      .rpc('buscar_usuario_por_email', { email_input: email })

    const perfil = usuarioData?.[0] || null

    if (error || !perfil) {
      // No existe en la app — generar enlace de invitación normal
      const { data, error: errInv } = await invitarUsuario(selectedUniverso.id, email)
      if (errInv) {
        setMsgInvitar({ tipo: 'error', texto: 'Error al crear la invitación.' })
      } else {
        const link = `${window.location.origin}?invitacion=${data.token}`
        setMsgInvitar({ tipo: 'ok', texto: 'Este email no está registrado todavía. Enlace generado para que se una:', link })
        setEmailInvitar('')
        const invs = await getInvitaciones(selectedUniverso.id)
        setInvitaciones(invs)
      }
    } else {
      // Usuario existe — añadir directamente como miembro
      const yaMiembro = miembrosUniverso.some(m => m.id === perfil.id) || perfil.id === userId
      if (yaMiembro) {
        setMsgInvitar({ tipo: 'error', texto: `${perfil.nombre || email} ya es miembro de este universo.` })
      } else {
        const { error: errMb } = await supabase
          .from('miembros')
          .insert({ universo_id: selectedUniverso.id, user_id: perfil.id })
        if (errMb) {
          setMsgInvitar({ tipo: 'error', texto: 'Error al añadir el jugador.' })
        } else {
          setMiembrosUniverso(prev => [...prev, { id: perfil.id, nombre: perfil.nombre || email }])
          setMsgInvitar({ tipo: 'ok', texto: `✓ ${perfil.nombre || email} añadido al universo correctamente.` })
          setEmailInvitar('')
        }
      }
    }
    setEnviando(false)
  }

  const handleInvitar = async () => {
    setEnviando(true); setMsgInvitar(null)
    const { data, error } = await invitarUsuario(selectedUniverso.id, emailInvitar.trim())
    if (error) { setMsgInvitar({ tipo: 'error', texto: 'Error al crear la invitación.' }) }
    else {
      const link = `${window.location.origin}?invitacion=${data.token}`
      setMsgInvitar({ tipo: 'ok', texto: 'Invitación creada. Comparte este enlace:', link })
      setEmailInvitar('')
      const invs = await getInvitaciones(selectedUniverso.id)
      setInvitaciones(invs)
    }
    setEnviando(false)
  }

  const cargarYoutube = () => {
    const url = youtubeUrl.trim()
    if (!url) return
    let videoId = null
    let listId = null
    try {
      const u = new URL(url)
      if (u.hostname.includes('youtube.com')) { videoId = u.searchParams.get('v'); listId = u.searchParams.get('list') }
      if (u.hostname === 'youtu.be') { videoId = u.pathname.slice(1); listId = u.searchParams.get('list') }
      if (!videoId && u.searchParams.get('list')) listId = u.searchParams.get('list')
    } catch {}
    let embedUrl = null
    if (listId && videoId) embedUrl = `https://www.youtube.com/embed/${videoId}?list=${listId}&autoplay=1&loop=1`
    else if (listId) embedUrl = `https://www.youtube.com/embed/videoseries?list=${listId}&autoplay=1&loop=1`
    else if (videoId) embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&loop=1&playlist=${videoId}`
    if (embedUrl) { setYoutubeEmbed(embedUrl); setShowMusica(false) }
  }

  const handleCrearSesion = async () => {
    if (!nombreNuevaSesion.trim()) return
    const { data } = await crearSesion(selectedUniverso.id, nombreNuevaSesion.trim(), sesionPrivada, miembrosPrivados, padreSesion?.id || null)
    if (data) {
      setSesionActiva(data)
      setSesionesConMiembros(prev => [...prev, { ...data, miembros: sesionPrivada ? [userId, ...miembrosPrivados] : [] }])
    }
    setNombreNuevaSesion('')
    setSesionPrivada(false)
    setMiembrosPrivados([])
    setPadreSesion(null)
    setShowNuevaSesion(false)
  }

  const handleEliminarSesion = async () => {
    if (!confirmDeleteSesion) return
    await eliminarSesion(confirmDeleteSesion.id, selectedUniverso.id)
    if (sesionActiva?.id === confirmDeleteSesion.id) setSesionActiva(null)
    setSesionesConMiembros(prev => prev.filter(s => s.id !== confirmDeleteSesion.id))
    setConfirmDeleteSesion(null)
  }

  const abrirGestionSesion = async (sesion) => {
    setGestionarSesion(sesion)
    setLoadingGestion(true)
    // Cargar miembros actuales de la sesión
    const { data: mbs } = await supabase
      .from('sesion_miembros')
      .select('user_id')
      .eq('sesion_id', sesion.id)
    const ids = (mbs || []).map(m => m.user_id)
    if (ids.length > 0) {
      const { data: perfs } = await supabase.from('perfiles').select('id, nombre').in('id', ids)
      setMiembrosSesion(perfs || [])
    } else {
      setMiembrosSesion([])
    }
    // Cargar todos los miembros del universo si no están cargados
    if (usuariosUniverso.length === 0) {
      const { data: univMbs } = await supabase.from('miembros').select('user_id').eq('universo_id', selectedUniverso.id)
      const univIds = (univMbs || []).map(m => m.user_id)
      if (univIds.length > 0) {
        const { data: perfs } = await supabase.from('perfiles').select('id, nombre').in('id', univIds)
        setUsuariosUniverso(perfs || [])
      }
    }
    setLoadingGestion(false)
  }

  const añadirMiembroSesion = async (usuarioId, nombre) => {
    const yaMiembro = miembrosSesion.some(m => m.id === usuarioId)
    if (yaMiembro) return
    const joined_at = new Date().toISOString()
    await supabase.from('sesion_miembros').insert({ sesion_id: gestionarSesion.id, user_id: usuarioId, joined_at })
    setMiembrosSesion(prev => [...prev, { id: usuarioId, nombre }])
    // Actualizar sesionesConMiembros para que el nuevo miembro la vea
    setSesionesConMiembros(prev => prev.map(s =>
      s.id === gestionarSesion.id ? { ...s, miembros: [...(s.miembros || []), usuarioId] } : s
    ))
  }

  const quitarMiembroSesion = async (usuarioId) => {
    if (usuarioId === gestionarSesion.user_id) return
    await supabase.from('sesion_miembros').delete().eq('sesion_id', gestionarSesion.id).eq('user_id', usuarioId)
    setMiembrosSesion(prev => prev.filter(m => m.id !== usuarioId))
    setSesionesConMiembros(prev => prev.map(s =>
      s.id === gestionarSesion.id ? { ...s, miembros: (s.miembros || []).filter(id => id !== usuarioId) } : s
    ))
  }

  // ── REACCIONES ──
  const EMOJIS_RAPIDOS = ['❤️', '😂', '😮', '👏', '🎲', '⚔️', '✨', '💀']

  const cargarReacciones = async () => {
    const ids = sesionCompleta.map(e => e.id)
    if (ids.length === 0) return
    const { data } = await supabase.from('reacciones').select('*').in('entrada_id', ids)
    const agrupadas = {}
    ;(data || []).forEach(r => {
      if (!agrupadas[r.entrada_id]) agrupadas[r.entrada_id] = []
      agrupadas[r.entrada_id].push(r)
    })
    setReacciones(agrupadas)
  }

  const toggleReaccion = async (entradaId, emoji) => {
    const existente = (reacciones[entradaId] || []).find(r => r.user_id === userId && r.emoji === emoji)
    if (existente) {
      await supabase.from('reacciones').delete().eq('id', existente.id)
      setReacciones(prev => ({ ...prev, [entradaId]: (prev[entradaId] || []).filter(r => r.id !== existente.id) }))
    } else {
      const { data } = await supabase.from('reacciones').insert({ entrada_id: entradaId, user_id: userId, emoji }).select().single()
      if (data) setReacciones(prev => ({ ...prev, [entradaId]: [...(prev[entradaId] || []), data] }))
    }
    setShowReacciones(null)
  }

  const agruparReacciones = (entradaId) => {
    const rs = reacciones[entradaId] || []
    const grupos = {}
    rs.forEach(r => { if (!grupos[r.emoji]) grupos[r.emoji] = []; grupos[r.emoji].push(r.user_id) })
    return Object.entries(grupos).map(([emoji, uids]) => ({ emoji, count: uids.length, mia: uids.includes(userId) }))
  }

  // ── FIJAR ENTRADAS (estado local, sin depender del store del contexto) ──
  const cargarFijadas = async () => {
    const ids = sesionCompleta.map(e => e.id)
    if (ids.length === 0) return
    const { data } = await supabase.from('entradas').select('id, fijada').in('id', ids)
    const mapa = {}
    ;(data || []).forEach(e => { if (e.fijada) mapa[e.id] = true })
    setFijadas(mapa)
  }

  const toggleFijar = async (entrada) => {
    const nuevoValor = !fijadas[entrada.id]
    await supabase.from('entradas').update({ fijada: nuevoValor }).eq('id', entrada.id)
    setFijadas(prev => ({ ...prev, [entrada.id]: nuevoValor }))
  }

  const entradasFijadas = sesionCompleta.filter(e => fijadas[e.id])

  // ── HISTORIAL DE DADOS ──
  const tiradas = sesionCompleta.filter(e => e.tipo === 'dado')

  // ── BUSCADOR GLOBAL ──
  const buscarGlobal = async () => {
    if (!busquedaGlobal.trim() || !selectedUniverso) return
    setBuscandoGlobal(true)
    const { data } = await supabase
      .from('entradas')
      .select('*, sesiones(nombre)')
      .eq('universo_id', selectedUniverso.id)
      .ilike('contenido', `%${busquedaGlobal.trim()}%`)
      .order('created_at', { ascending: false })
      .limit(50)
    setResultadosGlobales(data || [])
    setBuscandoGlobal(false)
  }

  // ── NOTIFICACIONES DE SESIÓN ──
  useEffect(() => {
    if (!selectedUniverso || !userId) return
    const canal = supabase
      .channel(`notif-${selectedUniverso.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'entradas',
        filter: `universo_id=eq.${selectedUniverso.id}`
      }, (payload) => {
        const nueva = payload.new
        if (nueva.user_id === userId) return
        if (nueva.sesion_id === sesionActiva?.id) return
        if (nueva.sesion_id) setNotifsSesion(prev => ({ ...prev, [nueva.sesion_id]: (prev[nueva.sesion_id] || 0) + 1 }))
      })
      .subscribe()
    return () => supabase.removeChannel(canal)
  }, [selectedUniverso?.id, sesionActiva?.id, userId])

  // Limpiar notifs y cargar reacciones/fijadas al entrar a sesión
  useEffect(() => {
    if (!sesionActiva?.id) return
    setNotifsSesion(prev => { const n = { ...prev }; delete n[sesionActiva.id]; return n })
    // Pequeño delay para que sesionCompleta esté poblada
    setTimeout(() => { cargarReacciones(); cargarFijadas() }, 500)
  }, [sesionActiva?.id])

  return (
    <div className="mesa">
      <div className={`sidebar-overlay ${sidebarAbierto ? 'visible' : ''}`} onClick={() => setSidebarAbierto(false)} />

      <aside className={`mesa-sidebar ${sidebarAbierto ? 'abierto' : ''}`}>
        <div className="sidebar-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: seccionSesiones ? '0.6rem' : 0 }}>
            <h4 style={{ marginBottom: 0, cursor: 'pointer', userSelect: 'none' }} onClick={() => setSeccionSesiones(p => !p)}>
              {seccionSesiones ? '▾' : '▸'} Sesiones
            </h4>
            <button className="btn-adjunto" style={{ fontSize: '1rem' }} onClick={() => setShowNuevaSesion(true)}>＋</button>
          </div>
          {seccionSesiones && (
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {sesiones.length === 0 && <p className="sidebar-empty">Sin sesiones. Crea la primera.</p>}
              {sesiones.filter(s => !s.padre_id).map(s => (
                <div key={s.id}>
                  <div className={`sesion-item ${sesionActiva?.id === s.id ? 'activa' : ''}`} onClick={() => { setSesionActiva(s); setSidebarAbierto(false) }}>
                    <span style={{ flex: 1 }}>{s.es_privada ? '🔒' : '#'} {s.nombre}</span>
                    {notifsSesion[s.id] > 0 && <span style={{ background: 'var(--accent)', color: '#000', borderRadius: '999px', fontSize: '0.65rem', padding: '0.1rem 0.4rem', fontWeight: 700, marginRight: '0.2rem' }}>{notifsSesion[s.id]}</span>}
                    <div style={{ display: 'flex', gap: '0.2rem' }}>
                      {s.es_privada && s.user_id === userId && (
                        <button className="sesion-delete" title="Gestionar miembros" onClick={e => { e.stopPropagation(); abrirGestionSesion(s) }}>👥</button>
                      )}
                      <button className="sesion-delete" onClick={e => { e.stopPropagation(); setConfirmDeleteSesion(s) }}>✕</button>
                    </div>
                  </div>
                  {sesiones.filter(sub => sub.padre_id === s.id).map(sub => (
                    <div key={sub.id} className={`sesion-item sesion-sub ${sesionActiva?.id === sub.id ? 'activa' : ''}`} onClick={() => { setSesionActiva(sub); setSidebarAbierto(false) }}>
                      <span style={{ flex: 1 }}>↳ {sub.es_privada ? '🔒' : '#'} {sub.nombre}</span>
                      {notifsSesion[sub.id] > 0 && <span style={{ background: 'var(--accent)', color: '#000', borderRadius: '999px', fontSize: '0.65rem', padding: '0.1rem 0.4rem', fontWeight: 700, marginRight: '0.2rem' }}>{notifsSesion[sub.id]}</span>}
                      <div style={{ display: 'flex', gap: '0.2rem' }}>
                        {sub.es_privada && sub.user_id === userId && (
                          <button className="sesion-delete" title="Gestionar miembros" onClick={e => { e.stopPropagation(); abrirGestionSesion(sub) }}>👥</button>
                        )}
                        <button className="sesion-delete" onClick={e => { e.stopPropagation(); setConfirmDeleteSesion(sub) }}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="sidebar-section">
          <h4 style={{ cursor: 'pointer', userSelect: 'none', marginBottom: seccionPersonajes ? '0.6rem' : 0 }} onClick={() => setSeccionPersonajes(p => !p)}>
            {seccionPersonajes ? '▾' : '▸'} Personajes
          </h4>
          {seccionPersonajes && (
            <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
              <div className={`personaje-btn narrador-btn ${modoEntrada === 'narrador' && !personajeActivo ? 'activo' : ''}`} onClick={() => { setPersonajeActivo(null); setModoEntrada('narrador'); setSidebarAbierto(false) }}>
                <div className="personaje-avatar-sm narrador-avatar">📖</div>
                <span>Narrador</span>
              </div>
              {personajes.filter(p => !p.es_npc).map(p => {
                const esMio = p.user_id === userId
                return (
                  <div key={p.id}
                    className={`personaje-btn ${personajeActivo?.id === p.id ? 'activo' : ''} ${!esMio ? 'personaje-ajeno' : ''}`}
                    onClick={esMio ? () => { setPersonajeActivo(p); setModoEntrada('dialogo'); setSidebarAbierto(false) } : undefined}
                    style={!esMio ? { opacity: 0.5, cursor: 'default' } : {}}>
                    {p.avatar_url ? <img src={p.avatar_url} alt={p.nombre} className="personaje-avatar-sm avatar-img" /> : <div className="personaje-avatar-sm" style={{ background: p.color }}>{p.iniciales}</div>}
                    <div style={{ flex: 1 }}><span>{p.nombre}</span><small>{p.rol}</small></div>
                    <button className="ficha-btn" onClick={e => { e.stopPropagation(); setFichaPersonaje(p) }}>📋</button>
                  </div>
                )
              })}
              {personajes.filter(p => p.es_npc).length > 0 && (
                <>
                  <p style={{ fontSize: '0.7rem', color: 'var(--text3)', padding: '0.4rem 0.2rem 0.2rem', fontFamily: 'Cinzel, serif', textTransform: 'uppercase', letterSpacing: '0.06em' }}>NPCs</p>
                  {personajes.filter(p => p.es_npc).map(p => (
                    <div key={p.id} className={`personaje-btn ${personajeActivo?.id === p.id ? 'activo' : ''}`} onClick={() => { setPersonajeActivo(p); setModoEntrada('dialogo'); setSidebarAbierto(false) }}>
                      {p.avatar_url ? <img src={p.avatar_url} alt={p.nombre} className="personaje-avatar-sm avatar-img" /> : <div className="personaje-avatar-sm" style={{ background: p.color }}>{p.iniciales}</div>}
                      <div style={{ flex: 1 }}><span>{p.nombre}</span><small>🤖 {p.rol}</small></div>
                      <button className="ficha-btn" onClick={e => { e.stopPropagation(); setFichaPersonaje(p) }}>📋</button>
                    </div>
                  ))}
                </>
              )}
              {personajes.length === 0 && <p className="sidebar-empty">Sin personajes en este universo.</p>}
            </div>
          )}
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
            {[4, 6, 8, 10, 12, 20].map(c => <button key={c} className="dado-btn" onClick={() => tirarDado(c)}>d{c}</button>)}
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
          <h4 style={{ cursor: 'pointer', userSelect: 'none', marginBottom: seccionConectados ? '0.6rem' : 0 }} onClick={() => setSeccionConectados(p => !p)}>
            {seccionConectados ? '▾' : '▸'} Conectados
          </h4>
          {seccionConectados && (
            <div style={{ maxHeight: '160px', overflowY: 'auto' }}>
              {usuariosConectados.length === 0 && <p className="sidebar-empty">Solo tú</p>}
              {usuariosConectados.map((u, i) => (
                <div key={i} className="conectado-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.2rem', padding: '0.4rem 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="conectado-dot" />
                    <span style={{ fontSize: '0.88rem', color: 'var(--text)' }}>{u.nombre}</span>
                  </div>
                  {u.personaje ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginLeft: '1.1rem' }}>
                      {u.personaje.avatar_url
                        ? <img src={u.personaje.avatar_url} alt={u.personaje.nombre} style={{ width: '16px', height: '16px', borderRadius: '50%', objectFit: 'cover' }} />
                        : <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: u.personaje.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.5rem', color: 'white', fontWeight: 700, flexShrink: 0 }}>{u.personaje.iniciales}</div>
                      }
                      <span style={{ fontSize: '0.78rem', color: u.personaje.color, fontFamily: 'Cinzel, serif' }}>{u.personaje.nombre}</span>
                    </div>
                  ) : (
                    <span style={{ marginLeft: '1.1rem', fontSize: '0.75rem', color: 'var(--text3)', fontStyle: 'italic' }}>📖 Narrador</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="sidebar-section">
          <h4 style={{ cursor: 'pointer', userSelect: 'none', marginBottom: seccionOpciones ? '0.6rem' : 0 }} onClick={() => setSeccionOpciones(p => !p)}>
            {seccionOpciones ? '▾' : '▸'} Opciones
          </h4>
          {seccionOpciones && (<>
            <button className="modo-btn" onClick={exportarSesion} disabled={!sesionActiva}>📄 Exportar TXT</button>
            <button className="modo-btn" style={{ marginTop: '0.4rem' }} onClick={exportarPDF} disabled={!sesionActiva}>📕 Exportar PDF</button>
            <button className="modo-btn" style={{ marginTop: '0.4rem' }} onClick={() => setShowStats(true)} disabled={!sesionActiva}>📊 Estadísticas</button>
            <button className="modo-btn" style={{ marginTop: '0.4rem' }} onClick={() => setShowDados(true)} disabled={!sesionActiva}>🎲 Historial de dados</button>
            <button className="modo-btn" style={{ marginTop: '0.4rem' }} onClick={() => setShowBusquedaGlobal(true)} disabled={!selectedUniverso}>🔍 Buscar en universo</button>
            <button className="modo-btn notif-btn" style={{ marginTop: '0.4rem' }} onClick={() => { setShowChat(true); setTieneNoLeidos(false); setSidebarAbierto(false) }}>
              🔒 Mensajes privados
              {tieneNoLeidos && <span className="notif-dot" />}
            </button>
            {esDueno && <button className="modo-btn" style={{ marginTop: '0.4rem' }} onClick={abrirInvitar}>✉️ Invitar jugador</button>}
            <button className="modo-btn" style={{ marginTop: '0.4rem' }} onClick={() => setShowMusica(true)}>🎵 Música</button>
            {youtubeEmbed && (
              <div style={{ marginTop: '0.6rem', borderRadius: 'var(--radius)', overflow: 'hidden', position: 'relative' }}>
                <iframe src={youtubeEmbed} width="100%" height="52" frameBorder="0" allow="autoplay; encrypted-media" style={{ display: 'block' }} />
                <button onClick={() => { setYoutubeEmbed(null); setYoutubeUrl('') }}
                  style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(0,0,0,0.6)', border: 'none', color: 'white', borderRadius: '3px', padding: '1px 5px', fontSize: '0.7rem', cursor: 'pointer', lineHeight: 1.4 }}>✕</button>
              </div>
            )}
          </>)}
        </div>
      </aside>

      <main className="mesa-main">
        <div className="mesa-header">
          <button className="btn-menu-sidebar" onClick={() => setSidebarAbierto(prev => !prev)}>{sidebarAbierto ? '✕' : '☰'}</button>
          <div style={{ flex: 1 }}>
            <h3>{selectedUniverso.nombre}</h3>
            {sesionActiva && <small style={{ color: 'var(--text3)', fontSize: '0.75rem' }}># {sesionActiva.nombre}</small>}
          </div>
          {sesionActiva && (
            <div className="buscador-historial">
              <input placeholder="🔍 Buscar..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
              {busqueda && <button onClick={() => setBusqueda('')}>✕</button>}
            </div>
          )}
          <span className="sesion-count">{sesion.length} entradas</span>
        </div>

        <div className="historial" ref={historialRef} onScroll={handleScroll}>
          {!sesionActiva && (
            <div className="historial-empty">
              <p>Selecciona o crea una sesión en el panel lateral para empezar.</p>
              <button className="btn-primary" style={{ marginTop: '1rem' }} onClick={() => setShowNuevaSesion(true)}>+ Nueva sesión</button>
            </div>
          )}
          {sesionActiva && sesion.length === 0 && <div className="historial-empty"><p>{busqueda ? 'Sin resultados.' : '¡Empieza a escribir!'}</p></div>}

          {/* Panel de entradas fijadas */}
          {entradasFijadas.length > 0 && !busqueda && (
            <div style={{ background: 'rgba(180,140,60,0.08)', border: '1px solid rgba(180,140,60,0.2)', borderRadius: 'var(--radius)', margin: '0.5rem 0 1rem', padding: '0.6rem 1rem' }}>
              <p style={{ fontSize: '0.72rem', color: 'var(--accent)', fontFamily: 'Cinzel, serif', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>📌 Fijadas</p>
              {entradasFijadas.map(e => (
                <div key={e.id} style={{ fontSize: '0.85rem', color: 'var(--text2)', padding: '0.25rem 0', borderBottom: '1px solid rgba(180,140,60,0.1)', cursor: 'pointer' }}
                  onClick={() => document.getElementById(`entrada-${e.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
                  {e.personaje_nombre && <span style={{ color: e.personaje_color, fontFamily: 'Cinzel, serif', fontSize: '0.78rem', marginRight: '0.4rem' }}>{e.personaje_nombre}:</span>}
                  <span style={{ fontStyle: 'italic' }}>{e.contenido?.slice(0, 80)}{e.contenido?.length > 80 ? '…' : ''}</span>
                </div>
              ))}
            </div>
          )}

          {sesion.map(e => (
            <div key={e.id} id={`entrada-${e.id}`} className={`entrada entrada-${e.tipo}${fijadas[e.id] ? ' entrada-fijada' : ''}`}>
              {e.tipo === 'narrador' && (
                <div className="entrada-narrador">
                  <span className="entrada-label">📖 Narrador</span>
                  {e.contenido && <p>{renderTexto(e.contenido)}</p>}
                  {e.imagen_url && <img src={e.imagen_url} alt="imagen" style={{ maxWidth: '240px', borderRadius: '8px', marginTop: '0.4rem', cursor: 'pointer' }} onClick={() => window.open(e.imagen_url, '_blank')} />}
                  <span className="entrada-hora">{formatHora(e.timestamp)}{e.editado && <span className="entrada-editado"> · editado</span>}</span>
                  {e.user_id === userId && (
                    <div className="entrada-acciones">
                      {e.contenido && <button onClick={() => setEditandoEntrada({ id: e.id, contenido: e.contenido })}>✏️</button>}
                      <button onClick={() => setConfirmDeleteEntrada(e)}>🗑️</button>
                    </div>
                  )}
                </div>
              )}
              {e.tipo === 'dialogo' && (
                <div className="entrada-dialogo">
                  {e.personaje?.avatar_url ? <img src={e.personaje.avatar_url} alt={e.personaje.nombre} className="entrada-avatar avatar-img" /> : <div className="entrada-avatar" style={{ background: e.personaje?.color }}>{e.personaje?.iniciales}</div>}
                  <div className="entrada-burbuja">
                    <span className="entrada-nombre" style={{ color: e.personaje?.color }}>{e.personaje?.nombre}</span>
                    {e.contenido && <p>"{renderTexto(e.contenido)}"</p>}
                    {e.imagen_url && <img src={e.imagen_url} alt="imagen" onClick={() => window.open(e.imagen_url, '_blank')} />}
                    <span className="entrada-hora">{formatHora(e.timestamp)}{e.editado && <span className="entrada-editado"> · editado</span>}</span>
                    {e.user_id === userId && (
                      <div className="entrada-acciones">
                        {e.contenido && <button onClick={() => setEditandoEntrada({ id: e.id, contenido: e.contenido })}>✏️</button>}
                        <button onClick={() => setConfirmDeleteEntrada(e)}>🗑️</button>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {e.tipo === 'accion' && (
                <div className="entrada-accion">
                  {e.personaje?.avatar_url ? <img src={e.personaje.avatar_url} alt={e.personaje.nombre} className="entrada-avatar avatar-img" /> : <div className="entrada-avatar" style={{ background: e.personaje?.color }}>{e.personaje?.iniciales}</div>}
                  <div className="entrada-accion-texto">
                    <span style={{ color: e.personaje?.color }}>{e.personaje?.nombre}</span>
                    {e.contenido && <em> {renderTexto(e.contenido)}</em>}
                    {e.imagen_url && <img src={e.imagen_url} alt="imagen" style={{ maxWidth: '220px', borderRadius: '8px', marginTop: '0.4rem', display: 'block', cursor: 'pointer' }} onClick={() => window.open(e.imagen_url, '_blank')} />}
                    <span className="entrada-hora">{formatHora(e.timestamp)}{e.editado && <span className="entrada-editado"> · editado</span>}</span>
                    {e.user_id === userId && (
                      <div className="entrada-acciones">
                        {e.contenido && <button onClick={() => setEditandoEntrada({ id: e.id, contenido: e.contenido })}>✏️</button>}
                        <button onClick={() => setConfirmDeleteEntrada(e)}>🗑️</button>
                      </div>
                    )}
                  </div>
                </div>
              )}
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

              {/* Reacciones */}
              {e.tipo !== 'dado' && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', padding: '0.2rem 0.8rem 0.4rem', alignItems: 'center' }}>
                  {agruparReacciones(e.id).map(({ emoji, count, mia }) => (
                    <button key={emoji} onClick={() => toggleReaccion(e.id, emoji)}
                      style={{ background: mia ? 'rgba(180,140,60,0.15)' : 'var(--bg3)', border: `1px solid ${mia ? 'var(--accent)' : 'var(--border)'}`, borderRadius: '999px', padding: '0.1rem 0.5rem', fontSize: '0.82rem', cursor: 'pointer', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                      {emoji} <span style={{ fontSize: '0.75rem', color: mia ? 'var(--accent)' : 'var(--text3)' }}>{count}</span>
                    </button>
                  ))}
                  <div style={{ position: 'relative' }}>
                    <button onClick={() => setShowReacciones(showReacciones === e.id ? null : e.id)}
                      style={{ background: 'none', border: '1px dashed var(--border)', borderRadius: '999px', padding: '0.1rem 0.4rem', fontSize: '0.75rem', cursor: 'pointer', color: 'var(--text3)' }}>＋😊</button>
                    {showReacciones === e.id && (
                      <div style={{ position: 'absolute', bottom: '100%', left: 0, background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 'var(--radius)', padding: '0.4rem', display: 'flex', gap: '0.3rem', zIndex: 100, boxShadow: 'var(--shadow)' }}>
                        {EMOJIS_RAPIDOS.map(em => (
                          <button key={em} onClick={() => toggleReaccion(e.id, em)}
                            style={{ background: 'none', border: 'none', fontSize: '1.1rem', cursor: 'pointer', padding: '0.1rem', borderRadius: '4px' }}>
                            {em}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {(e.user_id === userId || esDueno) && (
                    <button onClick={() => toggleFijar(e)} title={fijadas[e.id] ? 'Desfijar' : 'Fijar'}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', color: fijadas[e.id] ? 'var(--accent)' : 'var(--text3)', marginLeft: 'auto', padding: '0.1rem 0.3rem' }}>
                      {fijadas[e.id] ? '📌' : '📍'}
                    </button>
                  )}
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

        {otrosEscribiendo.length > 0 && (
          <div className="escribiendo-indicator">
            <span className="escribiendo-dots"><span/><span/><span/></span>
            <span>{otrosEscribiendo.map(u => u.nombre).join(', ')} {otrosEscribiendo.length === 1 ? 'está' : 'están'} escribiendo...</span>
          </div>
        )}

        {mostrarIrAbajo && <button className="btn-ir-abajo" onClick={irAbajo}>↓</button>}


        <div className="mesa-input-bar">
          <div className="input-contexto">
            {modoEntrada === 'narrador' || !personajeActivo
              ? <div className="personaje-avatar-sm narrador-avatar">📖</div>
              : personajeActivo.avatar_url
                ? <img src={personajeActivo.avatar_url} alt={personajeActivo.nombre} className="personaje-avatar-sm avatar-img" />
                : <div className="personaje-avatar-sm" style={{ background: personajeActivo.color }}>{personajeActivo.iniciales}</div>
            }
            <span className="input-modo">{!personajeActivo ? 'Narrador' : `${personajeActivo.nombre} · ${modoEntrada === 'dialogo' ? 'Diálogo' : 'Acción'}`}</span>
            {!sesionActiva && <span style={{ color: 'var(--danger)', fontSize: '0.8rem', marginLeft: 'auto' }}>⚠ Selecciona una sesión</span>}
          </div>
          <div className="formato-bar">
            <button type="button" className="formato-btn" onClick={() => insertarFormato('negrita')} title="Negrita"><strong>B</strong></button>
            <button type="button" className="formato-btn" onClick={() => insertarFormato('cursiva')} title="Cursiva"><em>I</em></button>
            <button type="button" className="formato-btn" onClick={() => insertarFormato('subrayado')} title="Subrayado"><u>S</u></button>
          </div>
          <div className="input-row" style={{ position: 'relative' }}>
            {showSelector && <SelectorImagenSticker userId={userId} onEnviarImagen={enviarImagen} onEnviarSticker={enviarImagen} onCerrar={() => setShowSelector(false)} />}
            <button className="btn-adjunto" onClick={() => setShowSelector(!showSelector)} disabled={!sesionActiva}>📎</button>
            <textarea
              ref={inputRef}
              className="mesa-textarea"
              placeholder={!sesionActiva ? 'Selecciona una sesión primero...' : !personajeActivo && modoEntrada !== 'narrador' ? 'Selecciona un personaje o escribe /narrador...' : modoEntrada === 'narrador' ? 'Narra lo que ocurre...' : modoEntrada === 'dialogo' ? `¿Qué dice ${personajeActivo?.nombre}?` : `¿Qué hace ${personajeActivo?.nombre}?`}
              value={texto}
              onChange={e => {
                handleTextoChange(e)
                emitirEscribiendo(true)
                clearTimeout(timeoutEscribiendoRef.current)
                timeoutEscribiendoRef.current = setTimeout(() => emitirEscribiendo(false), 2000)
              }}
              onKeyDown={handleKeyDown}
              rows={2}
              disabled={!sesionActiva}
            />
            <button className="btn-enviar" onClick={enviar} disabled={!sesionActiva}>↵</button>
          </div>
          <span className="input-hint">Enter para enviar · Shift+Enter para nueva línea</span>
        </div>
      </main>

      <div className="notif-stack">
        {notificaciones.map(n => (
          <div key={n.id} className="notif-toast" style={{ borderLeftColor: n.color }}>
            <span>🔒 {n.texto}</span>
            <button onClick={() => setNotificaciones(prev => prev.filter(x => x.id !== n.id))}>✕</button>
          </div>
        ))}
      </div>

      {showNuevaSesion && (
        <div className="modal-overlay" onClick={() => setShowNuevaSesion(false)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <h3>Nueva sesión</h3>
            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label>Nombre de la sesión</label>
              <input placeholder="Día 1, Capítulo 1..." value={nombreNuevaSesion} onChange={e => setNombreNuevaSesion(e.target.value)} onKeyDown={e => e.key === 'Enter' && !sesionPrivada && handleCrearSesion()} autoFocus />
            </div>
            <div className="form-group">
              <label>Subsesión de (opcional)</label>
              <select value={padreSesion?.id || ''} onChange={e => {
                const s = sesiones.find(x => x.id === e.target.value)
                setPadreSesion(s || null)
              }}>
                <option value="">— Sesión principal —</option>
                {sesiones.filter(s => !s.padre_id).map(s => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Tipo</label>
              <div className="tipo-toggle">
                <button type="button" className={!sesionPrivada ? 'tipo-btn activo' : 'tipo-btn'} onClick={() => setSesionPrivada(false)}>🌍 Pública</button>
                <button type="button" className={sesionPrivada ? 'tipo-btn activo' : 'tipo-btn'} onClick={() => setSesionPrivada(true)}>🔒 Privada</button>
              </div>
            </div>
            {sesionPrivada && usuariosUniverso.length > 0 && (
              <div className="form-group">
                <label>Invitar jugadores</label>
                <p style={{ fontSize: '0.82rem', color: 'var(--text3)', marginBottom: '0.5rem' }}>Selecciona quién puede ver esta sesión además de ti.</p>
                {usuariosUniverso.map(u => (
                  <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0', cursor: 'pointer', color: 'var(--text2)' }}>
                    <input type="checkbox" checked={miembrosPrivados.includes(u.id)} onChange={e => {
                      if (e.target.checked) setMiembrosPrivados(prev => [...prev, u.id])
                      else setMiembrosPrivados(prev => prev.filter(id => id !== u.id))
                    }} />
                    {u.nombre || u.id.slice(0, 8)}
                  </label>
                ))}
              </div>
            )}
            {sesionPrivada && usuariosUniverso.length === 0 && (
              <p style={{ color: 'var(--text3)', fontSize: '0.85rem', marginBottom: '0.5rem', fontStyle: 'italic' }}>No hay otros jugadores en este universo todavía.</p>
            )}
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setShowNuevaSesion(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleCrearSesion}>Crear</button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteSesion && (
        <div className="modal-overlay" onClick={() => setConfirmDeleteSesion(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <h3>¿Eliminar sesión?</h3>
            <p style={{ color: 'var(--text2)', margin: '0.8rem 0 1.5rem' }}>Se eliminará "<strong>{confirmDeleteSesion.nombre}</strong>" y todas sus entradas permanentemente.</p>
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setConfirmDeleteSesion(null)}>Cancelar</button>
              <button className="btn-danger" onClick={handleEliminarSesion}>Sí, eliminar</button>
            </div>
          </div>
        </div>
      )}

      {showInvitar && (
        <div className="modal-overlay" onClick={() => { setShowInvitar(false); setMsgInvitar(null) }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>👥 Gestionar jugadores</h3>

            {/* Miembros actuales */}
            {miembrosUniverso.length > 0 && (
              <div style={{ marginBottom: '1.2rem' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text3)', fontFamily: 'Cinzel, serif', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '0.5rem' }}>Miembros actuales</label>
                {miembrosUniverso.map(m => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0', borderBottom: '1px solid var(--border)' }}>
                    <span className="conectado-dot" />
                    <span style={{ fontSize: '0.9rem', color: 'var(--text2)' }}>{m.nombre || m.id.slice(0, 8)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Añadir jugador */}
            <div className="form-group" style={{ marginBottom: '0.6rem' }}>
              <label>Añadir jugador por email</label>
              <input
                placeholder="jugador@email.com"
                value={emailInvitar}
                onChange={e => { setEmailInvitar(e.target.value); setMsgInvitar(null) }}
                onKeyDown={e => e.key === 'Enter' && !enviando && handleAñadirDirecto()}
                autoFocus
              />
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text3)', marginBottom: '1rem', fontStyle: 'italic' }}>
              Si el jugador ya tiene cuenta se añade directamente. Si no, se genera un enlace de invitación.
            </p>

            {msgInvitar && (
              <div className={msgInvitar.tipo === 'ok' ? 'auth-mensaje' : 'auth-error'} style={{ marginBottom: '1rem' }}>
                {msgInvitar.texto}
                {msgInvitar.link && (
                  <input
                    readOnly
                    value={msgInvitar.link}
                    style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.4rem 0.7rem', borderRadius: '6px', fontSize: '0.8rem', marginTop: '0.5rem', cursor: 'text' }}
                    onClick={e => { e.target.select(); navigator.clipboard?.writeText(e.target.value) }}
                  />
                )}
              </div>
            )}

            {/* Invitaciones pendientes */}
            {invitaciones.filter(i => i.estado === 'pendiente').length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text3)', fontFamily: 'Cinzel, serif', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '0.4rem' }}>Invitaciones pendientes</label>
                {invitaciones.filter(i => i.estado === 'pendiente').map(inv => (
                  <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text2)', padding: '0.3rem 0', borderBottom: '1px solid var(--border)' }}>
                    <span>{inv.email || 'Sin email'}</span>
                    <span style={{ color: 'var(--accent)', fontSize: '0.8rem' }}>pendiente</span>
                  </div>
                ))}
              </div>
            )}

            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => { setShowInvitar(false); setMsgInvitar(null) }}>Cerrar</button>
              <button className="btn-primary" onClick={handleAñadirDirecto} disabled={enviando || !emailInvitar.trim()}>
                {enviando ? 'Añadiendo...' : '＋ Añadir jugador'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editandoEntrada && (
        <div className="modal-overlay" onClick={() => setEditandoEntrada(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <h3>Editar mensaje</h3>
            <div className="form-group" style={{ marginTop: '1rem' }}>
              <textarea className="notas-textarea" rows={4} value={editandoEntrada.contenido} onChange={e => setEditandoEntrada(prev => ({ ...prev, contenido: e.target.value }))} />
            </div>
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setEditandoEntrada(null)}>Cancelar</button>
              <button className="btn-primary" onClick={handleEditarEntrada}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteEntrada && (
        <div className="modal-overlay" onClick={() => setConfirmDeleteEntrada(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <h3>¿Borrar mensaje?</h3>
            <p style={{ color: 'var(--text2)', margin: '0.8rem 0 1.5rem' }}>Esta acción no se puede deshacer.</p>
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setConfirmDeleteEntrada(null)}>Cancelar</button>
              <button className="btn-danger" onClick={async () => { await borrarEntrada(confirmDeleteEntrada.id); setConfirmDeleteEntrada(null) }}>Sí, borrar</button>
            </div>
          </div>
        </div>
      )}

      {showStats && sesionActiva && (() => {
        const entradas = sesionCompleta
        const porTipo = {
          narrador: entradas.filter(e => e.tipo === 'narrador'),
          dialogo: entradas.filter(e => e.tipo === 'dialogo'),
          accion: entradas.filter(e => e.tipo === 'accion'),
          dado: entradas.filter(e => e.tipo === 'dado'),
        }
        const palabras = entradas.reduce((acc, e) => acc + (e.contenido?.split(/\s+/).filter(Boolean).length || 0), 0)
        const porPersonaje = {}
        entradas.filter(e => e.personaje_nombre).forEach(e => {
          const k = e.personaje_nombre
          if (!porPersonaje[k]) porPersonaje[k] = { nombre: k, color: e.personaje_color, count: 0, palabras: 0 }
          porPersonaje[k].count++
          porPersonaje[k].palabras += e.contenido?.split(/\s+/).filter(Boolean).length || 0
        })
        const rankPersonajes = Object.values(porPersonaje).sort((a, b) => b.count - a.count)
        return (
          <div className="modal-overlay" onClick={() => setShowStats(false)}>
            <div className="modal" style={{ maxWidth: '520px' }} onClick={e => e.stopPropagation()}>
              <h3>📊 Estadísticas — {sesionActiva.nombre}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem', margin: '1.2rem 0' }}>
                {[
                  { label: 'Entradas', valor: entradas.length, icono: '📝' },
                  { label: 'Palabras', valor: palabras, icono: '✍️' },
                  { label: 'Dados', valor: porTipo.dado.length, icono: '🎲' },
                ].map(({ label, valor, icono }) => (
                  <div key={label} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0.8rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.4rem' }}>{icono}</div>
                    <div style={{ fontFamily: 'Cinzel, serif', fontSize: '1.3rem', color: 'var(--accent)', fontWeight: 700 }}>{valor}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginBottom: '1.2rem' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--text3)', fontFamily: 'Cinzel, serif', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.6rem' }}>Por tipo</p>
                {[
                  { label: 'Narrador', count: porTipo.narrador.length, icono: '📖', color: 'var(--narrador)' },
                  { label: 'Diálogo', count: porTipo.dialogo.length, icono: '💬', color: 'var(--accent)' },
                  { label: 'Acción', count: porTipo.accion.length, icono: '⚡', color: '#e67e22' },
                ].map(({ label, count, icono, color }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
                    <span style={{ width: '70px', fontSize: '0.82rem', color: 'var(--text2)' }}>{icono} {label}</span>
                    <div style={{ flex: 1, height: '6px', background: 'var(--bg3)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: entradas.length ? `${(count / entradas.length) * 100}%` : '0%', height: '100%', background: color, borderRadius: '3px', transition: 'width 0.4s' }} />
                    </div>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text2)', minWidth: '28px', textAlign: 'right' }}>{count}</span>
                  </div>
                ))}
              </div>
              {rankPersonajes.length > 0 && (
                <div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text3)', fontFamily: 'Cinzel, serif', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.6rem' }}>Participación por personaje</p>
                  {rankPersonajes.map((p, i) => (
                    <div key={p.nombre} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text3)', minWidth: '14px' }}>#{i + 1}</span>
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: '0.85rem', color: p.color, fontFamily: 'Cinzel, serif' }}>{p.nombre}</span>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text3)' }}>{p.palabras} pal.</span>
                      <span style={{ fontSize: '0.82rem', color: 'var(--text2)', minWidth: '36px', textAlign: 'right' }}>{p.count} entr.</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
                <button className="btn-primary" onClick={() => setShowStats(false)}>Cerrar</button>
              </div>
            </div>
          </div>
        )
      })()}

      {gestionarSesion && (
        <div className="modal-overlay" onClick={() => setGestionarSesion(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>👥 Miembros — {gestionarSesion.nombre}</h3>

            {loadingGestion ? (
              <p style={{ color: 'var(--text3)', margin: '1rem 0' }}>Cargando...</p>
            ) : (
              <>
                {/* Miembros actuales */}
                <div style={{ marginBottom: '1.2rem' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text3)', fontFamily: 'Cinzel, serif', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.5rem' }}>En esta sala</label>
                  {miembrosSesion.length === 0 && <p style={{ color: 'var(--text3)', fontSize: '0.85rem', fontStyle: 'italic' }}>Solo tú por ahora.</p>}
                  {miembrosSesion.map(m => (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0', borderBottom: '1px solid var(--border)' }}>
                      <span className="conectado-dot" style={{ background: m.id === gestionarSesion.user_id ? 'var(--accent)' : 'var(--text3)' }} />
                      <span style={{ flex: 1, fontSize: '0.9rem', color: 'var(--text)' }}>{m.nombre || m.id.slice(0, 8)}</span>
                      {m.id === gestionarSesion.user_id
                        ? <span style={{ fontSize: '0.75rem', color: 'var(--accent)' }}>creador</span>
                        : <button className="btn-danger btn-sm" onClick={() => quitarMiembroSesion(m.id)}>Quitar</button>
                      }
                    </div>
                  ))}
                </div>

                {/* Añadir miembro desde los del universo */}
                {usuariosUniverso.filter(u => u.id !== userId && !miembrosSesion.some(m => m.id === u.id)).length > 0 && (
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text3)', fontFamily: 'Cinzel, serif', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.5rem' }}>Añadir jugador del universo</label>
                    {usuariosUniverso
                      .filter(u => u.id !== userId && !miembrosSesion.some(m => m.id === u.id))
                      .map(u => (
                        <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0', borderBottom: '1px solid var(--border)' }}>
                          <span style={{ flex: 1, fontSize: '0.9rem', color: 'var(--text2)' }}>{u.nombre || u.id.slice(0, 8)}</span>
                          <button className="btn-primary btn-sm" onClick={() => añadirMiembroSesion(u.id, u.nombre)}>＋ Añadir</button>
                        </div>
                      ))
                    }
                  </div>
                )}
              </>
            )}

            <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
              <button className="btn-primary" onClick={() => setGestionarSesion(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal historial de dados */}
      {showDados && (
        <div className="modal-overlay" onClick={() => setShowDados(false)}>
          <div className="modal" style={{ maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
            <h3>🎲 Historial de dados — {sesionActiva?.nombre}</h3>
            {tiradas.length === 0
              ? <p style={{ color: 'var(--text3)', margin: '1rem 0', fontStyle: 'italic' }}>No se han tirado dados en esta sesión.</p>
              : <div style={{ maxHeight: '400px', overflowY: 'auto', marginTop: '1rem' }}>
                  {tiradas.map(t => (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: '1.2rem' }}>🎲</span>
                      <div style={{ flex: 1 }}>
                        {t.personaje_nombre && <span style={{ color: t.personaje_color, fontFamily: 'Cinzel, serif', fontSize: '0.8rem', display: 'block' }}>{t.personaje_nombre}</span>}
                        <span style={{ fontSize: '0.85rem', color: 'var(--text2)' }}>{t.contenido}</span>
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text3)' }}>{formatHora(t.timestamp)}</span>
                    </div>
                  ))}
                </div>
            }
            <div style={{ marginTop: '1rem', padding: '0.6rem', background: 'var(--bg3)', borderRadius: 'var(--radius)', fontSize: '0.82rem', color: 'var(--text3)' }}>
              Total: <strong style={{ color: 'var(--accent)' }}>{tiradas.length}</strong> tiradas en esta sesión
            </div>
            <div className="modal-actions" style={{ marginTop: '1rem' }}>
              <button className="btn-primary" onClick={() => setShowDados(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal buscador global */}
      {showBusquedaGlobal && (
        <div className="modal-overlay" onClick={() => { setShowBusquedaGlobal(false); setResultadosGlobales([]); setBusquedaGlobal('') }}>
          <div className="modal" style={{ maxWidth: '560px' }} onClick={e => e.stopPropagation()}>
            <h3>🔍 Buscar en {selectedUniverso?.nombre}</h3>
            <div style={{ display: 'flex', gap: '0.5rem', margin: '1rem 0' }}>
              <input placeholder="Buscar en todas las sesiones..."
                value={busquedaGlobal} onChange={e => setBusquedaGlobal(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && buscarGlobal()} autoFocus
                style={{ flex: 1, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.5rem 0.8rem', borderRadius: 'var(--radius)', fontSize: '0.9rem' }} />
              <button className="btn-primary" onClick={buscarGlobal} disabled={buscandoGlobal || !busquedaGlobal.trim()}>
                {buscandoGlobal ? '...' : 'Buscar'}
              </button>
            </div>
            {resultadosGlobales.length > 0 && (
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--text3)', marginBottom: '0.6rem' }}>{resultadosGlobales.length} resultados</p>
                {resultadosGlobales.map(r => (
                  <div key={r.id} style={{ padding: '0.6rem', background: 'var(--bg3)', borderRadius: 'var(--radius)', marginBottom: '0.4rem', cursor: 'pointer', border: '1px solid var(--border)' }}
                    onClick={() => {
                      const ses = sesionesConMiembros.find(s => s.id === r.sesion_id)
                      if (ses) { setSesionActiva(ses); setShowBusquedaGlobal(false); setResultadosGlobales([]); setBusquedaGlobal('') }
                    }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--accent)', fontFamily: 'Cinzel, serif' }}>#{r.sesiones?.nombre || 'Sesión'}</span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>{new Date(r.created_at).toLocaleDateString('es-ES')}</span>
                    </div>
                    {r.personaje_nombre && <span style={{ color: r.personaje_color, fontSize: '0.8rem', fontFamily: 'Cinzel, serif' }}>{r.personaje_nombre}: </span>}
                    <span style={{ fontSize: '0.85rem', color: 'var(--text2)', fontStyle: r.tipo === 'narrador' ? 'italic' : 'normal' }}>
                      {r.contenido?.slice(0, 120)}{r.contenido?.length > 120 ? '…' : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {resultadosGlobales.length === 0 && busquedaGlobal && !buscandoGlobal && (
              <p style={{ color: 'var(--text3)', fontStyle: 'italic', textAlign: 'center', margin: '1rem 0' }}>Sin resultados para "{busquedaGlobal}"</p>
            )}
            <div className="modal-actions" style={{ marginTop: '1rem' }}>
              <button className="btn-ghost" onClick={() => { setShowBusquedaGlobal(false); setResultadosGlobales([]); setBusquedaGlobal('') }}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {fichaPersonaje && <FichaPersonaje personaje={fichaPersonaje} userId={userId} onCerrar={() => setFichaPersonaje(null)} />}
      {showChat && <ChatPrivado universo={selectedUniverso} personajes={personajes} userId={userId} onCerrar={() => setShowChat(false)} />}

      {showMusica && (
        <div className="modal-overlay" onClick={() => setShowMusica(false)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <h3>🎵 Música de fondo</h3>
            <p style={{ color: 'var(--text2)', fontSize: '0.9rem', marginBottom: '1rem' }}>
              Pega una URL de YouTube (vídeo, playlist o mix).
            </p>
            <div className="form-group">
              <label>URL de YouTube</label>
              <input
                placeholder="https://www.youtube.com/watch?v=... o youtu.be/..."
                value={youtubeUrl}
                onChange={e => setYoutubeUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && cargarYoutube()}
                autoFocus
              />
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text3)', marginBottom: '1rem', fontStyle: 'italic' }}>
              Busca "fantasy ambient music", "RPG battle music" o "D&D tavern music" en YouTube.
            </p>
            {youtubeEmbed && (
              <button className="btn-danger btn-sm" style={{ marginBottom: '0.5rem' }} onClick={() => { setYoutubeEmbed(null); setYoutubeUrl(''); setShowMusica(false) }}>
                Quitar música
              </button>
            )}
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setShowMusica(false)}>Cancelar</button>
              <button className="btn-primary" onClick={cargarYoutube} disabled={!youtubeUrl.trim()}>Cargar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
