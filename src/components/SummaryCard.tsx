import * as React from "react";

interface SummaryCardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const SummaryCard: React.FC<SummaryCardProps> = ({ children, className = "", style }) => {
  return (
    <section className={`summary-card ${className}`} style={style}>
      {children}
    </section>
  );
};

interface SummaryItemProps {
  label: string;
  value: React.ReactNode;
  hint?: string;
  align?: "left" | "right";
  style?: React.CSSProperties;
}

export const SummaryItem: React.FC<SummaryItemProps> = ({ label, value, hint, align = "left", style }) => {
  return (
    <div className="summary-item" style={{ textAlign: align, ...style }}>
      <span className="label">{label}</span>
      <span className="value">{value}</span>
      {hint && <span className="hint-text">{hint}</span>}
    </div>
  );
};

export const SummaryRow: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => {
  return <div className="summary-row" style={style}>{children}</div>;
};

export const SummaryDivider: React.FC = () => {
  return <div className="summary-divider"></div>;
};
