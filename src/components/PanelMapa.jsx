import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useImageUpload } from '../hooks/useImageUpload'

const PIN_COLORS = [
  { label: 'Naranja', value: '#e67e22' },
  { label: 'Rojo',    value: '#e74c3c' },
  { label: 'Azul',    value: '#2980b9' },
  { label: 'Verde',   value: '#27ae60' },
  { label: 'Morado',  value: '#8e44ad' },
  { label: 'Amarillo',value: '#f1c40f' },
  { label: 'Blanco',  value: '#ecf0f1' },
  { label: 'Marrón',  value: '#795548' },
]

export default function PanelMapa({ universo, userId, esDueno, onCerrar }) {
  const [mapas, setMapas]         = useState([])
  const [mapaActual, setMapaActual] = useState(null)
  const [pins, setPins]           = useState([])
  const [cargando, setCargando]   = useState(true)

  // New-pin placement
  const [newPinPos, setNewPinPos] = useState(null)   // { x, y } percentages
  const [newPinForm, setNewPinForm] = useState({ nombre: '', descripcion: '', color: '#e67e22' })

  // Edit-pin
  const [editPin, setEditPin]     = useState(null)   // pin object being edited

  // View-pin popup (all users)
  const [viewPin, setViewPin]     = useState(null)

  // Hover tooltip
  const [hoverPin, setHoverPin]   = useState(null)

  const imgRef = useRef(null)
  const { upload, uploading } = useImageUpload('mapas', { compressionType: 'npc' })

  /* ── load maps ── */
  useEffect(() => {
    cargarMapas()
  }, [universo.id])

  const cargarMapas = async () => {
    setCargando(true)
    const { data } = await supabase
      .from('mapas')
      .select('*')
      .eq('universo_id', universo.id)
      .order('created_at')
    const lista = data || []
    setMapas(lista)
    setMapaActual(prev => {
      if (prev) {
        const still = lista.find(m => m.id === prev.id)
        return still || lista[0] || null
      }
      return lista[0] || null
    })
    setCargando(false)
  }

  /* ── load pins when map changes ── */
  useEffect(() => {
    if (!mapaActual) { setPins([]); return }
    cargarPins(mapaActual.id)
  }, [mapaActual?.id])

  const cargarPins = async (mapaId) => {
    const { data } = await supabase
      .from('mapa_pins')
      .select('*')
      .eq('mapa_id', mapaId)
      .order('created_at')
    setPins(data || [])
  }

  /* ── create map ── */
  const crearMapa = async () => {
    const nombre = window.prompt('Nombre del nuevo mapa:')
    if (!nombre?.trim()) return

    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async (e) => {
      const file = e.target.files[0]
      if (!file) return
      const path = `${universo.id}/${Date.now()}.jpg`
      const { url } = await upload(file, path)
      if (!url) return
      const { data, error } = await supabase
        .from('mapas')
        .insert({ universo_id: universo.id, nombre: nombre.trim(), imagen_url: url, user_id: userId })
        .select()
        .single()
      if (!error && data) {
        setMapas(prev => [...prev, data])
        setMapaActual(data)
      }
    }
    input.click()
  }

  /* ── delete map ── */
  const eliminarMapa = async () => {
    if (!mapaActual) return
    if (!window.confirm(`¿Eliminar el mapa "${mapaActual.nombre}"? Se borrarán todos sus pines.`)) return
    await supabase.from('mapa_pins').delete().eq('mapa_id', mapaActual.id)
    await supabase.from('mapas').delete().eq('id', mapaActual.id)
    const nuevaLista = mapas.filter(m => m.id !== mapaActual.id)
    setMapas(nuevaLista)
    setMapaActual(nuevaLista[0] || null)
    setPins([])
  }

  /* ── click on image to place pin ── */
  const handleImageClick = useCallback((e) => {
    if (!esDueno || !mapaActual) return
    // If we're clicking a pin button, don't place a new one
    if (e.target.closest('.pin-btn')) return

    const rect = imgRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setNewPinPos({ x, y })
    setNewPinForm({ nombre: '', descripcion: '', color: '#e67e22' })
    setEditPin(null)
    setViewPin(null)
  }, [esDueno, mapaActual])

  /* ── save new pin ── */
  const guardarNuevoPin = async (e) => {
    e.preventDefault()
    if (!newPinForm.nombre.trim()) return
    const pin = {
      mapa_id: mapaActual.id,
      nombre: newPinForm.nombre.trim(),
      descripcion: newPinForm.descripcion.trim(),
      color: newPinForm.color,
      x_pct: newPinPos.x,
      y_pct: newPinPos.y,
      visible: true,
    }
    const { data, error } = await supabase.from('mapa_pins').insert(pin).select().single()
    if (!error && data) {
      setPins(prev => [...prev, data])
    }
    setNewPinPos(null)
  }

  /* ── edit existing pin ── */
  const abrirEditPin = (pin, e) => {
    e.stopPropagation()
    setEditPin({ ...pin })
    setNewPinPos(null)
    setViewPin(null)
  }

  const guardarEditPin = async (e) => {
    e.preventDefault()
    const { id, nombre, descripcion, color, visible } = editPin
    setPins(prev => prev.map(p => p.id === id ? { ...p, nombre, descripcion, color, visible } : p))
    await supabase.from('mapa_pins').update({ nombre, descripcion, color, visible }).eq('id', id)
    setEditPin(null)
  }

  const eliminarPin = async (pinId, e) => {
    e?.stopPropagation()
    if (!window.confirm('¿Eliminar este pin?')) return
    setPins(prev => prev.filter(p => p.id !== pinId))
    await supabase.from('mapa_pins').delete().eq('id', pinId)
    setEditPin(null)
  }

  const toggleVisibilidad = async (pin, e) => {
    e.stopPropagation()
    const nuevo = !pin.visible
    setPins(prev => prev.map(p => p.id === pin.id ? { ...p, visible: nuevo } : p))
    await supabase.from('mapa_pins').update({ visible: nuevo }).eq('id', pin.id)
  }

  /* ── click pin to view (all users) ── */
  const verPin = (pin, e) => {
    e.stopPropagation()
    if (esDueno) return // master uses edit flow
    setViewPin(pin)
  }

  const pinsVisibles = esDueno ? pins : pins.filter(p => p.visible)

  /* ── cancel new pin on Escape ── */
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') { setNewPinPos(null); setEditPin(null); setViewPin(null) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div
        className="modal modal-mapa-mundo"
        onClick={e => e.stopPropagation()}
        style={{
          display: 'flex',
          flexDirection: 'column',
          maxWidth: '960px',
          width: '95vw',
          maxHeight: '90vh',
          background: 'var(--bg2)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.75rem 1rem',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: '1.25rem' }}>🗺️</span>
          <h3 style={{ margin: 0, color: 'var(--text)', flex: 1, fontSize: '1.1rem' }}>
            Mapa del mundo
            {mapaActual && (
              <span style={{ color: 'var(--accent)', marginLeft: '0.5rem', fontWeight: 400, fontSize: '0.95rem' }}>
                — {mapaActual.nombre}
              </span>
            )}
          </h3>

          {/* Map selector */}
          {mapas.length > 1 && (
            <select
              value={mapaActual?.id || ''}
              onChange={e => setMapaActual(mapas.find(m => m.id === e.target.value))}
              style={{
                background: 'var(--bg3)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '0.25rem 0.5rem',
                fontSize: '0.875rem',
              }}
            >
              {mapas.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
          )}

          {esDueno && (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={crearMapa}
                disabled={uploading}
                style={{
                  background: 'var(--accent)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius)',
                  padding: '0.3rem 0.7rem',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  boxShadow: uploading ? 'none' : 'var(--accent-glow)',
                }}
              >
                {uploading ? 'Subiendo…' : '+ Mapa'}
              </button>
              {mapaActual && (
                <button
                  onClick={eliminarMapa}
                  style={{
                    background: 'transparent',
                    color: 'var(--text3)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    padding: '0.3rem 0.7rem',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                  }}
                >
                  🗑
                </button>
              )}
            </div>
          )}

          <button
            onClick={onCerrar}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text3)',
              fontSize: '1.1rem',
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '1rem', position: 'relative' }}>
          {cargando ? (
            <p style={{ color: 'var(--text3)' }}>Cargando…</p>
          ) : !mapaActual ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text3)' }}>
              {esDueno ? (
                <>
                  <p style={{ marginBottom: '1rem' }}>No hay ningún mapa todavía.</p>
                  <button
                    onClick={crearMapa}
                    disabled={uploading}
                    style={{
                      background: 'var(--accent)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 'var(--radius)',
                      padding: '0.5rem 1.2rem',
                      cursor: 'pointer',
                      boxShadow: 'var(--accent-glow)',
                    }}
                  >
                    {uploading ? 'Subiendo…' : 'Subir primer mapa'}
                  </button>
                </>
              ) : (
                <p>El máster no ha creado un mapa todavía.</p>
              )}
            </div>
          ) : (
            <div style={{ position: 'relative', userSelect: 'none' }}>
              {/* Instruction for master */}
              {esDueno && (
                <p style={{ fontSize: '0.78rem', color: 'var(--text3)', marginBottom: '0.5rem' }}>
                  Haz clic en el mapa para añadir un pin.
                </p>
              )}

              {/* Image container */}
              <div
                style={{ position: 'relative', width: '100%', lineHeight: 0 }}
                onClick={handleImageClick}
              >
                <img
                  ref={imgRef}
                  src={mapaActual.imagen_url}
                  alt={mapaActual.nombre}
                  style={{
                    width: '100%',
                    display: 'block',
                    borderRadius: 'var(--radius)',
                    border: '1px solid var(--border)',
                    objectFit: 'contain',
                  }}
                  draggable={false}
                />

                {/* Pins */}
                {pinsVisibles.map(pin => (
                  <PinButton
                    key={pin.id}
                    pin={pin}
                    esDueno={esDueno}
                    hovered={hoverPin === pin.id}
                    onMouseEnter={() => setHoverPin(pin.id)}
                    onMouseLeave={() => setHoverPin(null)}
                    onClick={esDueno ? (e) => abrirEditPin(pin, e) : (e) => verPin(pin, e)}
                    onToggleVisible={(e) => toggleVisibilidad(pin, e)}
                  />
                ))}

                {/* New-pin crosshair */}
                {newPinPos && (
                  <div
                    style={{
                      position: 'absolute',
                      left: `${newPinPos.x}%`,
                      top: `${newPinPos.y}%`,
                      transform: 'translate(-50%, -50%)',
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      background: newPinForm.color,
                      border: '2px solid #fff',
                      pointerEvents: 'none',
                      opacity: 0.7,
                      boxShadow: '0 0 6px rgba(0,0,0,0.6)',
                    }}
                  />
                )}
              </div>

              {/* New-pin form */}
              {newPinPos && (
                <PinForm
                  title="Nuevo pin"
                  form={newPinForm}
                  onChange={setNewPinForm}
                  onSubmit={guardarNuevoPin}
                  onCancel={() => setNewPinPos(null)}
                />
              )}

              {/* Edit-pin form */}
              {editPin && (
                <PinForm
                  title="Editar pin"
                  form={editPin}
                  onChange={setEditPin}
                  onSubmit={guardarEditPin}
                  onCancel={() => setEditPin(null)}
                  onDelete={(e) => eliminarPin(editPin.id, e)}
                  showVisibility
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* View-pin popup (players) */}
      {viewPin && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
          onClick={() => setViewPin(null)}
        >
          <div
            style={{
              background: 'var(--bg2)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '1.25rem 1.5rem',
              maxWidth: '360px',
              width: '90vw',
              boxShadow: 'var(--shadow)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <span style={{
                display: 'inline-block',
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: viewPin.color,
                border: '2px solid #fff',
                flexShrink: 0,
              }} />
              <strong style={{ color: 'var(--text)' }}>{viewPin.nombre}</strong>
              <button
                onClick={() => setViewPin(null)}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}
              >✕</button>
            </div>
            {viewPin.descripcion && (
              <p style={{ color: 'var(--text2)', margin: 0, fontSize: '0.9rem', lineHeight: 1.5 }}>
                {viewPin.descripcion}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Pin button ── */
function PinButton({ pin, esDueno, hovered, onMouseEnter, onMouseLeave, onClick, onToggleVisible }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: `${pin.x_pct}%`,
        top: `${pin.y_pct}%`,
        transform: 'translate(-50%, -50%)',
        zIndex: 10,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Tooltip */}
      {hovered && (
        <div style={{
          position: 'absolute',
          bottom: '130%',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.85)',
          color: '#fff',
          fontSize: '0.75rem',
          padding: '3px 8px',
          borderRadius: 4,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          zIndex: 20,
        }}>
          {pin.nombre}
        </div>
      )}

      <button
        className="pin-btn"
        onClick={onClick}
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: pin.color,
          border: '2px solid #fff',
          cursor: 'pointer',
          padding: 0,
          opacity: (!pin.visible) ? 0.4 : 1,
          boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
          transition: 'transform 0.1s',
          transform: hovered ? 'scale(1.35)' : 'scale(1)',
        }}
        title={pin.nombre}
      />

      {/* Visibility toggle (master only) */}
      {esDueno && hovered && (
        <button
          className="pin-btn"
          onClick={onToggleVisible}
          style={{
            position: 'absolute',
            top: '110%',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.7)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            color: '#fff',
            fontSize: '0.65rem',
            padding: '2px 5px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            zIndex: 20,
          }}
        >
          {pin.visible ? '🙈 Ocultar' : '👁 Mostrar'}
        </button>
      )}
    </div>
  )
}

