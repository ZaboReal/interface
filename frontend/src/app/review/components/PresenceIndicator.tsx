"use client";

import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface Props {
  users: string[];
  currentUser: string;
}

const avatarColors = [
  "bg-blue-500",
  "bg-green-500",
  "bg-purple-500",
  "bg-amber-500",
  "bg-pink-500",
  "bg-cyan-500",
];

function getInitials(userId: string): string {
  return userId.slice(0, 2).toUpperCase();
}

function getAvatarColor(userId: string): string {
  const index =
    userId.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) %
    avatarColors.length;
  return avatarColors[index];
}

export function PresenceIndicator({ users, currentUser }: Props) {
  const otherUsers = users.filter((u) => u !== currentUser);
  const displayUsers = otherUsers.slice(0, 3);
  const remainingCount = otherUsers.length - 3;

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5 text-2xs text-text-muted uppercase tracking-wider">
        <span className="text-primary">&#9673;</span>
        <span>{users.length} online</span>
      </div>

      <div className="flex -space-x-2">
        {/* Current user */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className={cn(
            "relative z-10 w-8 h-8 rounded-sm flex items-center justify-center",
            "text-white text-2xs font-bold ring-2 ring-background",
            getAvatarColor(currentUser)
          )}
          title={`${currentUser} (you)`}
        >
          {getInitials(currentUser)}
          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-status-online border-2 border-background rounded-full animate-pulse" />
        </motion.div>

        {/* Other users */}
        <AnimatePresence>
          {displayUsers.map((userId, i) => (
            <motion.div
              key={userId}
              initial={{ scale: 0, x: -10 }}
              animate={{ scale: 1, x: 0 }}
              exit={{ scale: 0, x: -10 }}
              transition={{ delay: i * 0.05 }}
              className={cn(
                "w-8 h-8 rounded-sm flex items-center justify-center",
                "text-white text-2xs font-bold ring-2 ring-background",
                getAvatarColor(userId)
              )}
              style={{ zIndex: 5 - i }}
              title={userId}
            >
              {getInitials(userId)}
            </motion.div>
          ))}

          {remainingCount > 0 && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="w-8 h-8 rounded-sm flex items-center justify-center bg-border text-primary text-2xs font-bold ring-2 ring-background"
            >
              +{remainingCount}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
