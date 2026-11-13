const command = /^(前方路口[左右]转|前方路口直行|请停车瞭望|请变更车道|请完成超车|前方会车|前方掉头|请选择合适地点掉头|请保持直线行驶|请靠边停车)$/
const critical = /[左右]转|变道|变更.*车道|掉头|超车|停车|停止线|实线|虚线|斑马线|转向灯|扣分|挂上|手刹|安全带|熄火|\d+\s*(?:码|米|秒|圈)/

/** Apply explicit, guarded edits. Temporal overlap alone never changes wording. */
export function buildReviewedDocument({ routeId, asr, ocr, review, sources }) {
  if (review.version !== 1 || review.routeId !== routeId || asr.routeId !== routeId || ocr.routeId !== routeId) throw new Error('路线或修订版本不一致')
  if (asr.source !== 'asr' || ocr.source !== 'ocr') throw new Error('原始字幕来源不一致')
  const resolve = ref => {
    const document = sources.find(source => source.routeId === ref.routeId && source.source === ref.source)
    const cue = document?.cues.find(value => value.id === ref.cueId)
    if (!cue) throw new Error(`找不到来源 ${ref.routeId}/${ref.source}/${ref.cueId}`)
    return cue
  }
  const edits = new Map()
  for (const edit of review.corrections) {
    const original = resolve({ routeId, source: 'asr', cueId: edit.cueId })
    if (edits.has(edit.cueId)) throw new Error(`重复修订 ${edit.cueId}`)
    validateEdit(original, edit)
    edit.evidence.forEach(resolve)
    edits.set(edit.cueId, edit)
  }
  const issueNotes = new Map()
  for (const issue of review.issues) {
    if (!issue.reason?.trim() || !issue.cueIds.length) throw new Error('疑点缺少说明或来源')
    for (const cueId of issue.cueIds) {
      resolve({ routeId, source: 'asr', cueId })
      issueNotes.set(cueId, [...(issueNotes.get(cueId) ?? []), issue.reason])
    }
  }
  function editedCue(original, source, edit, notes = []) {
    const text = edit?.text ?? original.rawText
    const isCommand = source === 'asr' && command.test(text)
    if (critical.test(text)) notes = [...notes, '涉及操作、方向、数值或规则；文字校对不代表原声、画面及考规已核实。']
    if (isCommand) notes = [...notes, '仅为独立口令形式的候选字幕；ASR 未区分说话人，尚未确认实际指令及动作窗口。']
    return {
      id: `${source}-${original.id}`, startMs: original.startMs, endMs: original.endMs,
      rawText: original.rawText, correctedText: edit?.text ?? null,
      reviewStatus: notes.length ? 'needs-review' : 'text-reviewed',
      source, sourceCueId: original.id,
      sourceRefs: [{ routeId, source, cueId: original.id }, ...(edit?.evidence ?? [])],
      editReason: edit?.reason ?? null, reviewNotes: notes,
      contentKind: source === 'ocr' ? 'ocr-supplement' : isCommand ? 'instruction-candidate' : 'commentary',
    }
  }
  const cues = asr.cues.map(cue => editedCue(cue, 'asr', edits.get(cue.id), issueNotes.get(cue.id)))
  const supplementIds = new Set()
  for (const edit of review.supplements) {
    const original = resolve({ routeId, source: 'ocr', cueId: edit.cueId })
    if (supplementIds.has(edit.cueId)) throw new Error(`重复补充 ${edit.cueId}`)
    validateEdit(original, edit)
    edit.evidence.forEach(resolve)
    if (asr.cues.some(cue => cue.startMs < original.endMs && cue.endMs > original.startMs)) throw new Error(`OCR 补段 ${edit.cueId} 与 ASR 重叠，需要人工合并而非重复插入`)
    supplementIds.add(edit.cueId)
    cues.push(editedCue(original, 'ocr', edit, ['ASR 漏段，由 OCR 辅助补入；时间沿用 OCR 显示时间，仍需听原声核实。']))
  }
  cues.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs || a.id.localeCompare(b.id))
  return {
    version: 1, routeId, reviewScope: 'text-only', primarySource: 'asr',
    summary: {
      asrCueCount: asr.cues.length, correctionCount: review.corrections.length,
      supplementCount: review.supplements.length,
      pendingCueCount: cues.filter(cue => cue.reviewStatus === 'needs-review').length,
      // Diagnostics only: no overlap does not imply missing speech or an exam event.
      unmatchedOcrCueIds: ocr.cues.filter(cue => !asr.cues.some(value => value.startMs < cue.endMs && value.endMs > cue.startMs)).map(cue => cue.id),
    },
    cues,
  }
}

function validateEdit(original, edit) {
  if (original.rawText !== edit.expectedRawText) throw new Error(`字幕 ${edit.cueId} 原文已变化，请重新校对，未应用旧修订`)
  if (!edit.text?.trim() || !edit.reason?.trim() || !Array.isArray(edit.evidence)) throw new Error(`字幕 ${edit.cueId} 缺少修订内容、理由或来源列表`)
}

export function serializeSrt(cues) {
  const stamp = ms => `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`
  return cues.map((cue, index) => `${index + 1}\n${stamp(cue.startMs)} --> ${stamp(cue.endMs)}\n${cue.correctedText ?? cue.rawText}\n`).join('\n')
}
