"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useOrganization } from "@/hooks/useOrganization";
import { useRealtime } from "@/hooks/useRealtime";
import { RevisionStatus } from "./components/RevisionStatus";
import { ReviewHistory } from "./components/ReviewHistory";
import { CollaborativeEditor } from "./components/CollaborativeEditor";
import { PresenceIndicator } from "./components/PresenceIndicator";
import { OnboardingModal } from "./components/OnboardingModal";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export default function ReviewPage() {
  const { userId, isAuthenticated, clearCredentials } = useOrganization();
  const { isConnected, history, activeUsers } = useRealtime();

  if (!isAuthenticated) {
    return <OnboardingModal />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-primary uppercase tracking-tight">
            Collaborative Review<span className="terminal-cursor" />
          </h1>
          <p className="text-text-muted text-sm">
            Real-time document revision status for your organization
          </p>
        </div>

        <div className="flex items-center gap-4">
          <PresenceIndicator users={activeUsers} currentUser={userId!} />

          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            {isConnected ? (
              <Badge variant="success" pulse>
                Connected
              </Badge>
            ) : (
              <Badge variant="error" pulse>
                Disconnected
              </Badge>
            )}
          </motion.div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => clearCredentials()}
            className="text-text-muted hover:text-primary gap-2"
          >
            <LogOut className="h-4 w-4" />
            <span className="sr-only lg:not-sr-only">Logout</span>
          </Button>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Status & Editor */}
        <div className="lg:col-span-2 space-y-6">
          <AnimatePresence mode="wait">
            <motion.div
              key="status"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle>Revision Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <RevisionStatus />
                </CardContent>
              </Card>
            </motion.div>
          </AnimatePresence>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <Card>
              <CardHeader>
                <CardTitle>Document Content</CardTitle>
              </CardHeader>
              <CardContent>
                <CollaborativeEditor />
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Right Column - History */}
        <motion.div
          initial={{ x: 20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <Card className="h-fit max-h-[calc(100vh-200px)] flex flex-col">
            <CardHeader>
              <CardTitle>Review History</CardTitle>
            </CardHeader>
            <CardContent className="overflow-y-auto flex-1">
              <ReviewHistory history={history} />
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
