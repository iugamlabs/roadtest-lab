import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { calibratedEventDocumentSchema } from '@/features/content/schema'
import { chooseQuizQuestions, loadQuizBank, scopedQuizQuestions } from './bank'

const sourceFor = (id: string) => calibratedEventDocumentSchema.parse(JSON.parse(readFileSync(`public/data/route-${id}.events.json`, 'utf8')))
const rawFor = (id: string) => JSON.parse(readFileSync(`content/memory-quizzes/route-${id}.json`, 'utf8'))
const rng = (seed: number) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 0x100000000)

describe('reviewed route quiz content', () => {
  for (const id of ['5', '6', '7']) it(`publishes reviewed route ${id} questions with unambiguous source references`, () => {
    const source = sourceFor(id)
    const bank = loadQuizBank(source)
    expect(bank.notice).toBe('')
    expect(bank.questions.length).toBeGreaterThanOrEqual(9)
    for (const question of bank.questions) {
      expect(question.options.filter(option => option.id === question.correct)).toHaveLength(1)
      expect(question.topicEventIds.every(eventId => source.events.some(event => event.id === eventId))).toBe(true)
      expect(question.options.every(option => !source.excludedEventIds.includes(option.id))).toBe(true)
      if (question.frame) {
        const anchor = source.events.find(event => event.id === question.anchorEventId)!
        expect(question.frame.atMs).toBeLessThanOrEqual(anchor.windowStartMs)
        expect(question.frame.maskTop + question.frame.maskHeight).toBeLessThanOrEqual(100)
      }
    }
  })
  it('closes the bank on source drift, conflicting directions, late frames or broken sequence answers', () => {
    const source = sourceFor('5')
    expect(loadQuizBank({ ...source, videoSha256: '0'.repeat(64) }).questions).toEqual([])
    expect(loadQuizBank({ ...source, subtitleSha256: '0'.repeat(64) }).questions).toEqual([])
    expect(loadQuizBank({ ...source, events: [...source.events].reverse() }).questions).toEqual([])
    for (const mutate of [
      (raw: ReturnType<typeof rawFor>) => { raw.questions[0].correct = 'left' },
      (raw: ReturnType<typeof rawFor>) => { raw.questions[0].frame.atMs = 21_001 },
      (raw: ReturnType<typeof rawFor>) => { raw.questions.push(raw.questions[0]) },
      (raw: ReturnType<typeof rawFor>) => { raw.questions.find((question: { kind: string }) => question.kind === 'sequence').nextEventId = '5-parking' },
      (raw: ReturnType<typeof rawFor>) => { const question = raw.questions.find((question: { kind: string }) => question.kind === 'sequence'); question.choiceEventIds[1] = question.choiceEventIds[0] },
    ]) {
      const raw = rawFor('5'); mutate(raw)
      expect(loadQuizBank(source, raw).questions).toEqual([])
    }
    expect(loadQuizBank(source, rawFor('6')).questions).toEqual([])
    expect(loadQuizBank(source, { version: 1 }).questions).toEqual([])
  })
  for (const id of ['5', '6', '7']) it(`selects five varied questions on route ${id}, with no repeated topics or changed direction positions`, () => {
    const bank = loadQuizBank(sourceFor(id))
    const rounds = new Set<string>()
    for (let seed = 1; seed <= 80; seed++) {
      const round = chooseQuizQuestions(bank.questions, rng(seed))
      expect(round).toHaveLength(5)
      expect(round.filter(question => question.kind === 'direction')).toHaveLength(3)
      expect(round.filter(question => question.kind === 'sequence')).toHaveLength(2)
      const topics = round.flatMap(question => question.topicEventIds)
      expect(new Set(topics).size).toBe(topics.length)
      round.filter(question => question.kind === 'direction').forEach(question => expect(question.options.map(option => option.id)).toEqual(['left', 'straight', 'right', 'uturn']))
      rounds.add(round.map(question => question.id).join(','))
    }
    expect(rounds.size).toBeGreaterThan(5)
  })
  it('restricts segment questions to both sides of a learned transition instead of padding to five', () => {
    const source = sourceFor('5')
    const bank = loadQuizBank(source)
    const ids = source.events.slice(0, 5).map(event => event.id)
    const pool = scopedQuizQuestions(bank, ids)
    expect(pool.every(question => question.topicEventIds.every(id => ids.includes(id)))).toBe(true)
    const round = chooseQuizQuestions(pool, rng(42))
    expect(round.length).toBeGreaterThan(0)
    expect(round.length).toBeLessThan(5)
    expect(scopedQuizQuestions(bank, ['5-parking'])).toEqual([])
    expect(chooseQuizQuestions([])).toEqual([])
  })
})
