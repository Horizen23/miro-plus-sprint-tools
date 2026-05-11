import React from 'react';

export default function TermsOfService() {
  return (
    <div style={{ 
      minHeight: '100vh',
      backgroundColor: '#f8fafc',
      padding: '60px 20px',
      fontFamily: '"Outfit", "Inter", sans-serif'
    }}>
      <div style={{ 
        maxWidth: '800px', 
        margin: '0 auto', 
        backgroundColor: '#ffffff',
        padding: '50px',
        borderRadius: '24px',
        boxShadow: '0 10px 40px rgba(0,0,0,0.04)',
        border: '1px solid #eef2f6'
      }}>
        <div style={{ marginBottom: '40px' }}>
          <h1 style={{ 
            fontSize: '36px', 
            fontWeight: 800, 
            color: '#1e293b',
            marginBottom: '12px',
            background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            Terms of Service
          </h1>
          <p style={{ color: '#64748b', fontSize: '14px' }}>Last Updated: May 11, 2026</p>
        </div>

        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#334155', marginBottom: '16px' }}>1. Acceptance of Terms</h2>
          <p style={{ color: '#475569', lineHeight: '1.7' }}>
            By using <strong>Plus Sprint Tools</strong>, you agree to these terms.
          </p>
        </section>

        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#334155', marginBottom: '16px' }}>2. Service Use</h2>
          <p style={{ color: '#475569', lineHeight: '1.7' }}>
            The App provides integration features for Miro and Jira. Services are provided "as is".
          </p>
        </section>

        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#334155', marginBottom: '16px' }}>3. Liability</h2>
          <p style={{ color: '#475569', lineHeight: '1.7' }}>
            We are not liable for direct or indirect damages resulting from the use of the App.
          </p>
        </section>

        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#334155', marginBottom: '16px' }}>4. Contact Support</h2>
          <p style={{ color: '#475569', lineHeight: '1.7' }}>For inquiries, please contact:</p>
          <p style={{ fontWeight: 600, color: '#2563eb' }}>com100pb@gmail.com</p>
        </section>

        <div style={{ marginTop: '50px', paddingTop: '30px', borderTop: '1px solid #f1f5f9', textAlign: 'center' }}>
          <p style={{ fontSize: '12px', color: '#94a3b8' }}>&copy; 2026 Plus Sprint Tools. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
