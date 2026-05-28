import { useState, useRef, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'

const COLORES = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c', '#3498db', '#9b59b6', '#e91e63']
const ROLES = ['Guerrero', 'Mago', 'Pícaro', 'Clérigo', 'Explorador', 'Bardo', 'Narrador', 'Otro']

function FichaInline({ personajeId, userId, esMio }) {
  const [atributos, setAtributos] = useState([])
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoValor, setNuevoValor] = useState('')
  const [editando, setEditando] = useState(null)

  useEffect(() => {
    supabase.from('atributos').select('*').eq('personaje_id', personajeId).order('orden')
      .then(({ data }) => setAtributos(data || []))
  }, [personajeId])

  const agregar = async () => {
    if (!nuevoNombre.trim() || !nuevoValor.trim()) return
    const { data } = await supabase.from('atributos')
      .insert({ personaje_id: personajeId, nombre: nuevoNombre.trim(), valor: nuevoValor.trim(), orden: atributos.length })
      .select().single()
    if (data) { setAtributos(prev => [...prev, data]); setNuevoNombre(''); setNuevoValor('') }
  }

  const actualizar = async (id, valor) => {
    await supabase.from('atributos').update({ valor }).eq('id', id)
    setAtributos(prev => prev.map(a => a.id === id ? { ...a, valor } : a))
    setEditando(null)
  }

  const eliminar = async (id) => {
    await supabase.from('atributos').delete().eq('id', id)
    setAtributos(prev => prev.filter(a => a.id !== id))
  }

  return (
    <div>
      <div className="ficha-atributos">
        {atributos.map(a => (
          <div key={a.id} className="ficha-atributo">
            <span className="ficha-atributo-nombre">{a.nombre}</span>
            {editando === a.id
              ? <input className="ficha-atributo-input" defaultValue={a.valor} autoFocus
                  onBlur={e => actualizar(a.id, e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && actualizar(a.id, e.target.value)} />
              : <span className="ficha-atributo-valor" onClick={() => esMio && setEditando(a.id)}
                  style={{ cursor: esMio ? 'pointer' : 'default' }}>{a.valor}</span>
            }
            {esMio && <button className="ficha-delete-btn" onClick={() => eliminar(a.id)}>✕</button>}
          </div>
        ))}
        {atributos.length === 0 && <p style={{ color: 'var(--text3)', fontStyle: 'italic', fontSize: '0.9rem' }}>Sin atributos todavía.</p>}
      </div>
      {esMio && (
        <div className="ficha-nuevo" style={{ marginTop: '1rem' }}>
          <input placeholder="Atributo" value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && agregar()} className="ficha-nuevo-nombre" />
          <input placeholder="Valor" value={nuevoValor} onChange={e => setNuevoValor(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && agregar()} className="ficha-nuevo-valor" />
          <button className="btn-primary btn-sm" onClick={agregar}>+</button>
        </div>
      )}
      {esMio && atributos.length > 0 && (
        <p style={{ fontSize: '0.75rem', color: 'var(--text3)', marginTop: '0.5rem', fontStyle: 'italic' }}>Haz clic en un valor para editarlo</p>
      )}
    </div>
  )
}

function DetallePersonaje({ personaje, onCerrar, onGuardarNotas, universo, userId }) {
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [pestana, setPestana] = useState('notas')
  const [nombrePropietario, setNombrePropietario] = useState(null)
  const esMio = personaje.user_id === userId

  useEffect(() => {
    const cargar = async () => {
      const { data } = await supabase.from('notas_privadas').select('contenido')
        .eq('personaje_id', personaje.id).eq('user_id', userId).single()
      if (data) setNotas(data.contenido || '')

      if (personaje.user_id) {
        const { data: perfil } = await supabase.from('perfiles')
          .select('nombre').eq('id', personaje.user_id).single()
        setNombrePropietario(perfil?.nombre || null)
      }
    }
    cargar()
  }, [personaje.id])

  const handleGuardar = async () => {
    setGuardando(true)
    await onGuardarNotas(personaje.id, notas)
    setGuardando(false)
    setGuardado(true)
    setTimeout(() => setGuardado(false), 2000)
  }

  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div className="modal modal-detalle" onClick={e => e.stopPropagation()}>
        <div className="detalle-header">
          {personaje.avatar_url
            ? <img src={personaje.avatar_url} alt={personaje.nombre} className="detalle-avatar" />
            : <div className="detalle-avatar-placeholder" style={{ background: personaje.color }}>{personaje.iniciales}</div>
          }
          <div>
            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
              <div className="card-badge">{personaje.rol}</div>
              {personaje.es_npc && <div className="card-badge" style={{ background: 'rgba(52,152,219,0.15)', borderColor: '#3498db', color: '#3498db' }}>NPC</div>}
              {personaje.oculto && <div className="card-badge" style={{ background: 'rgba(127,140,141,0.15)', borderColor: '#7f8c8d', color: '#7f8c8d' }}>🙈 Oculto</div>}
            </div>
            <h2 style={{ fontFamily: 'Cinzel, serif', color: 'var(--accent)', marginTop: '0.3rem' }}>{personaje.nombre}</h2>
            {universo && (
              <div className="personaje-universo" style={{ marginTop: '0.3rem' }}>
                <span style={{ background: universo.color }} className="universo-dot" />
                {universo.nombre}
              </div>
            )}
          </div>
          <button className="detalle-cerrar" onClick={onCerrar}>✕</button>
        </div>

        <div className="detalle-tabs">
          <button className={pestana === 'notas' ? 'detalle-tab active' : 'detalle-tab'} onClick={() => setPestana('notas')}>📋 Notas</button>
          <button className={pestana === 'ficha' ? 'detalle-tab active' : 'detalle-tab'} onClick={() => setPestana('ficha')}>⚔️ Ficha</button>
        </div>

        {pestana === 'notas' && (
          <>
            {/* Propietario */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1rem', background: 'var(--bg3)', borderBottom: '1px solid var(--border)', fontSize: '0.82rem' }}>
              <span style={{ color: 'var(--text3)' }}>✍️ Creado por</span>
              <span style={{ color: esMio ? 'var(--accent)' : 'var(--text2)', fontFamily: 'Cinzel, serif', fontWeight: 600 }}>
                {esMio ? 'ti' : (nombrePropietario || '…')}
              </span>
              {esMio
                ? <span style={{ marginLeft: 'auto', color: 'var(--accent)', fontSize: '0.75rem' }}>✓ Puedes editar la ficha</span>
                : <span style={{ marginLeft: 'auto', color: 'var(--text3)', fontSize: '0.75rem' }}>Solo lectura en ficha</span>
              }
            </div>
            {personaje.descripcion && (
              <div className="detalle-seccion">
                <h4>Descripción</h4>
                <p style={{ color: 'var(--text2)', fontStyle: 'italic', lineHeight: '1.6' }}>{personaje.descripcion}</p>
              </div>
            )}
            <div className="detalle-seccion">
              <h4>Notas privadas</h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--text3)', marginBottom: '0.6rem' }}>Solo tú puedes ver estas notas.</p>
              <textarea className="notas-textarea" placeholder="Escribe aquí los secretos, motivaciones, historia personal..." value={notas} onChange={e => setNotas(e.target.value)} rows={10} />
            </div>
            <div className="modal-actions">
              <button className="btn-ghost" onClick={onCerrar}>Cerrar</button>
              <button className="btn-primary" onClick={handleGuardar} disabled={guardando}>
                {guardado ? '✓ Guardado' : guardando ? 'Guardando...' : 'Guardar notas'}
              </button>
            </div>
          </>
        )}

        {pestana === 'ficha' && (
          <div className="detalle-seccion">
            <h4>Atributos</h4>
            <FichaInline personajeId={personaje.id} userId={userId} esMio={personaje.user_id === userId} />
          </div>
        )}
      </div>
    </div>
  )
}

