import type { ReactElement, ReactNode } from "react";

import { cn } from "../lib/cn";

export type ToastTone = "info" | "error";

export interface ToastProps {
  message: ReactNode;
  visible?: boolean;
  tone?: ToastTone;
  className?: string;
}

export function Toast({
  message,
  visible = true,
  tone = "info",
  className,
}: ToastProps): ReactElement {
  return (
    <div
      className={cn("toast", visible && "show", tone === "error" && "error", className)}
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      aria-hidden={visible ? undefined : true}
    >
      {message}
    </div>
  );
}
