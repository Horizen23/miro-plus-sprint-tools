import * as React from "react";
import type { Card, AppCard, UserInfo } from "@mirohq/websdk-types";
import { parseCardTitle } from "../utils/estimationUtils";
import { SectionHeader } from "../components/SectionHeader";
import { SummaryCard, SummaryDivider } from "../components/SummaryCard";
import { Button } from "../components/Button";
import { InputField } from "../components/InputField";
import { ListItem } from "../components/ListItem";
import { copyToClipboard } from "../utils/miroUtils";
import { useGlobalConfig, GlobalConfig as TimesheetConfig } from "../contexts/GlobalConfigContext";
import { parseUserMapping, isUserOwnerOfCard } from "../utils/mappingUtils";

interface TimesheetProps {
  items: (Card | AppCard)[];
}

export const Timesheet: React.FC<TimesheetProps> = ({ items }) => {
  const { config, isLoading } = useGlobalConfig();
  const [timesheet, setTimesheet] = React.useState<Record<string, { title: string, cardId: string }[]>>({});
  const [filterOnlyMe, setFilterOnlyMe] = React.useState(false);
  const [filterTag, setFilterTag] = React.useState("");
  const [showConfig, setShowConfig] = React.useState(false);
  const [copying, setCopying] = React.useState(false);
  const [userInfo, setUserInfo] = React.useState<UserInfo | null>(null);

  React.useEffect(() => {
    const loadState = async () => {
      try {
        const info = await miro.board.getUserInfo();
        setUserInfo(info);
      } catch (e) {}

      // Load Personal Config (LocalStorage)
      const localOnlyMe = localStorage.getItem('miro_timesheet_only_me');
      if (localOnlyMe !== null) {
        setFilterOnlyMe(localOnlyMe === 'true');
      }
      const localTag = localStorage.getItem('miro_timesheet_filter_tag');
      if (localTag !== null) {
        setFilterTag(localTag);
      }
    };
    loadState();
  }, []);

  const updatePersonalOnlyMe = (val: boolean) => {
    setFilterOnlyMe(val);
    localStorage.setItem('miro_timesheet_only_me', String(val));
  };

  const updatePersonalTag = (val: string) => {
    setFilterTag(val);
    localStorage.setItem('miro_timesheet_filter_tag', val);
  };

  const generateTimesheet = async (cards: (Card | AppCard)[], currentConfig: TimesheetConfig, onlyMe: boolean, currentFilterTag: string) => {
    const grouped: Record<string, { title: string, cardId: string }[]> = {};
    const allTags = await miro.board.get({ type: "tag" });
    const tagMap = new Map(allTags.map(t => [t.id, t.title]));

    // Parse User Mapping using utility
    const mapping = parseUserMapping(currentConfig.tsUserMapping);

    // Extract 'tag' regex from variables for consistent ignoring
    let tagRegex = ""; // Default: No ignore
    const tagVarLine = currentConfig.tsVariables.split('\n').find(l => l.trim().startsWith('tag='));
    if (tagVarLine) {
      const parts = tagVarLine.split('=');
      if (parts[1]) tagRegex = parts[1].trim();
    }

    for (const card of cards) {
      if (card.type !== "card" && card.type !== "app_card") continue;
      
      let c = card as any;
      
      // Fetch full item to get description if missing
      if (c.type === 'card' && !c.description) {
        try {
          c = await miro.board.getById(c.id);
        } catch(e) {}
      }

      if (!c.startDate) continue;

      const cardTags = (c.tagIds || [])
        .map((tagId: string) => tagMap.get(tagId))
        .filter(Boolean) as string[];

      // 1. Filter by Tag
      if (currentFilterTag) {
        try {
          const filterRe = new RegExp(currentFilterTag, "i");
          if (!cardTags.some(t => filterRe.test(t))) continue;
        } catch (e) {
          if (!cardTags.some(t => t.toLowerCase().includes(currentFilterTag.toLowerCase()))) continue;
        }
      }

      // 2. Filter by Me (Only My Tasks)
      if (onlyMe && userInfo) {
        // Standard Miro Assignee check
        const isMiroAssignee = c.assigneeId === userInfo.id;
        
        // Use mapping utility to check ownership (ignores jira-* tags)
        const isMappedOwner = isUserOwnerOfCard(cardTags, mapping, userInfo, tagRegex);

        // Match by Jira Assignee in metadata (email match)
        let isJiraAssignee = false;
        const metadataKey = process.env.NEXT_PUBLIC_MIRO_METADATA_KEY || "jira-sync";
        const meta = c.metadata?.[metadataKey];
        const myEmail = (userInfo as any).email?.toLowerCase();
        if (meta?.assigneeEmail && myEmail && meta.assigneeEmail.toLowerCase() === myEmail) {
          isJiraAssignee = true;
        }

        // Match by Name/Email in Title or Description (Last Resort)
        const myName = userInfo.name?.toLowerCase();
        const inContent = (c.title + " " + (c.description || "")).toLowerCase();
        const contentMatch = (myName && inContent.includes(myName)) || (myEmail && inContent.includes(myEmail));

        if (!isMiroAssignee && !isMappedOwner && !isJiraAssignee && !contentMatch) {
          continue;
        }
      }

      const start = new Date(c.startDate);
      const end = c.dueDate ? new Date(c.dueDate) : new Date(c.startDate);
      
      // Zero out time for comparison
      const current = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());

      while (current <= last) {
        const dateStr = current.toISOString().split('T')[0];
        if (!grouped[dateStr]) grouped[dateStr] = [];
        
        let rawTitle = c.title || "Untitled Card";
        const strippedTitle = rawTitle.replace(/<[^>]*>/g, '').trim();
        
        // Use central parser to get clean title
        const { cleanTitle: title } = parseCardTitle(strippedTitle);

        // Extract Variables
        const vars: Record<string, string> = { title, project: currentConfig.tsDefaultProject };
        const varLines = currentConfig.tsVariables.split('\n');

        varLines.forEach(line => {
          const splitIdx = line.indexOf('=');
          if (splitIdx !== -1) {
            const name = line.substring(0, splitIdx).trim();
            if (name && vars[name] === undefined) vars[name] = "";
          }
        });

        varLines.forEach(line => {
          const splitIdx = line.indexOf('=');
          if (splitIdx === -1) return;
          const name = line.substring(0, splitIdx).trim();
          const regexStr = line.substring(splitIdx + 1).trim();
          if (name && regexStr) {
            try {
              const re = new RegExp(regexStr, 'i');
              for (const t of cardTags) {
                const m = t.match(re);
                if (m) {
                  vars[name] = m[1] || m[0];
                  break;
                }
              }
            } catch (e) {}
          }
        });

        let isMeeting = false;
        try {
          const meetingRe = new RegExp(currentConfig.tsMeetingTag, "i");
          isMeeting = cardTags.some(t => meetingRe.test(t));
        } catch (e) {
          isMeeting = cardTags.some(t => t.toLowerCase().includes(currentConfig.tsMeetingTag.toLowerCase()));
        }

        let finalTitle = isMeeting ? currentConfig.tsMeetingPattern : currentConfig.tsTaskPattern;
        finalTitle = `${currentConfig.tsProject}${finalTitle}`;

        Object.entries(vars).forEach(([name, val]) => {
          finalTitle = finalTitle.replace(new RegExp(`{${name}}`, 'g'), val || "");
        });

        grouped[dateStr].push({ title: finalTitle, cardId: c.id });
        current.setDate(current.getDate() + 1);
      }
    }

    const sortedKeys = Object.keys(grouped).sort();
    const sortedGrouped: Record<string, { title: string, cardId: string }[]> = {};
    sortedKeys.forEach(key => { sortedGrouped[key] = grouped[key]; });
    return sortedGrouped;
  };

  React.useEffect(() => {
    const updateTimesheet = async () => {
      const ts = await generateTimesheet(items, config, filterOnlyMe, filterTag);
      setTimesheet(ts);
    };
    updateTimesheet();
  }, [items, config, filterOnlyMe, filterTag]);

  const handleCopyAll = () => {
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
    
    copyToClipboard(text.trim());
    setCopying(true);
    setTimeout(() => setCopying(false), 2000);
  };

  const handleCopyDay = (date: string, dayItems: { title: string }[]) => {
    const dateObj = new Date(date);
    const thaiDate = dateObj.toLocaleDateString('th-TH', { 
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
    });
    let text = `${thaiDate}\n`;
    dayItems.forEach(item => {
      text += `- ${item.title}\n`;
    });
    copyToClipboard(text.trim());
    miro.board.notifications.showInfo(`คัดลอกข้อมูลวันที่ ${thaiDate} แล้ว`);
  };

  const zoomToCard = async (id: string) => {
    try {
      await miro.board.viewport.zoomTo(await miro.board.get({ id }));
      await miro.board.select({ id });
    } catch (e) {}
  };

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
                onChange={(e) => updatePersonalTag(e.target.value)}
              />
              <div style={{ marginTop: '4px' }}>
                <InputField 
                  type="checkbox"
                  label="Show only my tasks (Only Me)"
                  checked={Boolean(filterOnlyMe)}
                  onChange={(e: any) => updatePersonalOnlyMe(e.target.checked)}
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
          
          <div className="timesheet-list">
            {Object.entries(timesheet).map(([date, dayItems]) => {
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
            })}
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
