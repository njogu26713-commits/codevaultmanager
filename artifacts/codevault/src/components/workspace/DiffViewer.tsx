import * as React from "react";
import { useGetDiff } from "@/lib/api";
import * as Diff2Html from 'diff2html';
import 'diff2html/bundles/css/diff2html.min.css';
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileDiffStatus } from "@workspace/api-client-react";

interface DiffViewerProps {
  workspaceId: string;
}

export function DiffViewer({ workspaceId }: DiffViewerProps) {
  const { data: diffs, isLoading } = useGetDiff(workspaceId, { 
    query: { enabled: !!workspaceId, queryKey: ['diff', workspaceId] } 
  });

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground font-mono text-sm bg-muted/10 h-full">
        Loading diffs...
      </div>
    );
  }

  if (!diffs || diffs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground font-mono text-sm bg-muted/10 h-full">
        No uncommitted changes.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background border-x overflow-hidden">
      <div className="flex items-center px-4 py-2 border-b bg-muted/20 font-mono text-sm text-muted-foreground">
        Review Changes ({diffs.length} files)
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {diffs.map((diff) => (
            <div key={diff.path} className="border rounded-md overflow-hidden bg-card">
              <div className="px-3 py-2 border-b flex items-center justify-between bg-muted/30">
                <span className="font-mono text-sm">{diff.path}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-mono ${
                  diff.status === 'added' ? 'bg-green-500/10 text-green-500' :
                  diff.status === 'deleted' ? 'bg-red-500/10 text-red-500' :
                  'bg-blue-500/10 text-blue-500'
                }`}>
                  {diff.status} (+{diff.additions} -{diff.deletions})
                </span>
              </div>
              {diff.diff ? (
                <div 
                  className="diff-container text-sm"
                  dangerouslySetInnerHTML={{ 
                    __html: Diff2Html.html(diff.diff, {
                      drawFileList: false,
                      matching: 'lines',
                      outputFormat: 'line-by-line',
                      renderNothingWhenEmpty: false,
                    }) 
                  }} 
                />
              ) : (
                <div className="p-4 text-center text-xs text-muted-foreground font-mono italic">
                  Binary or unrenderable diff
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
