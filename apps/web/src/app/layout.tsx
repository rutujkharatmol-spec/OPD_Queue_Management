import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Navbar } from '../components/Navbar'
import { AuthWrapper } from '../components/AuthWrapper'
import { NetworkProvider } from '../components/NetworkProvider'
import { ServiceWorkerRegister } from '../components/ServiceWorkerRegister'

export const metadata: Metadata = {
  title: 'AIIMS Kalyani OPD Queue Management',
  description: 'AIIMS Kalyani Real-Time & Offline OPD Queue Management System',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'AIIMS OPD Queue',
  },
}

export const viewport: Viewport = {
  themeColor: '#0284c7',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0284c7" />
        <link rel="icon" href="/icons/icon-192x192.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.svg" />
      </head>
      <body className="bg-slate-950 min-h-screen text-white">
        <ServiceWorkerRegister />
        <NetworkProvider>
          <AuthWrapper>
            <Navbar />
            {children}
          </AuthWrapper>
        </NetworkProvider>
      </body>
    </html>
  )
}
