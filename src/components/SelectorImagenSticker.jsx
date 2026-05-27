import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function SelectorImagenSticker({ userId, onEnviarImagen, onEnviarSticker, onCerrar }) {
  const [tab, setTab] = useState('imagen')
  const [stickers, setStickers] = useState([])
  const [subiendo, setSubiendo] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const fileInputRef = useRef(null)
  const stickerInputRef = useRef(null)

  useEffect(() => { cargarStickers() }, [])

  const cargarStickers = async () => {
    const { data } = await supabase.from('stickers').select('*').eq('user_id', userId).order('created_at', { ascending: false })
    setStickers(data || [])
  }

  const comprimirImagen = (file, maxWidth = 800, calidad = 0.75) => {
    return new Promise((resolve) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let w = img.width, h = img.height
        if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth }
        canvas.width = w; canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        canvas.toBlob(blob => resolve(blob), 'image/jpeg', calidad)
        URL.revokeObjectURL(url)
      }
      img.src = url
    })
  }

  const handleImagen = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { alert('La imagen no puede superar 10MB'); return }
    setSubiendo(true)
    const blob = await comprimirImagen(file, 1200, 0.8)
    const path = `${userId}/${Date.now()}.jpg`
    const { error } = await supabase.storage.from('imagenes-chat').upload(path, blob)
    if (!error) {
      const { data } = supabase.storage.from('imagenes-chat').getPublicUrl(path)
      onEnviarImagen(data.publicUrl)
      onCerrar()
    }
    setSubiendo(false)
  }

  const handleSubirSticker = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setSubiendo(true)
    const blob = await comprimirImagen(file, 300, 0.85)
    const path = `${userId}/${Date.now()}.jpg`
    const { error } = await supabase.storage.from('stickers').upload(path, blob)
    if (!error) {
      const { data } = supabase.storage.from('stickers').getPublicUrl(path)
      await supabase.from('stickers').insert({ user_id: userId, url: data.publicUrl, nombre: file.name })
      await cargarStickers()
    }
    setSubiendo(false)
  }

  const handleEliminarSticker = async (sticker) => {
    const path = sticker.url.split('/stickers/')[1]
    if (path) await supabase.storage.from('stickers').remove([path])
    await supabase.from('stickers').delete().eq('id', sticker.id)
    setConfirmDelete(null)
    await cargarStickers()
  }

  return (
    <div className="selector-panel">
      <div className="selector-tabs">
        <button className={tab === 'imagen' ? 'selector-tab active' : 'selector-tab'} onClick={() => setTab('imagen')}>📷 Imagen</button>
        <button className={tab === 'stickers' ? 'selector-tab active' : 'selector-tab'} onClick={() => setTab('stickers')}>🎭 Stickers</button>
        <button className="selector-cerrar" onClick={onCerrar}>✕</button>
      </div>

      {tab === 'imagen' && (
        <div className="selector-contenido">
          <p style={{ color: 'var(--text3)', fontSize: '0.85rem', marginBottom: '1rem' }}>La imagen se comprimirá automáticamente antes de enviarse.</p>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImagen} />
          <button className="btn-primary" style={{ width: '100%' }} onClick={() => fileInputRef.current?.click()} disabled={subiendo}>
            {subiendo ? 'Subiendo...' : '📷 Seleccionar imagen'}
          </button>
        </div>
      )}

      {tab === 'stickers' && (
        <div className="selector-contenido">
          <div className="stickers-grid">
            {stickers.map(s => (
              <div key={s.id} className="sticker-item" onContextMenu={e => { e.preventDefault(); setConfirmDelete(s) }}>
                <img src={s.url} alt={s.nombre} onClick={() => { onEnviarSticker(s.url); onCerrar() }} />
              </div>
            ))}
            {stickers.length === 0 && <p style={{ color: 'var(--text3)', fontSize: '0.85rem', gridColumn: '1/-1', fontStyle: 'italic' }}>No tienes stickers. Sube el primero.</p>}
          </div>
          <input ref={stickerInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleSubirSticker} />
          <button className="btn-ghost" style={{ width: '100%', marginTop: '0.8rem' }} onClick={() => stickerInputRef.current?.click()} disabled={subiendo}>
            {subiendo ? 'Subiendo...' : '+ Añadir sticker'}
          </button>
          {stickers.length > 0 && <p style={{ fontSize: '0.75rem', color: 'var(--text3)', marginTop: '0.5rem', textAlign: 'center' }}>Mantén pulsado un sticker para eliminarlo</p>}
        </div>
      )}

      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <h3>¿Eliminar sticker?</h3>
            <img src={confirmDelete.url} alt="" style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px', margin: '0.8rem auto', display: 'block' }} />
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setConfirmDelete(null)}>Cancelar</button>
              <button className="btn-danger" onClick={() => handleEliminarSticker(confirmDelete)}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
