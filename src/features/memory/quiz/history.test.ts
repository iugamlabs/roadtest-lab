import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { calibratedEventDocumentSchema } from '@/features/content/schema'
import { loadQuizBank } from './bank'
import { makeQuizResult, readQuizHistory, saveQuizResult } from './history'

const source = calibratedEventDocumentSchema.parse(JSON.parse(readFileSync('public/data/route-5.events.json', 'utf8')))
const bank = loadQuizBank(source)
const questions = bank.questions.slice(0, 2)
const answer = { questionId: questions[0].id, selected: questions[0].correct, usedHint: false }
const result = () => makeQuizResult(questions.map(question => question.id), [answer], 1000, 'round-1')
function storage() { const map = new Map<string, string>(); return { map, getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value) } } }

describe('separate versioned route quiz history', () => {
  it('keeps a partial round without inventing answers, and never touches recall self assessments', () => {
    const local = storage()
    local.setItem('roadtest.route-memory.v1.5', 'self-assessment')
    expect(saveQuizResult(local, bank, [], result())).toBe(true)
    expect(readQuizHistory(local, bank).results).toEqual([result()])
    expect(readQuizHistory(local, bank).results[0].complete).toBe(false)
    expect(local.getItem('roadtest.route-memory.v1.5')).toBe('self-assessment')
  })
  it('keeps twelve recent rounds and does not duplicate the same saved round', () => {
    const local = storage()
    let results = [] as ReturnType<typeof result>[]
    for (let i = 0; i < 15; i++) {
      const round = { ...result(), id: `round-${i}`, at: i }
      expect(saveQuizResult(local, bank, results, round)).toBe(true)
      results = readQuizHistory(local, bank).results
    }
    expect(results).toHaveLength(12)
    expect(results[0].id).toBe('round-14')
    expect(saveQuizResult(local, bank, results, results[0])).toBe(true)
    expect(readQuizHistory(local, bank).results).toHaveLength(12)
  })
  it('rejects damaged data, forged options, answer order and mismatched completion flags', () => {
    const local = storage()
    local.setItem('roadtest.route-quiz.v1.5', '{broken')
    expect(readQuizHistory(local, bank).notice).not.toBe('')
    for (const round of [
      { ...result(), complete: true },
      { ...result(), answers: [{ ...answer, selected: 'forged-option' }] },
      { ...result(), questionIds: [questions[0].id, questions[0].id] },
      { ...result(), answers: [{ ...answer, questionId: questions[1].id }] },
    ]) expect(saveQuizResult(local, bank, [], round)).toBe(false)
  })
  it('does not compare changed question banks or other routes, and survives storage failures', () => {
    const local = storage()
    saveQuizResult(local, bank, [], result())
    expect(readQuizHistory(local, { ...bank, signature: 'changed' }).results).toEqual([])
    local.setItem('roadtest.route-quiz.v1.6', local.getItem('roadtest.route-quiz.v1.5')!)
    expect(readQuizHistory(local, { ...bank, routeId: '6' }).results).toEqual([])
    expect(readQuizHistory({ getItem: () => { throw new Error('blocked') } }, bank).results).toEqual([])
    expect(saveQuizResult({ setItem: () => { throw new Error('full') } }, bank, [], result())).toBe(false)
  })
})
