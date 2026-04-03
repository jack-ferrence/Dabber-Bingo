import { useState } from 'react'
import Navbar from './Navbar.jsx'
import Sidebar from './Sidebar.jsx'
import MobileTabBar from './MobileTabBar.jsx'
import InstallPrompt from '../ui/InstallPrompt.jsx'

export default function AppShell({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{ background: 'var(--db-bg-page)', color: 'var(--db-text-primary)' }}
    >
      <Navbar onMenuClick={() => setSidebarOpen(true)} />

      {/* Content area: CSS grid on desktop, single column on mobile */}
      <div className="flex flex-1 overflow-hidden md:grid md:grid-cols-[260px_1fr]">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="flex-1 overflow-y-auto" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          {/* Extra bottom padding on mobile for tab bar (~60px) */}
          <div className="pb-16 md:pb-0">
            {children}
          </div>
        </main>
      </div>

      <MobileTabBar />
      <div className="md:hidden">
        <InstallPrompt />
      </div>
    </div>
  )
}
