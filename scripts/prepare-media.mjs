import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
const recipe = 'h264-yuv420p-aac-crf20-veryfast-g60-v1'
const absolute = path => fileURLToPath(new URL(path, root))
await mkdir(new URL('public/media/', root), { recursive: true })

async function hashFile(path) {
  const hash = createHash('sha256')
  for await (const bytes of createReadStream(path)) hash.update(bytes)
  return hash.digest('hex')
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'inherit'] })
    let stdout = ''
    child.stdout.on('data', data => { stdout += data })
    child.on('error', error => reject(new Error(`无法运行 ${command}，请安装 FFmpeg（含 ffprobe）。`, { cause: error })))
    child.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(`${command} 退出 ${code}`)))
  })
}

async function probe(path) {
  return JSON.parse(await run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path]))
}

function compatible(info) {
  const video = info.streams.find(stream => stream.codec_type === 'video')
  const audio = info.streams.find(stream => stream.codec_type === 'audio')
  return video?.codec_name === 'h264' && video.pix_fmt === 'yuv420p' && audio?.codec_name === 'aac'
}

function validateTimeline(source, output) {
  if (!compatible(output)) throw new Error('发布视频必须为 H.264 / yuv420p + AAC')
  for (const type of ['video', 'audio']) {
    const before = source.streams.find(stream => stream.codec_type === type)
    const after = output.streams.find(stream => stream.codec_type === type)
    if (!before || !after) throw new Error(`缺少 ${type} 轨道`)
    for (const field of ['start_time', 'duration']) {
      if (!Number.isFinite(Number(before[field])) || !Number.isFinite(Number(after[field])) || Math.abs(Number(before[field]) - Number(after[field])) > 0.001) {
        throw new Error(`${type} 的 ${field} 变化，不能沿用原时间轴`)
      }
    }
    if (type === 'video' && ['width', 'height', 'r_frame_rate', 'avg_frame_rate', 'nb_frames'].some(field => before[field] === undefined || before[field] !== after[field])) {
      throw new Error('视频尺寸、帧率或帧数变化，不能沿用原校准')
    }
  }
}

async function prepareVideo(source, target) {
  const from = absolute(source), to = absolute(target)
  const sourceSha256 = await hashFile(from)
  const cachePath = `${to}.prepare.json`
  const cache = await readFile(cachePath, 'utf8').then(JSON.parse).catch(() => null)
  if (cache?.recipe === recipe && cache.sourceSha256 === sourceSha256 && cache.outputSha256 === await hashFile(to).catch(() => null)) {
    console.log(`已准备 ${target}（复用兼容视频）`)
    return
  }
  const info = await probe(from)
  const temporary = `${to}.${process.pid}.tmp.mp4`
  try {
    if (compatible(info)) {
      await copyFile(from, temporary)
    } else {
      console.log(`正在转换 ${target}：H.264 + AAC，保留尺寸、帧率及时间轴…`)
      await run('ffmpeg', [
        '-hide_banner', '-loglevel', 'warning', '-nostdin', '-y', '-threads', '4', '-i', from,
        '-map', '0:v:0', '-map', '0:a:0', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
        '-pix_fmt', 'yuv420p', '-g', '60', '-fps_mode', 'passthrough', '-threads', '8',
        '-c:a', info.streams.find(stream => stream.codec_type === 'audio')?.codec_name === 'aac' ? 'copy' : 'aac',
        '-movflags', '+faststart', temporary,
      ])
    }
    validateTimeline(info, await probe(temporary))
    const outputSha256 = await hashFile(temporary)
    await rename(temporary, to)
    await writeFile(cachePath, JSON.stringify({ recipe, sourceSha256, outputSha256 }, null, 2) + '\n')
    console.log(`已准备 ${target}（H.264 + AAC，时间轴检查通过）`)
  } finally {
    await rm(temporary, { force: true })
  }
}

let missing = false
for (const [id, label] of [['5', '五'], ['6', '六'], ['7', '七']]) {
  for (const [source, target] of [
    [`raw/汕头大学路科目三${label}号线超详细教学.mp4`, `public/media/route-${id}.mp4`],
    [`raw/shantou-kemu3-key-actions/maps/route-${id}.jpg`, `public/media/route-${id}.jpg`],
  ]) {
    const sourceStat = await stat(new URL(source, root)).catch(error => {
      if (error.code !== 'ENOENT') throw error
      return null
    })
    if (!sourceStat) {
      console.error(`缺少素材：${source}`)
      missing = true
      continue
    }
    if (target.endsWith('.mp4')) {
      await prepareVideo(source, target)
    } else {
      const targetStat = await stat(new URL(target, root)).catch(() => null)
      if (targetStat?.size !== sourceStat.size || targetStat.mtimeMs < sourceStat.mtimeMs) await copyFile(new URL(source, root), new URL(target, root))
      console.log(`已准备 ${target}`)
    }
  }
}
if (missing) process.exitCode = 1
