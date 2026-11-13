import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { buildReviewedDocument, serializeSrt } from './lib/subtitle-review.mjs'

const root = new URL('../', import.meta.url)
const readJson = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'))
const sources = []
const reviews = []
for (const routeId of ['5', '6', '7']) {
  sources.push(await readJson(`content/subtitle-sources/route-${routeId}.asr.json`))
  sources.push(await readJson(`public/data/route-${routeId}.ocr.json`))
  reviews.push(await readJson(`content/subtitle-reviews/route-${routeId}.json`))
}
// Validate every route and reference before replacing any generated files.
const documents = reviews.map(review => buildReviewedDocument({
  routeId: review.routeId, review, sources,
  asr: sources.find(doc => doc.routeId === review.routeId && doc.source === 'asr'),
  ocr: sources.find(doc => doc.routeId === review.routeId && doc.source === 'ocr'),
}))
await mkdir(new URL('content/subtitles/', root), { recursive: true })
await mkdir(new URL('public/data/', root), { recursive: true })
const report = [
  '# 三条路线字幕文字校对记录', '',
  '由 `pnpm prepare:subtitles` 生成；人工修订位于 `content/subtitle-reviews/`，请在修订文件中修改。', '',
  '前端仅使用一份校对稿：以 ASR 为主、OCR 辅助纠错。ASR 原文快照及修改理由保留在仓库；仅五号线三条清晰的 OCR 漏段补入成稿，OCR 乱码不补写。', '',
  '**本报告复核范围：字幕文字与上下文交叉校对。** `text-reviewed` 不表示独立听音、画面或考规核实；`needs-review` 保留操作信息及显式疑点。后续独立的画面时间校准见 [路线事件校准记录](event-calibration.md)，不在字幕文字状态中混用；正式评分尚未建立。', '',
  '字幕保持视频作者原意，数值、方向及规则不擅自改写。时间戳沿用 ASR，OCR 补段沿用 OCR；两源同时间的文本不保证逐字对应。', '',
]
const time = ms => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${(ms / 1000 % 60).toFixed(3).padStart(6, '0')}`
for (const document of documents) {
  const id = document.routeId
  const review = reviews.find(value => value.routeId === id)
  await writeFile(new URL(`public/data/route-${id}.subtitles.json`, root), JSON.stringify(document, null, 2) + '\n')
  await writeFile(new URL(`content/subtitles/route-${id}.srt`, root), serializeSrt(document.cues))
  report.push(`## ${id} 号线`, '', `ASR ${document.summary.asrCueCount} 条；修订 ${document.summary.correctionCount} 条；OCR 补段 ${document.summary.supplementCount} 条；成稿 ${document.cues.length} 条。`, '',
    '### 文字修订与补段', '', '| 时间 | 来源 | 原文 | 成稿 | 理由 |', '| --- | --- | --- | --- | --- |')
  for (const cue of document.cues.filter(cue => cue.correctedText !== null)) {
    report.push(`| ${time(cue.startMs)} | ${cue.source}-${cue.sourceCueId} | ${cue.rawText} | ${cue.correctedText} | ${cue.editReason} |`)
  }
  report.push('', '### 重点回看项', '')
  for (const issue of review.issues) {
    const cue = document.cues.find(value => value.id === `asr-${issue.cueIds[0]}`)
    report.push(`- ${time(cue.startMs)}（ASR ${issue.cueIds.join('、')}）：${issue.reason}`)
  }
  report.push('', `仅在 OCR 有时间覆盖的条目：${document.summary.unmatchedOcrCueIds.join('、') || '无'}。这只是时间覆盖诊断；其中可能是无声画面提示、乱码或 ASR 漏识别，原文仍保留，不自动转成事件。`, '',
    '### 独立口令形式的候选定位', '', '以下只作回看索引。ASR 未区分考试播报与教练复述，不能直接作为考试事件或操作触发时间。', '', '| ASR 时间 | 字幕 | 来源 |', '| --- | --- | --- |')
  for (const cue of document.cues.filter(cue => cue.contentKind === 'instruction-candidate')) report.push(`| ${time(cue.startMs)} | ${cue.correctedText ?? cue.rawText} | ${cue.id} |`)
  report.push('')
  console.log(`${id} 号线：生成 ${document.cues.length} 条成稿，${document.summary.correctionCount} 条修订，${document.summary.supplementCount} 条补段。`)
}
await writeFile(new URL('docs/subtitle-review.md', root), report.join('\n').trimEnd() + '\n')
