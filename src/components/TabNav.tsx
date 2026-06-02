import * as React from "react";

export interface TabItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: boolean;
}

interface TabNavProps {
  tabs: TabItem[];
  activeTab: string;
  onTabChange: (id: string) => void;
}

export const TabNav: React.FC<TabNavProps> = ({ tabs, activeTab, onTabChange }) => {
  return (
    <nav className="tabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onTabChange(tab.id)}
          title={tab.label}
        >
          <div className="tab-icon-wrapper">
            {tab.icon}
            {tab.badge && <span className="tab-badge"></span>}
          </div>
          <span className="tab-text">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
};
