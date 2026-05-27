import { useState } from 'react'
import { AppProvider } from './context/AppContext'
import Home from './pages/Home'
import Universos from './pages/Universos'
import Personajes from './pages/Personajes'
import Mesa from './pages/Mesa'
import './App.css'

export default function App() {
  const [page, setPage] = useState('home')
  const [selectedUniverso, setSelectedUniverso] = useState(null)

  const navigate = (p, universo = null) => {
    setPage(p)
    if (universo) setSelectedUniverso(universo)
  }

  return (
    <AppProvider>
      <div className="app">
        {page !== 'home' && (
          <nav className="navbar">
            <span className="nav-brand" onClick={() => navigate('home')}>⚔ RolApp</span>
            <div className="nav-links">
              <button onClick={() => navigate('universos')} className={page === 'universos' ? 'active' : ''}>Universos</button>
              <button onClick={() => navigate('personajes')} className={page === 'personajes' ? 'active' : ''}>Personajes</button>
              {selectedUniverso && (
                <button onClick={() => navigate('mesa')} className={page === 'mesa' ? 'active' : ''}>Mesa de Rol</button>
              )}
            </div>
          </nav>
        )}
        {page === 'home' && <Home navigate={navigate} />}
        {page === 'universos' && <Universos navigate={navigate} setSelectedUniverso={setSelectedUniverso} selectedUniverso={selectedUniverso} />}
        {page === 'personajes' && <Personajes navigate={navigate} selectedUniverso={selectedUniverso} />}
        {page === 'mesa' && <Mesa navigate={navigate} selectedUniverso={selectedUniverso} />}
      </div>
    </AppProvider>
  )
}
