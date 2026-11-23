import { lightingCommands } from '@/features/content/lighting-commands'


export type LightingAction = typeof lightingCommands[number][1]
export const lightingActions: readonly LightingAction[] = ['打开大灯', '近光灯', '远光灯', '远近光灯交替', '示宽灯（小灯）']
export type LightingQuestion = typeof lightingCommands[number]
export interface LightingQuiz {
  questions: readonly LightingQuestion[]
  answers: readonly LightingAction[]
}

export function createLightingQuiz(random: () => number = Math.random, pool: readonly LightingQuestion[] = lightingCommands): LightingQuiz {
  const questions = [...pool]
  for (let i = questions.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[questions[i], questions[j]] = [questions[j], questions[i]]
  }
  return { questions: questions.slice(0, 5), answers: [] }
}

// The index prevents a second click or stale event from answering the next question.
export function answerLightingQuiz(quiz: LightingQuiz, index: number, answer: LightingAction): LightingQuiz {
  if (index !== quiz.answers.length || index >= quiz.questions.length) return quiz
  return { ...quiz, answers: [...quiz.answers, answer] }
}

export function lightingQuizScore(quiz: LightingQuiz): number {
  return quiz.answers.reduce((score, answer, i) => score + (answer === quiz.questions[i][1] ? 20 : 0), 0)
}
