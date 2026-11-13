import { createHash } from 'node:crypto'
import { routeCalibrationSchema, isPracticeReady, isExamReady } from '../../src/features/content/schema.ts'

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
export const stamp = ms => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${(ms / 1000 % 60).toFixed(3).padStart(6, '0')}`

/** Validate all provenance before generating files. No missing command is guessed. */
export function validateCalibration(input, subtitles, subtitleBytes, media) {
  const doc = routeCalibrationSchema.parse(input)
  if (doc.routeId !== subtitles.routeId || doc.routeId !== media.routeId) throw new Error('路线不一致')
  if (doc.videoSha256 !== media.sha256) throw new Error('视频指纹已变化，请重新校准')
  if (doc.subtitleSha256 !== sha256(subtitleBytes)) throw new Error('字幕已变化，请重新核对来源后更新指纹')
  const cues = new Map(subtitles.cues.map(cue => [cue.id, cue]))
  const ids = new Set()
  const bounded = ms => Number.isInteger(ms) && ms >= 0 && ms < media.durationMs
  const requireCues = list => {
    if (new Set(list).size !== list.length || list.some(id => !cues.has(id))) throw new Error('来源字幕缺失或重复')
  }
  for (const event of doc.events) {
    if (!event.id.startsWith(`${doc.routeId}-`) || ids.has(event.id)) throw new Error('事件 ID 重复或路线不一致')
    ids.add(event.id)
    requireCues(event.sourceCueIds)
    requireCues(event.instructionCueIds)
    if (event.instructionCueIds.some(id => !event.sourceCueIds.includes(id))) throw new Error('口令来源必须包含在事件来源中')
    if (![event.windowStartMs, event.windowEndMs, event.practicePauseMs, ...event.evidence.map(frame => frame.atMs)].every(bounded)) throw new Error('事件或画面时间超出视频')
    if (event.instructionMs !== null && (!bounded(event.instructionMs) || event.instructionMs !== cues.get(event.instructionCueIds[0]).startMs)) throw new Error('ASR 口令时间与来源不一致')
    if (event.timingStatus === 'visual-reviewed' && !event.evidence.some(frame => frame.atMs <= event.windowStartMs)) throw new Error('缺少动作开始位置的画面依据')
    if (event.timingStatus === 'visual-reviewed' && !event.evidence.some(frame => frame.atMs >= event.windowEndMs)) throw new Error('缺少动作结束位置的画面依据')
  }
  for (const item of [...doc.annotations, ...doc.issues]) {
    if (ids.has(item.id)) throw new Error('标注 ID 重复')
    ids.add(item.id)
    if (!bounded(item.startMs) || !bounded(item.endMs) || item.endMs <= item.startMs) throw new Error('标注时间超出视频或逆序')
    if ('sourceCueIds' in item) requireCues(item.sourceCueIds)
  }
  // All automatically identified command candidates must have a disposition.
  for (const cue of subtitles.cues.filter(cue => cue.contentKind === 'instruction-candidate')) {
    if (!doc.events.some(event => event.instructionCueIds.includes(cue.id))) throw new Error(`口令候选未处理：${cue.id}`)
  }
  return doc
}

export function publishCalibration(doc) {
  return {
    version: 1, routeId: doc.routeId, reviewScope: doc.reviewScope,
    videoSha256: doc.videoSha256, subtitleSha256: doc.subtitleSha256,
    events: doc.events.filter(isPracticeReady).sort((a, b) => a.practicePauseMs - b.practicePauseMs),
    excludedEventIds: doc.events.filter(event => !isPracticeReady(event)).map(event => event.id),
    examEvents: doc.events.filter(isExamReady),
  }
}

// Integer-second frames retain source timestamps; clamp at the last decoded second.
export function evidenceSeconds(event, durationMs) {
  const last = Math.floor((durationMs - 1) / 1000)
  return [...new Set([
    event.windowStartMs / 1000 - 2, event.windowStartMs / 1000, event.windowStartMs / 1000 + 2,
    event.windowEndMs / 1000 - 2, event.windowEndMs / 1000, event.windowEndMs / 1000 + 2,
  ].map(value => Math.max(0, Math.min(last, Math.round(value)))))].sort((a, b) => a - b)
}
