import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { AppProvider } from './context/AppContext'
import Auth from './pages/Auth'
import Home from './pages/Home'
import Universos from './pages/Universos'
import Personajes from './pages/Personajes'
import Mesa from './pages/Mesa'
import './App.css'

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = cargando
  const [page, setPage] = useState('home')
  const [selectedUniverso, setSelectedUniverso] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
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

  // Cargando
  if (session === undefined) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--accent)', fontFamily: 'Cinzel, serif', letterSpacing: '0.1em' }}>Cargando...</span>
      </div>
    )
  }

  // Sin sesión → pantalla de login
  if (!session) return <Auth />

  // Con sesión → app completa
  return (
    <AppProvider userId={session.user.id}>
      <div className="app">
        <nav className="navbar">
          <span className="nav-brand" onClick={() => navigate('home')}>⚔ RolApp</span>
          <div className="nav-links">
            <button onClick={() => navigate('home')} className={page === 'home' ? 'active' : ''}>Inicio</button>
            <button onClick={() => navigate('universos')} className={page === 'universos' ? 'active' : ''}>Universos</button>
            <button onClick={() => navigate('personajes')} className={page === 'personajes' ? 'active' : ''}>Personajes</button>
            {selectedUniverso && (
              <button onClick={() => navigate('mesa')} className={page === 'mesa' ? 'active' : ''}>Mesa de Rol</button>
            )}
            <button onClick={cerrarSesion} className="btn-cerrar">Salir</button>
          </div>
        </nav>
        {page === 'home' && <Home navigate={navigate} />}
        {page === 'universos' && <Universos navigate={navigate} setSelectedUniverso={setSelectedUniverso} selectedUniverso={selectedUniverso} />}
        {page === 'personajes' && <Personajes navigate={navigate} selectedUniverso={selectedUniverso} />}
        {page === 'mesa' && <Mesa navigate={navigate} selectedUniverso={selectedUniverso} />}
      </div>
    </AppProvider>
  )
}
