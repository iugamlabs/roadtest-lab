import { createFileRoute, notFound } from '@tanstack/react-router'
import { z } from 'zod'
import { routeIdSchema } from '@/features/content/schema'
import { ExamWorkspace } from '@/features/exam/workspace'

export const Route = createFileRoute('/exam/legacy/$routeId')({
  validateSearch: z.object({ seed: z.coerce.number().int().min(0).max(0xffffffff).optional() }),
  beforeLoad: ({ params }) => { if (!routeIdSchema.safeParse(params.routeId).success) throw notFound() },
  component: LegacyRoute,
})
function LegacyRoute() {
  const { routeId } = Route.useParams()
  const { seed } = Route.useSearch()
  return <ExamWorkspace key={`${routeId}-${seed ?? 'random'}`} routeId={routeIdSchema.parse(routeId)} initialSeed={seed} />
}
