import React from 'react';

export default function PrivacyPolicy() {
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
            Privacy Policy
          </h1>
          <p style={{ color: '#64748b', fontSize: '14px' }}>Last Updated: May 11, 2026</p>
        </div>

        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#334155', marginBottom: '16px' }}>1. Introduction</h2>
          <p style={{ color: '#475569', lineHeight: '1.7' }}>
            This Privacy Policy explains how <strong>Plus Sprint Tools</strong> ("we", "our", or "the App") handles your data when you use our integration with Atlassian (Jira) and Miro.
          </p>
        </section>

        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#334155', marginBottom: '16px' }}>2. Data We Access</h2>
          <p style={{ color: '#475569', lineHeight: '1.7', marginBottom: '12px' }}>
            To provide its functionality, the App requests access to your Jira and Miro data via official OAuth 2.0 protocols. This includes:
          </p>
          <ul style={{ color: '#475569', lineHeight: '1.8', paddingLeft: '20px' }}>
            <li><strong>Jira Work Items:</strong> Read and write access to issues, sprints, and project configurations.</li>
            <li><strong>Miro Board Content:</strong> Access to card data and metadata to synchronize with Jira.</li>
            <li><strong>User Profile:</strong> Basic identity information (email and name).</li>
          </ul>
        </section>

        <section style={{ marginBottom: '32px', padding: '24px', backgroundColor: '#f0f9ff', borderRadius: '16px', border: '1px solid #bae6fd' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0369a1', marginBottom: '16px' }}>3. Data Storage & Security</h2>
          <p style={{ color: '#0c4a6e', lineHeight: '1.7' }}>
            <strong>Zero Persistence:</strong> We do not store your Jira or Miro data on our servers. All processing happens in real-time within your browser session.
          </p>
        </section>

        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#334155', marginBottom: '16px' }}>4. Contact Support</h2>
          <p style={{ color: '#475569', lineHeight: '1.7' }}>For privacy concerns, please contact:</p>
          <p style={{ fontWeight: 600, color: '#2563eb' }}>com100pb@gmail.com</p>
        </section>

        <div style={{ marginTop: '50px', paddingTop: '30px', borderTop: '1px solid #f1f5f9', textAlign: 'center' }}>
          <p style={{ fontSize: '12px', color: '#94a3b8' }}>&copy; 2026 Plus Sprint Tools. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
