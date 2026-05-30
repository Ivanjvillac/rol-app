import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export default function PanelInvestigacion({ universoId, sesionId, userId, esDueno, miembrosUniverso, onCerrar }) {
  const [investigacion, setInvestigacion] = useState(null)
  const [salas, setSalas] = useState([])
  const [pistas, setPistas] = useState({}) // salaId -> []
  const [salaActiva, setSalaActiva] = useState(null)
  const [notas, setNotas] = useState('')
  const [notasGuardadas, setNotasGuardadas] = useState(false)
  const [cargando, setCargando] = useState(true)

  // Formularios narrador
  const [showNuevaSala, setShowNuevaSala] = useState(false)
  const [nombreSala, setNombreSala] = useState('')
  const [descSala, setDescSala] = useState('')
  const [editandoSala, setEditandoSala] = useState(null)

  const [showNuevaPista, setShowNuevaPista] = useState(false)
  const [tituloPista, setTituloPista] = useState('')
  const [textoPista, setTextoPista] = useState('')
  const [editandoPista, setEditandoPista] = useState(null)

  const [revelarMenuPista, setRevelarMenuPista] = useState(null) // pistaId
  const [confirmarBorrar, setConfirmarBorrar] = useState(null) // { tipo, id }

  const [nombreInv, setNombreInv] = useState('')
  const [showCrearInv, setShowCrearInv] = useState(false)

  const notasDebounce = useRef(null)

  useEffect(() => {
    cargarTodo()
  }, [universoId])

  useEffect(() => {
    if (!investigacion) return
    const unsub = supabase
      .channel(`inv-${investigacion.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'inv_pistas',
        filter: `investigacion_id=eq.${investigacion.id}`
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const p = payload.new
          setPistas(prev => ({
            ...prev,
            [p.sala_id]: [...(prev[p.sala_id] || []), p]
          }))
        } else if (payload.eventType === 'UPDATE') {
          const p = payload.new
          setPistas(prev => ({
            ...prev,
            [p.sala_id]: (prev[p.sala_id] || []).map(x => x.id === p.id ? p : x)
          }))
        } else if (payload.eventType === 'DELETE') {
          const p = payload.old
          setPistas(prev => ({
            ...prev,
            [p.sala_id]: (prev[p.sala_id] || []).filter(x => x.id !== p.id)
          }))
        }
      })
      .subscribe()
    return () => supabase.removeChannel(unsub)
  }, [investigacion?.id])

  const cargarTodo = async () => {
    setCargando(true)
    const { data: inv } = await supabase
      .from('investigaciones')
      .select('*')
      .eq('universo_id', universoId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!inv) { setCargando(false); return }
    setInvestigacion(inv)

    const { data: salasData } = await supabase
      .from('inv_salas')
      .select('*')
      .eq('investigacion_id', inv.id)
      .order('orden')
    setSalas(salasData || [])
    if (salasData?.length > 0) setSalaActiva(salasData[0].id)

    const { data: pistasData } = await supabase
      .from('inv_pistas')
      .select('*')
      .eq('investigacion_id', inv.id)
      .order('created_at')

    const grouped = {}
    for (const p of (pistasData || [])) {
      if (!grouped[p.sala_id]) grouped[p.sala_id] = []
      grouped[p.sala_id].push(p)
    }
    setPistas(grouped)

    const { data: notasData } = await supabase
      .from('inv_notas')
      .select('contenido')
      .eq('investigacion_id', inv.id)
      .eq('user_id', userId)
      .single()
    setNotas(notasData?.contenido || '')

    setCargando(false)
  }

  const crearInvestigacion = async () => {
    if (!nombreInv.trim()) return
    const { data, error } = await supabase
      .from('investigaciones')
      .insert({ universo_id: universoId, user_id: userId, nombre: nombreInv.trim() })
      .select()
      .single()
    if (!error) {
      setInvestigacion(data)
      setShowCrearInv(false)
      setNombreInv('')
    }
  }

  const crearSala = async () => {
    if (!nombreSala.trim() || !investigacion) return
    const orden = salas.length
    const { data, error } = await supabase
      .from('inv_salas')
      .insert({ investigacion_id: investigacion.id, nombre: nombreSala.trim(), descripcion: descSala.trim(), orden })
      .select()
      .single()
    if (!error) {
      setSalas(prev => [...prev, data])
      setSalaActiva(data.id)
      setShowNuevaSala(false)
      setNombreSala('')
      setDescSala('')
    }
  }

  const guardarSala = async () => {
    if (!editandoSala || !nombreSala.trim()) return
    const { data, error } = await supabase
      .from('inv_salas')
      .update({ nombre: nombreSala.trim(), descripcion: descSala.trim() })
      .eq('id', editandoSala.id)
      .select()
      .single()
    if (!error) {
      setSalas(prev => prev.map(s => s.id === data.id ? data : s))
      setEditandoSala(null)
      setNombreSala('')
      setDescSala('')
    }
  }

  const borrarSala = async (id) => {
    await supabase.from('inv_salas').delete().eq('id', id)
    setSalas(prev => {
      const nuevas = prev.filter(s => s.id !== id)
      if (salaActiva === id) setSalaActiva(nuevas[0]?.id || null)
      return nuevas
    })
    setPistas(prev => { const n = { ...prev }; delete n[id]; return n })
    setConfirmarBorrar(null)
  }

  const crearPista = async () => {
    if (!tituloPista.trim() || !salaActiva || !investigacion) return
    const { data, error } = await supabase
      .from('inv_pistas')
      .insert({
        investigacion_id: investigacion.id,
        sala_id: salaActiva,
        titulo: tituloPista.trim(),
        contenido: textoPista.trim(),
        revelada_a: []
      })
      .select()
      .single()
    if (!error) {
      setPistas(prev => ({
        ...prev,
        [salaActiva]: [...(prev[salaActiva] || []), data]
      }))
      setShowNuevaPista(false)
      setTituloPista('')
      setTextoPista('')
    }
  }

  const guardarPista = async () => {
    if (!editandoPista || !tituloPista.trim()) return
    const { data, error } = await supabase
      .from('inv_pistas')
      .update({ titulo: tituloPista.trim(), contenido: textoPista.trim() })
      .eq('id', editandoPista.id)
      .select()
      .single()
    if (!error) {
      setPistas(prev => ({
        ...prev,
        [editandoPista.sala_id]: (prev[editandoPista.sala_id] || []).map(p => p.id === data.id ? data : p)
      }))
      setEditandoPista(null)
      setTituloPista('')
      setTextoPista('')
    }
  }

  const toggleRevelar = async (pista, paraUserId) => {
    const actual = pista.revelada_a || []
    let nueva
    if (paraUserId === 'todos') {
      // Revelar/ocultar a todos los miembros no propietarios
      const todos = miembrosUniverso.map(m => m.id)
      const todosRevelados = todos.every(id => actual.includes(id))
      nueva = todosRevelados ? [] : todos
    } else {
      nueva = actual.includes(paraUserId)
        ? actual.filter(id => id !== paraUserId)
        : [...actual, paraUserId]
    }
    const { data } = await supabase
      .from('inv_pistas')
      .update({ revelada_a: nueva })
      .eq('id', pista.id)
      .select()
      .single()
    if (data) {
      setPistas(prev => ({
        ...prev,
        [pista.sala_id]: (prev[pista.sala_id] || []).map(p => p.id === data.id ? data : p)
      }))
    }
    setRevelarMenuPista(null)
  }

  const borrarPista = async (pista) => {
    await supabase.from('inv_pistas').delete().eq('id', pista.id)
    setPistas(prev => ({
      ...prev,
      [pista.sala_id]: (prev[pista.sala_id] || []).filter(p => p.id !== pista.id)
    }))
    setConfirmarBorrar(null)
  }

  const handleNotas = (val) => {
    setNotas(val)
    setNotasGuardadas(false)
    if (notasDebounce.current) clearTimeout(notasDebounce.current)
    notasDebounce.current = setTimeout(async () => {
      await supabase.from('inv_notas').upsert({
        investigacion_id: investigacion.id,
        user_id: userId,
        contenido: val
      }, { onConflict: 'investigacion_id,user_id' })
      setNotasGuardadas(true)
      setTimeout(() => setNotasGuardadas(false), 2000)
    }, 800)
  }

  const pistasSalaActiva = salaActiva ? (pistas[salaActiva] || []) : []
  const pistasVisibles = esDueno
    ? pistasSalaActiva
    : pistasSalaActiva.filter(p => (p.revelada_a || []).includes(userId))

  const todosIds = miembrosUniverso.map(m => m.id)
  const estaReveladaATodos = (pista) => todosIds.length > 0 && todosIds.every(id => (pista.revelada_a || []).includes(id))

  if (cargando) {
    return (
      <div className="modal-investigacion">
        <div className="inv-overlay" onClick={onCerrar} />
        <div className="inv-panel">
          <div className="inv-header">
            <span>🔍 Investigación</span>
            <button className="btn-cerrar-inv" onClick={onCerrar}>✕</button>
          </div>
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text3)' }}>Cargando...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-investigacion">
      <div className="inv-overlay" onClick={onCerrar} />
      <div className="inv-panel">
        <div className="inv-header">
          <span>🔍 {investigacion ? investigacion.nombre : 'Investigación'}</span>
          <button className="btn-cerrar-inv" onClick={onCerrar}>✕</button>
        </div>

        {!investigacion ? (
          <div className="inv-sin-investigacion">
            {esDueno ? (
              showCrearInv ? (
                <div className="inv-crear-form">
                  <p style={{ color: 'var(--text2)', marginBottom: '0.8rem' }}>Nombre de la investigación:</p>
                  <input
                    placeholder="Ej: El asesinato en la mansión..."
                    value={nombreInv}
                    onChange={e => setNombreInv(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && crearInvestigacion()}
                    autoFocus
                  />
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
                    <button className="btn-primary" onClick={crearInvestigacion}>Crear</button>
                    <button className="btn-ghost" onClick={() => setShowCrearInv(false)}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <p style={{ color: 'var(--text3)', marginBottom: '1rem' }}>No hay ninguna investigación activa.</p>
                  <button className="btn-primary" onClick={() => setShowCrearInv(true)}>+ Nueva investigación</button>
                </div>
              )
            ) : (
              <p style={{ color: 'var(--text3)', textAlign: 'center' }}>El Narrador no ha iniciado ninguna investigación todavía.</p>
            )}
          </div>
        ) : (
          <div className="inv-body">
            {/* Panel izquierdo: salas */}
            <div className="inv-salas">
              <div className="inv-salas-header">
                <span>Escenas</span>
                {esDueno && <button className="btn-sm" onClick={() => { setShowNuevaSala(true); setEditandoSala(null); setNombreSala(''); setDescSala('') }}>+</button>}
              </div>

              {salas.map(sala => (
                <div
                  key={sala.id}
                  className={`inv-sala-item${salaActiva === sala.id ? ' activa' : ''}`}
                  onClick={() => setSalaActiva(sala.id)}
                >
                  <div className="inv-sala-nombre">{sala.nombre}</div>
                  {sala.descripcion && <div className="inv-sala-desc">{sala.descripcion}</div>}
                  {esDueno && salaActiva === sala.id && (
                    <div className="inv-sala-acciones" onClick={e => e.stopPropagation()}>
                      <button className="btn-sm" onClick={() => { setEditandoSala(sala); setNombreSala(sala.nombre); setDescSala(sala.descripcion || ''); setShowNuevaSala(false) }}>✏️</button>
                      <button className="btn-sm danger" onClick={() => setConfirmarBorrar({ tipo: 'sala', id: sala.id })}>🗑</button>
                    </div>
                  )}
                </div>
              ))}

              {salas.length === 0 && (
                <p style={{ color: 'var(--text3)', fontSize: '0.82rem', padding: '0.5rem' }}>Sin escenas. {esDueno ? 'Añade una.' : ''}</p>
              )}
            </div>

            {/* Panel derecho: pistas */}
            <div className="inv-pistas">
              <div className="inv-pistas-header">
                <span>Pistas{salaActiva ? ` · ${salas.find(s => s.id === salaActiva)?.nombre || ''}` : ''}</span>
                {esDueno && salaActiva && (
                  <button className="btn-sm" onClick={() => { setShowNuevaPista(true); setEditandoPista(null); setTituloPista(''); setTextoPista('') }}>+</button>
                )}
              </div>

              <div className="inv-pistas-lista">
                {pistasVisibles.length === 0 && (
                  <p style={{ color: 'var(--text3)', fontSize: '0.82rem', padding: '0.5rem' }}>
                    {esDueno ? 'Sin pistas. Añade una.' : 'Ninguna pista revelada aquí.'}
                  </p>
                )}

                {pistasVisibles.map(pista => {
                  const revelada = estaReveladaATodos(pista)
                  const parcial = !revelada && (pista.revelada_a || []).length > 0
                  return (
                    <div key={pista.id} className={`inv-pista-item${esDueno ? '' : ' revelada'}`}>
                      <div className="inv-pista-titulo">{pista.titulo}</div>
                      {pista.contenido && <div className="inv-pista-contenido">{pista.contenido}</div>}

                      {!esDueno && (
                        <div className="inv-pista-tag">
                          {revelada ? '🌍 Revelada a todos' : `🔒 Solo para ti`}
                        </div>
                      )}

                      {esDueno && (
                        <div className="inv-pista-acciones">
                          <div className="inv-pista-estado">
                            {revelada ? <span className="inv-tag todos">🌍 Todos</span>
                              : parcial ? <span className="inv-tag parcial">🔒 {(pista.revelada_a || []).length} jugador{(pista.revelada_a || []).length > 1 ? 'es' : ''}</span>
                              : <span className="inv-tag oculta">🔒 Oculta</span>}
                          </div>
                          <button className="btn-sm" onClick={() => setRevelarMenuPista(revelarMenuPista === pista.id ? null : pista.id)}>👁</button>
                          <button className="btn-sm" onClick={() => { setEditandoPista(pista); setTituloPista(pista.titulo); setTextoPista(pista.contenido || ''); setShowNuevaPista(false) }}>✏️</button>
                          <button className="btn-sm danger" onClick={() => setConfirmarBorrar({ tipo: 'pista', pista })}>🗑</button>
                        </div>
                      )}

                      {esDueno && revelarMenuPista === pista.id && (
                        <div className="inv-revelar-menu" onClick={e => e.stopPropagation()}>
                          <div className="inv-revelar-titulo">Revelar a:</div>
                          <button
                            className={`inv-revelar-btn${estaReveladaATodos(pista) ? ' activo' : ''}`}
                            onClick={() => toggleRevelar(pista, 'todos')}
                          >
                            🌍 Todos
                          </button>
                          {miembrosUniverso.map(m => (
                            <button
                              key={m.id}
                              className={`inv-revelar-btn${(pista.revelada_a || []).includes(m.id) ? ' activo' : ''}`}
                              onClick={() => toggleRevelar(pista, m.id)}
                            >
                              👤 {m.nombre || m.email || 'Jugador'}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Notas privadas */}
              <div className="inv-notas">
                <div className="inv-notas-label">
                  📝 Mis notas privadas
                  {notasGuardadas && <span className="inv-notas-guardadas">✓ guardado</span>}
                </div>
                <textarea
                  className="inv-notas-textarea"
                  placeholder="Escribe aquí tus apuntes, sospechas o deducciones... Solo tú puedes verlos. Se guardan automáticamente."
                  value={notas}
                  onChange={e => handleNotas(e.target.value)}
                  rows={4}
                />
              </div>
            </div>
          </div>
        )}

        {/* Sub-modal: nueva/editar sala */}
        {(showNuevaSala || editandoSala) && (
          <div className="inv-submodal-overlay" onClick={() => { setShowNuevaSala(false); setEditandoSala(null) }}>
            <div className="inv-submodal" onClick={e => e.stopPropagation()}>
              <h4>{editandoSala ? 'Editar escena' : 'Nueva escena'}</h4>
              <div className="form-group">
                <label>Nombre</label>
                <input
                  placeholder="Ej: Biblioteca, Jardín..."
                  value={nombreSala}
                  onChange={e => setNombreSala(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (editandoSala ? guardarSala() : crearSala())}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Descripción (opcional)</label>
                <input
                  placeholder="Breve descripción del lugar..."
                  value={descSala}
                  onChange={e => setDescSala(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
                <button className="btn-primary" onClick={editandoSala ? guardarSala : crearSala}>
                  {editandoSala ? 'Guardar' : 'Crear'}
                </button>
                <button className="btn-ghost" onClick={() => { setShowNuevaSala(false); setEditandoSala(null) }}>Cancelar</button>
              </div>
            </div>
          </div>
        )}

        {/* Sub-modal: nueva/editar pista */}
        {(showNuevaPista || editandoPista) && (
          <div className="inv-submodal-overlay" onClick={() => { setShowNuevaPista(false); setEditandoPista(null) }}>
            <div className="inv-submodal" onClick={e => e.stopPropagation()}>
              <h4>{editandoPista ? 'Editar pista' : 'Nueva pista'}</h4>
              <div className="form-group">
                <label>Título</label>
                <input
                  placeholder="Ej: Carta ensangrentada..."
                  value={tituloPista}
                  onChange={e => setTituloPista(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Descripción (opcional)</label>
                <textarea
                  placeholder="Detalles sobre la pista..."
                  value={textoPista}
                  onChange={e => setTextoPista(e.target.value)}
                  rows={3}
                />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
                <button className="btn-primary" onClick={editandoPista ? guardarPista : crearPista}>
                  {editandoPista ? 'Guardar' : 'Crear'}
                </button>
                <button className="btn-ghost" onClick={() => { setShowNuevaPista(false); setEditandoPista(null) }}>Cancelar</button>
              </div>
            </div>
          </div>
        )}

        {/* Confirmación borrar */}
        {confirmarBorrar && (
          <div className="inv-submodal-overlay" onClick={() => setConfirmarBorrar(null)}>
            <div className="inv-submodal" onClick={e => e.stopPropagation()}>
              <h4>¿Eliminar {confirmarBorrar.tipo === 'sala' ? 'esta escena y todas sus pistas' : 'esta pista'}?</h4>
              <p style={{ color: 'var(--text3)', fontSize: '0.85rem', marginBottom: '1rem' }}>Esta acción no se puede deshacer.</p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn-danger" onClick={() => confirmarBorrar.tipo === 'sala' ? borrarSala(confirmarBorrar.id) : borrarPista(confirmarBorrar.pista)}>
                  Eliminar
                </button>
                <button className="btn-ghost" onClick={() => setConfirmarBorrar(null)}>Cancelar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
