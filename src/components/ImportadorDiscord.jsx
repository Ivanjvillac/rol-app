import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'

export default function ImportadorDiscord({ onCerrar }) {
  const { universos, personajes, userId } = useApp()
  const [paso, setPaso] = useState(1)
  const [mensajes, setMensajes] = useState([])
  const [autores, setAutores] = useState([]) // nicknames únicos
  const [mapeo, setMapeo] = useState({}) // nickname -> { tipo: 'personaje'|'narrador'|'ignorar', personajeId }
  const [universoId, setUniversoId] = useState('')
  const [nombreSesion, setNombreSesion] = useState('')
  const [progreso, setProgreso] = useState(0)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState(null)

  const personajesDelUniverso = personajes.filter(p => p.universo_id === universoId || p.universoId === universoId)

  const handleArchivo = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result)
        const msgs = (data.messages || []).filter(m => m.type === 'Default' && m.content?.trim())
        setMensajes(msgs)

        // Extraer nicknames únicos
        const nickMap = {}
        msgs.forEach(m => {
          const nickname = m.author.nickname || m.author.name
          if (!nickMap[nickname]) {
            nickMap[nickname] = { nickname, isBot: m.author.isBot }
          }
        })
        const autorList = Object.values(nickMap)
        setAutores(autorList)

        // Mapeo inicial: Narrador → narrador, resto → ignorar
        const mapeoInicial = {}
        autorList.forEach(a => {
          mapeoInicial[a.nickname] = {
            tipo: a.nickname === 'Narrador' ? 'narrador' : 'ignorar',
            personajeId: ''
          }
        })
        setMapeo(mapeoInicial)
        setNombreSesion(data.channel?.name || 'Sesión importada')
        setPaso(2)
        setError(null)
      } catch {
        setError('El archivo no es un JSON válido de Discord.')
      }
    }
    reader.readAsText(file)
  }

  const parsearContenido = (content) => {
    const partes = []
    const regex = /`([^`]+)`/g
    let lastIndex = 0
    let match

    while ((match = regex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        const texto = content.slice(lastIndex, match.index).trim()
        if (texto) partes.push({ tipo: 'dialogo', texto })
      }
      partes.push({ tipo: 'accion', texto: match[1].trim() })
      lastIndex = match.index + match[0].length
    }

    if (lastIndex < content.length) {
      const texto = content.slice(lastIndex).trim()
      if (texto) partes.push({ tipo: 'dialogo', texto })
    }

    return partes.length > 0 ? partes : [{ tipo: 'dialogo', texto: content.trim() }]
  }

  const handleImportar = async () => {
    if (!universoId || !nombreSesion.trim()) return
    setPaso(3)
    setError(null)

    const { data: sesion, error: errSesion } = await supabase
      .from('sesiones')
      .insert({ universo_id: universoId, user_id: userId, nombre: nombreSesion })
      .select().single()

    if (errSesion) { setError('Error al crear la sesión.'); setPaso(2); return }

    const entradas = []
    for (const msg of mensajes) {
      const nickname = msg.author.nickname || msg.author.name
      const cfg = mapeo[nickname]
      if (!cfg || cfg.tipo === 'ignorar') continue

      const personaje = cfg.tipo === 'personaje'
        ? personajesDelUniverso.find(p => p.id === cfg.personajeId)
        : null

      const partes = parsearContenido(msg.content)

      for (const parte of partes) {
        let tipo = parte.tipo
        if (cfg.tipo === 'narrador') tipo = 'narrador'

        entradas.push({
          universo_id: universoId,
          sesion_id: sesion.id,
          user_id: userId,
          tipo,
          contenido: parte.texto,
          personaje_nombre: personaje?.nombre || null,
          personaje_color: personaje?.color || null,
          personaje_iniciales: personaje?.iniciales || null,
          personaje_avatar_url: personaje?.avatar_url || null,
          created_at: msg.timestamp,
        })
      }

      // Imágenes adjuntas
      for (const att of msg.attachments || []) {
        if (att.url && att.contentType?.startsWith('image')) {
          entradas.push({
            universo_id: universoId,
            sesion_id: sesion.id,
            user_id: userId,
            tipo: cfg.tipo === 'narrador' ? 'narrador' : 'dialogo',
            contenido: '',
            imagen_url: att.url,
            personaje_nombre: personaje?.nombre || null,
            personaje_color: personaje?.color || null,
            personaje_iniciales: personaje?.iniciales || null,
            personaje_avatar_url: personaje?.avatar_url || null,
            created_at: msg.timestamp,
          })
        }
      }
    }

    setTotal(entradas.length)

    const loteSize = 50
    for (let i = 0; i < entradas.length; i += loteSize) {
      const lote = entradas.slice(i, i + loteSize)
      await supabase.from('entradas').insert(lote)
      setProgreso(Math.min(i + loteSize, entradas.length))
    }

    setPaso(4)
  }

  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div className="modal" style={{ maxWidth: '600px', maxHeight: '85vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        <h3>📥 Importar desde Discord</h3>

        {paso === 1 && (
          <div>
            <p style={{ color: 'var(--text2)', marginBottom: '1.5rem', lineHeight: '1.6' }}>
              Exporta el canal de Discord con <strong>DiscordChatExporter</strong> en formato JSON y súbelo aquí.
            </p>
            {error && <div className="auth-error" style={{ marginBottom: '1rem' }}>{error}</div>}
            <label className="btn-primary" style={{ display: 'block', textAlign: 'center', cursor: 'pointer', padding: '0.8rem' }}>
              📂 Seleccionar archivo JSON
              <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleArchivo} />
            </label>
          </div>
        )}

        {paso === 2 && (
          <div>
            <p style={{ color: 'var(--text2)', marginBottom: '1rem', fontSize: '0.95rem' }}>
              <strong>{mensajes.length} mensajes</strong> de <strong>{autores.length} participantes</strong>. Asigna cada uno a un personaje.
            </p>

            <div className="form-group">
              <label>Universo destino</label>
              <select value={universoId} onChange={e => setUniversoId(e.target.value)}>
                <option value="">Selecciona un universo...</option>
                {universos.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Nombre de la sesión</label>
              <input value={nombreSesion} onChange={e => setNombreSesion(e.target.value)} placeholder="Sesión 1, Día 1..." />
            </div>

            <div style={{ marginBottom: '1.2rem' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text3)', fontFamily: 'Cinzel, serif', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '0.6rem' }}>
                Mapeo de participantes
              </label>
              {autores.map(a => (
                <div key={a.nickname} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                  <span style={{ minWidth: '100px', fontWeight: 600, color: 'var(--text)' }}>{a.nickname}</span>
                  <select
                    value={mapeo[a.nickname]?.tipo || 'ignorar'}
                    onChange={e => setMapeo(prev => ({ ...prev, [a.nickname]: { tipo: e.target.value, personajeId: '' } }))}
                    style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.3rem 0.5rem', borderRadius: '6px', fontSize: '0.85rem' }}
                  >
                    <option value="ignorar">Ignorar</option>
                    <option value="narrador">Narrador</option>
                    <option value="personaje">Personaje...</option>
                  </select>
                  {mapeo[a.nickname]?.tipo === 'personaje' && (
                    <select
                      value={mapeo[a.nickname]?.personajeId || ''}
                      onChange={e => setMapeo(prev => ({ ...prev, [a.nickname]: { ...prev[a.nickname], personajeId: e.target.value } }))}
                      style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.3rem 0.5rem', borderRadius: '6px', fontSize: '0.85rem' }}
                    >
                      <option value="">Selecciona personaje...</option>
                      {personajesDelUniverso.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                  )}
                </div>
              ))}
            </div>

            {!universoId && <p style={{ color: 'var(--text3)', fontSize: '0.85rem', marginBottom: '0.8rem', fontStyle: 'italic' }}>Selecciona un universo para ver los personajes disponibles.</p>}

            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setPaso(1)}>Atrás</button>
              <button className="btn-primary" onClick={handleImportar} disabled={!universoId || !nombreSesion.trim()}>
                Importar {mensajes.length} mensajes →
              </button>
            </div>
          </div>
        )}

        {paso === 3 && (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <p style={{ color: 'var(--accent)', fontFamily: 'Cinzel, serif', marginBottom: '1rem' }}>Importando...</p>
            <div style={{ background: 'var(--bg3)', borderRadius: '8px', height: '8px', overflow: 'hidden', marginBottom: '0.8rem' }}>
              <div style={{ background: 'var(--accent)', height: '100%', width: `${total > 0 ? (progreso / total) * 100 : 0}%`, transition: 'width 0.3s' }} />
            </div>
            <p style={{ color: 'var(--text2)', fontSize: '0.9rem' }}>{progreso} / {total} entradas</p>
          </div>
        )}

        {paso === 4 && (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <span style={{ fontSize: '3rem' }}>✅</span>
            <p style={{ fontFamily: 'Cinzel, serif', color: 'var(--accent)', margin: '1rem 0 0.5rem' }}>¡Importación completada!</p>
            <p style={{ color: 'var(--text2)', fontSize: '0.95rem', marginBottom: '1.5rem' }}>{total} entradas importadas correctamente.</p>
            <button className="btn-primary" onClick={onCerrar}>Cerrar</button>
          </div>
        )}
      </div>
    </div>
  )
}
