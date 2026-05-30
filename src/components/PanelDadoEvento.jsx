import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

export default function PanelDadoEvento({ universoId, userId, esDueno, onPublicarResultado, onCerrar }) {
  const [tablas, setTablas] = useState([])
  const [tablaActiva, setTablaActiva] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [resultado, setResultado] = useState(null)
  const [rodando, setRodando] = useState(false)

  // Narrador — gestión de tablas
  const [showNuevaTabla, setShowNuevaTabla] = useState(false)
  const [nombreTabla, setNombreTabla] = useState('')
  const [nuevaOpcion, setNuevaOpcion] = useState('')
  const [editandoTabla, setEditandoTabla] = useState(false)
  const resultadoRef = useRef(null)

  useEffect(() => { cargar() }, [universoId])

  const cargar = async () => {
    setCargando(true)
    const { data } = await supabase.from('tablas_evento').select('*').eq('universo_id', universoId).order('created_at')
    setTablas(data || [])
    if (data?.length > 0) setTablaActiva(data[0])
    setCargando(false)
  }

  const crearTabla = async () => {
    if (!nombreTabla.trim()) return
    const { data } = await supabase.from('tablas_evento')
      .insert({ universo_id: universoId, user_id: userId, nombre: nombreTabla.trim(), opciones: [] })
      .select().single()
    if (data) { setTablas(prev => [...prev, data]); setTablaActiva(data) }
    setNombreTabla(''); setShowNuevaTabla(false)
  }

  const agregarOpcion = async () => {
    if (!nuevaOpcion.trim() || !tablaActiva) return
    const opciones = [...(tablaActiva.opciones || []), nuevaOpcion.trim()]
    const { data } = await supabase.from('tablas_evento').update({ opciones }).eq('id', tablaActiva.id).select().single()
    if (data) { setTablaActiva(data); setTablas(prev => prev.map(t => t.id === data.id ? data : t)) }
    setNuevaOpcion('')
  }

  const borrarOpcion = async (idx) => {
    const opciones = tablaActiva.opciones.filter((_, i) => i !== idx)
    const { data } = await supabase.from('tablas_evento').update({ opciones }).eq('id', tablaActiva.id).select().single()
    if (data) { setTablaActiva(data); setTablas(prev => prev.map(t => t.id === data.id ? data : t)) }
  }

  const borrarTabla = async () => {
    if (!tablaActiva) return
    await supabase.from('tablas_evento').delete().eq('id', tablaActiva.id)
    const nuevas = tablas.filter(t => t.id !== tablaActiva.id)
    setTablas(nuevas)
    setTablaActiva(nuevas[0] || null)
    setEditandoTabla(false)
  }

  const lanzar = () => {
    if (!tablaActiva?.opciones?.length) return
    setRodando(true)
    setResultado(null)
    let ticks = 0
    const total = 18
    const iv = setInterval(() => {
      const idx = Math.floor(Math.random() * tablaActiva.opciones.length)
      setResultado(tablaActiva.opciones[idx])
      ticks++
      if (ticks >= total) {
        clearInterval(iv)
        setRodando(false)
        resultadoRef.current?.classList.add('dado-resultado-final')
        setTimeout(() => resultadoRef.current?.classList.remove('dado-resultado-final'), 600)
      }
    }, ticks < 8 ? 80 : ticks < 14 ? 130 : 200)
  }

  const publicar = () => {
    if (!resultado || !onPublicarResultado) return
    onPublicarResultado(`🎲 **${tablaActiva?.nombre || 'Dado de evento'}**: ${resultado}`)
  }

  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div className="modal modal-dado" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>🎲 Dado de evento</h3>
          <button onClick={onCerrar}>✕</button>
        </div>

        {cargando ? (
          <p style={{ color: 'var(--text3)', padding: '1rem' }}>Cargando...</p>
        ) : (
          <div className="dado-body">
            {/* Selector de tabla */}
            <div className="dado-tablas">
              {tablas.map(t => (
                <button key={t.id} className={`dado-tab${tablaActiva?.id === t.id ? ' activa' : ''}`} onClick={() => { setTablaActiva(t); setResultado(null); setEditandoTabla(false) }}>
                  {t.nombre}
                </button>
              ))}
              {esDueno && (
                showNuevaTabla ? (
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    <input autoFocus placeholder="Nombre de la tabla" value={nombreTabla} onChange={e => setNombreTabla(e.target.value)} onKeyDown={e => e.key === 'Enter' && crearTabla()} style={{ fontSize: '0.85rem', padding: '0.3rem 0.6rem' }} />
                    <button className="btn-sm" onClick={crearTabla}>✓</button>
                    <button className="btn-sm" onClick={() => { setShowNuevaTabla(false); setNombreTabla('') }}>✕</button>
                  </div>
                ) : (
                  <button className="dado-tab-nueva" onClick={() => setShowNuevaTabla(true)}>+</button>
                )
              )}
            </div>

            {!tablaActiva ? (
              <div className="empty-state"><p>Crea una tabla para empezar.</p></div>
            ) : (
              <>
                {/* Zona de lanzamiento */}
                <div className="dado-lanzar-zona">
                  <div ref={resultadoRef} className={`dado-resultado${rodando ? ' rodando' : ''}${resultado ? ' tiene-resultado' : ''}`}>
                    {resultado || (tablaActiva.opciones?.length ? '?' : 'Sin opciones')}
                  </div>
                  <button
                    className="btn-primary dado-btn-lanzar"
                    onClick={lanzar}
                    disabled={rodando || !tablaActiva.opciones?.length}
                  >
                    {rodando ? '...' : '🎲 Lanzar'}
                  </button>
                  {resultado && !rodando && onPublicarResultado && (
                    <button className="btn-ghost" style={{ fontSize: '0.82rem' }} onClick={publicar}>
                      📢 Publicar en mesa
                    </button>
                  )}
                </div>

                {/* Opciones de la tabla */}
                <div className="dado-opciones">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', fontFamily: 'Cinzel, serif', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Opciones ({tablaActiva.opciones?.length || 0})
                    </span>
                    {esDueno && (
                      <div style={{ display: 'flex', gap: '0.3rem' }}>
                        <button className="btn-sm" onClick={() => setEditandoTabla(p => !p)}>{editandoTabla ? 'Listo' : '✏️ Editar'}</button>
                        {editandoTabla && <button className="btn-sm danger" onClick={borrarTabla}>🗑 Tabla</button>}
                      </div>
                    )}
                  </div>

                  {(tablaActiva.opciones || []).map((op, i) => (
                    <div key={i} className="dado-opcion-item">
                      <span>{op}</span>
                      {esDueno && editandoTabla && (
                        <button className="btn-sm danger" onClick={() => borrarOpcion(i)}>✕</button>
                      )}
                    </div>
                  ))}

                  {esDueno && editandoTabla && (
                    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem' }}>
                      <input
                        placeholder="Nueva opción..."
                        value={nuevaOpcion}
                        onChange={e => setNuevaOpcion(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && agregarOpcion()}
                        style={{ flex: 1, fontSize: '0.85rem', padding: '0.35rem 0.6rem' }}
                      />
                      <button className="btn-sm" onClick={agregarOpcion}>+</button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
