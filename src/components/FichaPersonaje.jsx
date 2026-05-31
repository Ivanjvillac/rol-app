import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import PanelJuramentos from './PanelJuramentos'

const TIPO_ICON = { arma: '⚔️', armadura: '🛡️', artefacto: '✨', poción: '🧪', joya: '💎', herramienta: '🔧', objeto: '📦', otro: '🎁' }

const CONDICIONES_PREDEFINIDAS = [
  { nombre: 'Envenenado',   emoji: '🟢', color: '#27ae60' },
  { nombre: 'Paralizado',   emoji: '🔵', color: '#3498db' },
  { nombre: 'Inconsciente', emoji: '💀', color: '#7f8c8d' },
  { nombre: 'Maldito',      emoji: '🟣', color: '#9b59b6' },
  { nombre: 'Asustado',     emoji: '😱', color: '#e67e22' },
  { nombre: 'Cegado',       emoji: '🟡', color: '#f1c40f' },
  { nombre: 'Aturdido',     emoji: '⭐', color: '#f39c12' },
  { nombre: 'Quemado',      emoji: '🔴', color: '#e74c3c' },
  { nombre: 'Congelado',    emoji: '❄️', color: '#74b9ff' },
  { nombre: 'Bendecido',    emoji: '✨', color: '#f1c40f' },
  { nombre: 'Invisible',    emoji: '👻', color: '#95a5a6' },
  { nombre: 'Concentrado',  emoji: '🎯', color: '#2ecc71' },
]

function parseHP(valor) {
  const m = String(valor).match(/^(\d+)\s*\/\s*(\d+)/)
  if (m) return { actual: parseInt(m[1]), max: parseInt(m[2]) }
  const n = parseInt(valor)
  if (!isNaN(n)) return { actual: n, max: null }
  return null
}

function serializeHP(actual, max) {
  return max != null ? `${actual}/${max}` : `${actual}`
}

