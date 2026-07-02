import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'

const TIPO_COLORES = {
  aliado:   '#2ecc71',
  enemigo:  '#e74c3c',
  familiar: '#9b59b6',
  amigo:    '#3498db',
  rival:    '#e67e22',
  neutral:  '#95a5a6',
  amor:     '#e91e63',
  mentor:   '#f1c40f',
}

const TODOS_TIPOS = Object.keys(TIPO_COLORES)

const W = 780
const H = 520
const RADIO = 22
const REPULSION = 8000
const SPRING_K = 0.04
const SPRING_LEN = 160
const GRAVITY = 0.015
const DAMPING = 0.78
const ENERGY_THRESHOLD = 0.02
const MAX_STEPS = 500

export default function PanelMapaRelaciones({ universoId, personajes, onCerrar }) {
  const [relaciones, setRelaciones] = useState([])
  const [nodes, setNodes]           = useState([])
  const [cargando, setCargando]     = useState(true)
  const [focusMode, setFocusMode]   = useState(false)
  const [filtroTipo, setFiltroTipo] = useState(null)

  const nodesRef       = useRef([])
  const rafRef         = useRef(null)
  const stepRef        = useRef(0)
  const restartSimRef  = useRef(null)
  const draggingRef    = useRef(null)
  const svgRef         = useRef(null)

  /* ── Load relations ── */
  useEffect(() => {
    if (!personajes?.length) { setCargando(false); return }
    const ids = personajes.map(p => p.id)
    setCargando(true)
    supabase
      .from('personaje_relaciones')
      .select('id, personaje_id, relacionado_id, tipo, descripcion')
      .in('personaje_id', ids)
      .then(({ data }) => { setRelaciones(data || []); setCargando(false) })
  }, [universoId, personajes])

  /* ── Init nodes ── */
  useEffect(() => {
    if (!personajes?.length) return
    const cx = W / 2, cy = H / 2
    const r = Math.min(W, H) * 0.3
    const initialNodes = personajes.map((p, i) => {
      const angle = (2 * Math.PI * i) / personajes.length
      return { id: p.id, x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), vx: 0, vy: 0, personaje: p }
    })
    nodesRef.current = initialNodes
    setNodes(initialNodes.map(n => ({ id: n.id, x: n.x, y: n.y, personaje: n.personaje })))
    stepRef.current = 0
  }, [personajes])

  /* ── Physics ── */
  const runSimulation = useCallback(() => {
    const tick = () => {
      const ns = nodesRef.current
      if (!ns.length) return

      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const dx = ns[j].x - ns[i].x, dy = ns[j].y - ns[i].y
          const dist2 = dx * dx + dy * dy || 1, dist = Math.sqrt(dist2)
          const force = REPULSION / dist2
          const fx = (dx / dist) * force, fy = (dy / dist) * force
          ns[i].vx -= fx; ns[i].vy -= fy
          ns[j].vx += fx; ns[j].vy += fy
        }
      }
      for (const rel of relaciones) {
        const a = ns.find(n => n.id === rel.personaje_id)
        const b = ns.find(n => n.id === rel.relacionado_id)
        if (!a || !b) continue
        const dx = b.x - a.x, dy = b.y - a.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const stretch = dist - SPRING_LEN
        const fx = (dx / dist) * SPRING_K * stretch, fy = (dy / dist) * SPRING_K * stretch
        a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy
      }
      for (const n of ns) {
        n.vx += (W / 2 - n.x) * GRAVITY
        n.vy += (H / 2 - n.y) * GRAVITY
      }
      let totalKE = 0
      for (const n of ns) {
        if (draggingRef.current?.nodeId === n.id) { n.vx = 0; n.vy = 0; continue }
        n.vx *= DAMPING; n.vy *= DAMPING
        n.x += n.vx; n.y += n.vy
        n.x = Math.max(RADIO + 4, Math.min(W - RADIO - 4, n.x))
        n.y = Math.max(RADIO + 20, Math.min(H - RADIO - 20, n.y))
        totalKE += n.vx * n.vx + n.vy * n.vy
      }
      setNodes(ns.map(n => ({ id: n.id, x: n.x, y: n.y, personaje: n.personaje })))
      stepRef.current += 1
      if (totalKE > ENERGY_THRESHOLD && stepRef.current < MAX_STEPS) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        rafRef.current = null
      }
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    stepRef.current = 0
    rafRef.current = requestAnimationFrame(tick)
  }, [relaciones])

  useEffect(() => { restartSimRef.current = runSimulation }, [runSimulation])
  useEffect(() => {
    if (nodesRef.current.length > 0) runSimulation()
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [runSimulation, relaciones.length])

  /* ── SVG coordinate helper ── */
  const svgPoint = useCallback((clientX, clientY) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const pt = svg.createSVGPoint()
    pt.x = clientX; pt.y = clientY
    const transformed = pt.matrixTransform(svg.getScreenCTM().inverse())
    return { x: transformed.x, y: transformed.y }
  }, [])

  /* ── Drag via Pointer Events (works mouse + touch) ── */
  const handlePointerDown = useCallback((e, nodeId) => {
    e.preventDefault()
    e.stopPropagation()
    const { x, y } = svgPoint(e.clientX, e.clientY)
    const node = nodesRef.current.find(n => n.id === nodeId)
    if (!node) return
    e.currentTarget.setPointerCapture(e.pointerId)
    draggingRef.current = { nodeId, offsetX: x - node.x, offsetY: y - node.y }
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
  }, [svgPoint])

  const handlePointerMove = useCallback((e, nodeId) => {
    if (!draggingRef.current || draggingRef.current.nodeId !== nodeId) return
    e.preventDefault()
    const { x: mx, y: my } = svgPoint(e.clientX, e.clientY)
    const n = nodesRef.current.find(nd => nd.id === nodeId)
    if (!n) return
    n.x = Math.max(RADIO + 4, Math.min(W - RADIO - 4, mx - draggingRef.current.offsetX))
    n.y = Math.max(RADIO + 20, Math.min(H - RADIO - 20, my - draggingRef.current.offsetY))
    n.vx = 0; n.vy = 0
    setNodes(prev => prev.map(nd => nd.id === nodeId ? { ...nd, x: n.x, y: n.y } : nd))
  }, [svgPoint])

  const handlePointerUp = useCallback((e, nodeId) => {
    if (!draggingRef.current || draggingRef.current.nodeId !== nodeId) return
    draggingRef.current = null
    if (restartSimRef.current) { stepRef.current = 0; restartSimRef.current() }
  }, [])

  /* ── Opacity logic ── */
  const connectedIds = useMemo(() => {
    const s = new Set()
    relaciones.forEach(r => { s.add(r.personaje_id); s.add(r.relacionado_id) })
    return s
  }, [relaciones])

  const filteredIds = useMemo(() => {
    if (!filtroTipo) return null
    const s = new Set()
    relaciones.filter(r => r.tipo === filtroTipo).forEach(r => { s.add(r.personaje_id); s.add(r.relacionado_id) })
    return s
  }, [filtroTipo, relaciones])

  const getNodeOpacity = (nodeId) => {
    if (filteredIds) return filteredIds.has(nodeId) ? 1 : 0.12
    if (focusMode) return connectedIds.has(nodeId) ? 1 : 0.15
    return 1
  }

  const getEdgeOpacity = (rel) => {
    if (filtroTipo) return rel.tipo === filtroTipo ? 0.9 : 0.06
    return 0.7
  }

  const getNode = (id) => nodes.find(n => n.id === id)

  /* ── Render ── */
  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div
        className="modal modal-mapa"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '860px', width: '100%', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
          <h3 style={{ margin: 0 }}>🗺️ Mapa de relaciones</h3>

          {/* Focus toggle */}
          {!cargando && personajes?.length > 0 && (
            <button
              onClick={() => { setFocusMode(f => !f); if (filtroTipo) setFiltroTipo(null) }}
              title="Enfocar personajes con relaciones"
              style={{
                background: focusMode ? 'var(--accent-glow)' : 'var(--bg3)',
                border: `1px solid ${focusMode ? 'var(--accent)' : 'var(--border)'}`,
                color: focusMode ? 'var(--accent)' : 'var(--text3)',
                borderRadius: 'var(--radius)',
                padding: '0.25rem 0.65rem',
                fontSize: '0.8rem',
                cursor: 'pointer',
                fontFamily: "'Cinzel', serif",
                letterSpacing: '0.03em',
                transition: 'all 0.15s',
                marginLeft: 'auto',
              }}
            >
              🎯 {focusMode ? 'Enfoque activo' : 'Enfocar'}
            </button>
          )}

          <button
            onClick={onCerrar}
            style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: '1.2rem', cursor: 'pointer', lineHeight: 1, flexShrink: 0 }}
          >✕</button>
        </div>

        {/* Body */}
        {cargando ? (
          <p style={{ color: 'var(--text3)', textAlign: 'center', padding: '2rem' }}>Cargando...</p>
        ) : !personajes?.length ? (
          <div className="empty-state" style={{ padding: '2rem' }}>
            <p>No hay personajes en este universo.</p>
          </div>
        ) : (
          <>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${W} ${H}`}
              style={{
                width: '100%',
                background: 'var(--bg)',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border)',
                display: 'block',
                touchAction: 'none',
              }}
            >
              <defs>
                {nodes.map(n => n.personaje.avatar_url && (
                  <clipPath key={`clip-${n.id}`} id={`clip-${n.id}`}>
                    <circle cx={n.x} cy={n.y} r={RADIO} />
                  </clipPath>
                ))}
              </defs>

              {/* Edges */}
              {relaciones.map(rel => {
                const a = getNode(rel.personaje_id), b = getNode(rel.relacionado_id)
                if (!a || !b) return null
                const color = TIPO_COLORES[rel.tipo] || '#95a5a6'
                const opacity = getEdgeOpacity(rel)
                const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
                return (
                  <g key={rel.id} style={{ transition: 'opacity 0.25s' }} opacity={opacity}>
                    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={filtroTipo && rel.tipo === filtroTipo ? 2.5 : 1.8} />
                    <text x={mx} y={my - 4} textAnchor="middle" fontSize="9" fill={color}
                      fontFamily="'Cinzel', serif" letterSpacing="0.04em"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}>
                      {rel.tipo}
                    </text>
                  </g>
                )
              })}

              {/* Nodes */}
              {nodes.map(n => {
                const p = n.personaje
                const opacity = getNodeOpacity(n.id)
                return (
                  <g
                    key={n.id}
                    opacity={opacity}
                    style={{ cursor: 'grab', transition: 'opacity 0.25s', touchAction: 'none' }}
                    onPointerDown={e => handlePointerDown(e, n.id)}
                    onPointerMove={e => handlePointerMove(e, n.id)}
                    onPointerUp={e => handlePointerUp(e, n.id)}
                    onPointerCancel={e => handlePointerUp(e, n.id)}
                  >
                    {p.avatar_url ? (
                      <>
                        <circle cx={n.x} cy={n.y} r={RADIO} fill={p.color || '#555'}
                          stroke={p.es_npc ? '#3498db' : 'rgba(255,255,255,0.15)'}
                          strokeWidth={p.es_npc ? 2.5 : 1.5} />
                        <image href={p.avatar_url}
                          x={n.x - RADIO} y={n.y - RADIO} width={RADIO * 2} height={RADIO * 2}
                          clipPath={`url(#clip-${n.id})`} preserveAspectRatio="xMidYMid slice"
                          style={{ pointerEvents: 'none' }} />
                      </>
                    ) : (
                      <circle cx={n.x} cy={n.y} r={RADIO} fill={p.color || '#555'}
                        stroke={p.es_npc ? '#3498db' : 'rgba(255,255,255,0.15)'}
                        strokeWidth={p.es_npc ? 2.5 : 1.5} />
                    )}
                    {!p.avatar_url && (
                      <text x={n.x} y={n.y + 5} textAnchor="middle" fontSize="11"
                        fontFamily="'Cinzel', serif" fontWeight="700" fill="white"
                        style={{ pointerEvents: 'none', userSelect: 'none' }}>
                        {p.iniciales || '?'}
                      </text>
                    )}
                    <text x={n.x} y={n.y + RADIO + 14} textAnchor="middle" fontSize="10"
                      fontFamily="'Cinzel', serif" fill="var(--text2)"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}>
                      {p.nombre}
                    </text>
                  </g>
                )
              })}
            </svg>

            {/* Legend — clicable */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem 0.8rem', paddingTop: '0.25rem' }}>
              {TODOS_TIPOS.map(tipo => {
                const activo = filtroTipo === tipo
                const tieneRels = relaciones.some(r => r.tipo === tipo)
                return (
                  <button
                    key={tipo}
                    onClick={() => {
                      setFiltroTipo(prev => prev === tipo ? null : tipo)
                      setFocusMode(false)
                    }}
                    title={tieneRels ? `Filtrar: ${tipo}` : `Sin relaciones de tipo ${tipo}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.35rem',
                      fontSize: '0.75rem', fontFamily: "'Cinzel', serif", letterSpacing: '0.03em',
                      color: activo ? '#fff' : tieneRels ? 'var(--text2)' : 'var(--text3)',
                      background: activo ? TIPO_COLORES[tipo] + '33' : 'none',
                      border: activo ? `1px solid ${TIPO_COLORES[tipo]}` : '1px solid transparent',
                      borderRadius: '999px',
                      padding: '0.15rem 0.5rem',
                      cursor: tieneRels ? 'pointer' : 'default',
                      opacity: tieneRels ? 1 : 0.4,
                      transition: 'all 0.15s',
                    }}
                  >
                    <span style={{
                      display: 'inline-block', width: 20, height: 3,
                      borderRadius: 2, background: TIPO_COLORES[tipo], flexShrink: 0,
                    }} />
                    {tipo}
                  </button>
                )
              })}
              {filtroTipo && (
                <button
                  onClick={() => setFiltroTipo(null)}
                  style={{
                    fontSize: '0.72rem', color: 'var(--text3)', background: 'none',
                    border: '1px solid var(--border)', borderRadius: '999px',
                    padding: '0.15rem 0.5rem', cursor: 'pointer',
                  }}
                >
                  ✕ limpiar
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
