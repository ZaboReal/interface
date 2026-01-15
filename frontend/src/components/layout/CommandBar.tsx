"use client";

import { useState } from "react";

export function CommandBar() {
  const [command, setCommand] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Handle command execution
    console.log("Execute:", command);
    setCommand("");
  };

  return (
    <footer className="h-10 border-t border-primary bg-background/95 px-4 flex items-center z-50">
      <form onSubmit={handleSubmit} className="flex items-center gap-2 w-full">
        <span className="text-primary font-bold text-lg">&gt;_</span>
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="Type a command..."
          className="flex-1 bg-transparent border-none text-primary placeholder:text-text-muted/50 focus:outline-none text-sm font-mono uppercase tracking-wider"
        />
        <div className="flex gap-4 text-2xs font-bold text-text-muted whitespace-nowrap">
          <span>[ENTER] RUN</span>
          <span className="text-primary animate-pulse">|</span>
        </div>
      </form>
    </footer>
  );
}
