import { copyFile, mkdir, stat } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
await mkdir(new URL('public/media/', root), { recursive: true })
let missing = false
for (const [id, label] of [['5', '五'], ['6', '六'], ['7', '七']]) {
  for (const [source, target] of [
    [`raw/汕头大学路科目三${label}号线超详细教学.mp4`, `public/media/route-${id}.mp4`],
    [`raw/shantou-kemu3-key-actions/maps/route-${id}.jpg`, `public/media/route-${id}.jpg`],
  ]) {
    try {
      const from = new URL(source, root), to = new URL(target, root)
      const sourceStat = await stat(from)
      const targetStat = await stat(to).catch(() => null)
      if (targetStat?.size !== sourceStat.size || targetStat.mtimeMs < sourceStat.mtimeMs) await copyFile(from, to)
      console.log(`已准备 ${target}`)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      console.error(`缺少素材：${source}`)
      missing = true
    }
  }
}
if (missing) process.exitCode = 1
