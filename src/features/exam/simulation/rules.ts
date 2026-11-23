import { z } from 'zod'
import raw from '../../../../content/exam-rules/ga1026-2022-subject3.json'

const clauseSchema = z.string().regex(/^6\.3\.2(?:\.\d+)+-[a-z]+$/)
const pages = z.tuple([z.number().int().positive(), z.number().int().positive()])
const ruleBookSchema = z.object({
  version: z.literal(1),
  standard: z.literal('GA 1026—2022'),
  effectiveDate: z.iso.date(),
  source: z.object({
    filename: z.string().min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    operationPages: pages,
    scoringPages: pages,
  }),
  projectListClause: z.literal('4.3.1.2'),
  examProjects: z.array(z.object({
    item: z.string().regex(/^[a-p]$/),
    name: z.string().min(1),
    operation: z.string().regex(/^5\.3\.1\.\d+$/),
    assessment: z.string().regex(/^6\.3\.2\.2\.\d+$/),
  })).length(16),
  additionalProjects: z.object({ item: z.literal('q'), name: z.string().min(1) }),
  scoreClause: z.literal('6.3.1.1'),
  initialScore: z.literal(100),
  passScore: z.literal(90),
  simulationLightingReference: z.object({ clause: z.literal('6.3.2.2.13'), uses: z.literal('6.3.2.2.12') }),
  projects: z.array(z.object({
    clause: z.string().regex(/^5\.3\.1\.\d+$/),
    name: z.string().min(1),
    requirements: z.array(z.string().min(1)).min(1),
  })).length(16),
  rules: z.array(z.object({
    id: z.string(),
    clause: clauseSchema,
    scope: z.enum(['general', 'project']),
    section: z.string().min(1),
    text: z.string().min(1),
    penalty: z.union([z.literal('fail'), z.literal(5), z.literal(10)]),
  })).length(119),
}).refine(book =>
  new Set(book.projects.map(project => project.clause)).size === book.projects.length &&
  new Set(book.rules.map(rule => rule.clause)).size === book.rules.length &&
  new Set(book.examProjects.map(project => project.item)).size === book.examProjects.length &&
  book.examProjects.every(project =>
    book.projects.some(operation => operation.clause === project.operation) &&
    (project.assessment === book.simulationLightingReference.clause ||
      book.rules.some(rule => rule.clause.startsWith(`${project.assessment}-`)))) &&
  book.rules.every(rule => rule.id === `GA1026-2022-${rule.clause}` &&
    (rule.scope === 'general') === rule.clause.startsWith('6.3.2.1.')))

export const subject3Rules = ruleBookSchema.parse(raw)
type Rule = typeof subject3Rules.rules[number]
const rulesByClause = new Map(subject3Rules.rules.map(rule => [rule.clause, rule]))

export function examRule(clause: string): Rule {
  const rule = rulesByClause.get(clause)
  if (!rule) throw new Error(`Unknown examination clause: ${clause}`)
  return rule
}

export const generalFail = '6.3.2.1.1-'
export const projectRule = (project: number, item: string) => `6.3.2.2.${project}-${item}`
