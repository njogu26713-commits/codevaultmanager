import * as React from "react";
import { Play, Square, Trash2, Terminal, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Line {
  kind: "info" | "stdout" | "stderr" | "exit";
  text: string;
}

type Mode = "idle" | "installing" | "running";

interface TerminalPanelProps {
  workspaceId: string;
}

export function TerminalPanel({ workspaceId }: TerminalPanelProps) {
  const [lines, setLines] = React.useState<Line[]>([]);
  const [mode, setMode] = React.useState<Mode>("idle");
  const [exitCode, setExitCode] = React.useState<number | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  const append = (kind: Line["kind"], text: string) => {
    setLines((prev) => [...prev, { kind, text }]);
  };

  const stop = async () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMode("idle");
    append("info", "^C\n");
    await fetch(`/api/workspaces/${workspaceId}/run`, {
      method: "DELETE",
      credentials: "include",
    }).catch(() => {});
  };

  const streamEndpoint = async (endpoint: string, activeMode: Mode) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLines([]);
    setExitCode(null);
    setMode(activeMode);

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/${endpoint}`, {
        method: "POST",
        credentials: "include",
        signal: ac.signal,
      });

      if (!res.ok || !res.body) {
        append("stderr", `HTTP ${res.status}\n`);
        setMode("idle");
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
            append("info", `$ ${evt.cmd}\n`);
          } else if (evt.type === "stdout") {
            append("stdout", evt.text);
          } else if (evt.type === "stderr") {
            append("stderr", evt.text);
          } else if (evt.type === "exit") {
            setExitCode(evt.code);
            setMode("idle");
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        append("stderr", `Connection error: ${err.message}\n`);
        setMode("idle");
      }
    }
  };

  const busy = mode !== "idle";

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d] text-[13px] font-mono">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 bg-[#161616] shrink-0">
        <Terminal className="w-3.5 h-3.5 text-white/40 shrink-0" />
        <span className="text-white/40 text-xs flex-1">
          {mode === "installing" ? "Installing…" : mode === "running" ? "Running…" : "Output"}
        </span>

        {exitCode !== null && (
          <span className={cn(
            "text-[10px] px-1.5 py-0.5 rounded font-mono",
            exitCode === 0 ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400",
          )}>
            exit {exitCode}
          </span>
        )}

        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-white/40 hover:text-white hover:bg-white/10"
          onClick={() => { setLines([]); setExitCode(null); }}
          title="Clear"
          disabled={busy}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>

        {busy ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 gap-1 text-red-400 hover:text-red-300 hover:bg-red-500/10 text-xs"
            onClick={stop}
          >
            <Square className="w-3 h-3 fill-current" />
            Stop
          </Button>
        ) : (
          <>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 gap-1 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 text-xs"
              onClick={() => streamEndpoint("install", "installing")}
              title="Install dependencies"
            >
              <Package className="w-3 h-3" />
              Install
            </Button>

            <Button
              size="sm"
              className="h-6 px-2 gap-1 bg-green-600 hover:bg-green-500 text-white text-xs"
              onClick={() => streamEndpoint("run", "running")}
            >
              <Play className="w-3 h-3 fill-current" />
              Run
            </Button>
          </>
        )}
      </div>

      {/* Output */}
      <div className="flex-1 overflow-y-auto p-3 leading-5">
        {lines.length === 0 && !busy && (
          <div className="text-white/20 text-xs mt-4 text-center space-y-1">
            <div>Press <span className="text-blue-400/60">Install</span> to install dependencies</div>
            <div>Press <span className="text-green-400/60">Run</span> to execute your project</div>
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

        {busy && (
          <span className="inline-block w-1.5 h-3.5 bg-white/50 animate-pulse align-middle" />
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
