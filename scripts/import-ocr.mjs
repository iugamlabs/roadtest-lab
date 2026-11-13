import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { parseSrt } from './lib/srt.mjs'

const root = new URL('../', import.meta.url)
await mkdir(new URL('public/data/', root), { recursive: true })
for (const [id, label] of [['5', '五'], ['6', '六'], ['7', '七']]) {
  const sourceFile = `汕头大学路科目三${label}号线超详细教学.srt`
  const cues = parseSrt(await readFile(new URL(`raw/${sourceFile}`, root), 'utf8'))
  const document = { version: 1, routeId: id, source: 'ocr', sourceFile, cues }
  await writeFile(new URL(`public/data/route-${id}.ocr.json`, root), JSON.stringify(document, null, 2) + '\n')
  console.log(`${label}号线：导入 ${cues.length} 条 OCR 字幕，保留原文，全部待校对。`)
}
