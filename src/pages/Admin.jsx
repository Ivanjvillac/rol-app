import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import ImportadorDiscord from '../components/ImportadorDiscord'

export default function Admin() {
  const [tab, setTab] = useState('stats')
  const [stats, setStats] = useState({})
  const [almacenamiento, setAlmacenamiento] = useState(null)
  const [universos, setUniversos] = useState([])
  const [usuarios, setUsuarios] = useState([])
  const [entradas, setEntradas] = useState([])
  const [personajesDetalle, setPersonajesDetalle] = useState([])
  const [cargando, setCargando] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [showImportador, setShowImportador] = useState(false)
  const [transferiendo, setTransferiendo] = useState(null)
  const [nuevoUserId, setNuevoUserId] = useState('')
  const [msgTransfer, setMsgTransfer] = useState(null)
  const [cambiandoPassword, setCambiandoPassword] = useState(null)
  const [nuevaPassword, setNuevaPassword] = useState('')
  const [msgPassword, setMsgPassword] = useState(null)
  const [showImportarBackup, setShowImportarBackup] = useState(false)
  const [backupData, setBackupData] = useState(null)
  const [importandoBackup, setImportandoBackup] = useState(false)
  const [msgImportarBackup, setMsgImportarBackup] = useState(null)

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

    // Calcular uso de storage listando archivos de cada bucket
    try {
      const buckets = ['avatares', 'stickers', 'imagenes-chat', 'perfiles', 'personaje-imagenes']
      let totalBytes = 0
      const detalleBuckets = []
      for (const bucket of buckets) {
        const { data: archivos } = await supabase.storage.from(bucket).list('', { limit: 1000, offset: 0 })
        // Listar también subcarpetas (por userId)
        let bytesEnBucket = 0
        if (archivos) {
          // Archivos en raíz
          const archivosRaiz = archivos.filter(f => f.metadata)
          bytesEnBucket += archivosRaiz.reduce((acc, f) => acc + (f.metadata?.size || 0), 0)
          // Subcarpetas
          const carpetas = archivos.filter(f => !f.metadata)
          for (const carpeta of carpetas) {
            const { data: subcarpeta } = await supabase.storage.from(bucket).list(carpeta.name, { limit: 1000 })
            if (subcarpeta) bytesEnBucket += subcarpeta.reduce((acc, f) => acc + (f.metadata?.size || 0), 0)
          }
        }
        detalleBuckets.push({ nombre: bucket, bytes: bytesEnBucket })
        totalBytes += bytesEnBucket
      }
      const LIMITE_STORAGE_GB = 1
      const LIMITE_DB_MB = 500
      // Tamaño real de BD via RPC; si no existe todavía, estimar
      let bytesDB = null
      let dbSizeReal = false
      const { data: dbSize } = await supabase.rpc('get_db_size')
      if (dbSize?.db_bytes) {
        bytesDB = dbSize.db_bytes
        dbSizeReal = true
      } else {
        bytesDB = (entr?.length || 0) * 500 + (pers?.length || 0) * 300 + (univs?.length || 0) * 200
      }
      setAlmacenamiento({
        storage: { usado: totalBytes, limite: LIMITE_STORAGE_GB * 1024 * 1024 * 1024, buckets: detalleBuckets },
        db: { usadoBytes: bytesDB, limite: LIMITE_DB_MB * 1024 * 1024, real: dbSizeReal }
      })
    } catch (e) {
      console.warn('No se pudo calcular almacenamiento:', e)
    }

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
    const usuario = usuarios.find(u => u.email === nuevoUserId.trim())
    if (!usuario) { setMsgTransfer({ tipo: 'error', texto: 'No se encontró ningún usuario con ese email.' }); return }
    const { error } = await supabase.from('personajes').update({ user_id: usuario.id, es_npc: false }).eq('id', transferiendo.id)
    if (error) {
      setMsgTransfer({ tipo: 'error', texto: 'Error al transferir el personaje.' })
    } else {
      setMsgTransfer({ tipo: 'ok', texto: `✓ ${transferiendo.nombre} transferido a ${usuario.email}` })
      await cargarTodo()
      setTimeout(() => { setTransferiendo(null); setNuevoUserId(''); setMsgTransfer(null) }, 2000)
    }
  }

  const handleCambiarPassword = async () => {
    if (!cambiandoPassword || !nuevaPassword || nuevaPassword.length < 6) return
    setMsgPassword(null)
    const { error } = await supabase.rpc('admin_change_password', {
      user_id: cambiandoPassword.id,
      new_password: nuevaPassword
    })
    if (error) {
      setMsgPassword({ tipo: 'error', texto: 'Error al cambiar la contraseña.' })
    } else {
      setMsgPassword({ tipo: 'ok', texto: '✓ Contraseña cambiada correctamente.' })
      setTimeout(() => { setCambiandoPassword(null); setNuevaPassword(''); setMsgPassword(null) }, 2000)
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
    const backup = { fecha: new Date().toISOString(), universos: univs || [], personajes: pers || [], entradas: entr || [], mensajes_privados: mens || [] }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `tintaydados-backup-${new Date().toISOString().slice(0,10)}.json`
    a.click()
  }

  const emailDeUsuario = (uid) => usuarios.find(u => u.id === uid)?.email || uid?.slice(0,8) + '...'

  const exportarUniverso = async (universo) => {
    const { data: pers } = await supabase.from('personajes').select('*').eq('universo_id', universo.id)
    const { data: sess } = await supabase.from('sesiones').select('*').eq('universo_id', universo.id)
    const sesionIds = (sess || []).map(s => s.id)
    let entrs = []
    if (sesionIds.length > 0) {
      const { data } = await supabase.from('entradas').select('*').in('sesion_id', sesionIds).order('created_at')
      entrs = data || []
    }
    const backup = { universo, personajes: pers || [], sesiones: sess || [], entradas: entrs, exportado_en: new Date().toISOString() }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `backup-${universo.nombre}-${new Date().toISOString().slice(0,10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const leerArchivoBackup = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target.result)
        if (!json.universo) { setMsgImportarBackup({ tipo: 'error', texto: 'Archivo inválido: falta el campo "universo".' }); return }
        setBackupData(json)
        setMsgImportarBackup(null)
      } catch {
        setMsgImportarBackup({ tipo: 'error', texto: 'El archivo no es un JSON válido.' })
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const ejecutarImportacion = async () => {
    if (!backupData?.universo) return
    setImportandoBackup(true)
    setMsgImportarBackup(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No autenticado')

      const { universo, personajes = [], sesiones = [], entradas = [] } = backupData

      // Crear universo con nuevo ID
      const { data: nuevoUniverso, error: errUniv } = await supabase
        .from('universos')
        .insert({ nombre: `${universo.nombre} (importado)`, ambientacion: universo.ambientacion, color: universo.color, user_id: user.id, descripcion: universo.descripcion || null })
        .select().single()
      if (errUniv) throw new Error(`Error al crear universo: ${errUniv.message}`)

      // Crear personajes con nuevo universo_id
      const mapaPersonajes = {}
      if (personajes.length > 0) {
        for (const p of personajes) {
          const { data: np } = await supabase.from('personajes')
            .insert({ nombre: p.nombre, rol: p.rol || null, color: p.color || '#b48c3c', iniciales: p.iniciales || p.nombre?.slice(0,2).toUpperCase(), es_npc: p.es_npc || false, universo_id: nuevoUniverso.id, user_id: user.id, avatar_url: p.avatar_url || null })
            .select().single()
          if (np) mapaPersonajes[p.id] = np.id
        }
      }

      // Crear sesiones con nuevo universo_id
      const mapaSesiones = {}
      if (sesiones.length > 0) {
        for (const s of sesiones) {
          const { data: ns } = await supabase.from('sesiones')
            .insert({ nombre: s.nombre, universo_id: nuevoUniverso.id, user_id: user.id, es_privada: false })
            .select().single()
          if (ns) mapaSesiones[s.id] = ns.id
        }
      }

      // Crear entradas con nuevos sesion_id / universo_id
      if (entradas.length > 0) {
        const entradasNuevas = entradas.map(e => ({
          tipo: e.tipo || 'narrador',
          contenido: e.contenido || '',
          imagen_url: e.imagen_url || null,
          personaje_nombre: e.personaje_nombre || null,
          personaje_color: e.personaje_color || null,
          personaje_iniciales: e.personaje_iniciales || null,
          personaje_avatar_url: e.personaje_avatar_url || null,
          universo_id: nuevoUniverso.id,
          sesion_id: mapaSesiones[e.sesion_id] || null,
          user_id: user.id,
          tono: e.tono || 'normal',
        }))
        // Insertar en lotes de 100
        for (let i = 0; i < entradasNuevas.length; i += 100) {
          await supabase.from('entradas').insert(entradasNuevas.slice(i, i + 100))
        }
      }

      setMsgImportarBackup({ tipo: 'ok', texto: `✓ Importado: "${nuevoUniverso.nombre}" · ${personajes.length} personajes · ${sesiones.length} sesiones · ${entradas.length} entradas.` })
      setBackupData(null)
      await cargarTodo()
    } catch (err) {
      setMsgImportarBackup({ tipo: 'error', texto: `Error: ${err.message}` })
    }
    setImportandoBackup(false)
  }

  const [transfiriendoUniverso, setTransfiriendoUniverso] = useState(null)
  const [nuevoOwnerEmail, setNuevoOwnerEmail] = useState('')
  const [msgTransferUniverso, setMsgTransferUniverso] = useState(null)

  const transferirUniverso = async () => {
    const usuario = usuarios.find(u => u.email === nuevoOwnerEmail.trim())
    if (!usuario) { setMsgTransferUniverso({ tipo: 'error', texto: 'Usuario no encontrado.' }); return }
    const { error } = await supabase.from('universos').update({ user_id: usuario.id }).eq('id', transfiriendoUniverso.id)
    if (error) {
      setMsgTransferUniverso({ tipo: 'error', texto: 'Error al transferir.' })
    } else {
      setMsgTransferUniverso({ tipo: 'ok', texto: `✓ Universo transferido a ${usuario.email}` })
      await cargarTodo()
      setTimeout(() => { setTransfiriendoUniverso(null); setNuevoOwnerEmail(''); setMsgTransferUniverso(null) }, 2000)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Panel de Administración</h2>
          <p className="page-subtitle">Vista completa del sistema</p>
        </div>
        <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn-ghost" onClick={() => setShowImportador(true)}>📥 Importar Discord</button>
          <button className="btn-ghost" onClick={exportarBackup}>💾 Exportar backup</button>
          <button className="btn-ghost" onClick={() => { setShowImportarBackup(true); setBackupData(null); setMsgImportarBackup(null) }}>📤 Importar backup</button>
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
            <>
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

            {almacenamiento && (() => {
              const fmtBytes = (b) => {
                if (b >= 1024*1024*1024) return (b/(1024*1024*1024)).toFixed(2) + ' GB'
                if (b >= 1024*1024) return (b/(1024*1024)).toFixed(1) + ' MB'
                if (b >= 1024) return (b/1024).toFixed(0) + ' KB'
                return b + ' B'
              }
              const pctStorage = Math.min((almacenamiento.storage.usado / almacenamiento.storage.limite) * 100, 100)
              const pctDB = Math.min((almacenamiento.db.usadoBytes / almacenamiento.db.limite) * 100, 100)
              const colorBarra = (pct) => pct > 80 ? '#e74c3c' : pct > 60 ? '#e67e22' : '#2ecc71'
              return (
                <div style={{ marginTop: '1.5rem', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.5rem' }}>
                  <h3 style={{ fontFamily: 'Cinzel, serif', fontSize: '0.85rem', color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '1.2rem' }}>
                    💾 Almacenamiento — Plan gratuito Supabase
                  </h3>

                  {/* Storage */}
                  <div style={{ marginBottom: '1.2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                      <span style={{ fontSize: '0.88rem', color: 'var(--text2)' }}>📁 Storage (archivos e imágenes)</span>
                      <span style={{ fontSize: '0.88rem', color: pctStorage > 80 ? '#e74c3c' : 'var(--text2)' }}>
                        {fmtBytes(almacenamiento.storage.usado)} / 1 GB
                      </span>
                    </div>
                    <div style={{ height: '8px', background: 'var(--bg3)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${pctStorage}%`, height: '100%', background: colorBarra(pctStorage), borderRadius: '4px', transition: 'width 0.5s' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
                      {almacenamiento.storage.buckets.map(b => (
                        <span key={b.nombre} style={{ fontSize: '0.75rem', color: 'var(--text3)' }}>
                          {b.nombre}: <strong style={{ color: 'var(--text2)' }}>{fmtBytes(b.bytes)}</strong>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Base de datos */}
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                      <span style={{ fontSize: '0.88rem', color: 'var(--text2)' }}>🗄️ Base de datos {almacenamiento.db.real ? '' : '(estimado)'}</span>
                      <span style={{ fontSize: '0.88rem', color: pctDB > 80 ? '#e74c3c' : 'var(--text2)' }}>
                        {fmtBytes(almacenamiento.db.usadoBytes)} / 500 MB
                      </span>
                    </div>
                    <div style={{ height: '8px', background: 'var(--bg3)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${pctDB}%`, height: '100%', background: colorBarra(pctDB), borderRadius: '4px', transition: 'width 0.5s' }} />
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text3)', marginTop: '0.4rem' }}>
                      * Estimado en base al número de entradas, personajes y universos. El valor real puede consultarse en el dashboard de Supabase.
                    </p>
                  </div>

                  {pctStorage > 70 && (
                    <div style={{ background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.3)', borderRadius: 'var(--radius)', padding: '0.6rem 1rem', fontSize: '0.85rem', color: '#e74c3c' }}>
                      ⚠️ Storage al {pctStorage.toFixed(0)}% — considera limpiar imágenes antiguas o actualizar al plan Pro.
                    </div>
                  )}
                  {pctStorage <= 70 && (
                    <div style={{ background: 'rgba(46,204,113,0.1)', border: '1px solid rgba(46,204,113,0.2)', borderRadius: 'var(--radius)', padding: '0.6rem 1rem', fontSize: '0.85rem', color: '#2ecc71' }}>
                      ✓ Almacenamiento en buen estado — {(100 - pctStorage).toFixed(0)}% libre en storage.
                    </div>
                  )}
                </div>
              )
            })()}
            </>
          )}

          {tab === 'universos' && (
            <div className="admin-tabla">
              <table>
                <thead><tr><th>Nombre</th><th>Ambientación</th><th>Propietario</th><th>Creado</th><th>Acciones</th></tr></thead>
                <tbody>
                  {universos.map(u => (
                    <tr key={u.id}>
                      <td><span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: u.color, marginRight: '0.5rem' }} />{u.nombre}</td>
                      <td>{u.ambientacion}</td>
                      <td>{emailDeUsuario(u.user_id)}</td>
                      <td>{formatFecha(u.created_at)}</td>
                      <td style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                        <button className="btn-ghost btn-sm" onClick={() => exportarUniverso(u)}>💾 Backup</button>
                        <button className="btn-ghost btn-sm" onClick={() => { setTransfiriendoUniverso(u); setNuevoOwnerEmail(''); setMsgTransferUniverso(null) }}>🔄 Transferir</button>
                        <button className="btn-danger btn-sm" onClick={() => setConfirmDelete({ tabla: 'universos', id: u.id, nombre: u.nombre })}>Eliminar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Modal transferir universo */}
          {transfiriendoUniverso && (
            <div className="modal-overlay" onClick={() => setTransfiriendoUniverso(null)}>
              <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
                <h3>🔄 Transferir universo</h3>
                <p style={{ color: 'var(--text2)', margin: '0.5rem 0 1rem', fontSize: '0.9rem' }}>
                  Transferir <strong>"{transfiriendoUniverso.nombre}"</strong> a otro usuario. El nuevo propietario tendrá control total.
                </p>
                <div className="form-group">
                  <label>Email del nuevo propietario</label>
                  <input placeholder="email@ejemplo.com" value={nuevoOwnerEmail} onChange={e => setNuevoOwnerEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && transferirUniverso()} autoFocus />
                </div>
                {msgTransferUniverso && (
                  <div className={msgTransferUniverso.tipo === 'ok' ? 'auth-mensaje' : 'auth-error'} style={{ marginBottom: '0.8rem' }}>
                    {msgTransferUniverso.texto}
                  </div>
                )}
                <div className="modal-actions">
                  <button className="btn-ghost" onClick={() => setTransfiriendoUniverso(null)}>Cancelar</button>
                  <button className="btn-primary" onClick={transferirUniverso} disabled={!nuevoOwnerEmail.trim()}>Transferir</button>
                </div>
              </div>
            </div>
          )}

          {tab === 'usuarios' && (
            <div className="admin-tabla">
              <table>
                <thead><tr><th>Email</th><th>ID</th><th>Universos</th><th>Personajes</th><th>Entradas</th><th>Acciones</th></tr></thead>
                <tbody>
                  {usuarios.map(u => (
                    <tr key={u.id}>
                      <td>{u.email}</td>
                      <td><code style={{ fontSize: '0.7rem' }}>{u.id?.slice(0,8)}...</code></td>
                      <td>{u.universos}</td>
                      <td>{u.personajes}</td>
                      <td>{u.entradas}</td>
                      <td style={{ display: 'flex', gap: '0.3rem' }}>
                        <button className="btn-ghost btn-sm" onClick={() => { setCambiandoPassword(u); setNuevaPassword(''); setMsgPassword(null) }}>🔑</button>
                        <button className="btn-danger btn-sm" onClick={() => setConfirmDelete({ tabla: 'usuarios', id: u.id, nombre: u.email })}>Eliminar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'personajes' && (
            <div>
              <p style={{ color: 'var(--text2)', fontSize: '0.95rem', marginBottom: '1rem', fontStyle: 'italic' }}>Haz clic en "Transferir" para asignar un personaje a otro usuario.</p>
              <div className="admin-tabla">
                <table>
                  <thead><tr><th>Personaje</th><th>Tipo</th><th>Rol</th><th>Universo</th><th>Propietario</th><th>Acciones</th></tr></thead>
                  <tbody>
                    {personajesDetalle.map(p => (
                      <tr key={p.id}>
                        <td style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: p.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', color: 'white', fontWeight: 700, flexShrink: 0 }}>{p.iniciales}</div>
                          {p.nombre}
                        </td>
                        <td><span className="card-badge" style={{ fontSize: '0.7rem', ...(p.es_npc ? { background: 'rgba(52,152,219,0.15)', borderColor: '#3498db', color: '#3498db' } : {}) }}>{p.es_npc ? '🤖 NPC' : '👤 Jugador'}</span></td>
                        <td>{p.rol}</td>
                        <td>{p.universo_nombre}</td>
                        <td style={{ fontSize: '0.85rem' }}>{emailDeUsuario(p.user_id)}</td>
                        <td><button className="btn-ghost btn-sm" onClick={() => { setTransferiendo(p); setNuevoUserId(''); setMsgTransfer(null) }}>Transferir</button></td>
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
                <thead><tr><th>Tipo</th><th>Contenido</th><th>Personaje</th><th>Fecha</th><th>Acciones</th></tr></thead>
                <tbody>
                  {entradas.slice(0, 100).map(e => (
                    <tr key={e.id}>
                      <td><span className="card-badge" style={{ fontSize: '0.7rem' }}>{e.tipo}</span></td>
                      <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.imagen_url ? '📷 Imagen' : e.contenido}</td>
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
            <p style={{ color: 'var(--text2)', margin: '0.8rem 0 0.3rem' }}>Asignar <strong>{transferiendo.nombre}</strong> a otro usuario.</p>
            <p style={{ color: 'var(--text3)', fontSize: '0.85rem', marginBottom: '1.2rem' }}>El personaje pasará a ser de tipo Jugador y será propiedad del usuario indicado.</p>
            <div className="form-group">
              <label>Email del nuevo propietario</label>
              <select value={nuevoUserId} onChange={e => setNuevoUserId(e.target.value)}>
                <option value="">Selecciona un usuario...</option>
                {usuarios.map(u => <option key={u.id} value={u.email}>{u.email}</option>)}
              </select>
            </div>
            {msgTransfer && <div className={msgTransfer.tipo === 'ok' ? 'auth-mensaje' : 'auth-error'} style={{ marginBottom: '1rem' }}>{msgTransfer.texto}</div>}
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setTransferiendo(null)}>Cancelar</button>
              <button className="btn-primary" onClick={transferirPersonaje} disabled={!nuevoUserId}>Transferir</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal cambiar contraseña */}
      {cambiandoPassword && (
        <div className="modal-overlay" onClick={() => setCambiandoPassword(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <h3>🔑 Cambiar contraseña</h3>
            <p style={{ color: 'var(--text2)', margin: '0.8rem 0 1.2rem', fontSize: '0.9rem' }}>
              Cambiando contraseña de <strong>{cambiandoPassword.email}</strong>.<br/>
              El usuario deberá cambiarla desde su perfil cuando inicie sesión.
            </p>
            <div className="form-group">
              <label>Nueva contraseña</label>
              <input
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={nuevaPassword}
                onChange={e => setNuevaPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCambiarPassword()}
                autoFocus
              />
            </div>
            {msgPassword && <div className={msgPassword.tipo === 'ok' ? 'auth-mensaje' : 'auth-error'} style={{ marginBottom: '1rem' }}>{msgPassword.texto}</div>}
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setCambiandoPassword(null)}>Cancelar</button>
              <button className="btn-primary" onClick={handleCambiarPassword} disabled={nuevaPassword.length < 6}>Cambiar</button>
            </div>
          </div>
        </div>
      )}

      {showImportador && <ImportadorDiscord onCerrar={() => setShowImportador(false)} />}

      {showImportarBackup && (
        <div className="modal-overlay" onClick={() => { if (!importandoBackup) setShowImportarBackup(false) }}>
          <div className="modal" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
            <h3>📤 Importar backup de universo</h3>
            <p style={{ color: 'var(--text2)', fontSize: '0.9rem', margin: '0.8rem 0 1.2rem' }}>
              Importa un archivo de backup generado con "💾 Backup" desde el panel de universos.<br/>
              Se creará un universo nuevo con todos sus personajes, sesiones y entradas.
            </p>

            {!backupData ? (
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'inline-block', padding: '0.5rem 1rem', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text)' }}>
                  📁 Seleccionar archivo JSON
                  <input type="file" accept=".json" style={{ display: 'none' }} onChange={leerArchivoBackup} />
                </label>
              </div>
            ) : (
              <div style={{ background: 'rgba(46,204,113,0.08)', border: '1px solid rgba(46,204,113,0.2)', borderRadius: 'var(--radius)', padding: '1rem', marginBottom: '1rem' }}>
                <p style={{ fontFamily: 'Cinzel, serif', color: 'var(--accent)', fontWeight: 700, marginBottom: '0.5rem' }}>✓ Archivo cargado</p>
                <p style={{ fontSize: '0.9rem', color: 'var(--text2)', marginBottom: '0.25rem' }}>Universo: <strong>{backupData.universo?.nombre}</strong></p>
                <p style={{ fontSize: '0.85rem', color: 'var(--text3)' }}>
                  {backupData.personajes?.length || 0} personajes · {backupData.sesiones?.length || 0} sesiones · {backupData.entradas?.length || 0} entradas
                </p>
              </div>
            )}

            {msgImportarBackup && (
              <div className={msgImportarBackup.tipo === 'ok' ? 'auth-mensaje' : 'auth-error'} style={{ marginBottom: '1rem' }}>
                {msgImportarBackup.texto}
              </div>
            )}

            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setShowImportarBackup(false)} disabled={importandoBackup}>Cancelar</button>
              {backupData && (
                <button className="btn-primary" onClick={ejecutarImportacion} disabled={importandoBackup}>
                  {importandoBackup ? 'Importando...' : '📤 Importar universo'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
