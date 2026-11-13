import { createFileRoute } from '@tanstack/react-router'
import { PrototypeWorkspace } from '@/features/exam/prototype/workspace'

export const Route = createFileRoute('/exam/prototype')({ component: PrototypeWorkspace })
