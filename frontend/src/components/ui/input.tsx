"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, icon, ...props }, ref) => {
    return (
      <div className="relative flex items-center">
        {icon && (
          <div className="absolute left-3 text-text-muted">
            {icon}
          </div>
        )}
        <input
          className={cn(
            "w-full bg-background-card border border-border rounded-sm",
            "px-3 py-2 text-sm text-primary",
            "placeholder:text-text-muted placeholder:uppercase placeholder:tracking-wider placeholder:text-xs",
            "focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30",
            "transition-colors",
            icon && "pl-10",
            className
          )}
          ref={ref}
          {...props}
        />
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