function HpBar({ atributo, puedeEditar, onUpdate }) {
  const parsed = parseHP(atributo.valor)
  if (!parsed) return null
  const { actual, max } = parsed
  const pct = max ? Math.max(0, Math.min(100, (actual / max) * 100)) : null
  const barColor = pct == null ? 'var(--accent)'
    : pct > 50 ? '#2ecc71'
    : pct > 20 ? '#e67e22'
    : '#e74c3c'

  const adjust = (delta) => {
    const newVal = Math.max(0, max != null ? Math.min(max, actual + delta) : actual + delta)
    onUpdate(atributo.id, serializeHP(newVal, max))
  }

  return (
    <div style={{ background: 'var(--bg3)', borderRadius: 'var(--radius)', padding: '0.6rem 0.8rem', marginBottom: '0.6rem', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: pct != null ? '0.4rem' : 0 }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text3)', fontFamily: 'Cinzel, serif', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          ❤️ {atributo.nombre}
        </span>
        <span style={{ fontWeight: 700, color: barColor, fontFamily: 'Cinzel, serif', fontSize: '0.9rem' }}>
          {actual}{max != null ? ` / ${max}` : ''}
        </span>
      </div>
      {pct != null && (
        <div style={{ height: '6px', background: 'var(--bg2)', borderRadius: '3px', overflow: 'hidden', marginBottom: puedeEditar ? '0.5rem' : 0 }}>
          <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: '3px', transition: 'width 0.3s, background 0.3s' }} />
        </div>
      )}
      {puedeEditar && (
        <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'center' }}>
          {[-5, -1, 1, 5].map(d => (
            <button key={d} onClick={() => adjust(d)}
              style={{ flex: 1, padding: '0.2rem 0', fontSize: '0.75rem', fontWeight: 700, borderRadius: 'var(--radius)', border: `1px solid ${d < 0 ? '#e74c3c44' : '#2ecc7144'}`, background: d < 0 ? 'rgba(231,76,60,0.1)' : 'rgba(46,204,113,0.1)', color: d < 0 ? '#e74c3c' : '#2ecc71', cursor: 'pointer' }}>
              {d > 0 ? '+' : ''}{d}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function FichaPersonaje({ personaje, userId, onCerrar, esDueno = false, onStatEdit, onHpChange, condiciones = [], onToggleCondicion }) {
  const [atributos, setAtributos] = useState([])
  const [inventario, setInventario] = useState([])
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoValor, setNuevoValor] = useState('')
  const [editando, setEditando] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [pestana, setPestana] = useState('ficha')
  const [condCustom, setCondCustom] = useState('')

  const esMio = personaje.user_id === userId
  const puedeEditar = esMio || esDueno  // el dueño del universo puede editar cualquier ficha

  useEffect(() => {
    cargarAtributos()
    supabase.from('inventario').select('*, objeto:objetos(*)').eq('personaje_id', personaje.id).order('created_at').then(({ data }) => setInventario(data || []))
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
    const atributoAnterior = atributos.find(a => a.id === id)
    await supabase.from('atributos').update({ valor }).eq('id', id)
    setAtributos(prev => prev.map(a => a.id === id ? { ...a, valor } : a))
    setEditando(null)
    // Si lo editó el dueño (no el propietario del personaje), notificar para el log del chat
    if (esDueno && !esMio && onStatEdit) {
      onStatEdit(personaje.nombre, atributoAnterior?.nombre || 'stat', atributoAnterior?.valor, valor)
    }
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
          <button className={pestana === 'estado' ? 'ficha-tab active' : 'ficha-tab'} onClick={() => setPestana('estado')}>
            🩹{condiciones.length > 0 ? ` (${condiciones.length})` : ''}
          </button>
          <button className={pestana === 'juramentos' ? 'ficha-tab active' : 'ficha-tab'} onClick={() => setPestana('juramentos')}>🕯️ Jur.</button>
          <button className={pestana === 'inventario' ? 'ficha-tab active' : 'ficha-tab'} onClick={() => setPestana('inventario')}>🎒 Inv.{inventario.length > 0 ? ` (${inventario.length})` : ''}</button>
        </div>
        <div className="ficha-body">
          {pestana === 'estado' && (
            <div style={{ padding: '0.2rem 0' }}>
              {condiciones.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.8rem' }}>
                  {condiciones.map(c => (
                    <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: `${c.color}22`, border: `1px solid ${c.color}66`, borderRadius: '999px', padding: '0.2rem 0.6rem', fontSize: '0.82rem', color: c.color, fontWeight: 600 }}>
                      {c.emoji} {c.nombre}
                      {(esMio || esDueno) && onToggleCondicion && (
                        <button onClick={() => onToggleCondicion(c)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.color, fontSize: '0.7rem', padding: '0 0 0 0.1rem', lineHeight: 1 }}>✕</button>
                      )}
                    </span>
                  ))}
                </div>
              )}
              {condiciones.length === 0 && <p style={{ color: 'var(--text3)', fontSize: '0.82rem', fontStyle: 'italic', marginBottom: '0.8rem' }}>Sin condiciones activas.</p>}

              {(esMio || esDueno) && onToggleCondicion && (
                <>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text3)', marginBottom: '0.5rem', fontFamily: 'Cinzel, serif', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Aplicar condición</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.3rem', marginBottom: '0.7rem' }}>
                    {CONDICIONES_PREDEFINIDAS.map(c => {
                      const activa = condiciones.some(x => x.nombre === c.nombre)
                      return (
                        <button key={c.nombre} onClick={() => onToggleCondicion(c)}
                          style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.3rem 0.4rem', borderRadius: 'var(--radius)', border: `1px solid ${activa ? c.color : 'var(--border)'}`, background: activa ? `${c.color}22` : 'var(--bg3)', cursor: 'pointer', fontSize: '0.75rem', color: activa ? c.color : 'var(--text2)', fontWeight: activa ? 700 : 400, transition: 'all 0.15s' }}>
                          <span>{c.emoji}</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre}</span>
                        </button>
                      )
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <input placeholder="Condición personalizada..." value={condCustom} onChange={e => setCondCustom(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && condCustom.trim()) { onToggleCondicion({ nombre: condCustom.trim(), emoji: '⚠️', color: '#e67e22' }); setCondCustom('') } }}
                      style={{ flex: 1, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text)', padding: '0.35rem 0.6rem', fontSize: '0.82rem' }} />
                    <button className="btn-primary btn-sm" disabled={!condCustom.trim()}
                      onClick={() => { onToggleCondicion({ nombre: condCustom.trim(), emoji: '⚠️', color: '#e67e22' }); setCondCustom('') }}>+</button>
                  </div>
                </>
              )}
            </div>
          )}

          {pestana === 'juramentos' && <PanelJuramentos personajeId={personaje.id} esMio={esMio} />}


          {pestana === 'inventario' && (
            inventario.length === 0
              ? <p style={{ color: 'var(--text3)', fontStyle: 'italic', textAlign: 'center', padding: '1rem' }}>Sin objetos en el inventario.</p>
              : inventario.map(item => (
                <div key={item.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{TIPO_ICON[item.objeto?.tipo] || '📦'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.88rem' }}>{item.objeto?.nombre}</span>
                      {item.equipado && <span style={{ fontSize: '0.65rem', background: 'var(--accent)', color: '#000', borderRadius: '999px', padding: '0.05rem 0.4rem', fontWeight: 700 }}>Equipado</span>}
                    </div>
                    {item.objeto?.estadisticas && <p style={{ fontSize: '0.72rem', color: 'var(--accent)', margin: '0.1rem 0 0', fontFamily: 'Cinzel, serif' }}>{item.objeto.estadisticas}</p>}
                    {item.objeto?.descripcion && <p style={{ fontSize: '0.78rem', color: 'var(--text3)', margin: '0.1rem 0 0', lineHeight: 1.4 }}>{item.objeto.descripcion}</p>}
                  </div>
                </div>
              ))
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
                        onClick={() => puedeEditar && setEditando(a.id)}
                        style={{ cursor: puedeEditar ? 'pointer' : 'default' }}
                        title={esDueno && !esMio ? 'Máster: haz clic para editar' : undefined}
                      >
                        {a.valor}
                      </span>
                    )}
                    {puedeEditar && (
                      <button className="ficha-delete-btn" onClick={() => eliminarAtributo(a.id)}>✕</button>
                    )}
                  </div>
                ))}
              </div>

              {puedeEditar && (
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

              {puedeEditar && atributos.length > 0 && (
                <p style={{ fontSize: '0.75rem', color: 'var(--text3)', marginTop: '0.5rem', fontStyle: 'italic' }}>
                  {esDueno && !esMio ? '⚔️ Máster: haz clic en un valor para editarlo' : 'Haz clic en un valor para editarlo'}
                </p>
              )}
              {atributos.length === 0 && !puedeEditar && (
                <p style={{ color: 'var(--text3)', fontStyle: 'italic', textAlign: 'center', padding: '1rem' }}>Sin atributos.</p>
              )}
            </>
          ))}
        </div>
      </div>
    </div>
  )
}
