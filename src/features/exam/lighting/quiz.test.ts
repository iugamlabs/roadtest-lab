import { describe, expect, it } from 'vitest'
import { answerLightingQuiz, createLightingQuiz, lightingQuizScore } from './quiz'
import { lightingCommands } from '@/features/content/lighting-commands'

describe('lighting learning quiz', () => {
  it('draws five distinct commands from the reference without modifying it', () => {
    const original = [...lightingCommands]
    for (const value of [0, 0.5, 0.9999]) {
      const quiz = createLightingQuiz(() => value)
      expect(quiz.questions).toHaveLength(5)
      expect(new Set(quiz.questions.map(question => question[0])).size).toBe(5)
      for (const question of quiz.questions) expect(lightingCommands).toContain(question)
    }
    expect(lightingCommands).toEqual(original)
    expect(createLightingQuiz(() => 0).questions).not.toEqual(createLightingQuiz(() => 0.9999).questions)
  })

  it('awards 20 per correct answer and rejects duplicate or out-of-order answers', () => {
    let quiz = createLightingQuiz(() => 0)
    expect(lightingQuizScore(quiz)).toBe(0)
    expect(answerLightingQuiz(quiz, 1, '近光灯')).toBe(quiz)
    quiz = answerLightingQuiz(quiz, 0, quiz.questions[0][1])
    expect(answerLightingQuiz(quiz, 0, '远光灯')).toBe(quiz)
    expect(lightingQuizScore(quiz)).toBe(20)
    const wrong = quiz.questions[1][1] === '近光灯' ? '远光灯' : '近光灯'
    quiz = answerLightingQuiz(quiz, 1, wrong)
    for (let i = 2; i < 5; i++) quiz = answerLightingQuiz(quiz, i, quiz.questions[i][1])
    expect(lightingQuizScore(quiz)).toBe(80)
    expect(answerLightingQuiz(quiz, 5, '近光灯')).toBe(quiz)
  })

  it('a new attempt has no previous answers or score', () => {
    let quiz = createLightingQuiz()
    for (let i = 0; i < 5; i++) quiz = answerLightingQuiz(quiz, i, quiz.questions[i][1])
    expect(lightingQuizScore(quiz)).toBe(100)
    const restarted = createLightingQuiz()
    expect(restarted.answers).toEqual([])
    expect(lightingQuizScore(restarted)).toBe(0)
  })
})
