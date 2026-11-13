import { Link, useRouterState } from '@tanstack/react-router'
import { BookOpen, CarFront, ClipboardCheck, House, PanelLeftClose, PanelLeftOpen, Route as RouteIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar'

// Adapted from the official shadcn sidebar-07 block for TanStack Router.
export function AppSidebar() {
  const pathname = useRouterState({ select: state => state.location.pathname })
  const { isMobile, setOpenMobile, toggleSidebar, open } = useSidebar()
  const expanded = isMobile || open
  const closeMobile = () => { if (isMobile) setOpenMobile(false) }
  const items = [
    { to: '/' as const, title: '首页', icon: House, active: pathname === '/' },
    { to: '/train' as const, title: '路线练习', icon: RouteIcon, active: pathname.startsWith('/train') },
    { to: '/exam' as const, title: '场景考试', icon: ClipboardCheck, active: pathname.startsWith('/exam') },
    { to: '/materials' as const, title: '路线资料', icon: BookOpen, active: pathname === '/materials' },
  ]
  return <Sidebar collapsible="icon">
    <SidebarHeader className="border-b p-1.5">
      <div className="flex items-center gap-1">
      <SidebarMenu className="min-w-0 group-data-[collapsible=icon]:hidden"><SidebarMenuItem><SidebarMenuButton asChild size="lg" tooltip="路考练习室" className="h-14">
        <Link to="/" onClick={closeMobile}><CarFront className="!size-6" aria-hidden /><span className="grid gap-1"><strong className="text-base">路考练习室</strong><span className="text-xs text-muted-foreground">汕头大学路 · C2</span></span></Link>
      </SidebarMenuButton></SidebarMenuItem></SidebarMenu>
      <Button type="button" variant="ghost" size="icon" className="size-[56px] shrink-0" onClick={toggleSidebar} aria-label={expanded ? '收起导航' : '展开导航'} aria-expanded={expanded} title={expanded ? '收起导航' : '展开导航'}>{expanded ? <PanelLeftClose aria-hidden /> : <PanelLeftOpen aria-hidden />}</Button>
      </div>
    </SidebarHeader>
    <SidebarContent>
      <SidebarGroup><SidebarGroupLabel>学习导航</SidebarGroupLabel><SidebarGroupContent>
        <nav aria-label="主要导航"><SidebarMenu>{items.map(item => <SidebarMenuItem key={item.to}>
          <SidebarMenuButton asChild isActive={item.active} tooltip={item.title} className="min-h-[56px] text-base group-data-[collapsible=icon]:!size-[56px] group-data-[collapsible=icon]:!p-3">
            <Link to={item.to} aria-current={item.active ? 'page' : undefined} activeOptions={{ exact: true }} onClick={closeMobile}><item.icon className="!size-6" aria-hidden /><span>{item.title}</span></Link>
          </SidebarMenuButton>
        </SidebarMenuItem>)}</SidebarMenu></nav>
      </SidebarGroupContent></SidebarGroup>
    </SidebarContent>
    <SidebarFooter className="border-t p-3">
      <p className="px-2 py-2 text-sm leading-relaxed text-muted-foreground group-data-[collapsible=icon]:hidden">汕头大学路 · C2<br />按自己的节奏练习</p>
    </SidebarFooter>
  </Sidebar>
}
