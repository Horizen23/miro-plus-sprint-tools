'use client';

import dynamic from 'next/dynamic';
import * as React from 'react';

// Prevent SSR — Miro SDK and window.location are browser-only
const VotingContent = dynamic(() => import('./VotingContent'), { ssr: false });
export default function VotingPage() {
  return <VotingContent />;
}
