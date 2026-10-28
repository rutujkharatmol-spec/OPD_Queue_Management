import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Navbar } from '../components/Navbar'
import { AuthWrapper } from '../components/AuthWrapper'
import { NetworkProvider } from '../components/NetworkProvider'
import { ServiceWorkerRegister } from '../components/ServiceWorkerRegister'
import { SystemWatermark } from '../components/SystemWatermark'

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

/**
 * Next.js 16 builds for Chrome 111+ / Safari 16.4+ / Firefox 111+. Older browsers (many
 * smart TVs and old Android Chrome) can't run the app and showed a blank screen on /tv.
 * This sends them to /tv-lite, a plain-JavaScript board in public/tv-lite.html.
 *
 * oklch() colours arrived in Chrome 111 / Safari 15.4 / Firefox 113, and class static
 * blocks in Chrome 94 / Safari 16.4 / Firefox 93, so a browser with both is at the
 * Next.js baseline. Add ?full=1 to force the full board anyway.
 */
const LEGACY_TV_REDIRECT = `(function(){try{
var p=location.pathname;if(p!=='/tv'&&p!=='/tv/')return;
if(/[?&]full=1/.test(location.search))return;
var modern=false;
try{modern=!!(window.CSS&&CSS.supports&&CSS.supports('color','oklch(0.5 0.1 200)'));if(modern){new Function('class A{static{}}');}}catch(e){modern=false;}
if(!modern)location.replace('/tv-lite'+location.search);
}catch(e){}})();`;

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
        {/* Must stay ES5 and run before the app loads: old TV browsers can't run the app at all. */}
        <script dangerouslySetInnerHTML={{ __html: LEGACY_TV_REDIRECT }} />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0284c7" />
        <link rel="icon" href="/icons/icon-192x192.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.svg" />
      </head>
      <body className="bg-slate-950 min-h-screen text-white">
        <ServiceWorkerRegister />
        <SystemWatermark />
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
