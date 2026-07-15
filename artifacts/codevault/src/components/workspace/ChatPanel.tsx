import * as React from "react";
import { useListMessages } from "@/lib/api";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Send, Bot, Code2,
  Save, FolderOpen, FileText, Sparkles, Trash2,
  AlertTriangle, CheckCircle2, ChevronRight, Loader2,
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
interface Step {
  text: string;
  icon: string;
  done: boolean;
}

interface ChatPanelProps {
  workspaceId: string;
}

// ---------------------------------------------------------------------------
// Icon map for step icons
// ---------------------------------------------------------------------------
function StepIcon({ icon, spinning }: { icon: string; spinning?: boolean }) {
  const cls = cn("w-3.5 h-3.5 shrink-0", spinning && "animate-spin");
  switch (icon) {
    case "save":    return <Save className={cls} />;
    case "folder":  return <FolderOpen className={cls} />;
    case "file":    return <FileText className={cls} />;
    case "bot":     return <Bot className={cls} />;
    case "sparkle": return <Sparkles className={cls} />;
    case "write":   return <FileText className={cls} />;
    case "trash":   return <Trash2 className={cls} />;
    case "check":   return <CheckCircle2 className={cn(cls, "text-green-500")} />;
    case "error":   return <AlertTriangle className={cn(cls, "text-red-500")} />;
    case "warn":    return <AlertTriangle className={cn(cls, "text-yellow-500")} />;
    default:        return <ChevronRight className={cls} />;
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function ChatPanel({ workspaceId }: ChatPanelProps) {
  const queryClient = useQueryClient();
  const [content, setContent] = React.useState("");
  const [isPending, setIsPending] = React.useState(false);
  const [steps, setSteps] = React.useState<Step[]>([]);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const { data: messages } = useListMessages(workspaceId, {
    query: { enabled: !!workspaceId, queryKey: getListMessagesQueryKey(workspaceId) },
  });

  // Auto-scroll on new messages or steps
  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, steps, isPending]);

  const handleSend = async () => {
    if (!content.trim() || isPending) return;
    const prompt = content.trim();
    setContent("");
    setIsPending(true);
    setSteps([]);

    // Optimistically add the user message to the cache so it appears instantly
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

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE lines: "data: {...}\n\n"
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          const json = line.slice(5).trim();
          let event: any;
          try { event = JSON.parse(json); } catch { continue; }

          if (event.type === "step") {
            setSteps((prev) => {
              // Mark all previous steps done, add new active one
              return [
                ...prev.map((s) => ({ ...s, done: true })),
                { text: event.text, icon: event.icon ?? "arrow", done: false },
              ];
            });
          } else if (event.type === "user_message") {
            // Replace optimistic message with server-confirmed one
            queryClient.setQueryData(getListMessagesQueryKey(workspaceId), (old: any[] = []) =>
              old.map((m) => (m.id === tempId ? event.message : m))
            );
          } else if (event.type === "done") {
            // Mark all steps done
            setSteps((prev) => prev.map((s) => ({ ...s, done: true })));
            // Add assistant message to cache
            if (event.message) {
              queryClient.setQueryData(getListMessagesQueryKey(workspaceId), (old: any[] = []) => [
                ...old.filter((m) => m.id !== tempId),
                event.message,
              ]);
            }
            // Refresh file tree, diffs, stats
            queryClient.invalidateQueries({ queryKey: getListFilesQueryKey(workspaceId) });
            queryClient.invalidateQueries({ queryKey: getGetDiffQueryKey(workspaceId) });
            queryClient.invalidateQueries({ queryKey: getGetWorkspaceStatsQueryKey(workspaceId) });
          }
        }
      }
    } catch (err) {
      console.error("SSE error", err);
      setSteps((prev) => [
        ...prev.map((s) => ({ ...s, done: true })),
        { text: "Connection error — please try again.", icon: "error", done: true },
      ]);
      // Remove optimistic message on error
      queryClient.setQueryData(getListMessagesQueryKey(workspaceId), (old: any[] = []) =>
        old.filter((m) => m.id !== tempId)
      );
    } finally {
      setIsPending(false);
      // Clear steps after a short delay so user can see "Done!"
      setTimeout(() => setSteps([]), 2500);
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

          {/* Live step log — shown while AI is working */}
          {isPending && steps.length > 0 && (
            <div className="flex flex-col items-start gap-1.5">
              <div className="bg-card border rounded-2xl rounded-tl-sm shadow-sm px-4 py-3 w-full max-w-[90%] space-y-1.5">
                {steps.map((s, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex items-center gap-2 text-xs font-mono transition-opacity",
                      s.done ? "text-muted-foreground" : "text-foreground",
                    )}
                  >
                    {s.done ? (
                      <StepIcon icon={s.icon} />
                    ) : (
                      <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-primary" />
                    )}
                    <span>{s.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Initial dots while first step hasn't arrived yet */}
          {isPending && steps.length === 0 && (
            <div className="flex flex-col items-start gap-2">
              <div className="bg-card border shadow-sm rounded-2xl rounded-tl-sm px-4 py-3 text-sm flex items-center gap-2">
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
