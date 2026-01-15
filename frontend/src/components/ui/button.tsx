"use client";

import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center font-bold uppercase tracking-[0.1em] transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-background hover:bg-white",
        outline: "border border-primary text-primary hover:bg-primary/10",
        ghost: "text-primary hover:bg-primary/10",
        secondary: "bg-border text-primary hover:bg-border/80",
        destructive: "bg-status-error text-white hover:bg-status-error/80",
      },
      size: {
        sm: "h-8 px-3 text-2xs",
        default: "h-10 px-4 text-xs",
        lg: "h-12 px-6 text-sm",
        icon: "h-8 w-8 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  brackets?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, brackets = true, children, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      >
        {brackets ? `[ ${children} ]` : children}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
