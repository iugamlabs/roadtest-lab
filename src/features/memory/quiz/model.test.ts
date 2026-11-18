import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { calibratedEventDocumentSchema } from '@/features/content/schema'
import { loadQuizBank } from './bank'
import { finishedQuizSummary, initialRouteQuizState, quizOutcome, routeQuizReducer, UNKNOWN_ANSWER } from './model'

const source = calibratedEventDocumentSchema.parse(JSON.parse(readFileSync('public/data/route-5.events.json', 'utf8')))
const bank = loadQuizBank(source)
const direction = bank.questions.find(question => question.kind === 'direction')!
const sequence = bank.questions.find(question => question.kind === 'sequence')!
const start = () => routeQuizReducer(initialRouteQuizState, { type: 'start', questions: [direction, sequence] })

describe('route quiz first-answer locking and deferred feedback', () => {
  it('waits for the correct frame, rejects missing/invalid answers, and ignores stale image callbacks', () => {
    let state = start()
    expect(routeQuizReducer(state, { type: 'select', selected: direction.correct })).toBe(state)
    expect(routeQuizReducer(state, { type: 'submit' })).toBe(state)
    expect(routeQuizReducer(state, { type: 'frame-ready', questionId: 'stale-question', ready: true })).toBe(state)
    state = routeQuizReducer(state, { type: 'frame-ready', questionId: direction.id, ready: true })
    expect(routeQuizReducer(state, { type: 'select', selected: 'not-an-option' })).toBe(state)
    expect(routeQuizReducer(state, { type: 'submit' })).toBe(state)
  })
  it('locks the first submitted answer without revealing correctness, and requires manual next', () => {
    let state = start()
    state = routeQuizReducer(state, { type: 'frame-ready', questionId: direction.id, ready: true })
    const wrong = direction.options.find(option => option.id !== direction.correct)!.id
    state = routeQuizReducer(state, { type: 'select', selected: wrong })
    state = routeQuizReducer(state, { type: 'submit' })
    expect(state.phase).toBe('submitted')
    expect(state.index).toBe(0)
    expect(finishedQuizSummary(state)).toBeNull()
    expect(routeQuizReducer(state, { type: 'select', selected: direction.correct })).toBe(state)
    expect(routeQuizReducer(state, { type: 'hint' })).toBe(state)
    expect(routeQuizReducer(state, { type: 'submit' })).toBe(state)
    expect(state.answers).toEqual([{ questionId: direction.id, selected: wrong, usedHint: false }])
    state = routeQuizReducer(state, { type: 'next' })
    expect(state).toMatchObject({ index: 1, selected: null, usedHint: false, frameReady: true, phase: 'answering' })
  })
  it('reports assisted correctness separately and only after the whole round ends', () => {
    let state = start()
    state = routeQuizReducer(state, { type: 'frame-ready', questionId: direction.id, ready: true })
    state = routeQuizReducer(state, { type: 'hint' })
    state = routeQuizReducer(state, { type: 'select', selected: direction.correct })
    state = routeQuizReducer(state, { type: 'submit' })
    state = routeQuizReducer(state, { type: 'next' })
    state = routeQuizReducer(state, { type: 'select', selected: sequence.correct })
    state = routeQuizReducer(state, { type: 'submit' })
    expect(finishedQuizSummary(state)).toBeNull()
    state = routeQuizReducer(state, { type: 'next' })
    expect(finishedQuizSummary(state)).toEqual({ independent: 1, assisted: 1, wrong: 0, unknown: 0, unanswered: 0 })
    expect(state).not.toHaveProperty('score')
  })
  it('distinguishes not remembering, wrong answers and unsubmitted questions on early finish', () => {
    let state = start()
    state = routeQuizReducer(state, { type: 'frame-ready', questionId: direction.id, ready: true })
    state = routeQuizReducer(state, { type: 'select', selected: UNKNOWN_ANSWER })
    state = routeQuizReducer(state, { type: 'submit' })
    state = routeQuizReducer(state, { type: 'next' })
    state = routeQuizReducer(state, { type: 'select', selected: sequence.correct })
    state = routeQuizReducer(state, { type: 'finish' })
    expect(state.answers).toHaveLength(1)
    expect(finishedQuizSummary(state)).toMatchObject({ unknown: 1, unanswered: 1, wrong: 0 })
    expect(routeQuizReducer(state, { type: 'submit' })).toBe(state)
    expect(routeQuizReducer(state, { type: 'reset' })).toEqual(initialRouteQuizState)
    expect(quizOutcome(sequence, { questionId: sequence.id, selected: 'wrong', usedHint: true })).toBe('wrong')
  })
  it('rejects empty, duplicate and oversized rounds', () => {
    for (const questions of [[], [direction, direction], bank.questions.slice(0, 6)]) expect(routeQuizReducer(initialRouteQuizState, { type: 'start', questions })).toBe(initialRouteQuizState)
  })
})
