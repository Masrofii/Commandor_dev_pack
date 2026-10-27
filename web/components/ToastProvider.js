'use client';
import { Toaster } from 'react-hot-toast';

export default function ToastProvider() {
  return (
    <Toaster
      position="top-right"
      gutter={10}
      toastOptions={{
        duration: 3500,
        className:
          '!bg-white dark:!bg-cyber-900 !text-cf-ink dark:!text-slate-100 !border !border-cf-200 dark:!border-cyber-800 !shadow-popover !rounded-xl !text-[13px]',
        success: {
          iconTheme: {
            primary: '#f6821f',
            secondary: '#ffffff'
          }
        },
        error: {
          iconTheme: {
            primary: '#e11d48',
            secondary: '#ffffff'
          }
        }
      }}
    />
  );
}
