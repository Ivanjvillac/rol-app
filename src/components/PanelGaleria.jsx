import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { describirImagen, tieneApiKey } from '../lib/gemini'

export default function PanelGaleria({ universoId, onCerrar }) {
  const [imagenes, setImagenes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [ampliada, setAmpliada] = useState(null)
  const [descripcion, setDescripcion] = useState(null)
  const [generandoDesc, setGenerandoDesc] = useState(false)

  useEffect(() => { cargar() }, [universoId])

  const cargar = async () => {
    setCargando(true)
    const { data: sesiones } = await supabase
      .from('sesiones').select('id').eq('universo_id', universoId)
    const ids = (sesiones || []).map(s => s.id)
    if (ids.length > 0) {
      const { data } = await supabase
        .from('entradas')
        .select('id, imagen_url, personaje_nombre, personaje_color, created_at')
        .in('sesion_id', ids)
        .not('imagen_url', 'is', null)
        .order('created_at', { ascending: false })
      setImagenes(data || [])
    }
    setCargando(false)
  }

  const abrirAmpliada = (img) => {
    setAmpliada(img)
    setDescripcion(null)
  }

  const handleDescribir = async () => {
    if (!ampliada) return
    setGenerandoDesc(true)
    const texto = await describirImagen(ampliada.imagen_url)
    setDescripcion(texto || 'No se pudo generar la descripción.')
    setGenerandoDesc(false)
  }

  return (
    <>
      <div className="modal-overlay" onClick={onCerrar}>
        <div className="modal modal-galeria" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h3>🖼️ Galería del universo</h3>
            <button onClick={onCerrar}>✕</button>
          </div>
          {cargando ? (
            <p style={{ color: 'var(--text3)', padding: '1rem' }}>Cargando...</p>
          ) : imagenes.length === 0 ? (
            <div className="empty-state" style={{ padding: '2rem' }}>
              <p>No hay imágenes enviadas todavía.</p>
            </div>
          ) : (
            <div className="galeria-grid">
              {imagenes.map(img => (
                <div key={img.id} className="galeria-item" onClick={() => abrirAmpliada(img)}>
                  <img src={img.imagen_url} alt="" loading="lazy" />
                  {img.personaje_nombre && (
                    <div className="galeria-label" style={{ background: img.personaje_color || 'var(--accent)' }}>
                      {img.personaje_nombre}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {ampliada && (
        <div className="galeria-lightbox" onClick={() => { setAmpliada(null); setDescripcion(null) }}>
          <img src={ampliada.imagen_url} alt="" onClick={e => e.stopPropagation()} />
          <div className="galeria-lightbox-info" onClick={e => e.stopPropagation()}>
            {ampliada.personaje_nombre && (
              <span style={{ fontFamily: 'Cinzel, serif', marginRight: '0.5rem' }}>{ampliada.personaje_nombre}</span>
            )}
            {tieneApiKey() && (
              <button
                onClick={handleDescribir}
                disabled={generandoDesc}
                style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', borderRadius: 'var(--radius)', padding: '0.25rem 0.6rem', fontSize: '0.78rem', cursor: 'pointer' }}>
                {generandoDesc ? '✨ Describiendo...' : '✨ Describir con IA'}
              </button>
            )}
          </div>
          {descripcion && (
            <div onClick={e => e.stopPropagation()}
              style={{ position: 'absolute', bottom: '3.5rem', left: '50%', transform: 'translateX(-50%)', maxWidth: '600px', width: '90%', background: 'rgba(0,0,0,0.82)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 'var(--radius)', padding: '0.8rem 1rem', color: 'rgba(255,255,255,0.9)', fontSize: '0.88rem', lineHeight: 1.6, fontStyle: 'italic', backdropFilter: 'blur(4px)' }}>
              {descripcion}
            </div>
          )}
          <button className="galeria-lightbox-cerrar" onClick={() => { setAmpliada(null); setDescripcion(null) }}>✕</button>
        </div>
      )}
    </>
  )
}