export default function Personajes({ navigate, selectedUniverso }) {
  const { universos, personajes, addPersonaje, deletePersonaje, updatePersonaje, userId } = useApp()
  const [showForm, setShowForm] = useState(false)
  const [editando, setEditando] = useState(null)
  const [verDetalle, setVerDetalle] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [filtroUniverso, setFiltroUniverso] = useState(selectedUniverso?.id || 'todos')
  const [guardando, setGuardando] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [avatarFile, setAvatarFile] = useState(null)
  const fileInputRef = useRef(null)
  const [form, setForm] = useState({
    nombre: '', rol: 'Guerrero', descripcion: '',
    color: COLORES[0], universoId: selectedUniverso?.id || '',
    avatar_url: '', es_npc: false, oculto: false
  })

  const personajesFiltrados = (filtroUniverso === 'todos'
    ? personajes
    : personajes.filter(p => p.universo_id === filtroUniverso || p.universoId === filtroUniverso)
  ).filter(p => !p.oculto || p.user_id === userId)

  const jugadores = personajesFiltrados.filter(p => !p.es_npc)
  const npcs = personajesFiltrados.filter(p => p.es_npc)

  const abrirNuevo = () => {
    setEditando(null); setAvatarPreview(null); setAvatarFile(null)
    setForm({ nombre: '', rol: 'Guerrero', descripcion: '', color: COLORES[0], universoId: selectedUniverso?.id || '', avatar_url: '', es_npc: false, oculto: false })
    setShowForm(true)
  }

  const abrirEditar = (p) => {
    setEditando(p); setAvatarPreview(p.avatar_url || null); setAvatarFile(null)
    setForm({ nombre: p.nombre, rol: p.rol || 'Guerrero', descripcion: p.descripcion || '', color: p.color || COLORES[0], universoId: p.universo_id || p.universoId || '', avatar_url: p.avatar_url || '', es_npc: p.es_npc || false, oculto: p.oculto || false })
    setShowForm(true)
  }

  const cerrarForm = () => { setShowForm(false); setEditando(null); setAvatarPreview(null); setAvatarFile(null) }

  const handleAvatarChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  const subirAvatar = async (personajeId) => {
    if (!avatarFile) return form.avatar_url || null
    const ext = avatarFile.name.split('.').pop()
    const path = `${personajeId}.${ext}`
    const { error } = await supabase.storage.from('avatares').upload(path, avatarFile, { upsert: true })
    if (error) return form.avatar_url || null
    const { data } = supabase.storage.from('avatares').getPublicUrl(path)
    return data.publicUrl
  }

  const handleSubmit = async () => {
    if (!form.nombre.trim()) return
    setGuardando(true)
    const iniciales = form.nombre.slice(0, 2).toUpperCase()
    if (editando) {
      const avatar_url = await subirAvatar(editando.id)
      await updatePersonaje(editando.id, { nombre: form.nombre, rol: form.rol, descripcion: form.descripcion, color: form.color, iniciales, universo_id: form.universoId, avatar_url, es_npc: form.es_npc, oculto: form.oculto })
    } else {
      if (!form.universoId) { setGuardando(false); return }
      const tempId = crypto.randomUUID()
      const avatar_url = await subirAvatar(tempId)
      await addPersonaje({ ...form, iniciales, universoId: form.universoId, avatar_url, es_npc: form.es_npc, oculto: form.oculto })
    }
    setGuardando(false)
    cerrarForm()
  }

  const handleDelete = async (p) => {
    if (p.avatar_url) {
      const path = p.avatar_url.split('/avatares/')[1]
      if (path) await supabase.storage.from('avatares').remove([path])
    }
    await deletePersonaje(p.id)
    setConfirmDelete(null)
  }

  const handleGuardarNotas = async (personajeId, contenido) => {
    await supabase.from('notas_privadas').upsert({ personaje_id: personajeId, user_id: userId, contenido }, { onConflict: 'personaje_id,user_id' })
    if (verDetalle?.id === personajeId) setVerDetalle(prev => ({ ...prev, notas: contenido }))
  }

  const universoDePersonaje = (universoId) => universos.find(u => u.id === universoId)

  const renderTarjeta = (p) => {
    const universo = universoDePersonaje(p.universo_id || p.universoId)
    const esMio = p.user_id === userId
    return (
      <div key={p.id} className={`card personaje-card ${p.oculto ? 'personaje-oculto' : ''}`}>
        {p.avatar_url
          ? <img src={p.avatar_url} alt={p.nombre} className="personaje-avatar-img" />
          : <div className="personaje-avatar" style={{ background: p.color }}>{p.iniciales}</div>
        }
        <div className="card-body">
          <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
            <div className="card-badge">{p.rol}</div>
            {p.es_npc && <div className="card-badge" style={{ background: 'rgba(52,152,219,0.15)', borderColor: '#3498db', color: '#3498db' }}>NPC</div>}
            {p.oculto && <div className="card-badge" style={{ background: 'rgba(127,140,141,0.15)', borderColor: '#7f8c8d', color: '#7f8c8d' }}>🙈 Oculto</div>}
          </div>
          <h3>{p.nombre}</h3>
          <p>{p.descripcion || 'Sin descripción'}</p>
          {universo && (
            <div className="personaje-universo">
              <span style={{ background: universo.color }} className="universo-dot" />
              {universo.nombre}
            </div>
          )}
          <div className="card-actions">
            <button className="btn-ghost btn-sm" onClick={() => setVerDetalle(p)}>📋 Notas</button>
            {esMio && <button className="btn-ghost btn-sm" onClick={() => abrirEditar(p)}>Editar</button>}
            {esMio && <button className="btn-danger btn-sm" onClick={() => setConfirmDelete(p)}>Eliminar</button>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Personajes</h2>
          <p className="page-subtitle">Crea y gestiona los personajes de tus universos</p>
        </div>
        <button className="btn-primary" onClick={abrirNuevo}>+ Nuevo personaje</button>
      </div>

      <div className="filtro-bar">
        <span>Filtrar por universo:</span>
        <select value={filtroUniverso} onChange={e => setFiltroUniverso(e.target.value)}>
          <option value="todos">Todos</option>
          {universos.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
        </select>
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={cerrarForm}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{editando ? 'Editar personaje' : 'Crear personaje'}</h3>

            <div className="form-group">
              <label>Tipo de personaje</label>
              <div className="tipo-toggle">
                <button type="button" className={!form.es_npc ? 'tipo-btn activo' : 'tipo-btn'} onClick={() => setForm({ ...form, es_npc: false })}>👤 Jugador</button>
                <button type="button" className={form.es_npc ? 'tipo-btn activo' : 'tipo-btn'} onClick={() => setForm({ ...form, es_npc: true })}>🤖 NPC</button>
              </div>
            </div>

            <div className="form-group">
              <label>Visibilidad</label>
              <div className="tipo-toggle">
                <button type="button" className={!form.oculto ? 'tipo-btn activo' : 'tipo-btn'} onClick={() => setForm({ ...form, oculto: false })}>👁️ Visible</button>
                <button type="button" className={form.oculto ? 'tipo-btn activo' : 'tipo-btn'} onClick={() => setForm({ ...form, oculto: true })}>🙈 Oculto</button>
              </div>
              {form.oculto && <small style={{ color: 'var(--text3)', fontSize: '0.82rem', marginTop: '0.3rem', display: 'block' }}>Solo tú podrás verlo hasta que lo reveles.</small>}
            </div>

            <div className="form-group">
              <label>Avatar</label>
              <div className="avatar-upload" onClick={() => fileInputRef.current?.click()}>
                {avatarPreview
                  ? <img src={avatarPreview} alt="avatar" className="avatar-preview" />
                  : <div className="avatar-placeholder" style={{ background: form.color }}>{form.nombre ? form.nombre.slice(0,2).toUpperCase() : '?'}</div>
                }
                <div className="avatar-upload-label"><span>📷</span><small>{avatarPreview ? 'Cambiar imagen' : 'Subir imagen'}</small></div>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
            </div>

            <div className="form-group">
              <label>Universo</label>
              <select value={form.universoId} onChange={e => setForm({ ...form, universoId: e.target.value })}>
                <option value="">Selecciona un universo...</option>
                {universos.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Nombre</label>
              <input placeholder="Nombre del personaje..." value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
            </div>

            <div className="form-group">
              <label>Rol</label>
              <select value={ROLES.includes(form.rol) ? form.rol : 'Otro'} onChange={e => { if (e.target.value === 'Otro') setForm({ ...form, rol: '' }); else setForm({ ...form, rol: e.target.value }) }}>
                {ROLES.map(r => <option key={r}>{r}</option>)}
              </select>
              {(!ROLES.includes(form.rol) || form.rol === '') && (
                <input style={{ marginTop: '0.5rem' }} placeholder="Escribe el rol personalizado..." value={!ROLES.includes(form.rol) ? form.rol : ''} onChange={e => setForm({ ...form, rol: e.target.value })} />
              )}
            </div>

            <div className="form-group">
              <label>Descripción</label>
              <textarea placeholder="¿Quién es este personaje? ¿Cuál es su historia?" value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} rows={3} />
            </div>

            <div className="form-group">
              <label>Color del personaje</label>
              <div className="color-picker">
                {COLORES.map(c => <div key={c} className={`color-dot ${form.color === c ? 'selected' : ''}`} style={{ background: c }} onClick={() => setForm({ ...form, color: c })} />)}
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn-ghost" onClick={cerrarForm}>Cancelar</button>
              <button className="btn-primary" onClick={handleSubmit} disabled={guardando}>
                {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear personaje'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <h3>¿Eliminar personaje?</h3>
            <p style={{ color: 'var(--text2)', margin: '0.8rem 0 1.5rem' }}>Esta acción no se puede deshacer. El personaje "<strong>{confirmDelete.nombre}</strong>" se eliminará permanentemente.</p>
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setConfirmDelete(null)}>Cancelar</button>
              <button className="btn-danger" onClick={() => handleDelete(confirmDelete)}>Sí, eliminar</button>
            </div>
          </div>
        </div>
      )}

      {verDetalle && (
        <DetallePersonaje
          personaje={verDetalle}
          universo={universoDePersonaje(verDetalle.universo_id || verDetalle.universoId)}
          onCerrar={() => setVerDetalle(null)}
          onGuardarNotas={handleGuardarNotas}
          userId={userId}
        />
      )}

      <h3 style={{ fontFamily: 'Cinzel, serif', color: 'var(--text2)', fontSize: '0.9rem', margin: '0.5rem 0', letterSpacing: '0.05em' }}>👤 Personajes jugadores</h3>
      <div className="grid">
        {jugadores.map(p => renderTarjeta(p))}
        {jugadores.length === 0 && <div className="empty-state"><span>👤</span><p>No hay personajes jugadores.</p></div>}
      </div>

      <h3 style={{ fontFamily: 'Cinzel, serif', color: 'var(--text2)', fontSize: '0.9rem', margin: '1.5rem 0 0.5rem', letterSpacing: '0.05em' }}>🤖 NPCs</h3>
      <div className="grid">
        {npcs.map(p => renderTarjeta(p))}
        {npcs.length === 0 && <div className="empty-state"><span>🤖</span><p>No hay NPCs creados.</p></div>}
      </div>
    </div>
  )
}
