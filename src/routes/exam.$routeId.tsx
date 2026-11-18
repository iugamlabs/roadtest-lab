import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { routeIdSchema } from '@/features/content/schema'

export const Route = createFileRoute('/exam/$routeId')({
  validateSearch: z.object({ seed: z.coerce.number().int().min(0).max(0xffffffff).optional(), mode: z.enum(['practice', 'assessment']).optional() }),
  beforeLoad: ({ params }) => {
    const routeId = routeIdSchema.safeParse(params.routeId)
    if (!routeId.success) throw notFound()
    throw redirect({ to: '/memory/$routeId', params: { routeId: routeId.data } })
  },
})
