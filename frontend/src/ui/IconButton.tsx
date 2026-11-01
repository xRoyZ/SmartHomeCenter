import type { ButtonHTMLAttributes, ReactElement } from "react";

import { cn } from "../lib/cn";

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  label: string;
  wide?: boolean;
}

export function IconButton({
  label,
  wide = false,
  type = "button",
  className,
  children,
  ...rest
}: IconButtonProps): ReactElement {
  return (
    <button
      {...rest}
      type={type}
      aria-label={label}
      className={cn("btn-secondary", "btn-square", wide && "wide", className)}
    >
      {children}
    </button>
  );
}
