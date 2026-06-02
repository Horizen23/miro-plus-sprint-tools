'use client';
import * as React from "react";
import { JiraConfig, JiraService, JiraResource } from "../services/jira/JiraService";
import { RealtimeFactory } from "../services/realtime/factory";

const CLIENT_ID = process.env.NEXT_PUBLIC_JIRA_CLIENT_ID || "";
const realtimeService = RealtimeFactory.getInstance();

const getRedirectUri = (): string => {
  if (typeof window === 'undefined') return '';
  if (process.env.NEXT_PUBLIC_JIRA_REDIRECT_URI) return process.env.NEXT_PUBLIC_JIRA_REDIRECT_URI;
  return window.location.origin + window.location.pathname;
};

interface JiraAuthContextValue {
  config: JiraConfig;
  setConfig: React.Dispatch<React.SetStateAction<JiraConfig>>;
  isAuthenticating: boolean;
  availableResources: JiraResource[];
  startOAuth: () => void;
  selectResource: (resource: JiraResource) => void;
  logout: () => void;
}

const JiraAuthContext = React.createContext<JiraAuthContextValue | undefined>(undefined);

interface PendingAuthData {
  accessToken: string;
  refreshToken: string;
}

export const JiraAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = React.useState<JiraConfig>({ authType: 'oauth' });
  const [isAuthenticating, setIsAuthenticating] = React.useState(false);
  const [availableResources, setAvailableResources] = React.useState<JiraResource[]>([]);
  const [pendingAuthData, setPendingAuthData] = React.useState<PendingAuthData | null>(null);

  // Load config on mount
  React.useEffect(() => {
    const configKey = process.env.NEXT_PUBLIC_LOCALSTORAGE_JIRA_CONFIG_KEY || "jira-config-v2";
    const saved = localStorage.getItem(configKey);
    if (saved) {
      try {
        setConfig(JSON.parse(saved) as JiraConfig);
      } catch (e: unknown) {}
    }
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

      if (!resp.ok) {
        throw new Error("Failed to exchange token");
      }

      const data = await resp.json() as { access_token: string, refresh_token: string };
      
      const svc = new JiraService({ ...config, authType: 'oauth', accessToken: data.access_token });
      const res = await svc.getAccessibleResources(data.access_token);
      if (res && res.length > 0) {
        if (res.length === 1) {
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
        } else {
          // Multiple sites found, let user choose
          setAvailableResources(res);
          setPendingAuthData({
            accessToken: data.access_token,
            refreshToken: data.refresh_token
          });
        }
      }
    } catch (e: unknown) { 
      console.error("[JiraAuth] Error in handleTokenExchange:", e); 
    } finally { 
      setIsAuthenticating(false); 
    }
  };

  const authUnsubRef = React.useRef<(() => void) | null>(null);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    // --- Main App Logic (Miro Panel) ---
    realtimeService.connect();
    const currentState = localStorage.getItem(process.env.NEXT_PUBLIC_LOCALSTORAGE_JIRA_STATE_KEY || "jira_auth_state");
    let unsubAuth: (() => void) | undefined;
    
    if (currentState && !code) {
      unsubAuth = realtimeService.subscribeToAuth(currentState, (authCode: string) => {
        const stateKey = process.env.NEXT_PUBLIC_LOCALSTORAGE_JIRA_STATE_KEY || "jira_auth_state";
        if (localStorage.getItem(stateKey) === currentState) {
          localStorage.removeItem(stateKey);
          handleTokenExchange(authCode);
        }
      });
    }

    const handleMessage = (event: MessageEvent) => {
      // Type-safe data check
      const data = event.data as unknown;
      if (data && typeof data === 'object' && (data as Record<string, unknown>).type === 'JIRA_AUTH_CODE') {
        const { code: mCode, state: mState } = data as { code: string, state: string };
        const stateKey = process.env.NEXT_PUBLIC_LOCALSTORAGE_JIRA_STATE_KEY || "jira_auth_state";
        if (mState === localStorage.getItem(stateKey)) { 
          handleTokenExchange(mCode); 
          localStorage.removeItem(stateKey); 
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
      if (unsubAuth) unsubAuth();
    };
  }, [config]);

  const startOAuth = () => {
    if (!CLIENT_ID) {
      if (typeof miro !== 'undefined') {
        miro.board.notifications.showError("Missing JIRA_CLIENT_ID in environment variables.");
      }
      return;
    }
    const state = Math.random().toString(36).substring(7);
    const stateKey = process.env.NEXT_PUBLIC_LOCALSTORAGE_JIRA_STATE_KEY || "jira_auth_state";
    localStorage.setItem(stateKey, state);
    
    // Clear previous subscription if user clicked multiple times
    if (authUnsubRef.current) authUnsubRef.current();
    
    // Listen for this specific session
    authUnsubRef.current = realtimeService.subscribeToAuth(state, (authCode: string) => {
      authUnsubRef.current = null; // Auto clear reference when done
      const savedState = localStorage.getItem(stateKey);
      if (savedState === state) {
        localStorage.removeItem(stateKey);
        handleTokenExchange(authCode);
      }
    });

    const rawScope = process.env.NEXT_PUBLIC_JIRA_SCOPE || "read:jira-work write:jira-work manage:jira-project-config read:jira-user read:me offline_access";
    const cleanScope = rawScope.replace(/['"]/g, '');
    const scope = encodeURIComponent(cleanScope);
    const authUrl = process.env.NEXT_PUBLIC_JIRA_AUTH_URL || "https://auth.atlassian.com";
    const redirectUri = getRedirectUri();
    
    let url = `${authUrl}/authorize?client_id=${CLIENT_ID}&scope=${scope}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&response_type=code&prompt=consent`;
    const audience = process.env.NEXT_PUBLIC_JIRA_AUDIENCE;
    if (audience) url += `&audience=${encodeURIComponent(audience)}`;

    window.open(url, 'JiraAuth', 'width=600,height=800');
  };

  const selectResource = (resource: JiraResource) => {
    if (!pendingAuthData) return;
    
    const newCfg: JiraConfig = { 
      ...config, 
      authType: 'oauth', 
      accessToken: pendingAuthData.accessToken, 
      refreshToken: pendingAuthData.refreshToken, 
      cloudId: resource.id, 
      baseUrl: resource.url 
    };
    setConfig(newCfg); 
    const configKey = process.env.NEXT_PUBLIC_LOCALSTORAGE_JIRA_CONFIG_KEY || "jira-config-v2";
    localStorage.setItem(configKey, JSON.stringify(newCfg)); 
    setAvailableResources([]);
    setPendingAuthData(null);
  };

  const logout = () => {
    setConfig({ authType: 'oauth' });
    setAvailableResources([]);
    setPendingAuthData(null);
    const configKey = process.env.NEXT_PUBLIC_LOCALSTORAGE_JIRA_CONFIG_KEY || "jira-config-v2";
    localStorage.removeItem(configKey);
  };

  return (
    <JiraAuthContext.Provider value={{ config, setConfig, isAuthenticating, availableResources, startOAuth, selectResource, logout }}>
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
