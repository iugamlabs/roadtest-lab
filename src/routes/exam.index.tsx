import { createFileRoute } from '@tanstack/react-router'
import { MapExamHome } from '@/features/exam/map/home'

export const Route = createFileRoute('/exam/')({ component: MapExamHome })
