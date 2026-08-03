import * as React from "react";
import type { Card, AppCard } from "@mirohq/websdk-types";
import { JiraService, JiraIssue, JiraUser } from "../services/jira/JiraService";
import { SectionHeader } from "../components/SectionHeader";
import { SummaryCard, SummaryItem, SummaryRow, SummaryDivider } from "../components/SummaryCard";
import { Button } from "../components/Button";
import { InputField } from "../components/InputField";
import { ListItem } from "../components/ListItem";
import { useJiraAuth } from "../contexts/JiraAuthContext";
import { useGlobalConfig } from "../contexts/GlobalConfigContext";
import { parseUserMapping, getCardMappedUser, getCardMappedUsers } from "../services/jira/mappingUtils";
import { parseCardTitle, compareSequences, calculateSelectionSummary, formatCardTitle } from "../services/miro/estimationUtils";
import { useJira } from "../hooks/useJira";
import { notify } from "../services/miro/uiUtils";
import { cacheUtils } from "../utils/cacheUtils";
import { useDebounce } from "../hooks/useDebounce";
import { useJiraDetection } from "../hooks/useJiraDetection";
import { captureItemPosition, restoreItemPosition, type MiroItemPositionSnapshot } from "../services/miro/miroUtils";

import { usePanel } from "@/contexts/PanelContext";

