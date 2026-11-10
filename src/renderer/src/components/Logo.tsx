// Isotipo «Red radial»: un depósito en el centro, dos anillos de 6 nodos y un
// bucle exterior de 12. Misma geometría que el generador de la web de OpenRoute.

const R1 = 0.4
const R2 = 0.69
const R3 = 1
const f = (n: number): number => Number(n.toFixed(3))
const rad = (d: number): number => (d * Math.PI) / 180
const pt = (r: number, deg: number): { x: number; y: number } => ({
  x: f(r * Math.cos(rad(deg))),
  y: f(r * Math.sin(rad(deg)))
})

function geometry(): {
  edges: string[]
  loop: string[]
  nodes: { x: number; y: number; r: number; depot?: boolean }[]
} {
  const center = { x: 0, y: 0 }
  const ring1 = [...Array(6)].map((_, k) => pt(R1, -90 + 60 * k))
  const ring2 = [...Array(6)].map((_, k) => pt(R2, -60 + 60 * k))
  const ring3 = [...Array(12)].map((_, k) => pt(R3, -90 + 30 * k))
  const edges: string[] = []
  const line = (a: { x: number; y: number }, b: { x: number; y: number }): void => {
    edges.push(`M${a.x} ${a.y}L${b.x} ${b.y}`)
  }
  const curve = (a: { x: number; y: number }, b: { x: number; y: number }, pull: number): void => {
    const k = 1 - pull
    edges.push(`M${a.x} ${a.y}Q${f(((a.x + b.x) / 2) * k)} ${f(((a.y + b.y) / 2) * k)} ${b.x} ${b.y}`)
  }
  ring1.forEach((p) => line(center, p))
  ring1.forEach((p, k) => {
    line(p, ring2[k])
    line(p, ring2[(k + 5) % 6])
  })
  ring2.forEach((p, k) => {
    const o = 2 * k + 1
    line(p, ring3[o])
    curve(p, ring3[(o + 11) % 12], 0.08)
    curve(p, ring3[(o + 1) % 12], 0.08)
  })
  const loop = ring3.map((p, k) => {
    const q = ring3[(k + 1) % 12]
    return `M${p.x} ${p.y}A${R3} ${R3} 0 0 1 ${q.x} ${q.y}`
  })
  const nodes = [
    { ...center, r: 0.135, depot: true },
    ...ring1.map((p) => ({ ...p, r: 0.085 })),
    ...ring2.map((p) => ({ ...p, r: 0.085 })),
    ...ring3.map((p) => ({ ...p, r: 0.095 }))
  ]
  return { edges, loop, nodes }
}

const GEO = geometry()

export function Isotipo({
  size = 22,
  live = false,
  className = ''
}: {
  size?: number
  live?: boolean
  className?: string
}) {
  const sw = 0.05
  return (
    <svg
      className={`iso ${live ? 'iso--live' : ''} ${className}`}
      viewBox="-1.22 -1.22 2.44 2.44"
      width={size}
      height={size}
      aria-hidden="true"
    >
      <g fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round">
        {GEO.edges.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <g fill="none" stroke="currentColor" strokeWidth={sw * 1.15} strokeLinecap="round">
        {GEO.loop.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      {live && (
        <circle
          className="iso__runner"
          cx="0"
          cy="0"
          r={R3}
          fill="none"
          stroke="var(--color-ac)"
          strokeWidth={sw * 1.6}
          strokeLinecap="round"
          pathLength={100}
          transform="rotate(-90)"
        />
      )}
      {GEO.nodes.map((n, i) =>
        n.depot ? (
          <circle key={i} className="iso__depot" cx="0" cy="0" r={n.r} fill="var(--color-ac)" />
        ) : (
          <circle
            key={i}
            className="iso__node"
            style={live ? { animationDelay: `${-(i % 12) * 0.4}s` } : undefined}
            cx={n.x}
            cy={n.y}
            r={n.r}
            fill="currentColor"
          />
        )
      )}
    </svg>
  )
}

export function Wordmark({ size = 20 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2 text-tx">
      <Isotipo size={size} />
      <span className="text-[15px] font-semibold tracking-[-0.03em]">OpenRoute</span>
    </span>
  )
}
