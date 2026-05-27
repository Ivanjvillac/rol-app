import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const AppContext = createContext()

export function AppProvider({ userId, children }) {
  const [universos, setUniversos] = useState([])
  const [personajes, setPersonajes] = useState([])
  const [sesiones, setSesiones] = useState({})
  const [cargando, setCargando] = useState(true)

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
    return { data, error }
  }

  const deleteUniverso = async (id) => {
    await supabase.from('universos').delete().eq('id', id)
    setUniversos(prev => prev.filter(u => u.id !== id))
    setPersonajes(prev => prev.filter(p => p.universo_id !== id))
  }

  const updateUniverso = async (id, cambios) => {
    const { data, error } = await supabase
      .from('universos')
      .update(cambios)
      .eq('id', id)
      .select()
      .single()
    if (!error) setUniversos(prev => prev.map(u => u.id === id ? data : u))
    return { data, error }
  }

  // PERSONAJES
 const addPersonaje = async (p) => {
  const { universoId, ...resto } = p
  const { data, error } = await supabase
    .from('personajes')
    .insert({ 
      nombre: resto.nombre,
      rol: resto.rol,
      descripcion: resto.descripcion,
      color: resto.color,
      iniciales: resto.iniciales,
      universo_id: universoId,
      user_id: userId 
    })
    .select()
  if (!error && data?.length > 0) setPersonajes(prev => [...prev, data[0]])
  return { data: data?.[0], error }
}
  const deletePersonaje = async (id) => {
    await supabase.from('personajes').delete().eq('id', id)
    setPersonajes(prev => prev.filter(p => p.id !== id))
  }

  const updatePersonaje = async (id, cambios) => {
    const { data, error } = await supabase
      .from('personajes')
      .update(cambios)
      .eq('id', id)
      .select()
      .single()
    if (!error) setPersonajes(prev => prev.map(p => p.id === id ? data : p))
    return { data, error }
  }

  // ENTRADAS
  const cargarSesion = async (universoId) => {
    if (sesiones[universoId]) return
    const { data } = await supabase
      .from('entradas')
      .select('*')
      .eq('universo_id', universoId)
      .order('created_at')
    const formateadas = (data || []).map(formatearEntrada)
    setSesiones(prev => ({ ...prev, [universoId]: formateadas }))
  }

  const formatearEntrada = (e) => ({
    ...e,
    personaje: e.personaje_nombre ? {
      nombre: e.personaje_nombre,
      color: e.personaje_color,
      iniciales: e.personaje_iniciales,
      avatar_url: e.personaje_avatar_url,
    } : null,
    timestamp: e.created_at,
  })

 const addEntrada = async (universoId, entrada) => {
  const { data, error } = await supabase
    .from('entradas')
    .insert({
      universo_id: universoId,
      user_id: userId,
      tipo: entrada.tipo,
      contenido: entrada.contenido || '',
      imagen_url: entrada.imagen_url || null,
      personaje_nombre: entrada.personaje?.nombre || null,
      personaje_color: entrada.personaje?.color || null,
      personaje_iniciales: entrada.personaje?.iniciales || null,
      personaje_avatar_url: entrada.personaje?.avatar_url || null,
    })
    .select()
  if (!error && data?.length > 0) {
    setSesiones(prev => ({
      ...prev,
      [universoId]: [...(prev[universoId] || []), formatearEntrada(data[0])]
    }))
  }
}

  // INVITACIONES
  const invitarUsuario = async (universoId, email) => {
    const { data, error } = await supabase
      .from('invitaciones')
      .insert({ universo_id: universoId, email })
      .select()
      .single()
    return { data, error }
  }

  const getInvitaciones = async (universoId) => {
    const { data } = await supabase
      .from('invitaciones')
      .select('*')
      .eq('universo_id', universoId)
      .order('created_at', { ascending: false })
    return data || []
  }

  const aceptarInvitacion = async (token) => {
    const { data: inv, error } = await supabase
      .from('invitaciones')
      .select('*')
      .eq('token', token)
      .eq('estado', 'pendiente')
      .single()
    if (error || !inv) return { error: 'Invitación no válida o ya usada.' }

    await supabase.from('invitaciones').update({ estado: 'aceptada' }).eq('id', inv.id)
    const { error: err2 } = await supabase
      .from('miembros')
      .insert({ universo_id: inv.universo_id, user_id: userId })
    if (err2 && !err2.message.includes('duplicate')) return { error: err2.message }

    const { data: u } = await supabase.from('universos').select('*').eq('id', inv.universo_id).single()
    if (u) setUniversos(prev => prev.find(x => x.id === u.id) ? prev : [...prev, u])
    return { ok: true, universo: u }
  }

  // TIEMPO REAL
const suscribirMesa = (universoId, onNuevaEntrada) => {
  const channel = supabase
    .channel(`mesa-${universoId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'entradas',
      filter: `universo_id=eq.${universoId}`
    }, (payload) => {
      const nueva = formatearEntrada(payload.new)
      setSesiones(prev => {
        const sesionActual = prev[universoId] || []
        const yaExiste = sesionActual.some(e => e.id === nueva.id)
        if (yaExiste) return prev
        return { ...prev, [universoId]: [...sesionActual, nueva] }
      })
      if (onNuevaEntrada) onNuevaEntrada(nueva)
    })
    .subscribe()
  return () => supabase.removeChannel(channel)
}

  const getPersonajesDeUniverso = (universoId) =>
    personajes.filter(p => (p.universo_id || p.universoId) === universoId)

  const getSesion = (universoId) => sesiones[universoId] || []

  const esPropietario = (universoId) => {
    const u = universos.find(u => u.id === universoId)
    return u?.user_id === userId
  }

  return (
    <AppContext.Provider value={{
      universos, personajes, sesiones, cargando, userId,
      addUniverso, addPersonaje, deleteUniverso, deletePersonaje,
      updateUniverso, updatePersonaje,
      addEntrada, getPersonajesDeUniverso, getSesion, cargarSesion,
      invitarUsuario, getInvitaciones, aceptarInvitacion,
      suscribirMesa, esPropietario
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)
