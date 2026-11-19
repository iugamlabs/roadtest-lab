import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { calibratedEventDocumentSchema } from '@/features/content/schema'
import { chooseQuizQuestions, loadQuizBank, quizKindLabels, scopedQuizQuestions } from './bank'

const sourceFor = (id: string) => calibratedEventDocumentSchema.parse(JSON.parse(readFileSync(`public/data/route-${id}.events.json`, 'utf8')))
const rawFor = (id: string) => JSON.parse(readFileSync(`content/memory-quizzes/route-${id}.json`, 'utf8'))
const rng = (seed: number) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 0x100000000)

describe('reviewed route quiz content', () => {
  for (const [id, count] of [['5', 37], ['6', 36], ['7', 40]] as const) it(`publishes reviewed route ${id} questions with unambiguous source references`, () => {
    const source = sourceFor(id)
    const bank = loadQuizBank(source)
    expect(bank.notice).toBe('')
    expect(bank.questions).toHaveLength(count)
    const stills = bank.questions.filter(question => question.kind === 'scene')
    const clips = bank.questions.filter(question => question.kind === 'clip')
    expect(clips.map(question => question.anchorEventId)).toEqual(stills.map(question => question.anchorEventId))
    for (const [index, question] of clips.entries()) {
      expect(question.options).toEqual(stills[index].options)
      expect(question.correct).toBe(stills[index].correct)
      expect(question.clip!.endMs).toBeLessThanOrEqual(stills[index].frame!.atMs)
    }
    for (const question of bank.questions) {
      expect(question.options.filter(option => option.id === question.correct)).toHaveLength(1)
      expect(question.topicEventIds.every(eventId => source.events.some(event => event.id === eventId))).toBe(true)
      expect(question.options.every(option => !source.excludedEventIds.includes(option.id))).toBe(true)
      if (question.frame) {
        const anchor = source.events.find(event => event.id === question.anchorEventId)!
        expect(question.frame.atMs).toBeLessThanOrEqual(question.kind === 'direction' ? anchor.windowStartMs : anchor.windowEndMs)
        expect(question.frame.maskTop + question.frame.maskHeight).toBeLessThanOrEqual(100)
      }
    }
  })
  it('rejects late or out-of-range clips and clips crossing the unpublished route 6 turn', () => {
    const source = sourceFor('6')
    for (const change of [{ startMs: 329_999 }, { endMs: 338_001 }, { endMs: 331_000 }, { maskTop: 90 }]) {
      const raw = rawFor('6')
      const question = raw.questions.find((item: { id: string }) => item.id === 'scene:6-bus-3')
      Object.assign(question.clip, change)
      expect(loadQuizBank(source, raw).questions).toEqual([])
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
      (raw: ReturnType<typeof rawFor>) => { raw.questions.find((question: { kind: string }) => question.kind === 'sequence').answerEventId = '5-parking' },
      (raw: ReturnType<typeof rawFor>) => { const question = raw.questions.find((question: { kind: string }) => question.kind === 'sequence'); question.choiceEventIds[1] = question.choiceEventIds[0] },
      (raw: ReturnType<typeof rawFor>) => { raw.questions.find((question: { kind: string }) => question.kind === 'scene').choiceEventIds[0] = '5-cross-1' },
      (raw: ReturnType<typeof rawFor>) => { raw.questions.find((question: { kind: string }) => question.kind === 'bridge').afterEventId = '5-parking' },
    ]) {
      const raw = rawFor('5'); mutate(raw)
      expect(loadQuizBank(source, raw).questions).toEqual([])
    }
    expect(loadQuizBank(source, rawFor('6')).questions).toEqual([])
    expect(loadQuizBank(source, { version: 1 }).questions).toEqual([])
  })
  it('rejects forward, backward and three-project links across route 6’s unpublished turn', () => {
    for (const question of [
      { id: 'sequence:6-cross-3', kind: 'sequence', anchorEventId: '6-cross-3', relation: 'next', answerEventId: '6-bus-3', choiceEventIds: ['6-bus-3', '6-bus-4', '6-overtake'] },
      { id: 'sequence:6-bus-3', kind: 'sequence', anchorEventId: '6-bus-3', relation: 'previous', answerEventId: '6-cross-3', choiceEventIds: ['6-cross-3', '6-cross-4', '6-lane-command'] },
      { id: 'bridge:6-bus-3', kind: 'bridge', anchorEventId: '6-bus-3', beforeEventId: '6-cross-3', afterEventId: '6-overtake', choiceEventIds: ['6-bus-3', '6-bus-4', '6-bus-2'] },
    ]) expect(loadQuizBank(sourceFor('6'), { ...rawFor('6'), questions: [question] }).questions).toEqual([])
  })
  for (const id of ['5', '6', '7']) it(`selects four clips and two still recognition questions in every full route ${id} round`, () => {
    const bank = loadQuizBank(sourceFor(id))
    const rounds = new Set<string>()
    for (let seed = 1; seed <= 24; seed++) {
      const round = chooseQuizQuestions(bank.questions, rng(seed))
      expect(round).toHaveLength(10)
      expect(round.filter(question => question.kind === 'clip')).toHaveLength(4)
      expect(round.filter(question => question.kind === 'scene')).toHaveLength(2)
      expect(new Set(round.map(question => question.kind))).toEqual(new Set(Object.keys(quizKindLabels)))
      expect(new Set(round.map(question => question.section)).size).toBe(3)
      const topics = round.flatMap(question => question.topicEventIds)
      expect(new Set(topics).size).toBe(topics.length)
      round.filter(question => question.kind === 'direction').forEach(question => expect(question.options.map(option => option.id)).toEqual(['left', 'straight', 'right', 'uturn']))
      rounds.add(round.map(question => question.id).sort().join(','))
    }
    expect(rounds.size).toBeGreaterThan(5)
  })
  for (const id of ['5', '6', '7']) it(`prefers fresh questions for three consecutive rounds on route ${id}`, () => {
    const bank = loadQuizBank(sourceFor(id))
    for (let seed = 1; seed <= 10; seed++) {
      const recent = new Set<string>()
      for (let i = 0; i < 3; i++) {
        const round = chooseQuizQuestions(bank.questions, rng(seed + i), recent)
        expect(round).toHaveLength(10)
        expect(round.filter(question => question.kind === 'clip')).toHaveLength(4)
        expect(round.filter(question => question.kind === 'scene')).toHaveLength(2)
        expect(round.some(question => !recent.has(question.id))).toBe(true)
        round.forEach(question => recent.add(question.id))
      }
    }
  })
  it('restricts segment questions to learned topics instead of padding to ten', () => {
    const source = sourceFor('5')
    const bank = loadQuizBank(source)
    const ids = source.events.slice(0, 5).map(event => event.id)
    const pool = scopedQuizQuestions(bank, ids)
    expect(pool.every(question => question.topicEventIds.every(id => ids.includes(id)))).toBe(true)
    const round = chooseQuizQuestions(pool, rng(42))
    expect(round.length).toBeGreaterThan(0)
    expect(round.length).toBeLessThan(5)
    expect(scopedQuizQuestions(bank, ['5-parking'])).toEqual([])
    expect(scopedQuizQuestions(bank, ['5-bus-1', '5-cross-1']).some(question => question.kind === 'bridge')).toBe(false)
    expect(scopedQuizQuestions(bank, ['5-bus-1', '5-cross-1', '5-bus-2']).some(question => question.kind === 'bridge')).toBe(true)
    expect(chooseQuizQuestions([])).toEqual([])
  })
})
