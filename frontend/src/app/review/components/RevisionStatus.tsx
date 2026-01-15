"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useRealtime } from "@/hooks/useRealtime";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const statusConfig = {
  pending: {
    label: "Pending Review",
    icon: "&#9201;", // Clock
    color: "text-status-warning",
    bg: "bg-status-warning/10",
    border: "border-status-warning/30",
  },
  in_review: {
    label: "In Review",
    icon: "&#9673;", // Eye
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/30",
  },
  approved: {
    label: "Approved",
    icon: "&#10003;", // Check
    color: "text-status-online",
    bg: "bg-status-online/10",
    border: "border-status-online/30",
  },
  rejected: {
    label: "Rejected",
    icon: "&#10007;", // X
    color: "text-status-error",
    bg: "bg-status-error/10",
    border: "border-status-error/30",
  },
};

export function RevisionStatus() {
  const { revision, updateState } = useRealtime();
  const config = statusConfig[revision.status];
  const [localComment, setLocalComment] = useState(revision.comment);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Sync local comment with remote changes
  useEffect(() => {
    setLocalComment(revision.comment);
  }, [revision.comment]);

  const handleStatusChange = (status: typeof revision.status) => {
    updateState({ status });
  };

  const handleRatingChange = (rating: number) => {
    updateState({ rating });
  };

  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const comment = e.target.value;
    setLocalComment(comment);

    // Debounce the update to avoid too many broadcasts
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      updateState({ comment });
    }, 500);
  };

  return (
    <div className="space-y-6">
      {/* Current Status */}
      <div className="flex items-center gap-4">
        <motion.div
          key={revision.status}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-sm border",
            config.bg,
            config.border
          )}
        >
          <span
            className={cn("text-lg", config.color)}
            dangerouslySetInnerHTML={{ __html: config.icon }}
          />
          <span className={cn("font-bold text-sm uppercase tracking-wider", config.color)}>
            {config.label}
          </span>
        </motion.div>

        {revision.lastUpdatedBy && (
          <span className="text-xs text-text-muted">
            Last updated by <strong className="text-primary">{revision.lastUpdatedBy}</strong>
          </span>
        )}
      </div>

      {/* Status Actions */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(statusConfig) as Array<keyof typeof statusConfig>).map(
          (status) => (
            <Button
              key={status}
              variant={revision.status === status ? "default" : "outline"}
              size="sm"
              onClick={() => handleStatusChange(status)}
              brackets={false}
            >
              {statusConfig[status].label}
            </Button>
          )
        )}
      </div>

      {/* Rating Slider */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span id="rating-label" className="text-2xs font-bold text-text-muted uppercase tracking-wider">
            Quality Rating
          </span>
          <motion.span
            key={revision.rating}
            initial={{ scale: 1.2 }}
            animate={{ scale: 1 }}
            className="text-2xl font-bold text-primary"
          >
            {revision.rating}/9
          </motion.span>
        </div>

        <div className="flex gap-1" role="group" aria-labelledby="rating-label">
          {[...Array(10)].map((_, i) => (
            <motion.button
              key={i}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleRatingChange(i)}
              aria-label={`Set rating to ${i}`}
              aria-pressed={i === revision.rating}
              className={cn(
                "flex-1 h-8 rounded-sm transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                i <= revision.rating
                  ? "bg-primary hover:bg-white"
                  : "bg-border hover:bg-primary/30"
              )}
            />
          ))}
        </div>

        <div className="flex justify-between text-2xs text-text-muted">
          <span>Poor</span>
          <span>Excellent</span>
        </div>
      </div>

      {/* Reviewer Comment */}
      <div className="space-y-2">
        <label
          htmlFor="reviewer-comment"
          className="text-2xs font-bold text-text-muted uppercase tracking-wider flex items-center gap-2"
        >
          <span>&#9670;</span>
          Reviewer Comment
        </label>
        <textarea
          id="reviewer-comment"
          value={localComment}
          onChange={handleCommentChange}
          placeholder="Add your review comments here..."
          className={cn(
            "w-full min-h-[80px] p-3 rounded-sm",
            "bg-background border border-border",
            "text-primary text-sm placeholder:text-text-muted",
            "focus:ring-1 focus:ring-primary focus:border-primary",
            "resize-y transition-shadow"
          )}
        />
        <p className="text-2xs text-text-muted">
          Comments are synced in real-time with all reviewers
        </p>
      </div>
    </div>
  );
}
