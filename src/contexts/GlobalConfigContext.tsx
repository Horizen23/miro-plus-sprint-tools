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
}

export const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  tsProject: "[{project}]",
  tsDefaultProject: process.env.NEXT_PUBLIC_TIMESHEET_DEFAULT_PROJECT || "PLUSOS",
  tsVariables: process.env.NEXT_PUBLIC_TIMESHEET_VARIABLES || "tag=jira-(.+)\nproject=(PLUSOS|SMARTEYES|EXIM)",
  tsMeetingTag: "meeting",
  tsMeetingPattern: "[Meeting][Sprint] {title}",
  tsTaskPattern: "[Task][{tag}] {title}",
  tsUserMapping: "nickname=email@company.com",
  jiraDomain: "",
};

interface GlobalConfigContextType {
  config: GlobalConfig;
  updateConfig: (newConfig: Partial<GlobalConfig>) => Promise<void>;
  isLoading: boolean;
}

const GlobalConfigContext = React.createContext<GlobalConfigContextType | undefined>(undefined);

export const GlobalConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = React.useState<GlobalConfig>(DEFAULT_GLOBAL_CONFIG);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const loadConfig = async () => {
      try {
        const appDataKey = "globalConfig";
        const saved = await (miro.board as any).getAppData(appDataKey);
        if (saved) {
          setConfig(prev => ({ ...prev, ...(saved as object) }));
        } else {
          // Migration from legacy timesheetConfig
          const legacy = await (miro.board as any).getAppData("timesheetConfig");
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
            };
            setConfig(migrated);
            await (miro.board as any).setAppData(appDataKey, migrated);
          }
        }
      } catch (e) {
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
      await (miro.board as any).setAppData("globalConfig", updated);
      // Keep legacy for safety
      await (miro.board as any).setAppData("timesheetConfig", {
        project: updated.tsProject,
        defaultProject: updated.tsDefaultProject,
        variables: updated.tsVariables,
        userMapping: updated.tsUserMapping,
        meetingTag: updated.tsMeetingTag,
        meetingPattern: updated.tsMeetingPattern,
        taskPattern: updated.tsTaskPattern,
      });
    } catch (e) {
      console.error("Failed to save global config:", e);
    }
  };

  return (
    <GlobalConfigContext.Provider value={{ config, updateConfig, isLoading }}>
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
