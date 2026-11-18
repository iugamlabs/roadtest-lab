import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/exam/')({ beforeLoad: () => { throw redirect({ to: '/memory' }) } })
