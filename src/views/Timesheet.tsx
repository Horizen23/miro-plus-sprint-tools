import * as React from "react";
import type { Card, AppCard } from "@mirohq/websdk-types";
import { SectionHeader } from "../components/SectionHeader";
import { SummaryCard, SummaryDivider } from "../components/SummaryCard";
import { Button } from "../components/Button";
import { InputField } from "../components/InputField";
import { ListItem } from "../components/ListItem";

interface TimesheetProps {
  items: (Card | AppCard)[];
}

interface TimesheetConfig {
  project: string;
  defaultProject: string;
  meetingTag: string;
  meetingPattern: string;
  taskTag: string;
  taskPattern: string;
  variables: string;
  filterTag: string;
}

const DEFAULT_CONFIG: TimesheetConfig = {
  project: "[{project}]",
  defaultProject: process.env.NEXT_PUBLIC_TIMESHEET_DEFAULT_PROJECT || "PLUSOS",
  meetingTag: "meeting",
  meetingPattern: "[Meeting][Sprint] {title}",
  taskTag: "jira-([\\d-]+)",
  taskPattern: "[Task][{tag}] {title}",
  variables: process.env.NEXT_PUBLIC_TIMESHEET_VARIABLES || "tag=jira-([\\d-]+)\nproject=(PLUSOS|SMARTEYES|EXIM)",
  filterTag: "",
};

export const Timesheet: React.FC<TimesheetProps> = ({ items }) => {
  const [timesheet, setTimesheet] = React.useState<Record<string, { title: string, cardId: string }[]>>({});
  const [config, setConfig] = React.useState<TimesheetConfig>(DEFAULT_CONFIG);
  const [showConfig, setShowConfig] = React.useState(false);
  const [copying, setCopying] = React.useState(false);

  React.useEffect(() => {
    const loadConfig = async () => {
      try {
        const appDataKey = process.env.NEXT_PUBLIC_MIRO_APPDATA_TIMESHEET_KEY || "timesheetConfig";
        const savedConfig = await (miro.board as any).getAppData(appDataKey);
        if (savedConfig) {
          setConfig(prev => ({ ...prev, ...(savedConfig as object) }));
        }
      } catch (e) {}
    };
    loadConfig();
  }, []);

  const updateConfig = async (newConfig: Partial<TimesheetConfig>) => {
    const updated = { ...config, ...newConfig };
    setConfig(updated);
    try {
      const appDataKey = process.env.NEXT_PUBLIC_MIRO_APPDATA_TIMESHEET_KEY || "timesheetConfig";
      await (miro.board as any).setAppData(appDataKey, updated);
    } catch (e) {}
  };



  const generateTimesheet = async (cards: (Card | AppCard)[], currentConfig: TimesheetConfig) => {
    const grouped: Record<string, { title: string, cardId: string }[]> = {};
    const allTags = await miro.board.get({ type: "tag" });
    const tagMap = new Map(allTags.map(t => [t.id, t.title]));

    cards.forEach((card) => {
      if (card.type !== "card") return;
      const c = card as Card;
      if (!c.startDate) return;

      const cardTags = (c.tagIds || [])
        .map(tagId => tagMap.get(tagId))
        .filter(Boolean) as string[];

      // Filter by User Tag
      if (currentConfig.filterTag) {
        try {
          const filterRe = new RegExp(currentConfig.filterTag, "i");
          if (!cardTags.some(t => filterRe.test(t))) return;
        } catch (e) {
          if (!cardTags.some(t => t.toLowerCase().includes(currentConfig.filterTag.toLowerCase()))) return;
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
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = rawTitle;
        let title = (tempDiv.textContent || tempDiv.innerText || "").trim();
        title = title.replace(/\[([^\]]+)\]/g, "$1");

        // Extract Variables
        const vars: Record<string, string> = { title, project: currentConfig.defaultProject };
        const varLines = currentConfig.variables.split('\n');

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
          const meetingRe = new RegExp(currentConfig.meetingTag, "i");
          isMeeting = cardTags.some(t => meetingRe.test(t));
        } catch (e) {
          isMeeting = cardTags.some(t => t.toLowerCase().includes(currentConfig.meetingTag.toLowerCase()));
        }

        let finalTitle = isMeeting ? currentConfig.meetingPattern : currentConfig.taskPattern;
        finalTitle = `${currentConfig.project}${finalTitle}`;

        Object.entries(vars).forEach(([name, val]) => {
          finalTitle = finalTitle.replace(new RegExp(`{${name}}`, 'g'), val || "");
        });

        grouped[dateStr].push({ title: finalTitle, cardId: c.id });
        current.setDate(current.getDate() + 1);
      }
    });

    const sortedKeys = Object.keys(grouped).sort();
    const sortedGrouped: Record<string, { title: string, cardId: string }[]> = {};
    sortedKeys.forEach(key => { sortedGrouped[key] = grouped[key]; });
    return sortedGrouped;
  };

  React.useEffect(() => {
    const updateTimesheet = async () => {
      const ts = await generateTimesheet(items, config);
      setTimesheet(ts);
    };
    updateTimesheet();
  }, [items, config]);

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
    
    navigator.clipboard.writeText(text.trim());
    setCopying(true);
    setTimeout(() => setCopying(false), 2000);
  };

  const zoomToCard = async (id: string) => {
    try {
      await miro.board.viewport.zoomTo(await miro.board.get({ id }));
      await miro.board.select({ id });
    } catch (e) {}
  };

  return (
    <div className="timesheet-container">
      <section className="config-section">
        <SectionHeader 
          title="Config Timesheet" 
          icon={(
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          )}
          isExpandable
          isExpanded={showConfig}
          onToggle={() => setShowConfig(!showConfig)}
        />

        {showConfig && (
          <div className="config-body">
            <SummaryCard>
              <InputField 
                label="Variables (name=regex)"
                isTextArea
                style={{ minHeight: '60px' }}
                value={config.variables}
                onChange={(e) => updateConfig({ variables: e.target.value })}
              />
              <InputField 
                label="Default Project"
                value={config.defaultProject}
                onChange={(e) => updateConfig({ defaultProject: e.target.value })}
              />
              <InputField 
                label="Filter Tag"
                value={config.filterTag}
                onChange={(e) => updateConfig({ filterTag: e.target.value })}
              />
              
              <SummaryDivider />
              <Button onClick={() => setShowConfig(false)} fullWidth>
                Close Settings
              </Button>
            </SummaryCard>
          </div>
        )}
      </section>

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
            {Object.entries(timesheet).map(([date, items]) => {
              const dateObj = new Date(date);
              const thaiDate = dateObj.toLocaleDateString('th-TH', { 
                weekday: 'short', day: 'numeric', month: 'short'
              });
              return (
                <div key={date} className="timesheet-group">
                  <div className="date-header">
                    <span className="date-value">{thaiDate}</span>
                    <span className="card-count">{items.length} รายการ</span>
                  </div>
                  <div className="titles-container">
                    {items.map((item, idx) => (
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
