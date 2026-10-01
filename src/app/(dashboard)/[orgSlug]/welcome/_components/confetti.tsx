'use client'

import { useEffect, useRef } from 'react'

/** The logo's four inks, and the darker face each shows when it flips over. */
const INKS = [
  ['#F05B23', '#C2410C'],
  ['#FBAE3A', '#D98A12'],
  ['#5BC5EF', '#2E9CC9'],
  ['#344D90', '#22346A'],
] as const

interface Piece {
  x: number
  y: number
  vx: number
  vy: number
  w: number
  h: number
  shape: 'paper' | 'ribbon' | 'dot'
  ink: (typeof INKS)[number]
  angle: number
  spin: number
  flip: number
  flipSpeed: number
  wobble: number
  wobbleSpeed: number
  life: number
  ttl: number
}

const GRAVITY = 0.28
const DRAG = 0.982

function between(low: number, high: number) {
  return low + Math.random() * (high - low)
}

/** One cannon's worth, fired from (x, y) up and inward at `aim` radians. */
function volley(x: number, y: number, aim: number, count: number, power: number): Piece[] {
  return Array.from({ length: count }, () => {
    const direction = aim + between(-0.42, 0.42)
    const speed = power * between(0.55, 1)
    const roll = Math.random()
    const shape = roll < 0.72 ? 'paper' : roll < 0.88 ? 'ribbon' : 'dot'
    return {
      x,
      y,
      vx: Math.cos(direction) * speed,
      vy: Math.sin(direction) * speed,
      w: shape === 'ribbon' ? between(3, 4) : shape === 'dot' ? between(5, 7) : between(7, 11),
      h: shape === 'ribbon' ? between(14, 22) : shape === 'dot' ? 0 : between(10, 15),
      shape,
      ink: INKS[Math.floor(Math.random() * INKS.length)],
      angle: between(0, Math.PI * 2),
      spin: between(-0.12, 0.12),
      flip: between(0, Math.PI * 2),
      flipSpeed: between(0.08, 0.22),
      wobble: between(0, Math.PI * 2),
      wobbleSpeed: between(0.04, 0.1),
      life: 0,
      ttl: between(170, 260),
    }
  })
}

/**
 * Paper confetti over the whole window, fired from both bottom corners each
 * time `shot` changes (0 fires nothing). Pieces tumble — each flips over and
 * shows its darker back — flutter side to side, and settle under gravity
 * rather than flying off in straight lines. Nothing at all under reduced
 * motion.
 */
export function Confetti({ shot }: { shot: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!shot) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    const width = window.innerWidth
    const height = window.innerHeight
    canvas.width = width * ratio
    canvas.height = height * ratio
    context.scale(ratio, ratio)

    // Scaled to the screen, so a phone isn't buried and a monitor isn't bare.
    const power = Math.max(15, Math.min(24, height / 36))
    const count = width < 640 ? 70 : 110
    let pieces = [
      ...volley(-10, height + 10, -Math.PI / 3, count, power),
      ...volley(width + 10, height + 10, (-Math.PI * 2) / 3, count, power),
    ]
    // A second, smaller pair a beat later reads as a celebration, not a glitch.
    const encore = window.setTimeout(() => {
      pieces = pieces.concat(
        volley(-10, height * 0.7, -Math.PI / 4, Math.round(count / 3), power * 0.8),
        volley(width + 10, height * 0.7, (-Math.PI * 3) / 4, Math.round(count / 3), power * 0.8)
      )
    }, 260)

    let frame = 0
    let last = performance.now()
    const draw = (now: number) => {
      // Frame-rate independent: 1 is one 60Hz frame.
      const step = Math.min((now - last) / 16.667, 3)
      last = now
      context.clearRect(0, 0, width, height)

      pieces = pieces.filter((piece) => piece.life < piece.ttl && piece.y < height + 40)
      for (const piece of pieces) {
        piece.life += step
        piece.vx *= DRAG ** step
        piece.vy = piece.vy * DRAG ** step + GRAVITY * step
        // Falling paper doesn't fall faster than air lets it.
        if (piece.vy > 4.2) piece.vy = 4.2
        piece.wobble += piece.wobbleSpeed * step
        piece.flip += piece.flipSpeed * step
        piece.angle += piece.spin * step
        piece.x += (piece.vx + Math.cos(piece.wobble) * 0.9) * step
        piece.y += piece.vy * step

        const fade = Math.min(1, (piece.ttl - piece.life) / 40)
        const face = Math.cos(piece.flip)
        context.save()
        context.globalAlpha = fade
        context.translate(piece.x, piece.y)
        context.rotate(piece.angle)
        context.fillStyle = face >= 0 ? piece.ink[0] : piece.ink[1]
        if (piece.shape === 'dot') {
          context.beginPath()
          context.ellipse(0, 0, piece.w / 2, (piece.w / 2) * Math.max(Math.abs(face), 0.25), 0, 0, Math.PI * 2)
          context.fill()
        } else {
          // Seen edge-on it's a sliver, never nothing.
          const visible = piece.h * Math.max(Math.abs(face), 0.12)
          context.fillRect(-piece.w / 2, -visible / 2, piece.w, visible)
        }
        context.restore()
      }

      if (pieces.length) frame = requestAnimationFrame(draw)
      else context.clearRect(0, 0, width, height)
    }
    frame = requestAnimationFrame(draw)

    return () => {
      window.clearTimeout(encore)
      cancelAnimationFrame(frame)
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.clearRect(0, 0, canvas.width, canvas.height)
    }
  }, [shot])

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 z-[60] h-full w-full" />
}
