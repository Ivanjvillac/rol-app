import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const AppContext = createContext()

export function AppProvider({ userId, children }) {
  const [universos, setUniversos] = useState([])
  const [personajes, setPersonajes] = useState([])
  const [sesiones, setSesiones] = useState({})
  const [cargando, setCargando] = useState(true)

  // Cargar datos iniciales
  useEffect(() => {
    if (!userId) return
    const cargar = async () => {
      setCargando(true)
      const [{ data: u }, { data: p }] = await Promise.all([
        supabase.from('universos').select('*').order('created_at'),
        supabase.from('personajes').select('*').order('created_at'),
      ])
      setUniversos(u || [])
      setPersonajes(p || [])
      setCargando(false)
    }
    cargar()
  }, [userId])

  // UNIVERSOS
  const addUniverso = async (u) => {
    const { data, error } = await supabase
      .from('universos')
      .insert({ ...u, user_id: userId })
      .select()
      .single()
    if (!error) setUniversos(prev => [...prev, data])
  }

  const deleteUniverso = async (id) => {
    await supabase.from('universos').delete().eq('id', id)
    setUniversos(prev => prev.filter(u => u.id !== id))
    setPersonajes(prev => prev.filter(p => p.universo_id !== id))
  }

  // PERSONAJES
  const addPersonaje = async (p) => {
    const { data, error } = await supabase
      .from('personajes')
      .insert({ ...p, universo_id: p.universoId, user_id: userId })
      .select()
      .single()
    if (!error) setPersonajes(prev => [...prev, data])
  }

  const deletePersonaje = async (id) => {
    await supabase.from('personajes').delete().eq('id', id)
    setPersonajes(prev => prev.filter(p => p.id !== id))
  }

  // ENTRADAS DE SESIÓN
  const cargarSesion = async (universoId) => {
    if (sesiones[universoId]) return
    const { data } = await supabase
      .from('entradas')
      .select('*')
      .eq('universo_id', universoId)
      .order('created_at')
    setSesiones(prev => ({ ...prev, [universoId]: data || [] }))
  }

  const addEntrada = async (universoId, entrada) => {
    const { data, error } = await supabase
      .from('entradas')
      .insert({
        universo_id: universoId,
        user_id: userId,
        tipo: entrada.tipo,
        contenido: entrada.contenido,
        personaje_nombre: entrada.personaje?.nombre || null,
        personaje_color: entrada.personaje?.color || null,
        personaje_iniciales: entrada.personaje?.iniciales || null,
      })
      .select()
      .single()
    if (!error) {
      const entradaFormateada = {
        ...data,
        personaje: entrada.personaje ? {
          nombre: data.personaje_nombre,
          color: data.personaje_color,
          iniciales: data.personaje_iniciales,
        } : null,
        timestamp: data.created_at,
      }
      setSesiones(prev => ({
        ...prev,
        [universoId]: [...(prev[universoId] || []), entradaFormateada]
      }))
    }
  }

  const getPersonajesDeUniverso = (universoId) =>
    personajes.filter(p => (p.universo_id || p.universoId) === universoId)

  const getSesion = (universoId) => sesiones[universoId] || []

  return (
    <AppContext.Provider value={{
      universos, personajes, sesiones, cargando,
      addUniverso, addPersonaje, deleteUniverso, deletePersonaje,
      addEntrada, getPersonajesDeUniverso, getSesion, cargarSesion
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)
