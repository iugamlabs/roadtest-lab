import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { formatCalibrationTime, parseCalibrationTime, type EventDocument } from './manual-calibration'
import { pauseTimeMs } from './practice-events'
import type { useManualCalibration } from './use-manual-calibration'

const timeFormSchema = z.object({ time: z.string().superRefine((value, ctx) => {
  try { parseCalibrationTime(value) } catch (error) { ctx.addIssue({ code: 'custom', message: (error as Error).message }) }
}) })
type TimeForm = z.infer<typeof timeFormSchema>

export function CalibrationPanel({ source, initialEventId, calibration, durationMs, positionMs, ready, getPositionMs, onSeek, onPause, onClose }: {
  source: EventDocument
  initialEventId: string | null
  calibration: ReturnType<typeof useManualCalibration>
  durationMs: number
  positionMs: number
  ready: boolean
  getPositionMs: () => number
  onSeek: (seconds: number) => void
  onPause: () => void
  onClose: () => void
}) {
  const [selectedId, setSelectedId] = useState(() => source.events.find(event => event.id === initialEventId)?.id ?? source.events[0]?.id ?? '')
  const [message, setMessage] = useState('')
  const [error, setErrorMessage] = useState('')
  const [resetOpen, setResetOpen] = useState(false)
  const [revision, setRevision] = useState(0)
  const selected = calibration.events.find(event => event.id === selectedId)
  const selectedTime = selected ? pauseTimeMs(selected) : 0
  const { register, handleSubmit, reset, setValue, setError, formState: { errors } } = useForm<TimeForm>({ resolver: zodResolver(timeFormSchema), defaultValues: { time: formatCalibrationTime(selectedTime) } })
  useEffect(() => { reset({ time: formatCalibrationTime(selectedTime) }) }, [selectedId, selectedTime, revision, reset])

  function attempt(work: () => string) {
    setErrorMessage('')
    try { onPause(); setMessage(work()); setRevision(value => value + 1) } catch (cause) { setErrorMessage(cause instanceof Error ? cause.message : '操作未完成，请重试。') }
  }
  function seekMs(ms: number) { onSeek(Math.max(0, Math.min(durationMs - 1, ms)) / 1000) }
  function downloadBackup() {
    try {
      const url = URL.createObjectURL(new Blob([calibration.exportRecord()], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url; link.download = `route-${source.routeId}.manual-calibration.json`
      document.body.appendChild(link); link.click(); link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
      setMessage('已导出本路线校准备份。'); setErrorMessage('')
    } catch { setErrorMessage('备份未能导出，请确认浏览器允许下载。') }
  }
  async function importBackup(file: File | undefined) {
    if (!file) return
    if (file.size > 256 * 1024) { setErrorMessage('文件过大，请选择本工具导出的校准备份。'); return }
    try { const text = await file.text(); attempt(() => calibration.importRecord(text)) }
    catch { setErrorMessage('文件无法读取，请重新选择。') }
  }

  return <Card className="min-w-0 gap-0"><CardContent className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">人工校准</h2><Button variant="outline" onClick={onClose}>完成校准</Button></div>
    <p className="muted text-base">选择项目，对照视频找到要暂停的位置，再保存时间。校准时只观看视频，退出后可重新开始练习。</p>
    <div className="space-y-2"><Label htmlFor="calibration-event">选择项目</Label><Select value={selectedId} onValueChange={id => {
      setSelectedId(id); setMessage(''); setErrorMessage('')
      const event = calibration.events.find(value => value.id === id)
      if (event && ready) seekMs(pauseTimeMs(event))
    }}><SelectTrigger id="calibration-event" className="min-h-[56px] w-full min-w-0 text-base [&_[data-slot=select-value]]:min-w-0"><SelectValue /></SelectTrigger><SelectContent position="popper" className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)]">{calibration.events.map((event, index) => <SelectItem key={event.id} value={event.id} className="min-h-11 whitespace-normal text-base">{index + 1}. {event.title}</SelectItem>)}</SelectContent></Select></div>
    {selected && <>
      <p className="text-base tabular-nums">默认时间：{formatCalibrationTime(selected.practicePauseMs)}<br />练习时间：{formatCalibrationTime(selectedTime)}{calibration.overrides[selectedId] !== undefined ? '（人工校准）' : ''}</p>
      <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={!ready} onClick={() => seekMs(selectedTime)}>跳到本项</Button><Button variant="outline" disabled={!ready} onClick={() => seekMs(selectedTime - 5000)}>回看前 5 秒</Button></div>
      <p className="text-base tabular-nums">当前画面：{formatCalibrationTime(positionMs)}</p>
      <div className="grid grid-cols-2 gap-3">{[-1000, -100, 100, 1000].map(offset => <Button key={offset} variant="outline" disabled={!ready} onClick={() => seekMs(getPositionMs() + offset)}>{offset > 0 ? '+' : '−'}{Math.abs(offset) / 1000} 秒</Button>)}</div>
      <form className="space-y-3" onSubmit={handleSubmit(value => {
        setErrorMessage('')
        try {
          onPause()
          setMessage(calibration.update(selectedId, parseCalibrationTime(value.time)))
        } catch (cause) { setError('time', { message: cause instanceof Error ? cause.message : '时间未保存，请重试。' }, { shouldFocus: true }) }
      })}>
        <Label htmlFor="calibration-time">练习暂停时间（分:秒 或秒数）</Label>
        <Input id="calibration-time" className="min-h-[56px] text-base md:text-base" placeholder="03:48.500" disabled={!ready} aria-invalid={Boolean(errors.time)} aria-describedby="calibration-time-help calibration-time-error" {...register('time')} />
        <p id="calibration-time-help" className="muted text-base">例如 03:48.500 或 228.5。时间需在相邻项目之间，并早于视频结尾。</p>
        {errors.time && <p id="calibration-time-error" role="alert" className="text-base text-destructive">{errors.time.message}</p>}
        <div className="flex flex-wrap gap-3"><Button type="button" variant="outline" disabled={!ready} onClick={() => { onPause(); setValue('time', formatCalibrationTime(getPositionMs()), { shouldValidate: true, shouldDirty: true }); setMessage('已填入当前画面时间，点击保存本项后生效。'); setErrorMessage('') }}>使用当前画面时间</Button><Button type="submit" disabled={!ready}>保存本项</Button><Button type="button" variant="outline" disabled={!ready || calibration.overrides[selectedId] === undefined} onClick={() => attempt(() => calibration.update(selectedId, null))}>恢复本项默认</Button></div>
      </form>
    </>}
    {(error || message || calibration.message) && <p role={error ? 'alert' : 'status'} className={`rounded-md border p-3 text-base leading-relaxed ${error ? 'text-destructive' : ''}`}>{error || message || calibration.message}</p>}
    <p className="muted text-base">本路线已调整 {Object.keys(calibration.overrides).length} 项。保存到当前浏览器；换设备前可导出备份。</p>
    <details><summary className="cursor-pointer py-2 text-base">备份与恢复</summary><div className="space-y-4 pt-3">
      <Button variant="outline" disabled={!ready} onClick={downloadBackup}>导出本路线校准</Button>
      <div className="space-y-2"><Label htmlFor="calibration-import">导入本路线备份（替换当前校准）</Label><Input id="calibration-import" type="file" accept=".json,application/json" className="min-h-[56px] text-base md:text-base" disabled={!ready} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void importBackup(file) }} /></div>
      <Dialog open={resetOpen} onOpenChange={setResetOpen}><DialogTrigger asChild><Button variant="outline" disabled={!ready || Object.keys(calibration.overrides).length === 0}>恢复本路线全部默认</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>恢复本路线默认时间？</DialogTitle><DialogDescription className="text-base">这会清除本路线的人工时间。需要保留时，请先导出备份。其他路线不受影响。</DialogDescription></DialogHeader><DialogFooter><DialogClose asChild><Button variant="outline">取消</Button></DialogClose><Button onClick={() => { attempt(calibration.restoreAll); setResetOpen(false) }}>确认恢复</Button></DialogFooter></DialogContent></Dialog>
    </div></details>
  </CardContent></Card>
}
