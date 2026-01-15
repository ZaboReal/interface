"use client";

import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { RevisionHistory as HistoryType } from "@/stores/revisionStore";
import { cn } from "@/lib/utils";

interface Props {
  history: HistoryType[];
}

function getActionIcon(newValue?: unknown): string {
  if (typeof newValue === "object" && newValue !== null) {
    const val = newValue as Record<string, unknown>;
    if ("status" in val) {
      if (val.status === "approved") return "&#10003;";
      if (val.status === "rejected") return "&#10007;";
      if (val.status === "in_review") return "&#9673;";
      return "&#9201;";
    }
    if ("rating" in val) return "&#9733;";
    if ("comment" in val) return "&#9998;"; // Pencil for comments
  }
  return "&#9998;";
}

function formatChangeDescription(entry: HistoryType): string {
  if (!entry.newValue || typeof entry.newValue !== "object") {
    return "Made changes";
  }

  const changes = entry.newValue as Record<string, unknown>;
  const descriptions: string[] = [];

  if ("status" in changes) {
    descriptions.push(`Changed status to "${changes.status}"`);
  }
  if ("rating" in changes) {
    descriptions.push(`Set rating to ${changes.rating}/9`);
  }
  if ("comment" in changes) {
    const comment = changes.comment as string;
    if (comment) {
      descriptions.push(`Added comment: "${comment.slice(0, 50)}${comment.length > 50 ? "..." : ""}"`);
    } else {
      descriptions.push("Cleared comment");
    }
  }
  if ("content" in changes) {
    descriptions.push("Updated document content");
  }

  return descriptions.join(", ") || "Made changes";
}

export function ReviewHistory({ history }: Props) {
  if (history.length === 0) {
    return (
      <div className="text-center py-8 text-text-muted">
        <span className="text-3xl opacity-50">&#9998;</span>
        <p className="mt-2 text-sm">No changes yet</p>
        <p className="text-2xs">Updates will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <AnimatePresence initial={false}>
        {history.map((entry, index) => {
          const icon = getActionIcon(entry.newValue);

          return (
            <motion.div
              key={`${entry.timestamp}-${index}`}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
              className={cn(
                "flex gap-3 p-3 rounded-sm",
                index === 0
                  ? "bg-primary/10 border border-primary/20"
                  : "bg-background-card/50 border border-border/50"
              )}
            >
              <div
                className={cn(
                  "flex-shrink-0 w-8 h-8 rounded-sm flex items-center justify-center text-lg",
                  index === 0 ? "bg-primary text-background" : "bg-border text-primary"
                )}
                dangerouslySetInnerHTML={{ __html: icon }}
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-2xs text-text-muted">&#9670;</span>
                  <span className="font-bold text-xs uppercase tracking-wider text-primary truncate">
                    {entry.userId}
                  </span>
                </div>

                <p className="text-xs text-text-secondary mt-0.5">
                  {formatChangeDescription(entry)}
                </p>

                <p className="text-2xs text-text-muted mt-1">
                  {formatDistanceToNow(new Date(entry.timestamp), {
                    addSuffix: true,
                  })}
                </p>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
