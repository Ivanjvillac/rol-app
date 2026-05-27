import { useState } from 'react'
import { useApp } from '../context/AppContext'

const COLORES = ['#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#d35400', '#16a085', '#2c3e50', '#f39c12']
const AMBIENTACIONES = ['Fantasía', 'Ciencia Ficción', 'Terror', 'Steampunk', 'Histórico', 'Contemporáneo', 'Postapocalíptico', 'Otro']

export default function Universos({ navigate, setSelectedUniverso, selectedUniverso }) {
  const { universos, addUniverso, deleteUniverso } = useApp()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ nombre: '', descripcion: '', ambientacion: 'Fantasía', color: COLORES[0] })

  const handleSubmit = () => {
    if (!form.nombre.trim()) return
    addUniverso(form)
    setForm({ nombre: '', descripcion: '', ambientacion: 'Fantasía', color: COLORES[0] })
    setShowForm(false)
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
        <button className="btn-primary" onClick={() => setShowForm(true)}>+ Nuevo universo</button>
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Crear universo</h3>
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
              <button className="btn-ghost" onClick={() => setShowForm(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleSubmit}>Crear universo</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid">
        {universos.map(u => (
          <div key={u.id} className={`card universo-card ${selectedUniverso?.id === u.id ? 'card-selected' : ''}`}>
            <div className="universo-banner" style={{ background: u.color }} />
            <div className="card-body">
              <div className="card-badge">{u.ambientacion}</div>
              <h3>{u.nombre}</h3>
              <p>{u.descripcion || 'Sin descripción'}</p>
              <div className="card-actions">
                <button className="btn-primary btn-sm" onClick={() => seleccionar(u)}>
                  Entrar →
                </button>
                <button className="btn-danger btn-sm" onClick={() => deleteUniverso(u.id)}>
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        ))}
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
