import Link from 'next/link';
import { Button } from '@/components/Button';

export default function NotFound() {
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
      <h1 style={{ fontSize: '64px', color: '#4262ff', marginBottom: '0' }}>404</h1>
      <h2 style={{ color: '#050038', marginBottom: '8px' }}>Page Not Found</h2>
      <p style={{ color: '#8c90b0', marginBottom: '24px', fontSize: '14px' }}>
        The page you are looking for doesn't exist or has been moved.
      </p>
      <Link href="/">
        <Button>Go Home</Button>
      </Link>
    </div>
  );
}
