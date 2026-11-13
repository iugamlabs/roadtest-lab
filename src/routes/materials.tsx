import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { RouteId } from '@/features/content/schema'
import { formatTime, roadRoutes, subtitlesQueryOptions } from '@/features/content/queries'

export const Route = createFileRoute('/materials')({ component: MaterialsPage })
function MaterialsPage() {
  const [routeId, setRouteId] = useState<RouteId>('5')
  const [search, setSearch] = useState('')
  const query = useQuery(subtitlesQueryOptions(routeId))
  const filteredCues = query.data?.cues.filter(cue => cue.rawText.includes(search)) ?? []
  return <>
    <p className="eyebrow mb-3">看清原文，再核对</p><h1 className="page-title">路线资料</h1><p className="muted mb-7 mt-3">已整理三条路线的原始 OCR 字幕。语音转写加入后，再按时间对照校正。</p>
    <div className="mb-6 flex flex-wrap gap-3" role="group" aria-label="选择字幕路线">{roadRoutes.map(route => <Button key={route.id} aria-pressed={routeId === route.id} variant={routeId === route.id ? 'default' : 'outline'} onClick={() => { setRouteId(route.id); setSearch('') }}>{route.name}</Button>)}</div>
    <section className="panel">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">{roadRoutes.find(route => route.id === routeId)?.name} · OCR 原文</h2><span className="rounded-full bg-secondary px-3 py-2 text-sm">{query.data ? `${query.data.cues.length} 条 · 尚未校对` : '正在读取'}</span></div>
      <label className="mb-5 grid gap-2 text-base">搜索字幕内容<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="例如：变更车道、靠边停车" className="rounded-xl border border-input p-3" /></label>
      {query.isPending && <p role="status" className="muted">正在读取字幕…</p>}
      {query.isError && <div role="alert"><p className="muted mb-3">字幕暂时无法读取。</p><Button variant="outline" onClick={() => query.refetch()}>重新加载</Button></div>}
      {query.isSuccess && <><p className="muted mb-3 text-sm">共找到 {filteredCues.length} 条。时间为字幕出现时间，尚未确认为操作触发时间。</p><ol className="max-h-[650px] overflow-y-auto" aria-label="字幕原文列表">{filteredCues.map(cue => <li key={cue.id} className="grid gap-2 border-t border-border py-4 md:grid-cols-[140px_1fr]"><span className="text-base tabular-nums text-muted-foreground">{formatTime(cue.startMs / 1000)}–{formatTime(cue.endMs / 1000)}</span><p className="whitespace-pre-line text-base leading-relaxed">{cue.rawText}</p></li>)}</ol></>}
    </section>
  </>
}
