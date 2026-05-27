import { useState } from 'react'
import { useApp } from '../context/AppContext'

const COLORES = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c', '#3498db', '#9b59b6', '#e91e63']
const ROLES = ['Guerrero', 'Mago', 'Pícaro', 'Clérigo', 'Explorador', 'Bardo', 'Narrador', 'Otro']

export default function Personajes({ navigate, selectedUniverso }) {
  const { universos, personajes, addPersonaje, deletePersonaje, getPersonajesDeUniverso } = useApp()
  const [showForm, setShowForm] = useState(false)
  const [filtroUniverso, setFiltroUniverso] = useState(selectedUniverso?.id || 'todos')
  const [form, setForm] = useState({
    nombre: '', rol: 'Guerrero', descripcion: '',
    color: COLORES[0], universoId: selectedUniverso?.id || ''
  })

  const personajesFiltrados = filtroUniverso === 'todos'
    ? personajes
    : personajes.filter(p => p.universoId === Number(filtroUniverso))

  const handleSubmit = () => {
    if (!form.nombre.trim() || !form.universoId) return
    const iniciales = form.nombre.slice(0, 2).toUpperCase()
    addPersonaje({ ...form, iniciales, universoId: Number(form.universoId) })
    setForm({ nombre: '', rol: 'Guerrero', descripcion: '', color: COLORES[0], universoId: form.universoId })
    setShowForm(false)
  }

  const universoDePersonaje = (universoId) => universos.find(u => u.id === universoId)

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Personajes</h2>
          <p className="page-subtitle">Crea y gestiona los personajes de tus universos</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(true)}>+ Nuevo personaje</button>
      </div>

      <div className="filtro-bar">
        <span>Filtrar por universo:</span>
        <select value={filtroUniverso} onChange={e => setFiltroUniverso(e.target.value)}>
          <option value="todos">Todos</option>
          {universos.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
        </select>
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Crear personaje</h3>
            <div className="form-group">
              <label>Universo</label>
              <select value={form.universoId} onChange={e => setForm({ ...form, universoId: e.target.value })}>
                <option value="">Selecciona un universo...</option>
                {universos.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Nombre</label>
              <input
                placeholder="Nombre del personaje..."
                value={form.nombre}
                onChange={e => setForm({ ...form, nombre: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Rol</label>
              <select value={form.rol} onChange={e => setForm({ ...form, rol: e.target.value })}>
                {ROLES.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Descripción</label>
              <textarea
                placeholder="¿Quién es este personaje? ¿Cuál es su historia?"
                value={form.descripcion}
                onChange={e => setForm({ ...form, descripcion: e.target.value })}
                rows={3}
              />
            </div>
            <div className="form-group">
              <label>Color del personaje</label>
              <div className="color-picker">
                {COLORES.map(c => (
                  <div
                    key={c}
                    className={`color-dot ${form.color === c ? 'selected' : ''}`}
                    style={{ background: c }}
                    onClick={() => setForm({ ...form, color: c })}
                  />
                ))}
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setShowForm(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleSubmit}>Crear personaje</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid">
        {personajesFiltrados.map(p => {
          const universo = universoDePersonaje(p.universoId)
          return (
            <div key={p.id} className="card personaje-card">
              <div className="personaje-avatar" style={{ background: p.color }}>
                {p.iniciales}
              </div>
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
                  <button className="btn-danger btn-sm" onClick={() => deletePersonaje(p.id)}>Eliminar</button>
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
