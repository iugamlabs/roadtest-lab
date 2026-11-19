import { z } from 'zod'
import route5 from '../../../../content/memory-quizzes/route-5.json'
import route6 from '../../../../content/memory-quizzes/route-6.json'
import route7 from '../../../../content/memory-quizzes/route-7.json'
import { routeIdSchema, type CalibratedEvent } from '@/features/content/schema'
import type { MemorySource } from '../progress'

export const directionLabels = { left: '左转', straight: '直行', right: '右转', uturn: '掉头' } as const
export const quizKindLabels = { clip: '短片认实景', scene: '定格认实景', direction: '记走向', sequence: '接顺序', bridge: '补缺项' } as const
export const QUIZ_ROUND_SIZE = 10
const CLIP_TARGET = 4
const SCENE_TARGET = 2
const kindBits = { scene: 1, direction: 2, sequence: 4, bridge: 8, clip: 16 } as const

const directionSchema = z.enum(['left', 'straight', 'right', 'uturn'])
const eventIdSchema = z.string().regex(/^[567]-[a-z0-9-]+$/)
const choicesSchema = z.array(eventIdSchema).length(3)
const timeMsSchema = z.number().int().nonnegative()
const visualReview = {
  maskTop: z.number().min(0).max(90), maskHeight: z.number().min(1).max(40),
  reviewedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), observation: z.string().min(1),
}
const frameSchema = z.object({ ...visualReview, atMs: timeMsSchema }).refine(frame => frame.maskTop + frame.maskHeight <= 100)
const clipSchema = z.object({ ...visualReview, startMs: timeMsSchema, endMs: timeMsSchema })
  .refine(clip => clip.maskTop + clip.maskHeight <= 100 && clip.endMs - clip.startMs >= 5_000 && clip.endMs - clip.startMs <= 12_000)
const base = { id: z.string().min(1), anchorEventId: eventIdSchema }
const questionSchema = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('direction'), correct: directionSchema, frame: frameSchema, clue: z.string().min(1).optional() }),
  z.object({ ...base, kind: z.literal('scene'), frame: frameSchema, clip: clipSchema, choiceEventIds: choicesSchema, clue: z.string().min(1) }),
  z.object({ ...base, kind: z.literal('sequence'), relation: z.enum(['previous', 'next']), answerEventId: eventIdSchema, choiceEventIds: choicesSchema }),
  z.object({ ...base, kind: z.literal('bridge'), beforeEventId: eventIdSchema, afterEventId: eventIdSchema, choiceEventIds: choicesSchema }),
])
const bankSchema = z.object({
  version: z.literal(2), routeId: routeIdSchema,
  videoSha256: z.string().regex(/^[a-f0-9]{64}$/), subtitleSha256: z.string().regex(/^[a-f0-9]{64}$/),
  eventSignature: z.string().min(1), questions: z.array(questionSchema).min(1).max(100),
})
export interface QuizOption { id: string; label: string }
export interface QuizQuestion {
  id: string
  kind: keyof typeof quizKindLabels
  anchorEventId: string
  topicEventIds: string[]
  topicStartIndex: number
  section: number
  prompt: string
  options: QuizOption[]
  correct: string
  explanation: string
  frame?: { atMs: number; maskTop: number; maskHeight: number }
  clip?: { startMs: number; endMs: number; maskTop: number; maskHeight: number }
}
export interface QuizBank { routeId: MemorySource['routeId']; signature: string; questions: QuizQuestion[]; notice: string }
export const quizEventSignature = (source: MemorySource) => JSON.stringify(source.events.map(event => [event.id, event.title, event.kind, event.direction, event.windowStartMs, event.windowEndMs]))
const authoredBanks = { '5': route5, '6': route6, '7': route7 }
const directionOptions = Object.entries(directionLabels).map(([id, label]) => ({ id, label }))

function isReviewedEvent(event: CalibratedEvent | undefined): event is CalibratedEvent {
  return Boolean(event && !event.blockers.length && event.timingStatus === 'visual-reviewed')
}

