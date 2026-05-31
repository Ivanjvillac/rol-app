import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { compressImage } from '../lib/compressImage'

export default function SelectorImagenSticker({ userId, onEnviarImagen, onEnviarSticker, onCerrar }) {
  const [tab, setTab] = useState('imagen')
  const [stickers, setStickers] = useState([])
  const [packs, setPacks] = useState([])
  const [packActivo, setPackActivo] = useState(null) // null = todos
  const [subiendo, setSubiendo] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [showNuevoPack, setShowNuevoPack] = useState(false)
  const [nombreNuevoPack, setNombreNuevoPack] = useState('')
  const [confirmDeletePack, setConfirmDeletePack] = useState(null)
  const fileInputRef = useRef(null)
  const stickerInputRef = useRef(null)

  useEffect(() => { cargarTodo() }, [])

  const cargarTodo = async () => {
    const [{ data: s }, { data: p }] = await Promise.all([
      supabase.from('stickers').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      supabase.from('sticker_packs').select('*').eq('user_id', userId).order('created_at'),
    ])
    setStickers(s || [])
    setPacks(p || [])
  }

  const handleImagen = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { alert('La imagen no puede superar 10MB'); return }
    setSubiendo(true)
    try {
      const compressed = await compressImage(file, 'chat')
      const path = `${userId}/${Date.now()}.jpg`
      const { error } = await supabase.storage.from('imagenes-chat').upload(path, compressed)
      if (!error) {
        const { data } = supabase.storage.from('imagenes-chat').getPublicUrl(path)
        onEnviarImagen(data.publicUrl)
        onCerrar()
      }
    } catch (err) {
      alert(err.message)
    }
    setSubiendo(false)
  }

  const handleSubirSticker = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setSubiendo(true)
    try {
      const compressed = await compressImage(file, 'sticker')
      const path = `${userId}/${Date.now()}.jpg`
      const { error } = await supabase.storage.from('stickers').upload(path, compressed)
    if (!error) {
      const { data } = supabase.storage.from('stickers').getPublicUrl(path)
      await supabase.from('stickers').insert({
        user_id: userId,
        url: data.publicUrl,
        nombre: file.name,
        pack_id: packActivo || null
      })
      await cargarTodo()
    }
    } catch (err) {
      alert(err.message)
    }
    setSubiendo(false)
  }

  const handleEliminarSticker = async (sticker) => {
    const path = sticker.url.split('/stickers/')[1]
    if (path) await supabase.storage.from('stickers').remove([path])
    await supabase.from('stickers').delete().eq('id', sticker.id)
    setConfirmDelete(null)
    await cargarTodo()
  }

  const handleCrearPack = async () => {
    if (!nombreNuevoPack.trim()) return
    const { data } = await supabase.from('sticker_packs')
      .insert({ user_id: userId, nombre: nombreNuevoPack.trim() })
      .select().single()
    if (data) {
      setPacks(prev => [...prev, data])
      setPackActivo(data.id)
    }
    setNombreNuevoPack('')
    setShowNuevoPack(false)
  }

  const handleEliminarPack = async (pack) => {
    // Mover stickers del pack a sin pack
    await supabase.from('stickers').update({ pack_id: null }).eq('pack_id', pack.id)
    await supabase.from('sticker_packs').delete().eq('id', pack.id)
    if (packActivo === pack.id) setPackActivo(null)
    setConfirmDeletePack(null)
    await cargarTodo()
  }

  const stickersFiltrados = packActivo
    ? stickers.filter(s => s.pack_id === packActivo)
    : stickers

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

          {/* Selector de packs */}
          <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.7rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              onClick={() => setPackActivo(null)}
              style={{
                fontSize: '0.72rem', padding: '0.2rem 0.6rem', borderRadius: '999px', border: '1px solid var(--border)',
                background: packActivo === null ? 'var(--accent-glow)' : 'var(--bg3)',
                color: packActivo === null ? 'var(--accent)' : 'var(--text3)',
                cursor: 'pointer', fontFamily: 'Cinzel, serif', letterSpacing: '0.03em'
              }}
            >Todos</button>
            {packs.map(p => (
              <button
                key={p.id}
                onClick={() => setPackActivo(p.id)}
                onContextMenu={e => { e.preventDefault(); setConfirmDeletePack(p) }}
                style={{
                  fontSize: '0.72rem', padding: '0.2rem 0.6rem', borderRadius: '999px', border: '1px solid var(--border)',
                  background: packActivo === p.id ? 'var(--accent-glow)' : 'var(--bg3)',
                  color: packActivo === p.id ? 'var(--accent)' : 'var(--text3)',
                  cursor: 'pointer', fontFamily: 'Cinzel, serif', letterSpacing: '0.03em'
                }}
              >{p.nombre}</button>
            ))}
            <button
              onClick={() => setShowNuevoPack(true)}
              style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem', borderRadius: '999px', border: '1px dashed var(--border)', background: 'none', color: 'var(--text3)', cursor: 'pointer' }}
              title="Nuevo pack"
            >＋</button>
          </div>

          {/* Formulario nuevo pack */}
          {showNuevoPack && (
            <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.6rem' }}>
              <input
                placeholder="Nombre del pack..."
                value={nombreNuevoPack}
                onChange={e => setNombreNuevoPack(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCrearPack()}
                autoFocus
                style={{ flex: 1, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.3rem 0.6rem', borderRadius: 'var(--radius)', fontSize: '0.85rem' }}
              />
              <button className="btn-primary btn-sm" onClick={handleCrearPack}>✓</button>
              <button className="btn-ghost btn-sm" onClick={() => { setShowNuevoPack(false); setNombreNuevoPack('') }}>✕</button>
            </div>
          )}

          {/* Grid de stickers */}
          <div className="stickers-grid">
            {stickersFiltrados.map(s => (
              <div key={s.id} className="sticker-item" onContextMenu={e => { e.preventDefault(); setConfirmDelete(s) }}>
                <img src={s.url} alt={s.nombre} onClick={() => { onEnviarSticker(s.url); onCerrar() }} />
              </div>
            ))}
            {stickersFiltrados.length === 0 && (
              <p style={{ color: 'var(--text3)', fontSize: '0.82rem', gridColumn: '1/-1', fontStyle: 'italic', textAlign: 'center' }}>
                {packActivo ? 'Este pack está vacío. Sube stickers aquí.' : 'No tienes stickers. Sube el primero.'}
              </p>
            )}
          </div>

          <input ref={stickerInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleSubirSticker} />
          <button className="btn-ghost" style={{ width: '100%', marginTop: '0.8rem' }} onClick={() => stickerInputRef.current?.click()} disabled={subiendo}>
            {subiendo ? 'Subiendo...' : `+ Añadir sticker${packActivo ? ' al pack' : ''}`}
          </button>
          {stickers.length > 0 && <p style={{ fontSize: '0.75rem', color: 'var(--text3)', marginTop: '0.4rem', textAlign: 'center' }}>Mantén pulsado para eliminar · Clic derecho en pack para borrarlo</p>}
        </div>
      )}

      {/* Modal eliminar sticker */}
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

      {/* Modal eliminar pack */}
      {confirmDeletePack && (
        <div className="modal-overlay" onClick={() => setConfirmDeletePack(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <h3>¿Eliminar pack?</h3>
            <p style={{ color: 'var(--text2)', margin: '0.8rem 0 1.5rem', fontSize: '0.9rem' }}>
              Se eliminará el pack <strong>"{confirmDeletePack.nombre}"</strong>. Los stickers dentro no se borran, pasan a "Todos".
            </p>
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setConfirmDeletePack(null)}>Cancelar</button>
              <button className="btn-danger" onClick={() => handleEliminarPack(confirmDeletePack)}>Eliminar pack</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
