import { useState, useRef, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'

export function useMesaPresence(selectedUniverso, userId, sesionActiva, personajeActivo) {
  const [usuariosConectados, setUsuariosConectados] = useState([])
  const [otrosEscribiendo, setOtrosEscribiendo] = useState([])
  const canalPresenciaRef = useRef(null)
  const canalEscribiendoRef = useRef(null)
  const nombrePerfilRef = useRef('')

  // Canal de presencia global del universo
  useEffect(() => {
    if (!selectedUniverso?.id || !userId) return
    const canal = supabase.channel(`presencia-${selectedUniverso.id}`, {
      config: { presence: { key: userId } },
    })
    canal
      .on('presence', { event: 'sync' }, () => {
        const estado = canal.presenceState()
        const conectados = Object.values(estado).map(tracks => {
          const ultimo = tracks[tracks.length - 1]
          return {
            userId: ultimo.user_id,
            nombre: ultimo.nombre || ultimo.user_id?.slice(0, 8),
            personaje: ultimo.personaje || null,
          }
        })
        setUsuariosConectados(conectados)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          const { data: perfil } = await supabase.from('perfiles').select('nombre').eq('id', userId).single()
          const nombrePerfil = perfil?.nombre || 'Jugador'
          nombrePerfilRef.current = nombrePerfil
          canalPresenciaRef.current = canal
          canalPresenciaRef.current._nombre = nombrePerfil
          await canal.track({
            user_id: userId,
            nombre: nombrePerfil,
            personaje: personajeActivo
              ? { nombre: personajeActivo.nombre, color: personajeActivo.color, iniciales: personajeActivo.iniciales, avatar_url: personajeActivo.avatar_url }
              : null,
          })
        }
      })
    return () => { supabase.removeChannel(canal); canalPresenciaRef.current = null }
  }, [selectedUniverso?.id, userId])

  // Actualiza presencia cuando cambia el personaje activo
  useEffect(() => {
    if (!canalPresenciaRef.current?._nombre || !userId) return
    canalPresenciaRef.current.track({
      user_id: userId,
      nombre: canalPresenciaRef.current._nombre,
      personaje: personajeActivo
        ? { nombre: personajeActivo.nombre, color: personajeActivo.color, iniciales: personajeActivo.iniciales, avatar_url: personajeActivo.avatar_url }
        : null,
    })
  }, [personajeActivo?.id])

  // Canal de "está escribiendo" (por sesión)
  useEffect(() => {
    if (!selectedUniverso?.id || !sesionActiva?.id || !userId) return
    const canal = supabase
      .channel(`escribiendo-${selectedUniverso.id}-${sesionActiva.id}`)
      .on('broadcast', { event: 'escribiendo' }, ({ payload }) => {
        if (payload.userId === userId) return
        setOtrosEscribiendo(prev => {
          const sin = prev.filter(x => x.userId !== payload.userId)
          if (payload.activo) return [...sin, { userId: payload.userId, nombre: payload.nombre }]
          return sin
        })
      })
      .subscribe()
    canalEscribiendoRef.current = canal
    return () => { supabase.removeChannel(canal); canalEscribiendoRef.current = null }
  }, [selectedUniverso?.id, sesionActiva?.id, userId])

  const emitirEscribiendo = (activo) => {
    if (!selectedUniverso || !canalEscribiendoRef.current) return
    canalEscribiendoRef.current.send({
      type: 'broadcast', event: 'escribiendo',
      payload: { userId, nombre: nombrePerfilRef.current || 'Alguien', activo },
    })
  }

  return { usuariosConectados, otrosEscribiendo, emitirEscribiendo, canalPresenciaRef, canalEscribiendoRef }
}
