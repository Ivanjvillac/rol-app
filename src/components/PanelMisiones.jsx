import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { generarMision, tieneApiKey } from '../lib/gemini'

export default function PanelMisiones({ universoId, userId, esDueno, onCerrar, universoNombre }) {
  const [misiones, setMisiones] = useState([])
  const [cargando, setCargando] = useState(true)
  const [nuevaTitulo, setNuevaTitulo] = useState('')
  const [nuevaDesc, setNuevaDesc] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editando, setEditando] = useState(null)
  const [generandoMision, setGenerandoMision] = useState(false)

  useEffect(() => {
    cargar()
    const ch = supabase
      .channel(`misiones-${universoId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'misiones', filter: `universo_id=eq.${universoId}` }, (payload) => {
        if (payload.eventType === 'INSERT') setMisiones(prev => [...prev, payload.new])
        else if (payload.eventType === 'UPDATE') setMisiones(prev => prev.map(m => m.id === payload.new.id ? payload.new : m))
        else if (payload.eventType === 'DELETE') setMisiones(prev => prev.filter(m => m.id !== payload.old.id))
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [universoId])

  const cargar = async () => {
    setCargando(true)
    const { data } = await supabase
      .from('misiones').select('*').eq('universo_id', universoId).order('orden').order('created_at')
    setMisiones(data || [])
    setCargando(false)
  }

  const agregar = async () => {
    if (!nuevaTitulo.trim()) return
    const { data } = await supabase.from('misiones').insert({
      universo_id: universoId, user_id: userId,
      titulo: nuevaTitulo.trim(), descripcion: nuevaDesc.trim(),
      orden: misiones.length
    }).select().single()
    if (data) setMisiones(prev => [...prev, data])
    setNuevaTitulo(''); setNuevaDesc(''); setShowForm(false)
  }

  const guardarEdit = async () => {
    if (!editando || !nuevaTitulo.trim()) return
    const updates = { titulo: nuevaTitulo.trim(), descripcion: nuevaDesc.trim() }
    await supabase.from('misiones').update(updates).eq('id', editando.id)
    setMisiones(prev => prev.map(m => m.id === editando.id ? { ...m, ...updates } : m))
    setEditando(null); setNuevaTitulo(''); setNuevaDesc('')
  }

  const toggleCompletada = async (mision) => {
    const completada = !mision.completada
    await supabase.from('misiones').update({ completada }).eq('id', mision.id)
    setMisiones(prev => prev.map(m => m.id === mision.id ? { ...m, completada } : m))
  }

  const borrar = async (id) => {
    await supabase.from('misiones').delete().eq('id', id)
    setMisiones(prev => prev.filter(m => m.id !== id))
  }

  const pendientes = misiones.filter(m => !m.completada)
  const completadas = misiones.filter(m => m.completada)

  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div className="modal modal-misiones" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>📋 Tablón de misiones</h3>
          <button onClick={onCerrar}>✕</button>
        </div>

        <div className="misiones-body">
          {cargando ? (
            <p style={{ color: 'var(--text3)' }}>Cargando...</p>
          ) : (
            <>
              {pendientes.length === 0 && completadas.length === 0 && (
                <div className="empty-state"><p>Sin misiones todavía.</p></div>
              )}

              {pendientes.map(m => (
                <div key={m.id} className="mision-item">
                  <button className="mision-check" onClick={() => esDueno && toggleCompletada(m)} disabled={!esDueno} title={esDueno ? 'Marcar completada' : ''}>
                    ○
                  </button>
                  <div className="mision-texto">
                    <div className="mision-titulo">{m.titulo}</div>
                    {m.descripcion && <div className="mision-desc">{m.descripcion}</div>}
                  </div>
                  {esDueno && (
                    <div className="mision-acciones">
                      <button className="btn-sm" onClick={() => { setEditando(m); setNuevaTitulo(m.titulo); setNuevaDesc(m.descripcion || ''); setShowForm(false) }}>✏️</button>
                      <button className="btn-sm danger" onClick={() => borrar(m.id)}>🗑</button>
                    </div>
                  )}
                </div>
              ))}

              {completadas.length > 0 && (
                <>
                  <div className="misiones-separador">Completadas</div>
                  {completadas.map(m => (
                    <div key={m.id} className="mision-item completada">
                      <button className="mision-check done" onClick={() => esDueno && toggleCompletada(m)} disabled={!esDueno} title={esDueno ? 'Marcar pendiente' : ''}>
                        ✓
                      </button>
                      <div className="mision-texto">
                        <div className="mision-titulo">{m.titulo}</div>
                        {m.descripcion && <div className="mision-desc">{m.descripcion}</div>}
                      </div>
                      {esDueno && (
                        <div className="mision-acciones">
                          <button className="btn-sm danger" onClick={() => borrar(m.id)}>🗑</button>
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}
            </>
          )}

          {/* Formulario edición */}
          {editando && (
            <div className="mision-form">
              <input autoFocus placeholder="Título de la misión" value={nuevaTitulo} onChange={e => setNuevaTitulo(e.target.value)} onKeyDown={e => e.key === 'Enter' && guardarEdit()} />
              <textarea placeholder="Descripción (opcional)" value={nuevaDesc} onChange={e => setNuevaDesc(e.target.value)} rows={2} />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn-primary" onClick={guardarEdit}>Guardar</button>
                <button className="btn-ghost" onClick={() => { setEditando(null); setNuevaTitulo(''); setNuevaDesc('') }}>Cancelar</button>
              </div>
            </div>
          )}

          {/* Formulario nueva misión */}
          {esDueno && !editando && tieneApiKey() && (
            <button className="btn-ghost" style={{ marginTop: '0.5rem', width: '100%', opacity: generandoMision ? 0.6 : 1 }}
              disabled={generandoMision}
              onClick={async () => {
                setGenerandoMision(true)
                const texto = await generarMision(universoNombre)
                if (texto) {
                  const titulo = texto.match(/Título:\s*(.+)/i)?.[1]?.trim() || 'Misión generada'
                  const objetivo = texto.match(/Objetivo:\s*(.+)/i)?.[1]?.trim() || ''
                  const obstaculo = texto.match(/Obstáculo:\s*(.+)/i)?.[1]?.trim() || ''
                  const recompensa = texto.match(/Recompensa:\s*(.+)/i)?.[1]?.trim() || ''
                  const desc = [objetivo && `Objetivo: ${objetivo}`, obstaculo && `Obstáculo: ${obstaculo}`, recompensa && `Recompensa: ${recompensa}`].filter(Boolean).join('\n')
                  const { data } = await supabase.from('misiones').insert({ universo_id: universoId, user_id: userId, titulo, descripcion: desc, orden: misiones.length }).select().single()
                  if (data) setMisiones(prev => [...prev, data])
                }
                setGenerandoMision(false)
              }}>
              {generandoMision ? '✨ Generando...' : '✨ Generar misión con IA'}
            </button>
          )}

          {esDueno && !editando && (
            showForm ? (
              <div className="mision-form">
                <input autoFocus placeholder="Título de la misión" value={nuevaTitulo} onChange={e => setNuevaTitulo(e.target.value)} onKeyDown={e => e.key === 'Enter' && agregar()} />
                <textarea placeholder="Descripción (opcional)" value={nuevaDesc} onChange={e => setNuevaDesc(e.target.value)} rows={2} />
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn-primary" onClick={agregar}>Añadir</button>
                  <button className="btn-ghost" onClick={() => { setShowForm(false); setNuevaTitulo(''); setNuevaDesc('') }}>Cancelar</button>
                </div>
              </div>
            ) : (
              <button className="btn-ghost" style={{ marginTop: '0.5rem', width: '100%' }} onClick={() => setShowForm(true)}>+ Nueva misión</button>
            )
          )}
        </div>
      </div>
    </div>
  )
}
