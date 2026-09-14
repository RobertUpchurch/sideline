import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { watchNavDirection } from '~/lib/nav'
import { keepUpToDate } from '~/lib/updates'
import './styles.css'

/**
 * Everything this app reads comes from IndexedDB on this device, so there is
 * no network latency to hide and nothing to refetch when a window regains
 * focus. Queries stay fresh until a mutation says otherwise.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      gcTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: false,
    },
  },
})

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
  // Screens slide rather than blink. Which way they slide is worked out from
  // the history index — see lib/nav.ts. Where the browser has no view
  // transitions, navigation simply happens with no animation, which is a
  // perfectly good outcome and not worth a polyfill.
  defaultViewTransition: true,
})

watchNavDirection(router)

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

keepUpToDate()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
