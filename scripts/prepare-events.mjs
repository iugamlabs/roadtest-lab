import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { validateCalibration, publishCalibration, stamp } from './lib/calibration.mjs'
import { calibrationMediaSchema, calibratedEventDocumentSchema } from '../src/features/content/schema.ts'

const root = new URL('../', import.meta.url)
const readJson = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'))
const media = calibrationMediaSchema.parse(await readJson('content/event-calibrations/media.json')).media
const docs = []
for (const routeId of ['5', '6', '7']) {
  const bytes = await readFile(new URL(`public/data/route-${routeId}.subtitles.json`, root))
  docs.push(validateCalibration(await readJson(`content/event-calibrations/route-${routeId}.json`), JSON.parse(bytes), bytes, media.find(item => item.routeId === routeId)))
}
// Complete validation first; stale data must not partially replace generated files.
await mkdir(new URL('public/data/', root), { recursive: true })
const report = [
  '# 路线事件画面校准记录', '',
  '由 `pnpm prepare:events` 生成，人工维护源位于 `content/event-calibrations/`。', '',
  '已查看三条原片每 5 秒一帧的全程索引，并逐项检查节点起止附近的逐秒抽帧，部分疑点扩大回看范围。动作区间表示素材中的路段/操作位置，允许重叠；不是官方允许反应时间，也不是秒级罚分标准。每个节点保留自己的抽样误差，通常为 ±5 秒。口令毫秒值沿用 ASR，尚未独立校成真实播报起点。', '',
  '**范围：画面、烧录字幕与现有 ASR/OCR 交叉核对。没有独立听音复核；没有核实当前当地评分细则。`visual-reviewed` 只表示画面时间定位，不等于事件整体 `verified`。**', '',
  '练习可用事件独立导出；正式模拟 `examEvents` 保持为空。方向是本片示范方向，不自动限制真实考试的合法选择。', '',
  '本地证据工作台：先运行 `pnpm calibrate:media`，再打开 `artifacts/calibration/index.html`。工作台提供每项边界证据图、视频原声回放、字幕上下文，以及仅看疑点筛选。图片和音视频不提交 Git。', '',
  '| 路线 | 口令候选已处理 | 定位事件 | 可用于暂停练习 | 正式评分事件 | 集中疑点 |',
  '| --- | ---: | ---: | ---: | ---: | ---: |',
]
for (const doc of docs) {
  const output = calibratedEventDocumentSchema.parse(publishCalibration(doc))
  report.push(`| ${doc.routeId} | ${doc.events.reduce((n, e) => n + e.instructionCueIds.length, 0)} | ${doc.events.length} | ${output.events.length} | ${output.examEvents.length} | ${doc.issues.length} |`)
}
report.push('', '## 需要集中确认的事项', '',
  '- 三条路线的进入学校区间尚缺清晰入口依据：现有明确字幕均为已驶离学校区域，不能据此新建进入学校刹车节点。',
  '- 数值、是否扣分、压实线许可、转向灯豁免、停车收尾顺序属于规则核实，画面校准不替代规则来源。',
  '- 灯光及上车准备不在这三段影片中，另设模块；不补造视频节点。',
  '- 本地工作台已包含原声回放，但生成音频文件和重用 ASR 不代表已经独立听过原声。', '')
for (const doc of docs) {
  const output = publishCalibration(doc)
  await writeFile(new URL(`public/data/route-${doc.routeId}.events.json`, root), JSON.stringify(output, null, 2) + '\n')
  report.push(`## ${doc.routeId} 号线`, '',
    `源视频 SHA-256：\`${doc.videoSha256}\`；时长 ${stamp(media.find(item => item.routeId === doc.routeId).durationMs)}。`, '',
    '| 节点 | 项目 | 口令定位 | 动作画面区间 | 练习暂停 | 误差 | 用途 |',
    '| --- | --- | --- | --- | --- | --- | --- |')
  for (const event of doc.events) report.push(`| ${event.id} | ${event.title} | ${event.instructionMs === null ? (event.instructionStatus === 'commentary-only' ? '讲解，口令待听音' : '无独立口令') : stamp(event.instructionMs)} | ${stamp(event.windowStartMs)}–${stamp(event.windowEndMs)} | ${stamp(event.practicePauseMs)} | ±${event.uncertaintyMs / 1000}s | ${output.events.some(e => e.id === event.id) ? '暂停练习' : '待核对'} |`)
  report.push('', '### 画面依据与处理', '')
  for (const event of doc.events) {
    report.push(`- **${event.id} ${event.title}**：${event.evidence.map(frame => `${stamp(frame.atMs)} ${frame.observation}`).join('；')} 来源：${event.sourceCueIds.join('、')}。${[...event.notes, ...event.blockers].join(' ')}`)
  }
  report.push('', '### 讲解、等候及排除项', '')
  for (const item of doc.annotations) report.push(`- ${stamp(item.startMs)}–${stamp(item.endMs)} [${item.kind}] ${item.note}`)
  report.push('', '### 剩余疑点', '')
  for (const issue of doc.issues) report.push(`- **${issue.id}** ${stamp(issue.startMs)}–${stamp(issue.endMs)}：${issue.question} ${issue.impact}`)
  report.push('')
  console.log(`${doc.routeId}号线：${doc.events.length}项定位，${output.events.length}项暂停练习，${output.examEvents.length}项正式评分。`)
}
await writeFile(new URL('docs/event-calibration.md', root), report.join('\n').trimEnd() + '\n')
