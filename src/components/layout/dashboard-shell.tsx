'use client'

import { ReactNode } from 'react'
import { SidebarProvider, useSidebar } from '@/contexts/sidebar-context'
import { Sidebar } from './sidebar'

function DashboardContent({ children }: { children: ReactNode }) {
  const { isCollapsed } = useSidebar()

  return (
    <>
      <Sidebar />
      <main
        className="pt-14 transition-all duration-300"
        style={{ paddingLeft: isCollapsed ? '4rem' : '16rem' }}
      >
        <div className="p-6">{children}</div>
      </main>
    </>
  )
}

export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <DashboardContent>{children}</DashboardContent>
    </SidebarProvider>
  )
}