/* ── Pin form (new / edit) ── */
function PinForm({ title, form, onChange, onSubmit, onCancel, onDelete, showVisibility }) {
  return (
    <form
      onSubmit={onSubmit}
      onClick={e => e.stopPropagation()}
      style={{
        marginTop: '1rem',
        background: 'var(--bg3)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '0.875rem 1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.6rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <strong style={{ color: 'var(--text)', fontSize: '0.875rem' }}>{title}</strong>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: '0.8rem' }}
          >
            🗑 Eliminar
          </button>
        )}
      </div>

      <input
        type="text"
        placeholder="Nombre (requerido)"
        value={form.nombre}
        onChange={e => onChange(f => ({ ...f, nombre: e.target.value }))}
        required
        style={inputStyle}
        autoFocus
      />

      <textarea
        placeholder="Descripción (opcional)"
        value={form.descripcion}
        onChange={e => onChange(f => ({ ...f, descripcion: e.target.value }))}
        rows={2}
        style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
      />

      {/* Color picker */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--text3)' }}>Color:</span>
        {PIN_COLORS.map(c => (
          <button
            key={c.value}
            type="button"
            title={c.label}
            onClick={() => onChange(f => ({ ...f, color: c.value }))}
            style={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: c.value,
              border: form.color === c.value ? '2.5px solid #fff' : '2px solid transparent',
              outline: form.color === c.value ? '2px solid var(--accent)' : 'none',
              cursor: 'pointer',
              padding: 0,
              flexShrink: 0,
            }}
          />
        ))}
      </div>

      {showVisibility && (
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text2)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={form.visible}
            onChange={e => onChange(f => ({ ...f, visible: e.target.checked }))}
          />
          Visible para jugadores
        </label>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            background: 'transparent',
            border: '1px solid var(--border)',
            color: 'var(--text3)',
            borderRadius: 'var(--radius)',
            padding: '0.3rem 0.75rem',
            cursor: 'pointer',
            fontSize: '0.8rem',
          }}
        >
          Cancelar
        </button>
        <button
          type="submit"
          style={{
            background: 'var(--accent)',
            border: 'none',
            color: '#fff',
            borderRadius: 'var(--radius)',
            padding: '0.3rem 0.85rem',
            cursor: 'pointer',
            fontSize: '0.8rem',
            boxShadow: 'var(--accent-glow)',
          }}
        >
          Guardar
        </button>
      </div>
    </form>
  )
}

const inputStyle = {
  background: 'var(--bg2)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  color: 'var(--text)',
  padding: '0.35rem 0.6rem',
  fontSize: '0.875rem',
  width: '100%',
  boxSizing: 'border-box',
}
