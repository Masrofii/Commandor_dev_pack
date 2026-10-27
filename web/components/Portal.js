'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

let openModalCount = 0;

export default function Portal({ children }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    openModalCount++;
    const mainEl = document.getElementById('main-content');
    if (openModalCount === 1) {
      if (mainEl) {
        mainEl.dataset.prevOverflow = mainEl.style.overflow;
        mainEl.style.overflow = 'hidden';
      }
      if (typeof document !== 'undefined' && document.body) {
        document.body.dataset.prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
      }
    }

    return () => {
      openModalCount = Math.max(0, openModalCount - 1);
      if (openModalCount === 0) {
        if (mainEl) {
          mainEl.style.overflow = mainEl.dataset.prevOverflow || '';
        }
        if (typeof document !== 'undefined' && document.body) {
          document.body.style.overflow = document.body.dataset.prevOverflow || '';
        }
      }
    };
  }, []);

  if (!mounted || typeof document === 'undefined') {
    return null;
  }

  return createPortal(children, document.body);
}
