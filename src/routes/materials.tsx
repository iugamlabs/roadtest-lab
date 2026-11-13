import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { subtitleText, type RouteId } from '@/features/content/schema'
import { formatTime, roadRoutes, subtitlesQueryOptions } from '@/features/content/queries'

export const Route = createFileRoute('/materials')({ component: MaterialsPage })
function MaterialsPage() {
  const [routeId, setRouteId] = useState<RouteId>('5')
  const [search, setSearch] = useState('')
  const query = useQuery(subtitlesQueryOptions(routeId))
  const filteredCues = query.data?.cues.filter(cue => subtitleText(cue).includes(search.trim())) ?? []
  return <>
    <h1 className="page-title">路线资料</h1><p className="muted mb-7 mt-3">按路线查看教学字幕，回顾沿途讲解与操作要点。</p>
    <div className="mb-6 flex flex-wrap gap-3" role="group" aria-label="选择字幕路线">{roadRoutes.map(route => <Button key={route.id} aria-pressed={routeId === route.id} variant={routeId === route.id ? 'default' : 'outline'} onClick={() => { setRouteId(route.id); setSearch('') }}>{route.name}</Button>)}</div>
    <Card><CardContent>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">{roadRoutes.find(route => route.id === routeId)?.name} · 教学字幕</h2><Badge variant="secondary">{query.data ? `${query.data.cues.length} 条` : '正在读取'}</Badge></div>
      <div className="mb-5 grid gap-2"><Label htmlFor="subtitle-search">搜索字幕内容</Label><Input id="subtitle-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="例如：变更车道、靠边停车" /></div>
      {query.isPending && <p role="status" className="muted">正在读取字幕…</p>}
      {query.isError && <div role="alert"><p className="muted mb-3">字幕暂时无法读取。</p><Button variant="outline" onClick={() => query.refetch()}>重新加载</Button></div>}
      {query.isSuccess && <><p className="muted mb-3 text-sm" role="status">共找到 {filteredCues.length} 条。时间对应视频中的讲解位置。</p>{filteredCues.length === 0 ? <p className="muted py-5">没有找到相关字幕，请换个词试试。</p> : <ol className="max-h-[650px] overflow-y-auto" aria-label="教学字幕列表">{filteredCues.map(cue => <li key={cue.id} className="grid gap-2 border-t border-border py-4 md:grid-cols-[140px_1fr]"><span className="text-base tabular-nums text-muted-foreground">{formatTime(cue.startMs / 1000)}–{formatTime(cue.endMs / 1000)}</span><p className="whitespace-pre-line text-base leading-relaxed">{subtitleText(cue)}</p></li>)}</ol>}</>}
    </CardContent></Card>
  </>
}
