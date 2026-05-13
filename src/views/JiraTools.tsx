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
import { parseCardTitle, compareSequences } from "../utils/estimationUtils";
import { useJira } from "../hooks/useJira";
import { notify } from "../utils/uiUtils";
import { cacheUtils } from "../utils/cacheUtils";
import { useDebounce } from "../hooks/useDebounce";
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
    
    try {
      const boardInfo = await miro.board.getInfo();
      const boardId = boardInfo.id;
      const userInfo = await miro.board.getUserInfo();
      const currentMiroUserId = userInfo.id;

      // Batch Fetch all original cards at once
      const originalCards = await miro.board.get({ id: cardsToSync.map(c => c.id) });
      const originalCardsMap = new Map(originalCards.map(c => [c.id, c]));

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
      const TAGS_CACHE_TIME = 24 * 3600 * 1000;
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
            if (err.message?.includes("404")) {
              await originalItem.setMetadata(metadataKey, null);
              await originalItem.sync();
            } else throw err;
          }
        }));
      }

      if (createCount > 0 || updateCount > 0) notify(`Success! Created ${createCount}, Updated ${updateCount} items.`);
      notify("Sync complete", "info");
      setCheckedIds(new Set());
      clearCache();
      setTimeout(() => detectSelection(), 200);
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
        return clean
          .replace(/<li[^>]*>\s*(?:<br\s*\/?>)?\s*<\/li>/gi, ' ') // Remove empty list items
          .replace(/<li[^>]*>/gi, ' - ') // Add dashes for non-empty list items
          .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>|<\/ol>|<\/ul>/gi, ' ') // Block ends to spaces
          .replace(/<[^>]*>/g, ' ') // Remaining tags to spaces
          .replace(/&nbsp;/g, ' ') 
          .replace(/[\r\n]+/g, ' ') // Newlines to spaces
          .replace(/\s+/g, ' ') // Collapse spaces
          .trim();
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
          title={c.title}
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
  ), [selectedCards, checkedIds, appParentKey, toggleCheck]);

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

        <div className="search-section" style={{position: 'relative'}}>
          <div style={{display: 'flex', gap: '4px'}}>
            <div style={{flex: 1, position: 'relative'}}>
              <InputField 
                placeholder="Search Parent Issue (Key or Title)"
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
              marginTop: '4px', padding: '6px 10px', borderRadius: '6px', 
              backgroundColor: '#eef1ff', border: '1px solid #d0d7ff',
              fontSize: '11px', display: 'flex', justifyContent: 'space-between'
            }}>
              <div style={{overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '8px'}}>
                <strong style={{color: '#4262ff'}}>{appParentKey}</strong>: {appParentTitle}
              </div>
            </div>
          )}

          {searchResults.length > 0 && (
            <SummaryCard style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)', marginTop: '4px',
              maxHeight: '200px', overflowY: 'auto'
            }}>
              {renderedSearchResults}
            </SummaryCard>
          )}
        </div>

        <SummaryDivider style={{margin: '12px 0'}} />

        <div className="sync-section">
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
                  {renderedSelectedCards}
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
          >
            Sync & Update {checkedIds.size} Items
          </Button>
        </div>
      </main>
    </div>
  );
};
