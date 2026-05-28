import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const ESTADO_CONFIG = {
  activo:   { label: 'Activo',   emoji: '🔥', color: 'var(--accent)',  clase: '' },
  cumplido: { label: 'Cumplido', emoji: '✅', color: '#2ecc71',        clase: 'juramento-cumplido' },
  roto:     { label: 'Roto',     emoji: '💔', color: '#e74c3c',        clase: 'juramento-roto' },
}

export default function PanelJuramentos({ personajeId, esMio }) {
  const [juramentos, setJuramentos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [nuevaDesc, setNuevaDesc] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [cambiandoEstado, setCambiandoEstado] = useState(null) // id del juramento con menú abierto

  useEffect(() => {
    if (!personajeId) return
    setCargando(true)
    supabase
      .from('juramentos')
      .select('*')
      .eq('personaje_id', personajeId)
      .order('creado_en', { ascending: true })
      .then(({ data }) => {
        setJuramentos(data || [])
        setCargando(false)
      })
  }, [personajeId])

  const añadir = async () => {
    const desc = nuevaDesc.trim()
    if (!desc || !esMio) return
    setGuardando(true)
    const { data } = await supabase
      .from('juramentos')
      .insert({ personaje_id: personajeId, descripcion: desc, estado: 'activo' })
      .select()
      .single()
    if (data) setJuramentos(prev => [...prev, data])
    setNuevaDesc('')
    setGuardando(false)
  }

  const cambiarEstado = async (id, nuevoEstado) => {
    await supabase.from('juramentos').update({ estado: nuevoEstado }).eq('id', id)
    setJuramentos(prev => prev.map(j => j.id === id ? { ...j, estado: nuevoEstado } : j))
    setCambiandoEstado(null)
  }

  const eliminar = async (id) => {
    await supabase.from('juramentos').delete().eq('id', id)
    setJuramentos(prev => prev.filter(j => j.id !== id))
  }

  const formatFecha = (ts) => {
    if (!ts) return ''
    return new Date(ts).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  return (
    <div className="panel-juramentos">
      {/* Formulario — solo para el dueño */}
      {esMio && (
        <div className="juramento-form">
          <textarea
            className="juramento-input"
            placeholder="Escribe un vínculo, juramento o miedo central..."
            value={nuevaDesc}
            onChange={e => setNuevaDesc(e.target.value)}
            rows={2}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); añadir() }
            }}
          />
          <button
            className="btn-primary btn-sm"
            onClick={añadir}
            disabled={!nuevaDesc.trim() || guardando}
            style={{ alignSelf: 'flex-end' }}
          >
            {guardando ? '…' : '＋ Añadir'}
          </button>
        </div>
      )}

      {/* Lista */}
      {cargando && <p className="juramento-empty">Cargando...</p>}
      {!cargando && juramentos.length === 0 && (
        <p className="juramento-empty">
          {esMio ? 'Sin juramentos todavía. Añade el primero.' : 'Este personaje no tiene juramentos registrados.'}
        </p>
      )}

      <div className="juramentos-lista">
        {juramentos.map(j => {
          const cfg = ESTADO_CONFIG[j.estado] || ESTADO_CONFIG.activo
          return (
            <div key={j.id} className={`juramento-item ${cfg.clase}`}>
              {/* Cabecera: emoji de estado + fecha + acciones */}
              <div className="juramento-header">
                <span className="juramento-estado-emoji" style={{ color: cfg.color }} title={cfg.label}>
                  {cfg.emoji}
                </span>
                <span className="juramento-fecha">{formatFecha(j.creado_en)}</span>
                <div className="juramento-acciones">
                  {/* Menú de cambio de estado */}
                  {esMio && (
                    <div className="juramento-menu-wrap">
                      <button
                        className="juramento-menu-btn"
                        onClick={() => setCambiandoEstado(cambiandoEstado === j.id ? null : j.id)}
                        title="Cambiar estado"
                      >
                        ⋯
                      </button>
                      {cambiandoEstado === j.id && (
                        <div className="juramento-dropdown">
                          {Object.entries(ESTADO_CONFIG).map(([key, { emoji, label, color }]) => (
                            <button
                              key={key}
                              className={`juramento-drop-opt${j.estado === key ? ' activo' : ''}`}
                              style={{ '--drop-color': color }}
                              onClick={() => cambiarEstado(j.id, key)}
                            >
                              {emoji} {label}
                            </button>
                          ))}
                          <div className="juramento-drop-divider" />
                          <button
                            className="juramento-drop-opt juramento-drop-delete"
                            onClick={() => { eliminar(j.id); setCambiandoEstado(null) }}
                          >
                            🗑️ Eliminar
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Descripción del juramento */}
              <p className="juramento-desc">{j.descripcion}</p>

              {/* Badge de estado */}
              <span className="juramento-badge" style={{ '--badge-color': cfg.color }}>
                {cfg.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
