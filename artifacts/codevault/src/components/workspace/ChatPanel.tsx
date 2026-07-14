import * as React from "react";
import { useListMessages, useSendMessage } from "@/lib/api";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, Bot, User, Code2, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListMessagesQueryKey, getGetDiffQueryKey, getGetWorkspaceStatsQueryKey, getListFilesQueryKey } from "@/lib/api";
import { cn } from "@/lib/utils";
import { FileChangeAction } from "@workspace/api-client-react";

interface ChatPanelProps {
  workspaceId: string;
}

export function ChatPanel({ workspaceId }: ChatPanelProps) {
  const queryClient = useQueryClient();
  const [content, setContent] = React.useState("");
  const scrollRef = React.useRef<HTMLDivElement>(null);
  
  const { data: messages, isLoading } = useListMessages(workspaceId, {
    query: { enabled: !!workspaceId, queryKey: getListMessagesQueryKey(workspaceId) }
  });
  
  const sendMessage = useSendMessage();

  const handleSend = () => {
    if (!content.trim() || sendMessage.isPending) return;
    
    // Optimistic message UI could go here, but let's just wait for the mutation
    const currentContent = content;
    setContent("");
    
    sendMessage.mutate({ workspaceId, data: { content: currentContent } }, {
      onSuccess: () => {
        // Invalidate messages, files, diffs, stats
        queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(workspaceId) });
        queryClient.invalidateQueries({ queryKey: getListFilesQueryKey(workspaceId) });
        queryClient.invalidateQueries({ queryKey: getGetDiffQueryKey(workspaceId) });
        queryClient.invalidateQueries({ queryKey: getGetWorkspaceStatsQueryKey(workspaceId) });
      },
      onError: (err) => {
        console.error("Failed to send message", err);
        setContent(currentContent); // Restore on error
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto scroll to bottom
  React.useEffect(() => {
    if (scrollRef.current) {
      const scrollableNode = scrollRef.current;
      scrollableNode.scrollTop = scrollableNode.scrollHeight;
    }
  }, [messages, sendMessage.isPending]);

  return (
    <div className="flex flex-col h-full bg-muted/10">
      <div className="px-4 py-3 border-b bg-card text-sm font-semibold flex items-center gap-2">
        <Bot className="w-4 h-4 text-primary" />
        AI Engineer
      </div>
      
      <ScrollArea className="flex-1 p-4" viewportRef={scrollRef}>
        <div className="space-y-6 pb-4">
          {messages?.length === 0 && (
            <div className="text-center mt-10 space-y-3">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto text-primary">
                <Bot className="w-6 h-6" />
              </div>
              <p className="text-sm text-muted-foreground">
                I'm ready to write code. Describe what you want to build or change.
              </p>
            </div>
          )}
          
          {messages?.map((msg) => (
            <div key={msg.id} className={cn("flex flex-col gap-2", msg.role === 'user' ? "items-end" : "items-start")}>
              <div className={cn(
                "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                msg.role === 'user' 
                  ? "bg-primary text-primary-foreground rounded-tr-sm" 
                  : "bg-card border rounded-tl-sm shadow-sm"
              )}>
                {msg.content}
              </div>
              
              {msg.fileChanges && msg.fileChanges.length > 0 && (
                <div className="w-full max-w-[85%] mt-1">
                  <div className="text-xs font-mono text-muted-foreground mb-1.5 flex items-center gap-1">
                    <Code2 className="w-3.5 h-3.5" />
                    Generated Changes:
                  </div>
                  <div className="bg-card border rounded-md overflow-hidden divide-y divide-border">
                    {msg.fileChanges.map((change, idx) => (
                      <div key={idx} className="flex items-center justify-between px-3 py-1.5 text-xs font-mono">
                        <span className="truncate pr-4">{change.path}</span>
                        <span className={cn(
                          "px-1.5 py-0.5 rounded capitalize",
                          change.action === 'create' ? "text-green-500 bg-green-500/10" :
                          change.action === 'modify' ? "text-blue-500 bg-blue-500/10" :
                          "text-red-500 bg-red-500/10"
                        )}>
                          {change.action}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
          
          {sendMessage.isPending && (
            <div className="flex flex-col items-start gap-2">
              <div className="bg-card border shadow-sm rounded-2xl rounded-tl-sm px-4 py-3 text-sm flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: "0ms" }}></div>
                <div className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "150ms" }}></div>
                <div className="w-2 h-2 rounded-full bg-primary/80 animate-bounce" style={{ animationDelay: "300ms" }}></div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
      
      <div className="p-3 bg-card border-t">
        <div className="relative">
          <Input 
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command..."
            className="pr-10 bg-background"
            disabled={sendMessage.isPending}
          />
          <Button 
            size="icon" 
            variant="ghost" 
            className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 text-primary hover:text-primary hover:bg-primary/10"
            onClick={handleSend}
            disabled={!content.trim() || sendMessage.isPending}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
