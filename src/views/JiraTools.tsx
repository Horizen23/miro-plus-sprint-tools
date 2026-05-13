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
import { parseUserMapping, getCardMappedUser, getCardMappedUsers } from "../utils/mappingUtils";
import { useJira } from "../hooks/useJira";
import { notify } from "../utils/uiUtils";

import { useJiraDetection } from "../hooks/useJiraDetection";

export const JiraTools: React.FC<{ selection?: any[] }> = ({ selection = [] }) => {
  const { config, setConfig, isAuthenticating, availableResources, startOAuth, selectResource, logout } = useJiraAuth();
  const { withRefresh } = useJira();
  const { config: globalConfig } = useGlobalConfig();
  
  const [showConfig, setShowConfig] = React.useState(!config.accessToken && !config.apiToken);
  const [appParentKey, setAppParentKey] = React.useState("");
  const [appParentTitle, setAppParentTitle] = React.useState("");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<any[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);

  // --- Detection Hook ---
  const { 
    selectedCards, 
    checkedIds, 
    setCheckedIds, 
    detectSelection, 
    toggleCheck, 
    handleSelectAll,
    validItemsCount
  } = useJiraDetection(selection, appParentKey);

  React.useEffect(() => {
    if (config.accessToken) setShowConfig(false);
  }, [config.accessToken]);

  React.useEffect(() => {
    if (availableResources.length > 0) setShowConfig(true);
  }, [availableResources]);

  // --- Search Logic ---
  React.useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.length >= 1) {
        setIsSearching(true);
        try {
          let finalQuery = searchQuery.trim();
          const prefix = globalConfig?.jiraPrefix || "FTDGENERIC";
          if (/^\d+$/.test(finalQuery)) finalQuery = `${prefix}-${finalQuery}`;
          const results = await withRefresh(s => s.searchIssues(finalQuery, prefix));
          setSearchResults(results);
        } catch (e) { } finally { setIsSearching(false); }
      } else { setSearchResults([]); }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery, config, globalConfig]);

  const selectSearchResult = (issue: any) => {
    setAppParentKey(issue.key);
    setAppParentTitle(issue.summaryText || issue.summary);
    setSearchQuery("");
    setSearchResults([]);
  };

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

      // Batch Fetch all original cards at once
      const originalCards = await miro.board.get({ id: cardsToSync.map(c => c.id) });
      const originalCardsMap = new Map(originalCards.map(c => [c.id, c]));

      const mapping = parseUserMapping(globalConfig?.tsUserMapping || "");
      const jiraAccountCache = new Map<string, string>();

      try {
        const myself = await withRefresh(s => s.getMyself());
        if (myself) jiraAccountCache.set((userInfo as any).email?.toLowerCase() || 'me', myself.accountId);
      } catch (e) { console.warn("Could not fetch my Jira profile", e); }

      const allBoardTags = await miro.board.get({ type: 'tag' });
      const metadataKey = process.env.NEXT_PUBLIC_MIRO_METADATA_KEY || "jira-sync";
      const boardUrl = process.env.NEXT_PUBLIC_MIRO_BOARD_URL || "https://miro.com/app/board/";

      // Pre-calculate ignoreRegex
      let ignoreRegex = "";
      const vars = globalConfig?.tsVariables || "";
      const tagLine = vars.split('\n').find((l: string) => l.trim().startsWith('tag='));
      if (tagLine) {
        const parts = tagLine.split('=');
        if (parts[1]) ignoreRegex = parts[1].trim();
      }

      for (const card of cardsToSync) {
        const originalItem = originalCardsMap.get(card.id) as any;
        if (!originalItem) continue;

        let targetAssignees: string[] = [];

        if (mapping.size > 0) {
          const cardTagTitles = allBoardTags
            .filter(t => originalItem.tagIds?.includes(t.id))
            .map(t => t.title);

          const mappedUsers = getCardMappedUsers(cardTagTitles, mapping, ignoreRegex);
          for (const mu of mappedUsers) {
            if (jiraAccountCache.has(mu)) {
              targetAssignees.push(jiraAccountCache.get(mu)!);
            } else {
              try {
                const foundUsers = await withRefresh(s => s.findUsers(mu)) as any[];
                if (foundUsers && foundUsers.length > 0) {
                  const accountId = foundUsers[0].accountId;
                  jiraAccountCache.set(mu, accountId);
                  targetAssignees.push(accountId);
                }
              } catch (err) { }
            }
          }
        }

        if (targetAssignees.length === 0 && card.assigneeId === currentMiroUserId) {
          const myId = jiraAccountCache.get((userInfo as any).email?.toLowerCase() || 'me');
          if (myId) targetAssignees.push(myId);
        }

        if (targetAssignees.length === 0) targetAssignees.push(undefined as any);

        try {
          const miroDeepLink = `${boardUrl}${boardId}/?moveToWidget=${card.id}`;
          const jiraDescription = `${card.description}\n\n---\nMiro Card Link: ${miroDeepLink}`;

          if (card.syncedKey) {
            const syncedKeys = card.syncedKey.split(',').map((k: string) => k.trim()).filter(Boolean);
            const updatedKeys = [...syncedKeys];
            const maxLen = Math.max(targetAssignees.length, syncedKeys.length);

            for (let i = 0; i < maxLen; i++) {
              const assignee = targetAssignees[i] !== undefined ? targetAssignees[i] : targetAssignees[0];
              if (i < syncedKeys.length) {
                await withRefresh(s => s.updateIssue(syncedKeys[i], card.title, card.dueDate, card.startDate, assignee, jiraDescription));
                updateCount++;
              } else {
                const finalParentKey = appParentKey || card.detectedParentKey;
                if (finalParentKey) {
                  const newIssue = await withRefresh(s => s.createSubtask(finalParentKey, card.title, jiraDescription, card.dueDate, card.startDate, assignee));
                  updatedKeys.push(newIssue.key);
                  createCount++;
                }
              }
            }
            
            const now = new Date().toLocaleString();
            let cleanDesc = (originalItem.description || "").split('---<br><strong>Jira')[0].replace(/(<p[^>]*>|<br\s*\/?>|\s)*$/, '');
            const joinedKeys = updatedKeys.join(',');
            originalItem.description = cleanDesc + `<p data-jira-stamp="true">---<br><strong>Jira Update:</strong> ${joinedKeys}<br><strong>Updated at:</strong> ${now}</p>`;
            await originalItem.setMetadata(metadataKey, { key: joinedKeys, lastTitle: card.title, lastDesc: card.description });
            await originalItem.sync();
          } else {
            const finalParentKey = appParentKey || card.detectedParentKey;
            if (!finalParentKey) continue;

            const createdKeys: string[] = [];
            const jiraLinks: string[] = [];

            for (const assignee of targetAssignees) {
              const newIssue = await withRefresh(s => s.createSubtask(finalParentKey, card.title, jiraDescription, card.dueDate, card.startDate, assignee));
              const jiraLink = config.authType === 'oauth' ? `${baseUrl}/browse/${newIssue.key}` : `${baseUrl.replace('/rest/api/3', '')}/browse/${newIssue.key}`;
              createdKeys.push(newIssue.key);
              jiraLinks.push(`<a href="${jiraLink}">${newIssue.key}</a>`);
              createCount++;
            }

            const now = new Date().toLocaleString();
            let cleanDesc = (originalItem.description || "").split('---<br><strong>Jira')[0].replace(/(<p[^>]*>|<br\s*\/?>|\s)*$/, '');
            originalItem.description = cleanDesc + `<p data-jira-stamp="true">---<br><strong>Jira Issue:</strong> ${jiraLinks.join(', ')}<br><strong>Synced at:</strong> ${now}</p>`;
            await originalItem.setMetadata(metadataKey, { key: createdKeys.join(','), lastTitle: card.title, lastDesc: card.description });
            await originalItem.sync();
          }
        } catch (e: any) { 
          if (e.message?.includes("404")) {
            notify(`Issue ${card.syncedKey} not found in Jira. Clearing metadata.`, "error");
            await originalItem.setMetadata(metadataKey, null);
            await originalItem.sync();
          } else {
            throw e;
          }
        }
      }

      if (createCount > 0 || updateCount > 0) notify(`Success! Created ${createCount}, Updated ${updateCount} items.`);
      await detectSelection();
      setAppParentKey("");
      setCheckedIds(new Set());
    } catch (e) { notify("Sync Error: " + (e as Error).message, "error"); }
    finally { setIsProcessing(false); }
  };




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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {availableResources.length > 0 ? (
                  <>
                    <div className="hint-text" style={{ marginBottom: '4px', fontWeight: 700, color: '#050038' }}>
                      Select Jira Site ({availableResources.length} found)
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {availableResources.map(res => (
                        <ListItem 
                          key={res.id}
                          title={res.name}
                          subtitle={res.url}
                          onClick={() => selectResource(res)}
                          style={{ border: '1px solid #eef0f7', background: 'white' }}
                        />
                      ))}
                    </div>
                  </>
                ) : (
                  <Button loading={isAuthenticating} onClick={startOAuth} fullWidth>
                    {config.accessToken ? "Reconnect Account" : "Connect Jira"}
                  </Button>
                )}
              </div>
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
              placeholder={`Find parent (e.g. ${globalConfig?.jiraPrefix || 'KAN'}-1)...`} 
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
                    const hasChanged = isSynced && (c.title !== c.lastSyncedTitle || c.description !== c.lastSyncedDesc);
                    const isValid = !!(appParentKey || c.detectedParentKey) || hasChanged;
                    const isChecked = checkedIds.has(c.id);
                    
                    const rightElement = (
                      <span style={{ 
                        color: isSynced ? (hasChanged ? '#ff9800' : '#8c90b0') : (appParentKey ? '#4262ff' : (c.detectedParentKey ? '#00d142' : '#ff4d4f')),
                        fontWeight: (isSynced && hasChanged) || (!isSynced && !appParentKey && !c.detectedParentKey) ? 700 : 400
                      }}>
                        {isSynced ? (
                          hasChanged ? `! Changed (${c.syncedKey})` : `Up to date (${c.syncedKey})`
                        ) : (
                          appParentKey ? `${appParentKey}` : (c.detectedParentKey ? `Parent: ${c.detectedParentKey}` : '! No Parent Issue')
                        )}
                      </span>
                    );

                    return (
                      <ListItem 
                        key={c.id}
                        title={c.title}
                        checked={isChecked}
                        showCheckbox
                        onCheck={() => isValid && toggleCheck(c.id)}
                        onClick={() => isValid && toggleCheck(c.id)}
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
