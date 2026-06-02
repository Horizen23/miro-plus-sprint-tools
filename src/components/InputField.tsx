import * as React from "react";

interface InputFieldProps extends React.InputHTMLAttributes<HTMLInputElement | HTMLTextAreaElement> {
  label?: string;
  isTextArea?: boolean;
  hint?: string;
  loading?: boolean;
}

export const InputField: React.FC<InputFieldProps> = ({
  label,
  isTextArea = false,
  hint,
  loading = false,
  className = "",
  style,
  ...props
}) => {
  const commonProps = {
    className: `form-input ${className}`,
    style,
    ...props,
    value: props.value ?? "",
  };

  const inputId = props.id || (label ? `input-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);

  return (
    <div className="field-row">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        {label && <label htmlFor={inputId} style={{ marginBottom: 0 }}>{label}</label>}
        {loading && <div className="spinner tiny"></div>}
      </div>
      {isTextArea ? (
        <textarea id={inputId} {...(commonProps as React.TextareaHTMLAttributes<HTMLTextAreaElement>)} />
      ) : (
        <input id={inputId} {...(commonProps as React.InputHTMLAttributes<HTMLInputElement>)} />
      )}
      {hint && <p className="hint" style={{ marginTop: '4px' }}>{hint}</p>}
    </div>
  );
};
