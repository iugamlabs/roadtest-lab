import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import type { CSSProperties } from 'react'
import { AppSidebar } from '@/components/app-sidebar'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: AppLayout,
  notFoundComponent: () => <Card><CardContent><h1 className="page-title mb-5">没有找到这个页面</h1><Button asChild><Link to="/">返回首页</Link></Button></CardContent></Card>,
  errorComponent: ({ reset }) => <Card><CardContent><h1 className="page-title">页面暂时无法打开</h1><p className="muted my-4">请检查网络后重试。</p><div className="flex gap-3"><Button onClick={reset}>重新加载</Button><Button asChild variant="outline"><Link to="/">返回首页</Link></Button></div></CardContent></Card>,
})

function AppLayout() {
  return <SidebarProvider defaultOpen={false} style={{ '--sidebar-width': '13rem', '--sidebar-width-icon': '3.8rem' } as CSSProperties}>
    <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-background focus:p-3">跳到主要内容</a>
    <AppSidebar />
    <SidebarInset id="main" tabIndex={-1} className="min-w-0">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4 md:hidden"><SidebarTrigger className="size-11" aria-label="打开导航" /><span className="font-semibold">路考练习室</span></header>
      <div className="mx-auto w-full max-w-[1800px] flex-1 p-4 md:p-5"><Outlet /></div>
    </SidebarInset>
  </SidebarProvider>
}
