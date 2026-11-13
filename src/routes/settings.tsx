import { createFileRoute, redirect } from '@tanstack/react-router'

// Preserve saved bookmarks after moving settings into the route player.
export const Route = createFileRoute('/settings')({ beforeLoad: () => { throw redirect({ to: '/train', replace: true }) } })
