import { z } from 'zod'
import route5 from '../../../../content/memory-quizzes/route-5.json'
import route6 from '../../../../content/memory-quizzes/route-6.json'
import route7 from '../../../../content/memory-quizzes/route-7.json'
import { routeIdSchema } from '@/features/content/schema'
import type { MemorySource } from '../progress'

export const directionLabels = { left: '左转', straight: '直行', right: '右转', uturn: '掉头' } as const
const directionSchema = z.enum(['left', 'straight', 'right', 'uturn'])
const eventIdSchema = z.string().regex(/^[567]-[a-z0-9-]+$/)
const base = { id: z.string().min(1), anchorEventId: eventIdSchema, hint: z.string().min(1) }
const questionSchema = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('direction'), correct: directionSchema, frame: z.object({
    atMs: z.number().int().nonnegative(), maskTop: z.number().min(0).max(90), maskHeight: z.number().min(1).max(40),
    reviewedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), observation: z.string().min(1),
  }).refine(frame => frame.maskTop + frame.maskHeight <= 100) }),
  z.object({ ...base, kind: z.literal('sequence'), nextEventId: eventIdSchema, choiceEventIds: z.array(eventIdSchema).length(3) }),
])
const bankSchema = z.object({
  version: z.literal(1), routeId: routeIdSchema,
  videoSha256: z.string().regex(/^[a-f0-9]{64}$/), subtitleSha256: z.string().regex(/^[a-f0-9]{64}$/),
  eventSignature: z.string().min(1), questions: z.array(questionSchema).min(1).max(100),
})
export interface QuizOption { id: string; label: string }
export interface QuizQuestion {
  id: string
  kind: 'direction' | 'sequence'
  anchorEventId: string
  topicEventIds: string[]
  title: string
  prompt: string
  options: QuizOption[]
  correct: string
  hint: string
  explanation: string
  frame?: { atMs: number; maskTop: number; maskHeight: number }
}
export interface QuizBank { routeId: MemorySource['routeId']; signature: string; questions: QuizQuestion[]; notice: string }
export const quizEventSignature = (source: MemorySource) => JSON.stringify(source.events.map(event => [event.id, event.title, event.kind, event.direction, event.windowStartMs, event.windowEndMs]))
const authoredBanks = { '5': route5, '6': route6, '7': route7 }

export function loadQuizBank(source: MemorySource, raw: unknown = authoredBanks[source.routeId]): QuizBank {
  const unavailable: QuizBank = { routeId: source.routeId, signature: '', questions: [], notice: '小测内容暂时不可用，可以继续跟着学或自己回忆。' }
  const parsed = bankSchema.safeParse(raw)
  if (!parsed.success) return unavailable
  const data = parsed.data
  if (data.routeId !== source.routeId || data.videoSha256 !== source.videoSha256 || data.subtitleSha256 !== source.subtitleSha256 || data.eventSignature !== quizEventSignature(source)) return { ...unavailable, notice: '路线内容已更新，小测核对后再开放。仍可继续学习。' }
  if (new Set(data.questions.map(question => question.id)).size !== data.questions.length) return unavailable
  const questions: QuizQuestion[] = []
  for (const question of data.questions) {
    const index = source.events.findIndex(event => event.id === question.anchorEventId)
    const anchor = source.events[index]
    if (!anchor || question.id !== `${question.kind}:${anchor.id}` || anchor.blockers.length || anchor.timingStatus !== 'visual-reviewed') return unavailable
    if (question.kind === 'direction') {
      const expected = anchor.kind === 'uturn' ? 'uturn' : anchor.kind === 'straight' ? 'straight' : anchor.kind === 'turn' ? anchor.direction : null
      if (question.correct !== expected || question.frame.atMs > anchor.windowStartMs || question.frame.atMs < Math.max(0, anchor.windowStartMs - 12_000)) return unavailable
      questions.push({ id: question.id, kind: question.kind, anchorEventId: anchor.id, topicEventIds: [anchor.id], title: anchor.title,
        prompt: '按这条路线，前面的路口怎么走？', options: Object.entries(directionLabels).map(([id, label]) => ({ id, label })),
        correct: question.correct, hint: question.hint, explanation: `这里是「${anchor.title}」，本路线在这里${directionLabels[question.correct]}。`, frame: question.frame })
    } else {
      const next = source.events[index + 1]
      const options = question.choiceEventIds.map(id => source.events.find(event => event.id === id))
      if (!next || next.id !== question.nextEventId || !question.choiceEventIds.includes(next.id)
        || new Set(question.choiceEventIds).size !== 3 || question.choiceEventIds.includes(anchor.id)
        || options.some(event => !event || event.blockers.length || event.timingStatus !== 'visual-reviewed')
        || new Set(options.map(event => event?.title)).size !== 3) return unavailable
      questions.push({ id: question.id, kind: question.kind, anchorEventId: anchor.id, topicEventIds: [anchor.id, next.id], title: anchor.title,
        prompt: `「${anchor.title}」之后，下一个学习项目是什么？`, options: options.map(event => ({ id: event!.id, label: event!.title })),
        correct: next.id, hint: question.hint, explanation: `「${anchor.title}」之后，接着是「${next.title}」。` })
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

export function chooseQuizQuestions(pool: QuizQuestion[], random = Math.random): QuizQuestion[] {
  // Prefer three directions and two sequences; avoid testing a topic twice in one round.
  let best: QuizQuestion[] = []
  for (let attempt = 0; attempt < 16; attempt++) {
    const selected: QuizQuestion[] = []
    const topics = new Set<string>()
    const candidates = shuffle(pool, random)
    const take = (question: QuizQuestion) => {
      if (selected.length >= 5 || question.topicEventIds.some(id => topics.has(id))) return
      selected.push(question)
      question.topicEventIds.forEach(id => topics.add(id))
    }
    for (const kind of ['direction', 'sequence'] as const) {
      const limit = kind === 'direction' ? 3 : 2
      for (const question of candidates.filter(item => item.kind === kind)) {
        if (selected.filter(item => item.kind === kind).length < limit) take(question)
      }
    }
    candidates.forEach(take)
    const balance = (items: QuizQuestion[]) => items.length * 10 + Math.min(2, items.filter(item => item.kind === 'sequence').length)
    if (balance(selected) > balance(best)) best = selected
  }
  return shuffle(best, random).map(question => question.kind === 'sequence' ? { ...question, options: shuffle(question.options, random) } : question)
}
