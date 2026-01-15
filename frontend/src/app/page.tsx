"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center py-8"
      >
        <h1 className="text-4xl md:text-5xl font-bold text-primary tracking-tighter">
          INTERFACE_SYS<span className="terminal-cursor" />
        </h1>
        <p className="text-text-secondary mt-4 max-w-2xl mx-auto">
          A unified platform for collaborative document review, regulatory compliance analysis,
          and P&ID diagram processing.
        </p>
      </motion.div>

      {/* Task Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Task 1: Collaborative Review */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="h-full flex flex-col">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Collab_Review</CardTitle>
                <Badge variant="success" pulse>Active</Badge>
              </div>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="text-6xl text-primary mb-4">&#9672;</div>
              <p className="text-text-secondary text-sm">
                Real-time collaborative document revision with WebSocket synchronization.
                Organization-based access control with live presence indicators.
              </p>
              <ul className="mt-4 space-y-1 text-xs text-text-muted">
                <li>&#9656; Real-time state sync</li>
                <li>&#9656; Multi-user editing</li>
                <li>&#9656; Review history tracking</li>
                <li>&#9656; Org-based isolation</li>
              </ul>
            </CardContent>
            <CardFooter>
              <Link href="/review" className="w-full">
                <Button className="w-full">ENTER</Button>
              </Link>
            </CardFooter>
          </Card>
        </motion.div>

        {/* Task 2: Regulation Compliance */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="h-full flex flex-col opacity-60">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Reg_Compliance</CardTitle>
                <Badge variant="outline">Coming Soon</Badge>
              </div>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="text-6xl text-text-muted mb-4">&#9670;</div>
              <p className="text-text-secondary text-sm">
                Regulatory compliance document processor with LLM-powered clause extraction
                and semantic matching.
              </p>
              <ul className="mt-4 space-y-1 text-xs text-text-muted">
                <li>&#9656; PDF/DOCX parsing</li>
                <li>&#9656; Clause extraction</li>
                <li>&#9656; Semantic search</li>
                <li>&#9656; Compliance reports</li>
              </ul>
            </CardContent>
            <CardFooter>
              <Button className="w-full" variant="secondary" disabled>
                LOCKED
              </Button>
            </CardFooter>
          </Card>
        </motion.div>

        {/* Task 3: P&ID Analysis */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="h-full flex flex-col">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>PID_Analysis</CardTitle>
                <Badge variant="success" pulse>Active</Badge>
              </div>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="text-6xl text-primary mb-4">&#9671;</div>
              <p className="text-text-secondary text-sm">
                Computer vision powered P&ID diagram analysis with graph extraction
                and SOP cross-referencing.
              </p>
              <ul className="mt-4 space-y-1 text-xs text-text-muted">
                <li>&#9656; YOLO component detection</li>
                <li>&#9656; Graph extraction</li>
                <li>&#9656; SOP matching</li>
                <li>&#9656; Discrepancy reports</li>
              </ul>
            </CardContent>
            <CardFooter>
              <Link href="/pid-analysis" className="w-full">
                <Button className="w-full">ENTER</Button>
              </Link>
            </CardFooter>
          </Card>
        </motion.div>
      </div>

      {/* Quick Start */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Card variant="ascii">
          <CardHeader>
            <CardTitle>Quick Start</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-sm space-y-2 text-text-secondary">
              <div>
                <span className="text-primary">$</span> Navigate to{" "}
                <span className="text-primary">Collab_Review</span> to start
              </div>
              <div>
                <span className="text-primary">$</span> Enter your{" "}
                <span className="text-primary">orgId</span> and{" "}
                <span className="text-primary">userId</span>
              </div>
              <div>
                <span className="text-primary">$</span> Open multiple browser tabs with same orgId
              </div>
              <div>
                <span className="text-primary">$</span> Watch changes sync in{" "}
                <span className="text-primary">real-time</span>!
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
