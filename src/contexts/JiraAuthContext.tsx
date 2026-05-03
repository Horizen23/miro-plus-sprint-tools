import * as React from "react";
import { JiraConfig, JiraService } from "../utils/jiraService";

const CLIENT_ID = process.env.NEXT_PUBLIC_JIRA_CLIENT_ID || "";
const getRedirectUri = () => {
  if (typeof window === 'undefined') return '';
  
  // 1. Priority: Use explicit redirect URI from .env if provided
  if (process.env.NEXT_PUBLIC_JIRA_REDIRECT_URI) {
    return process.env.NEXT_PUBLIC_JIRA_REDIRECT_URI;
  }

  // 2. Fallback: Use current page URL (e.g. http://localhost:3000/panel)
  return window.location.origin + window.location.pathname;
};

interface JiraAuthContextValue {
  config: JiraConfig;
  setConfig: React.Dispatch<React.SetStateAction<JiraConfig>>;
  isAuthenticating: boolean;
  startOAuth: () => void;
  logout: () => void;
}

const JiraAuthContext = React.createContext<JiraAuthContextValue | undefined>(undefined);

export const JiraAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = React.useState<JiraConfig>({ authType: 'oauth' });
  const [isAuthenticating, setIsAuthenticating] = React.useState(false);
  const [isLoaded, setIsLoaded] = React.useState(false);

  // Load config on mount
  React.useEffect(() => {
    const configKey = process.env.NEXT_PUBLIC_LOCALSTORAGE_JIRA_CONFIG_KEY || "jira-config-v2";
    const saved = localStorage.getItem(configKey);
    if (saved) {
      try {
        setConfig(JSON.parse(saved));
      } catch (e) {}
    }
    setIsLoaded(true);
  }, []);

  const handleTokenExchange = async (code: string) => {
    setIsAuthenticating(true);
    try {
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
      const resp = await fetch(`${basePath}/api/jira/auth`, { 
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ 
          code, 
          redirect_uri: getRedirectUri() 
        }), 
      });
      const data = await resp.json();
      const svc = new JiraService({ ...config, authType: 'oauth', accessToken: data.access_token });
      const res = await svc.getAccessibleResources(data.access_token);
      if (res && res.length > 0) {
        const newCfg: JiraConfig = { 
          ...config, 
          authType: 'oauth', 
          accessToken: data.access_token, 
          refreshToken: data.refresh_token, 
          cloudId: res[0].id, 
          baseUrl: res[0].url 
        };
        setConfig(newCfg); 
        const configKey = process.env.NEXT_PUBLIC_LOCALSTORAGE_JIRA_CONFIG_KEY || "jira-config-v2";
        localStorage.setItem(configKey, JSON.stringify(newCfg)); 
      }
    } catch (e) { 
      console.error(e); 
    } finally { 
      setIsAuthenticating(false); 
    }
  };

  React.useEffect(() => {
    // 1. Popup Handler: If we have a code and an opener, we are the OAuth popup
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    
    if (code && window.opener) {
      window.opener.postMessage({ type: 'JIRA_AUTH_CODE', code, state }, window.location.origin);
      window.close();
      return;
    }

    // 2. Main Window Handler: Listen for messages from the popup
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'JIRA_AUTH_CODE') {
        const { code, state: returnedState } = event.data;
        const stateKey = process.env.NEXT_PUBLIC_LOCALSTORAGE_JIRA_STATE_KEY || "jira_auth_state";
        if (returnedState === localStorage.getItem(stateKey)) { 
          handleTokenExchange(code); 
          localStorage.removeItem(stateKey); 
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [config]);

  const startOAuth = () => {
    if (!CLIENT_ID) {
      miro.board.notifications.showError("Missing JIRA_CLIENT_ID in environment variables.");
      return;
    }
    const state = Math.random().toString(36).substring(7);
    const stateKey = process.env.NEXT_PUBLIC_LOCALSTORAGE_JIRA_STATE_KEY || "jira_auth_state";
    localStorage.setItem(stateKey, state);
    
    // Clean up scope (remove quotes if present)
    const rawScope = process.env.NEXT_PUBLIC_JIRA_SCOPE || "read:jira-work write:jira-work manage:jira-project-config read:jira-user read:me offline_access";
    const cleanScope = rawScope.replace(/['"]/g, '');
    const scope = encodeURIComponent(cleanScope);
    
    const audience = process.env.NEXT_PUBLIC_JIRA_AUDIENCE;
    const authUrl = process.env.NEXT_PUBLIC_JIRA_AUTH_URL || "https://auth.atlassian.com";
    const redirectUri = getRedirectUri();
    
    let url = `${authUrl}/authorize?client_id=${CLIENT_ID}&scope=${scope}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&response_type=code`;
    
    if (audience) {
      url += `&audience=${encodeURIComponent(audience)}`;
    }
    
    url += `&prompt=consent`;

    window.open(url, 'JiraAuth', 'width=600,height=800');
  };

  const logout = () => {
    setConfig({ authType: 'oauth' });
    const configKey = process.env.NEXT_PUBLIC_LOCALSTORAGE_JIRA_CONFIG_KEY || "jira-config-v2";
    localStorage.removeItem(configKey);
  };

  return (
    <JiraAuthContext.Provider value={{ config, setConfig, isAuthenticating, startOAuth, logout }}>
      {children}
    </JiraAuthContext.Provider>
  );
};

export const useJiraAuth = () => {
  const context = React.useContext(JiraAuthContext);
  if (context === undefined) {
    throw new Error('useJiraAuth must be used within a JiraAuthProvider');
  }
  return context;
};
