import * as React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "icon" | "delete" | "tiny" | "copy" | "point" | "outline";
  loading?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = "primary",
  loading = false,
  icon,
  fullWidth = false,
  className = "",
  style,
  disabled,
  ...props
}) => {
  const variantClasses: Record<string, string> = {
    primary: "btn-primary",
    secondary: "btn-secondary",
    icon: "btn-icon-dark",
    delete: "btn-delete",
    tiny: "btn-tiny",
    copy: "btn-copy",
    point: "point-btn",
    outline: "btn-outline"
  };

  const combinedStyle: React.CSSProperties = {
    ...(fullWidth ? { width: "100%" } : {}),
    ...style,
  };

  return (
    <button
      className={`${variantClasses[variant] || "btn-primary"} ${loading ? "loading" : ""} ${className}`.trim()}
      style={combinedStyle}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="spinner"></span>
      ) : (
        <>
          {icon}
          {children}
        </>
      )}
    </button>
  );
};
