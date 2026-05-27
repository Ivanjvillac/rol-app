import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { AppProvider, useApp } from './context/AppContext'
import Auth from './pages/Auth'
import Home from './pages/Home'
import Universos from './pages/Universos'
import Personajes from './pages/Personajes'
import Mesa from './pages/Mesa'
import './App.css'

function AppInner({ page, navigate, selectedUniverso, setSelectedUniverso, cerrarSesion, invitacionToken, setInvitacionToken }) {
  const { aceptarInvitacion } = useApp()
  const [msgInvitacion, setMsgInvitacion] = useState(null)

  useEffect(() => {
    if (!invitacionToken) return
    const procesar = async () => {
      const { ok, universo, error } = await aceptarInvitacion(invitacionToken)
      if (ok) {
        setMsgInvitacion({ tipo: 'ok', texto: `¡Te has unido a "${universo?.nombre}"!` })
        if (universo) { setSelectedUniverso(universo); navigate('mesa', universo) }
      } else {
        setMsgInvitacion({ tipo: 'error', texto: error || 'Invitación no válida.' })
      }
      setInvitacionToken(null)
    }
    procesar()
  }, [invitacionToken])

  return (
    <div className="app">
      <nav className="navbar">
        <span className="nav-brand" onClick={() => navigate('home')}>⚔ RolApp</span>
        <div className="nav-links">
          <button onClick={() => navigate('home')} className={page === 'home' ? 'active' : ''}>Inicio</button>
          <button onClick={() => navigate('universos')} className={page === 'universos' ? 'active' : ''}>Universos</button>
          <button onClick={() => navigate('personajes')} className={page === 'personajes' ? 'active' : ''}>Personajes</button>
          <button onClick={() => navigate('mesa')} className={page === 'mesa' ? 'active' : ''}>Mesa de Rol</button>
          <button onClick={cerrarSesion} className="btn-cerrar">Salir</button>
        </div>
      </nav>

      {msgInvitacion && (
        <div className={msgInvitacion.tipo === 'ok' ? 'banner-ok' : 'banner-error'}>
          {msgInvitacion.texto}
          <button onClick={() => setMsgInvitacion(null)}>✕</button>
        </div>
      )}

      {page === 'home' && <Home navigate={navigate} />}
      {page === 'universos' && <Universos navigate={navigate} setSelectedUniverso={setSelectedUniverso} selectedUniverso={selectedUniverso} />}
      {page === 'personajes' && <Personajes navigate={navigate} selectedUniverso={selectedUniverso} />}
      {page === 'mesa' && <Mesa navigate={navigate} selectedUniverso={selectedUniverso} />}
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [page, setPage] = useState('home')
  const [selectedUniverso, setSelectedUniverso] = useState(null)
  const [invitacionToken, setInvitacionToken] = useState(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('invitacion')
    if (token) { setInvitacionToken(token); window.history.replaceState({}, '', '/') }

    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => setSession(session))
    return () => subscription.unsubscribe()
  }, [])

  const navigate = (p, universo = null) => {
    setPage(p)
    if (universo) setSelectedUniverso(universo)
  }

  const cerrarSesion = async () => {
    await supabase.auth.signOut()
    setPage('home')
    setSelectedUniverso(null)
  }

  if (session === undefined) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--accent)', fontFamily: 'Cinzel, serif', letterSpacing: '0.1em' }}>Cargando...</span>
      </div>
    )
  }

  if (!session) return <Auth />

  return (
    <AppProvider userId={session.user.id}>
      <AppInner
        page={page}
        navigate={navigate}
        selectedUniverso={selectedUniverso}
        setSelectedUniverso={setSelectedUniverso}
        cerrarSesion={cerrarSesion}
        invitacionToken={invitacionToken}
        setInvitacionToken={setInvitacionToken}
      />
    </AppProvider>
  )
}
