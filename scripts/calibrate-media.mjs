import { readFile, writeFile, mkdir, stat, readdir } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { validateCalibration, evidenceSeconds } from './lib/calibration.mjs'
import { calibrationMediaSchema } from '../src/features/content/schema.ts'

const root = new URL('../', import.meta.url)
const output = new URL('artifacts/calibration/', root)
const absolute = path => fileURLToPath(new URL(path, root))
const readJson = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'))
const exists = async path => Boolean(await stat(path).catch(() => null))
const hashFile = async path => {
  const hash = createHash('sha256')
  for await (const bytes of createReadStream(path)) hash.update(bytes)
  return hash.digest('hex')
}
async function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: fileURLToPath(root), stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    child.stdout.on('data', data => { stdout += data })
    child.stderr.on('data', data => { stderr = (stderr + data).slice(-12000) })
    child.on('error', reject)
    child.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(`${command} 退出 ${code}: ${stderr}`)))
  })
}
const ffmpeg = args => run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args])
const manifest = calibrationMediaSchema.parse(await readJson('content/event-calibrations/media.json'))
const docs = []
const subtitles = {}
// Verify all originals and provenance before generating/reusing any evidence.
for (const media of manifest.media) {
  if (await hashFile(absolute(media.file)) !== media.sha256) throw new Error(`${media.routeId}号线原片已变化，停止复用旧校准。`)
  const info = JSON.parse(await run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', absolute(media.file)]))
  const video = info.streams.find(stream => stream.codec_type === 'video')
  if (video.r_frame_rate !== '30/1' || video.avg_frame_rate !== '30/1' || video.width !== media.width || video.height !== media.height || Math.abs(Number(info.format.duration) * 1000 - media.durationMs) > 1 || Number(video.start_time) !== 0) throw new Error('视频参数与校准清单不符，不能沿用按源帧号的抽帧计划')
  const bytes = await readFile(new URL(`public/data/route-${media.routeId}.subtitles.json`, root))
  subtitles[media.routeId] = JSON.parse(bytes).cues
  docs.push(validateCalibration(await readJson(`content/event-calibrations/route-${media.routeId}.json`), JSON.parse(bytes), bytes, media))
}
await mkdir(output, { recursive: true })
for (const doc of docs) {
  const media = manifest.media.find(item => item.routeId === doc.routeId)
  const dir = new URL(`route-${doc.routeId}/`, output)
  const frames = new URL('frames/', dir)
  await mkdir(frames, { recursive: true })
  const cacheKey = `${media.sha256}:one-second-640-v1`
  const cache = await readFile(new URL('frames.key', dir), 'utf8').catch(() => '')
  const expectedCount = Math.ceil(media.durationMs / 1000)
  const count = (await readdir(frames)).filter(name => /^frame-\d{5}\.jpg$/.test(name)).length
  if (cache !== cacheKey || count !== expectedCount) {
    console.log(`${doc.routeId}号线：生成逐秒画面，约${expectedCount}帧…`)
    const filter = "select='not(mod(n,30))',scale=640:-1,drawtext=text='%{pts\\:hms}':fontsize=24:fontcolor=white:box=1:boxcolor=black@0.8:x=8:y=8"
    await ffmpeg(['-threads', '2', '-i', absolute(media.file), '-vf', filter, '-fps_mode', 'vfr', '-start_number', '0', '-q:v', '3', '-threads', '2', fileURLToPath(frames) + 'frame-%05d.jpg'])
    const actualCount = (await readdir(frames)).filter(name => /^frame-\d{5}\.jpg$/.test(name)).length
    if (actualCount !== expectedCount) throw new Error(`抽帧数量异常：${actualCount}/${expectedCount}`)
    await writeFile(new URL('frames.key', dir), cacheKey)
  }
  async function sheet(seconds, path, layout) {
    const list = new URL('sheet-input.txt', dir)
    // Only internally generated numeric frame names enter the concat file.
    await writeFile(list, seconds.map(second => `file 'frames/frame-${String(second).padStart(5, '0')}.jpg'`).join('\n') + '\n')
    await ffmpeg(['-f', 'concat', '-safe', '1', '-i', fileURLToPath(list), '-vf', `tile=${layout}:nb_frames=${seconds.length}:padding=4:margin=4`, '-frames:v', '1', '-q:v', '3', '-threads', '2', fileURLToPath(path)])
  }
  const overview = Array.from({ length: Math.ceil(media.durationMs / 5000) }, (_, i) => i * 5)
  for (let i = 0; i < overview.length; i += 12) await sheet(overview.slice(i, i + 12), new URL(`overview-${String(i / 12 + 1).padStart(2, '0')}.jpg`, dir), '3x4')
  for (const event of doc.events) await sheet(evidenceSeconds(event, media.durationMs), new URL(`${event.id}.jpg`, dir), '3x2')
  for (const issue of doc.issues) {
    const clip = new URL(`${issue.id}.mp4`, dir)
    // Retain the original audio; this is a playback aid, not independent ASR review.
    const key = `${media.sha256}:${issue.startMs}:${issue.endMs}:clip-v1`
    const previous = await readFile(new URL(`${issue.id}.key`, dir), 'utf8').catch(() => '')
    if (key !== previous || !await exists(clip)) {
      await ffmpeg(['-threads', '2', '-ss', String(issue.startMs / 1000), '-i', absolute(media.file), '-t', String((issue.endMs - issue.startMs) / 1000), '-vf', 'scale=960:-2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', '-threads', '2', fileURLToPath(clip)])
      await writeFile(new URL(`${issue.id}.key`, dir), key)
    }
  }
  console.log(`${doc.routeId}号线：${doc.events.length}张节点证据图、${doc.issues.length}段疑点原声片段已就绪。`)
}
await writeFile(new URL('index.html', output), renderReport(docs, manifest.media, subtitles))
console.log('本地工作台：artifacts/calibration/index.html')

function renderReport(docs, media, subtitles) {
  const payload = JSON.stringify({ docs, media, subtitles }).replaceAll('<', '\\u003c')
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>路线校准证据工作台</title>
<style>body{font:20px/1.5 system-ui,sans-serif;margin:20px;max-width:1500px}button,select,input{font:inherit;min-height:48px}button{padding:4px 12px;cursor:pointer}nav{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0}video{width:100%;max-height:55vh;background:#000}img{display:block;width:100%;height:auto}article{border-top:1px solid #888;padding:16px 0}p{margin:8px 0}.toolbar{position:sticky;top:0;background:white;padding:8px 0;z-index:1}li{margin:5px 0}pre{white-space:pre-wrap;font:inherit}a{overflow-wrap:anywhere}</style>
<h1>路线校准证据工作台</h1><p>画面定位已整理；动作区间是素材位置，不是官方反应限时。原声尚未独立听音复核，评分规则尚未确认。</p>
<div class="toolbar"><nav><label>路线 <select id="route"><option value="all">全部路线</option><option>5</option><option>6</option><option>7</option></select></label><label><input type="checkbox" id="issues" checked> 只看集中疑点</label><label>搜索 <input id="search" type="search"></label></nav></div>
<video id="video" controls preload="metadata" playsinline></video><p id="playing" role="status">点击回放按钮可查看原片，或直接打开已截取的原声片段。</p><main id="items"></main>
<script type="application/json" id="payload">${payload}</script><script>
const data=JSON.parse(document.getElementById('payload').textContent);const video=document.getElementById('video');let end=Infinity;
const fmt=ms=>Math.floor(ms/60000).toString().padStart(2,'0')+':'+(ms/1000%60).toFixed(3).padStart(6,'0');
function text(tag,value,parent){const e=document.createElement(tag);e.textContent=value;parent.append(e);return e}
function replay(id,start,finish){const m=data.media.find(m=>m.routeId===id);const src=new URL('../../'+m.file,location.href).href;end=finish/1000;const seek=()=>{video.currentTime=Math.max(0,start/1000);video.play().catch(()=>{document.getElementById('playing').textContent='已定位，请点击播放器播放。'})};if(video.src===src){seek()}else{video.onloadedmetadata=seek;video.src=src;video.load()}document.getElementById('playing').textContent=id+'号线 '+fmt(start)+'–'+fmt(finish)+'（原片时间）';video.scrollIntoView({block:'nearest'})}
video.addEventListener('timeupdate',()=>{if(video.currentTime>=end)video.pause()});
function render(){const list=document.getElementById('items');list.replaceChildren();const route=document.getElementById('route').value;const issues=document.getElementById('issues').checked;const query=document.getElementById('search').value.trim();for(const doc of data.docs){if(route!=='all'&&route!==doc.routeId)continue;
const items=issues?doc.issues:doc.events;
for(const item of items){if(!JSON.stringify(item).includes(query))continue;const box=document.createElement('article');list.append(box);text('h2',item.id+' '+(item.title||item.question),box);const start=item.windowStartMs??item.startMs;const finish=item.windowEndMs??item.endMs;text('p',fmt(start)+'–'+fmt(finish),box);const play=text('button','回放此处原片（含原声）',box);play.onclick=()=>replay(doc.routeId,Math.max(0,start-3000),Math.min(data.media.find(m=>m.routeId===doc.routeId).durationMs,finish+3000));
if(issues){text('p',item.impact,box);const a=text('a','打开已截取的原声片段',box);a.href='route-'+doc.routeId+'/'+item.id+'.mp4'}else{const image=document.createElement('img');image.loading='lazy';image.alt=item.title+'：开始与结束附近逐秒证据';image.src='route-'+doc.routeId+'/'+item.id+'.jpg';box.append(image);text('p',item.instructionMs===null?'没有已定位的独立口令':'ASR口令 '+fmt(item.instructionMs),box);text('p','画面抽样误差 ±'+item.uncertaintyMs/1000+' 秒；'+(item.blockers.length?'暂缓练习':'可用于暂停练习'),box);for(const frame of item.evidence)text('p',fmt(frame.atMs)+' '+frame.observation,box);for(const note of [...item.notes,...item.blockers])text('p',note,box);const context=document.createElement('details');box.append(context);text('summary','来源字幕与时间',context);for(const cue of data.subtitles[doc.routeId].filter(c=>item.sourceCueIds.includes(c.id)))text('p',fmt(cue.startMs)+' '+(cue.correctedText??cue.rawText),context)}
}}}
for(const id of ['route','issues','search'])document.getElementById(id).addEventListener('input',render);render();
</script></html>`
}
