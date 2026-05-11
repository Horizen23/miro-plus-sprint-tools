'use client';

import React, { useEffect, useState } from 'react';
import { RealtimeFactory } from '../../../../services/realtime/factory';

export default function AuthCallbackPage() {
  const [done, setDone] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');

    if (code && state) {
      const realtimeService = RealtimeFactory.getInstance();
      realtimeService.connect();
      realtimeService.sendAuthSuccess(state, code);
      
      if (window.opener) {
        window.opener.postMessage({ type: 'JIRA_AUTH_CODE', code, state }, "*");
      }
      localStorage.setItem("jira_sync_exchange_" + state, JSON.stringify({ code, timestamp: Date.now() }));
      
      setDone(true);
      setTimeout(() => window.close(), 1000);
    }
  }, []);

  return (
    <div className="clean-wrapper">
      <div className={`content ${done ? 'show' : ''}`}>
        <svg className="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
          <circle className="checkmark__circle" cx="26" cy="26" r="25" fill="none"/>
          <path className="checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
        </svg>
        <p>Authentication Complete</p>
        <span className="sub">You can close this window now</span>
      </div>

      <style jsx>{`
        .clean-wrapper {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          background: white;
          font-family: -apple-system, system-ui, sans-serif;
          -webkit-font-smoothing: antialiased;
        }
        
        .content {
          text-align: center;
          opacity: 0;
          transform: translateY(10px);
          transition: all 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        
        .content.show {
          opacity: 1;
          transform: translateY(0);
        }
        
        p {
          font-size: 1.2rem;
          font-weight: 500;
          color: #111;
          margin: 20px 0 5px;
        }
        
        .sub {
          font-size: 0.9rem;
          color: #888;
        }

        .checkmark {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          display: block;
          stroke-width: 2;
          stroke: #111;
          stroke-miterlimit: 10;
          margin: 0 auto;
        }

        .checkmark__circle {
          stroke-dasharray: 166;
          stroke-dashoffset: 166;
          stroke-width: 2;
          stroke-miterlimit: 10;
          stroke: #eee;
          fill: none;
          animation: stroke 0.6s cubic-bezier(0.65, 0, 0.45, 1) forwards;
        }

        .checkmark__check {
          transform-origin: 50% 50%;
          stroke-dasharray: 48;
          stroke-dashoffset: 48;
          animation: stroke 0.3s cubic-bezier(0.65, 0, 0.45, 1) 0.6s forwards;
        }

        @keyframes stroke {
          100% { stroke-dashoffset: 0; }
        }
      `}</style>
    </div>
  );
}
