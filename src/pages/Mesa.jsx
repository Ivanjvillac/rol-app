import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import SelectorImagenSticker from '../components/SelectorImagenSticker'
import FichaPersonaje from '../components/FichaPersonaje'
import PanelInvestigacion from '../components/PanelInvestigacion'
import PanelGaleria from '../components/PanelGaleria'
import PanelMisiones from '../components/PanelMisiones'
import PanelDadoEvento from '../components/PanelDadoEvento'
import { jsPDF } from 'jspdf'
import { parseMessage } from '../lib/parseMessage'
import { useMesaTimer } from '../features/mesa/hooks/useMesaTimer'
import { useMesaPresence } from '../features/mesa/hooks/useMesaPresence'
import { useMesaMusic } from '../features/mesa/hooks/useMesaMusic'

const abrirUrlSegura = (url) => {
  if (!url || !url.startsWith('https://')) return
  window.open(url, '_blank', 'noopener,noreferrer')
}

const renderMensaje = (texto, miNombre) => {
  if (!texto) return null
  const parsed = parseMessage(texto, miNombre)
  return parsed.map((chunk, ci) => {
    const inner = chunk.segments.map((seg, si) => (
      <span key={si} className={seg.classes.join(' ') || undefined}>{seg.text}</span>
    ))
    if (chunk.type === 'dialogo') {
      return <span key={ci} className="msg-dialogo">«{inner}»</span>
    }
    return <span key={ci} className="msg-accion">{inner}</span>
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
  const marcarLeido = async (id) => await supabase.from('mensajes_privados').update({ leido: true }).eq('id', id).eq('destinatario_user_id', userId)
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
                          {m.imagen_url && <img src={m.imagen_url} alt="imagen" style={{ maxWidth: '180px', borderRadius: '8px', cursor: 'pointer' }} onClick={() => abrirUrlSegura(m.imagen_url)} />}
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
  const { getPersonajesDeUniverso, addEntrada, getSesion, cargarSesion, suscribirMesa, invitarUsuario, getInvitaciones, esPropietario, userId, cargarListaSesiones, crearSesion, eliminarSesion, listaSesiones, editarEntrada, borrarEntrada, getPerfil, backupUniverso, transferirPropiedad, updatePersonaje } = useApp()

  const [personajeActivo, setPersonajeActivo] = useState(null)
  const [texto, setTexto] = useState('')
  const [modoEntrada, setModoEntrada] = useState('dialogo')
  const [tono, setTono] = useState('normal')
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
  const [mostrarIrAbajo, setMostrarIrAbajo] = useState(false)
  const [showInvestigacion, setShowInvestigacion] = useState(false)
  const [showGaleria, setShowGaleria] = useState(false)
  const [showMisiones, setShowMisiones] = useState(false)
  const [showDadoEvento, setShowDadoEvento] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [showDados, setShowDados] = useState(false)
  const [fichaCompartida, setFichaCompartida] = useState(null)
  const [showResumen, setShowResumen] = useState(false)
  const [resumenTexto, setResumenTexto] = useState('')
  const [reacciones, setReacciones] = useState({})
  const [showReacciones, setShowReacciones] = useState(null)
  const [notifsSesion, setNotifsSesion] = useState({})
  const [notifsMenciones, setNotifsMenciones] = useState(0)
  const [miNombrePerfil, setMiNombrePerfil] = useState('')
  const [modoCompleto, setModoCompleto] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(null) // personaje a cambiar color
  const [fijadas, setFijadas] = useState({})
  const [respondiendo, setRespondiendo] = useState(null) // entrada a la que se responde
  const [mencionSugerencias, setMencionSugerencias] = useState([])
  const [nivelTension, setNivelTension] = useState(1)
  const historialRef = useRef(null)
  const endRef = useRef(null)               // div centinela al final del historial
  const isAtBottomRef = useRef(true)        // actualizado en onScroll, siempre fresco
  const inputRef = useRef(null)
  const timeoutEscribiendoRef = useRef(null)
  const debounceRef = useRef(null)
  const fijadosRef = useRef(null)
  const canalFichaRef = useRef(null)

  const [sesionesConMiembros, setSesionesConMiembros] = useState([])
  const [kickedFrom, setKickedFrom] = useState(null) // nombre de la sala de la que fuiste expulsado
  const [seccionSesiones, setSeccionSesiones] = useState(true)
  const [seccionPersonajes, setSeccionPersonajes] = useState(true)
  const [seccionConectados, setSeccionConectados] = useState(true)
  const [seccionOpciones, setSeccionOpciones] = useState(false)
  const [seccionAyuda, setSeccionAyuda] = useState(false)

  const personajes = useMemo(() => {
    const todos = selectedUniverso ? getPersonajesDeUniverso(selectedUniverso.id) : []
    return todos.filter(p => !p.oculto || p.user_id === userId)
  }, [selectedUniverso?.id, getPersonajesDeUniverso, userId])

  const sesionCompleta = useMemo(() =>
    sesionActiva ? getSesion(sesionActiva.id) : [],
    [sesionActiva?.id, getSesion]
  )

  const sesion = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return sesionCompleta
    return sesionCompleta.filter(e =>
      e.contenido?.toLowerCase().includes(q) ||
      e.personaje_nombre?.toLowerCase().includes(q)
    )
  }, [sesionCompleta, busqueda])

  const esDueno = useMemo(() =>
    selectedUniverso ? esPropietario(selectedUniverso.id) : false,
    [selectedUniverso?.id, esPropietario]
  )

  const sesiones = useMemo(() =>
    sesionesConMiembros.filter(s =>
      !s.es_privada || s.user_id === userId || (s.miembros || []).includes(userId)
    ),
    [sesionesConMiembros, userId]
  )

  const {
    timerFin, timerLabel, setTimerLabel, timerDisplay,
    timerMinutos, setTimerMinutos, timerSegundos, setTimerSegundos,
    showTimerConfig, setShowTimerConfig,
    iniciarTimer, detenerTimer,
  } = useMesaTimer(selectedUniverso)

  const {
    usuariosConectados, otrosEscribiendo, emitirEscribiendo,
    canalPresenciaRef, canalEscribiendoRef,
  } = useMesaPresence(selectedUniverso, userId, sesionActiva, personajeActivo)

  const {
    musicaUrl, showMusica, setShowMusica,
    youtubeUrl, setYoutubeUrl,
    cargarYoutube, quitarMusica,
    canalMusicaRef, playerRef,
  } = useMesaMusic(sesionActiva, esDueno)

  // O(1) lookup for reply-to previews (replaces O(n²) .find() inside render loop)
  const entradaMap = useMemo(() =>
    new Map(sesionCompleta.map(e => [e.id, e])),
    [sesionCompleta]
  )

  const entradasFijadas = useMemo(() =>
    sesionCompleta.filter(e => fijadas[e.id]),
    [sesionCompleta, fijadas]
  )

  const tiradas = useMemo(() =>
    sesionCompleta.filter(e => e.tipo === 'dado'),
    [sesionCompleta]
  )

  // Precompute children map so sidebar avoids O(n²) nested filter
  const sesionesHijas = useMemo(() => {
    const map = new Map()
    sesiones.forEach(s => {
      if (s.padre_id) {
        if (!map.has(s.padre_id)) map.set(s.padre_id, [])
        map.get(s.padre_id).push(s)
      }
    })
    return map
  }, [sesiones])

  // Stats modal computation — runs once per sesionCompleta change, not on every re-render
  const statsData = useMemo(() => {
    const entradas = sesionCompleta
    let narrador = 0, dialogo = 0, accion = 0, dado = 0, palabras = 0
    const porPersonaje = {}
    for (const e of entradas) {
      if (e.tipo === 'narrador') narrador++
      else if (e.tipo === 'dialogo') dialogo++
      else if (e.tipo === 'accion') accion++
      else if (e.tipo === 'dado') dado++
      const wc = e.contenido?.split(/\s+/).filter(Boolean).length || 0
      palabras += wc
      if (e.personaje_nombre) {
        const k = e.personaje_nombre
        if (!porPersonaje[k]) porPersonaje[k] = { nombre: k, color: e.personaje_color, count: 0, palabras: 0 }
        porPersonaje[k].count++
        porPersonaje[k].palabras += wc
      }
    }
    return {
      total: entradas.length,
      palabras,
      porTipo: { narrador, dialogo, accion, dado },
      rankPersonajes: Object.values(porPersonaje).sort((a, b) => b.count - a.count),
    }
  }, [sesionCompleta])

  useEffect(() => {
    if (!userId) return
    supabase.from('perfiles').select('nombre').eq('id', userId).maybeSingle()
      .then(({ data }) => { if (data?.nombre) setMiNombrePerfil(data.nombre) })
  }, [userId])

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
    const cargarMiembros = async () => {
      const { data } = await supabase.from('miembros').select('user_id').eq('universo_id', selectedUniverso.id)
      const ids = (data || []).map(m => m.user_id)
      if (ids.length === 0) { setMiembrosUniverso([]); setUsuariosUniverso([]); return }
      const { data: perfs } = await supabase.from('perfiles').select('id, nombre').in('id', ids)
      setMiembrosUniverso(perfs || [])
      setUsuariosUniverso(perfs || [])
    }
    cargarSesionesConMiembros()
    cargarMiembros()
  }, [selectedUniverso?.id])

  // ── Realtime: cambios en sesion_miembros que afectan al usuario actual ──
  // Actualiza el sidebar sin F5 cuando te añaden o expulsan de una sesión privada
  useEffect(() => {
    if (!selectedUniverso?.id || !userId) return
    const canal = supabase
      .channel(`miembros-sidebar-${selectedUniverso.id}-${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'sesion_miembros',
        filter: `user_id=eq.${userId}`,
      }, async (payload) => {
        const sesionId = payload.new?.sesion_id
        if (!sesionId) return
        // Comprobar si ya la tenemos en el estado
        setSesionesConMiembros(prev => {
          if (prev.some(s => s.id === sesionId)) return prev
          return prev // la cargamos async abajo
        })
        // Cargar la sesión completa con sus miembros
        const { data } = await supabase
          .from('sesiones')
          .select('*, sesion_miembros(user_id)')
          .eq('id', sesionId)
          .single()
        if (!data) return
        const sesFormateada = { ...data, miembros: (data.sesion_miembros || []).map(m => m.user_id) }
        setSesionesConMiembros(prev => {
          if (prev.some(s => s.id === sesionId)) return prev
          return [...prev, sesFormateada]
        })
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'sesion_miembros',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        const sesionId = payload.old?.sesion_id
        if (!sesionId) return
        setSesionesConMiembros(prev => prev.filter(s => s.id !== sesionId))
      })
      .subscribe()
    return () => supabase.removeChannel(canal)
  }, [selectedUniverso?.id, userId])

  // ── Realtime: sesiones públicas nuevas creadas por otros en el universo ──
  useEffect(() => {
    if (!selectedUniverso?.id) return
    const canal = supabase
      .channel(`sesiones-pub-${selectedUniverso.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'sesiones',
        filter: `universo_id=eq.${selectedUniverso.id}`,
      }, (payload) => {
        const nueva = payload.new
        if (!nueva || nueva.es_privada) return // las privadas se manejan vía sesion_miembros
        setSesionesConMiembros(prev => {
          if (prev.some(s => s.id === nueva.id)) return prev
          return [...prev, { ...nueva, miembros: [] }]
        })
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'sesiones',
        filter: `universo_id=eq.${selectedUniverso.id}`,
      }, (payload) => {
        const id = payload.old?.id
        if (!id) return
        setSesionesConMiembros(prev => prev.filter(s => s.id !== id))
      })
      .subscribe()
    return () => supabase.removeChannel(canal)
  }, [selectedUniverso?.id])

  // ── Realtime: expulsión (kick) de la sesión activa ──
  useEffect(() => {
    if (!sesionActiva?.id || !userId) return
    const canal = supabase
      .channel(`kick-${sesionActiva.id}-${userId}`)
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'sesion_miembros',
        filter: `sesion_id=eq.${sesionActiva.id}`,
      }, (payload) => {
        if (payload.old?.user_id !== userId) return
        // El usuario actual ha sido expulsado
        setKickedFrom(sesionActiva.nombre)
        setSesionActiva(null)
        // Los demás canales (entradas, reacciones, etc.) se limpian solos al cambiar sesionActiva
        setTimeout(() => setKickedFrom(null), 6000)
      })
      .subscribe()
    return () => supabase.removeChannel(canal)
  }, [sesionActiva?.id, userId])

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
    supabase.from('sesiones').select('nivel_tension').eq('id', sesionActiva.id).single()
      .then(({ data }) => { if (data?.nivel_tension) setNivelTension(data.nivel_tension) })
    cargarSesion(sesionActiva.id)
    const unsub = suscribirMesa(selectedUniverso.id, sesionActiva.id, () => {})
    return unsub
  }, [sesionActiva?.id])

  // Sincronizar --nivel-tension como variable CSS global
  useEffect(() => {
    document.documentElement.style.setProperty('--nivel-tension', nivelTension)
  }, [nivelTension])

  // Suscripción Realtime a UPDATE en sesiones (nivel_tension)
  useEffect(() => {
    if (!sesionActiva?.id) return
    const canal = supabase
      .channel(`tension-${sesionActiva.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'sesiones',
        filter: `id=eq.${sesionActiva.id}`
      }, (payload) => {
        const nt = payload.new?.nivel_tension
        if (nt !== undefined) setNivelTension(nt)
      })
      .subscribe()
    return () => supabase.removeChannel(canal)
  }, [sesionActiva?.id])

  useEffect(() => {
    if (!selectedUniverso || !userId) return
    const channel = supabase
      .channel(`notif-${selectedUniverso.id}-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes_privados', filter: `universo_id=eq.${selectedUniverso.id}` }, (payload) => {
        const m = payload.new
        if (m.destinatario_user_id === userId) {
          const remitente = personajes.find(p => p.id === m.remitente_id)
          const remNombre = remitente?.nombre || 'Alguien'
          const notif = { id: m.id, texto: `${remNombre} te ha enviado un mensaje privado`, color: remitente?.color || 'var(--accent)' }
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3')
          audio.volume = 0.3
          audio.play().catch(() => {})
          if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
            new Notification(`🔒 Mensaje de ${remNombre}`, { body: m.contenido?.slice(0, 80) || 'Mensaje privado', icon: '/favicon.ico', silent: false })
          }
          setNotificaciones(prev => [...prev, notif])
          setTieneNoLeidos(true)
          setTimeout(() => setNotificaciones(prev => prev.filter(n => n.id !== notif.id)), 5000)
        }
      }).subscribe()
    return () => supabase.removeChannel(channel)
  }, [selectedUniverso?.id, userId])

  // Canal broadcast para fichas compartidas
  useEffect(() => {
    if (!selectedUniverso?.id) return
    const canal = supabase
      .channel(`ficha-${selectedUniverso.id}`)
      .on('broadcast', { event: 'mostrar_ficha' }, ({ payload }) => {
        if (payload.personaje) setFichaCompartida(payload.personaje)
      })
      .on('broadcast', { event: 'cerrar_ficha' }, () => {
        setFichaCompartida(null)
      })
      .subscribe()
    canalFichaRef.current = canal
    return () => { supabase.removeChannel(canal); canalFichaRef.current = null }
  }, [selectedUniverso?.id])

  // Solicitar permiso para notificaciones del navegador al entrar a Mesa
  useEffect(() => {
    if (!userId) return
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [userId])

  // ── AUTO-SCROLL ──
  // Al cambiar de sesión: siempre ir al final usando useLayoutEffect
  // (garantiza que el DOM ya pintó antes de scrollear)
  useLayoutEffect(() => {
    if (!sesionActiva || !endRef.current) return
    endRef.current.scrollIntoView({ behavior: 'instant' })
    isAtBottomRef.current = true
  }, [sesionActiva?.id])

  // Cuando llegan nuevos mensajes: solo scrollear si el usuario ya está abajo
  useLayoutEffect(() => {
    if (!sesionActiva || !endRef.current) return
    if (isAtBottomRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [sesion.length])

  const isAtBottom = () => {
    if (!historialRef.current) return true
    const { scrollTop, scrollHeight, clientHeight } = historialRef.current
    return scrollHeight - scrollTop - clientHeight < 120
  }

  const handleScroll = () => {
    if (!historialRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = historialRef.current
    const distancia = scrollHeight - scrollTop - clientHeight
    isAtBottomRef.current = distancia < 120   // actualizar ref en tiempo real
    setMostrarIrAbajo(distancia > 200)
  }

  const irAbajo = () => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
    isAtBottomRef.current = true
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
    // Detectar @ para sugerencias de mención
    const match = val.match(/@([\w\s]*)$/)
    if (match) {
      const query = match[1].toLowerCase()
      const sugs = miembrosUniverso.filter(m => m.nombre?.toLowerCase().includes(query) && m.id !== userId)
      setMencionSugerencias(sugs.slice(0, 5))
    } else {
      setMencionSugerencias([])
    }
  }

  const insertarMencion = (nombre) => {
    const nuevoTexto = texto.replace(/@[\w\s]*$/, `@${nombre} `)
    setTexto(nuevoTexto)
    setMencionSugerencias([])
    inputRef.current?.focus()
  }

  const enviar = async () => {
    if (!sesionActiva) return
    const t = texto.trim()
    if (!t) return
    let entrada = null
    if (t.startsWith('/')) {
      // Intentar parsear como comando (/narrador, /me, /accion, /personaje...)
      entrada = procesarComando(t)
      // Si no es un comando reconocido (ej: shortcodes /s/ /g/ /p/), tratar como mensaje normal
      if (!entrada) {
        if (modoEntrada === 'narrador' || !personajeActivo) entrada = { tipo: 'narrador', contenido: t, personaje: null }
        else entrada = { tipo: modoEntrada, contenido: t, personaje: personajeActivo }
      }
    } else if (modoEntrada === 'narrador' || !personajeActivo) entrada = { tipo: 'narrador', contenido: t, personaje: null }
    else entrada = { tipo: modoEntrada, contenido: t, personaje: personajeActivo }
    entrada.tono = tono
    // Auto-formato diálogo: si el modo es diálogo y el texto no tiene comillas propias,
    // envolverlo automáticamente para que el parser lo trate como fragmento de diálogo.
    // Si el usuario ya escribió comillas (formato manual) o usa shortcodes puros (/s/…/s/), no tocar.
    if (
      entrada.tipo === 'dialogo' &&
      !entrada.contenido.includes('"') &&
      !entrada.contenido.trim().startsWith('/s/') &&
      !entrada.contenido.trim().startsWith('/g/') &&
      !entrada.contenido.trim().startsWith('/p/')
    ) {
      entrada.contenido = `"${entrada.contenido}"`
    }
    if (respondiendo) { entrada.responder_a_id = respondiendo.id; }
    // Detectar menciones @Nombre y guardarlas
    const mencionados = [...t.matchAll(/@(\w[\w\s]*?)(?=\s|$|[.,!?])/g)].map(m => m[1].trim())
    const { data: nuevaEntrada } = await addEntradaConReturn(selectedUniverso.id, entrada, sesionActiva.id)
    if (nuevaEntrada && mencionados.length > 0) {
      for (const nombre of mencionados) {
        const miembro = miembrosUniverso.find(m => m.nombre?.toLowerCase().includes(nombre.toLowerCase()))
        if (miembro && miembro.id !== userId) {
          await supabase.from('menciones').insert({ entrada_id: nuevaEntrada.id, usuario_mencionado_id: miembro.id })
        }
      }
    }
    setTexto(''); setComandoSugerido(null); setRespondiendo(null); setMencionSugerencias([])
    emitirEscribiendo(false)
    inputRef.current?.focus()
  }

  const addEntradaConReturn = async (universoId, entrada, sesionId) => {
    const { data } = await supabase.from('entradas').insert({
      universo_id: universoId, user_id: userId,
      tipo: entrada.tipo, contenido: entrada.contenido || '',
      imagen_url: entrada.imagen_url || null,
      personaje_nombre: entrada.personaje?.nombre || null,
      personaje_color: entrada.personaje?.color || null,
      personaje_iniciales: entrada.personaje?.iniciales || null,
      personaje_avatar_url: entrada.personaje?.avatar_url || null,
      sesion_id: sesionId || null,
      tono: entrada.tono || 'normal',
      responder_a_id: entrada.responder_a_id || null,
    }).select().single()
    return { data }
  }

  const enviarImagen = async (url) => {
    if (!sesionActiva) return
    const tipo = modoEntrada === 'narrador' || !personajeActivo ? 'narrador' : modoEntrada
    await addEntrada(selectedUniverso.id, { tipo, contenido: '', imagen_url: url, personaje: personajeActivo }, sesionActiva.id)
  }

  // Detectar si es dispositivo táctil/móvil
  const esTactil = () => window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { setRespondiendo(null); setMencionSugerencias([]) }
    if (mencionSugerencias.length > 0 && e.key === 'Enter') { e.preventDefault(); insertarMencion(mencionSugerencias[0].nombre); return }
    // En móvil/táctil, Enter siempre inserta salto de línea
    if (e.key === 'Enter' && !e.shiftKey && !esTactil()) { e.preventDefault(); enviar() }
  }

  const insertarFormato = (tipo) => {
    const ta = inputRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const seleccion = texto.slice(start, end)
    let antes, despues
    if (tipo === 'negrita')         { antes = '**'; despues = '**' }
    else if (tipo === 'subrayado')   { antes = '__'; despues = '__' }
    else if (tipo === 'accion-inline') { antes = '*'; despues = '*' }
    else if (tipo === 'susurro')     { antes = '/s/'; despues = '/s/' }
    else if (tipo === 'grito')       { antes = '/g/'; despues = '/g/' }
    else if (tipo === 'pensamiento') { antes = '/p/'; despues = '/p/' }
    else return
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

  const compartirFicha = (personaje) => {
    canalFichaRef.current?.send({ type: 'broadcast', event: 'mostrar_ficha', payload: { personaje } })
    setFichaPersonaje(personaje) // también la abre localmente para el narrador
  }

  const cerrarFichaCompartida = () => {
    canalFichaRef.current?.send({ type: 'broadcast', event: 'cerrar_ficha', payload: {} })
    setFichaCompartida(null)
  }

  const abrirResumen = () => {
    const entradas = sesionCompleta.filter(e => e.tipo !== 'dado')
    if (entradas.length === 0) { setResumenTexto('La sesión está vacía.'); setShowResumen(true); return }

    const escenas = []
    let escenaActual = null

    for (const e of entradas) {
      if (e.tipo === 'narrador') {
        if (escenaActual) escenas.push(escenaActual)
        escenaActual = { titulo: (e.contenido || 'Escena').slice(0, 120), participantes: new Set(), palabrasClave: [] }
      } else if (escenaActual) {
        if (e.personaje_nombre) escenaActual.participantes.add(e.personaje_nombre)
        if (e.tipo === 'accion' && e.contenido) escenaActual.palabrasClave.push(e.contenido.slice(0, 60))
      }
    }
    if (escenaActual) escenas.push(escenaActual)

    let texto = `📜 ${sesionActiva?.nombre || 'Resumen de sesión'}\n${'─'.repeat(40)}\n\n`

    if (escenas.length === 0) {
      const hablantes = [...new Set(entradas.filter(e => e.personaje_nombre).map(e => e.personaje_nombre))]
      texto += `Participantes: ${hablantes.join(', ') || '—'}\n${entradas.length} entradas en total.\n`
    } else {
      escenas.forEach((esc, i) => {
        texto += `🎬 Escena ${i + 1}: ${esc.titulo}${esc.titulo.length >= 120 ? '…' : ''}\n`
        if (esc.participantes.size > 0) texto += `  Participantes: ${[...esc.participantes].join(', ')}\n`
        if (esc.palabrasClave.length > 0) texto += `  Acciones: ${esc.palabrasClave.slice(0, 2).join(' / ')}\n`
        texto += '\n'
      })
    }

    const palabrasTotales = entradas.reduce((acc, e) => acc + (e.contenido?.split(/\s+/).filter(Boolean).length || 0), 0)
    texto += `─\n${escenas.length} escenas · ${entradas.length} entradas · ~${palabrasTotales} palabras`

    setResumenTexto(texto)
    setShowResumen(true)
  }

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

  // Log de sistema cuando el máster edita stats de un personaje
  const handleStatEdit = async (nombrePersonaje, nombreStat, valorAntes, valorDespues) => {
    if (!sesionActiva) return
    const contenido = `⚔️ El Máster ha modificado [${nombrePersonaje}]: ${nombreStat} ${valorAntes} → ${valorDespues}`
    await supabase.from('entradas').insert({
      universo_id: selectedUniverso.id,
      user_id: userId,
      tipo: 'narrador',
      contenido,
      sesion_id: sesionActiva.id,
      tono: 'normal',
    })
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

  const agruparReacciones = useMemo(() => {
    const result = {}
    for (const [entradaId, rs] of Object.entries(reacciones)) {
      const grupos = {}
      rs.forEach(r => { if (!grupos[r.emoji]) grupos[r.emoji] = []; grupos[r.emoji].push(r.user_id) })
      result[entradaId] = Object.entries(grupos).map(([emoji, uids]) => ({ emoji, count: uids.length, mia: uids.includes(userId) }))
    }
    return result
  }, [reacciones, userId])

  // ── FIJAR ENTRADAS (estado local, sin depender del store del contexto) ──
  const cargarFijadas = async (entradas) => {
    const ids = (entradas || []).map(e => e.id)
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

  // Realtime para menciones
  useEffect(() => {
    if (!userId) return
    const canal = supabase
      .channel(`menciones-${userId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'menciones',
        filter: `usuario_mencionado_id=eq.${userId}`
      }, (payload) => {
        setNotifsMenciones(prev => prev + 1)
        // Toast visual
        const entradaId = payload.new.entrada_id
        const notif = { id: Date.now(), texto: '📣 Te han mencionado', entradaId }
        setNotificaciones(prev => [...prev, notif])
        setTimeout(() => setNotificaciones(prev => prev.filter(n => n.id !== notif.id)), 4000)
        // Notificación del navegador
        if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
          new Notification('📣 Te han mencionado en la mesa', { body: 'Alguien te ha mencionado con @tu_nombre', icon: '/favicon.ico', silent: false })
        }
      })
      .subscribe()
    return () => supabase.removeChannel(canal)
  }, [userId])
  useEffect(() => {
    if (!sesionActiva?.id) return
    const canal = supabase
      .channel(`reacciones-${sesionActiva.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reacciones' }, (payload) => {
        const r = payload.new
        if (r.user_id === userId) return // ya lo tenemos localmente
        setReacciones(prev => ({
          ...prev,
          [r.entrada_id]: [...(prev[r.entrada_id] || []).filter(x => x.id !== r.id), r]
        }))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'reacciones' }, (payload) => {
        const r = payload.old
        setReacciones(prev => ({
          ...prev,
          [r.entrada_id]: (prev[r.entrada_id] || []).filter(x => x.id !== r.id)
        }))
      })
      .subscribe()
    return () => supabase.removeChannel(canal)
  }, [sesionActiva?.id])

  // Realtime para fijadas (UPDATE en entradas)
  useEffect(() => {
    if (!sesionActiva?.id) return
    const canal = supabase
      .channel(`fijadas-${sesionActiva.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'entradas',
        filter: `sesion_id=eq.${sesionActiva.id}`
      }, (payload) => {
        const e = payload.new
        if (e.fijada !== undefined) {
          setFijadas(prev => ({ ...prev, [e.id]: !!e.fijada }))
        }
      })
      .subscribe()
    return () => supabase.removeChannel(canal)
  }, [sesionActiva?.id])

  // Limpiar notifs y cargar reacciones/fijadas al entrar a sesión
  useEffect(() => {
    if (!sesionActiva?.id) return
    setNotifsSesion(prev => { const n = { ...prev }; delete n[sesionActiva.id]; return n })
    // Cargar reacciones con el pequeño delay habitual
    setTimeout(() => cargarReacciones(), 400)
    // Cargar fijadas directamente con los datos ya disponibles en `sesion`
    // (sesion se carga sincrónicamente antes de que este effect corra por segunda vez)
    if (sesion.length > 0) {
      cargarFijadas(sesion)
    }
  }, [sesionActiva?.id])

  // Cargar fijadas también cuando sesion se llena por primera vez (carga inicial tras F5)
  useEffect(() => {
    if (sesion.length > 0 && Object.keys(fijadas).length === 0) {
      cargarFijadas(sesion)
    }
  }, [sesion.length])

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
                  {(sesionesHijas.get(s.id) || []).map(sub => (
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
                    {esMio && (
                      <div style={{ display: 'flex', gap: '0.15rem' }}>
                        <button className="ficha-btn" title={p.oculto ? 'Mostrar' : 'Ocultar'}
                          onClick={e => { e.stopPropagation(); updatePersonaje(p.id, { oculto: !p.oculto }) }}>
                          {p.oculto ? '👁️' : '🙈'}
                        </button>
                        <button className="ficha-btn" title="Cambiar color"
                          onClick={e => { e.stopPropagation(); setShowColorPicker(showColorPicker === p.id ? null : p.id) }}>
                          🎨
                        </button>
                        <button className="ficha-btn" onClick={e => { e.stopPropagation(); setFichaPersonaje(p) }}>📋</button>
                      </div>
                    )}
                    {!esMio && <button className="ficha-btn" onClick={e => { e.stopPropagation(); setFichaPersonaje(p) }}>📋</button>}
                    {showColorPicker === p.id && (
                      <div style={{ position: 'absolute', right: '2.5rem', background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 'var(--radius)', padding: '0.4rem', display: 'flex', gap: '0.3rem', zIndex: 50, boxShadow: 'var(--shadow)' }}
                        onClick={e => e.stopPropagation()}>
                        {['#e74c3c','#e67e22','#f1c40f','#2ecc71','#1abc9c','#3498db','#9b59b6','#e91e63'].map(c => (
                          <button key={c} onClick={() => { updatePersonaje(p.id, { color: c }); setShowColorPicker(null) }}
                            style={{ width: '18px', height: '18px', borderRadius: '50%', background: c, border: c === p.color ? '2px solid white' : '2px solid transparent', cursor: 'pointer', padding: 0 }} />
                        ))}
                      </div>
                    )}
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
                      {esDueno && <button className="ficha-btn" title="Mostrar ficha a todos" onClick={e => { e.stopPropagation(); compartirFicha(p) }}>👁</button>}
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

        {/* Medidor de Tensión — visible cuando el usuario está en modo Narrador */}
        {sesionActiva && !personajeActivo && modoEntrada === 'narrador' && (
          <div className="sidebar-section tension-section">
            <h4 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>⚡ Tensión</span>
              <span className="tension-valor" data-nivel={nivelTension}>{nivelTension}</span>
            </h4>
            <input
              id="slider-tension"
              type="range"
              min="1"
              max="10"
              value={nivelTension}
              className="tension-slider"
              onChange={e => {
                const val = Number(e.target.value)
                setNivelTension(val)
                clearTimeout(debounceRef.current)
                debounceRef.current = setTimeout(async () => {
                  await supabase.from('sesiones').update({ nivel_tension: val }).eq('id', sesionActiva.id)
                }, 300)
              }}
            />
            <div className="tension-labels">
              <span>Calma</span>
              <span>Caos</span>
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
              {(tieneNoLeidos || notifsMenciones > 0) && <span className="notif-dot" />}
              {notifsMenciones > 0 && <span style={{ background: '#e74c3c', color: 'white', borderRadius: '999px', fontSize: '0.65rem', padding: '0.1rem 0.4rem', fontWeight: 700, marginLeft: '0.2rem' }}>{notifsMenciones}</span>}
            </button>
            {esDueno && <button className="modo-btn" style={{ marginTop: '0.4rem' }} onClick={abrirInvitar}>✉️ Invitar jugador</button>}
            <button className="modo-btn" style={{ marginTop: '0.4rem' }} onClick={() => setShowMusica(true)}>🎵 Música{musicaUrl ? ' ▶' : ''}</button>
            <button className="modo-btn" style={{ marginTop: '0.4rem' }} onClick={() => setShowInvestigacion(true)} disabled={!selectedUniverso}>🔍 Investigación</button>
            <button className="modo-btn" style={{ marginTop: '0.4rem' }} onClick={() => setShowMisiones(true)} disabled={!selectedUniverso}>📋 Misiones</button>
            <button className="modo-btn" style={{ marginTop: '0.4rem' }} onClick={() => setShowGaleria(true)} disabled={!selectedUniverso}>🖼️ Galería</button>
            <button className="modo-btn" style={{ marginTop: '0.4rem' }} onClick={() => setShowDadoEvento(true)} disabled={!selectedUniverso}>🎲 Dado de evento</button>
            {esDueno && <button className="modo-btn" style={{ marginTop: '0.4rem' }} onClick={abrirResumen} disabled={!sesionActiva}>📜 Resumen de sesión</button>}
            {esDueno && <button className="modo-btn" style={{ marginTop: '0.4rem' }} onClick={() => setShowTimerConfig(true)} disabled={!selectedUniverso}>⏱️ Temporizador{timerDisplay ? ` · ${timerDisplay}` : ''}</button>}
            {musicaUrl && (
              <div style={{ marginTop: '0.6rem', borderRadius: 'var(--radius)', overflow: 'hidden', position: 'relative', background: '#000' }}>
                {/* El div#yt-music-player es convertido en iframe por el YT IFrame API */}
                <div id="yt-music-player" style={{ width: '100%', height: '52px' }} />
                {esDueno && (
                  <button onClick={quitarMusica}
                    style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(0,0,0,0.7)', border: 'none', color: 'white', borderRadius: '3px', padding: '1px 5px', fontSize: '0.7rem', cursor: 'pointer', lineHeight: 1.4 }}>✕</button>
                )}
              </div>
            )}
          </>)}
        </div>

        {/* Sección Ayuda */}
        <div className="sidebar-section">
          <h4 style={{ cursor: 'pointer', userSelect: 'none', marginBottom: seccionAyuda ? '0.6rem' : 0 }} onClick={() => setSeccionAyuda(p => !p)}>
            {seccionAyuda ? '▾' : '▸'} Ayuda
          </h4>
          {seccionAyuda && (
            <div style={{ fontSize: '0.8rem' }}>
              <p style={{ color: 'var(--text3)', fontStyle: 'italic', marginBottom: '0.7rem' }}>Comandos disponibles en el chat:</p>
              {[
                { cmd: '/narrador texto', desc: 'Escribe como narrador' },
                { cmd: '/me acción', desc: 'Acción del personaje activo' },
                { cmd: '/d4, /d6, /d8', desc: 'Tirar dado de 4, 6 u 8 caras' },
                { cmd: '/d10, /d12, /d20', desc: 'Tirar dado de 10, 12 o 20 caras' },
                { cmd: '/d100', desc: 'Tirar dado percentil' },
                { cmd: '@Nombre', desc: 'Mencionar a un jugador' },
              ].map(({ cmd, desc }) => (
                <div key={cmd} style={{ padding: '0.35rem 0', borderBottom: '1px solid var(--border)' }}>
                  <code style={{ background: 'var(--bg3)', padding: '0.1rem 0.4rem', borderRadius: '4px', color: 'var(--accent)', fontSize: '0.75rem', display: 'block', marginBottom: '0.2rem' }}>{cmd}</code>
                  <span style={{ color: 'var(--text3)' }}>{desc}</span>
                </div>
              ))}
              <div style={{ marginTop: '0.7rem', padding: '0.5rem', background: 'var(--bg3)', borderRadius: 'var(--radius)', fontSize: '0.75rem', color: 'var(--text3)' }}>
                <p style={{ marginBottom: '0.3rem' }}>✍️ <strong style={{ color: 'var(--text2)' }}>Formato de texto:</strong></p>
                <p>**negrita** · *cursiva* · __subrayado__</p>
              </div>
            </div>
          )}
        </div>
      </aside>

      <main className={`mesa-main${modoCompleto ? ' mesa-completa' : ''}`}>
        <div className="mesa-header">
          <button className="btn-menu-sidebar" onClick={() => setSidebarAbierto(prev => !prev)}>{sidebarAbierto ? '✕' : '☰'}</button>
          <div style={{ flex: 1 }}>
            <h3>{selectedUniverso.nombre}</h3>
            {sesionActiva && <small style={{ color: 'var(--text3)', fontSize: '0.75rem' }}># {sesionActiva.nombre}</small>}
          </div>
          {timerDisplay && (
            <div className={`timer-badge${timerDisplay.includes('¡Tiempo') ? ' tiempo' : ''}`} onClick={() => esDueno && setShowTimerConfig(true)} title={timerLabel}>
              ⏱️ {timerDisplay}
            </div>
          )}
          {sesionActiva && (
            <div className="buscador-historial">
              <input placeholder="🔍 Buscar..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
              {busqueda && <button onClick={() => setBusqueda('')}>✕</button>}
            </div>
          )}
          {sesionActiva && entradasFijadas.length > 0 && (
            <button
              id="btn-fijadas-header"
              title="Ir a mensajes fijados"
              onClick={() => fijadosRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: '1rem', padding: '0.2rem 0.4rem', position: 'relative' }}
            >
              📌
              <span style={{ position: 'absolute', top: '-2px', right: '-2px', background: 'var(--accent)', color: '#000', borderRadius: '999px', fontSize: '0.55rem', padding: '0 3px', fontWeight: 700, lineHeight: '1.4' }}>{entradasFijadas.length}</span>
            </button>
          )}
          <button title={modoCompleto ? 'Salir de pantalla completa' : 'Pantalla completa'}
            onClick={() => setModoCompleto(p => !p)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: '1rem', padding: '0.2rem 0.4rem' }}>
            {modoCompleto ? '⊠' : '⛶'}
          </button>
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
            <div ref={fijadosRef} style={{ background: 'rgba(180,140,60,0.08)', border: '1px solid rgba(180,140,60,0.2)', borderRadius: 'var(--radius)', margin: '0.5rem 0 1rem', padding: '0.6rem 1rem' }}>
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
              {e.responder_a_id && (() => {
                const ref = entradaMap.get(e.responder_a_id)
                if (!ref) return null
                return (
                  <div style={{ margin: '0.3rem 0.8rem 0', padding: '0.3rem 0.6rem', background: 'rgba(180,140,60,0.08)', borderLeft: '3px solid var(--accent)', borderRadius: '0 4px 4px 0', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--text3)' }}
                    onClick={() => document.getElementById(`entrada-${ref.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
                    {ref.personaje_nombre && <span style={{ color: ref.personaje_color, fontFamily: 'Cinzel, serif', marginRight: '0.3rem' }}>{ref.personaje_nombre}:</span>}
                    <span style={{ fontStyle: 'italic' }}>{ref.contenido?.slice(0, 60)}{ref.contenido?.length > 60 ? '…' : ''}</span>
                  </div>
                )
              })()}
              {e.tipo === 'narrador' && (
                <div className="entrada-narrador">
                  <span className="entrada-label">📖 Narrador</span>
                  {e.contenido && <p className={e.tono && e.tono !== 'normal' ? `entrada-tono-${e.tono}` : ''}>{renderMensaje(e.contenido, miNombrePerfil)}</p>}
                  {e.imagen_url && <img src={e.imagen_url} alt="imagen" style={{ maxWidth: '240px', borderRadius: '8px', marginTop: '0.4rem', cursor: 'pointer' }} onClick={() => abrirUrlSegura(e.imagen_url)} />}
                  <span className="entrada-hora">{formatHora(e.timestamp)}{e.editado && <span className="entrada-editado"> · editado</span>}</span>
                  {e.user_id === userId && (
                    <div className="entrada-acciones">
                      {e.contenido && <button onClick={() => setEditandoEntrada({ id: e.id, contenido: e.contenido })}>✏️</button>}
                      <button onClick={() => setConfirmDeleteEntrada(e)}>🗑️</button>
                    </div>
                  )}
                </div>
              )}
              {(e.tipo === 'dialogo' || e.tipo === 'accion') && (() => {
                const chunks = e.contenido ? parseMessage(e.contenido, miNombrePerfil) : []
                const esTipoDialogo = e.tipo === 'dialogo'
                const containerClass = esTipoDialogo
                  ? `entrada-dialogo${e.tono && e.tono !== 'normal' ? ` entrada-tono-${e.tono}` : ''}`
                  : `entrada-accion${e.tono && e.tono !== 'normal' ? ` entrada-tono-${e.tono}` : ''}`

                const avatar = e.personaje?.avatar_url
                  ? <img src={e.personaje.avatar_url} alt={e.personaje.nombre} className="entrada-avatar avatar-img" />
                  : <div className="entrada-avatar" style={{ background: e.personaje?.color }}>{e.personaje?.iniciales}</div>

                // Render the content blocks (diálogo + inline-action dentro de una sola burbuja)
                const renderChunks = (
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
                      return (
                        <span key={ci} className="burbuja-dialogo-texto">{inner}</span>
                      )
                    })}
                  </div>
                )

                const acciones = e.user_id === userId && (
                  <div className="entrada-acciones">
                    {e.contenido && <button onClick={() => setEditandoEntrada({ id: e.id, contenido: e.contenido })}>✏️</button>}
                    <button onClick={() => setConfirmDeleteEntrada(e)}>🗑️</button>
                  </div>
                )
                const hora = (
                  <span className="entrada-hora">{formatHora(e.timestamp)}{e.editado && <span className="entrada-editado"> · editado</span>}</span>
                )

                if (esTipoDialogo) {
                  return (
                    <div className={containerClass}>
                      {avatar}
                      <div className="entrada-burbuja">
                        <span className="entrada-nombre" style={{ color: e.personaje?.color }}>{e.personaje?.nombre}</span>
                        {e.contenido && renderChunks}
                        {e.imagen_url && <img src={e.imagen_url} alt="imagen" onClick={() => abrirUrlSegura(e.imagen_url)} />}
                        {hora}
                        {acciones}
                      </div>
                    </div>
                  )
                }

                // Tipo acción — también en burbuja, pero con estilo de acción (cursiva, borde diferente)
                return (
                  <div className="entrada-dialogo">
                    {avatar}
                    <div className="entrada-burbuja entrada-burbuja-accion">
                      <span className="entrada-nombre" style={{ color: e.personaje?.color }}>{e.personaje?.nombre}</span>
                      {e.contenido && (
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
                            return (
                              <span key={ci} className="burbuja-accion-texto">{inner}</span>
                            )
                          })}
                        </div>
                      )}
                      {e.imagen_url && <img src={e.imagen_url} alt="imagen" onClick={() => abrirUrlSegura(e.imagen_url)} />}
                      {hora}
                      {acciones}
                    </div>
                  </div>
                )
              })()}
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

              {/* Botones hover — fuera de burbujas, posición absoluta respecto a .entrada */}
              {e.tipo !== 'dado' && (
                <div className="entrada-acciones-hover">
                  <div style={{ position: 'relative' }}>
                    <button onClick={() => setShowReacciones(showReacciones === e.id ? null : e.id)} title="Reaccionar">＋😊</button>
                    {showReacciones === e.id && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 'var(--radius)', padding: '0.4rem', display: 'flex', gap: '0.3rem', zIndex: 200, boxShadow: 'var(--shadow)' }}>
                        {EMOJIS_RAPIDOS.map(em => (
                          <button key={em} onClick={() => toggleReaccion(e.id, em)}
                            style={{ background: 'none', border: 'none', fontSize: '1.1rem', cursor: 'pointer', padding: '0.1rem', borderRadius: '4px' }}>{em}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button onClick={() => { setRespondiendo(e); inputRef.current?.focus() }} title="Responder">↩️</button>
                  {(e.user_id === userId || esDueno) && (
                    <button onClick={() => toggleFijar(e)} title={fijadas[e.id] ? 'Desfijar' : 'Fijar'}
                      style={{ color: fijadas[e.id] ? 'var(--accent)' : undefined }}>
                      {fijadas[e.id] ? '📌' : '📍'}
                    </button>
                  )}
                </div>
              )}

              {/* Reacciones */}
              {e.tipo !== 'dado' && (
                <>
                  {/* Pills de reacciones existentes — siempre visibles */}
                  {(agruparReacciones[e.id] || []).length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', padding: '0.1rem 0.8rem 0.3rem' }}>
                      {(agruparReacciones[e.id] || []).map(({ emoji, count, mia }) => (
                        <button key={emoji} onClick={() => toggleReaccion(e.id, emoji)}
                          style={{ background: mia ? 'rgba(180,140,60,0.15)' : 'var(--bg3)', border: `1px solid ${mia ? 'var(--accent)' : 'var(--border)'}`, borderRadius: '999px', padding: '0.1rem 0.5rem', fontSize: '0.82rem', cursor: 'pointer', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                          {emoji} <span style={{ fontSize: '0.75rem', color: mia ? 'var(--accent)' : 'var(--text3)' }}>{count}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
          {/* Div centinela: marca el final del historial para scrollIntoView */}
          <div ref={endRef} style={{ height: 0 }} />
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


        {/* Panel responder */}
        {respondiendo && (
          <div style={{ padding: '0.4rem 1rem', background: 'rgba(180,140,60,0.08)', borderTop: '1px solid rgba(180,140,60,0.2)', display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.82rem' }}>
            <span style={{ color: 'var(--accent)' }}>↩️ Respondiendo a</span>
            {respondiendo.personaje_nombre && <span style={{ color: respondiendo.personaje_color, fontFamily: 'Cinzel, serif' }}>{respondiendo.personaje_nombre}:</span>}
            <span style={{ color: 'var(--text3)', fontStyle: 'italic', flex: 1 }}>{respondiendo.contenido?.slice(0, 50)}…</span>
            <button onClick={() => setRespondiendo(null)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
          </div>
        )}
        {/* Sugerencias de menciones */}
        {mencionSugerencias.length > 0 && (
          <div style={{ padding: '0.3rem 1rem', background: 'var(--bg2)', borderTop: '1px solid var(--border)', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {mencionSugerencias.map(m => (
              <button key={m.id} onClick={() => insertarMencion(m.nombre)}
                style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0.2rem 0.6rem', fontSize: '0.82rem', cursor: 'pointer', color: 'var(--text)' }}>
                @{m.nombre}
              </button>
            ))}
          </div>
        )}
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
            <button type="button" className="formato-btn" onClick={() => insertarFormato('subrayado')} title="Subrayado"><u>S</u></button>
            <div className="tono-separador" />
            <button type="button" className="formato-btn formato-btn-accion-inline" onClick={() => insertarFormato('accion-inline')} title="Acción inline — envuelve el texto entre *asteriscos* para mostrarla dentro de la burbuja">⚡ Acción</button>
            <div className="tono-separador" />
            <button type="button" className="formato-btn formato-btn-atajo" onClick={() => insertarFormato('susurro')} title="Susurro — /s/ texto /s/">🤫</button>
            <button type="button" className="formato-btn formato-btn-atajo" onClick={() => insertarFormato('grito')} title="Grito — /g/ texto /g/">📢</button>
            <button type="button" className="formato-btn formato-btn-atajo" onClick={() => insertarFormato('pensamiento')} title="Pensamiento — /p/ texto /p/">💭</button>

            {personajeActivo && (
              <>
                <div className="tono-separador" />
                <button
                  id="btn-modo-accion"
                  type="button"
                  className={`tono-btn${modoEntrada === 'accion' ? ' activo' : ''}`}
                  onClick={() => setModoEntrada(modoEntrada === 'accion' ? 'dialogo' : 'accion')}
                  title={modoEntrada === 'accion' ? 'Modo: Acción (click para Diálogo)' : 'Cambiar a Acción'}
                  style={{ fontSize: '1rem' }}
                >⚡</button>
              </>
            )}
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
        {kickedFrom && (
          <div className="notif-toast notif-toast-kick">
            <span>🚫 Has sido expulsado de <strong>«{kickedFrom}»</strong></span>
            <button onClick={() => setKickedFrom(null)}>✕</button>
          </div>
        )}
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

      {showStats && sesionActiva && statsData && (
        <div className="modal-overlay" onClick={() => setShowStats(false)}>
          <div className="modal" style={{ maxWidth: '520px' }} onClick={e => e.stopPropagation()}>
            <h3>📊 Estadísticas — {sesionActiva.nombre}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem', margin: '1.2rem 0' }}>
              {[
                { label: 'Entradas', valor: statsData.total, icono: '📝' },
                { label: 'Palabras', valor: statsData.palabras, icono: '✍️' },
                { label: 'Dados', valor: statsData.porTipo.dado, icono: '🎲' },
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
                { label: 'Narrador', count: statsData.porTipo.narrador, icono: '📖', color: 'var(--narrador)' },
                { label: 'Diálogo', count: statsData.porTipo.dialogo, icono: '💬', color: 'var(--accent)' },
                { label: 'Acción', count: statsData.porTipo.accion, icono: '⚡', color: '#e67e22' },
              ].map(({ label, count, icono, color }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
                  <span style={{ width: '70px', fontSize: '0.82rem', color: 'var(--text2)' }}>{icono} {label}</span>
                  <div style={{ flex: 1, height: '6px', background: 'var(--bg3)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: statsData.total ? `${(count / statsData.total) * 100}%` : '0%', height: '100%', background: color, borderRadius: '3px', transition: 'width 0.4s' }} />
                  </div>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text2)', minWidth: '28px', textAlign: 'right' }}>{count}</span>
                </div>
              ))}
            </div>
            {statsData.rankPersonajes.length > 0 && (
              <div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text3)', fontFamily: 'Cinzel, serif', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.6rem' }}>Participación por personaje</p>
                {statsData.rankPersonajes.map((p, i) => (
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
      )}

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
                      {(() => {
                        const texto = r.contenido || ''
                        const idx = texto.toLowerCase().indexOf(busquedaGlobal.toLowerCase())
                        if (idx === -1) return texto.slice(0, 120)
                        const inicio = Math.max(0, idx - 30)
                        const fin = Math.min(texto.length, idx + busquedaGlobal.length + 60)
                        const antes = texto.slice(inicio, idx)
                        const coincide = texto.slice(idx, idx + busquedaGlobal.length)
                        const despues = texto.slice(idx + busquedaGlobal.length, fin)
                        return <>{inicio > 0 ? '…' : ''}{antes}<mark style={{ background: 'rgba(180,140,60,0.4)', color: 'var(--text)', borderRadius: '2px', padding: '0 2px' }}>{coincide}</mark>{despues}{fin < texto.length ? '…' : ''}</>
                      })()}
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

      {fichaPersonaje && <FichaPersonaje
        personaje={fichaPersonaje}
        userId={userId}
        onCerrar={() => setFichaPersonaje(null)}
        esDueno={esDueno}
        onStatEdit={handleStatEdit}
      />}

      {fichaCompartida && (
        <div className="modal-overlay" onClick={() => setFichaCompartida(null)}>
          <div onClick={e => e.stopPropagation()} style={{ position: 'relative' }}>
            <div className="ficha-compartida-banner">
              <span>👁 El narrador muestra esta ficha</span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {esDueno && <button className="btn-sm danger" onClick={cerrarFichaCompartida}>✕ Cerrar para todos</button>}
                <button className="btn-sm" onClick={() => setFichaCompartida(null)}>✕ Cerrar</button>
              </div>
            </div>
            <FichaPersonaje
              personaje={fichaCompartida}
              userId={userId}
              onCerrar={() => setFichaCompartida(null)}
              esDueno={false}
              onStatEdit={() => {}}
            />
          </div>
        </div>
      )}
      {showChat && <ChatPrivado universo={selectedUniverso} personajes={personajes} userId={userId} onCerrar={() => setShowChat(false)} />}

      {showInvestigacion && selectedUniverso && (
        <PanelInvestigacion
          universoId={selectedUniverso.id}
          sesionId={sesionActiva?.id}
          userId={userId}
          esDueno={esDueno}
          miembrosUniverso={miembrosUniverso}
          onCerrar={() => setShowInvestigacion(false)}
        />
      )}

      {showGaleria && selectedUniverso && (
        <PanelGaleria universoId={selectedUniverso.id} onCerrar={() => setShowGaleria(false)} />
      )}

      {showMisiones && selectedUniverso && (
        <PanelMisiones universoId={selectedUniverso.id} userId={userId} esDueno={esDueno} onCerrar={() => setShowMisiones(false)} />
      )}

      {showDadoEvento && selectedUniverso && (
        <PanelDadoEvento
          universoId={selectedUniverso.id}
          userId={userId}
          esDueno={esDueno}
          onPublicarResultado={(texto) => { addEntrada(selectedUniverso.id, { tipo: 'narrador', contenido: texto }, sesionActiva?.id); setShowDadoEvento(false) }}
          onCerrar={() => setShowDadoEvento(false)}
        />
      )}

      {showTimerConfig && esDueno && selectedUniverso && (
        <div className="modal-overlay" onClick={() => setShowTimerConfig(false)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <h3>⏱️ Temporizador</h3>
            <div className="form-group">
              <label>Etiqueta (opcional)</label>
              <input placeholder="Ej: Decide ya, Turno de combate..." value={timerLabel} onChange={e => setTimerLabel(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: '0.8rem', marginBottom: '1rem' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Minutos</label>
                <input type="number" min="0" max="99" value={timerMinutos} onChange={e => setTimerMinutos(e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Segundos</label>
                <input type="number" min="0" max="59" value={timerSegundos} onChange={e => setTimerSegundos(e.target.value)} />
              </div>
            </div>
            {timerDisplay && (
              <div className="timer-badge" style={{ marginBottom: '1rem', justifyContent: 'center', display: 'flex' }}>⏱️ {timerDisplay}</div>
            )}
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setShowTimerConfig(false)}>Cerrar</button>
              {timerFin && <button className="btn-ghost" style={{ color: 'var(--danger)' }} onClick={detenerTimer}>Detener</button>}
              <button className="btn-primary" onClick={iniciarTimer}>Iniciar</button>
            </div>
          </div>
        </div>
      )}

      {showResumen && (
        <div className="modal-overlay" onClick={() => setShowResumen(false)}>
          <div className="modal" style={{ maxWidth: '560px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📜 Resumen de sesión</h3>
              <button onClick={() => setShowResumen(false)}>✕</button>
            </div>
            <pre style={{ fontFamily: 'inherit', whiteSpace: 'pre-wrap', fontSize: '0.88rem', color: 'var(--text2)', background: 'var(--bg3)', padding: '1rem', borderRadius: 'var(--radius)', maxHeight: '400px', overflowY: 'auto', lineHeight: 1.7, margin: '0 0 1rem' }}>
              {resumenTexto}
            </pre>
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setShowResumen(false)}>Cerrar</button>
              <button className="btn-ghost" onClick={() => { navigator.clipboard?.writeText(resumenTexto).catch(() => {}) }}>📋 Copiar</button>
              {sesionActiva && (
                <button className="btn-primary" onClick={() => {
                  addEntrada(selectedUniverso.id, { tipo: 'narrador', contenido: resumenTexto }, sesionActiva.id)
                  setShowResumen(false)
                }}>📢 Publicar en mesa</button>
              )}
            </div>
          </div>
        </div>
      )}

      {showMusica && (
        <div className="modal-overlay" onClick={() => setShowMusica(false)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <h3>🎵 Música de fondo</h3>

            {/* Estado actual de la música */}
            {musicaUrl && (
              <div style={{ background: 'rgba(180,140,60,0.08)', border: '1px solid rgba(180,140,60,0.2)', borderRadius: 'var(--radius)', padding: '0.6rem 0.8rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.1rem' }}>▶️</span>
                <span style={{ fontSize: '0.82rem', color: 'var(--text2)', wordBreak: 'break-all' }}>{musicaUrl.length > 50 ? musicaUrl.slice(0, 50) + '…' : musicaUrl}</span>
              </div>
            )}

            {/* Control de cambio — solo para el dueño del universo */}
            {esDueno ? (
              <>
                <p style={{ color: 'var(--text2)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                  Pega una URL de YouTube (vídeo, playlist o mix).
                </p>
                <div className="form-group">
                  <label>URL de YouTube</label>
                  <input
                    placeholder="https://www.youtube.com/watch?v=... o youtu.be/..."
                    value={youtubeUrl}
                    onChange={e => setYoutubeUrl(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && cargarYoutube(youtubeUrl)}
                    autoFocus
                  />
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text3)', marginBottom: '1rem', fontStyle: 'italic' }}>
                  Busca "fantasy ambient music", "RPG battle music" o "D&D tavern music" en YouTube.
                </p>
                {musicaUrl && (
                  <button className="btn-danger btn-sm" style={{ marginBottom: '0.5rem' }} onClick={() => { quitarMusica(); setShowMusica(false) }}>
                    Quitar música
                  </button>
                )}
                <div className="modal-actions">
                  <button className="btn-ghost" onClick={() => setShowMusica(false)}>Cancelar</button>
                  <button className="btn-primary" onClick={() => cargarYoutube(youtubeUrl)} disabled={!youtubeUrl.trim()}>Cargar</button>
                </div>
              </>
            ) : (
              <>
                {!musicaUrl && <p style={{ color: 'var(--text3)', fontStyle: 'italic', fontSize: '0.9rem' }}>El narrador no ha puesto música todavía.</p>}
                {musicaUrl && <p style={{ color: 'var(--text2)', fontSize: '0.9rem' }}>La música suena en la barra lateral. El narrador controla la reproducción.</p>}
                <div className="modal-actions">
                  <button className="btn-ghost" onClick={() => setShowMusica(false)}>Cerrar</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
