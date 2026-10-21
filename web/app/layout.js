import './globals.css';
import ToastProvider from '../components/ToastProvider';

export const metadata = {
  title: 'TempMail Manager',
  description: 'Self-hosted temporary email management platform',
  manifest: '/manifest.json'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`
          }}
        />
      </head>
      <body className="bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 min-h-screen antialiased selection:bg-indigo-500 selection:text-white">
        <ToastProvider />
        {children}
      </body>
    </html>
  );
}
