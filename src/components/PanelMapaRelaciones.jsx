import { useState, useEffect, useRef, useCallback } from 'react'
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
  const [nodes, setNodes] = useState([])
  const [cargando, setCargando] = useState(true)

  // Physics state lives in a ref to avoid stale closures
  const nodesRef = useRef([])
  const rafRef = useRef(null)
  const stepRef = useRef(0)
  const restartSimRef = useRef(null)

  // Drag state
  const draggingRef = useRef(null) // { nodeIndex, offsetX, offsetY }
  const svgRef = useRef(null)

  // ── Load relations ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!personajes || personajes.length === 0) {
      setCargando(false)
      return
    }
    const ids = personajes.map(p => p.id)
    setCargando(true)
    supabase
      .from('personaje_relaciones')
      .select('id, personaje_id, relacionado_id, tipo, descripcion')
      .in('personaje_id', ids)
      .then(({ data }) => {
        setRelaciones(data || [])
        setCargando(false)
      })
  }, [universoId, personajes])

  // ── Initialize physics nodes ────────────────────────────────────────────────
  useEffect(() => {
    if (!personajes || personajes.length === 0) return

    const cx = W / 2
    const cy = H / 2
    const r = Math.min(W, H) * 0.3
    const initialNodes = personajes.map((p, i) => {
      const angle = (2 * Math.PI * i) / personajes.length
      return {
        id: p.id,
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
        vx: 0,
        vy: 0,
        personaje: p,
      }
    })
    nodesRef.current = initialNodes
    setNodes(initialNodes.map(n => ({ id: n.id, x: n.x, y: n.y, personaje: n.personaje })))
    stepRef.current = 0
  }, [personajes])

  // ── Physics simulation ──────────────────────────────────────────────────────
  const runSimulation = useCallback(() => {
    const tick = () => {
      const ns = nodesRef.current
      if (!ns.length) return

      // Repulsion between all pairs
      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const dx = ns[j].x - ns[i].x
          const dy = ns[j].y - ns[i].y
          const dist2 = dx * dx + dy * dy || 1
          const dist = Math.sqrt(dist2)
          const force = REPULSION / dist2
          const fx = (dx / dist) * force
          const fy = (dy / dist) * force
          ns[i].vx -= fx
          ns[i].vy -= fy
          ns[j].vx += fx
          ns[j].vy += fy
        }
      }

      // Spring forces along edges
      for (const rel of relaciones) {
        const a = ns.find(n => n.id === rel.personaje_id)
        const b = ns.find(n => n.id === rel.relacionado_id)
        if (!a || !b) continue
        const dx = b.x - a.x
        const dy = b.y - a.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const stretch = dist - SPRING_LEN
        const fx = (dx / dist) * SPRING_K * stretch
        const fy = (dy / dist) * SPRING_K * stretch
        a.vx += fx
        a.vy += fy
        b.vx -= fx
        b.vy -= fy
      }

      // Weak gravity toward center
      for (const n of ns) {
        n.vx += (W / 2 - n.x) * GRAVITY
        n.vy += (H / 2 - n.y) * GRAVITY
      }

      // Integrate + damping + clamp
      let totalKE = 0
      for (const n of ns) {
        if (draggingRef.current && draggingRef.current.nodeId === n.id) {
          n.vx = 0
          n.vy = 0
          continue
        }
        n.vx *= DAMPING
        n.vy *= DAMPING
        n.x += n.vx
        n.y += n.vy
        // Keep inside SVG with padding
        n.x = Math.max(RADIO + 4, Math.min(W - RADIO - 4, n.x))
        n.y = Math.max(RADIO + 20, Math.min(H - RADIO - 20, n.y))
        totalKE += n.vx * n.vx + n.vy * n.vy
      }

      // Snapshot for React render
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

  // Expose restart function via ref so drag handler can call it without stale closure
  useEffect(() => {
    restartSimRef.current = runSimulation
  }, [runSimulation])

  // Start sim when nodes or relations change
  useEffect(() => {
    if (nodesRef.current.length > 0) {
      runSimulation()
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [runSimulation, relaciones.length])

  // ── Drag handlers ───────────────────────────────────────────────────────────
  const svgPoint = useCallback((clientX, clientY) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const pt = svg.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
    const inv = svg.getScreenCTM().inverse()
    const transformed = pt.matrixTransform(inv)
    return { x: transformed.x, y: transformed.y }
  }, [])

  const handleMouseDown = useCallback((e, nodeId) => {
    e.preventDefault()
    const { x, y } = svgPoint(e.clientX, e.clientY)
    const node = nodesRef.current.find(n => n.id === nodeId)
    if (!node) return
    draggingRef.current = { nodeId, offsetX: x - node.x, offsetY: y - node.y }

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }

    const onMove = (ev) => {
      const { x: mx, y: my } = svgPoint(ev.clientX, ev.clientY)
      const n = nodesRef.current.find(nd => nd.id === nodeId)
      if (!n) return
      n.x = mx - draggingRef.current.offsetX
      n.y = my - draggingRef.current.offsetY
      n.vx = 0
      n.vy = 0
      setNodes(prev => prev.map(nd =>
        nd.id === nodeId ? { ...nd, x: n.x, y: n.y } : nd
      ))
    }

    const onUp = () => {
      draggingRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      // Resume simulation
      if (restartSimRef.current) {
        stepRef.current = 0
        restartSimRef.current()
      }
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [svgPoint])

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const getNode = (id) => nodes.find(n => n.id === id)

  const edgeLabel = (rel) => {
    const a = getNode(rel.personaje_id)
    const b = getNode(rel.relacionado_id)
    if (!a || !b) return null
    return { mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div
        className="modal modal-mapa"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '860px',
          width: '100%',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        {/* Header */}
        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>🗺️ Mapa de relaciones</h3>
          <button
            onClick={onCerrar}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text2)',
              fontSize: '1.2rem',
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >✕</button>
        </div>

        {/* Body */}
        {cargando ? (
          <p style={{ color: 'var(--text3)', textAlign: 'center', padding: '2rem' }}>Cargando...</p>
        ) : !personajes || personajes.length === 0 ? (
          <div className="empty-state" style={{ padding: '2rem' }}>
            <p>No hay personajes en este universo.</p>
          </div>
        ) : (
          <>
            <svg
              ref={svgRef}
              className="mapa-svg"
              viewBox={`0 0 ${W} ${H}`}
              style={{
                width: '100%',
                background: 'var(--bg)',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border)',
                cursor: draggingRef.current ? 'grabbing' : 'default',
                display: 'block',
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
                const a = getNode(rel.personaje_id)
                const b = getNode(rel.relacionado_id)
                if (!a || !b) return null
                const color = TIPO_COLORES[rel.tipo] || '#95a5a6'
                const mid = edgeLabel(rel)
                return (
                  <g key={rel.id}>
                    <line
                      x1={a.x} y1={a.y}
                      x2={b.x} y2={b.y}
                      stroke={color}
                      strokeWidth={1.8}
                      strokeOpacity={0.7}
                    />
                    {mid && (
                      <text
                        x={mid.mx}
                        y={mid.my - 4}
                        textAnchor="middle"
                        fontSize="9"
                        fill={color}
                        fontFamily="'Cinzel', serif"
                        letterSpacing="0.04em"
                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                      >
                        {rel.tipo}
                      </text>
                    )}
                  </g>
                )
              })}

              {/* Nodes */}
              {nodes.map(n => {
                const p = n.personaje
                const isNpc = p.es_npc
                return (
                  <g
                    key={n.id}
                    style={{ cursor: 'grab' }}
                    onMouseDown={e => handleMouseDown(e, n.id)}
                  >
                    {/* Node circle */}
                    {p.avatar_url ? (
                      <>
                        <circle
                          cx={n.x} cy={n.y} r={RADIO}
                          fill={p.color || '#555'}
                          stroke={isNpc ? '#3498db' : 'rgba(255,255,255,0.15)'}
                          strokeWidth={isNpc ? 2.5 : 1.5}
                        />
                        <image
                          href={p.avatar_url}
                          x={n.x - RADIO}
                          y={n.y - RADIO}
                          width={RADIO * 2}
                          height={RADIO * 2}
                          clipPath={`url(#clip-${n.id})`}
                          preserveAspectRatio="xMidYMid slice"
                          style={{ pointerEvents: 'none' }}
                        />
                      </>
                    ) : (
                      <circle
                        cx={n.x} cy={n.y} r={RADIO}
                        fill={p.color || '#555'}
                        stroke={isNpc ? '#3498db' : 'rgba(255,255,255,0.15)'}
                        strokeWidth={isNpc ? 2.5 : 1.5}
                      />
                    )}

                    {/* Initials (only when no avatar) */}
                    {!p.avatar_url && (
                      <text
                        x={n.x} y={n.y + 5}
                        textAnchor="middle"
                        fontSize="11"
                        fontFamily="'Cinzel', serif"
                        fontWeight="700"
                        fill="white"
                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                      >
                        {p.iniciales || '?'}
                      </text>
                    )}

                    {/* Name label */}
                    <text
                      x={n.x}
                      y={n.y + RADIO + 14}
                      textAnchor="middle"
                      fontSize="10"
                      fontFamily="'Cinzel', serif"
                      fill="var(--text2)"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {p.nombre}
                    </text>
                  </g>
                )
              })}
            </svg>

            {/* Legend */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.5rem 1rem',
              paddingTop: '0.25rem',
            }}>
              {TODOS_TIPOS.map(tipo => (
                <span
                  key={tipo}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    fontSize: '0.75rem',
                    color: 'var(--text2)',
                    fontFamily: "'Cinzel', serif",
                    letterSpacing: '0.03em',
                  }}
                >
                  <span style={{
                    display: 'inline-block',
                    width: 20,
                    height: 3,
                    borderRadius: 2,
                    background: TIPO_COLORES[tipo],
                    flexShrink: 0,
                  }} />
                  {tipo}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
