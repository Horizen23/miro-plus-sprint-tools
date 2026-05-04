import * as React from "react";
import { SectionHeader } from "../components/SectionHeader";
import { InputField } from "../components/InputField";
import { Button } from "../components/Button";
import { SummaryCard } from "../components/SummaryCard";
import { useGlobalConfig } from "../contexts/GlobalConfigContext";

export const SettingsView: React.FC = () => {
  const { config, updateConfig, isLoading } = useGlobalConfig();
  const [localConfig, setLocalConfig] = React.useState(config);
  const [saving, setSaving] = React.useState(false);

  // Sync local state when global config loads
  React.useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  const handleSave = async () => {
    setSaving(true);
    await updateConfig(localConfig);
    setSaving(false);
    miro.board.notifications.showInfo("Global settings saved to board");
  };

  if (isLoading) return <div className="loading">Loading settings...</div>;

  return (
    <div className="container" style={{ padding: 0 }}>
      <section style={{ gap: '16px' }}>
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
