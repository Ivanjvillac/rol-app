import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function Auth() {
  const [modo, setModo] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nuevaPassword, setNuevaPassword] = useState('')
  const [cargando, setCargando] = useState(false)
  const [mensaje, setMensaje] = useState(null)
  const [error, setError] = useState(null)
  const [tokenPendiente, setTokenPendiente] = useState(null)

  useEffect(() => {
    // Detectar token de recuperación de contraseña
    const hash = window.location.hash
    if (hash.includes('type=recovery')) {
      setModo('reset')
      window.history.replaceState({}, '', '/')
      return
    }

    // Detectar token de invitación
    const params = new URLSearchParams(window.location.search)
    const token = params.get('invitacion')
    if (token) {
      setTokenPendiente(token)
      sessionStorage.setItem('invitacion_token', token)
      window.history.replaceState({}, '', '/')
    } else {
      const guardado = sessionStorage.getItem('invitacion_token')
      if (guardado) setTokenPendiente(guardado)
    }
  }, [])

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
      else setMensaje('¡Cuenta creada! Revisa tu email para confirmarla y luego inicia sesión.')
    }

    setCargando(false)
  }

  const handleRecuperarPassword = async () => {
    if (!email.trim()) { setError('Escribe tu email primero.'); return }
    setError(null); setMensaje(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}`
    })
    if (error) setError('Error al enviar el email.')
    else setMensaje('Te hemos enviado un email para recuperar tu contraseña.')
  }

  const handleCambiarPassword = async () => {
    if (!nuevaPassword || nuevaPassword.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return }
    setError(null); setMensaje(null); setCargando(true)
    const { error } = await supabase.auth.updateUser({ password: nuevaPassword })
    if (error) setError('Error al cambiar la contraseña.')
    else {
      setMensaje('¡Contraseña cambiada correctamente! Redirigiendo...')
      setTimeout(() => window.location.href = '/', 2000)
    }
    setCargando(false)
  }

  const handleKey = (e) => { if (e.key === 'Enter') handleSubmit() }

  // Pantalla de reset de contraseña
  if (modo === 'reset') {
    return (
      <div className="auth-screen">
        <div className="auth-glow" />
        <div className="auth-box">
          <div style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '3rem' }}>🎲</span>
          </div>
          <h1 className="auth-title">Tinta y Dados</h1>
          <h2 style={{ fontFamily: 'Cinzel, serif', color: 'var(--text2)', fontSize: '1rem', textAlign: 'center', marginBottom: '1.5rem', letterSpacing: '0.05em' }}>Nueva contraseña</h2>

          <div className="form-group">
            <label>Nueva contraseña</label>
            <input
              type="password"
              placeholder="Mínimo 6 caracteres"
              value={nuevaPassword}
              onChange={e => setNuevaPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCambiarPassword()}
              autoFocus
            />
          </div>

          {error && <div className="auth-error">{error}</div>}
          {mensaje && <div className="auth-mensaje">{mensaje}</div>}

          <button className="btn-primary" style={{ width: '100%' }} onClick={handleCambiarPassword} disabled={cargando}>
            {cargando ? 'Guardando...' : 'Cambiar contraseña'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-screen">
      <div className="auth-glow" />
      <div className="auth-box">
        <div style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '3rem' }}>🎲</span>
        </div>
        <h1 className="auth-title">Tinta y Dados</h1>
        <p className="auth-subtitle">Tu mesa de rol escrita</p>

        {tokenPendiente && (
          <div className="auth-mensaje" style={{ marginBottom: '1.2rem' }}>
            🎲 Tienes una invitación pendiente. Inicia sesión o crea una cuenta para unirte.
          </div>
        )}

        <div className="auth-tabs">
          <button className={modo === 'login' ? 'auth-tab active' : 'auth-tab'} onClick={() => { setModo('login'); setError(null); setMensaje(null) }}>Entrar</button>
          <button className={modo === 'registro' ? 'auth-tab active' : 'auth-tab'} onClick={() => { setModo('registro'); setError(null); setMensaje(null) }}>Crear cuenta</button>
        </div>

        <div className="form-group">
          <label>Email</label>
          <input type="email" placeholder="tu@email.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={handleKey} />
        </div>

        <div className="form-group">
          <label>Contraseña</label>
          <input type="password" placeholder="········" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={handleKey} />
        </div>

        {error && <div className="auth-error">{error}</div>}
        {mensaje && <div className="auth-mensaje">{mensaje}</div>}

        <button className="btn-primary" style={{ width: '100%', marginBottom: '0.8rem' }} onClick={handleSubmit} disabled={cargando}>
          {cargando ? 'Cargando...' : modo === 'login' ? '→ Entrar' : '→ Crear cuenta'}
        </button>

        {modo === 'login' && (
          <button className="btn-ghost" style={{ width: '100%', fontSize: '0.85rem' }} onClick={handleRecuperarPassword}>
            ¿Olvidaste tu contraseña?
          </button>
        )}
      </div>
    </div>
  )
}
