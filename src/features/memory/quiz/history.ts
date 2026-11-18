import { z } from 'zod'
import { QUIZ_ROUND_SIZE, type QuizBank } from './bank'
import { UNKNOWN_ANSWER, type QuizAnswer } from './model'

const answerSchema = z.object({ questionId: z.string().min(1), selected: z.string().min(1), usedHint: z.boolean() })
const resultSchema = z.object({
  id: z.string().min(1), at: z.number().int().nonnegative(),
  questionIds: z.array(z.string().min(1)).min(1).max(QUIZ_ROUND_SIZE), answers: z.array(answerSchema).min(1).max(QUIZ_ROUND_SIZE),
  complete: z.boolean(),
})
export type RouteQuizResult = z.infer<typeof resultSchema>
const historySchema = z.object({ version: z.literal(1), routeId: z.enum(['5', '6', '7']), signature: z.string().min(1).max(100_000), results: z.array(resultSchema).max(12) })
  .refine(history => new Set(history.results.map(result => result.id)).size === history.results.length)
const keyFor = (bank: QuizBank) => `roadtest.route-quiz.v1.${bank.routeId}`

function validResult(result: RouteQuizResult, bank: QuizBank) {
  if (new Set(result.questionIds).size !== result.questionIds.length || result.complete !== (result.answers.length === result.questionIds.length)
    || result.answers.some((answer, index) => answer.questionId !== result.questionIds[index])) return false
  return result.questionIds.every(id => bank.questions.some(question => question.id === id)) && result.answers.every(answer => {
    const question = bank.questions.find(item => item.id === answer.questionId)
    return question && (answer.selected === UNKNOWN_ANSWER || question.options.some(option => option.id === answer.selected))
  })
}

export function readQuizHistory(storage: Pick<Storage, 'getItem'>, bank: QuizBank): { results: RouteQuizResult[]; notice: string } {
  try {
    const raw = storage.getItem(keyFor(bank))
    if (!raw) return { results: [], notice: '' }
    const parsed = historySchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return { results: [], notice: '之前的小测记录无法读取，可以重新测一轮。' }
    if (parsed.data.routeId !== bank.routeId || parsed.data.signature !== bank.signature) return { results: [], notice: '小测内容已更新，之前的记录不用于本轮比较。' }
    const results = parsed.data.results.filter(result => validResult(result, bank))
    return { results, notice: results.length === parsed.data.results.length ? '' : '部分小测记录无法读取，已保留可用记录。' }
  } catch { return { results: [], notice: '本机记录暂时不可用，仍可完成本轮小测。' } }
}

export function makeQuizResult(questionIds: string[], answers: QuizAnswer[], at = Date.now(), id: string = `${at}-${Math.random().toString(36).slice(2)}`): RouteQuizResult {
  return { id, at, questionIds, answers, complete: questionIds.length === answers.length }
}

export function saveQuizResult(storage: Pick<Storage, 'setItem'>, bank: QuizBank, results: RouteQuizResult[], result: RouteQuizResult) {
  const next = [result, ...results.filter(item => item.id !== result.id)].slice(0, 12)
  try {
    const data = historySchema.parse({ version: 1, routeId: bank.routeId, signature: bank.signature, results: next })
    if (!data.results.every(item => validResult(item, bank))) return false
    storage.setItem(keyFor(bank), JSON.stringify(data))
    return true
  } catch { return false }
}
