import type { Metadata } from 'next'
import './globals.css'

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
      <body>{children}</body>
    </html>
  )
}
