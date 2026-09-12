/**
 * Generates the PWA icons and the iOS launch images.
 *
 * Written by hand rather than pulled from an image library so the repo has no
 * binary assets a contributor cannot regenerate, and no build dependency that
 * only exists to draw one circle. Run with `npm run assets`.
 *
 * This also rewrites the launch image <link> tags in index.html, between the
 * markers there, so the markup can never drift from the files on disk.
 */
import { deflateSync } from 'node:zlib'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'

const PITCH = [0x1b, 0x6b, 0x3a]
const CREAM = [0xf7, 0xf6, 0xf1]
const ORANGE = [0xe8, 0x64, 0x1b]

/** Coverage of a rounded square at a point, for the tile on the launch image. */
function roundedSquareAlpha(x, y, left, top, size, radius) {
  const cx = Math.min(Math.max(x, left + radius), left + size - radius)
  const cy = Math.min(Math.max(y, top + radius), top + size - radius)
  return clampEdge(radius - Math.hypot(x - cx, y - cy))
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
 *
 * Every icon is a full-bleed opaque square with square corners. This matters:
 * iOS composites a home-screen icon's transparent pixels onto black before
 * applying its own rounding, so an icon that rounds its own corners gets a dark
 * ring around it. Both platforms mask the icon themselves; our job is to fill
 * the square and keep the mark inside the safe area.
 *
 * `safeZone` is the fraction of the width kept clear at each edge. A maskable
 * icon can be cropped to a circle, so it needs a wide margin; the plain icons
 * are shown closer to as-drawn and can run nearer the edge.
 */
function drawIcon(size, { safeZone, ground = PITCH, ink = CREAM }) {
  const pixels = Buffer.alloc(size * size * 4)
  const pad = size * safeZone

  const cx = size / 2
  const cy = size / 2
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

      let rgb = ground

      // Stopwatch stem, drawn before the face so the face sits on top.
      const stemTop = cy - faceRadius - stemHeight
      if (
        px > cx - stemWidth / 2 - 0.5 &&
        px < cx + stemWidth / 2 + 0.5 &&
        py > stemTop &&
        py < cy - faceRadius + ringWidth
      ) {
        rgb = mix(rgb, ink, 1)
      }

      const distance = Math.hypot(px - cx, py - cy)

      // The ring.
      const ringOuter = clampEdge(faceRadius - distance)
      const ringInner = clampEdge(distance - (faceRadius - ringWidth))
      const ring = Math.min(ringOuter, ringInner)
      if (ring > 0) rgb = mix(rgb, ink, ring)

      // The hand, as a capsule from the centre outwards.
      const hand = clampEdge(handWidth / 2 - distanceToSegment(px, py, cx, cy, handX, handY))
      if (hand > 0) rgb = mix(rgb, ink, hand)

      // The pivot dot, in the action orange so the mark has one warm note.
      const pivot = clampEdge(handWidth * 0.85 - distance)
      if (pivot > 0) rgb = mix(rgb, ORANGE, pivot)

      const index = (y * size + x) * 4
      pixels[index] = rgb[0]
      pixels[index + 1] = rgb[1]
      pixels[index + 2] = rgb[2]
      pixels[index + 3] = 255
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

function encodePng(width, height, pixels) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // truecolour with alpha
  header[10] = 0
  header[11] = 0
  header[12] = 0

  // One filter byte per scanline; filter 0 means "no filtering". A launch
  // image is mostly one flat colour, so deflate matches whole scanlines
  // against each other and the files stay small despite their dimensions.
  const stride = width * 4 + 1
  const raw = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y += 1) {
    raw[y * stride] = 0
    pixels.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const targets = [
  { file: 'public/icon-192.png', size: 192, safeZone: 0.08 },
  { file: 'public/icon-512.png', size: 512, safeZone: 0.08 },
  { file: 'public/icon-maskable-512.png', size: 512, safeZone: 0.18 },
  // iOS rounds this itself. Full bleed, no transparency, no corner radius.
  { file: 'public/apple-touch-icon.png', size: 180, safeZone: 0.08 },
]

for (const target of targets) {
  const pixels = drawIcon(target.size, { safeZone: target.safeZone })
  writeFileSync(target.file, encodePng(target.size, target.size, pixels))
  console.log(`wrote ${target.file} (${target.size}×${target.size})`)
}

/**
 * The iPhones an iOS launch image can be offered to.
 *
 * Android builds its own splash from the manifest — name, background colour
 * and the 512px icon — so nothing here is needed for it. iOS builds nothing,
 * and shows a blank screen unless handed an image whose media query matches
 * the device exactly: CSS size, pixel ratio and orientation all have to line
 * up or it is ignored. Hence the table.
 *
 * A device missing from this list is no worse off than before: it gets the
 * blank launch it already had.
 */
const IPHONES = [
  { w: 320, h: 568, scale: 2, name: 'SE (1st gen)' },
  { w: 375, h: 667, scale: 2, name: '8, SE (2nd and 3rd gen)' },
  { w: 414, h: 736, scale: 3, name: '8 Plus' },
  { w: 375, h: 812, scale: 3, name: 'X, XS, 11 Pro' },
  { w: 414, h: 896, scale: 2, name: 'XR, 11' },
  { w: 414, h: 896, scale: 3, name: 'XS Max, 11 Pro Max' },
  { w: 360, h: 780, scale: 3, name: '12 mini, 13 mini' },
  { w: 390, h: 844, scale: 3, name: '12, 13, 14' },
  { w: 428, h: 926, scale: 3, name: '12 Pro Max, 13 Pro Max, 14 Plus' },
  { w: 393, h: 852, scale: 3, name: '14 Pro, 15, 16' },
  { w: 430, h: 932, scale: 3, name: '14 Pro Max, 15 Plus, 16 Plus' },
  { w: 402, h: 874, scale: 3, name: '16 Pro, 17 Pro' },
  { w: 440, h: 956, scale: 3, name: '16 Pro Max, 17 Pro Max' },
]

/**
 * The launch image: the app's own icon, on the app's own background.
 *
 * Deliberately the same mark the coach just tapped, on the same cream the
 * first screen paints, so the handover from home screen to app has nothing
 * in it that blinks or changes colour.
 */
function drawSplash(width, height, scale) {
  const pixels = Buffer.alloc(width * height * 4)
  for (let i = 0; i < width * height; i += 1) {
    pixels[i * 4] = CREAM[0]
    pixels[i * 4 + 1] = CREAM[1]
    pixels[i * 4 + 2] = CREAM[2]
    pixels[i * 4 + 3] = 255
  }

  // A tile a shade larger than the home screen icon, centred.
  const tile = Math.round(Math.min(width, height) * 0.26)
  const left = Math.round((width - tile) / 2)
  const top = Math.round((height - tile) / 2)
  const radius = tile * 0.225
  const mark = drawIcon(tile, { safeZone: 0.08 })

  for (let y = 0; y < tile; y += 1) {
    for (let x = 0; x < tile; x += 1) {
      const alpha = roundedSquareAlpha(x + 0.5, y + 0.5, 0, 0, tile, radius)
      if (alpha <= 0) continue
      const from = (y * tile + x) * 4
      const to = ((top + y) * width + (left + x)) * 4
      const blended = mix(
        [pixels[to], pixels[to + 1], pixels[to + 2]],
        [mark[from], mark[from + 1], mark[from + 2]],
        alpha,
      )
      pixels[to] = blended[0]
      pixels[to + 1] = blended[1]
      pixels[to + 2] = blended[2]
    }
  }

  return pixels
}

mkdirSync('public/splash', { recursive: true })

const links = []
let splashBytes = 0
for (const phone of IPHONES) {
  const width = phone.w * phone.scale
  const height = phone.h * phone.scale
  const file = `splash-${width}x${height}.png`
  const png = encodePng(width, height, drawSplash(width, height, phone.scale))
  writeFileSync(`public/splash/${file}`, png)
  splashBytes += png.length
  links.push(
    `    <link
` +
      `      rel="apple-touch-startup-image"
` +
      `      media="screen and (device-width: ${phone.w}px) and (device-height: ${phone.h}px) and (-webkit-device-pixel-ratio: ${phone.scale}) and (orientation: portrait)"
` +
      `      href="/splash/${file}"
` +
      `    />`,
  )
}
console.log(
  `wrote ${IPHONES.length} launch images to public/splash (${(splashBytes / 1024).toFixed(0)} KiB total)`,
)

// Keep the markup in step with the files, so the two cannot drift apart.
const START = '    <!-- launch-images:start -->'
const END = '    <!-- launch-images:end -->'
const html = readFileSync('index.html', 'utf8')
const before = html.slice(0, html.indexOf(START) + START.length)
const after = html.slice(html.indexOf(END))
writeFileSync('index.html', `${before}\n${links.join('\n')}\n${after}`)
console.log('rewrote the launch image links in index.html')

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
