"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const API_BASE = `${process.env.NEXT_PUBLIC_API_URL}/api/regulation`;

interface SearchResult {
  clause_id: string;
  text: string;
  source: string;
  similarity: number;
}

export function SemanticSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;

    setLoading(true);
    setHasSearched(true);

    try {
      const res = await fetch(`${API_BASE}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: query, limit: 10 }),
      });
      const data = await res.json();
      setResults(data);
    } catch (error) {
      console.error("Search failed:", error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  return (
    <div className="space-y-6">
      {/* Search Input */}
      <Card>
        <CardHeader>
          <CardTitle>&#128269; SEMANTIC_SEARCH</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Input
              placeholder="Search regulatory clauses..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              className="flex-1"
            />
            <Button onClick={handleSearch} disabled={loading || !query.trim()}>
              {loading ? "SEARCHING..." : "SEARCH"}
            </Button>
          </div>
          <p className="text-2xs text-text-muted mt-2">
            Search uses semantic similarity to find relevant clauses even with different wording
          </p>
        </CardContent>
      </Card>

      {/* Results */}
      {loading ? (
        <Card>
          <CardContent className="py-8 text-center">
            <motion.span
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="text-text-muted"
            >
              SEARCHING...
            </motion.span>
          </CardContent>
        </Card>
      ) : hasSearched ? (
        results.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>
                RESULTS ({results.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 divide-y divide-border max-h-[500px] overflow-y-auto">
              {results.map((result, index) => (
                <motion.div
                  key={result.clause_id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="p-4 hover:bg-primary/5 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-2xs">
                        {result.clause_id}
                      </Badge>
                      <Badge variant="outline" className="text-2xs">
                        {result.source}
                      </Badge>
                    </div>
                    <SimilarityBadge similarity={result.similarity} />
                  </div>
                  <p className="text-sm text-text-secondary">{result.text}</p>
                </motion.div>
              ))}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-text-muted">
              No results found. Try a different search query.
            </CardContent>
          </Card>
        )
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-text-muted">
            <div className="mb-4 text-4xl">&#128269;</div>
            <p>Enter a search query to find relevant regulatory clauses</p>
            <div className="mt-4 space-y-2 text-2xs">
              <p className="text-primary">Example searches:</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {[
                  "safety equipment requirements",
                  "inspection procedures",
                  "documentation standards",
                  "training requirements",
                  "emergency response",
                ].map((example) => (
                  <button
                    key={example}
                    onClick={() => {
                      setQuery(example);
                    }}
                    className="px-2 py-1 bg-border rounded-sm hover:bg-primary/20 transition-colors"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SimilarityBadge({ similarity }: { similarity: number }) {
  const percentage = Math.round(similarity * 100);

  return (
    <span
      className={cn(
        "text-2xs px-2 py-0.5 rounded-sm font-medium",
        percentage >= 80
          ? "bg-status-success/20 text-status-success"
          : percentage >= 60
          ? "bg-status-warning/20 text-status-warning"
          : "bg-border text-text-secondary"
      )}
    >
      {percentage}% match
    </span>
  );
}
