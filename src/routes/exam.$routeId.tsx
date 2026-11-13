import { createFileRoute, notFound } from '@tanstack/react-router'
import { z } from 'zod'
import { routeIdSchema } from '@/features/content/schema'
import { MapWorkspace } from '@/features/exam/map/workspace'

export const Route = createFileRoute('/exam/$routeId')({
  validateSearch: z.object({ seed: z.coerce.number().int().min(0).max(0xffffffff).optional(), mode: z.enum(['practice', 'assessment']).optional() }),
  beforeLoad: ({ params }) => { if (!routeIdSchema.safeParse(params.routeId).success) throw notFound() },
  component: ExamRoute,
})
function ExamRoute() {
  const { routeId } = Route.useParams()
  const { seed, mode } = Route.useSearch()
  return <MapWorkspace key={`${routeId}-${seed ?? 'random'}-${mode ?? 'practice'}`} routeId={routeIdSchema.parse(routeId)} initialSeed={seed} initialMode={mode} />
}
