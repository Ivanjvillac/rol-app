import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { generarObjetoMagico, tieneApiKey } from '../lib/gemini'

const TIPOS = ['objeto', 'arma', 'armadura', 'poción', 'artefacto', 'joya', 'herramienta', 'otro']

const TIPO_ICON = { arma: '⚔️', armadura: '🛡️', artefacto: '✨', poción: '🧪', joya: '💎', herramienta: '🔧', objeto: '📦', otro: '🎁' }

export default function PanelObjetos({ universo, personajes, userId, esDueno, onCerrar }) {
  const [objetos, setObjetos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editando, setEditando] = useState(null)
  const [generandoObjeto, setGenerandoObjeto] = useState(false)
  const [asignando, setAsignando] = useState(null)
  const [form, setForm] = useState({ nombre: '', tipo: 'objeto', descripcion: '', estadisticas: '' })

  useEffect(() => { cargar() }, [universo.id])

  const cargar = async () => {
    setCargando(true)
    const { data } = await supabase.from('objetos').select('*').eq('universo_id', universo.id).order('created_at')
    setObjetos(data || [])
    setCargando(false)
  }

  const guardar = async () => {
    if (!form.nombre.trim()) return
    const payload = { nombre: form.nombre.trim(), tipo: form.tipo, descripcion: form.descripcion.trim(), estadisticas: form.estadisticas.trim() }
    if (editando) {
      await supabase.from('objetos').update(payload).eq('id', editando.id)
      setObjetos(prev => prev.map(o => o.id === editando.id ? { ...o, ...payload } : o))
    } else {
      const { data } = await supabase.from('objetos').insert({ universo_id: universo.id, user_id: userId, ...payload }).select().single()
      if (data) setObjetos(prev => [...prev, data])
    }
    setForm({ nombre: '', tipo: 'objeto', descripcion: '', estadisticas: '' })
    setEditando(null); setShowForm(false)
  }

  const borrar = async (id) => {
    await supabase.from('objetos').delete().eq('id', id)
    setObjetos(prev => prev.filter(o => o.id !== id))
  }

  const asignarAPersonaje = async (objeto, personajeId) => {
    if (!personajeId) return
    await supabase.from('inventario').insert({ personaje_id: personajeId, objeto_id: objeto.id })
    setAsignando(null)
  }

  const generarIA = async () => {
    setGenerandoObjeto(true)
    const texto = await generarObjetoMagico(universo.nombre)
    if (texto) {
      const nombre = texto.match(/Nombre:\s*(.+)/i)?.[1]?.trim() || 'Artefacto desconocido'
      const tipoRaw = texto.match(/Tipo:\s*(.+)/i)?.[1]?.trim()?.toLowerCase() || 'artefacto'
      const tipo = TIPOS.find(t => tipoRaw.includes(t)) || 'artefacto'
      const descripcion = texto.match(/Descripción:\s*(.+)/i)?.[1]?.trim() || ''
      const propiedades = texto.match(/Propiedades:\s*(.+)/i)?.[1]?.trim() || ''
      const { data } = await supabase.from('objetos').insert({ universo_id: universo.id, user_id: userId, nombre, tipo, descripcion, estadisticas: propiedades }).select().single()
      if (data) setObjetos(prev => [...prev, data])
    }
    setGenerandoObjeto(false)
  }

  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div className="modal modal-misiones" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>🎒 Objetos del universo</h3>
          <button onClick={onCerrar}>✕</button>
        </div>
        <div className="misiones-body">
          {cargando ? <p style={{ color: 'var(--text3)' }}>Cargando...</p> : (<>
            {objetos.length === 0 && !showForm && (
              <div className="empty-state"><p>Sin objetos todavía.</p></div>
            )}
            {objetos.map(o => (
              <div key={o.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0.6rem 0.8rem', marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: o.descripcion || o.estadisticas ? '0.4rem' : 0 }}>
                  <span style={{ fontSize: '1rem' }}>{TIPO_ICON[o.tipo] || '📦'}</span>
                  <span style={{ fontWeight: 600, color: 'var(--text)', flex: 1, fontSize: '0.92rem' }}>{o.nombre}</span>
                  <span style={{ fontSize: '0.68rem', background: 'var(--bg3)', color: 'var(--text3)', borderRadius: '4px', padding: '0.1rem 0.4rem', fontFamily: 'Cinzel, serif', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{o.tipo}</span>
                  <div style={{ display: 'flex', gap: '0.3rem' }}>
                    <button className="btn-sm" title="Asignar a personaje" onClick={() => setAsignando(asignando?.id === o.id ? null : o)}>👤</button>
                    {(esDueno || o.user_id === userId) && (<>
                      <button className="btn-sm" onClick={() => { setEditando(o); setForm({ nombre: o.nombre, tipo: o.tipo, descripcion: o.descripcion || '', estadisticas: o.estadisticas || '' }); setShowForm(true) }}>✏️</button>
                      <button className="btn-sm danger" onClick={() => borrar(o.id)}>🗑</button>
                    </>)}
                  </div>
                </div>
                {o.descripcion && <p style={{ fontSize: '0.82rem', color: 'var(--text2)', margin: '0 0 0.2rem', lineHeight: 1.4 }}>{o.descripcion}</p>}
                {o.estadisticas && <p style={{ fontSize: '0.75rem', color: 'var(--accent)', margin: 0, fontFamily: 'Cinzel, serif' }}>{o.estadisticas}</p>}
                {asignando?.id === o.id && (
                  <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                    <select defaultValue="" style={{ flex: 1, background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0.3rem 0.5rem', fontSize: '0.82rem' }}
                      onChange={e => asignarAPersonaje(o, e.target.value)}>
                      <option value="">Asignar a...</option>
                      {personajes.map(p => <option key={p.id} value={p.id}>{p.nombre} ({p.rol})</option>)}
                    </select>
                    <button className="btn-ghost btn-sm" onClick={() => setAsignando(null)}>✕</button>
                  </div>
                )}
              </div>
            ))}
          </>)}

          {esDueno && !showForm && (<>
            {tieneApiKey() && (
              <button className="btn-ghost" style={{ marginTop: '0.5rem', width: '100%', opacity: generandoObjeto ? 0.6 : 1 }}
                disabled={generandoObjeto} onClick={generarIA}>
                {generandoObjeto ? '✨ Generando...' : '✨ Generar objeto mágico'}
              </button>
            )}
            <button className="btn-ghost" style={{ marginTop: '0.5rem', width: '100%' }}
              onClick={() => { setShowForm(true); setEditando(null); setForm({ nombre: '', tipo: 'objeto', descripcion: '', estadisticas: '' }) }}>
              + Nuevo objeto
            </button>
          </>)}

          {esDueno && showForm && (
            <div className="mision-form" style={{ marginTop: '0.8rem' }}>
              <input autoFocus placeholder="Nombre del objeto" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} onKeyDown={e => e.key === 'Enter' && guardar()} />
              <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
                style={{ background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0.4rem 0.6rem' }}>
                {TIPOS.map(t => <option key={t} value={t}>{TIPO_ICON[t]} {t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
              <textarea placeholder="Descripción del objeto..." value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} rows={2} />
              <input placeholder="Estadísticas: Daño 1d6+2, Peso 2kg..." value={form.estadisticas} onChange={e => setForm(f => ({ ...f, estadisticas: e.target.value }))} />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn-primary" onClick={guardar}>{editando ? 'Guardar' : 'Añadir'}</button>
                <button className="btn-ghost" onClick={() => { setShowForm(false); setEditando(null); setForm({ nombre: '', tipo: 'objeto', descripcion: '', estadisticas: '' }) }}>Cancelar</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
