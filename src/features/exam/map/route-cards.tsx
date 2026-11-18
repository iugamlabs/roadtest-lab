import { Link } from '@tanstack/react-router'
import { Lightbulb, Play } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { scenarioRoutes } from '../routes'
import { pathData, roadRects } from './geometry'
import { mapRoute } from './routes'

export function MapRouteCards({ showDescription = false, destination = 'memory' }: { showDescription?: boolean; destination?: 'video' | 'memory' }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-4">
      {scenarioRoutes.map(route => {
        const world = mapRoute(route.id)
        return (
          <Card key={route.id} role="group" aria-labelledby={`route-card-${route.id}`} className="@container/route-card min-w-0 gap-4 py-4">
            <CardHeader className="px-4">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-xl"><h2 id={`route-card-${route.id}`}>{route.name}</h2></CardTitle>
              </div>
              {showDescription && <CardDescription className="text-base leading-relaxed">{route.description}</CardDescription>}
            </CardHeader>
            <CardContent className="prototype-workspace flex-1 space-y-3 px-4">
              <div className="map-route-thumbnail overflow-hidden rounded-md border bg-muted/20">
                <svg viewBox="0 0 1070 1900" className="h-44 w-full" role="img" aria-label={`${route.name}行驶轨迹示意`}>
                  {roadRects.map((road, i) => <rect key={i} x={road.x} y={road.y} width={road.width} height={road.height} fill="var(--border)" />)}
                  <path d={pathData(world.trace)} fill="none" stroke="var(--prototype-car)" strokeWidth="15" />
                  <circle cx={world.trace[0].x} cy={world.trace[0].y} r="26" fill="var(--prototype-stop)" />
                  <circle cx={world.trace.at(-1)!.x} cy={world.trace.at(-1)!.y} r="26" fill="var(--prototype-go)" />
                </svg>
              </div>
              <div className="flex flex-wrap gap-2">
                {route.highlights.map(item => <Badge key={item} variant="secondary" className="text-sm">{item}</Badge>)}
              </div>
            </CardContent>
            {destination === 'video' ? <CardFooter className="px-4">
              <Button asChild className="w-full">
                <Link to="/train/$routeId" params={{ routeId: route.id }}><Play aria-hidden />进入视频练习</Link>
              </Button>
            </CardFooter> : <CardFooter className="px-4">
              <Button asChild className="w-full"><Link to="/memory/$routeId" params={{ routeId: route.id }}><Lightbulb aria-hidden />开始记路线</Link></Button>
            </CardFooter>}
          </Card>
        )
      })}
    </div>
  )
}
