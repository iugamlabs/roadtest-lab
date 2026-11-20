import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { eventsQueryOptions, subtitlesQueryOptions } from '@/features/content/queries'
import { routeIdSchema } from '@/features/content/schema'
import { MemoryWorkspace } from '@/features/memory/workspace'

export const Route = createFileRoute('/memory/$routeId')({
  validateSearch: (search: Record<string, unknown>): { quiz?: true; course?: true } => ({
    quiz: search.quiz === true ? true : undefined,
    course: search.course === true ? true : undefined,
  }),
  beforeLoad: ({ params, search }) => {
    const route = routeIdSchema.safeParse(params.routeId)
    if (!route.success) throw notFound()
    if (search.course) throw redirect({ to: '/exam/simulation', search: { routeId: route.data }, replace: true })
  },
  loader: ({ context, params }) => Promise.all([
    context.queryClient.ensureQueryData(eventsQueryOptions(routeIdSchema.parse(params.routeId))),
    context.queryClient.ensureQueryData(subtitlesQueryOptions(routeIdSchema.parse(params.routeId))),
  ]),
  pendingComponent: () => <p role="status" className="rounded-lg border p-6">正在准备路线资料…</p>,
  component: MemoryPage,
})

function MemoryPage() {
  const id = routeIdSchema.parse(Route.useParams().routeId)
  const { quiz } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data: source } = useSuspenseQuery(eventsQueryOptions(id))
  const { data: subtitles } = useSuspenseQuery(subtitlesQueryOptions(id))
  return <MemoryWorkspace key={`${id}:${quiz ? 'quiz' : 'study'}`} source={source} subtitles={subtitles}
    closeDirectQuiz={quiz ? () => void navigate({ search: {}, replace: true }) : undefined} />
}
