import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { parseSrt } from './lib/srt.mjs'

const root = new URL('../', import.meta.url)
await mkdir(new URL('content/subtitle-sources/', root), { recursive: true })
for (const routeId of ['5', '6', '7']) {
  const sourceFile = `asr/route-${routeId}.srt`
  const cues = parseSrt(await readFile(new URL(`raw/${sourceFile}`, root), 'utf8'))
  if (!cues.length) throw new Error(`${sourceFile} 没有字幕，停止导入。`)
  const document = { version: 1, routeId, source: 'asr', sourceFile, cues }
  await writeFile(new URL(`content/subtitle-sources/route-${routeId}.asr.json`, root), JSON.stringify(document, null, 2) + '\n')
  console.log(`${routeId} 号线：保留 ${cues.length} 条 ASR 原文。`)
}
