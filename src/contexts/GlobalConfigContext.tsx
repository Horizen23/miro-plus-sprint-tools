'use client';
import * as React from "react";

export interface GlobalConfig {
  tsProject: string;
  tsDefaultProject: string;
  tsVariables: string;
  tsMeetingTag: string;
  tsMeetingPattern: string;
  tsTaskPattern: string;
  tsUserMapping: string;
  jiraDomain: string;
  jiraPrefix: string;
  jiraStoryPointsField: string;
  tsAutoFillDetailPatterns: string;
}

export const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  tsProject: "[{project}]",
  tsDefaultProject: process.env.NEXT_PUBLIC_TIMESHEET_DEFAULT_PROJECT || "PLUSOS",
  tsVariables: process.env.NEXT_PUBLIC_TIMESHEET_VARIABLES || "tag=jira-(.+)\nproject=(PLUSOS|SMARTEYES|EXIM)",
  tsMeetingTag: "meeting",
  tsMeetingPattern: "[Meeting][Sprint] {title} - {description}",
  tsTaskPattern: "[Task][{tag}] {title}",
  tsUserMapping: "nickname=email@company.com",
  jiraDomain: "",
  jiraPrefix: process.env.NEXT_PUBLIC_JIRA_PREFIX || "FTDGENERIC",
  jiraStoryPointsField: process.env.NEXT_PUBLIC_JIRA_STORY_POINTS_FIELD || "customfield_10016",
  tsAutoFillDetailPatterns: "Code Review=รีวิวและตรวจสอบคุณภาพของ Source Code (Time Block 1: 10:50, 2: 15:00, 3: 16:40)\nDaily=อัปเดตสถานะงานประจำวันและอุปสรรคที่พบ (09:00 - 09:15)\nSprint Planning I=สรุปเป้าหมายและภาพรวมของ Sprint (ร่วมกับ PO)\nSprint Planning II=ทีมวางแผนงานเทคนิคและประเมินความซับซ้อนร่วมกัน\nSprint Refinement I=ทบทวนและลงรายละเอียดของงาน (ร่วมกับ PO)\nSprint Refinement II=ประเมินความยาก (Points) และสรุปความเข้าใจของงาน\nSprint Review=สรุปผลงานและ Demo สิ่งที่ทำเสร็จ in Sprint",
};

interface GlobalConfigContextType {
  config: GlobalConfig;
  updateConfig: (newConfig: Partial<GlobalConfig>) => Promise<void>;
  boardId: string | null;
  isLoading: boolean;
}

const GlobalConfigContext = React.createContext<GlobalConfigContextType | undefined>(undefined);

interface LegacyConfig {
  project?: string;
  defaultProject?: string;
  variables?: string;
  userMapping?: string;
  meetingTag?: string;
  meetingPattern?: string;
  taskPattern?: string;
  jiraPrefix?: string;
  [key: string]: unknown;
}

export const GlobalConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = React.useState<GlobalConfig>(DEFAULT_GLOBAL_CONFIG);
  const [boardId, setBoardId] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const loadConfig = async () => {
      try {
        if (typeof miro === 'undefined') return;
        
        const info = await miro.board.getInfo();
        setBoardId(info.id);

        const appDataKey = "globalConfig";
        const board = miro.board as unknown as { 
          getAppData: (key: string) => Promise<Record<string, unknown> | undefined>,
          setAppData: (key: string, data: unknown) => Promise<void>
        };

        const saved = await board.getAppData(appDataKey);
        if (saved) {
          const data = { ...saved } as Record<string, unknown>;
          // Migration logic
          if (data['cardPatterns'] && !data['tsAutoFillDetailPatterns']) {
            data['tsAutoFillDetailPatterns'] = data['cardPatterns'] as string;
          }
          if (data['tsCardPatterns'] && !data['tsAutoFillDetailPatterns']) {
            data['tsAutoFillDetailPatterns'] = data['tsCardPatterns'] as string;
          }
          if (data['tsCardDetailPatterns'] && !data['tsAutoFillDetailPatterns']) {
            data['tsAutoFillDetailPatterns'] = data['tsCardDetailPatterns'] as string;
          }
          setConfig(prev => ({ ...prev, ...data } as GlobalConfig));
        } else {
          const legacy = await board.getAppData("timesheetConfig") as unknown as LegacyConfig | undefined;
          if (legacy) {
            const migrated: GlobalConfig = {
              ...DEFAULT_GLOBAL_CONFIG,
              tsProject: legacy.project || DEFAULT_GLOBAL_CONFIG.tsProject,
              tsDefaultProject: legacy.defaultProject || DEFAULT_GLOBAL_CONFIG.tsDefaultProject,
              tsVariables: legacy.variables || DEFAULT_GLOBAL_CONFIG.tsVariables,
              tsUserMapping: legacy.userMapping || DEFAULT_GLOBAL_CONFIG.tsUserMapping,
              tsMeetingTag: legacy.meetingTag || DEFAULT_GLOBAL_CONFIG.tsMeetingTag,
              tsMeetingPattern: legacy.meetingPattern || DEFAULT_GLOBAL_CONFIG.tsMeetingPattern,
              tsTaskPattern: legacy.taskPattern || DEFAULT_GLOBAL_CONFIG.tsTaskPattern,
              jiraPrefix: legacy.jiraPrefix || DEFAULT_GLOBAL_CONFIG.jiraPrefix,
            };
            setConfig(migrated);
            await board.setAppData(appDataKey, migrated);
          }
        }
      } catch (e: unknown) {
        console.error("Failed to load global config:", e);
      } finally {
        setIsLoading(false);
      }
    };
    loadConfig();
  }, []);

  const updateConfig = async (newConfig: Partial<GlobalConfig>) => {
    const updated = { ...config, ...newConfig };
    setConfig(updated);
    try {
      if (typeof miro === 'undefined') return;
      const board = miro.board as unknown as { 
        setAppData: (key: string, data: unknown) => Promise<void>
      };

      await board.setAppData("globalConfig", updated);
      // Keep legacy for safety
      await board.setAppData("timesheetConfig", {
        project: updated.tsProject,
        defaultProject: updated.tsDefaultProject,
        variables: updated.tsVariables,
        userMapping: updated.tsUserMapping,
        meetingTag: updated.tsMeetingTag,
        meetingPattern: updated.tsMeetingPattern,
        taskPattern: updated.tsTaskPattern,
        jiraPrefix: updated.jiraPrefix,
        jiraStoryPointsField: updated.jiraStoryPointsField,
      });
    } catch (e: unknown) {
      console.error("Failed to save global config:", e);
    }
  };

  return (
    <GlobalConfigContext.Provider value={{ config, updateConfig, boardId, isLoading }}>
      {children}
    </GlobalConfigContext.Provider>
  );
};

export const useGlobalConfig = () => {
  const context = React.useContext(GlobalConfigContext);
  if (context === undefined) {
    throw new Error("useGlobalConfig must be used within a GlobalConfigProvider");
  }
  return context;
};
