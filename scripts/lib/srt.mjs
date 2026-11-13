const stamp = /^(\d{2,}):([0-5]\d):([0-5]\d)[,.](\d{3})$/

function milliseconds(value) {
  const match = value.trim().match(stamp)
  if (!match) throw new Error(`无效的字幕时间：${value}`)
  return ((Number(match[1]) * 60 + Number(match[2])) * 60 + Number(match[3])) * 1000 + Number(match[4])
}

/** Preserve source text, including OCR errors; timestamps are integer milliseconds. */
export function parseSrt(input) {
  if (!input.trim()) return []
  return input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim().split(/\n\s*\n/).map((block, index) => {
    const lines = block.split('\n')
    const timingIndex = /^\d+$/.test(lines[0].trim()) ? 1 : 0
    const timing = lines[timingIndex]?.split(/\s+-->\s+/)
    if (timing?.length !== 2) throw new Error(`第 ${index + 1} 条字幕缺少时间范围`)
    const startMs = milliseconds(timing[0])
    const endMs = milliseconds(timing[1])
    const rawText = lines.slice(timingIndex + 1).join('\n').trim()
    if (endMs <= startMs || !rawText) throw new Error(`第 ${index + 1} 条字幕内容或时间范围无效`)
    return { id: String(index + 1), startMs, endMs, rawText, correctedText: null, reviewStatus: 'unreviewed' }
  })
}
