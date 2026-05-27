import { createContext, useContext, useState } from 'react'

const AppContext = createContext()

export function AppProvider({ children }) {
  const [universos, setUniversos] = useState([
    {
      id: 1,
      nombre: 'El Reino de Aethor',
      descripcion: 'Un mundo de fantasía épica donde la magia y la tecnología coexisten en un frágil equilibrio.',
      ambientacion: 'Fantasía',
      color: '#c0392b'
    }
  ])

  const [personajes, setPersonajes] = useState([
    {
      id: 1,
      universoId: 1,
      nombre: 'Kael',
      rol: 'Guerrero',
      descripcion: 'Un veterano de las guerras del norte, silencioso y letal.',
      color: '#e67e22',
      iniciales: 'KA'
    },
    {
      id: 2,
      universoId: 1,
      nombre: 'Lyra',
      rol: 'Maga',
      descripcion: 'Estudiante de la Torre Arcana, curiosa e impulsiva.',
      color: '#8e44ad',
      iniciales: 'LY'
    }
  ])

  const [sesiones, setSesiones] = useState({})

  const addUniverso = (u) => setUniversos(prev => [...prev, { ...u, id: Date.now() }])
  const addPersonaje = (p) => setPersonajes(prev => [...prev, { ...p, id: Date.now() }])
  const deleteUniverso = (id) => {
    setUniversos(prev => prev.filter(u => u.id !== id))
    setPersonajes(prev => prev.filter(p => p.universoId !== id))
  }
  const deletePersonaje = (id) => setPersonajes(prev => prev.filter(p => p.id !== id))

  const addEntrada = (universoId, entrada) => {
    setSesiones(prev => ({
      ...prev,
      [universoId]: [...(prev[universoId] || []), { ...entrada, id: Date.now(), timestamp: new Date() }]
    }))
  }

  const getPersonajesDeUniverso = (universoId) => personajes.filter(p => p.universoId === universoId)
  const getSesion = (universoId) => sesiones[universoId] || []

  return (
    <AppContext.Provider value={{
      universos, personajes, sesiones,
      addUniverso, addPersonaje, deleteUniverso, deletePersonaje,
      addEntrada, getPersonajesDeUniverso, getSesion
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)
