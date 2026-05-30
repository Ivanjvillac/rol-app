import { useState, useRef, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'

export function useMesaTimer(selectedUniverso) {
  const [timerFin, setTimerFin] = useState(null)
  const [timerLabel, setTimerLabel] = useState('')
  const [timerDisplay, setTimerDisplay] = useState('')
  const [timerMinutos, setTimerMinutos] = useState('5')
  const [timerSegundos, setTimerSegundos] = useState('0')
  const [showTimerConfig, setShowTimerConfig] = useState(false)
  const timerIntervalRef = useRef(null)

  // Carga inicial directa desde DB (no depende del timing del canal)
  useEffect(() => {
    if (!selectedUniverso?.id) return
    supabase.from('universos').select('timer_fin, timer_label').eq('id', selectedUniverso.id).single()
      .then(({ data }) => {
        if (data) {
          setTimerFin(data.timer_fin ? new Date(data.timer_fin) : null)
          setTimerLabel(data.timer_label || '')
        }
      })
  }, [selectedUniverso?.id])

  // Suscripción realtime a cambios posteriores
  useEffect(() => {
    if (!selectedUniverso?.id) return
    const ch = supabase
      .channel(`timer-universo-${selectedUniverso.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'universos',
        filter: `id=eq.${selectedUniverso.id}`,
      }, (payload) => {
        setTimerFin(payload.new.timer_fin ? new Date(payload.new.timer_fin) : null)
        setTimerLabel(payload.new.timer_label || '')
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [selectedUniverso?.id])

  // Cuenta atrás local
  useEffect(() => {
    if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null }
    if (!timerFin) { setTimerDisplay(''); return }

    const fin = new Date(timerFin).getTime()
    const tick = () => {
      const diff = fin - Date.now()
      if (diff <= 0) {
        setTimerDisplay('⏰ ¡Tiempo!')
        if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null }
        setTimeout(() => { setTimerDisplay(''); setTimerFin(null) }, 5000)
        return
      }
      const m = Math.floor(diff / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setTimerDisplay(`${m}:${s.toString().padStart(2, '0')}`)
    }
    tick()
    timerIntervalRef.current = setInterval(tick, 1000)
    return () => { if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null } }
  }, [timerFin])

  const iniciarTimer = async () => {
    if (!selectedUniverso) return
    const m = parseInt(timerMinutos) || 0
    const s = parseInt(timerSegundos) || 0
    const ms = (m * 60 + s) * 1000
    if (ms <= 0) return
    const fin = new Date(Date.now() + ms).toISOString()
    const label = timerLabel || 'Tiempo restante'
    await supabase.from('universos').update({ timer_fin: fin, timer_label: label }).eq('id', selectedUniverso.id)
    setTimerFin(new Date(fin))
    setTimerLabel(label)
    setShowTimerConfig(false)
  }

  const detenerTimer = async () => {
    if (!selectedUniverso) return
    if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null }
    setTimerFin(null); setTimerLabel(''); setTimerDisplay(''); setShowTimerConfig(false)
    await supabase.from('universos').update({ timer_fin: null, timer_label: null }).eq('id', selectedUniverso.id)
  }

  return {
    timerFin, timerLabel, timerDisplay,
    timerMinutos, setTimerMinutos,
    timerSegundos, setTimerSegundos,
    setTimerLabel,
    showTimerConfig, setShowTimerConfig,
    iniciarTimer, detenerTimer,
  }
}
