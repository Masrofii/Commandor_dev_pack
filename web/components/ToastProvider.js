'use client';
import { Toaster } from 'react-hot-toast';

export default function ToastProvider() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 3500,
        className: '!bg-slate-900 !text-slate-100 !border !border-slate-700 !shadow-xl !rounded-xl !text-sm',
      }}
    />
  );
}
