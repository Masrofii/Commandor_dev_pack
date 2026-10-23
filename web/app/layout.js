import './globals.css';
import ToastProvider from '../components/ToastProvider';

export const metadata = {
  title: 'Commandor Dev Pack — Cloud Infrastructure & Self-Hosting Control Panel',
  description: 'Enterprise-grade VPS node management, domain routing, reverse proxy, application deployments, and email platform.',
  manifest: '/manifest.json'
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
      <body className="bg-slate-50 dark:bg-cyber-950 text-slate-900 dark:text-slate-100 min-h-screen antialiased selection:bg-indigo-500/20 selection:text-indigo-400">
        <ToastProvider />
        {children}
      </body>
    </html>
  );
}
