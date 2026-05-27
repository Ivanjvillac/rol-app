import { useState } from 'react'
import { useApp } from '../context/AppContext'

const COLORES = ['#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#d35400', '#16a085', '#2c3e50', '#f39c12']
const AMBIENTACIONES = ['Fantasía', 'Ciencia Ficción', 'Terror', 'Steampunk', 'Histórico', 'Contemporáneo', 'Postapocalíptico', 'Otro']

export default function Universos({ navigate, setSelectedUniverso, selectedUniverso }) {
  const { universos, addUniverso, deleteUniverso, updateUniverso, getPersonajesDeUniverso } = useApp()
  const [showForm, setShowForm] = useState(false)
  const [editando, setEditando] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [form, setForm] = useState({ nombre: '', descripcion: '', ambientacion: 'Fantasía', color: COLORES[0] })

  const abrirNuevo = () => {
    setEditando(null)
    setForm({ nombre: '', descripcion: '', ambientacion: 'Fantasía', color: COLORES[0] })
    setShowForm(true)
  }

  const abrirEditar = (u) => {
    setEditando(u)
    setForm({ nombre: u.nombre, descripcion: u.descripcion || '', ambientacion: u.ambientacion, color: u.color })
    setShowForm(true)
  }

  const cerrarForm = () => {
    setShowForm(false)
    setEditando(null)
  }

  const handleSubmit = async () => {
    if (!form.nombre.trim()) return
    setGuardando(true)
    if (editando) {
      await updateUniverso(editando.id, form)
    } else {
      await addUniverso(form)
    }
    setGuardando(false)
    cerrarForm()
  }

  const handleDelete = async (id) => {
    await deleteUniverso(id)
    if (selectedUniverso?.id === id) setSelectedUniverso(null)
    setConfirmDelete(null)
  }

  const seleccionar = (u) => {
    setSelectedUniverso(u)
    navigate('personajes', u)
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Universos</h2>
          <p className="page-subtitle">Cada universo es un mundo con sus propias reglas y personajes</p>
        </div>
        <button className="btn-primary" onClick={abrirNuevo}>+ Nuevo universo</button>
      </div>

      {/* Modal crear/editar */}
      {showForm && (
        <div className="modal-overlay" onClick={cerrarForm}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{editando ? 'Editar universo' : 'Crear universo'}</h3>
            <div className="form-group">
              <label>Nombre</label>
              <input
                placeholder="El nombre de tu mundo..."
                value={form.nombre}
                onChange={e => setForm({ ...form, nombre: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Descripción</label>
              <textarea
                placeholder="¿Cómo es este mundo? ¿Qué lo hace único?"
                value={form.descripcion}
                onChange={e => setForm({ ...form, descripcion: e.target.value })}
                rows={3}
              />
            </div>
            <div className="form-group">
              <label>Ambientación</label>
              <select value={form.ambientacion} onChange={e => setForm({ ...form, ambientacion: e.target.value })}>
                {AMBIENTACIONES.map(a => <option key={a}>{a}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Color identificativo</label>
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
              <button className="btn-ghost" onClick={cerrarForm}>Cancelar</button>
              <button className="btn-primary" onClick={handleSubmit} disabled={guardando}>
                {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear universo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmar borrado */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <h3>¿Eliminar universo?</h3>
            <p style={{ color: 'var(--text2)', margin: '0.8rem 0 0.5rem' }}>
              Se eliminará "<strong>{confirmDelete.nombre}</strong>" junto con todos sus personajes y entradas de sesión.
            </p>
            <p style={{ color: 'var(--danger)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              ⚠ Esta acción no se puede deshacer.
            </p>
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setConfirmDelete(null)}>Cancelar</button>
              <button className="btn-danger" onClick={() => handleDelete(confirmDelete.id)}>Sí, eliminar todo</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid">
        {universos.map(u => {
          const nPersonajes = getPersonajesDeUniverso(u.id).length
          return (
            <div key={u.id} className={`card universo-card ${selectedUniverso?.id === u.id ? 'card-selected' : ''}`}>
              <div className="universo-banner" style={{ background: u.color }} />
              <div className="card-body">
                <div className="card-badge">{u.ambientacion}</div>
                <h3>{u.nombre}</h3>
                <p>{u.descripcion || 'Sin descripción'}</p>
                <p style={{ fontSize: '0.85rem', color: 'var(--text3)', marginTop: '0.4rem' }}>
                  {nPersonajes} {nPersonajes === 1 ? 'personaje' : 'personajes'}
                </p>
                <div className="card-actions">
                  <button className="btn-primary btn-sm" onClick={() => seleccionar(u)}>Entrar →</button>
                  <button className="btn-ghost btn-sm" onClick={() => abrirEditar(u)}>Editar</button>
                  <button className="btn-danger btn-sm" onClick={() => setConfirmDelete(u)}>Eliminar</button>
                </div>
              </div>
            </div>
          )
        })}
        {universos.length === 0 && (
          <div className="empty-state">
            <span>🌍</span>
            <p>No hay universos todavía. ¡Crea el primero!</p>
          </div>
        )}
      </div>
    </div>
  )
}
