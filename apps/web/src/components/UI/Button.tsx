import React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
}

export const Button: React.FC<ButtonProps> = ({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}) => {
  const variantClass =
    variant === "primary"
      ? "v2-btn-primary"
      : variant === "secondary"
      ? "v2-btn-secondary"
      : variant === "outline"
      ? "v2-btn-outline"
      : variant === "danger"
      ? "v2-btn-danger"
      : "v2-btn-ghost";

  const sizeClass = size === "sm" ? "v2-btn-sm" : size === "lg" ? "v2-btn-lg" : "";

  return (
    <button
      className={`v2-btn ${variantClass} ${sizeClass} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
};
