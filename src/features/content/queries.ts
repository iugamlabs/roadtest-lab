import { queryOptions } from '@tanstack/react-query'
import { reviewedSubtitleDocumentSchema, type RouteId } from './schema'

export const roadRoutes = [
  { id: '5', name: '五号线', description: '学习变道后的选道，以及连续转弯。' },
  { id: '6', name: '六号线', description: '熟悉掉头、车道调整与沿途观察位置。' },
  { id: '7', name: '七号线', description: '熟悉两次掉头、超车及返回路线。' },
] as const

export function subtitlesQueryOptions(routeId: RouteId) {
  return queryOptions({
    queryKey: ['subtitles', routeId, 'reviewed'],
    queryFn: async () => {
      const response = await fetch(`${import.meta.env.BASE_URL}data/route-${routeId}.subtitles.json`)
      if (!response.ok) throw new Error('字幕暂时无法读取，请重新加载。')
      const document = reviewedSubtitleDocumentSchema.parse(await response.json())
      if (document.routeId !== routeId) throw new Error('字幕与当前路线不一致。')
      return document
    },
    staleTime: Infinity,
    retry: 1,
  })
}

export function mediaUrl(routeId: RouteId, extension: 'mp4' | 'jpg') {
  return `${import.meta.env.BASE_URL}media/route-${routeId}.${extension}`
}

export function formatTime(seconds: number) {
  const value = Math.floor(Math.max(0, seconds))
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}
