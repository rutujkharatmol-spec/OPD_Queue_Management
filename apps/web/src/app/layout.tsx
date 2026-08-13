import type { Metadata } from 'next'
import './globals.css'
import { Navbar } from '../components/Navbar'

export const metadata: Metadata = {
  title: 'OPD Queue Management',
  description: 'AIIMS Kalyani OPD Queue Management System',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-slate-950 min-h-screen text-white">
        <Navbar />
        {children}
      </body>
    </html>
  )
}
