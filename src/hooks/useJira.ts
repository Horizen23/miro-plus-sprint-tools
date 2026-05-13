import { useState, useCallback, useRef } from 'react';
import { JiraService } from '@/utils/jiraService';

export interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken?: string;
  accessToken?: string;
  refreshToken?: string;
  authType: 'basic' | 'oauth';
}

/**
 * Hook to manage Jira Service instance and automatic token refreshing.
 */
export function useJira() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshPromiseRef = useRef<Promise<JiraConfig> | null>(null);

  const getActiveConfig = useCallback((): JiraConfig | null => {
    const configKey = process.env.NEXT_PUBLIC_LOCALSTORAGE_JIRA_CONFIG_KEY || "jira-config-v2";
    const saved = localStorage.getItem(configKey);
    return saved ? JSON.parse(saved) : null;
  }, []);

  const saveConfig = useCallback((config: JiraConfig) => {
    const configKey = process.env.NEXT_PUBLIC_LOCALSTORAGE_JIRA_CONFIG_KEY || "jira-config-v2";
    localStorage.setItem(configKey, JSON.stringify(config));
  }, []);

  /**
   * Executes a Jira operation with automatic 401 handling and token refresh.
   */
  const withRefresh = useCallback(async <T>(operation: (service: JiraService) => Promise<T>): Promise<T> => {
    let config = getActiveConfig();
    if (!config) throw new Error("Jira not configured. Please login first.");

    let service = new JiraService(config);

    try {
      return await operation(service);
    } catch (error: any) {
      const is401 = error.status === 401 || error.message?.includes("401");
      
      // Handle OAuth Refresh
      if (is401 && config.authType === 'oauth' && config.refreshToken) {
        if (!refreshPromiseRef.current) {
          setIsRefreshing(true);
          refreshPromiseRef.current = (async () => {
            try {
              const refreshData = await service.refreshAccessToken();
              const updatedConfig = {
                ...config!,
                accessToken: refreshData.access_token,
                refreshToken: refreshData.refresh_token || config!.refreshToken
              };
              saveConfig(updatedConfig);
              return updatedConfig;
            } finally {
              refreshPromiseRef.current = null;
              setIsRefreshing(false);
            }
          })();
        }

        const newConfig = await refreshPromiseRef.current;
        const newService = new JiraService(newConfig);
        return await operation(newService);
      }

      throw error;
    }
  }, [getActiveConfig, saveConfig]);

  return {
    withRefresh,
    isRefreshing,
    hasConfig: !!getActiveConfig()
  };
}

/**
 * Stateless version of withRefresh for use outside of React components (e.g. event handlers)
 */
export async function executeWithRefresh<T>(operation: (service: JiraService) => Promise<T>): Promise<T> {
  const configKey = process.env.NEXT_PUBLIC_LOCALSTORAGE_JIRA_CONFIG_KEY || "jira-config-v2";
  const saved = localStorage.getItem(configKey);
  if (!saved) throw new Error("Jira not configured");

  let config = JSON.parse(saved);
  let service = new JiraService(config);

  try {
    return await operation(service);
  } catch (error: any) {
    const is401 = error.status === 401 || error.message?.includes("401");
    if (is401 && config.authType === 'oauth' && config.refreshToken) {
      const refreshData = await service.refreshAccessToken();
      const updatedConfig = {
        ...config,
        accessToken: refreshData.access_token,
        refreshToken: refreshData.refresh_token || config.refreshToken
      };
      localStorage.setItem(configKey, JSON.stringify(updatedConfig));
      return await operation(new JiraService(updatedConfig));
    }
    throw error;
  }
}
