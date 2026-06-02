import * as React from "react";
import type { Card, AppCard, Item, Tag } from "@mirohq/websdk-types";
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
  const [searchResults, setSearchResults] = React.useState<JiraIssue[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);

  // --- Detection Hook ---
  const { 
    selectedCards, 
    checkedIds, 
    setCheckedIds, 
    detectSelection, 
    toggleCheck, 
    handleSelectAll: toggleAll, 
    validItemsCount 
  } = useJiraDetection(selection, appParentKey);

  const debouncedSearch = useDebounce(searchQuery, 500);

  React.useEffect(() => {
    if (debouncedSearch && debouncedSearch.length >= 2) {
      handleSearch(debouncedSearch);
    } else {
      setSearchResults([]);
    }
  }, [debouncedSearch]);

  const handleSearch = async (query: string) => {
    setIsSearching(true);
    try {
      const results = await withRefresh(s => s.searchIssues(query, config.baseUrl?.includes('atlassian.net') ? undefined : undefined));
      setSearchResults(results as JiraIssue[]);
    } catch (e: unknown) {
      console.error("Search failed", e);
    } finally {
      setIsSearching(false);
    }
  };

  const selectSearchResult = React.useCallback((issue: JiraIssue) => {
    setAppParentKey(issue.key);
    setAppParentTitle(issue.fields.summary);
    setSearchQuery("");
    setSearchResults([]);
  }, []);

  const handleSyncToJira = async () => {
    if (checkedIds.size === 0) return;
    setIsProcessing(true);
    
    try {
      const metadataKey = process.env.NEXT_PUBLIC_MIRO_METADATA_KEY || "jira-sync";
      const mapping = parseUserMapping(globalConfig.tsUserMapping);
      const vars = globalConfig.tsVariables || "";
      const tagLine = vars.split('\n').find(l => l.trim().startsWith('tag='));
      const ignoreRegex = tagLine ? tagLine.split('=')[1]?.trim() : "";

      const userInfo = await (typeof miro !== 'undefined' ? miro.board.getUserInfo() : Promise.resolve(null));
      
      const userEmail = (userInfo as unknown as Record<string, string>)?.email;
      let myAccountId = cacheUtils.get<string>(`jira_account_id_${userEmail?.toLowerCase() || 'me'}`);
      if (!myAccountId && userInfo) {
        try {
          const myself = await withRefresh(s => s.getMyself());
          myAccountId = myself.accountId || null;
          if (myself.accountId) {
            cacheUtils.set(`jira_account_id_${userEmail?.toLowerCase() || 'me'}`, myself.accountId, 3600 * 24 * 7);
          }
        } catch (e: unknown) {}
      }

      const TAGS_CACHE_KEY = 'miro_tags_cache';
      const TAGS_TTL = 3600;

      let allTags = cacheUtils.get<Tag[]>(TAGS_CACHE_KEY);

      if (!allTags) {
        if (typeof miro !== 'undefined') {
          allTags = await miro.board.get({ type: 'tag' });
          cacheUtils.set(TAGS_CACHE_KEY, allTags, TAGS_TTL);
        }
      }

      if (!allTags) return;

      const boardTags = allTags;

      for (const card of selectedCards) {
        if (!checkedIds.has(card.id)) continue;

        let jiraKey = card.syncedKey;
        const parentKey = card.detectedParentKey || appParentKey;

        // 1. Create Jira Issue if not synced
        if (!jiraKey && parentKey) {
          try {
            const miroItem = selection.find(i => i.id === card.id) as Card | AppCard;
            const cardTags = boardTags
              .filter(t => (miroItem as unknown as { tagIds?: string[] }).tagIds?.includes(t.id))
              .map(t => t.title || "");
            
            const mappedUsers = getCardMappedUsers(cardTags, mapping, ignoreRegex);
            let assigneeId: string | undefined;

            if (mappedUsers.length > 0) {
              const foundUsers = await withRefresh(s => s.findUsers(mappedUsers[0])) as JiraUser[];
              if (foundUsers.length > 0) assigneeId = foundUsers[0].accountId;
            }

            if (!assigneeId && card.assigneeId === userInfo?.id) {
              assigneeId = myAccountId || undefined;
            }

            const newIssue = await withRefresh(s => s.createSubtask(
              parentKey,
              card.title,
              card.description,
              card.dueDate,
              card.startDate,
              assigneeId
            ));
            jiraKey = newIssue.key;
            
            await (miroItem as Card | AppCard).setMetadata(metadataKey, { 
              key: jiraKey, 
              lastTitle: card.title, 
              lastDesc: card.description 
            });
          } catch (e: unknown) {
            console.error(`Failed to create Jira issue for ${card.id}`, e);
            continue;
          }
        }

        // 2. Update existing Jira Issue
        if (jiraKey) {
          try {
            await withRefresh(s => s.updateIssue(
              jiraKey!,
              card.title,
              card.dueDate,
              card.startDate,
              undefined, // Don't change assignee on sync yet
              card.description,
              card.actualPoints > 0 ? card.actualPoints : undefined,
              globalConfig.jiraStoryPointsField
            ));
            
            const miroItem = selection.find(i => i.id === card.id) as Card | AppCard;
            await miroItem.setMetadata(metadataKey, { 
              key: jiraKey, 
              lastTitle: card.title, 
              lastDesc: card.description 
            });
          } catch (e: unknown) {
            console.error(`Failed to update Jira issue ${jiraKey}`, e);
          }
        }
      }

      await detectSelection();
      await notify(`Successfully synced ${checkedIds.size} items to Jira`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await notify(`Sync failed: ${message}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  if (isAuthenticating) {
    return (
      <div className="jira-auth-container">
        <div className="loading-spinner"></div>
        <p>Authenticating with Jira...</p>
      </div>
    );
  }

  if (availableResources.length > 0) {
    return (
      <div className="jira-auth-container">
        <h3>Select Jira Site</h3>
        <p style={{ fontSize: '12px', marginBottom: '16px', opacity: 0.7 }}>Multiple sites found. Please choose one to connect:</p>
        <div className="resource-list">
          {availableResources.map(res => (
            <button key={res.id} className="resource-item" onClick={() => selectResource(res)}>
              <img src={res.avatarUrl || '/jira-icon.png'} alt="" />
              <div className="resource-info">
                <span className="resource-name">{res.name}</span>
                <span className="resource-url">{res.url}</span>
              </div>
            </button>
          ))}
        </div>
        <Button variant="secondary" onClick={logout} style={{ marginTop: '16px' }}>Cancel</Button>
      </div>
    );
  }

  if (!config.accessToken && !config.apiToken) {
    return (
      <div className="jira-auth-container">
        <div className="jira-logo-large">
          <img src="https://cdn.worldvectorlogo.com/logos/jira-1.svg" alt="Jira" />
        </div>
        <h3>Connect Jira</h3>
        <p>Sync your Miro cards with Jira issues automatically. Track progress and estimates across both platforms.</p>
        <Button onClick={startOAuth} fullWidth>
          Connect with Atlassian
        </Button>
        <p className="hint" style={{ marginTop: '12px' }}>
          By connecting, you agree to allow this app to read and write to your Jira projects.
        </p>
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: 0 }}>
      <section>
        <SectionHeader 
          title="Jira Sync" 
          icon={<img src="https://cdn.worldvectorlogo.com/logos/jira-1.svg" style={{width: '14px', height: '14px'}} />}
          rightElement={
            <Button variant="tiny" onClick={() => setShowConfig(!showConfig)}>
              {showConfig ? 'Hide Config' : 'Config'}
            </Button>
          }
        />

        {showConfig && (
          <SummaryCard style={{marginBottom: '16px'}}>
            <InputField 
              label="Jira Parent Key (Default)"
              value={appParentKey}
              onChange={(e) => setAppParentKey(e.target.value.toUpperCase())}
              placeholder="e.g. PROJ-123"
              hint={appParentTitle ? `Target: ${appParentTitle}` : "Enter a Story/Task key to create sub-tasks under it."}
            />
            
            <div className="search-container">
              <InputField 
                label="Search for Parent Issue"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Type issue key or summary..."
                loading={isSearching}
              />
              
              {searchResults.length > 0 && (
                <div className="search-results">
                  {searchResults.map(issue => (
                    <div key={issue.id} className="search-result-item" onClick={() => selectSearchResult(issue)}>
                      <span className="issue-key">{issue.key}</span>
                      <span className="issue-summary">{issue.fields.summary}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <SummaryDivider />
            <Button variant="delete" fullWidth onClick={logout} style={{marginTop: '8px'}}>Disconnect Jira</Button>
          </SummaryCard>
        )}

        {selectedCards.length > 0 ? (
          <>
            <div className="selection-header-row">
              <span className="group-title">Selection ({validItemsCount} valid)</span>
              <button className="text-btn" onClick={toggleAll}>
                {checkedIds.size === validItemsCount ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            
            <div className="card-list" style={{maxHeight: '400px', overflowY: 'auto'}}>
              {selectedCards.map(card => {
                const isSynced = !!card.syncedKey;
                const parentKey = card.detectedParentKey || appParentKey;
                const isValid = isSynced || !!parentKey;
                
                return (
                  <ListItem
                    key={card.id}
                    title={card.title}
                    subtitle={isSynced ? `Synced: ${card.syncedKey}` : (parentKey ? `Target: ${parentKey}` : "No parent key detected")}
                    icon={isSynced ? '✅' : (isValid ? '📝' : '⚠️')}
                    checked={checkedIds.has(card.id)}
                    disabled={!isValid}
                    onToggle={() => toggleCheck(card.id)}
                  />
                );
              })}
            </div>

            <div style={{marginTop: '16px'}}>
              <Button 
                fullWidth 
                loading={isProcessing} 
                disabled={checkedIds.size === 0}
                onClick={handleSyncToJira}
              >
                Sync {checkedIds.size} Item(s) to Jira
              </Button>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="3" y1="9" x2="21" y2="9"></line>
                <line x1="9" y1="21" x2="9" y2="9"></line>
              </svg>
            </div>
            <h3>No Cards Selected</h3>
            <p>Select cards on the board to sync them with Jira.</p>
          </div>
        )}
      </section>
    </div>
  );
};
