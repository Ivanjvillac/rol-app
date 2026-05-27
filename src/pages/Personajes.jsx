import { useState, useRef, useEffect  } from 'react'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'

const COLORES = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c', '#3498db', '#9b59b6', '#e91e63']
const ROLES = ['Guerrero', 'Mago', 'Pícaro', 'Clérigo', 'Explorador', 'Bardo', 'Narrador', 'Otro']

function DetallePersonaje({ personaje, onCerrar, onGuardarNotas, universo, userId }) {
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)

  useEffect(() => {
    const cargar = async () => {
      const { data } = await supabase
        .from('notas_privadas')
        .select('contenido')
        .eq('personaje_id', personaje.id)
        .eq('user_id', userId)
        .single()
      if (data) setNotas(data.contenido || '')
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
            <div className="card-badge">{personaje.rol}</div>
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

        {personaje.descripcion && (
          <div className="detalle-seccion">
            <h4>Descripción</h4>
            <p style={{ color: 'var(--text2)', fontStyle: 'italic', lineHeight: '1.6' }}>{personaje.descripcion}</p>
          </div>
        )}

        <div className="detalle-seccion">
          <h4>Notas privadas</h4>
          <p style={{ fontSize: '0.85rem', color: 'var(--text3)', marginBottom: '0.6rem' }}>
            Solo tú puedes ver estas notas. Úsalas para historia, motivaciones, secretos...
          </p>
          <textarea
            className="notas-textarea"
            placeholder="Escribe aquí los secretos, motivaciones, historia personal, objetivos... Solo tú los verás."
            value={notas}
            onChange={e => setNotas(e.target.value)}
            rows={10}
          />
        </div>

        <div className="modal-actions">
          <button className="btn-ghost" onClick={onCerrar}>Cerrar</button>
          <button className="btn-primary" onClick={handleGuardar} disabled={guardando}>
            {guardado ? '✓ Guardado' : guardando ? 'Guardando...' : 'Guardar notas'}
          </button>
        </div>
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
    avatar_url: ''
  })

  const personajesFiltrados = filtroUniverso === 'todos'
    ? personajes
    : personajes.filter(p => p.universo_id === filtroUniverso || p.universoId === filtroUniverso)

  const abrirNuevo = () => {
    setEditando(null)
    setAvatarPreview(null)
    setAvatarFile(null)
    setForm({ nombre: '', rol: 'Guerrero', descripcion: '', color: COLORES[0], universoId: selectedUniverso?.id || '', avatar_url: '' })
    setShowForm(true)
  }

  const abrirEditar = (p) => {
    setEditando(p)
    setAvatarPreview(p.avatar_url || null)
    setAvatarFile(null)
    setForm({
      nombre: p.nombre,
      rol: p.rol || 'Guerrero',
      descripcion: p.descripcion || '',
      color: p.color || COLORES[0],
      universoId: p.universo_id || p.universoId || '',
      avatar_url: p.avatar_url || ''
    })
    setShowForm(true)
  }

  const cerrarForm = () => {
    setShowForm(false)
    setEditando(null)
    setAvatarPreview(null)
    setAvatarFile(null)
  }

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
    const { error } = await supabase.storage
      .from('avatares')
      .upload(path, avatarFile, { upsert: true })
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
      await updatePersonaje(editando.id, {
        nombre: form.nombre,
        rol: form.rol,
        descripcion: form.descripcion,
        color: form.color,
        iniciales,
        universo_id: form.universoId,
        avatar_url,
      })
    } else {
      if (!form.universoId) { setGuardando(false); return }
      const tempId = crypto.randomUUID()
      const avatar_url = await subirAvatar(tempId)
      await addPersonaje({ ...form, iniciales, universoId: form.universoId, avatar_url })
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
  await supabase
    .from('notas_privadas')
    .upsert({ personaje_id: personajeId, user_id: userId, contenido }, { onConflict: 'personaje_id,user_id' })
  if (verDetalle?.id === personajeId) setVerDetalle(prev => ({ ...prev, notas: contenido }))
}

  const universoDePersonaje = (universoId) => universos.find(u => u.id === universoId)

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

      {/* Modal crear/editar */}
      {showForm && (
        <div className="modal-overlay" onClick={cerrarForm}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{editando ? 'Editar personaje' : 'Crear personaje'}</h3>
            <div className="form-group">
              <label>Avatar</label>
              <div className="avatar-upload" onClick={() => fileInputRef.current?.click()}>
                {avatarPreview
                  ? <img src={avatarPreview} alt="avatar" className="avatar-preview" />
                  : <div className="avatar-placeholder" style={{ background: form.color }}>
                      {form.nombre ? form.nombre.slice(0, 2).toUpperCase() : '?'}
                    </div>
                }
                <div className="avatar-upload-label">
                  <span>📷</span>
                  <small>{avatarPreview ? 'Cambiar imagen' : 'Subir imagen'}</small>
                </div>
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
              <select value={form.rol} onChange={e => setForm({ ...form, rol: e.target.value })}>
                {ROLES.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Descripción</label>
              <textarea placeholder="¿Quién es este personaje? ¿Cuál es su historia?" value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} rows={3} />
            </div>
            <div className="form-group">
              <label>Color del personaje</label>
              <div className="color-picker">
                {COLORES.map(c => (
                  <div key={c} className={`color-dot ${form.color === c ? 'selected' : ''}`} style={{ background: c }} onClick={() => setForm({ ...form, color: c })} />
                ))}
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

      {/* Modal confirmar borrado */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <h3>¿Eliminar personaje?</h3>
            <p style={{ color: 'var(--text2)', margin: '0.8rem 0 1.5rem' }}>
              Esta acción no se puede deshacer. El personaje "<strong>{confirmDelete.nombre}</strong>" se eliminará permanentemente.
            </p>
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setConfirmDelete(null)}>Cancelar</button>
              <button className="btn-danger" onClick={() => handleDelete(confirmDelete)}>Sí, eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* Detalle personaje */}
      {verDetalle && (
     <DetallePersonaje
  personaje={verDetalle}
  universo={universoDePersonaje(verDetalle.universo_id || verDetalle.universoId)}
  onCerrar={() => setVerDetalle(null)}
  onGuardarNotas={handleGuardarNotas}
  userId={userId}
/>
      )}

      <div className="grid">
        {personajesFiltrados.map(p => {
          const universo = universoDePersonaje(p.universo_id || p.universoId)
          return (
            <div key={p.id} className="card personaje-card">
              {p.avatar_url
                ? <img src={p.avatar_url} alt={p.nombre} className="personaje-avatar-img" />
                : <div className="personaje-avatar" style={{ background: p.color }}>{p.iniciales}</div>
              }
              <div className="card-body">
                <div className="card-badge">{p.rol}</div>
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
  {p.user_id === userId && (
    <>
      <button className="btn-ghost btn-sm" onClick={() => abrirEditar(p)}>Editar</button>
      <button className="btn-danger btn-sm" onClick={() => setConfirmDelete(p)}>Eliminar</button>
    </>
  )}
</div>
              </div>
            </div>
          )
        })}
        {personajesFiltrados.length === 0 && (
          <div className="empty-state">
            <span>👤</span>
            <p>No hay personajes. ¡Crea el primero!</p>
          </div>
        )}
      </div>
    </div>
  )
}
