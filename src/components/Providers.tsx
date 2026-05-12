'use client';

import { MiroProvider } from '@mirohq/websdk-react-hooks';
import { JiraAuthProvider } from '@/contexts/JiraAuthContext';
import { GlobalConfigProvider } from '@/contexts/GlobalConfigContext';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MiroProvider>
      <GlobalConfigProvider>
        <JiraAuthProvider>
          {children}
        </JiraAuthProvider>
      </GlobalConfigProvider>
    </MiroProvider>
  );
}
