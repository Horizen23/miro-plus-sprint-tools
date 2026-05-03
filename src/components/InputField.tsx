import * as React from "react";

interface InputFieldProps extends React.InputHTMLAttributes<HTMLInputElement | HTMLTextAreaElement> {
  label?: string;
  isTextArea?: boolean;
}

export const InputField: React.FC<InputFieldProps> = ({
  label,
  isTextArea = false,
  className = "",
  style,
  ...props
}) => {
  const commonProps = {
    className: `form-input ${className}`,
    style,
    ...props
  };

  return (
    <div className="field-row">
      {label && <label>{label}</label>}
      {isTextArea ? (
        <textarea {...(commonProps as React.TextareaHTMLAttributes<HTMLTextAreaElement>)} />
      ) : (
        <input {...(commonProps as React.InputHTMLAttributes<HTMLInputElement>)} />
      )}
    </div>
  );
};
