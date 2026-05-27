import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

export default function Perfil({ userId, userEmail }) {
  const [nombre, setNombre] = useState('')
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [avatarFile, setAvatarFile] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [cargando, setCargando] = useState(true)
  const fileInputRef = useRef(null)

  useEffect(() => {
    cargarPerfil()
  }, [userId])

  const cargarPerfil = async () => {
    setCargando(true)
    const { data } = await supabase
      .from('perfiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (data) {
      setNombre(data.nombre || '')
      setAvatarUrl(data.avatar_url || null)
      setAvatarPreview(data.avatar_url || null)
    }
    setCargando(false)
  }

  const handleAvatarChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  const subirAvatar = async () => {
    if (!avatarFile) return avatarUrl
    const ext = avatarFile.name.split('.').pop()
    const path = `${userId}.${ext}`
    const { error } = await supabase.storage
      .from('perfiles')
      .upload(path, avatarFile, { upsert: true })
    if (error) return avatarUrl
    const { data } = supabase.storage.from('perfiles').getPublicUrl(path)
    return data.publicUrl
  }

  const handleGuardar = async () => {
    setGuardando(true)
    const nuevaUrl = await subirAvatar()

    const { error } = await supabase
      .from('perfiles')
      .upsert({ id: userId, nombre, avatar_url: nuevaUrl, updated_at: new Date().toISOString() })

    if (!error) {
      setAvatarUrl(nuevaUrl)
      setAvatarFile(null)
      setGuardado(true)
      setTimeout(() => setGuardado(false), 2000)
    }
    setGuardando(false)
  }

  if (cargando) return <div className="page"><div className="empty-state"><p>Cargando perfil...</p></div></div>

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Mi Perfil</h2>
          <p className="page-subtitle">Tu identidad en RolApp</p>
        </div>
      </div>

      <div className="perfil-card">
        {/* Avatar */}
        <div className="perfil-avatar-section">
          <div className="perfil-avatar-wrapper" onClick={() => fileInputRef.current?.click()}>
            {avatarPreview
              ? <img src={avatarPreview} alt="avatar" className="perfil-avatar-img" />
              : <div className="perfil-avatar-placeholder">
                  {nombre ? nombre.slice(0, 2).toUpperCase() : userEmail?.slice(0, 2).toUpperCase()}
                </div>
            }
            <div className="perfil-avatar-overlay">📷</div>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
          <p style={{ color: 'var(--text3)', fontSize: '0.85rem', marginTop: '0.5rem' }}>Haz clic para cambiar</p>
        </div>

        {/* Datos */}
        <div className="perfil-datos">
          <div className="form-group">
            <label>Email</label>
            <input value={userEmail} disabled style={{ opacity: 0.5 }} />
          </div>

          <div className="form-group">
            <label>Nombre para mostrar</label>
            <input
              placeholder="¿Cómo quieres que te llamen?"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
            />
            <small style={{ color: 'var(--text3)', fontSize: '0.82rem', marginTop: '0.3rem', display: 'block' }}>
              Este nombre aparecerá en la mesa de rol cuando escribas como Narrador.
            </small>
          </div>

          <button className="btn-primary" onClick={handleGuardar} disabled={guardando} style={{ marginTop: '0.5rem' }}>
            {guardado ? '✓ Guardado' : guardando ? 'Guardando...' : 'Guardar perfil'}
          </button>
        </div>
      </div>
    </div>
  )
}
