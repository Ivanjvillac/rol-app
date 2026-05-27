import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import ImportadorDiscord from '../components/ImportadorDiscord'

export default function Admin() {
  const [tab, setTab] = useState('stats')
  const [stats, setStats] = useState({})
  const [universos, setUniversos] = useState([])
  const [usuarios, setUsuarios] = useState([])
  const [entradas, setEntradas] = useState([])
  const [personajesDetalle, setPersonajesDetalle] = useState([])
  const [cargando, setCargando] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [showImportador, setShowImportador] = useState(false)
  const [transferiendo, setTransferiendo] = useState(null) // personaje que se está transfiriendo
  const [nuevoUserId, setNuevoUserId] = useState('')
  const [msgTransfer, setMsgTransfer] = useState(null)

  useEffect(() => { cargarTodo() }, [])

  const cargarTodo = async () => {
    setCargando(true)
    const [{ data: univs }, { data: pers }, { data: entr }, { data: mens }, { data: users }, { data: persDetail }] = await Promise.all([
      supabase.rpc('get_all_universos'),
      supabase.rpc('get_all_personajes'),
      supabase.rpc('get_all_entradas'),
      supabase.rpc('get_all_mensajes'),
      supabase.rpc('get_all_users'),
      supabase.rpc('get_all_personajes_detail'),
    ])
    setUniversos(univs || [])
    setEntradas(entr || [])
    setPersonajesDetalle(persDetail || [])
    setStats({
      universos: univs?.length || 0,
      personajes: pers?.length || 0,
      entradas: entr?.length || 0,
      mensajes: mens?.length || 0,
    })
    setUsuarios((users || []).map(user => ({
      id: user.id,
      email: user.email,
      creado: user.created_at,
      universos: (univs || []).filter(x => x.user_id === user.id).length,
      personajes: (pers || []).filter(x => x.user_id === user.id).length,
      entradas: (entr || []).filter(x => x.user_id === user.id).length,
    })))
    setCargando(false)
  }

  const eliminar = async () => {
    if (!confirmDelete) return
    const { tabla, id } = confirmDelete
    if (tabla === 'usuarios') {
      await supabase.rpc('delete_user', { user_id: id })
    } else {
      await supabase.from(tabla).delete().eq('id', id)
    }
    setConfirmDelete(null)
    await cargarTodo()
  }

  const transferirPersonaje = async () => {
    if (!transferiendo || !nuevoUserId.trim()) return
    setMsgTransfer(null)

    // Buscar usuario por email
    const usuario = usuarios.find(u => u.email === nuevoUserId.trim())
    if (!usuario) {
      setMsgTransfer({ tipo: 'error', texto: 'No se encontró ningún usuario con ese email.' })
      return
    }

    const { error } = await supabase
      .from('personajes')
      .update({ user_id: usuario.id, es_npc: false })
      .eq('id', transferiendo.id)

    if (error) {
      setMsgTransfer({ tipo: 'error', texto: 'Error al transferir el personaje.' })
    } else {
      setMsgTransfer({ tipo: 'ok', texto: `✓ ${transferiendo.nombre} transferido a ${usuario.email}` })
      await cargarTodo()
      setTimeout(() => { setTransferiendo(null); setNuevoUserId(''); setMsgTransfer(null) }, 2000)
    }
  }

  const formatFecha = (ts) => {
    if (!ts) return '-'
    const d = new Date(ts)
    return `${d.toLocaleDateString('es-ES')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`
  }

  const exportarBackup = async () => {
    const [{ data: univs }, { data: pers }, { data: entr }, { data: mens }] = await Promise.all([
      supabase.rpc('get_all_universos'),
      supabase.rpc('get_all_personajes'),
      supabase.rpc('get_all_entradas'),
      supabase.rpc('get_all_mensajes'),
    ])
    const backup = {
      fecha: new Date().toISOString(),
      universos: univs || [],
      personajes: pers || [],
      entradas: entr || [],
      mensajes_privados: mens || [],
    }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `rolapp-backup-${new Date().toISOString().slice(0,10)}.json`
    a.click()
  }

  const emailDeUsuario = (userId) => usuarios.find(u => u.id === userId)?.email || userId?.slice(0,8) + '...'

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Panel de Administración</h2>
          <p className="page-subtitle">Vista completa del sistema</p>
        </div>
        <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
          <button className="btn-ghost" onClick={() => setShowImportador(true)}>📥 Importar Discord</button>
          <button className="btn-ghost" onClick={exportarBackup}>💾 Exportar backup</button>
          <span className="card-badge" style={{ fontSize: '0.8rem', padding: '0.3rem 0.8rem' }}>⚡ Superadmin</span>
        </div>
      </div>

      <div className="admin-tabs">
        {['stats', 'universos', 'usuarios', 'personajes', 'sesiones'].map(t => (
          <button key={t} className={tab === t ? 'admin-tab active' : 'admin-tab'} onClick={() => setTab(t)}>
            {t === 'stats' && '📊 Estadísticas'}
            {t === 'universos' && '🌍 Universos'}
            {t === 'usuarios' && '👥 Usuarios'}
            {t === 'personajes' && '👤 Personajes'}
            {t === 'sesiones' && '📜 Sesiones'}
          </button>
        ))}
      </div>

      {cargando ? (
        <div className="empty-state"><p>Cargando datos...</p></div>
      ) : (
        <>
          {tab === 'stats' && (
            <div className="admin-stats-grid">
              {[
                { label: 'Universos', value: stats.universos, icon: '🌍' },
                { label: 'Personajes', value: stats.personajes, icon: '👤' },
                { label: 'Entradas de sesión', value: stats.entradas, icon: '✍️' },
                { label: 'Mensajes privados', value: stats.mensajes, icon: '🔒' },
                { label: 'Usuarios activos', value: usuarios.length, icon: '👥' },
              ].map(s => (
                <div key={s.label} className="admin-stat-card">
                  <span className="admin-stat-icon">{s.icon}</span>
                  <span className="admin-stat-value">{s.value}</span>
                  <span className="admin-stat-label">{s.label}</span>
                </div>
              ))}
            </div>
          )}

          {tab === 'universos' && (
            <div className="admin-tabla">
              <table>
                <thead>
                  <tr><th>Nombre</th><th>Ambientación</th><th>Propietario</th><th>Creado</th><th>Acciones</th></tr>
                </thead>
                <tbody>
                  {universos.map(u => (
                    <tr key={u.id}>
                      <td>
                        <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: u.color, marginRight: '0.5rem' }} />
                        {u.nombre}
                      </td>
                      <td>{u.ambientacion}</td>
                      <td>{emailDeUsuario(u.user_id)}</td>
                      <td>{formatFecha(u.created_at)}</td>
                      <td><button className="btn-danger btn-sm" onClick={() => setConfirmDelete({ tabla: 'universos', id: u.id, nombre: u.nombre })}>Eliminar</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'usuarios' && (
            <div className="admin-tabla">
              <table>
                <thead>
                  <tr><th>Email</th><th>ID</th><th>Universos</th><th>Personajes</th><th>Entradas</th><th>Acciones</th></tr>
                </thead>
                <tbody>
                  {usuarios.map(u => (
                    <tr key={u.id}>
                      <td>{u.email}</td>
                      <td><code style={{ fontSize: '0.7rem' }}>{u.id?.slice(0,8)}...</code></td>
                      <td>{u.universos}</td>
                      <td>{u.personajes}</td>
                      <td>{u.entradas}</td>
                      <td><button className="btn-danger btn-sm" onClick={() => setConfirmDelete({ tabla: 'usuarios', id: u.id, nombre: u.email })}>Eliminar</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'personajes' && (
            <div>
              <p style={{ color: 'var(--text2)', fontSize: '0.95rem', marginBottom: '1rem', fontStyle: 'italic' }}>
                Haz clic en "Transferir" para asignar un personaje a otro usuario.
              </p>
              <div className="admin-tabla">
                <table>
                  <thead>
                    <tr><th>Personaje</th><th>Tipo</th><th>Rol</th><th>Universo</th><th>Propietario actual</th><th>Acciones</th></tr>
                  </thead>
                  <tbody>
                    {personajesDetalle.map(p => (
                      <tr key={p.id}>
                        <td style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: p.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', color: 'white', fontWeight: 700, flexShrink: 0 }}>{p.iniciales}</div>
                          {p.nombre}
                        </td>
                        <td>
                          <span className="card-badge" style={{ fontSize: '0.7rem', ...(p.es_npc ? { background: 'rgba(52,152,219,0.15)', borderColor: '#3498db', color: '#3498db' } : {}) }}>
                            {p.es_npc ? '🤖 NPC' : '👤 Jugador'}
                          </span>
                        </td>
                        <td>{p.rol}</td>
                        <td>{p.universo_nombre}</td>
                        <td style={{ fontSize: '0.85rem' }}>{emailDeUsuario(p.user_id)}</td>
                        <td>
                          <button className="btn-ghost btn-sm" onClick={() => { setTransferiendo(p); setNuevoUserId(''); setMsgTransfer(null) }}>
                            Transferir
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'sesiones' && (
            <div className="admin-tabla">
              <table>
                <thead>
                  <tr><th>Tipo</th><th>Contenido</th><th>Personaje</th><th>Fecha</th><th>Acciones</th></tr>
                </thead>
                <tbody>
                  {entradas.slice(0, 100).map(e => (
                    <tr key={e.id}>
                      <td><span className="card-badge" style={{ fontSize: '0.7rem' }}>{e.tipo}</span></td>
                      <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.imagen_url ? '📷 Imagen' : e.contenido}
                      </td>
                      <td>{e.personaje_nombre || '—'}</td>
                      <td>{formatFecha(e.created_at)}</td>
                      <td><button className="btn-danger btn-sm" onClick={() => setConfirmDelete({ tabla: 'entradas', id: e.id, nombre: 'esta entrada' })}>Eliminar</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {entradas.length > 100 && <p style={{ color: 'var(--text3)', fontSize: '0.85rem', marginTop: '1rem' }}>Mostrando las últimas 100 entradas.</p>}
            </div>
          )}
        </>
      )}

      {/* Modal confirmar borrado */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <h3>¿Eliminar?</h3>
            <p style={{ color: 'var(--text2)', margin: '0.8rem 0 1.5rem' }}>Se eliminará <strong>{confirmDelete.nombre}</strong> permanentemente.</p>
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setConfirmDelete(null)}>Cancelar</button>
              <button className="btn-danger" onClick={eliminar}>Sí, eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal transferir personaje */}
      {transferiendo && (
        <div className="modal-overlay" onClick={() => setTransferiendo(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <h3>Transferir personaje</h3>
            <p style={{ color: 'var(--text2)', margin: '0.8rem 0 0.3rem' }}>
              Asignar <strong>{transferiendo.nombre}</strong> a otro usuario.
            </p>
            <p style={{ color: 'var(--text3)', fontSize: '0.85rem', marginBottom: '1.2rem' }}>
              El personaje pasará a ser de tipo Jugador y será propiedad del usuario indicado.
            </p>

            <div className="form-group">
              <label>Email del nuevo propietario</label>
              <select value={nuevoUserId} onChange={e => setNuevoUserId(e.target.value)}>
                <option value="">Selecciona un usuario...</option>
                {usuarios.map(u => <option key={u.id} value={u.email}>{u.email}</option>)}
              </select>
            </div>

            {msgTransfer && (
              <div className={msgTransfer.tipo === 'ok' ? 'auth-mensaje' : 'auth-error'} style={{ marginBottom: '1rem' }}>
                {msgTransfer.texto}
              </div>
            )}

            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setTransferiendo(null)}>Cancelar</button>
              <button className="btn-primary" onClick={transferirPersonaje} disabled={!nuevoUserId}>
                Transferir
              </button>
            </div>
          </div>
        </div>
      )}

      {showImportador && <ImportadorDiscord onCerrar={() => setShowImportador(false)} />}
    </div>
  )
}
