import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, Play, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { RouteMapViewer } from '@/components/route-map'
import type { RouteId } from '../content/schema'
import { scenarioRoute } from './routes'
import { BrowserSpeech } from './speech'
import { examSettingsSchema, SETTINGS_KEY } from './storage'
import { newSeed } from './use-exam'
import { ExamRun } from './exam-run'
import { ExamRules } from './rules'

const setupSchema = z.object({ seed: z.string().regex(/^\d{1,10}$/, '请输入0–4294967295之间的场景编号').refine(value => Number(value) <= 0xffffffff, '场景编号不能大于4294967295'), voice: z.boolean() })
type Setup = z.infer<typeof setupSchema>
function readVoiceSetting() {
  try { return examSettingsSchema.parse(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{"voice":true}')).voice } catch { return true }
}
export function ExamWorkspace({ routeId, initialSeed }: { routeId: RouteId; initialSeed?: number }) {
  const route = scenarioRoute(routeId)
  const [run, setRun] = useState<{ key: string; seed: number; voice: boolean; single?: string } | null>(null)
  const [trial, setTrial] = useState('')
  const stopTrial = useRef<(() => void) | null>(null)
  const form = useForm<Setup>({ resolver: zodResolver(setupSchema), defaultValues: { seed: String(initialSeed ?? newSeed()), voice: readVoiceSetting() } })
  useEffect(() => () => stopTrial.current?.(), [])
  const begin = (settings: Setup) => {
    stopTrial.current?.()
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ voice: settings.voice })) } catch { /* session remains usable */ }
    setRun({ key: crypto.randomUUID(), seed: Number(settings.seed), voice: settings.voice })
  }
  const restart = (seed: number, single?: string) => { if (run) setRun({ ...run, seed, single, key: crypto.randomUUID() }) }
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><Button asChild variant="outline" size="icon" className="size-[56px] shrink-0" aria-label="返回考试路线选择"><Link to="/exam"><ArrowLeft aria-hidden /></Link></Button><div><h1 className="page-title">{route.name} · {run?.single ? '单项演练' : '场景考试'}</h1>{!run && <p className="mt-1 text-base text-muted-foreground">自动行驶 · 只操作关键动作</p>}</div></div><Badge variant="outline">C2 · 教学评分</Badge></div>
    {run ? <ExamRun key={run.key} routeId={routeId} seed={run.seed} voice={run.voice} single={run.single} onRetry={() => restart(run.seed, run.single)} onNew={() => restart(newSeed())} onPractice={id => restart(run.seed, id)} onSetup={() => setRun(null)} /> : <div className="grid items-start gap-5 xl:grid-cols-[1.1fr_1fr]">
      <form onSubmit={form.handleSubmit(begin)} className="space-y-5 rounded-lg border p-5" aria-label="考试设置">
        <div><h2 className="text-xl font-semibold">准备开始</h2><p className="mt-2 text-base leading-relaxed text-muted-foreground">按{route.name}的项目顺序行驶，在路口、变道等位置遇到不同交通情况。你的停车、等待和变道会改变场景结果。</p></div>
        <div className="flex flex-wrap gap-2">{route.highlights.map(item => <Badge key={item} variant="secondary">{item}</Badge>)}</div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-y py-4"><div><Label htmlFor="exam-voice">考试语音播报</Label><p className="mt-1 text-base text-muted-foreground">口令同步显示文字，无口令路段自行观察。</p></div><Controller name="voice" control={form.control} render={({ field }) => <Switch id="exam-voice" checked={field.value} onCheckedChange={field.onChange} />} /></div>
        <div className="flex flex-wrap items-center gap-3"><Button type="button" variant="outline" onClick={() => {
          stopTrial.current?.(); setTrial('正在试听…')
          stopTrial.current = new BrowserSpeech().speak('前方路口右转。请根据道路情况安全行驶。', { end: () => setTrial('试听完成。'), error: () => setTrial('当前没有可用的中文语音。可关闭语音，使用文字口令考试。') })
        }}><Volume2 aria-hidden />试听考试语音</Button><p className="text-base text-muted-foreground" role="status">{trial}</p></div>
        <div><Label htmlFor="exam-seed">场景编号</Label><div className="mt-2 flex gap-2"><Input id="exam-seed" inputMode="numeric" aria-invalid={!!form.formState.errors.seed} aria-describedby={form.formState.errors.seed ? 'seed-error' : 'seed-help'} {...form.register('seed')} /><Button type="button" variant="outline" onClick={() => form.setValue('seed', String(newSeed()), { shouldValidate: true })}>换一组</Button></div>{form.formState.errors.seed ? <p id="seed-error" role="alert" className="mt-2 text-base text-destructive">{form.formState.errors.seed.message}</p> : <p id="seed-help" className="mt-2 text-base text-muted-foreground">相同编号可重现同一组交通情况。</p>}</div>
        <Button type="submit" className="w-full"><Play aria-hidden />开始考试 · {route.scenes.length}项</Button>
        <p className="text-base text-muted-foreground">满分100分，低于90分立即结束；完成路线且达到90分合格。</p>
      </form>
      <div className="space-y-4"><ExamRules /><details className="rounded-lg border p-4"><summary className="cursor-pointer font-semibold">查看路线项目（{route.scenes.length}项）</summary><ol className="mt-3 space-y-2 text-base">{route.scenes.map((scene, index) => <li key={scene.id}>{index + 1}. {scene.title}{scene.category !== 'command' && <span className="text-muted-foreground"> · 自主识别</span>}</li>)}</ol></details><details className="rounded-lg border p-4"><summary className="cursor-pointer font-semibold">对照真实路线图</summary><div className="mt-4"><RouteMapViewer routeId={routeId} name={route.name} /></div></details></div>
    </div>}
  </div>
}
