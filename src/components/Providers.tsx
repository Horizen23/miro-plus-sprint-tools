'use client';

import { MiroProvider } from '@mirohq/websdk-react-hooks';
import { JiraAuthProvider } from '@/contexts/JiraAuthContext';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MiroProvider>
      <JiraAuthProvider>
        {children}
      </JiraAuthProvider>
    </MiroProvider>
  );
}
