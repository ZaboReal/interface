"use client";

import { useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { useRealtime } from "@/hooks/useRealtime";
import { useOrganization } from "@/hooks/useOrganization";
import { cn } from "@/lib/utils";

export function CollaborativeEditor() {
  const { userId } = useOrganization();
  const { revision, cursors, updateContent, updateCursor } = useRealtime();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cursorTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const content = e.target.value;
      const cursorPosition = e.target.selectionStart;
      updateContent(content, cursorPosition);
    },
    [updateContent]
  );

  const handleSelect = useCallback(() => {
    if (textareaRef.current) {
      const position = textareaRef.current.selectionStart;

      // Debounce cursor updates
      if (cursorTimeoutRef.current) {
        clearTimeout(cursorTimeoutRef.current);
      }
      cursorTimeoutRef.current = setTimeout(() => {
        updateCursor(position);
      }, 50);
    }
  }, [updateCursor]);

  // Render remote cursors
  const remoteCursors = Array.from(cursors.values()).filter(
    (c) => c.userId !== userId
  );

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={revision.content}
        onChange={handleChange}
        onSelect={handleSelect}
        onKeyUp={handleSelect}
        onClick={handleSelect}
        placeholder="Start typing to collaborate in real-time..."
        aria-label="Collaborative document editor"
        className={cn(
          "w-full min-h-[200px] p-4 rounded-sm",
          "bg-background border border-border",
          "text-primary placeholder:text-text-muted placeholder:text-sm",
          "focus:ring-1 focus:ring-primary focus:border-primary",
          "resize-y transition-shadow",
          "font-mono text-sm leading-relaxed"
        )}
      />

      {/* Remote Cursor Indicators */}
      {remoteCursors.length > 0 && (
        <div className="flex gap-2 mt-3">
          {remoteCursors.map((cursor) => (
            <motion.div
              key={cursor.userId}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-1.5 text-2xs px-2 py-1 rounded-sm"
              style={{
                backgroundColor: cursor.color + "20",
                color: cursor.color,
                borderLeft: `2px solid ${cursor.color}`
              }}
            >
              <span
                className="w-2 h-2 rounded-full animate-pulse"
                style={{ backgroundColor: cursor.color }}
              />
              <span className="font-bold uppercase tracking-wider">
                {cursor.userId}
              </span>
              <span className="opacity-60">@ pos {cursor.position}</span>
            </motion.div>
          ))}
        </div>
      )}

      {/* Character count */}
      <div className="flex justify-between mt-2 text-2xs text-text-muted">
        <span>{revision.content.length} characters</span>
        <span className="text-primary">&#9656; Real-time sync enabled</span>
      </div>
    </div>
  );
}
