import { createFileRoute, Link } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { eventsQueryOptions, roadRoutes } from '@/features/content/queries'
import { routeIdSchema, type RouteId } from '@/features/content/schema'
import { SimulationWorkspace } from '@/features/exam/simulation/workspace'

export const Route = createFileRoute('/exam/simulation')({
  validateSearch: (search: Record<string, unknown>): { routeId?: RouteId } => ({
    routeId: routeIdSchema.safeParse(search.routeId).data,
  }),
  loaderDeps: ({ search }) => ({ routeId: search.routeId }),
  loader: ({ context, deps }) => deps.routeId ? context.queryClient.ensureQueryData(eventsQueryOptions(deps.routeId)) : undefined,
  pendingComponent: () => <p role="status" className="rounded-lg border p-6">正在准备路线资料…</p>,
  component: SimulationPage,
})

function SimulationPage() {
  const { routeId } = Route.useSearch()
  if (routeId) return <SelectedSimulation key={routeId} routeId={routeId} />

  return <section className="mx-auto max-w-6xl space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Button asChild variant="outline" size="icon" className="size-14 shrink-0">
          <Link to="/" aria-label="返回首页"><ArrowLeft aria-hidden /></Link>
        </Button>
        <h1 className="page-title">科目三流程模拟</h1>
      </div>
      <Badge variant="secondary">C2 自动挡</Badge>
    </header>
    <p className="text-muted-foreground">选择路线，从上车准备练到停车下车。</p>
    <div className="grid gap-3 sm:grid-cols-3">
      {roadRoutes.map(route => <Button key={route.id} asChild variant="outline" className="justify-between">
        <Link to="/exam/simulation" search={{ routeId: route.id }}>{route.name}<ArrowRight aria-hidden /></Link>
      </Button>)}
    </div>
  </section>
}

function SelectedSimulation({ routeId }: { routeId: RouteId }) {
  const { data: source } = useSuspenseQuery(eventsQueryOptions(routeId))
  return <SimulationWorkspace source={source} />
}
