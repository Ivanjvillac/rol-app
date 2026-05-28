import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import PanelJuramentos from './PanelJuramentos'

export default function FichaPersonaje({ personaje, userId, onCerrar }) {
  const [atributos, setAtributos] = useState([])
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoValor, setNuevoValor] = useState('')
  const [editando, setEditando] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [pestana, setPestana] = useState('ficha')

  const esMio = personaje.user_id === userId

  useEffect(() => {
    cargarAtributos()
  }, [personaje.id])

  const cargarAtributos = async () => {
    setCargando(true)
    const { data } = await supabase
      .from('atributos')
      .select('*')
      .eq('personaje_id', personaje.id)
      .order('orden')
    setAtributos(data || [])
    setCargando(false)
  }

  const agregarAtributo = async () => {
    if (!nuevoNombre.trim() || !nuevoValor.trim()) return
    const { data, error } = await supabase
      .from('atributos')
      .insert({
        personaje_id: personaje.id,
        nombre: nuevoNombre.trim(),
        valor: nuevoValor.trim(),
        orden: atributos.length
      })
      .select()
      .single()
    if (!error) {
      setAtributos(prev => [...prev, data])
      setNuevoNombre('')
      setNuevoValor('')
    }
  }

  const actualizarAtributo = async (id, valor) => {
    await supabase.from('atributos').update({ valor }).eq('id', id)
    setAtributos(prev => prev.map(a => a.id === id ? { ...a, valor } : a))
    setEditando(null)
  }

  const eliminarAtributo = async (id) => {
    await supabase.from('atributos').delete().eq('id', id)
    setAtributos(prev => prev.filter(a => a.id !== id))
  }

  const handleKey = (e) => {
    if (e.key === 'Enter') agregarAtributo()
  }

  return (
    <div className="ficha-overlay" onClick={onCerrar}>
      <div className="ficha-panel" onClick={e => e.stopPropagation()}>
        <div className="ficha-header">
          <div className="ficha-header-info">
            {personaje.avatar_url
              ? <img src={personaje.avatar_url} alt={personaje.nombre} className="ficha-avatar" />
              : <div className="ficha-avatar-placeholder" style={{ background: personaje.color }}>{personaje.iniciales}</div>
            }
            <div>
              <h3 style={{ fontFamily: 'Cinzel, serif', color: personaje.color, fontSize: '1rem' }}>{personaje.nombre}</h3>
              <small style={{ color: 'var(--text3)' }}>{personaje.rol}</small>
            </div>
          </div>
          <button className="detalle-cerrar" onClick={onCerrar}>✕</button>
        </div>

        {/* Tabs */}
        <div className="ficha-tabs">
          <button className={pestana === 'ficha' ? 'ficha-tab active' : 'ficha-tab'} onClick={() => setPestana('ficha')}>⚔️ Ficha</button>
          <button className={pestana === 'juramentos' ? 'ficha-tab active' : 'ficha-tab'} onClick={() => setPestana('juramentos')}>🕯️ Juramentos</button>
        </div>
        <div className="ficha-body">
          {pestana === 'juramentos' && (
            <PanelJuramentos personajeId={personaje.id} esMio={esMio} />
          )}
          {pestana === 'ficha' && (cargando ? (
            <p style={{ color: 'var(--text3)', fontStyle: 'italic', textAlign: 'center', padding: '1rem' }}>Cargando...</p>
          ) : (
            <>
              {atributos.length === 0 && !esMio && (
                <p style={{ color: 'var(--text3)', fontStyle: 'italic', textAlign: 'center', padding: '1rem' }}>Sin atributos.</p>
              )}

              <div className="ficha-atributos">
                {atributos.map(a => (
                  <div key={a.id} className="ficha-atributo">
                    <span className="ficha-atributo-nombre">{a.nombre}</span>
                    {editando === a.id ? (
                      <input
                        className="ficha-atributo-input"
                        defaultValue={a.valor}
                        autoFocus
                        onBlur={e => actualizarAtributo(a.id, e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && actualizarAtributo(a.id, e.target.value)}
                      />
                    ) : (
                      <span
                        className="ficha-atributo-valor"
                        onClick={() => esMio && setEditando(a.id)}
                        style={{ cursor: esMio ? 'pointer' : 'default' }}
                      >
                        {a.valor}
                      </span>
                    )}
                    {esMio && (
                      <button className="ficha-delete-btn" onClick={() => eliminarAtributo(a.id)}>✕</button>
                    )}
                  </div>
                ))}
              </div>

              {esMio && (
                <div className="ficha-nuevo">
                  <input
                    placeholder="Atributo"
                    value={nuevoNombre}
                    onChange={e => setNuevoNombre(e.target.value)}
                    onKeyDown={handleKey}
                    className="ficha-nuevo-nombre"
                  />
                  <input
                    placeholder="Valor"
                    value={nuevoValor}
                    onChange={e => setNuevoValor(e.target.value)}
                    onKeyDown={handleKey}
                    className="ficha-nuevo-valor"
                  />
                  <button className="btn-primary btn-sm" onClick={agregarAtributo}>+</button>
                </div>
              )}

              {esMio && atributos.length > 0 && (
                <p style={{ fontSize: '0.75rem', color: 'var(--text3)', marginTop: '0.5rem', fontStyle: 'italic' }}>
                  Haz clic en un valor para editarlo
                </p>
              )}
            </>
          ))}
        </div>
      </div>
    </div>
  )
}