export const JiraTools: React.FC = () => {
  const { rawSelection: selection } = usePanel();
  const { config, setConfig, isAuthenticating, availableResources, startOAuth, selectResource, logout } = useJiraAuth();
  const { withRefresh } = useJira();
  const { config: globalConfig, updateConfig } = useGlobalConfig();
  
  const [showConfig, setShowConfig] = React.useState(!config.accessToken && !config.apiToken);
  const [appParentKey, setAppParentKey] = React.useState("");
  const [appParentTitle, setAppParentTitle] = React.useState("");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<any[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [isRollingUp, setIsRollingUp] = React.useState(false);
  const [foundMainCards, setFoundMainCards] = React.useState<Record<string, string>>({});
  const [jiraTitles, setJiraTitles] = React.useState<Record<string, string>>({});
  const [isScanning, setIsScanning] = React.useState(false);

  // --- Detection Hook ---
  const { 
    selectedCards, 
    checkedIds, 
    setCheckedIds, 
    detectSelection, 
    toggleCheck, 
    handleSelectAll,
    validItemsCount,
    clearCache
  } = useJiraDetection(selection, appParentKey);

  React.useEffect(() => {
    if (config.accessToken) setShowConfig(false);
  }, [config.accessToken]);

  React.useEffect(() => {
    if (availableResources.length > 0) setShowConfig(true);
  }, [availableResources]);

  const [isPending, startTransition] = React.useTransition();
  const debouncedSearchQuery = useDebounce(searchQuery, 400);

  // --- Search Logic ---
  React.useEffect(() => {
    const performSearch = async () => {
      if (debouncedSearchQuery.length >= 1) {
        setIsSearching(true);
        try {
          let finalQuery = debouncedSearchQuery.trim();
          const prefix = globalConfig?.jiraPrefix || "FTDGENERIC";
          if (/^\d+$/.test(finalQuery)) finalQuery = `${prefix}-${finalQuery}`;
          const results = await withRefresh(s => s.searchIssues(finalQuery, prefix));
          
          startTransition(() => {
            setSearchResults(results);
          });
        } catch (e) { } finally { setIsSearching(false); }
      } else { 
        startTransition(() => {
          setSearchResults([]); 
        });
      }
    };
    performSearch();
  }, [debouncedSearchQuery, config, globalConfig, withRefresh]);

  const selectSearchResult = React.useCallback((issue: any) => {
    setAppParentKey(issue.key);
    setAppParentTitle(issue.summaryText || issue.summary);
    setSearchQuery("");
    setSearchResults([]);
  }, []);

  // --- Main Sync Action ---
  const syncToJira = React.useCallback(async () => {
    const cardsToSync = selectedCards.filter(c => checkedIds.has(c.id));
    if (cardsToSync.length === 0) return;
    
    setIsProcessing(true);
    let createCount = 0;
    let updateCount = 0;
    const baseUrl = config.baseUrl || "";
    const syncErrors: string[] = [];
    const restorationErrors: string[] = [];
    
    try {
      // Capture every position before any Jira call or Miro mutation. Abort the
      // whole batch if even one card cannot be captured safely.
      const originalCards = await miro.board.get({ id: cardsToSync.map(c => c.id) });
      const originalCardsMap = new Map(originalCards.map(c => [c.id, c]));
      const positionSnapshots = new Map<string, MiroItemPositionSnapshot>();
      const snapshotErrors: string[] = [];
      for (const card of cardsToSync) {
        const item = originalCardsMap.get(card.id);
        try {
          if (!item) throw new Error('Card could not be loaded');
          positionSnapshots.set(card.id, captureItemPosition(item));
        } catch (error) {
          snapshotErrors.push(`${card.title || card.id} (${card.id}): ${(error as Error).message}`);
        }
      }
      if (snapshotErrors.length > 0) {
        throw new Error(`Position snapshot failed: ${snapshotErrors.join('; ')}`);
      }

      const boardInfo = await miro.board.getInfo();
      const boardId = boardInfo.id;
      const userInfo = await miro.board.getUserInfo();
      const currentMiroUserId = userInfo.id;

      const mapping = parseUserMapping(globalConfig?.tsUserMapping || "");
      const getJiraAccountId = async (miroUser: string) => {
        const CACHE_KEY = `jira_account_id_${miroUser}`;
        let accountId = cacheUtils.get<string>(CACHE_KEY);
        if (accountId) return accountId;

        try {
          const foundUsers = await withRefresh(s => s.findUsers(miroUser)) as any[];
          if (foundUsers && foundUsers.length > 0) {
            accountId = foundUsers[0].accountId;
            cacheUtils.set(CACHE_KEY, accountId, 3600 * 24 * 7); // 7 days cache
            return accountId;
          }
        } catch (err) { }
        return null;
      };

      try {
        const myself = await withRefresh(s => s.getMyself());
        if (myself) {
          cacheUtils.set(`jira_account_id_${(userInfo as any).email?.toLowerCase() || 'me'}`, myself.accountId, 3600 * 24 * 7);
        }
      } catch (e) { console.warn("Could not fetch my Jira profile", e); }

      // Use Shared Tags Cache (1 day)
      const TAGS_CACHE_KEY = 'miro_tags_cache';
      const TAGS_CACHE_TIME = 30 * 1000;
      let cachedTags = (window as any)[TAGS_CACHE_KEY]?.data;
      if (!cachedTags || Date.now() - ((window as any)[TAGS_CACHE_KEY]?.timestamp || 0) > TAGS_CACHE_TIME) {
        cachedTags = await miro.board.get({ type: 'tag' }).catch(() => []);
        (window as any)[TAGS_CACHE_KEY] = { data: cachedTags, timestamp: Date.now() };
      }
      const tagMap = new Map(cachedTags.map((t: any) => [t.id, t.title]));
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

      // Pre-fetch all metadata in parallel for maximum performance
      const metadataResults = await Promise.all(
        cardsToSync.map(c => (originalCardsMap.get(c.id) as any)?.getMetadata(metadataKey))
      );

      // 2. Process in Chunks for performance (Parallel but controlled)
      const CHUNK_SIZE = 3;
      for (let i = 0; i < cardsToSync.length; i += CHUNK_SIZE) {
        const chunk = cardsToSync.slice(i, i + CHUNK_SIZE);
        
        await Promise.all(chunk.map(async (card) => {
          const originalItem = originalCardsMap.get(card.id) as any;
          if (!originalItem) return;

          try {
            let targetAssignees: string[] = [];

            // Find Assignees
            if (mapping.size > 0) {
              const cardTagTitles = (originalItem.tagIds || [])
                .map((id: string) => tagMap.get(id))
                .filter(Boolean) as string[];

              const mappedUsers = getCardMappedUsers(cardTagTitles, mapping, ignoreRegex);
              for (const mu of mappedUsers) {
                const accId = await getJiraAccountId(mu);
                if (accId) targetAssignees.push(accId);
              }
            }

            if (targetAssignees.length === 0 && card.assigneeId === currentMiroUserId) {
              const myId = await getJiraAccountId((userInfo as any).email?.toLowerCase() || 'me');
              if (myId) targetAssignees.push(myId);
            }
            if (targetAssignees.length === 0) targetAssignees.push(undefined as any);

            const miroDeepLink = `${boardUrl}${boardId}/?moveToWidget=${card.id}`;
            const jiraDescription = `${card.description}\n\n---\nMiro Card Link: ${miroDeepLink}`;
            const syncedKeyStr = metadataResults[cardsToSync.indexOf(card)]?.key || "";
            const syncedKeys = syncedKeyStr ? syncedKeyStr.split(',').map((k: string) => k.trim()).filter(Boolean) : [];
            const maxLen = Math.max(targetAssignees.length, syncedKeys.length);
            const updatedKeys: string[] = [];

            // Process all assignees/subtasks for this card in parallel
            await Promise.all(Array.from({ length: maxLen }).map(async (_, idx) => {
              const assignee = targetAssignees[idx] !== undefined ? targetAssignees[idx] : targetAssignees[0];
              
              if (idx < syncedKeys.length) {
                // UPDATE existing
                await withRefresh(s => s.updateIssue(syncedKeys[idx], card.title, card.dueDate, card.startDate, assignee, jiraDescription));
                updatedKeys.push(syncedKeys[idx]);
                updateCount++;
              } else {
                // CREATE new subtask
                const finalParentKey = appParentKey || card.detectedParentKey;
                if (finalParentKey) {
                  const newIssue = await withRefresh(s => s.createSubtask(finalParentKey, card.title, jiraDescription, card.dueDate, card.startDate, assignee));
                  updatedKeys.push(newIssue.key);
                  createCount++;
                }
              }
            }));

            // Finalize Miro Card Metadata & Description
            const now = new Date().toLocaleString();
            let cleanDesc = (originalItem.description || "").split('---<br><strong>Jira')[0].replace(/(<p[^>]*>|<br\s*\/?>|\s)*$/, '');
            const joinedKeys = updatedKeys.join(',');
            const jiraLinks = updatedKeys.map(k => {
              const link = config.authType === 'oauth' ? `${baseUrl}/browse/${k}` : `${baseUrl.replace('/rest/api/3', '')}/browse/${k}`;
              return `<a href="${link}">${k}</a>`;
            }).join(', ');

            originalItem.description = cleanDesc + `<p data-jira-stamp="true">---<br><strong>Jira Sync:</strong> ${jiraLinks}<br><strong>Synced at:</strong> ${now}</p>`;
            await originalItem.setMetadata(metadataKey, { key: joinedKeys, lastTitle: card.title, lastDesc: card.description });
            await originalItem.sync();

          } catch (err: any) {
            try {
              if (err.message?.includes("404")) {
                await originalItem.setMetadata(metadataKey, null);
                await originalItem.sync();
              } else {
                throw err;
              }
            } catch (syncError) {
              syncErrors.push(`${card.title || card.id} (${card.id}): ${(syncError as Error).message}`);
            }
          } finally {
            const snapshot = positionSnapshots.get(card.id);
            if (snapshot) {
              try {
                await restoreItemPosition(snapshot);
              } catch (restoreError) {
                restorationErrors.push(`${card.title || card.id} (${card.id}): ${(restoreError as Error).message}`);
              }
            }
          }
        }));
      }

      if (syncErrors.length > 0) {
        notify(`Jira sync failed: ${syncErrors.join('; ')}`, "error");
      }
      if (restorationErrors.length > 0) {
        notify(`Card position restoration failed: ${restorationErrors.join('; ')}`, "error");
      }

      if (syncErrors.length === 0 && restorationErrors.length === 0) {
        // All restoration promises have completed before selection state changes.
        setCheckedIds(new Set());
        clearCache();
        setTimeout(() => detectSelection(), 200);
      }
    } catch (e) { notify("Sync Error: " + (e as Error).message, "error"); }
    finally { setIsProcessing(false); }
  }, [selectedCards, checkedIds, config, globalConfig, withRefresh, appParentKey, detectSelection, setCheckedIds, clearCache]);

  const memoizedLogout = React.useCallback(() => logout(), [logout]);
  const memoizedStartOAuth = React.useCallback(() => startOAuth(), [startOAuth]);

  // --- Memoized UI Components ---
  const renderedSearchResults = React.useMemo(() => (
    searchResults.map(issue => (
      <ListItem 
        key={issue.key}
        title={issue.summaryText || issue.summary}
        subtitle={issue.key}
        onClick={() => selectSearchResult(issue)}
      />
    ))
  ), [searchResults]);

  const renderedSelectedCards = React.useMemo(() => (
    selectedCards.map(c => {
      const isSynced = !!c.syncedKey;

      // Super-lenient normalization: Clean up but keep it readable
      const normalize = (text?: string) => {
        if (!text) return "";
        // 1. Remove Jira Stamp (Flexible Regex)
        const jiraStampRegex = /---(?:\s|<[^>]+>)*Jira/i;
        let clean = text.split(jiraStampRegex)[0];
        
        // 2. Clean HTML and Whitespace
        let result = clean
          .replace(/<li[^>]*>\s*(?:<br\s*\/?>)?\s*<\/li>/gi, ' ') // Remove empty list items
          .replace(/<li[^>]*>/gi, ' - ') // Add dashes for non-empty list items
          .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>|<\/ol>|<\/ul>/gi, ' ') // Block ends to spaces
          .replace(/<[^>]*>/g, ' ') // Remaining tags to spaces
          .replace(/&nbsp;/g, ' ') 
          .replace(/[\r\n]+/g, ' ') // Newlines to spaces
          .replace(/\s+/g, ' ') // Collapse spaces
          .trim();

        // 3. Aggressive Bracket Stripping (Same as estimationUtils)
        const RE_LEADING_BRACKET = /^\s*\[[^\]]*\]\s*/;
        while (RE_LEADING_BRACKET.test(result)) {
          result = result.replace(RE_LEADING_BRACKET, '').trim();
        }
        return result;
      };
      
      const currentTitle = normalize(c.title);
      const lastTitle = normalize(c.lastSyncedTitle);
      const currentDesc = normalize(c.description);
      const lastDesc = normalize(c.lastSyncedDesc);

      const titleChanged = currentTitle !== lastTitle;
      const descChanged = currentDesc !== lastDesc;
      const hasChanged = isSynced && (titleChanged || descChanged);

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
          title={currentTitle}
          subtitle={(isSynced && c.syncedKey && jiraTitles[c.syncedKey]) ? `Jira: ${jiraTitles[c.syncedKey]}` : (isSynced ? `Key: ${c.syncedKey}` : undefined)}
          checked={isChecked}
          showCheckbox
          onCheck={() => toggleCheck(c.id)}
          onClick={() => toggleCheck(c.id)}
          className={!isValid && !isSynced ? 'error-state' : ''}
          style={{ opacity: isChecked ? 1 : 0.6 }}
          rightElement={rightElement}
        />
      );
    })
  ), [selectedCards, checkedIds, appParentKey, toggleCheck, jiraTitles]);

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

      <main className="main-content">
        {!config.accessToken ? (
          <div className="auth-section" style={{padding: '12px 0', textAlign: 'center'}}>
            {availableResources.length > 0 ? (
              <div className="resource-selection">
                <div style={{fontSize: '11px', fontWeight: 600, marginBottom: '10px', color: '#4262ff'}}>
                  Select Jira Site
                </div>
                {availableResources.map(res => (
                  <ListItem 
                    key={res.id}
                    title={res.name}
                    subtitle={res.url}
                    onClick={() => selectResource(res)}
                  />
                ))}
                <Button variant="tiny" onClick={logout} style={{marginTop: '10px', color: '#ff4d4f'}}>Cancel</Button>
              </div>
            ) : (
              <div className="login-prompt" style={{
                backgroundColor: '#f8f9fb', padding: '16px', borderRadius: '12px', border: '1px solid #e1e4e8'
              }}>
                <div style={{
                  width: '32px', height: '32px', backgroundColor: '#eef1ff', 
                  borderRadius: '8px', display: 'flex', alignItems: 'center', 
                  justifyContent: 'center', margin: '0 auto 12px'
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4262ff" strokeWidth="2.5">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
                    <polyline points="10 17 15 12 10 7"></polyline>
                    <line x1="15" y1="12" x2="3" y2="12"></line>
                  </svg>
                </div>
                <h3 style={{fontSize: '12px', fontWeight: 700, marginBottom: '6px'}}>Connect to Jira</h3>
                <p style={{fontSize: '10px', color: '#8c90b0', marginBottom: '16px', lineHeight: 1.4}}>
                  Sync Miro cards with Jira issues.
                </p>
                <Button 
                  loading={isAuthenticating}
                  onClick={startOAuth}
                  fullWidth
                  variant="primary"
                  style={{fontSize: '11px', height: '32px'}}
                >
                  {isAuthenticating ? 'Authenticating...' : 'Connect Account'}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* 1. Context & Config Section */}
            <div className="context-section">
              {showConfig && (
                <div className="config-body" style={{marginBottom: '12px'}}>
                  <SummaryCard>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                      <span style={{fontSize: '11px', color: '#8c90b0'}}>Jira Integration</span>
                      <Button variant="tiny" onClick={logout} style={{color: '#ff4d4f'}}>Logout</Button>
                    </div>
                    <SummaryDivider />
                    <SummaryItem label="Connected" value={config.baseUrl?.replace('https://', '')} />
                    <SummaryItem label="Auth Type" value={config.authType.toUpperCase()} />
                  </SummaryCard>
                </div>
              )}

              <div className="search-section" style={{ position: 'relative' }}>
                <SectionHeader title="Target Parent Issue" icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>} />
                <div style={{display: 'flex', gap: '4px', marginBottom: '4px'}}>
                  <div style={{flex: 1, position: 'relative'}}>
                    <InputField 
                      placeholder="Search Key or Title..."
                      value={searchQuery}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                    />
                    {(isSearching || isPending) && (
                      <div className="spinner-tiny" style={{position: 'absolute', right: '10px', top: '10px', width: '12px', height: '12px'}} />
                    )}
                  </div>
                  {appParentKey && (
                    <Button 
                      variant="tiny" 
                      onClick={() => { setAppParentKey(""); setAppParentTitle(""); }}
                    >
                      Clear
                    </Button>
                  )}
                </div>

                {appParentKey && (
                  <div className="selected-parent-badge" style={{
                    padding: '8px 10px', borderRadius: '8px', 
                    backgroundColor: '#eef1ff', border: '1px solid #d0d7ff',
                    fontSize: '11px', display: 'flex', justifyContent: 'space-between',
                    boxShadow: '0 2px 6px rgba(66, 98, 255, 0.08)'
                  }}>
                    <div style={{overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '8px'}}>
                      <strong style={{color: '#4262ff'}}>{appParentKey}</strong>: {appParentTitle}
                    </div>
                  </div>
                )}

                {searchResults.length > 0 && (
                  <SummaryCard style={{
                    position: 'absolute', top: 'calc(100% - 4px)', left: 0, right: 0, zIndex: 100,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                    maxHeight: '200px', overflowY: 'auto', border: '1px solid #4262ff'
                  }}>
                    {renderedSearchResults}
                  </SummaryCard>
                )}
              </div>
            </div>

            {/* 2. Selection & Sync Section */}
            <div className="sync-section">
              <div className="section-header-row" style={{ marginBottom: '8px' }}>
                <span className="group-title">Selection Preview</span>
                <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
                  {selectedCards.length > 0 && (
                    <Button variant="tiny" onClick={handleSelectAll} style={{fontSize: '9px', padding: '2px 8px'}}>
                      {checkedIds.size === validItemsCount && validItemsCount > 0 ? 'Unselect All' : 'Select All'}
                    </Button>
                  )}
                  <div style={{fontSize: '10px', color: '#8c90b0', fontWeight: 700}}>
                    {checkedIds.size} Ready
                  </div>
                </div>
              </div>

              <div className="items-list-container" style={{ 
                maxHeight: '160px', overflowY: 'auto', 
                backgroundColor: '#fcfcfd', border: '1px solid #eaeaeb', borderRadius: '12px',
                padding: '4px'
              }}>
                {selectedCards.length > 0 ? (
                  <div className="titles-container">
                    {renderedSelectedCards}
                  </div>
                ) : (
                  <div style={{padding: '30px 20px', textAlign: 'center', fontSize: '12px', color: '#8c90b0'}}>
                    <div style={{marginBottom: '8px', opacity: 0.5}}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>
                    </div>
                    Select cards on board to sync
                  </div>
                )}
              </div>

              <Button 
                loading={isProcessing}
                onClick={syncToJira}
                fullWidth
                style={{marginTop: '12px', height: '36px', fontSize: '12px'}}
                disabled={checkedIds.size === 0}
              >
                Sync & Update Jira Issues
              </Button>
            </div>

            {/* 3. Point Roll-up Section */}
            {selectedCards.length > 0 && (
              <div className="rollup-section" style={{
                marginTop: '8px', padding: '16px', borderRadius: '16px', 
                backgroundColor: '#f8f9ff', border: '1px solid #eef0f7',
                boxShadow: '0 4px 12px rgba(66, 98, 255, 0.04)'
              }}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px'}}>
                  <SectionHeader 
                    title="Point Roll-up" 
                    icon={(
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4262ff" strokeWidth="3">
                        <path d="M12 20v-6M6 20V10M18 20V4"></path>
                      </svg>
                    )}
                  />
                  <Button 
                    variant="outline"
                    loading={isScanning} 
                    onClick={async () => {
                      setIsScanning(true);
                      try {
                        const [cards, appCards, tags] = await Promise.all([
                          miro.board.get({type: 'card'}),
                          miro.board.get({type: 'app_card'}),
                          miro.board.get({type: 'tag'})
                        ]);
                        const allItems = [...cards, ...appCards];
                        const tagMap = new Map(tags.map(t => [t.id, t.title.toLowerCase()]));
                        
                        const keys = Array.from(new Set(selectedCards.map(c => c.detectedParentKey || c.syncedKey).filter(Boolean)));
                        const status: Record<string, string> = {};
                        
                        keys.forEach((key: any) => {
                          const upperKey = key.toUpperCase();
                          const foundInSelection = selectedCards.find(c => 
                            c.id.toUpperCase() === upperKey || 
                            (c.syncedKey && c.syncedKey.toUpperCase() === upperKey)
                          );
                          if (foundInSelection) { status[key] = foundInSelection.id; return; }

                          const found = allItems.find((item: any) => {
                            if (item.type === 'app_card' && item.fields && item.fields.some((f: any) => JSON.stringify(f.value || "").toUpperCase().includes(upperKey))) return true;
                            const allText = `${item.title || ""} ${item.content || ""} ${item.description || ""} ${item.externalId || ""} ${item.url || ""}`.toUpperCase();
                            if (allText.includes(upperKey)) return true;
                            if (item.tagIds && item.tagIds.some((tid: string) => (tagMap.get(tid) || "").toUpperCase().includes(upperKey))) return true;
                            try { if (JSON.stringify(item.metadata || "").toUpperCase().includes(upperKey)) return true; } catch(e) {}
                            return false;
                          });
                          if (found) status[key] = found.id;
                        });
                        setFoundMainCards(status);

                        if (keys.length > 0) {
                          const safeKeys = keys.map(k => `"${k}"`).join(',');
                          const data: any = await withRefresh(s => s.searchIssuesByJql(`key in (${safeKeys})`, ['summary']));
                          if (data && data.issues) {
                            const titles: Record<string, string> = {};
                            data.issues.forEach((iss: any) => { titles[iss.key] = iss.fields.summary; });
                            setJiraTitles(prev => ({ ...prev, ...titles }));
                          }
                        }
                      } catch (e: any) { notify(e.message || "Scan failed", "error"); }
                      finally { setIsScanning(false); }
                    }}
                    style={{
                      fontSize: '9px', height: '22px', borderRadius: '11px',
                      border: '1px solid #4262ff', color: '#4262ff', background: '#fff'
                    }}
                  >
                    Scan Board
                  </Button>
                </div>
                
                <div style={{
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '8px', 
                  maxHeight: '200px', 
                  overflowY: 'auto',
                  paddingRight: '4px' // Space for scrollbar
                }}>
                  {(() => {
                    const keys = Array.from(new Set(selectedCards.map(c => c.detectedParentKey || c.syncedKey).filter(Boolean))) as string[];
                    if (keys.length === 0) return <div style={{fontSize: '11px', color: '#8c90b0', textAlign: 'center', padding: '16px'}}>No keys detected in selection.</div>;

                    return keys.map(key => {
                      const groupCards = selectedCards.filter(c => (c.detectedParentKey || c.syncedKey) === key);
                      const summary = calculateSelectionSummary(groupCards as any);
                      const displayPoints = summary.bucketedPoint;

                      return (
                        <div key={key} style={{
                          padding: '6px 10px', borderRadius: '10px',
                          backgroundColor: '#fff', border: '1px solid #f1f3f5',
                          display: 'flex', flexDirection: 'column', gap: '2px',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                        }}>
                          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                            <div style={{display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0}}>
                              <span style={{fontSize: '10px', fontWeight: 800, color: '#4262ff'}}>{key}</span>
                              <span style={{
                                fontSize: '10px', color: '#2c3e50', fontWeight: 600,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                              }}>
                                {jiraTitles[key] || "..."}
                              </span>
                            </div>
                            <div style={{fontSize: '12px', fontWeight: 800, color: '#050038'}}>{displayPoints}pt</div>
                          </div>

                          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                            <div style={{fontSize: '9px', color: '#8c90b0', display: 'flex', gap: '6px', fontWeight: 500}}>
                              <span>{groupCards.length} Tasks</span>
                              <span>•</span>
                              <span>{summary.hourRange[0]}-{summary.hourRange[1]}h</span>
                            </div>
                            
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              {jiraTitles[key] ? (
                                <Button 
                                  variant="ghost-tiny"
                                  loading={isRollingUp}
                                  onClick={async () => {
                                    setIsRollingUp(true);
                                    try {
                                      let fieldId = globalConfig.jiraStoryPointsField;
                                      const svc = new JiraService(config);
                                      try {
                                        const detectedId = await svc.findStoryPointsField();
                                        if (detectedId) fieldId = detectedId;
                                      } catch (e) {}
                                      await svc.updateIssue(key, undefined, undefined, undefined, undefined, undefined, displayPoints, fieldId);
                                      if (fieldId !== globalConfig.jiraStoryPointsField) updateConfig({ jiraStoryPointsField: fieldId });
                                      notify(`Pushed ${displayPoints}pt to ${key}`, "info");
                                    } catch (e: any) { notify(e.message || "Roll-up Error", "error"); }
                                    finally { setIsRollingUp(false); }
                                  }}
                                  style={{ height: '16px', padding: '0 8px', fontSize: '8px', fontWeight: 700 }}
                                >
                                  PUSH
                                </Button>
                              ) : (
                                <span style={{fontSize: '8px', color: '#ff4d4f', fontWeight: 700, opacity: 0.8}}>ISSUE NOT FOUND</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
