import { useMemo, useState } from 'react'
import { makeCalibration, readCalibration, resolveCalibration, writeCalibration, type EventDocument, type ManualCalibration } from './manual-calibration'

export function useManualCalibration(source: EventDocument, durationMs: number) {
  const [saved, setSaved] = useState(() => readCalibration(source))
  const resolved = useMemo(() => {
    if (!saved.record) return { record: null, events: source.events, message: saved.message }
    try { return { ...resolveCalibration(source, saved.record, durationMs || undefined), message: saved.message } }
    catch (error) { return { record: null, events: source.events, message: error instanceof Error ? error.message : '校准记录未应用。' } }
  }, [source, saved, durationMs])
  const overrides = Object.fromEntries(resolved.record?.entries.map(entry => [entry.eventId, entry.pauseMs]) ?? [])
  function apply(record: ManualCalibration) {
    const validated = resolveCalibration(source, record, durationMs)
    const persisted = writeCalibration(source, validated.record)
    const message = persisted ? '已保存到本机，后续练习会使用这些时间。' : '本次已生效，但浏览器未允许保存。请导出备份。'
    setSaved({ record: validated.record, message })
    return message
  }
  function update(eventId: string, timeMs: number | null) {
    const next = { ...overrides }
    if (timeMs === null) delete next[eventId]
    else next[eventId] = timeMs
    return apply(makeCalibration(source, next, durationMs))
  }
  function restoreAll() { return apply(makeCalibration(source, {}, durationMs)) }
  function importRecord(text: string) {
    let input: unknown
    try { input = JSON.parse(text) } catch { throw new Error('备份文件不是有效的 JSON，请重新选择。') }
    const imported = resolveCalibration(source, input, durationMs)
    return apply(imported.record)
  }
  function exportRecord() { return JSON.stringify(makeCalibration(source, overrides, durationMs), null, 2) + '\n' }
  return { events: resolved.events, overrides, message: resolved.message, update, restoreAll, importRecord, exportRecord }
}
