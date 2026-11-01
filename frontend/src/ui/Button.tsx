import type { ButtonHTMLAttributes, ReactElement } from "react";

import { cn } from "../lib/cn";

export type ButtonVariant = "primary" | "secondary";
export type ButtonSize = "md" | "sm";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  block = false,
  type = "button",
  className,
  children,
  ...rest
}: ButtonProps): ReactElement {
  return (
    <button
      {...rest}
      type={type}
      className={cn(
        variant === "primary" ? "btn-primary" : "btn-secondary",
        size === "sm" && "btn-sm",
        block && "btn-block",
        className,
      )}
    >
      {children}
    </button>
  );
}
