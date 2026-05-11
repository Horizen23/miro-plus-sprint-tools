'use client';

import { useEffect } from 'react';
import { Button } from '@/components/Button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="container" style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      height: '100vh',
      textAlign: 'center',
      padding: '20px'
    }}>
      <div style={{ 
        background: 'rgba(255, 107, 107, 0.1)', 
        borderRadius: '50%', 
        width: '64px', 
        height: '64px', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        marginBottom: '20px'
      }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ff6b6b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      </div>
      <h2 style={{ color: '#050038', marginBottom: '8px' }}>Something went wrong!</h2>
      <p style={{ color: '#8c90b0', marginBottom: '24px', fontSize: '14px' }}>
        {error.message || "An unexpected error occurred while running Plus Sprint Tools."}
      </p>
      <Button onClick={() => reset()}>Try again</Button>
    </div>
  );
}
