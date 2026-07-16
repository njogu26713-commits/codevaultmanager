import * as React from "react";
import { useListMessages } from "@/lib/api";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Send, Bot, Code2, Brain, Wrench, Zap, CheckCircle2, Loader2,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListMessagesQueryKey,
  getGetDiffQueryKey,
  getGetWorkspaceStatsQueryKey,
  getListFilesQueryKey,
} from "@/lib/api";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type PhaseName = "preparing" | "thinking" | "working" | "finalizing";

interface PhaseState {
  name: PhaseName;
  steps: string[];
  thinking: string; // live-streamed AI reasoning (only for "thinking" phase)
  done: boolean;
}

interface ChatPanelProps {
  workspaceId: string;
}

// ---------------------------------------------------------------------------
// Phase config
// ---------------------------------------------------------------------------
const PHASE_CONFIG: Record<PhaseName, { label: string; Icon: React.ElementType; color: string }> = {
  preparing:  { label: "Preparing",  Icon: Zap,    color: "text-yellow-500" },
  thinking:   { label: "Thinking",   Icon: Brain,  color: "text-purple-500" },
  working:    { label: "Working",    Icon: Wrench, color: "text-blue-500"   },
  finalizing: { label: "Finalizing", Icon: CheckCircle2, color: "text-green-500" },
};

