"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useOrganization } from "@/hooks/useOrganization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function OnboardingModal() {
  const { setCredentials } = useOrganization();
  const [orgId, setOrgId] = useState("");
  const [userId, setUserId] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (orgId.trim() && userId.trim()) {
      setCredentials(userId.trim(), orgId.trim());
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md"
      >
        <Card variant="ascii">
          <CardHeader>
            <CardTitle className="text-center text-lg">
              COLLABORATIVE_REVIEW_v1.0
            </CardTitle>
          </CardHeader>

          <CardContent>
            <div className="text-center mb-6">
              <p className="text-text-secondary text-sm">
                Enter your credentials to join your organization&apos;s review session
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-2xs font-bold text-primary uppercase tracking-wider flex items-center gap-2">
                  <span>&#9670;</span>
                  Organization ID
                </label>
                <Input
                  type="text"
                  value={orgId}
                  onChange={(e) => setOrgId(e.target.value)}
                  placeholder="e.g., acme-corp"
                  required
                />
                <p className="text-2xs text-text-muted">
                  Users with the same org ID will share the same state
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-2xs font-bold text-primary uppercase tracking-wider flex items-center gap-2">
                  <span>&#9670;</span>
                  User ID
                </label>
                <Input
                  type="text"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="e.g., john-doe"
                  required
                />
              </div>

              <Button type="submit" className="w-full">
                JOIN SESSION
              </Button>
            </form>


          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
