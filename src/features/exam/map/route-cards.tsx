import { Link } from '@tanstack/react-router'
import { BookOpen, ClipboardCheck, Play } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { scenarioRoutes } from '../routes'
import { pathData, roadRects } from './geometry'
import { mapRoute } from './routes'

export function MapRouteCards({ showDescription = false, destination = 'scenario' }: { showDescription?: boolean; destination?: 'video' | 'scenario' }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-4">
      {scenarioRoutes.map(route => {
        const world = mapRoute(route.id)
        return (
          <Card key={route.id} role="group" aria-labelledby={`route-card-${route.id}`} className="@container/route-card min-w-0 gap-4 py-4">
            <CardHeader className="px-4">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-xl"><h2 id={`route-card-${route.id}`}>{route.name}</h2></CardTitle>
                {destination === 'scenario' && <Badge variant="outline" className="text-sm">{route.scenes.length}项</Badge>}
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
            </CardFooter> : <CardFooter className="grid grid-cols-1 gap-2 px-4 @min-[16rem]/route-card:grid-cols-2">
              <Button asChild className="px-3">
                <Link to="/exam/$routeId" params={{ routeId: route.id }} search={{ mode: 'assessment' }}>
                  <ClipboardCheck aria-hidden />进入考试
                </Link>
              </Button>
              <Button asChild variant="outline" className="px-3">
                <Link to="/exam/$routeId" params={{ routeId: route.id }} search={{ mode: 'practice' }}>
                  <BookOpen aria-hidden />进入练习
                </Link>
              </Button>
            </CardFooter>}
          </Card>
        )
      })}
    </div>
  )
}
