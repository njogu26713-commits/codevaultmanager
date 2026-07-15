import * as React from "react";
import { Play, Square, Trash2, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Line {
  kind: "info" | "stdout" | "stderr" | "exit";
  text: string;
}

interface TerminalPanelProps {
  workspaceId: string;
}

export function TerminalPanel({ workspaceId }: TerminalPanelProps) {
  const [lines, setLines] = React.useState<Line[]>([]);
  const [running, setRunning] = React.useState(false);
  const [exitCode, setExitCode] = React.useState<number | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new output
  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  const appendLine = (kind: Line["kind"], text: string) => {
    // Split multi-line chunks into individual lines for display
    const parts = text.split(/\r?\n/);
    setLines((prev) => {
      const next = [...prev];
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        // Merge with last line if it's the same kind and didn't end with newline
        if (
          i === 0 &&
          next.length > 0 &&
          next[next.length - 1].kind === kind &&
          !next[next.length - 1].text.endsWith("\n") &&
          text.startsWith(parts[0])
        ) {
          next[next.length - 1] = { kind, text: next[next.length - 1].text + part };
        } else if (part !== "" || i < parts.length - 1) {
          next.push({ kind, text: part });
        }
      }
      return next;
    });
  };

  const handleRun = async () => {
    // Cancel any existing stream
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLines([]);
    setExitCode(null);
    setRunning(true);

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/run`, {
        method: "POST",
        credentials: "include",
        signal: ac.signal,
      });

      if (!res.ok || !res.body) {
        appendLine("stderr", `HTTP ${res.status}\n`);
        setRunning(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          let evt: any;
          try { evt = JSON.parse(line.slice(5).trim()); } catch { continue; }

          if (evt.type === "start") {
            appendLine("info", `$ ${evt.cmd}\n`);
          } else if (evt.type === "stdout") {
            appendLine("stdout", evt.text);
          } else if (evt.type === "stderr") {
            appendLine("stderr", evt.text);
          } else if (evt.type === "exit") {
            setExitCode(evt.code);
            setRunning(false);
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        appendLine("stderr", `Connection error: ${err.message}\n`);
        setRunning(false);
      }
    }
  };

  const handleStop = async () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
    appendLine("info", "^C\n");
    await fetch(`/api/workspaces/${workspaceId}/run`, {
      method: "DELETE",
      credentials: "include",
    }).catch(() => {});
  };

  const handleClear = () => {
    setLines([]);
    setExitCode(null);
  };

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d] text-[13px] font-mono">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 bg-[#161616] shrink-0">
        <Terminal className="w-3.5 h-3.5 text-white/40 shrink-0" />
        <span className="text-white/40 text-xs flex-1">Output</span>

        {exitCode !== null && (
          <span
            className={cn(
              "text-[10px] px-1.5 py-0.5 rounded font-mono",
              exitCode === 0
                ? "bg-green-500/20 text-green-400"
                : "bg-red-500/20 text-red-400",
            )}
          >
            exit {exitCode}
          </span>
        )}

        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-white/40 hover:text-white hover:bg-white/10"
          onClick={handleClear}
          title="Clear"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>

        {running ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 gap-1 text-red-400 hover:text-red-300 hover:bg-red-500/10 text-xs"
            onClick={handleStop}
          >
            <Square className="w-3 h-3 fill-current" />
            Stop
          </Button>
        ) : (
          <Button
            size="sm"
            className="h-6 px-2 gap-1 bg-green-600 hover:bg-green-500 text-white text-xs"
            onClick={handleRun}
          >
            <Play className="w-3 h-3 fill-current" />
            Run
          </Button>
        )}
      </div>

      {/* Output area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-0 leading-5">
        {lines.length === 0 && !running && (
          <div className="text-white/20 text-xs mt-4 text-center">
            Press Run to execute your project
          </div>
        )}

        {lines.map((line, i) => (
          <div
            key={i}
            className={cn(
              "whitespace-pre-wrap break-all",
              line.kind === "stdout" && "text-white/90",
              line.kind === "stderr" && "text-red-400",
              line.kind === "info"   && "text-green-400",
              line.kind === "exit"   && "text-white/30",
            )}
          >
            {line.text}
          </div>
        ))}

        {running && (
          <div className="flex items-center gap-1.5 text-white/30 text-xs mt-1">
            <span className="inline-block w-1.5 h-3 bg-white/50 animate-pulse" />
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
