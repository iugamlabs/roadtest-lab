import { useState } from 'react'
import { Expand, Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { mediaUrl } from '@/features/content/queries'
import type { RouteId } from '@/features/content/schema'

export function RouteMapViewer({ routeId, name }: { routeId: RouteId; name: string }) {
  const [zoom, setZoom] = useState(1)
  const [fit, setFit] = useState(false)
  const [failed, setFailed] = useState(false)
  return <div className="min-w-0 space-y-3">
    <div className="flex flex-wrap items-center gap-2"><Button variant="outline" size="icon" className="size-14" aria-label="缩小路线图" disabled={fit || zoom <= .5} onClick={() => setZoom(value => Math.max(.5, value - .25))}><Minus aria-hidden /></Button><span className="min-w-14 text-center text-base tabular-nums" aria-live="polite">{fit ? '全图' : `${Math.round(zoom * 100)}%`}</span><Button variant="outline" size="icon" className="size-14" aria-label="放大路线图" disabled={!fit && zoom >= 2} onClick={() => { setFit(false); setZoom(value => fit ? 1 : Math.min(2, value + .25)) }}><Plus aria-hidden /></Button><Button variant="outline" onClick={() => { setFit(value => !value); setZoom(1) }}>{fit ? '放大阅读' : '查看全图'}</Button></div>
    <div className="max-h-[60dvh] overflow-auto rounded-md border bg-muted/30" tabIndex={0} role="region" aria-label="可滚动路线图">
      {failed ? <p role="alert" className="p-5">路线图暂时无法显示。</p> : <img src={mediaUrl(routeId, 'jpg')} alt={`${name}完整路线示意图`} className={fit ? 'mx-auto max-h-[58dvh] max-w-full object-contain p-2' : 'block max-w-none p-3'} style={fit ? undefined : { width: `${zoom * 100}%` }} onError={() => setFailed(true)} />}
    </div>
    <p className="text-base text-muted-foreground">上下滚动查看沿途位置；放大后可左右滚动。</p>
  </div>
}

export function RouteMap({ routeId, name }: { routeId: RouteId; name: string }) {
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const src = mediaUrl(routeId, 'jpg')
  return <section className="min-w-0 rounded-lg border" aria-label={`${name}路线图`}>
    <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4"><h2 className="text-xl font-semibold">{name}路线图</h2><Dialog><DialogTrigger asChild><Button variant="outline"><Expand aria-hidden />放大查看</Button></DialogTrigger><DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-[min(94vw,60rem)]"><DialogHeader><DialogTitle>{name}路线图</DialogTitle><DialogDescription>对照路线图熟悉转弯、掉头和停车位置。</DialogDescription></DialogHeader><RouteMapViewer key={routeId} routeId={routeId} name={name} /><DialogFooter><DialogClose asChild><Button variant="outline">关闭路线图</Button></DialogClose></DialogFooter></DialogContent></Dialog></div>
    {failedSource === src ? <div role="alert" className="space-y-3 p-5"><p>路线图暂时无法显示。</p><Button variant="outline" onClick={() => setFailedSource(null)}>重新加载路线图</Button></div> : <img src={src} alt={`${name}路线示意图`} className="mx-auto h-auto max-h-[68dvh] w-full object-contain p-3" onError={() => setFailedSource(src)} />}
  </section>
}