// ---------------------------------------------------------------------------
// PhaseBlock — renders one phase card
// ---------------------------------------------------------------------------
function PhaseBlock({ phase, isActive }: { phase: PhaseState; isActive: boolean }) {
  const cfg = PHASE_CONFIG[phase.name];
  const Icon = cfg.Icon;

  return (
    <div
      className={cn(
        "rounded-xl border bg-card shadow-sm overflow-hidden transition-all",
        isActive ? "border-primary/30" : "border-border/50 opacity-70",
      )}
    >
      {/* Phase header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
        {isActive && !phase.done ? (
          <Loader2 className={cn("w-3.5 h-3.5 animate-spin shrink-0", cfg.color)} />
        ) : (
          <Icon className={cn("w-3.5 h-3.5 shrink-0", phase.done ? "text-green-500" : cfg.color)} />
        )}
        <span className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
          {cfg.label}
        </span>
      </div>

      <div className="px-3 py-2 space-y-1.5">
        {/* Streamed thinking text */}
        {phase.name === "thinking" && phase.thinking && (
          <p className="text-xs text-foreground/80 leading-relaxed italic">
            {phase.thinking}
            {isActive && !phase.done && (
              <span className="inline-block w-1 h-3.5 ml-0.5 bg-primary align-middle animate-pulse rounded-sm" />
            )}
          </p>
        )}

        {/* Steps */}
        {phase.steps.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
            <span className="w-1 h-1 rounded-full bg-muted-foreground/50 shrink-0" />
            {s}
          </div>
        ))}

        {/* Spinner placeholder while active phase has no content yet */}
        {isActive && !phase.done && phase.steps.length === 0 && !phase.thinking && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Starting…</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function ChatPanel({ workspaceId }: ChatPanelProps) {
  const queryClient = useQueryClient();
  const [content, setContent] = React.useState("");
  const [isPending, setIsPending] = React.useState(false);
  const [phases, setPhases] = React.useState<PhaseState[]>([]);
  const [activePhase, setActivePhase] = React.useState<PhaseName | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const { data: messages } = useListMessages(workspaceId, {
    query: { enabled: !!workspaceId, queryKey: getListMessagesQueryKey(workspaceId) },
  });

  // Auto-scroll
  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, phases, isPending]);

  const handleSend = async () => {
    if (!content.trim() || isPending) return;
    const prompt = content.trim();
    setContent("");
    setIsPending(true);
    setPhases([]);
    setActivePhase(null);

    // Optimistic user message
    const tempId = crypto.randomUUID();
    queryClient.setQueryData(getListMessagesQueryKey(workspaceId), (old: any[] = []) => [
      ...old,
      {
        id: tempId,
        workspaceId,
        role: "user",
        content: prompt,
        fileChanges: null,
        createdAt: new Date().toISOString(),
        _optimistic: true,
      },
    ]);

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content: prompt }),
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          let event: any;
          try { event = JSON.parse(line.slice(5).trim()); } catch { continue; }

          if (event.type === "phase") {
            const name = event.name as PhaseName;
            setActivePhase(name);
            setPhases((prev) => [
              // mark previous phase done
              ...prev.map((p) => ({ ...p, done: true })),
              { name, steps: [], thinking: "", done: false },
            ]);

          } else if (event.type === "thinking_chunk") {
            setPhases((prev) => {
              if (prev.length === 0) return prev;
              const last = { ...prev[prev.length - 1] };
              last.thinking += event.text;
              return [...prev.slice(0, -1), last];
            });

          } else if (event.type === "step") {
            setPhases((prev) => {
              if (prev.length === 0) return prev;
              const last = { ...prev[prev.length - 1] };
              last.steps = [...last.steps, event.text];
              return [...prev.slice(0, -1), last];
            });

          } else if (event.type === "user_message") {
            queryClient.setQueryData(getListMessagesQueryKey(workspaceId), (old: any[] = []) =>
              old.map((m) => (m.id === tempId ? event.message : m))
            );

          } else if (event.type === "done") {
            // Mark all phases done
            setPhases((prev) => prev.map((p) => ({ ...p, done: true })));
            setActivePhase(null);

            if (event.message) {
              queryClient.setQueryData(getListMessagesQueryKey(workspaceId), (old: any[] = []) => [
                ...old.filter((m) => m.id !== tempId),
                event.message,
              ]);
            }
            queryClient.invalidateQueries({ queryKey: getListFilesQueryKey(workspaceId) });
            queryClient.invalidateQueries({ queryKey: getGetDiffQueryKey(workspaceId) });
            queryClient.invalidateQueries({ queryKey: getGetWorkspaceStatsQueryKey(workspaceId) });
          }
        }
      }
    } catch (err) {
      console.error("SSE error", err);
      queryClient.setQueryData(getListMessagesQueryKey(workspaceId), (old: any[] = []) =>
        old.filter((m) => m.id !== tempId)
      );
    } finally {
      setIsPending(false);
      // Keep phases visible briefly then clear
      setTimeout(() => setPhases([]), 3500);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-muted/10">
      {/* Header */}
      <div className="px-4 py-3 border-b bg-card text-sm font-semibold flex items-center gap-2">
        <Bot className="w-4 h-4 text-primary" />
        AI Engineer
      </div>

      <ScrollArea className="flex-1 p-4" viewportRef={scrollRef}>
        <div className="space-y-6 pb-4">

          {/* Empty state */}
          {messages?.length === 0 && !isPending && (
            <div className="text-center mt-10 space-y-3">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto text-primary">
                <Bot className="w-6 h-6" />
              </div>
              <p className="text-sm text-muted-foreground">
                I'm ready to write code. Describe what you want to build or change.
              </p>
            </div>
          )}

          {/* Messages */}
          {messages?.map((msg: any) => (
            <div
              key={msg.id}
              className={cn("flex flex-col gap-2", msg.role === "user" ? "items-end" : "items-start")}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                    : "bg-card border rounded-tl-sm shadow-sm",
                )}
              >
                {msg.content}
              </div>

              {msg.fileChanges && msg.fileChanges.length > 0 && (
                <div className="w-full max-w-[85%] mt-1">
                  <div className="text-xs font-mono text-muted-foreground mb-1.5 flex items-center gap-1">
                    <Code2 className="w-3.5 h-3.5" />
                    Generated Changes:
                  </div>
                  <div className="bg-card border rounded-md overflow-hidden divide-y divide-border">
                    {msg.fileChanges.map((change: any, idx: number) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between px-3 py-1.5 text-xs font-mono"
                      >
                        <span className="truncate pr-4">{change.path}</span>
                        <span
                          className={cn(
                            "px-1.5 py-0.5 rounded capitalize",
                            change.action === "create"
                              ? "text-green-500 bg-green-500/10"
                              : change.action === "modify"
                              ? "text-blue-500 bg-blue-500/10"
                              : "text-red-500 bg-red-500/10",
                          )}
                        >
                          {change.action}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Live phase cards while AI is working */}
          {isPending && phases.length > 0 && (
            <div className="flex flex-col items-start gap-2 w-full max-w-[90%]">
              {phases.map((phase, i) => (
                <PhaseBlock
                  key={phase.name + i}
                  phase={phase}
                  isActive={activePhase === phase.name}
                />
              ))}
            </div>
          )}

          {/* Initial dots before first phase arrives */}
          {isPending && phases.length === 0 && (
            <div className="flex flex-col items-start gap-2">
              <div className="bg-card border shadow-sm rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-2 h-2 rounded-full bg-primary/80 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-3 bg-card border-t">
        <div className="relative">
          <Input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command…"
            className="pr-10 bg-background"
            disabled={isPending}
          />
          <Button
            size="icon"
            variant="ghost"
            className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 text-primary hover:text-primary hover:bg-primary/10"
            onClick={handleSend}
            disabled={!content.trim() || isPending}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
