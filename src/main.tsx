import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { LazyMotion, MotionConfig } from 'motion/react'
import { SettingsProvider } from '@/features/settings/settings'
import { routeTree } from './routeTree.gen'
import './styles.css'

const queryClient = new QueryClient()
const router = createRouter({ routeTree, context: { queryClient }, defaultPreload: 'intent', defaultPreloadStaleTime: 0, basepath: import.meta.env.BASE_URL })
declare module '@tanstack/react-router' { interface Register { router: typeof router } }
const loadFeatures = () => import('@/lib/motion-features').then(module => module.default)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
        <MotionConfig reducedMotion="user">
          <LazyMotion features={loadFeatures} strict><RouterProvider router={router} /></LazyMotion>
        </MotionConfig>
      </SettingsProvider>
    </QueryClientProvider>
  </StrictMode>,
)
