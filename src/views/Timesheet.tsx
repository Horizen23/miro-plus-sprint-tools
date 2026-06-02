import * as React from "react";
import type { Card, AppCard, UserInfo, Tag } from "@mirohq/websdk-types";
import { parseCardTitle } from "../services/miro/estimationUtils";
import { SectionHeader } from "../components/SectionHeader";
import { SummaryCard, SummaryDivider } from "../components/SummaryCard";
import { Button } from "../components/Button";
import { InputField } from "../components/InputField";
import { ListItem } from "../components/ListItem";
import { useGlobalConfig, GlobalConfig as TimesheetConfig } from "../contexts/GlobalConfigContext";
import { parseUserMapping, isUserOwnerOfCard, getCardMappedUser } from "../services/jira/mappingUtils";
import { cacheUtils } from "../utils/cacheUtils";
import { notify, copyAndNotify } from "../services/miro/uiUtils";
import { useDebounce } from "../hooks/useDebounce";
import { usePanel } from "@/contexts/PanelContext";

export const Timesheet: React.FC = () => {
  const { selectedItems: items } = usePanel();
  const { config, boardId, isLoading } = useGlobalConfig();
  const [timesheet, setTimesheet] = React.useState<Record<string, { title: string, cardId: string }[]>>({});
  const [filterOnlyMe, setFilterOnlyMe] = React.useState(false);
  const [includeUnassigned, setIncludeUnassigned] = React.useState(true);
  const [filterTag, setFilterTag] = React.useState("");
  const [excludeTitle, setExcludeTitle] = React.useState("");
  const [showConfig, setShowConfig] = React.useState(false);
  const [copying, setCopying] = React.useState(false);
  const [userInfo, setUserInfo] = React.useState<UserInfo | null>(null);
  const [allTags, setAllTags] = React.useState<Tag[]>([]);

  React.useEffect(() => {
    const loadState = async () => {
      try {
        const USER_INFO_CACHE_KEY = 'miro_cache_user_info';
        let info = cacheUtils.get<UserInfo>(USER_INFO_CACHE_KEY);
        
        if (!info) {
          if (typeof miro !== 'undefined') {
            info = await miro.board.getUserInfo();
            cacheUtils.set(USER_INFO_CACHE_KEY, info, 3600 * 24 * 7); // 7 days cache
          }
        }
        setUserInfo(info);
      } catch (e: unknown) {
        console.warn("[Timesheet] Failed to load user info:", e);
      }

      try {
        if (!boardId || typeof miro === 'undefined') return;
        const CACHE_KEY = `miro_cache_tags_${boardId}`;
        let tags = cacheUtils.get<Tag[]>(CACHE_KEY);
        
        if (!tags) {
          tags = await miro.board.get({ type: "tag" });
          cacheUtils.set(CACHE_KEY, tags, 3600 * 24); // 1 day cache
        }
        setAllTags(tags);
      } catch (e: unknown) {
        console.warn("[Timesheet] Failed to load tags:", e);
      }

      // Load Personal Config (LocalStorage)
      const localOnlyMe = localStorage.getItem('miro_timesheet_only_me');
      if (localOnlyMe !== null) {
        setFilterOnlyMe(localOnlyMe === 'true');
      }
      const localUnassigned = localStorage.getItem('miro_timesheet_include_unassigned');
      if (localUnassigned !== null) {
        setIncludeUnassigned(localUnassigned === 'true');
      }
      const localTag = localStorage.getItem('miro_timesheet_filter_tag');
      if (localTag !== null) {
        setFilterTag(localTag);
      }
      const localExclude = localStorage.getItem('miro_timesheet_exclude_title');
      if (localExclude !== null) {
        setExcludeTitle(localExclude);
      }
    };
    loadState();
  }, [boardId]);

  const updatePersonalOnlyMe = (val: boolean) => {
    setFilterOnlyMe(val);
    localStorage.setItem('miro_timesheet_only_me', String(val));
  };

  const updatePersonalUnassigned = (val: boolean) => {
    setIncludeUnassigned(val);
    localStorage.setItem('miro_timesheet_include_unassigned', String(val));
  };

  const updatePersonalTag = (val: string) => {
    setFilterTag(val);
    localStorage.setItem('miro_timesheet_filter_tag', val);
  };

  const updatePersonalExcludeTitle = (val: string) => {
    setExcludeTitle(val);
    localStorage.setItem('miro_timesheet_exclude_title', val);
  };

  const generateTimesheet = React.useCallback(async (
    cards: (Card | AppCard)[], 
    currentConfig: TimesheetConfig, 
    onlyMe: boolean, 
    currentFilterTag: string, 
    includeUnassigned: boolean, 
    currentExcludeTitle: string, 
    tags: Tag[]
  ): Promise<Record<string, { title: string, cardId: string }[]>> => {
    const grouped: Record<string, { title: string, cardId: string }[]> = {};
    const tagMap = new Map(tags.map(t => [t.id, t.title]));

    // 1. Pre-process User Mapping & Tag Regex
    const mapping = parseUserMapping(currentConfig.tsUserMapping);
    let tagRegex = "";
    const varLines = currentConfig.tsVariables.split('\n');
    const tagVarLine = varLines.find(l => l.trim().startsWith('tag='));
    if (tagVarLine) {
      const parts = tagVarLine.split('=');
      if (parts[1]) tagRegex = parts[1].trim();
    }

    // 2. Pre-process Variable Extractors (Regexes)
    const variableExtractors = varLines
      .map(line => {
        const splitIdx = line.indexOf('=');
        if (splitIdx === -1) return null;
        const name = line.substring(0, splitIdx).trim();
        const regexStr = line.substring(splitIdx + 1).trim();
        try {
          return { name, re: new RegExp(regexStr, 'i') };
        } catch (e: unknown) {
          return null;
        }
      })
      .filter((v): v is { name: string, re: RegExp } => !!v && v.name !== 'tag');

    // 3. Pre-process Filters
    let excludeRe: RegExp | null = null;
    if (currentExcludeTitle) {
      try { excludeRe = new RegExp(currentExcludeTitle, "i"); } catch (e: unknown) {}
    }
    let filterRe: RegExp | null = null;
    if (currentFilterTag) {
      try { filterRe = new RegExp(currentFilterTag, "i"); } catch (e: unknown) {}
    }
    
    let meetingRe: RegExp | null = null;
    try { meetingRe = new RegExp(currentConfig.tsMeetingTag, "i"); } catch (e: unknown) {}

    for (const card of cards) {
      if (card.type !== "card" && card.type !== "app_card") continue;
      
      const c = card as Card;
      if (!c.startDate && !c.dueDate) continue;

      // 4. Filter by Exclude Title
      if (excludeRe && excludeRe.test(c.title || "")) continue;
      if (!excludeRe && currentExcludeTitle && (c.title || "").toLowerCase().includes(currentExcludeTitle.toLowerCase())) continue;

      const tagIds = (c as unknown as { tagIds?: string[] }).tagIds || [];
      const cardTags = tagIds
        .map((tagId) => tagMap.get(tagId))
        .filter((title): title is string => !!title);

      // 5. Filter by Tag
      if (filterRe && !cardTags.some(t => filterRe!.test(t))) continue;
      if (!filterRe && currentFilterTag && !cardTags.some(t => t.toLowerCase().includes(currentFilterTag.toLowerCase()))) continue;

      const mappedUser = getCardMappedUser(cardTags, mapping, tagRegex);
      const isUnassigned = !c.assignee?.userId && !mappedUser;
      if (isUnassigned && !includeUnassigned) continue;

      if (onlyMe && userInfo) {
        const isMiroAssignee = c.assignee?.userId === userInfo.id;
        const isMappedOwner = isUserOwnerOfCard(cardTags, mapping, userInfo, tagRegex);
        if (!isMiroAssignee && !isMappedOwner && !isUnassigned) continue;
      }

      // 6. Pre-calculate Variables for this card (once per card)
      const baseVars: Record<string, string> = { 
        project: currentConfig.tsDefaultProject,
        key: ""
      };
      
      // Extract dynamic vars from tags
      variableExtractors.forEach(ext => {
        for (const t of cardTags) {
          const m = t.match(ext.re);
          if (m) {
            baseVars[ext.name] = m[1] || m[0];
            break;
          }
        }
      });

      // Special handling for 'tag' (used for Jira key)
      let cardTagValue = "";
      if (tagRegex) {
        try {
          const tagRe = new RegExp(tagRegex, 'i');
          for (const t of cardTags) {
            const m = t.match(tagRe);
            if (m) { cardTagValue = m[1] || m[0]; break; }
          }
        } catch(e: unknown) {}
      }
      if (cardTagValue && currentConfig.jiraPrefix) {
        baseVars.key = `${currentConfig.jiraPrefix}-${cardTagValue}`;
        baseVars.tag = cardTagValue;
      }

      const { cleanTitle: title, estimate } = parseCardTitle(c.title || "Untitled Card");
      const cleanDisplayTitle = title.replace(/^(\s*\[[^\]]*\])+\s*/, '').trim();
      const rawTitle = (c.title || "").trim();
      
      // 6.5. Pattern Matching for detail filling (Timesheet only)
      let autoDetail = "";
      if (currentConfig.tsAutoFillDetailPatterns) {
        const patterns = currentConfig.tsAutoFillDetailPatterns.split('\n').map(line => {
          const [key, ...rest] = line.split('=');
          return { pattern: key.trim(), description: rest.join('=').trim() };
        }).filter(p => p.pattern)
        .sort((a, b) => b.pattern.length - a.pattern.length); // Sort longest first
        
        // Exact match (100%) against both clean and raw titles
        const match = patterns.find(p => 
          cleanDisplayTitle.toLowerCase() === p.pattern.toLowerCase() || 
          rawTitle.toLowerCase() === p.pattern.toLowerCase()
        );
        if (match) {
          autoDetail = match.description;
        }
      }
      
      baseVars.title = cleanDisplayTitle;
      baseVars.estimate = estimate;
      baseVars.description = autoDetail || c.description || "";
      const isAutoFillDetail  = Boolean(autoDetail);

      const startDateStr = c.startDate || c.dueDate;
      const dueDateStr = c.dueDate || c.startDate;
      
      if (!startDateStr || !dueDateStr) continue;

      const start = new Date(startDateStr);
      const end = new Date(dueDateStr);
      const current = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());

      const isMeeting = (meetingRe 
        ? cardTags.some(t => meetingRe!.test(t))
        : cardTags.some(t => t.toLowerCase().includes(currentConfig.tsMeetingTag.toLowerCase())))
        || (c.title || "").toLowerCase().includes("meeting");

      let pattern = isMeeting ? currentConfig.tsMeetingPattern : currentConfig.tsTaskPattern;

      if (isAutoFillDetail && pattern && !pattern.includes('{description}')) {
        pattern += " - {description}";
      }

      let finalTitle = `${currentConfig.tsProject}${pattern}`;
      Object.entries(baseVars).forEach(([name, val]) => {
        finalTitle = finalTitle.replace(new RegExp(`{${name}}`, 'g'), val || "");
      });
      // Clear any remaining placeholders that weren't matched
      finalTitle = finalTitle.replace(/\{[^}]+\}/g, "").trim();
      // Clean up trailing delimiters if description/estimate was empty
      finalTitle = finalTitle.replace(/\s*-\s*$/, "").replace(/\s*:\s*$/, "");

      // 7. Loop through dates
      while (current <= last) {
        const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
        if (!grouped[dateStr]) grouped[dateStr] = [];
        grouped[dateStr].push({ title: finalTitle, cardId: c.id });
        current.setDate(current.getDate() + 1);
      }
    }

    const sortedKeys = Object.keys(grouped).sort();
    const sortedGrouped: Record<string, { title: string, cardId: string }[]> = {};
    sortedKeys.forEach(key => { sortedGrouped[key] = grouped[key]; });
    return sortedGrouped;
  }, [userInfo]);

  const [isPending, startTransition] = React.useTransition();
  const debouncedFilterTag = useDebounce(filterTag, 300);
  const debouncedExcludeTitle = useDebounce(excludeTitle, 300);

  React.useEffect(() => {
    const refresh = async () => {
      if (isLoading) return;
      const data = await generateTimesheet(items, config, filterOnlyMe, debouncedFilterTag, includeUnassigned, debouncedExcludeTitle, allTags);
      startTransition(() => {
        setTimesheet(data);
      });
    };
    refresh();
  }, [items, config, isLoading, filterOnlyMe, debouncedFilterTag, includeUnassigned, debouncedExcludeTitle, allTags, generateTimesheet]);

  const handleCopyAll = React.useCallback(async () => {
    let text = "";
    Object.entries(timesheet).forEach(([date, items]) => {
      const dateObj = new Date(date);
      const dateStr = dateObj.toLocaleDateString('th-TH', { 
        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
      });
      text += `${dateStr}\n`;
      items.forEach(item => {
        text += `- ${item.title}\n`;
      });
      text += "\n";
    });
    
    const success = await copyAndNotify(text.trim(), "Full Timesheet");
    if (success) {
      setCopying(true);
      setTimeout(() => setCopying(false), 2000);
    }
  }, [timesheet]);

  const handleCopyJson = React.useCallback(async () => {
    const flatData: { date: string, title: string, cardId: string }[] = [];
    Object.entries(timesheet).forEach(([date, items]) => {
      items.forEach(item => {
        flatData.push({ date, title: item.title, cardId: item.cardId });
      });
    });
    
    await copyAndNotify(JSON.stringify(flatData), "JSON Data");
  }, [timesheet]);

  const handleCopyDay = React.useCallback(async (date: string, dayItems: { title: string }[]) => {
    const dateObj = new Date(date);
    const thaiDate = dateObj.toLocaleDateString('th-TH', { 
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
    });
    let text = `${thaiDate}\n`;
    dayItems.forEach(item => {
      text += `- ${item.title}\n`;
    });
    await copyAndNotify(text.trim(), `Timesheet for ${thaiDate}`);
  }, []);

  const zoomToCard = React.useCallback(async (id: string) => {
    try {
      if (typeof miro !== 'undefined') {
        await miro.board.viewport.zoomTo(await miro.board.get({ id }));
        await miro.board.select({ id });
      }
    } catch (e: unknown) {}
  }, []);

  const renderedTimesheet = React.useMemo(() => (
    Object.entries(timesheet).map(([date, dayItems]) => {
      const dateObj = new Date(date);
      const thaiDate = dateObj.toLocaleDateString('th-TH', { 
        weekday: 'short', day: 'numeric', month: 'short'
      });

      return (
        <div key={date} className="timesheet-group">
          <div className="date-header">
            <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
              <span className="date-value">{thaiDate}</span>
              <span className="card-count">{dayItems.length} รายการ</span>
            </div>
            <button 
              className="btn-tiny-copy"
              title="Copy this day"
              onClick={() => handleCopyDay(date, dayItems)}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
          </div>
          <div className="titles-container">
            {dayItems.map((item, idx) => (
              <ListItem 
                key={`${date}-${idx}`} 
                title={item.title}
                showBullet
                onClick={() => zoomToCard(item.cardId)}
              />
            ))}
          </div>
        </div>
      );
    })
  ), [timesheet, handleCopyDay, zoomToCard]);

  if (isLoading) return <div className="loading">Loading...</div>;

  return (
    <div className="timesheet-container">
      {/* Quick Personal Filters (Collapsible) */}
      <section className="config-section">
        <SectionHeader 
          title="Personal Filter" 
          icon={(
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
          )}
          isExpandable
          isExpanded={showConfig}
          onToggle={() => setShowConfig(!showConfig)}
        />

        {showConfig && (
          <div className="config-body" style={{ marginTop: '4px' }}>
            <SummaryCard>
              <InputField 
                placeholder="Filter by Tag (e.g. Sprint-21)"
                value={filterTag}
                onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => updatePersonalTag(e.target.value)}
              />
              <InputField 
                placeholder="Exclude Title (e.g. Holiday|Leave)"
                value={excludeTitle}
                onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => updatePersonalExcludeTitle(e.target.value)}
              />
              <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <InputField 
                  type="checkbox"
                  label="Show only my tasks (Only Me)"
                  checked={Boolean(filterOnlyMe)}
                  onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => updatePersonalOnlyMe((e.target as HTMLInputElement).checked)}
                  style={{ width: '15px', height: '15px', cursor: 'pointer' }}
                />
                <InputField 
                  type="checkbox"
                  label="Include unassigned tasks"
                  checked={Boolean(includeUnassigned)}
                  onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => updatePersonalUnassigned((e.target as HTMLInputElement).checked)}
                  style={{ width: '15px', height: '15px', cursor: 'pointer' }}
                />
              </div>
            </SummaryCard>
          </div>
        )}
      </section>

      <SummaryDivider style={{ margin: '12px 0' }} />

      {Object.keys(timesheet).length > 0 ? (
        <section className="timesheet-section">
          <div className="section-header-row">
            <h2 className="section-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
              Preview
            </h2>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button 
                variant="secondary"
                onClick={handleCopyJson}
                style={{ height: '32px', fontSize: '11px', padding: '0 8px' }}
              >
                Copy JSON
              </Button>
              <Button 
                variant="copy" 
                className={copying ? 'success' : ''} 
                onClick={handleCopyAll}
                icon={copying ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                ) : null}
              >
                {copying ? 'Copied!' : 'Copy All'}
              </Button>
            </div>
          </div>
          
          <div className={`timesheet-list ${isPending ? 'pending-update' : ''}`} style={{ opacity: isPending ? 0.6 : 1, transition: 'opacity 0.2s ease' }}>
            {renderedTimesheet}
          </div>
        </section>
      ) : (
        <div className="empty-state">
          <div className="empty-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
              <path d="M8 14h.01"></path>
              <path d="M12 14h.01"></path>
              <path d="M16 14h.01"></path>
              <path d="M8 18h.01"></path>
              <path d="M12 18h.01"></path>
              <path d="M16 18h.01"></path>
            </svg>
          </div>
          <h3>No Cards Selected</h3>
          <p>Select cards with Start/Due dates to generate your timesheet automatically.</p>
        </div>
      )}
    </div>
  );
};
