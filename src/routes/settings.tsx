import { createFileRoute } from '@tanstack/react-router'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import { defaultSettings, settingsSchema, useSettings, type Settings } from '@/features/settings/settings'

export const Route = createFileRoute('/settings')({ component: SettingsPage })
function SettingsPage() {
  const { settings, save } = useSettings()
  const [message, setMessage] = useState('')
  const { register, control, handleSubmit, reset, formState: { errors } } = useForm<Settings>({ resolver: zodResolver(settingsSchema), defaultValues: settings })
  return <div className="max-w-3xl"><h1 className="page-title mb-2">学习设置</h1><p className="muted mb-6">设置保存在这台设备的浏览器中。</p>
    <Card><CardContent><form onSubmit={handleSubmit(value => setMessage(save(value) ? '已保存，下次练习会继续使用。' : '已在本次使用中生效，浏览器未允许保存设置。'))}>
      <div className="form-field"><Label htmlFor="playback-rate">默认播放速度</Label><NativeSelect id="playback-rate" {...register('playbackRate')}><NativeSelectOption value="0.75">慢一点 · 0.75 倍</NativeSelectOption><NativeSelectOption value="1">正常速度 · 1 倍</NativeSelectOption><NativeSelectOption value="1.25">快一点 · 1.25 倍</NativeSelectOption></NativeSelect></div>
      <div className="form-field !flex items-center justify-between gap-4"><Label htmlFor="original-audio" className="min-h-11 flex-1">播放视频原声与教练讲解</Label><Controller name="originalAudio" control={control} render={({ field }) => <Switch id="original-audio" checked={field.value} onCheckedChange={field.onChange} onBlur={field.onBlur} ref={field.ref} />} /></div>
      <div className="form-field !flex items-center justify-between gap-4"><Label htmlFor="blur-subtitles" className="min-h-11 flex-1">默认模糊视频中的字幕区域</Label><Controller name="blurSubtitles" control={control} render={({ field }) => <Switch id="blur-subtitles" checked={field.value} onCheckedChange={field.onChange} onBlur={field.onBlur} ref={field.ref} />} /></div>
      <p className="muted mt-3 text-base">可以在练习页面对照视频调整遮罩位置，避免遮挡路面信息。</p>
      <div className="form-field"><Label htmlFor="mask-top">遮罩顶部位置（%）</Label><Input id="mask-top" type="number" min={0} max={90} aria-invalid={Boolean(errors.maskTop)} aria-describedby={errors.maskTop ? 'mask-top-error' : undefined} {...register('maskTop', { valueAsNumber: true })} />{errors.maskTop && <span id="mask-top-error" role="alert" className="text-destructive">请输入 0–90 之间的数值。</span>}</div>
      <div className="form-field"><Label htmlFor="mask-height">遮罩高度（%）</Label><Input id="mask-height" type="number" min={5} max={40} aria-invalid={Boolean(errors.maskHeight)} aria-describedby={errors.maskHeight ? 'mask-height-error' : undefined} {...register('maskHeight', { valueAsNumber: true })} />{errors.maskHeight && <span id="mask-height-error" role="alert" className="text-destructive">{errors.maskHeight.message}</span>}</div>
      <div className="mt-6 flex flex-wrap gap-3"><Button type="submit">保存设置</Button><Button type="button" variant="outline" onClick={() => { reset(defaultSettings); setMessage('已填入默认设置，点击保存后生效。') }}>恢复默认</Button></div>
      <p role="status" className="muted mt-4">{message}</p>
    </form></CardContent></Card>
  </div>
}
