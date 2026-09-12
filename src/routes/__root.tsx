import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'

export interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  notFoundComponent: NotFound,
})

function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col items-center justify-center gap-4 px-8 text-center">
      <p className="cond text-[26px] font-bold">That page has wandered off</p>
      <p className="text-[15px] text-muted">
        Nothing is lost. Your teams and games are still on this phone.
      </p>
      <a
        href="/"
        className="press flex h-14 items-center justify-center rounded-2xl bg-pitch px-6 font-bold text-white no-underline"
      >
        Back to my teams
      </a>
    </div>
  )
}
