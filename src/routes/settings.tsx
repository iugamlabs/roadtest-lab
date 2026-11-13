import { createFileRoute } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { defaultSettings, settingsSchema, useSettings, type Settings } from '@/features/settings/settings'

export const Route = createFileRoute('/settings')({ component: SettingsPage })
function SettingsPage() {
  const { settings, save } = useSettings()
  const [message, setMessage] = useState('')
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Settings>({ resolver: zodResolver(settingsSchema), defaultValues: settings })
  return <div className="max-w-3xl"><p className="eyebrow mb-3">按你的习惯调整</p><h1 className="page-title mb-3">学习设置</h1><p className="muted mb-7">设置保存在这台设备的浏览器中。</p>
    <form className="panel" onSubmit={handleSubmit(value => setMessage(save(value) ? '已保存，下次练习会继续使用。' : '已在本次使用中生效，浏览器未允许保存设置。'))}>
      <label className="form-field">默认播放速度<select {...register('playbackRate')}><option value="0.75">慢一点 · 0.75 倍</option><option value="1">正常速度 · 1 倍</option><option value="1.25">快一点 · 1.25 倍</option></select></label>
      <label className="form-field !flex items-center gap-3"><input type="checkbox" {...register('originalAudio')} />播放视频原声与教练讲解</label>
      <label className="form-field !flex items-center gap-3"><input type="checkbox" {...register('blurSubtitles')} />默认模糊视频中的字幕区域</label>
      <p className="muted mt-3 text-base">遮罩只影响指定区域。可以在练习页面对照视频调整位置，避免遮挡路面信息。</p>
      <label className="form-field">遮罩顶部位置（画面高度的百分比）<input type="number" min={0} max={90} className="rounded-lg border border-input p-3" aria-invalid={Boolean(errors.maskTop)} aria-describedby={errors.maskTop ? 'mask-top-error' : undefined} {...register('maskTop', { valueAsNumber: true })} />{errors.maskTop && <span id="mask-top-error" role="alert" className="text-destructive">请输入 0–90 之间的数值。</span>}</label>
      <label className="form-field">遮罩高度（画面高度的百分比）<input type="number" min={5} max={40} className="rounded-lg border border-input p-3" aria-invalid={Boolean(errors.maskHeight)} aria-describedby={errors.maskHeight ? 'mask-height-error' : undefined} {...register('maskHeight', { valueAsNumber: true })} />{errors.maskHeight && <span id="mask-height-error" role="alert" className="text-destructive">{errors.maskHeight.message}</span>}</label>
      <div className="mt-6 flex flex-wrap gap-3"><Button type="submit">保存设置</Button><Button type="button" variant="outline" onClick={() => { reset(defaultSettings); setMessage('已填入默认设置，点击保存后生效。') }}>恢复默认</Button></div>
      <p role="status" className="muted mt-4">{message}</p>
    </form>
  </div>
}
