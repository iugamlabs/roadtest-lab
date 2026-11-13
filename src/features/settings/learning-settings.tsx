import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { defaultSettings, settingsSchema, useSettings, type Settings } from './settings'

export function LearningSettings() {
  const { settings, save } = useSettings()
  const [message, setMessage] = useState('')
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Settings>({ resolver: zodResolver(settingsSchema), values: settings, resetOptions: { keepDirtyValues: true } })
  function persist(value: Settings) { setMessage(save(value) ? '已生效，并保存到这台设备。' : '本次已生效，浏览器未允许保存设置。') }
  return <div className="space-y-4">
    <div className="flex items-center justify-between gap-4 border-b pb-4"><Label htmlFor="player-audio" className="min-h-14 flex-1 text-base">视频原声与教练讲解</Label><Switch id="player-audio" checked={settings.originalAudio} onCheckedChange={originalAudio => persist({ ...settings, originalAudio })} /></div>
    <div className="flex items-center justify-between gap-4"><Label htmlFor="player-blur" className="min-h-14 flex-1 text-base">模糊视频中的字幕</Label><Switch id="player-blur" checked={settings.blurSubtitles} onCheckedChange={blurSubtitles => persist({ ...settings, blurSubtitles })} /></div>
    <p className="muted text-base">对照左侧视频调整范围，避免遮挡道路标志。教学字幕在视频下方单独显示。</p>
    <form onSubmit={handleSubmit(persist)} className="space-y-4">
      <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="mask-top">顶部位置（%）</Label><Input id="mask-top" type="number" min={0} max={90} aria-invalid={Boolean(errors.maskTop)} aria-describedby="mask-error" {...register('maskTop', { valueAsNumber: true })} /></div><div className="space-y-2"><Label htmlFor="mask-height">遮罩高度（%）</Label><Input id="mask-height" type="number" min={5} max={40} aria-invalid={Boolean(errors.maskHeight)} aria-describedby="mask-error" {...register('maskHeight', { valueAsNumber: true })} /></div></div>
      {(errors.maskTop || errors.maskHeight) && <p id="mask-error" role="alert" className="text-base text-destructive">顶部应在 0–90%，高度在 5–40%，两者之和不超过 100%。</p>}
      <Button type="submit" variant="outline" className="w-full">应用遮罩范围</Button>
    </form>
    <Button variant="ghost" className="w-full" onClick={() => { reset(defaultSettings); persist(defaultSettings) }}>恢复默认学习设置</Button>
    <p role="status" className="text-base text-muted-foreground">{message || '调整后立即生效；关闭面板后，手动继续视频或练习。'}</p>
  </div>
}
