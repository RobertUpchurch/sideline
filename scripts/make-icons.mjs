/**
 * Generates the PWA icons.
 *
 * Written by hand rather than pulled from an image library so the repo has no
 * binary assets a contributor cannot regenerate, and no build dependency that
 * only exists to draw one circle. Run with `npm run icons`.
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const PITCH = [0x1b, 0x6b, 0x3a]
const CREAM = [0xf7, 0xf6, 0xf1]
const ORANGE = [0xe8, 0x64, 0x1b]

/** Distance from a point to the nearest edge of a rounded square. */
function roundedSquareAlpha(x, y, size, inset, radius) {
  const min = inset
  const max = size - inset
  const cx = Math.min(Math.max(x, min + radius), max - radius)
  const cy = Math.min(Math.max(y, min + radius), max - radius)
  const distance = Math.hypot(x - cx, y - cy)
  return clampEdge(radius - distance)
}

/** A one-pixel feather, which is all the antialiasing an icon needs. */
function clampEdge(signedDistance) {
  return Math.min(1, Math.max(0, signedDistance + 0.5))
}

function mix(base, top, alpha) {
  return [
    Math.round(base[0] * (1 - alpha) + top[0] * alpha),
    Math.round(base[1] * (1 - alpha) + top[1] * alpha),
    Math.round(base[2] * (1 - alpha) + top[2] * alpha),
  ]
}

/**
 * Draws the mark: a stopwatch face on pitch green. The hand points at ten past,
 * which reads as "running" at any size.
 */
function drawIcon(size, { maskable }) {
  const pixels = Buffer.alloc(size * size * 4)
  // A maskable icon must survive a circular crop, so the mark is drawn smaller.
  const pad = maskable ? size * 0.18 : 0
  const inset = maskable ? 0 : size * 0.06
  const radius = maskable ? 0 : size * 0.22

  const cx = size / 2
  const cy = size / 2 + (maskable ? 0 : size * 0.012)
  const faceRadius = (size - pad * 2) * 0.29
  const ringWidth = Math.max(2, size * 0.055)
  const stemWidth = Math.max(2, size * 0.05)
  const stemHeight = (size - pad * 2) * 0.075
  const handLength = faceRadius * 0.62
  const handWidth = Math.max(2, size * 0.045)

  // Hand angle: ten past, measured clockwise from twelve.
  const angle = (Math.PI * 2 * 10) / 60
  const handX = cx + Math.sin(angle) * handLength
  const handY = cy - Math.cos(angle) * handLength

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5
      const py = y + 0.5

      let rgb = PITCH
      let alpha = maskable ? 1 : roundedSquareAlpha(px, py, size, inset, radius)

      // Stopwatch stem, drawn before the face so the face sits on top.
      const stemTop = cy - faceRadius - stemHeight
      if (
        px > cx - stemWidth / 2 - 0.5 &&
        px < cx + stemWidth / 2 + 0.5 &&
        py > stemTop &&
        py < cy - faceRadius + ringWidth
      ) {
        rgb = mix(rgb, CREAM, 1)
      }

      const distance = Math.hypot(px - cx, py - cy)

      // The ring.
      const ringOuter = clampEdge(faceRadius - distance)
      const ringInner = clampEdge(distance - (faceRadius - ringWidth))
      const ring = Math.min(ringOuter, ringInner)
      if (ring > 0) rgb = mix(rgb, CREAM, ring)

      // The hand, as a capsule from the centre outwards.
      const hand = clampEdge(handWidth / 2 - distanceToSegment(px, py, cx, cy, handX, handY))
      if (hand > 0) rgb = mix(rgb, CREAM, hand)

      // The pivot dot, in the action orange so the mark has one warm note.
      const pivot = clampEdge(handWidth * 0.85 - distance)
      if (pivot > 0) rgb = mix(rgb, ORANGE, pivot)

      const index = (y * size + x) * 4
      pixels[index] = rgb[0]
      pixels[index + 1] = rgb[1]
      pixels[index + 2] = rgb[2]
      pixels[index + 3] = Math.round(alpha * 255)
    }
  }

  return pixels
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / lengthSquared))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

// --- Minimal PNG encoder ---------------------------------------------------

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData))
  return Buffer.concat([length, typeAndData, crc])
}

function encodePng(size, pixels) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // truecolour with alpha
  header[10] = 0
  header[11] = 0
  header[12] = 0

  // One filter byte per scanline; filter 0 means "no filtering".
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const targets = [
  { file: 'public/icon-192.png', size: 192, maskable: false },
  { file: 'public/icon-512.png', size: 512, maskable: false },
  { file: 'public/icon-maskable-512.png', size: 512, maskable: true },
  { file: 'public/apple-touch-icon.png', size: 180, maskable: false },
]

for (const target of targets) {
  const pixels = drawIcon(target.size, { maskable: target.maskable })
  writeFileSync(target.file, encodePng(target.size, pixels))
  console.log(`wrote ${target.file} (${target.size}×${target.size})`)
}

// The favicon is the same mark, as vector, for desktop tabs.
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#1B6B3A"/>
  <rect x="29" y="10" width="6" height="8" rx="2" fill="#F7F6F1"/>
  <circle cx="32" cy="37" r="18" fill="none" stroke="#F7F6F1" stroke-width="5"/>
  <path d="M32 37L41 31" stroke="#F7F6F1" stroke-width="5" stroke-linecap="round"/>
  <circle cx="32" cy="37" r="3.6" fill="#E8641B"/>
</svg>
`
writeFileSync('public/favicon.svg', favicon)
console.log('wrote public/favicon.svg')