// The unpublished 6-return-turn lies between these two published events.
function canConnect(before: CalibratedEvent, after: CalibratedEvent) {
  return !(before.id === '6-cross-3' && after.id === '6-bus-3')
}

function expectedDirection(event: CalibratedEvent) {
  if (event.kind === 'uturn') return 'uturn'
  if (event.kind === 'turn') return event.direction
  if (event.kind === 'straight' || (event.kind === 'brake' && event.title.endsWith('路口直行'))) return 'straight'
  return null
}

export function loadQuizBank(source: MemorySource, raw: unknown = authoredBanks[source.routeId]): QuizBank {
  const unavailable: QuizBank = { routeId: source.routeId, signature: '', questions: [], notice: '小测内容暂时不可用，可以继续跟着学或自己回忆。' }
  const parsed = bankSchema.safeParse(raw)
  if (!parsed.success) return unavailable
  const data = parsed.data
  if (data.routeId !== source.routeId || data.videoSha256 !== source.videoSha256 || data.subtitleSha256 !== source.subtitleSha256 || data.eventSignature !== quizEventSignature(source)) return { ...unavailable, notice: '路线内容已更新，小测核对后再开放。仍可继续学习。' }
  if (new Set(data.questions.map(question => question.id)).size !== data.questions.length) return unavailable

  const eventsById = new Map(source.events.map(event => [event.id, event]))
  const questions: QuizQuestion[] = []
  for (const question of data.questions) {
    const index = source.events.findIndex(event => event.id === question.anchorEventId)
    const anchor = source.events[index]
    if (!isReviewedEvent(anchor) || question.id !== `${question.kind}:${anchor.id}`) return unavailable
    const common = { id: question.id, kind: question.kind, anchorEventId: anchor.id, topicStartIndex: index, section: Math.floor(index * 3 / source.events.length) }
    if (question.kind === 'direction' || question.kind === 'scene') {
      const latest = question.kind === 'direction' ? anchor.windowStartMs : anchor.windowEndMs
      if (question.frame.atMs < Math.max(0, anchor.windowStartMs - 12_000) || question.frame.atMs > latest) return unavailable
    }
    if (question.kind === 'direction') {
      if (question.correct !== expectedDirection(anchor)) return unavailable
      questions.push({ ...common, topicEventIds: [anchor.id], prompt: '按这条路线，接下来怎么走？',
        options: directionOptions, correct: question.correct, frame: question.frame,
        explanation: `这里是「${anchor.title}」，接下来${directionLabels[question.correct]}。${question.clue ?? ''}` })
      continue
    }

    const choices = question.choiceEventIds.map(id => eventsById.get(id))
    if (!choices.every(isReviewedEvent) || new Set(choices.map(event => event.title)).size !== 3) return unavailable
    const options = choices.map(event => ({ id: event.id, label: event.title }))
    if (question.kind === 'scene') {
      const { clip } = question
      const earliest = anchor.id === '6-bus-3' ? 330_000 : Math.max(0, anchor.windowStartMs - 24_000)
      if (!choices.includes(anchor) || clip.startMs < earliest || clip.endMs > question.frame.atMs
        || clip.endMs < Math.max(0, anchor.windowStartMs - 12_000)) return unavailable
      const recognition = { ...common, topicEventIds: [anchor.id], options, correct: anchor.id, explanation: `这里是「${anchor.title}」。${question.clue}` }
      questions.push(
        { ...recognition, prompt: '这张画面对应路线上的哪个位置？', frame: question.frame },
        { ...recognition, id: `clip:${anchor.id}`, kind: 'clip', prompt: '短片停住时，车到了路线上的哪个位置？', clip },
      )
    } else if (question.kind === 'sequence') {
      const previous = question.relation === 'previous'
      const adjacent = source.events[index + (previous ? -1 : 1)]
      if (!isReviewedEvent(adjacent) || adjacent.id !== question.answerEventId || !choices.includes(adjacent)
        || choices.includes(anchor) || !canConnect(previous ? adjacent : anchor, previous ? anchor : adjacent)) return unavailable
      const pair = previous ? [adjacent, anchor] : [anchor, adjacent]
      questions.push({ ...common, topicStartIndex: previous ? index - 1 : index, topicEventIds: pair.map(event => event.id),
        prompt: `「${anchor.title}」${previous ? '之前，上一项' : '之后，下一项'}学习项目是什么？`,
        options, correct: adjacent.id, explanation: `先是「${pair[0].title}」，接着是「${pair[1].title}」。` })
    } else {
      const before = source.events[index - 1]
      const after = source.events[index + 1]
      if (!isReviewedEvent(before) || !isReviewedEvent(after) || before.id !== question.beforeEventId || after.id !== question.afterEventId
        || !canConnect(before, anchor) || !canConnect(anchor, after)
        || !choices.includes(anchor) || choices.includes(before) || choices.includes(after)) return unavailable
      questions.push({ ...common, topicStartIndex: index - 1, topicEventIds: [before.id, anchor.id, after.id],
        prompt: `从「${before.title}」到「${after.title}」，中间少了哪一项学习项目？`,
        options, correct: anchor.id, explanation: `先是「${before.title}」，接着是「${anchor.title}」，然后是「${after.title}」。` })
    }
  }
  return { routeId: source.routeId, signature: JSON.stringify(data), questions, notice: '' }
}

