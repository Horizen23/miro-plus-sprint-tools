import * as React from "react";
import { SectionHeader } from "../components/SectionHeader";
import { InputField } from "../components/InputField";
import { Button } from "../components/Button";
import { SummaryCard } from "../components/SummaryCard";
import { useGlobalConfig } from "../contexts/GlobalConfigContext";
import { cacheUtils } from "../utils/cacheUtils";

interface CacheInfoEntry {
  name: string;
  expiry: number;
  prefix: string;
}

export const SettingsView: React.FC = () => {
  const { config, updateConfig, isLoading } = useGlobalConfig();
  const [localConfig, setLocalConfig] = React.useState(config);
  const [saving, setSaving] = React.useState(false);
  const [jiraInfo, setJiraInfo] = React.useState<{ name?: string, site?: string } | null>(null);
  const [cacheInfo, setCacheInfo] = React.useState<CacheInfoEntry[]>([]);

  const loadSystemInfo = React.useCallback(() => {
    // 1. Get Jira Info
    const jiraKey = process.env.NEXT_PUBLIC_LOCALSTORAGE_JIRA_CONFIG_KEY || "jira-config-v2";
    const saved = localStorage.getItem(jiraKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { user?: { displayName: string }, siteUrl?: string };
        setJiraInfo({ name: parsed.user?.displayName || "Connected", site: parsed.siteUrl });
      } catch(e: unknown) {}
    } else {
      setJiraInfo(null);
    }

    // 2. Identify active caches with TTL info
    const activeCaches: CacheInfoEntry[] = [];
    const keys = Object.keys(localStorage);
    
    keys.forEach(k => {
      try {
        const raw = localStorage.getItem(k);
        if (!raw) return;
        const entry = JSON.parse(raw) as { expiry?: number };
        if (entry && entry.expiry) {
          if (k.startsWith('miro_cache_tags_')) {
            if (!activeCaches.find(c => c.name === "Miro Tags")) 
              activeCaches.push({ name: "Miro Tags", expiry: entry.expiry, prefix: 'miro_cache_tags_' });
          } else if (k.startsWith('jira_cache_user_')) {
            if (!activeCaches.find(c => c.name === "Jira Users"))
              activeCaches.push({ name: "Jira Users", expiry: entry.expiry, prefix: 'jira_cache_user_' });
          } else if (k.startsWith('jira_cache_issue_types_')) {
            if (!activeCaches.find(c => c.name === "Jira Issue Types"))
              activeCaches.push({ name: "Jira Issue Types", expiry: entry.expiry, prefix: 'jira_cache_issue_types_' });
          } else if (k.startsWith('miro_cache_user_info')) {
            if (!activeCaches.find(c => c.name === "User Info"))
              activeCaches.push({ name: "User Info", expiry: entry.expiry, prefix: 'miro_cache_user_info' });
          }
        }
      } catch(e: unknown) {}
    });
    
    setCacheInfo(activeCaches);
  }, []);

  React.useEffect(() => {
    setLocalConfig(config);
    loadSystemInfo();
  }, [config, loadSystemInfo]);

  const handleClearSpecificCache = (prefix: string, name: string) => {
    cacheUtils.clearByPrefix(prefix);
    loadSystemInfo();
    if (typeof miro !== 'undefined') {
      miro.board.notifications.showInfo(`Cleared cache: ${name}`);
    }
  };

  const handleClearCache = () => {
    cacheUtils.clearAll();
    
    const uiSettings = [
      'miro_timesheet_only_me', 
      'miro_timesheet_include_unassigned', 
      'miro_timesheet_filter_tag', 
      'miro_timesheet_exclude_title'
    ];
    uiSettings.forEach(k => localStorage.removeItem(k));
    
    loadSystemInfo();
    if (typeof miro !== 'undefined') {
      miro.board.notifications.showInfo("All local caches and settings cleared.");
    }
  };

  const handleSave = async () => {
    setSaving(true);
    await updateConfig(localConfig);
    setSaving(false);
    if (typeof miro !== 'undefined') {
      miro.board.notifications.showInfo("Global settings saved to board");
    }
  };

  if (isLoading) return <div className="loading">Loading settings...</div>;

  return (
    <div className="container" style={{ padding: 0 }}>
      <section style={{ gap: '16px' }}>
        {/* System & Connectivity Section */}
        <div>
          <SectionHeader 
            title="System & Connectivity" 
            icon={(
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.55a11 11 0 0 1 14.08 0"></path>
                <path d="M1.42 9a16 16 0 0 1 21.16 0"></path>
                <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
                <line x1="12" y1="20" x2="12.01" y2="20"></line>
              </svg>
            )}
          />
          <SummaryCard>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ 
                  width: '8px', height: '8px', borderRadius: '50%', 
                  background: jiraInfo ? '#00ff88' : '#ff4444',
                  boxShadow: jiraInfo ? '0 0 8px #00ff88' : 'none'
                }}></span>
                <span style={{ fontSize: '12px', fontWeight: 600 }}>Jira: {jiraInfo ? (jiraInfo.name || 'Active') : 'Disconnected'}</span>
              </div>
              {jiraInfo?.site && <span style={{ fontSize: '10px', opacity: 0.6 }}>{jiraInfo.site}</span>}
            </div>
            
            {cacheInfo.length > 0 && (
              <div style={{ fontSize: '11px', marginBottom: '12px' }}>
                <div style={{ opacity: 0.6, marginBottom: '6px' }}>Data Caches (Click to clear individually):</div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {cacheInfo.map((c) => {
                    const minutes = Math.max(0, Math.round((c.expiry - Date.now()) / 1000 / 60));
                    const formatTime = (m: number): string => {
                      if (m >= 1440) return `${Math.round(m / 1440)}d`;
                      if (m >= 60) return `${Math.round(m / 60)}h`;
                      return `${m}m`;
                    };
                    
                    return (
                      <button 
                        key={c.name} 
                        onClick={() => handleClearSpecificCache(c.prefix, c.name)}
                        className="cache-badge-btn"
                        title={`Clear ${c.name} cache`}
                        style={{ 
                          background: '#008f5d', 
                          color: '#ffffff', 
                          padding: '3px 10px', 
                          borderRadius: '6px', 
                          fontSize: '10px',
                          fontWeight: 600,
                          boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          transition: 'all 0.2s ease',
                          outline: 'none'
                        }}
                      >
                        {c.name} ({formatTime(minutes)})
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
                          <line x1="18" y1="6" x2="6" y2="18"></line>
                          <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <Button onClick={handleClearCache} variant="secondary" fullWidth style={{ fontSize: '11px', padding: '4px' }}>
              Reset System Cache & Preferences
            </Button>
          </SummaryCard>
        </div>
        <div>
          <SectionHeader 
            title="Timesheet Patterns" 
            icon={(
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            )}
          />
          <SummaryCard>
            <InputField 
              label="Timesheet Prefix"
              value={localConfig.tsProject}
              onChange={(e) => setLocalConfig({ ...localConfig, tsProject: e.target.value })}
              placeholder="[{project}]"
            />
            <InputField 
              label="Meeting Tag"
              value={localConfig.tsMeetingTag}
              onChange={(e) => setLocalConfig({ ...localConfig, tsMeetingTag: e.target.value })}
              placeholder="meeting"
            />
            <InputField 
              label="Meeting Pattern"
              value={localConfig.tsMeetingPattern}
              onChange={(e) => setLocalConfig({ ...localConfig, tsMeetingPattern: e.target.value })}
            />
            <InputField 
              label="Task Pattern"
              value={localConfig.tsTaskPattern}
              onChange={(e) => setLocalConfig({ ...localConfig, tsTaskPattern: e.target.value })}
            />
            <InputField 
              label="Default Project"
              value={localConfig.tsDefaultProject}
              onChange={(e) => setLocalConfig({ ...localConfig, tsDefaultProject: e.target.value })}
            />
          </SummaryCard>
        </div>

        <div>
          <SectionHeader 
            title="Logic & Mapping" 
            icon={(
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
            )}
          />
          <SummaryCard>
            <InputField 
              label="User Mapping (tag=email/name)"
              isTextArea
              style={{ minHeight: '100px' }}
              value={localConfig.tsUserMapping}
              onChange={(e) => setLocalConfig({ ...localConfig, tsUserMapping: e.target.value })}
              placeholder="toei=toei@company.com"
            />
            <InputField 
              label="Extraction Variables"
              isTextArea
              style={{ minHeight: '80px' }}
              value={localConfig.tsVariables}
              onChange={(e) => setLocalConfig({ ...localConfig, tsVariables: e.target.value })}
            />
            <InputField 
              label="Jira Prefix (for {key})"
              value={localConfig.jiraPrefix}
              onChange={(e) => setLocalConfig({ ...localConfig, jiraPrefix: e.target.value })}
              placeholder="e.g. FTDGENERIC"
            />
            <InputField 
              label="Jira Story Points Field"
              value={localConfig.jiraStoryPointsField}
              onChange={(e) => setLocalConfig({ ...localConfig, jiraStoryPointsField: e.target.value })}
              placeholder="e.g. customfield_10016"
            />
            <InputField 
              label="Timesheet Auto-Fill Details"
              isTextArea
              style={{ minHeight: '150px', fontSize: '11px' }}
              value={localConfig.tsAutoFillDetailPatterns}
              onChange={(e) => setLocalConfig({ ...localConfig, tsAutoFillDetailPatterns: e.target.value })}
              placeholder="Keyword=Description (one per line)"
            />
            <p className="hint" style={{ marginTop: '-4px', marginBottom: '8px' }}>
              Tip: Use short keywords like "Daily Sync". The system will find them anywhere in the card title.
            </p>
          </SummaryCard>
        </div>

        <div style={{ marginTop: 'auto', padding: '16px 0' }}>
          <Button onClick={handleSave} fullWidth disabled={saving}>
            {saving ? 'Saving...' : 'Save All Settings to Board'}
          </Button>
          <p className="hint" style={{ textAlign: 'center', marginTop: '8px' }}>
            These settings are shared with everyone on this board.
          </p>
        </div>
      </section>
    </div>
  );
};
