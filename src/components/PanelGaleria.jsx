import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function PanelGaleria({ universoId, onCerrar }) {
  const [imagenes, setImagenes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [ampliada, setAmpliada] = useState(null)

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
                <div key={img.id} className="galeria-item" onClick={() => setAmpliada(img)}>
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
        <div className="galeria-lightbox" onClick={() => setAmpliada(null)}>
          <img src={ampliada.imagen_url} alt="" onClick={e => e.stopPropagation()} />
          {ampliada.personaje_nombre && (
            <div className="galeria-lightbox-info">{ampliada.personaje_nombre}</div>
          )}
          <button className="galeria-lightbox-cerrar" onClick={() => setAmpliada(null)}>✕</button>
        </div>
      )}
    </>
  )
}
