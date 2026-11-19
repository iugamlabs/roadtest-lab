import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { calibratedEventDocumentSchema } from '@/features/content/schema'
import { loadQuizBank } from './bank'
import { finishedQuizSummary, initialRouteQuizState, quizOutcome, routeQuizReducer, UNKNOWN_ANSWER } from './model'

const source = calibratedEventDocumentSchema.parse(JSON.parse(readFileSync('public/data/route-5.events.json', 'utf8')))
const bank = loadQuizBank(source)
const direction = bank.questions.find(question => question.kind === 'direction')!
const sequence = bank.questions.find(question => question.kind === 'sequence')!
const scene = bank.questions.find(question => question.kind === 'scene')!
const clip = bank.questions.find(question => question.kind === 'clip')!
const start = () => routeQuizReducer(initialRouteQuizState, { type: 'start', questions: [direction, sequence] })

describe('route quiz first-answer locking and deferred feedback', () => {
  it.each([direction, scene, clip])('waits for the media and an explicit reveal on $kind questions', question => {
    let state = routeQuizReducer(initialRouteQuizState, { type: 'start', questions: [question] })
    expect(routeQuizReducer(state, { type: 'reveal-options' })).toBe(state)
    expect(routeQuizReducer(state, { type: 'select', selected: question.correct })).toBe(state)
    expect(routeQuizReducer(state, { type: 'submit' })).toBe(state)
    expect(routeQuizReducer(state, { type: 'frame-ready', questionId: 'stale-question', ready: true })).toBe(state)
    state = routeQuizReducer(state, { type: 'frame-ready', questionId: question.id, ready: true })
    expect(routeQuizReducer(state, { type: 'select', selected: question.correct })).toBe(state)
    state = routeQuizReducer(state, { type: 'reveal-options' })
    expect(state.optionsVisible).toBe(true)
    expect(routeQuizReducer(state, { type: 'select', selected: 'not-an-option' })).toBe(state)
    expect(routeQuizReducer(state, { type: 'submit' })).toBe(state)
  })
  it('locks the first answer and advances immediately without revealing correctness', () => {
    let state = start()
    state = routeQuizReducer(state, { type: 'frame-ready', questionId: direction.id, ready: true })
    state = routeQuizReducer(state, { type: 'reveal-options' })
    const wrong = direction.options.find(option => option.id !== direction.correct)!.id
    state = routeQuizReducer(state, { type: 'select', selected: wrong })
    state = routeQuizReducer(state, { type: 'submit' })
    expect(state).toMatchObject({ index: 1, selected: null, frameReady: true, optionsVisible: false, phase: 'answering' })
    expect(finishedQuizSummary(state)).toBeNull()
    expect(routeQuizReducer(state, { type: 'submit' })).toBe(state)
    expect(routeQuizReducer(state, { type: 'frame-ready', questionId: direction.id, ready: false })).toBe(state)
    expect(state.answers).toEqual([{ questionId: direction.id, selected: wrong, usedHint: false }])
  })
  it('shows results immediately after the last answer and still recognizes assisted history', () => {
    let state = start()
    state = routeQuizReducer(state, { type: 'frame-ready', questionId: direction.id, ready: true })
    state = routeQuizReducer(state, { type: 'reveal-options' })
    state = routeQuizReducer(state, { type: 'select', selected: direction.correct })
    state = routeQuizReducer(state, { type: 'submit' })
    expect(finishedQuizSummary(state)).toBeNull()
    state = routeQuizReducer(state, { type: 'reveal-options' })
    state = routeQuizReducer(state, { type: 'select', selected: sequence.correct })
    state = routeQuizReducer(state, { type: 'submit' })
    expect(finishedQuizSummary(state)).toEqual({ independent: 2, assisted: 0, wrong: 0, unknown: 0, unanswered: 0 })
    expect(quizOutcome(direction, { ...state.answers[0], usedHint: true })).toBe('assisted')
    expect(state).not.toHaveProperty('score')
  })
  it('distinguishes not remembering, wrong answers and unsubmitted questions on early finish', () => {
    let state = start()
    state = routeQuizReducer(state, { type: 'frame-ready', questionId: direction.id, ready: true })
    state = routeQuizReducer(state, { type: 'reveal-options' })
    state = routeQuizReducer(state, { type: 'select', selected: UNKNOWN_ANSWER })
    state = routeQuizReducer(state, { type: 'submit' })
    state = routeQuizReducer(state, { type: 'reveal-options' })
    state = routeQuizReducer(state, { type: 'select', selected: sequence.correct })
    state = routeQuizReducer(state, { type: 'finish' })
    expect(state.answers).toHaveLength(1)
    expect(finishedQuizSummary(state)).toMatchObject({ unknown: 1, unanswered: 1, wrong: 0 })
    expect(routeQuizReducer(state, { type: 'submit' })).toBe(state)
    expect(routeQuizReducer(state, { type: 'reset' })).toEqual(initialRouteQuizState)
    expect(quizOutcome(sequence, { questionId: sequence.id, selected: 'wrong', usedHint: true })).toBe('wrong')
  })
  it('rejects empty, duplicate and oversized rounds', () => {
    for (const questions of [[], [direction, direction], bank.questions.slice(0, 11)]) expect(routeQuizReducer(initialRouteQuizState, { type: 'start', questions })).toBe(initialRouteQuizState)
  })
})
