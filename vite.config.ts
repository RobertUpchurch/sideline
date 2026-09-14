import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
) as { version: string }

/**
 * Which build this is, stamped in at compile time and shown on the about
 * screen.
 *
 * An installed app can be months behind the site it came from, so "which
 * version are you running?" is the first question worth asking when a coach
 * reports something odd — and the only honest answer is one the app can read
 * off itself. Vercel does not ship a `.git` directory, hence the environment
 * variable first.
 */
function buildRef(): string {
  const fromHost = process.env.VERCEL_GIT_COMMIT_SHA
  if (fromHost) return fromHost.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
  } catch {
    return 'local'
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_REF__: JSON.stringify(buildRef()),
  },
  resolve: {
    alias: { '~': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registered by hand in `src/lib/updates.ts`, which needs the
      // registration object to check for a new version when the app comes
      // back to the foreground. Letting the plugin inject its own as well
      // would register the worker twice.
      injectRegister: null,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // iOS reads a launch image before the service worker exists, and
        // caches it when the app is added to the home screen. Precaching a
        // quarter of a megabyte of them would only make the install heavier
        // for a file the worker is never asked for.
        globIgnores: ['splash/**'],
        navigateFallback: 'index.html',
      },
      manifest: {
        name: 'Sideline — youth soccer sub timer',
        short_name: 'Sideline',
        description:
          'Run the game clock and share playing time fairly across your youth soccer team. Works offline, keeps everything on your phone.',
        theme_color: '#1B6B3A',
        background_color: '#F7F6F1',
        display: 'standalone',
        orientation: 'portrait',
        id: '/',
        start_url: '/',
        scope: '/',
        categories: ['sports', 'utilities'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
