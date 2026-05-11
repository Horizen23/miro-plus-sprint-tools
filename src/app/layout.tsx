import Script from 'next/script';
import './globals.css';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APP_NAME || 'Plus Sprint Tools',
  description: `${process.env.NEXT_PUBLIC_APP_NAME || 'Plus Sprint Tools'} - Miro Sprint Planning & Estimation Toolkit`,
};

import Providers from '../components/Providers';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
      </head>
      <body>
        <div id="root">
          {children}
        </div>
      </body>
    </html>
  );
}
