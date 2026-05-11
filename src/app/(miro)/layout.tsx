import Script from 'next/script';
import Providers from '../../components/Providers';

export default function MiroLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Script
        src="https://miro.com/app/static/sdk/v2/miro.js"
        strategy="beforeInteractive"
      />
      <Providers>
        {children}
      </Providers>
    </>
  );
}
