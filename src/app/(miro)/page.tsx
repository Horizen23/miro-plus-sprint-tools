'use client';

import dynamic from 'next/dynamic';

// Prevent SSR — Miro SDK is browser-only 
const InitContent = dynamic(() => import('./InitContent'), { ssr: false });

export default function HomePage() {
  return <InitContent />;
}

