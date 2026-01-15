"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 px-2 py-0.5 text-2xs font-bold uppercase tracking-[0.1em]",
  {
    variants: {
      variant: {
        default: "bg-border text-primary",
        success: "bg-status-success/20 text-status-success",
        warning: "bg-status-warning/20 text-status-warning",
        error: "bg-status-error/20 text-status-error",
        destructive: "bg-status-error/20 text-status-error",
        outline: "border border-primary/30 text-primary",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  pulse?: boolean;
}

export function Badge({ className, variant, pulse, children, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props}>
      {pulse && (
        <span className={cn(
          "w-1.5 h-1.5 rounded-full",
          variant === "success" && "bg-status-online animate-pulse",
          variant === "warning" && "bg-status-warning animate-pulse",
          variant === "error" && "bg-status-error animate-pulse",
          !variant && "bg-primary animate-pulse"
        )} />
      )}
      {children}
    </div>
  );
}
