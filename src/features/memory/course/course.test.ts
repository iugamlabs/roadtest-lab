import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import route6 from '../../../../content/memory-courses/route-6.json'
import { calibratedEventDocumentSchema } from '@/features/content/schema'
import { initialRouteQuizState, routeQuizReducer, UNKNOWN_ANSWER } from '../quiz/model'
import { loadRouteCourse, summarizeRouteCourse } from './course'

const sourceFor = (id: string) => calibratedEventDocumentSchema.parse(JSON.parse(readFileSync(`public/data/route-${id}.events.json`, 'utf8')))

describe('route course', () => {
  it.each(['5', '6', '7'])('covers route %s with 10 ordered segments and clips before their answers', id => {
    const source = sourceFor(id)
    const { questions, arrivalClip } = loadRouteCourse(source)!
    expect(questions).toHaveLength(10)
    expect(questions.flatMap(question => question.topicEventIds)).toEqual(source.events.map(event => event.id))
    let previousEnd = 0
    for (const question of questions) {
      const { startMs, endMs } = question.clip!
      expect(startMs).toBeGreaterThanOrEqual(previousEnd)
      expect(endMs).toBeGreaterThan(startMs)
      expect(endMs).toBeLessThan(source.events[question.topicStartIndex].windowStartMs)
      expect(new Set(question.options.map(option => option.label)).size).toBe(3)
      expect(question.options.find(option => option.id === question.correct)?.label).toBe(question.explanation)
      previousEnd = endMs
    }
    expect(arrivalClip.startMs).toBeGreaterThan(source.events.at(-1)!.windowStartMs)
  })

  it('requires the reviewed source', () => {
    const source = sourceFor('5')
    expect(loadRouteCourse({ ...source, videoSha256: '0'.repeat(64) })).toBeNull()
    expect(loadRouteCourse({ ...source, events: source.events.slice(1) })).toBeNull()
  })

  it('keeps the unpublished route 6 turn out of both clips and consecutive questions', () => {
    const source = sourceFor('6')
    const showingTurn = structuredClone(route6)
    showingTurn.segments[6].clip = [327, 331]
    expect(loadRouteCourse(source, showingTurn)).toBeNull()

    const crossingTurn = structuredClone(route6)
    crossingTurn.segments[5].events.push('6-bus-3')
    crossingTurn.segments[6].events.shift()
    expect(loadRouteCourse(source, crossingTurn)).toBeNull()
  })

  it('locks a skipped segment without revealing options and gates the next one on its own clip', () => {
    const { questions } = loadRouteCourse(sourceFor('5'))!
    const started = routeQuizReducer(initialRouteQuizState, { type: 'start', questions })
    const skip = { type: 'submit', unknown: true } as const
    expect(routeQuizReducer(started, skip)).toBe(started)
    const firstReady = routeQuizReducer(started, { type: 'frame-ready', questionId: questions[0].id, ready: true })
    const next = routeQuizReducer(firstReady, skip)
    expect(next.answers).toEqual([{ questionId: questions[0].id, selected: UNKNOWN_ANSWER, usedHint: false }])
    expect(next.index).toBe(1)
    expect(next.optionsVisible).toBe(false)
    expect(routeQuizReducer(next, { type: 'frame-ready', questionId: questions[0].id, ready: true })).toBe(next)
    expect(routeQuizReducer(next, { type: 'reveal-options' })).toBe(next)
  })

  it('reports nine correct segments and one forgotten segment', () => {
    const { questions } = loadRouteCourse(sourceFor('5'))!
    const answers = questions.map((question, index) => ({
      questionId: question.id,
      selected: index === 0 ? UNKNOWN_ANSWER : question.correct,
      usedHint: false,
    }))

    expect(summarizeRouteCourse(questions, answers)).toMatchObject({
      correct: 9, unknown: 1,
    })
  })
})
