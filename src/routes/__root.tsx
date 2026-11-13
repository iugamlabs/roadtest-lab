import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { BookOpen, CarFront, House, Settings } from 'lucide-react'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: AppLayout,
  notFoundComponent: () => <div className="panel"><h1 className="page-title">没有找到这个页面</h1><Link className="nav-link" to="/">返回路线选择</Link></div>,
  errorComponent: ({ reset }) => <div className="panel"><h1 className="page-title">页面暂时无法打开</h1><p className="muted my-4">请检查网络后重试。</p><button className="nav-link" onClick={reset}>重新加载</button><Link to="/" className="nav-link">返回首页</Link></div>,
})

function AppLayout() {
  return <div className="shell">
    <a href="#main" className="sr-only focus:not-sr-only">跳到主要内容</a>
    <header className="app-header">
      <Link to="/" className="flex items-center gap-3 text-foreground" aria-label="路考练习室首页">
        <span className="rounded-2xl bg-primary p-3 text-white"><CarFront size={30} aria-hidden /></span>
        <span><strong className="block text-xl">路考练习室</strong><span className="text-xs text-muted-foreground">汕头大学路 · C2 自动挡</span></span>
      </Link>
      <nav aria-label="主要导航">
        <Link to="/" activeOptions={{ exact: true }} className="nav-link"><House size={20} aria-hidden />路线选择</Link>
        <Link to="/materials" className="nav-link"><BookOpen size={20} aria-hidden />路线资料</Link>
        <Link to="/settings" className="nav-link"><Settings size={20} aria-hidden />学习设置</Link>
      </nav>
    </header>
    <main id="main" tabIndex={-1}><Outlet /></main>
    <footer className="mt-10 flex flex-wrap justify-between gap-3 border-t border-border pt-6 text-sm text-muted-foreground"><span>看熟路线，练好每一个动作。</span><span>教学辅助 · 路线节点正在校对</span></footer>
  </div>
}
