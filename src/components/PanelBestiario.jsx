import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { generarNPC, tieneApiKey } from '../lib/gemini'

const TIPOS = ['bestia', 'humanoide', 'no-muerto', 'demonio', 'elemental', 'construcción', 'planta', 'otro']

const TIPO_ICON = {
  bestia: '🐉',
  humanoide: '👤',
  'no-muerto': '💀',
  demonio: '😈',
  elemental: '🔥',
  'construcción': '⚙️',
  planta: '🌿',
  otro: '🎭',
}

const FORM_VACIO = { nombre: '', tipo: 'bestia', descripcion: '', stats: '', habilidades: '' }

export default function PanelBestiario({ universo, userId, esDueno, sesionActiva, onEnviarAlChat, onCerrar }) {
  const [bestias, setBestias] = useState([])
  const [cargando, setCargando] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editando, setEditando] = useState(null)
  const [generando, setGenerando] = useState(false)
  const [form, setForm] = useState(FORM_VACIO)

  useEffect(() => { cargar() }, [universo.id])

  const cargar = async () => {
    setCargando(true)
    const { data } = await supabase
      .from('bestias')
      .select('*')
      .eq('universo_id', universo.id)
      .order('created_at')
    setBestias(data || [])
    setCargando(false)
  }

  const guardar = async () => {
    if (!form.nombre.trim()) return
    const payload = {
      nombre: form.nombre.trim(),
      tipo: form.tipo,
      descripcion: form.descripcion.trim(),
      stats: form.stats.trim(),
      habilidades: form.habilidades.trim(),
    }
    if (editando) {
      setBestias(prev => prev.map(b => b.id === editando.id ? { ...b, ...payload } : b))
      await supabase.from('bestias').update(payload).eq('id', editando.id)
    } else {
      const tempId = crypto.randomUUID()
      const optimista = { id: tempId, universo_id: universo.id, user_id: userId, ...payload, created_at: new Date().toISOString(), _pendiente: true }
      setBestias(prev => [...prev, optimista])
      const { data } = await supabase
        .from('bestias')
        .insert({ universo_id: universo.id, user_id: userId, ...payload })
        .select()
        .single()
      if (data) setBestias(prev => prev.map(b => b.id === tempId ? data : b))
      else setBestias(prev => prev.filter(b => b.id !== tempId))
    }
    setForm(FORM_VACIO)
    setEditando(null)
    setShowForm(false)
  }

  const borrar = async (bestia) => {
    if (!window.confirm(`¿Eliminar "${bestia.nombre}"?`)) return
    setBestias(prev => prev.filter(b => b.id !== bestia.id))
    await supabase.from('bestias').delete().eq('id', bestia.id)
  }

  const abrirEdicion = (bestia) => {
    setEditando(bestia)
    setForm({
      nombre: bestia.nombre || '',
      tipo: bestia.tipo || 'bestia',
      descripcion: bestia.descripcion || '',
      stats: bestia.stats || '',
      habilidades: bestia.habilidades || '',
    })
    setShowForm(true)
  }

  const cancelarForm = () => {
    setShowForm(false)
    setEditando(null)
    setForm(FORM_VACIO)
  }

  const enviarAlChat = (bestia) => {
    const icono = TIPO_ICON[bestia.tipo] || '🎭'
    const partes = [
      `${icono} ${bestia.nombre} (${bestia.tipo})`,
      bestia.descripcion || '',
      bestia.stats ? `📊 ${bestia.stats}` : '',
      bestia.habilidades ? `⚡ ${bestia.habilidades}` : '',
    ].filter(Boolean)
    onEnviarAlChat(partes.join('\n'))
  }

  const generarIA = async () => {
    setGenerando(true)
    const texto = await generarNPC(universo.nombre)
    if (texto) {
      const nombre = texto.match(/Nombre:\s*(.+)/i)?.[1]?.trim() || 'Criatura desconocida'
      const rolRaw = texto.match(/Rol:\s*(.+)/i)?.[1]?.trim()?.toLowerCase() || ''
      const tipo = TIPOS.find(t => rolRaw.includes(t)) || 'bestia'
      const stats = texto.match(/Rasgo:\s*(.+)/i)?.[1]?.trim() || ''
      const habilidades = texto.match(/Gancho:\s*(.+)/i)?.[1]?.trim() || ''
      const payload = { nombre, tipo, descripcion: '', stats, habilidades }
      const tempId = crypto.randomUUID()
      const optimista = { id: tempId, universo_id: universo.id, user_id: userId, ...payload, created_at: new Date().toISOString(), _pendiente: true }
      setBestias(prev => [...prev, optimista])
      const { data } = await supabase
        .from('bestias')
        .insert({ universo_id: universo.id, user_id: userId, ...payload })
        .select()
        .single()
      if (data) setBestias(prev => prev.map(b => b.id === tempId ? data : b))
      else setBestias(prev => prev.filter(b => b.id !== tempId))
    }
    setGenerando(false)
  }

  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div className="modal modal-misiones" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ fontFamily: 'Cinzel, serif' }}>🐉 Bestiario</h3>
          <button onClick={onCerrar}>✕</button>
        </div>

        <div className="misiones-body">
          {cargando ? (
            <p style={{ color: 'var(--text3)' }}>Cargando...</p>
          ) : (
            <>
              {bestias.length === 0 && !showForm && (
                <div className="empty-state">
                  <p>Sin criaturas todavía.</p>
                </div>
              )}

              {bestias.map(b => (
                <div
                  key={b.id}
                  style={{
                    background: 'var(--bg2)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    padding: '0.6rem 0.8rem',
                    marginBottom: '0.5rem',
                    opacity: b._pendiente ? 0.7 : 1,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                    <span style={{ fontSize: '1rem' }}>{TIPO_ICON[b.tipo] || '🎭'}</span>
                    <span style={{ fontWeight: 600, color: 'var(--text)', flex: 1, fontSize: '0.92rem', fontFamily: 'Cinzel, serif' }}>
                      {b.nombre}
                    </span>
                    <span style={{
                      fontSize: '0.68rem',
                      background: 'var(--bg3)',
                      color: 'var(--text3)',
                      borderRadius: '4px',
                      padding: '0.1rem 0.4rem',
                      fontFamily: 'Cinzel, serif',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}>
                      {b.tipo}
                    </span>
                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                      {sesionActiva && (
                        <button
                          className="btn-sm"
                          title="Enviar al chat"
                          onClick={() => enviarAlChat(b)}
                        >
                          📢
                        </button>
                      )}
                      {(esDueno || b.user_id === userId) && (
                        <>
                          <button className="btn-sm" title="Editar" onClick={() => abrirEdicion(b)}>✏️</button>
                          <button className="btn-sm danger" title="Eliminar" onClick={() => borrar(b)}>🗑</button>
                        </>
                      )}
                    </div>
                  </div>

                  {b.descripcion && (
                    <p style={{ fontSize: '0.82rem', color: 'var(--text2)', margin: '0 0 0.2rem', lineHeight: 1.4 }}>
                      {b.descripcion.length > 100 ? b.descripcion.slice(0, 100) + '…' : b.descripcion}
                    </p>
                  )}

                  {b.stats && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--accent)', margin: '0 0 0.15rem', fontFamily: 'Cinzel, serif' }}>
                      📊 {b.stats}
                    </p>
                  )}

                  {b.habilidades && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--text3)', margin: 0 }}>
                      ⚡ {b.habilidades}
                    </p>
                  )}
                </div>
              ))}
            </>
          )}

          {esDueno && !showForm && (
            <>
              {tieneApiKey() && (
                <button
                  className="btn-ghost"
                  style={{ marginTop: '0.5rem', width: '100%', opacity: generando ? 0.6 : 1 }}
                  disabled={generando}
                  onClick={generarIA}
                >
                  {generando ? '✨ Generando...' : '✨ Generar con IA'}
                </button>
              )}
              <button
                className="btn-ghost"
                style={{ marginTop: '0.5rem', width: '100%' }}
                onClick={() => { setShowForm(true); setEditando(null); setForm(FORM_VACIO) }}
              >
                + Nueva criatura
              </button>
            </>
          )}

          {esDueno && showForm && (
            <div className="mision-form" style={{ marginTop: '0.8rem' }}>
              <input
                autoFocus
                placeholder="Nombre de la criatura"
                value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && guardar()}
              />
              <select
                value={form.tipo}
                onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
                style={{
                  background: 'var(--bg3)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: '0.4rem 0.6rem',
                }}
              >
                {TIPOS.map(t => (
                  <option key={t} value={t}>
                    {TIPO_ICON[t]} {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
              <textarea
                placeholder="Descripción de la criatura..."
                value={form.descripcion}
                onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                rows={2}
              />
              <input
                placeholder="Stats: HP 45, Armadura 14, Daño 2d6..."
                value={form.stats}
                onChange={e => setForm(f => ({ ...f, stats: e.target.value }))}
              />
              <input
                placeholder="Habilidades: Mordisco venenoso, Visión nocturna..."
                value={form.habilidades}
                onChange={e => setForm(f => ({ ...f, habilidades: e.target.value }))}
              />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn-primary" onClick={guardar}>
                  {editando ? 'Guardar' : 'Añadir'}
                </button>
                <button className="btn-ghost" onClick={cancelarForm}>Cancelar</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
