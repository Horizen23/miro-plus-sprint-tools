'use client';

import { MiroProvider } from '@mirohq/websdk-react-hooks';

export default function MiroAppProvider({ children }: { children: React.ReactNode }) {
  return (
    <MiroProvider>
      {children}
    </MiroProvider>
  );
}
