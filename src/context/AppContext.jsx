import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const AppContext = createContext()

export function AppProvider({ userId, children }) {
  const [universos, setUniversos] = useState([])
  const [personajes, setPersonajes] = useState([])
  const [sesiones, setSesiones] = useState({})
  const [cargando, setCargando] = useState(true)
  const perfilesCache = useRef({})

  // Caché de perfiles para no repetir queries
  const getPerfil = async (uid) => {
    if (perfilesCache.current[uid]) return perfilesCache.current[uid]
    const { data } = await supabase.from('perfiles').select('id, nombre, avatar_url').eq('id', uid).single()
    if (data) perfilesCache.current[uid] = data
    return data || null
  }

  useEffect(() => {
    if (!userId) return
    const cargar = async () => {
      setCargando(true)

      // 1. Universos propios (creados por el usuario)
      const { data: uPropios } = await supabase
        .from('universos')
        .select('*')
        .eq('user_id', userId)
        .order('created_at')

      // 2. Universos donde el usuario es miembro (invitado)
      const { data: membresias } = await supabase
        .from('miembros')
        .select('universo_id')
        .eq('user_id', userId)

      const idsPropios = (uPropios || []).map(u => u.id)
      const idsAjenos = (membresias || [])
        .map(m => m.universo_id)
        .filter(id => !idsPropios.includes(id))

      let uAjenos = []
      if (idsAjenos.length > 0) {
        const { data } = await supabase
          .from('universos')
          .select('*')
          .in('id', idsAjenos)
          .order('created_at')
        uAjenos = data || []
      }

      const todosUniversos = [...(uPropios || []), ...uAjenos]
      setUniversos(todosUniversos)

      // 3. Personajes de todos los universos accesibles
      const todosIds = todosUniversos.map(u => u.id)
      let todosPersonajes = []
      if (todosIds.length > 0) {
        const { data: p } = await supabase
          .from('personajes')
          .select('*')
          .in('universo_id', todosIds)
          .order('created_at')
        todosPersonajes = p || []
      }
      setPersonajes(todosPersonajes)

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
       avatar_url: resto.avatar_url || null,
      es_npc: resto.es_npc || false,
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
 // SESIONES (hilos)
const [listaSesiones, setListaSesiones] = useState({})
const [sesionActivaId, setSesionActivaId] = useState({})

const cargarListaSesiones = async (universoId) => {
  const { data } = await supabase
    .from('sesiones')
    .select('*')
    .eq('universo_id', universoId)
    .order('created_at')
  setListaSesiones(prev => ({ ...prev, [universoId]: data || [] }))
  return data || []
}

const crearSesion = async (universoId, nombre, esPrivada = false, miembros = [], padreId = null) => {
  const { data, error } = await supabase
    .from('sesiones')
    .insert({ universo_id: universoId, user_id: userId, nombre, es_privada: esPrivada, padre_id: padreId })
    .select()
    .single()
  if (!error) {
    if (esPrivada) {
      const ahora = new Date().toISOString()
      const inserts = [
        { sesion_id: data.id, user_id: userId, joined_at: '2000-01-01T00:00:00Z' },
        ...miembros.map(uid => ({ sesion_id: data.id, user_id: uid, joined_at: ahora }))
      ]
      await supabase.from('sesion_miembros').insert(inserts)
    }
    setListaSesiones(prev => ({
      ...prev,
      [universoId]: [...(prev[universoId] || []), data]
    }))
  }
  return { data, error }
}
const eliminarSesion = async (sesionId, universoId) => {
  await supabase.from('sesiones').delete().eq('id', sesionId)
  setListaSesiones(prev => ({
    ...prev,
    [universoId]: (prev[universoId] || []).filter(s => s.id !== sesionId)
  }))
  setSesiones(prev => { const n = { ...prev }; delete n[sesionId]; return n })
}

const cargarSesion = async (sesionId) => {
  // Obtener joined_at del usuario en esta sesión (si es privada)
  const { data: membresia } = await supabase
    .from('sesion_miembros')
    .select('joined_at')
    .eq('sesion_id', sesionId)
    .eq('user_id', userId)
    .single()

  let query = supabase
    .from('entradas')
    .select('*')
    .eq('sesion_id', sesionId)
    .order('created_at')

  // Si tiene joined_at y no es desde el principio de los tiempos, filtrar
  if (membresia?.joined_at && membresia.joined_at > '2001-01-01') {
    query = query.gte('created_at', membresia.joined_at)
  }

  const { data } = await query
  const formateadas = (data || []).map(formatearEntrada)
  setSesiones(prev => ({ ...prev, [sesionId]: formateadas }))
}

const getSesion = (sesionId) => sesiones[sesionId] || []

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

 const addEntrada = async (universoId, entrada, sesionId) => {
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
      sesion_id: sesionId || null,
      tono: entrada.tono || 'normal'
    })
    .select()
  if (!error && data?.length > 0) {
    const key = sesionId || universoId
    setSesiones(prev => ({
      ...prev,
      [key]: [...(prev[key] || []), formatearEntrada(data[0])]
    }))
  }
}
const editarEntrada = async (id, contenido) => {
  const { data, error } = await supabase
    .from('entradas')
    .update({ contenido, editado: true })
    .eq('id', id)
    .select()
  if (!error && data?.length > 0) {
    setSesiones(prev => {
      const nuevo = {}
      for (const key in prev) {
        nuevo[key] = prev[key].map(e => e.id === id ? { ...e, contenido, editado: true } : e)
      }
      return nuevo
    })
  }
}

const borrarEntrada = async (id) => {
  await supabase.from('entradas').delete().eq('id', id)
  setSesiones(prev => {
    const nuevo = {}
    for (const key in prev) {
      nuevo[key] = prev[key].filter(e => e.id !== id)
    }
    return nuevo
  })
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
const suscribirMesa = (universoId, sesionId, onNuevaEntrada) => {
  const channel = supabase
    .channel(`mesa-${universoId}-${sesionId || 'all'}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'entradas',
      filter: `universo_id=eq.${universoId}`
    }, (payload) => {
      const nueva = formatearEntrada(payload.new)
      if (sesionId && nueva.sesion_id !== sesionId) return
      const key = sesionId || universoId
      setSesiones(prev => {
        const actual = prev[key] || []
        if (actual.some(e => e.id === nueva.id)) return prev
        return { ...prev, [key]: [...actual, nueva] }
      })
      if (onNuevaEntrada) onNuevaEntrada(nueva)
    })
    .subscribe()
  return () => supabase.removeChannel(channel)
}

  const getPersonajesDeUniverso = (universoId) =>
    personajes.filter(p => (p.universo_id || p.universoId) === universoId)


  const esPropietario = (universoId) => {
    const u = universos.find(u => u.id === universoId)
    return u?.user_id === userId
  }

  // BACKUP DE UNIVERSO
  const backupUniverso = async (universoId) => {
    const universo = universos.find(u => u.id === universoId)
    const [{ data: pers }, { data: sess }] = await Promise.all([
      supabase.from('personajes').select('*').eq('universo_id', universoId),
      supabase.from('sesiones').select('*').eq('universo_id', universoId),
    ])
    const sesionIds = (sess || []).map(s => s.id)
    let entradas = []
    if (sesionIds.length > 0) {
      const { data } = await supabase.from('entradas').select('*').in('sesion_id', sesionIds).order('created_at')
      entradas = data || []
    }
    const backup = { universo, personajes: pers || [], sesiones: sess || [], entradas, exportado_en: new Date().toISOString() }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `backup-${universo?.nombre || universoId}-${new Date().toISOString().slice(0,10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  // TRANSFERIR PROPIEDAD
  const transferirPropiedad = async (universoId, nuevoUserId) => {
    const { error } = await supabase.from('universos').update({ user_id: nuevoUserId }).eq('id', universoId)
    if (!error) setUniversos(prev => prev.map(u => u.id === universoId ? { ...u, user_id: nuevoUserId } : u))
    return { error }
  }

  return (
    <AppContext.Provider value={{
      universos, personajes, sesiones, cargando, userId,
      addUniverso, addPersonaje, deleteUniverso, deletePersonaje,
      updateUniverso, updatePersonaje,
      addEntrada, getPersonajesDeUniverso, getSesion, cargarSesion,
      invitarUsuario, getInvitaciones, aceptarInvitacion,
      suscribirMesa, esPropietario,
      listaSesiones, sesionActivaId, setSesionActivaId,
cargarListaSesiones, crearSesion, eliminarSesion,
editarEntrada, borrarEntrada, getPerfil,
backupUniverso, transferirPropiedad,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)
