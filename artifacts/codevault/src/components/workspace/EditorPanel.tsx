import * as React from "react";
import Editor from "@monaco-editor/react";
import { useReadFile, useWriteFile } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListFilesQueryKey, getGetDiffQueryKey, getGetWorkspaceStatsQueryKey } from "@/lib/api";

interface EditorPanelProps {
  workspaceId: string;
  selectedPath: string;
}

export function EditorPanel({ workspaceId, selectedPath }: EditorPanelProps) {
  const queryClient = useQueryClient();
  const readFile = useReadFile();
  const writeFile = useWriteFile();
  
  const [content, setContent] = React.useState<string>("");
  const [language, setLanguage] = React.useState<string>("plaintext");
  const [isLoading, setIsLoading] = React.useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = React.useState(false);
  
  const originalContentRef = React.useRef<string>("");

  React.useEffect(() => {
    if (!selectedPath) return;
    
    let isMounted = true;
    setIsLoading(true);
    
    readFile.mutate({ workspaceId, data: { path: selectedPath } }, {
      onSuccess: (data) => {
        if (isMounted) {
          setContent(data.content);
          originalContentRef.current = data.content;
          setLanguage(data.language || 'plaintext');
          setHasUnsavedChanges(false);
          setIsLoading(false);
        }
      },
      onError: (err) => {
        console.error("Failed to read file", err);
        if (isMounted) setIsLoading(false);
      }
    });
    
    return () => { isMounted = false; };
  }, [workspaceId, selectedPath]); // We intentionally do not include readFile in deps to avoid infinite loops, but here readFile is a mutation hook return, we should only use mutate

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      setContent(value);
      setHasUnsavedChanges(value !== originalContentRef.current);
    }
  };

  const handleSave = () => {
    if (!selectedPath || !hasUnsavedChanges) return;
    
    writeFile.mutate({ workspaceId, data: { path: selectedPath, content } }, {
      onSuccess: (data) => {
        originalContentRef.current = data.content;
        setHasUnsavedChanges(false);
        // Invalidate diffs and stats
        queryClient.invalidateQueries({ queryKey: getGetDiffQueryKey(workspaceId) });
        queryClient.invalidateQueries({ queryKey: getGetWorkspaceStatsQueryKey(workspaceId) });
      },
      onError: (err) => {
        console.error("Failed to save file", err);
      }
    });
  };

  if (!selectedPath) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground font-mono text-sm bg-muted/10 h-full">
        Select a file to edit
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background border-x">
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/20">
        <div className="font-mono text-sm flex items-center gap-2">
          <span className="text-muted-foreground">{selectedPath}</span>
          {hasUnsavedChanges && <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>}
        </div>
        <Button 
          size="sm" 
          variant={hasUnsavedChanges ? "default" : "secondary"}
          onClick={handleSave}
          disabled={!hasUnsavedChanges || writeFile.isPending}
          className="h-7 text-xs"
        >
          <Save className="w-3.5 h-3.5 mr-1.5" />
          {writeFile.isPending ? "Saving..." : "Save"}
        </Button>
      </div>
      <div className="flex-1 relative">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50 backdrop-blur-sm">
            <div className="animate-pulse font-mono text-sm text-muted-foreground">Loading file...</div>
          </div>
        )}
        <Editor
          height="100%"
          language={language}
          value={content}
          theme="vs-dark" // We'll need a way to sync this with app theme
          onChange={handleEditorChange}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            fontFamily: "var(--app-font-mono)",
            wordWrap: "on",
            padding: { top: 16, bottom: 16 },
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            cursorBlinking: "smooth",
            cursorSmoothCaretAnimation: "on",
            formatOnPaste: true,
          }}
        />
      </div>
    </div>
  );
}
