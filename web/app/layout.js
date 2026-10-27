import '@fontsource-variable/inter';
import '@fontsource/ubuntu/400.css';
import '@fontsource/ubuntu/500.css';
import '@fontsource/ubuntu/700.css';
import './globals.css';
import ToastProvider from '../components/ToastProvider';

export const metadata = {
  title: 'Commandor Dev Pack — Cloud Infrastructure & Self-Hosting Control Panel',
  description: 'Enterprise-grade VPS node management, domain routing, reverse proxy, application deployments, and email platform.',
  manifest: '/manifest.json',
  applicationName: 'Commandor Dev Pack',
  appleWebApp: {
    capable: true,
    title: 'Commandor',
    statusBarStyle: 'default'
  }
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f7f5' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0d10' }
  ]
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');var l=localStorage.getItem('language')||'en';document.documentElement.lang=l;if(l==='ar'||l==='ur'){document.documentElement.dir='rtl';}else{document.documentElement.dir='ltr';}}catch(e){}})();`
          }}
        />
      </head>
      <body className="bg-cf-bg dark:bg-cyber-950 text-cf-ink dark:text-slate-100 min-h-screen antialiased selection:bg-brand-500/20">
        <ToastProvider />
        {children}
      </body>
    </html>
  );
}
