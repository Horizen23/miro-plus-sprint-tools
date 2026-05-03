'use client';

import dynamic from 'next/dynamic';

// Prevent SSR — Miro SDK and window APIs are browser-only
const PanelContent = dynamic(() => import('./PanelContent'), { ssr: false });

export default function PanelPage() {
  return <PanelContent />;
}
