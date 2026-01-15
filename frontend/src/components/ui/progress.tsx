"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface ProgressProps {
  value: number;
  max?: number;
  label?: string;
  showValue?: boolean;
  className?: string;
}

export function Progress({ value, max = 100, label, showValue, className }: ProgressProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className={cn("space-y-1", className)}>
      {(label || showValue) && (
        <div className="flex justify-between text-2xs text-text-muted uppercase tracking-wider">
          {label && <span>{label}</span>}
          {showValue && <span>{value}/{max}</span>}
        </div>
      )}
      <div className="h-1 bg-border rounded-sm overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="h-full bg-primary"
        />
      </div>
    </div>
  );
}
