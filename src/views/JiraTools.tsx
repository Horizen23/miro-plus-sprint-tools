import * as React from "react";
import type { Card, AppCard } from "@mirohq/websdk-types";
import { JiraService } from "../utils/jiraService";
import { SectionHeader } from "../components/SectionHeader";
import { SummaryCard, SummaryItem, SummaryRow, SummaryDivider } from "../components/SummaryCard";
import { Button } from "../components/Button";
import { InputField } from "../components/InputField";
import { ListItem } from "../components/ListItem";
import { useJiraAuth } from "../contexts/JiraAuthContext";
import { useGlobalConfig } from "../contexts/GlobalConfigContext";
import { parseUserMapping, getCardMappedUser } from "../utils/mappingUtils";

interface SelectedCard {
  id: string;
  type: string;
  title: string;
  description: string;
  startDate?: string;
  dueDate?: string;
  assigneeId?: string;
  detectedParentKey?: string;
  syncedKey?: string;
  lastSyncedTitle?: string;
  x: number;
  y: number;
}

export const JiraTools: React.FC<{ selection?: any[] }> = ({ selection = [] }) => {
  const { config, setConfig, isAuthenticating, startOAuth, logout } = useJiraAuth();
  
  const [showConfig, setShowConfig] = React.useState(!config.accessToken && !config.apiToken);
  const [selectedCards, setSelectedCards] = React.useState<SelectedCard[]>([]);
  const [checkedIds, setCheckedIds] = React.useState<Set<string>>(new Set());
  
  const [appParentKey, setAppParentKey] = React.useState("");
  const [appParentTitle, setAppParentTitle] = React.useState("");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<any[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);

  React.useEffect(() => {
    if (config.accessToken) {
      setShowConfig(false);
    }
  }, [config.accessToken]);

  const notify = (msg: string, type: 'info' | 'error' = 'info') => {
    const truncated = msg.length > 80 ? msg.substring(0, 77) + "..." : msg;
    if (type === 'info') miro.board.notifications.showInfo(truncated);
    else miro.board.notifications.showError(truncated);
  };

  const withRefresh = async <T,>(fn: (service: JiraService) => Promise<T>): Promise<T> => {
    let service = new JiraService(config);
    try {
      return await fn(service);
    } catch (e: any) {
      if (e.message?.includes("401") && config.authType === 'oauth' && config.refreshToken) {
        try {
          const refreshData = await service.refreshAccessToken();
          const newConfig = { ...config, accessToken: refreshData.access_token, refreshToken: refreshData.refresh_token || config.refreshToken };
          const configKey = process.env.NEXT_PUBLIC_LOCALSTORAGE_JIRA_CONFIG_KEY || "jira-config-v2";
          setConfig(newConfig);
          localStorage.setItem(configKey, JSON.stringify(newConfig));
          const nextService = new JiraService(newConfig);
          return await fn(nextService);
        } catch (refreshError) { setShowConfig(true); throw refreshError; }
      }
      throw e;
    }
  };

  // --- Search Logic ---
  React.useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.length >= 2) {
        setIsSearching(true);
        try {
          const results = await withRefresh(s => s.searchIssues(searchQuery));
          setSearchResults(results);
        } catch (e) { console.error(e); } finally { setIsSearching(false); }
      } else { setSearchResults([]); }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery, config]);

  const selectSearchResult = (issue: any) => {
    setAppParentKey(issue.key);
    setAppParentTitle(issue.summaryText || issue.summary);
    setSearchQuery("");
    setSearchResults([]);
  };

  const selectionIds = selection.map(item => item.id).join(',');

  // --- Selection Detection Logic ---
  const detectSelection = async () => {
    try {
      const tags = await miro.board.get({ type: 'tag' });
      
      const items: SelectedCard[] = [];
      for (const item of selection) {
        if (item.type !== 'card' && item.type !== 'app_card') continue;
        
        const itemAny = item as any;
        const itemTags = tags.filter(t => itemAny.tagIds?.includes(t.id));
        const jiraTag = itemTags.find(t => t.title.toLowerCase().startsWith('jira-'));
        
        // Get Metadata for Smart Sync
        let syncedInfo: any = null;
        if (itemAny.getMetadata) {
          const metadataKey = process.env.NEXT_PUBLIC_MIRO_METADATA_KEY || "jira-sync";
          syncedInfo = await itemAny.getMetadata(metadataKey);
        }

        items.push({
          id: item.id, type: item.type,
          title: itemAny.title?.replace(/<[^>]*>/g, '') || "",
          description: itemAny.description?.replace(/<[^>]*>/g, '') || "",
          startDate: itemAny.startDate,
          dueDate: itemAny.dueDate,
          assigneeId: itemAny.assignee?.userId,
          detectedParentKey: jiraTag ? jiraTag.title.split('-').slice(1).join('-').toUpperCase() : undefined,
          syncedKey: syncedInfo?.key,
          lastSyncedTitle: syncedInfo?.lastTitle,
          x: itemAny.x, y: itemAny.y
        });
      }
      setSelectedCards(items);
    } catch (e) { console.error("Detection Error:", e); }
  };

  // --- Auto-Refresh Effect ---
  React.useEffect(() => {
    detectSelection();
  }, [selectionIds]);

  // --- Sync Checkbox Logic ---
  React.useEffect(() => {
    setCheckedIds(prev => {
      const nextChecked = new Set(prev);
      let changed = false;
      selectedCards.forEach(c => {
        const isCreateValid = !!(appParentKey || c.detectedParentKey);
        const isSynced = !!c.syncedKey;
        const hasChanged = isSynced && c.title !== c.lastSyncedTitle;
        const canBeChecked = isCreateValid || isSynced;

        if ((isCreateValid && !isSynced) || hasChanged) {
          if (!prev.has(c.id)) {
            nextChecked.add(c.id);
            changed = true;
          }
        }
        
        if (!canBeChecked && prev.has(c.id)) {
          nextChecked.delete(c.id);
          changed = true;
        }
      });
      return changed ? nextChecked : prev;
    });
  }, [selectedCards, appParentKey]);

  const toggleCheck = (card: SelectedCard) => {
    const isCreateValid = !!(appParentKey || card.detectedParentKey);
    const isSynced = !!card.syncedKey;
    if (!isCreateValid && !isSynced) return;

    const next = new Set(checkedIds);
    if (next.has(card.id)) next.delete(card.id);
    else next.add(card.id);
    setCheckedIds(next);
  };

  const handleSelectAll = () => {
    const validIds = selectedCards.filter(c => !!(appParentKey || c.detectedParentKey) || !!c.syncedKey).map(c => c.id);
    if (checkedIds.size >= validIds.length && validIds.length > 0) setCheckedIds(new Set());
    else setCheckedIds(new Set(validIds));
  };

  // --- Global Config (User Mapping) ---
  const { config: globalConfig } = useGlobalConfig();

  // --- Main Sync Action ---
  const syncToJira = async () => {
    const cardsToSync = selectedCards.filter(c => checkedIds.has(c.id));
    if (cardsToSync.length === 0) return;
    
    setIsProcessing(true);
    let createCount = 0;
    let updateCount = 0;
    const baseUrl = config.baseUrl || "";
    
    try {
      const boardInfo = await miro.board.getInfo();
      const boardId = boardInfo.id;
      const userInfo = await miro.board.getUserInfo();
      const currentMiroUserId = userInfo.id;

      // Parse User Mapping using utility
      const mapping = parseUserMapping(globalConfig?.tsUserMapping || "");

      // Cache for Jira Account IDs to avoid redundant searches
      const jiraAccountCache = new Map<string, string>();

      // Pre-fetch my Jira account ID
      try {
        const myself = await withRefresh(s => s.getMyself());
        if (myself) jiraAccountCache.set((userInfo as any).email?.toLowerCase() || 'me', myself.accountId);
      } catch (e) { console.warn("Could not fetch my Jira profile", e); }

      const allBoardTags = await miro.board.get({ type: 'tag' });

      for (const card of cardsToSync) {
        const originalItem = await miro.board.getById(card.id) as any;
        if (!originalItem) continue;

        // --- Determine Assignee ---
        let targetAssignee: string | undefined;

        // 1. Check if assigned to current user in Miro
        if (card.assigneeId === currentMiroUserId) {
          targetAssignee = jiraAccountCache.get((userInfo as any).email?.toLowerCase() || 'me');
        }

        // 2. Check User Mapping if no assignee found yet
        if (!targetAssignee && mapping.size > 0) {
          const cardTagTitles = allBoardTags
            .filter(t => originalItem.tagIds?.includes(t.id))
            .map(t => t.title);

          const mappedUser = getCardMappedUser(cardTagTitles, mapping);
          if (mappedUser) {
            // Try to find this user in Jira (if not cached)
            if (jiraAccountCache.has(mappedUser)) {
              targetAssignee = jiraAccountCache.get(mappedUser);
            } else {
              try {
                const foundUsers = await withRefresh(s => s.findUsers(mappedUser)) as any[];
                if (foundUsers && foundUsers.length > 0) {
                  const accountId = foundUsers[0].accountId;
                  jiraAccountCache.set(mappedUser, accountId);
                  targetAssignee = accountId;
                }
              } catch (err) { console.warn(`Could not find Jira user for: ${mappedUser}`, err); }
            }
          }
        }

        try {
          if (card.syncedKey) {
            // MODE: UPDATE EXISTING ISSUE
            try {
              await withRefresh(s => s.updateIssue(card.syncedKey!, card.title, card.dueDate, card.startDate, targetAssignee));
              
              // Stamp metadata and card
              const now = new Date().toLocaleString();
              const stamp = `\n\n---\nJira Update: ${card.syncedKey}\nUpdated at: ${now}`;
              originalItem.description = (card.description || "").split('\n\n---')[0] + stamp;
              const metadataKey = process.env.NEXT_PUBLIC_MIRO_METADATA_KEY || "jira-sync";
              await originalItem.setMetadata(metadataKey, { key: card.syncedKey, lastTitle: card.title });
              await originalItem.sync();
              updateCount++;
            } catch (updateErr: any) {
              if (updateErr.message?.includes("404")) {
                notify(`Issue ${card.syncedKey} not found in Jira. Clearing metadata for re-sync.`, "error");
                const metadataKey = process.env.NEXT_PUBLIC_MIRO_METADATA_KEY || "jira-sync";
                await originalItem.setMetadata(metadataKey, null);
                originalItem.linkedTo = undefined;
                await originalItem.sync();
              } else {
                throw updateErr;
              }
            }
          } else if (!card.syncedKey) {
            // MODE: CREATE NEW SUBTASK
            const finalParentKey = appParentKey || card.detectedParentKey;
            if (!finalParentKey) continue;

            const boardUrl = process.env.NEXT_PUBLIC_MIRO_BOARD_URL || "https://miro.com/app/board/";
            const miroDeepLink = `${boardUrl}${boardId}/?moveToWidget=${card.id}`;
            const jiraDescription = `${card.description}\n\n---\nMiro Card Link: ${miroDeepLink}`;

            const newIssue = await withRefresh(s => s.createSubtask(finalParentKey, card.title, jiraDescription, card.dueDate, card.startDate, targetAssignee));
            const jiraLink = config.authType === 'oauth' ? `${baseUrl}/browse/${newIssue.key}` : `${baseUrl.replace('/rest/api/3', '')}/browse/${newIssue.key}`;

            const now = new Date().toLocaleString();
            const stamp = `\n\n---\nJira Issue: ${newIssue.key}\nSynced at: ${now}`;
            
            originalItem.description = (card.description || "") + stamp;
            originalItem.linkedTo = jiraLink;
            const metadataKey = process.env.NEXT_PUBLIC_MIRO_METADATA_KEY || "jira-sync";
            await originalItem.setMetadata(metadataKey, { key: newIssue.key, lastTitle: card.title });
            await originalItem.sync();
            createCount++;
          }
        } catch (e: any) { 
          console.error(e); 
          notify(`Failed to sync: ${e.message}`, "error");
        }
      }

      if (createCount > 0 || updateCount > 0) {
        notify(`Success! Created ${createCount}, Updated ${updateCount} items.`);
      }
      
      await detectSelection();
      setAppParentKey("");
      setCheckedIds(new Set());
    } catch (e) { notify("Sync Error: " + (e as Error).message, "error"); }
    finally { setIsProcessing(false); }
  };


  const validItemsCount = selectedCards.filter(c => (appParentKey || c.detectedParentKey) || (c.syncedKey && c.title !== c.lastSyncedTitle)).length;

  return (
    <div className="jira-container">
      <SectionHeader 
        title="Jira Sync" 
        icon={(
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        )}
        isExpandable
        isExpanded={showConfig}
        onToggle={() => setShowConfig(!showConfig)}
      />

      <main className="content">
        {showConfig && (
          <SummaryCard>
            <div className="section-header-row">
              <div className="unit-tabs">
                <button className={`unit-tab ${config.authType === 'oauth' ? 'active' : ''}`} onClick={() => setConfig({...config, authType: 'oauth'})}>OAuth</button>
                <button className={`unit-tab ${config.authType === 'basic' ? 'active' : ''}`} onClick={() => setConfig({...config, authType: 'basic'})}>Basic</button>
              </div>
            </div>
            {config.authType === 'oauth' ? (
              <Button loading={isAuthenticating} onClick={startOAuth} fullWidth>
                {config.accessToken ? "Reconnect Account" : "Connect Jira"}
              </Button>
            ) : (
              <div className="config-body" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <InputField placeholder="Base URL (https://your-domain.atlassian.net)" value={config.baseUrl || ""} onChange={e => setConfig({...config, baseUrl: e.target.value})} />
                <InputField placeholder="Email" value={config.email || ""} onChange={e => setConfig({...config, email: e.target.value})} />
                <InputField type="password" placeholder="API Token" value={config.apiToken || ""} onChange={e => setConfig({...config, apiToken: e.target.value})} />
                <Button onClick={() => { 
                  const configKey = process.env.NEXT_PUBLIC_LOCALSTORAGE_JIRA_CONFIG_KEY || "jira-config-v2";
                  localStorage.setItem(configKey, JSON.stringify({...config, authType: 'basic'})); 
                  setShowConfig(false); 
                }} fullWidth>
                  Save Basic Auth Settings
                </Button>
              </div>
            )}
            
            {(config.accessToken || config.apiToken) && (
              <>
                <SummaryDivider />
                <Button onClick={logout} variant="outline" style={{width: '100%', borderColor: 'rgba(255,100,100,0.2)', color: '#ff6b6b', fontSize: '11px'}}>
                  Logout & Disconnect
                </Button>
              </>
            )}
          </SummaryCard>
        )}

        <SummaryCard>
          <SummaryRow>
            <SummaryItem label="Items Selected" value={`${checkedIds.size} / ${selectedCards.length}`} />
            <SummaryItem 
              label="Syncing To" 
              value={appParentKey || 'Auto Tags'} 
              align="right"
              style={{ color: appParentKey ? '#4262ff' : '#8c90b0' }}
            />
          </SummaryRow>
          {appParentKey && (
            <>
              <SummaryDivider />
              <SummaryItem 
                label="Global Parent" 
                value={(
                  <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px'}}>
                    <span className="value" style={{fontSize: '13px', color: '#4262ff', whiteSpace: 'nowrap'}}>{appParentKey}</span>
                    <span className="hint-text" style={{margin: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{appParentTitle}</span>
                    <Button variant="delete" style={{fontSize: '16px', padding: 0}} onClick={() => setAppParentKey("")}>×</Button>
                  </div>
                )}
              />
            </>
          )}
        </SummaryCard>

        <div className="action-area">
          <span className="group-title">Search Parent Issue</span>
          <div style={{position: 'relative'}}>
            <InputField 
              placeholder="Find parent (e.g. KAN-1)..." 
              value={searchQuery} 
              onChange={e => setSearchQuery(e.target.value)} 
              style={{paddingRight: '30px'}}
            />
            {isSearching && <div className="spinner" style={{position: 'absolute', right: '10px', top: '10px', borderTopColor: '#4262ff', width: '12px', height: '12px'}}></div>}
            
            {searchResults.length > 0 && (
              <SummaryCard style={{position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000, marginTop: '4px', padding: '4px', boxShadow: '0 8px 24px rgba(5,0,56,0.15)'}}>
                {searchResults.slice(0, 5).map(issue => (
                  <ListItem 
                    key={issue.id} 
                    title={issue.summaryText || issue.summary}
                    subtitle={issue.key}
                    onClick={() => selectSearchResult(issue)}
                  />
                ))}
              </SummaryCard>
            )}
          </div>

          <div className="timesheet-section">
            <div className="section-header-row">
              <span className="group-title">Preview Selection</span>
              <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
                {selectedCards.length > 0 && (
                  <Button variant="tiny" onClick={handleSelectAll} style={{fontSize: '8px', padding: '1px 5px'}}>
                    {checkedIds.size === validItemsCount && validItemsCount > 0 ? 'Unselect All' : 'Select All'}
                  </Button>
                )}
                <div style={{fontSize: '9px', color: '#8c90b0', fontWeight: 600}}>
                  {checkedIds.size} ready
                </div>
              </div>
            </div>
            <div className="timesheet-group" style={{maxHeight: '140px', overflowY: 'auto'}}>
              {selectedCards.length > 0 ? (
                <div className="titles-container">
                  {selectedCards.map(c => {
                    const isSynced = !!c.syncedKey;
                    const hasChanged = isSynced && c.title !== c.lastSyncedTitle;
                    const isValid = !!(appParentKey || c.detectedParentKey) || hasChanged;
                    const isChecked = checkedIds.has(c.id);
                    
                    const rightElement = (
                      <span style={{ 
                        color: isSynced ? (hasChanged ? '#ff9800' : '#8c90b0') : (appParentKey ? '#4262ff' : (c.detectedParentKey ? '#00d142' : '#ff4d4f')),
                        fontWeight: (isSynced && hasChanged) || (!isSynced && !appParentKey && !c.detectedParentKey) ? 700 : 400
                      }}>
                        {isSynced ? (
                          hasChanged ? `! Changed (${c.syncedKey})` : `✓ Up to date (${c.syncedKey})`
                        ) : (
                          appParentKey ? `→ ${appParentKey}` : (c.detectedParentKey ? `Parent: ${c.detectedParentKey}` : '! No Parent Issue')
                        )}
                      </span>
                    );

                    return (
                      <ListItem 
                        key={c.id}
                        title={c.title}
                        checked={isChecked}
                        showCheckbox
                        onCheck={() => isValid && toggleCheck(c)}
                        onClick={() => isValid && toggleCheck(c)}
                        className={!isValid && !isSynced ? 'error-state' : ''}
                        style={{ opacity: isChecked ? 1 : 0.6 }}
                        rightElement={rightElement}
                      />
                    );
                  })}
                </div>
              ) : (
                <div style={{padding: '20px', textAlign: 'center', fontSize: '12px', color: '#8c90b0'}}>
                  Select cards on Miro board...
                </div>
              )}
            </div>
          </div>

          <Button 
            loading={isProcessing}
            onClick={syncToJira}
            fullWidth
            style={{marginTop: '4px'}}
            disabled={checkedIds.size === 0}
            icon={(
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 2v6h-6"></path>
                <path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path>
                <path d="M3 22v-6h6"></path>
                <path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path>
              </svg>
            )}
          >
            Sync & Update {checkedIds.size} Items
          </Button>
        </div>
      </main>
    </div>
  );
};
