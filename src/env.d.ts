/**
 * Build-time constants, substituted by Vite. See `define` in vite.config.ts.
 *
 * `declare global` rather than a bare `declare const`: every file under `src`
 * is treated as a module (`moduleDetection: force`), and a declaration in a
 * module is local to it.
 */
declare global {
  const __APP_VERSION__: string
  const __BUILD_REF__: string
}

export {}
