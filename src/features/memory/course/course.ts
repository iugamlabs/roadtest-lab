import { z } from 'zod'
import route5 from '../../../../content/memory-courses/route-5.json'
import route6 from '../../../../content/memory-courses/route-6.json'
import route7 from '../../../../content/memory-courses/route-7.json'
import { routeIdSchema } from '@/features/content/schema'
import type { MemorySource } from '../progress'
import { quizEventSignature, shuffle, unpublishedRoute6Return, type QuizQuestion } from '../quiz/bank'
import { summarizeQuiz, type QuizAnswer } from '../quiz/model'

const authoredCourses = { '5': route5, '6': route6, '7': route7 }
const time = z.number().nonnegative()
const clipSchema = z.tuple([time, time]).refine(([start, end]) => end > start)
const courseSchema = z.object({
  routeId: routeIdSchema,
  videoSha256: z.string().regex(/^[a-f0-9]{64}$/),
  subtitleSha256: z.string().regex(/^[a-f0-9]{64}$/),
  eventSignature: z.string().min(1),
  arrival: clipSchema,
  segments: z.array(z.object({
    events: z.array(z.string().min(1)).min(1).max(3),
    clip: clipSchema,
    prompt: z.string().min(1),
    choices: z.array(z.string().min(1)).length(3).refine(choices => new Set(choices).size === choices.length),
  })).length(10),
})

type CourseClip = NonNullable<QuizQuestion['clip']>
export type RouteCourseContent = { questions: QuizQuestion[]; arrivalClip: CourseClip }
export type CourseAnswers = { questions: QuizQuestion[]; answers: QuizAnswer[] }

function clipBetween([start, end]: [number, number]): CourseClip {
  return { startMs: Math.round(start * 1000), endMs: Math.round(end * 1000), maskTop: 80, maskHeight: 14 }
}

export function loadRouteCourse(source: MemorySource, raw: unknown = authoredCourses[source.routeId]): RouteCourseContent | null {
  const parsed = courseSchema.safeParse(raw)
  if (!parsed.success) return null
  const { segments, arrival, routeId, videoSha256, subtitleSha256, eventSignature } = parsed.data
  if (routeId !== source.routeId || videoSha256 !== source.videoSha256 ||
    subtitleSha256 !== source.subtitleSha256 || quizEventSignature(source) !== eventSignature) return null

  const eventIds = segments.flatMap(segment => segment.events)
  if (source.events.length !== eventIds.length ||
    source.events.some((event, index) => event.id !== eventIds[index] || event.blockers.length || event.timingStatus !== 'visual-reviewed')) return null

  const questions: QuizQuestion[] = []
  let topicStartIndex = 0
  let previousClipEnd = 0
  for (const segment of segments) {
    const anchor = source.events[topicStartIndex]
    const clip = clipBetween(segment.clip)
    if (clip.startMs < previousClipEnd || clip.endMs >= anchor.windowStartMs) return null
    // Resume after the unpublished turn, between these two published projects.
    const crossesUnpublishedTurn = segment.events.includes('6-cross-3') && segment.events.includes('6-bus-3')
    const showsUnpublishedTurn = routeId === '6' && clip.startMs < unpublishedRoute6Return.endMs && clip.endMs > unpublishedRoute6Return.startMs
    if (crossesUnpublishedTurn || showsUnpublishedTurn) return null

    const options = segment.choices.map((label, choice) => ({ id: String(choice), label }))
    questions.push({
      id: `course:${routeId}:${questions.length + 1}`, kind: 'sequence', anchorEventId: anchor.id,
      topicEventIds: segment.events, topicStartIndex, section: questions.length, prompt: segment.prompt,
      options, correct: options[0].id, explanation: options[0].label, clip,
    })
    previousClipEnd = clip.endMs
    topicStartIndex += segment.events.length
  }

  const arrivalClip = clipBetween(arrival)
  if (arrivalClip.startMs <= source.events.at(-1)!.windowStartMs) return null
  return { questions, arrivalClip }
}

export function prepareRouteCourse(questions: QuizQuestion[]) {
  return questions.map(question => ({ ...question, options: shuffle(question.options, Math.random) }))
}

export function summarizeRouteCourse(questions: QuizQuestion[], answers: QuizAnswer[]) {
  const tally = summarizeQuiz(questions, answers)
  const correct = tally.independent + tally.assisted
  return {
    ...tally,
    correct,
  }
}