export function scopedQuizQuestions(bank: QuizBank, eventIds?: string[]) {
  const ids = eventIds ? new Set(eventIds) : null
  return bank.questions.filter(question => !ids || question.topicEventIds.every(id => ids.has(id)))
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.max(0, Math.min(0.999999999, random())) * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export function chooseQuizQuestions(pool: QuizQuestion[], random = Math.random, recentIds: ReadonlySet<string> = new Set()): QuizQuestion[] {
  if (!pool.length) return []
  const candidates = shuffle(pool, random).map((question, index) => ({
    question,
    tieBreak: index / (pool.length * QUIZ_ROUND_SIZE),
  })).sort((a, b) => a.question.topicStartIndex - b.question.topicStartIndex)

  // Question topics are contiguous. Taking one skips every question that starts inside its interval.
  const nextIndices = candidates.map(({ question }, index) => {
    const end = question.topicStartIndex + question.topicEventIds.length
    const next = candidates.findIndex((candidate, position) => position > index && candidate.question.topicStartIndex >= end)
    return next === -1 ? candidates.length : next
  })

  type Pick = { score: number; questions: QuizQuestion[] }
  const empty: Pick = { score: 0, questions: [] }
  const memo = new Map<string, Pick>()
  function bestFrom(index: number, remaining: number, kinds: number, sections: number, clips: number, scenes: number): Pick {
    if (!remaining || index === candidates.length) return empty
    const key = [index, remaining, kinds, sections, clips, scenes].join(',')
    const cached = memo.get(key)
    if (cached) return cached

    const { question, tieBreak } = candidates[index]
    const kind = kindBits[question.kind]
    const section = 1 << question.section
    const isClip = question.kind === 'clip'
    const isScene = question.kind === 'scene'
    const nextClips = Math.min(CLIP_TARGET, clips + Number(isClip))
    const nextScenes = Math.min(SCENE_TARGET, scenes + Number(isScene))
    const rest = bestFrom(nextIndices[index], remaining - 1, kinds | kind, sections | section, nextClips, nextScenes)
    // In priority order: round length, type coverage, clip and still targets, route coverage, freshness.
    const score = rest.score + 10_000 + (kinds & kind ? 0 : 1000)
      + (isClip ? (clips < CLIP_TARGET ? 100 : -100) : 0)
      + (isScene ? (scenes < SCENE_TARGET ? 100 : -100) : 0)
      + (sections & section ? 0 : 20) + (recentIds.has(question.id) ? 0 : 1) + tieBreak

    const skip = bestFrom(index + 1, remaining, kinds, sections, clips, scenes)
    const best = score > skip.score ? { score, questions: [question, ...rest.questions] } : skip
    memo.set(key, best)
    return best
  }

  const selected = bestFrom(0, QUIZ_ROUND_SIZE, 0, 0, 0, 0).questions
  return shuffle(selected, random).map(question => question.kind === 'direction' ? question : { ...question, options: shuffle(question.options, random) })
}
