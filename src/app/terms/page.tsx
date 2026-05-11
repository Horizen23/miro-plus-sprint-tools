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
            By installing, accessing, or using the <strong>Plus Sprint Tools</strong> application, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.
          </p>
        </section>

        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#334155', marginBottom: '16px' }}>2. Service Description</h2>
          <p style={{ color: '#475569', lineHeight: '1.7' }}>
            The App provides integration features designed to facilitate sprint planning and capacity management between Miro and Jira. These services are provided "as is" and "as available."
          </p>
        </section>

        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#334155', marginBottom: '16px' }}>3. User Authorization</h2>
          <p style={{ color: '#475569', lineHeight: '1.7' }}>
            You represent that you have the necessary authority to grant the App access to your organizational Jira and Miro environments. You are responsible for any actions taken through your account within the App.
          </p>
        </section>

        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#334155', marginBottom: '16px' }}>4. Data Privacy & Integrity</h2>
          <p style={{ color: '#475569', lineHeight: '1.7' }}>
            Your use of the App is also governed by our Privacy Policy. We do not store your proprietary Jira/Miro data. You acknowledge that syncing data between platforms involves third-party APIs (Atlassian and Miro), and we are not responsible for their availability or performance.
          </p>
        </section>

        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#334155', marginBottom: '16px' }}>5. Limitation of Liability</h2>
          <p style={{ color: '#475569', lineHeight: '1.7' }}>
            To the maximum extent permitted by law, we shall not be liable for any direct, indirect, incidental, or consequential damages resulting from your use of the App, including but not limited to loss of data or business interruption.
          </p>
        </section>

        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#334155', marginBottom: '16px' }}>6. Support & Contact</h2>
          <p style={{ color: '#475569', lineHeight: '1.7' }}>
            For support or questions regarding these terms, please contact:
          </p>
          <div style={{ marginTop: '16px', padding: '20px', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <p style={{ margin: 0, fontWeight: 600, color: '#1e293b' }}>Plus Sprint Tools Support</p>
            <p style={{ margin: '4px 0 0 0', color: '#2563eb' }}>com100pb@gmail.com</p>
          </div>
        </section>

        <div style={{ marginTop: '50px', paddingTop: '30px', borderTop: '1px solid #f1f5f9', textAlign: 'center' }}>
          <p style={{ fontSize: '12px', color: '#94a3b8' }}>&copy; 2026 Plus Sprint Tools. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
