import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Auth() {
  const [modo, setModo] = useState('login') // login | registro
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [cargando, setCargando] = useState(false)
  const [mensaje, setMensaje] = useState(null)
  const [error, setError] = useState(null)

  const handleSubmit = async () => {
    if (!email || !password) return
    setCargando(true)
    setError(null)
    setMensaje(null)

    if (modo === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError('Email o contraseña incorrectos.')
    } else {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setError('Error al crear la cuenta. Prueba con otro email.')
      else setMensaje('¡Cuenta creada! Revisa tu email para confirmarla.')
    }

    setCargando(false)
  }

  const handleKey = (e) => {
    if (e.key === 'Enter') handleSubmit()
  }

  return (
    <div className="auth-screen">
      <div className="auth-glow" />
      <div className="auth-box">
        <h1 className="auth-title">⚔ RolApp</h1>
        <p className="auth-subtitle">Tu mesa de rol escrita</p>

        <div className="auth-tabs">
          <button
            className={modo === 'login' ? 'auth-tab active' : 'auth-tab'}
            onClick={() => { setModo('login'); setError(null); setMensaje(null) }}
          >
            Entrar
          </button>
          <button
            className={modo === 'registro' ? 'auth-tab active' : 'auth-tab'}
            onClick={() => { setModo('registro'); setError(null); setMensaje(null) }}
          >
            Crear cuenta
          </button>
        </div>

        <div className="form-group">
          <label>Email</label>
          <input
            type="email"
            placeholder="tu@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={handleKey}
          />
        </div>

        <div className="form-group">
          <label>Contraseña</label>
          <input
            type="password"
            placeholder="········"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={handleKey}
          />
        </div>

        {error && <div className="auth-error">{error}</div>}
        {mensaje && <div className="auth-mensaje">{mensaje}</div>}

        <button className="btn-primary" style={{ width: '100%' }} onClick={handleSubmit} disabled={cargando}>
          {cargando ? 'Cargando...' : modo === 'login' ? 'Entrar' : 'Crear cuenta'}
        </button>
      </div>
    </div>
  )
}
