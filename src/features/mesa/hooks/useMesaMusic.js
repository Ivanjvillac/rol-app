import { useState, useRef, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'

const extractYTIds = (url) => {
  if (!url) return { videoId: null, listId: null }
  try {
    const rawUrl = url.startsWith('http') ? url : `https://${url}`
    const u = new URL(rawUrl)
    const host = u.hostname.replace('www.', '')
    let videoId = null, listId = null
    if (host === 'youtube.com' || host === 'music.youtube.com') {
      videoId = u.searchParams.get('v')
      listId = u.searchParams.get('list')
      if (!videoId && u.pathname.startsWith('/shorts/')) videoId = u.pathname.split('/shorts/')[1]?.split('?')[0] || null
      if (!videoId && u.pathname.startsWith('/embed/')) { videoId = u.pathname.split('/embed/')[1]?.split('?')[0] || null; if (!listId) listId = u.searchParams.get('list') }
      if (!listId && u.pathname.startsWith('/playlist')) listId = u.searchParams.get('list')
    }
    if (host === 'youtu.be') { videoId = u.pathname.slice(1).split('?')[0] || null; listId = u.searchParams.get('list') }
    return { videoId, listId }
  } catch { return { videoId: null, listId: null } }
}

export function useMesaMusic(sesionActiva, esDueno) {
  const [musicaUrl, setMusicaUrl] = useState(null)
  const [musicaIniciadaEn, setMusicaIniciadaEn] = useState(null)
  const [showMusica, setShowMusica] = useState(false)
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const canalMusicaRef = useRef(null)
  const playerRef = useRef(null)
  const syncIntervalRef = useRef(null)
  const musicaIniciadaEnRef = useRef(null)
  const esDuenoRef = useRef(esDueno)

  useEffect(() => { esDuenoRef.current = esDueno }, [esDueno])

  // Canal broadcast de música (sync en tiempo real + carga inicial)
  useEffect(() => {
    if (!sesionActiva?.id) return
    const canal = supabase
      .channel(`musica-${sesionActiva.id}`)
      .on('broadcast', { event: 'musica_cambio' }, ({ payload }) => {
        if (!payload.url) {
          setMusicaUrl(null); setMusicaIniciadaEn(null); musicaIniciadaEnRef.current = null; return
        }
        const ts = payload.startedAt || Date.now()
        setMusicaUrl(payload.url); setMusicaIniciadaEn(ts); musicaIniciadaEnRef.current = ts
      })
      .on('broadcast', { event: 'musica_sync' }, ({ payload }) => {
        if (esDuenoRef.current || !playerRef.current) return
        try {
          const { state, currentTime, timestamp } = payload
          const latency = Math.max(0, (Date.now() - timestamp) / 1000)
          const targetTime = Math.max(0, currentTime + latency)
          playerRef.current.seekTo(targetTime, true)
          if (state === 'playing') playerRef.current.playVideo()
          else if (state === 'paused') playerRef.current.pauseVideo()
        } catch (e) {}
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          const { data } = await supabase.from('sesiones').select('url_musica, musica_iniciada_en').eq('id', sesionActiva.id).single()
          if (data?.url_musica) {
            const ts = data.musica_iniciada_en ? new Date(data.musica_iniciada_en).getTime() : Date.now()
            setMusicaUrl(data.url_musica); setMusicaIniciadaEn(ts); musicaIniciadaEnRef.current = ts
          }
        }
      })
    canalMusicaRef.current = canal
    return () => { supabase.removeChannel(canal); canalMusicaRef.current = null }
  }, [sesionActiva?.id])

  // Inicializar/destruir player de YouTube cuando cambia la URL de música
  useEffect(() => {
    clearInterval(syncIntervalRef.current)
    if (playerRef.current) { try { playerRef.current.destroy() } catch (e) {} playerRef.current = null }
    if (!musicaUrl) return

    const { videoId, listId } = extractYTIds(musicaUrl)
    if (!videoId && !listId) return
    const offsetSegs = musicaIniciadaEnRef.current
      ? Math.max(0, Math.floor((Date.now() - musicaIniciadaEnRef.current) / 1000))
      : 0

    const doInit = () => {
      const container = document.getElementById('yt-music-player')
      if (!container || playerRef.current) return
      playerRef.current = new window.YT.Player('yt-music-player', {
        height: '52', width: '100%',
        videoId: videoId || undefined,
        playerVars: {
          autoplay: 1, loop: listId ? 0 : 1,
          ...(listId ? { listType: 'playlist', list: listId } : { playlist: videoId }),
          start: offsetSegs,
        },
        events: {
          onReady: (e) => { if (offsetSegs > 5) e.target.seekTo(offsetSegs, true) },
          onStateChange: (e) => {
            if (!esDuenoRef.current) return
            const YTState = window.YT?.PlayerState
            if (!YTState || (e.data !== YTState.PLAYING && e.data !== YTState.PAUSED)) return
            const ct = e.target.getCurrentTime?.() ?? 0
            canalMusicaRef.current?.send({ type: 'broadcast', event: 'musica_sync', payload: { state: e.data === YTState.PLAYING ? 'playing' : 'paused', currentTime: ct, timestamp: Date.now() } })
          },
        },
      })
      if (esDuenoRef.current) {
        syncIntervalRef.current = setInterval(() => {
          if (!playerRef.current || !canalMusicaRef.current) return
          try {
            const state = playerRef.current.getPlayerState()
            const ct = playerRef.current.getCurrentTime()
            const YTState = window.YT?.PlayerState
            canalMusicaRef.current.send({ type: 'broadcast', event: 'musica_sync', payload: { state: state === YTState?.PLAYING ? 'playing' : 'paused', currentTime: ct, timestamp: Date.now() } })
          } catch (e) {}
        }, 10000)
      }
    }

    if (window.YT?.Player) {
      setTimeout(doInit, 80)
    } else {
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const tag = document.createElement('script'); tag.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(tag)
      }
      const prev = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => { if (typeof prev === 'function') prev(); setTimeout(doInit, 80) }
    }

    return () => {
      clearInterval(syncIntervalRef.current)
      if (playerRef.current) { try { playerRef.current.destroy() } catch (e) {} playerRef.current = null }
    }
  }, [musicaUrl])

  const cargarYoutube = async (url) => {
    if (!url) return
    if (!sesionActiva) { alert('⚠️ Selecciona una sesión primero antes de cargar música.'); return }
    const { videoId, listId } = extractYTIds(url)
    if (!videoId && !listId) { alert('⚠️ No se reconoce la URL. Asegúrate de que es un enlace de YouTube.'); return }
    const startedAt = Date.now()
    setMusicaUrl(url); setMusicaIniciadaEn(startedAt); musicaIniciadaEnRef.current = startedAt
    setYoutubeUrl(''); setShowMusica(false)
    canalMusicaRef.current?.send({ type: 'broadcast', event: 'musica_cambio', payload: { url, startedAt } })
    await supabase.from('sesiones').update({ url_musica: url, musica_iniciada_en: new Date(startedAt).toISOString() }).eq('id', sesionActiva.id)
  }

  const quitarMusica = async () => {
    if (!sesionActiva) return
    setMusicaUrl(null); setMusicaIniciadaEn(null); musicaIniciadaEnRef.current = null
    canalMusicaRef.current?.send({ type: 'broadcast', event: 'musica_cambio', payload: { url: null } })
    await supabase.from('sesiones').update({ url_musica: null, musica_iniciada_en: null }).eq('id', sesionActiva.id)
  }

  return {
    musicaUrl, showMusica, setShowMusica,
    youtubeUrl, setYoutubeUrl,
    cargarYoutube, quitarMusica,
    canalMusicaRef, playerRef,
  }
}
