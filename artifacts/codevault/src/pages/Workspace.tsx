import * as React from "react"
import { useLocation, useParams } from "wouter"
import { 
  useGetWorkspace, 
  useGetWorkspaceStats, 
  useListFiles, 
  useCommitChanges,
  useCloseWorkspace,
  getGetWorkspaceQueryKey,
  getGetWorkspaceStatsQueryKey,
  getListFilesQueryKey,
  getGetDiffQueryKey
} from "@/lib/api"
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels"
import { FileTree } from "@/components/workspace/FileTree"
import { EditorPanel } from "@/components/workspace/EditorPanel"
import { DiffViewer } from "@/components/workspace/DiffViewer"
import { ChatPanel } from "@/components/workspace/ChatPanel"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Code2, GitBranch, ArrowLeft, GitCommit, Layout, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useQueryClient } from "@tanstack/react-query"

export default function Workspace() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: workspace, isLoading: isWsLoading } = useGetWorkspace(id, { 
    query: { 
      enabled: !!id, 
      queryKey: getGetWorkspaceQueryKey(id),
      refetchInterval: (query) => query.state.data?.status === 'cloning' ? 2000 : false 
    } 
  });
  
  const { data: stats } = useGetWorkspaceStats(id, { 
    query: { 
      enabled: workspace?.status === 'ready', 
      queryKey: getGetWorkspaceStatsQueryKey(id),
      refetchInterval: 5000 
    } 
  });
  
  const { data: files } = useListFiles(id, { 
    query: { 
      enabled: workspace?.status === 'ready',
      queryKey: getListFilesQueryKey(id)
    } 
  });

  const commitChanges = useCommitChanges();
  const closeWorkspace = useCloseWorkspace();

  const [selectedPath, setSelectedPath] = React.useState<string>("");
  const [activeTab, setActiveTab] = React.useState<'editor' | 'diff'>('editor');
  const [isCommitDialogOpen, setIsCommitDialogOpen] = React.useState(false);
  const [commitMessage, setCommitMessage] = React.useState("");

  const handleCommit = () => {
    if (!commitMessage) return;
    
    commitChanges.mutate({ workspaceId: id, data: { message: commitMessage } }, {
      onSuccess: () => {
        setIsCommitDialogOpen(false);
        setCommitMessage("");
        queryClient.invalidateQueries({ queryKey: getGetWorkspaceStatsQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getGetDiffQueryKey(id) });
      },
      onError: (err) => {
        console.error("Failed to commit", err);
      }
    });
  };

  const handleClose = () => {
    closeWorkspace.mutate({ workspaceId: id }, {
      onSuccess: () => {
        setLocation('/repos');
      }
    });
  };

  if (isWsLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center font-mono text-sm text-muted-foreground">Loading workspace...</div>;
  }

  if (!workspace) {
    return <div className="min-h-screen bg-background flex items-center justify-center font-mono text-sm text-red-500">Workspace not found</div>;
  }

  if (workspace.status === 'cloning') {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center space-y-6">
        <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold font-sans">Cloning Repository</h2>
          <p className="text-muted-foreground font-mono text-sm">{workspace.repoFullName}</p>
        </div>
      </div>
    );
  }

  if (workspace.status === 'error') {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center space-y-6">
        <div className="w-16 h-16 bg-destructive/10 text-destructive rounded-full flex items-center justify-center">
          <X className="w-8 h-8" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold font-sans text-destructive">Failed to load workspace</h2>
          <p className="text-muted-foreground font-mono text-sm">There was an error cloning the repository.</p>
        </div>
        <Button onClick={() => setLocation('/repos')}>Return to Repositories</Button>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* Top Navbar */}
      <header className="h-14 border-b bg-card flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => setLocation('/repos')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex flex-col">
            <span className="font-semibold text-sm leading-none tracking-tight">{workspace.repoFullName}</span>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
                <GitBranch className="w-3 h-3" />
                {workspace.branch}
              </div>
              {stats?.lastCommitDate && (
                <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[200px]">
                  • {stats.lastCommitMessage}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {stats?.uncommittedChanges !== undefined && stats.uncommittedChanges > 0 && (
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="font-mono text-xs text-primary bg-primary/10 hover:bg-primary/20">
                {stats.uncommittedChanges} uncommitted {stats.uncommittedChanges === 1 ? 'file' : 'files'}
              </Badge>
              <Button 
                size="sm" 
                className="h-8 text-xs font-medium"
                onClick={() => setIsCommitDialogOpen(true)}
              >
                <GitCommit className="w-3.5 h-3.5 mr-1.5" />
                Commit & Push
              </Button>
            </div>
          )}
          <div className="w-px h-6 bg-border mx-1"></div>
          <div className="flex items-center bg-muted/50 rounded-lg p-0.5">
            <Button 
              variant={activeTab === 'editor' ? 'default' : 'ghost'} 
              size="sm" 
              className={`h-7 px-3 text-xs ${activeTab === 'editor' ? 'shadow-sm' : ''}`}
              onClick={() => setActiveTab('editor')}
            >
              <Code2 className="w-3.5 h-3.5 mr-1.5" />
              Editor
            </Button>
            <Button 
              variant={activeTab === 'diff' ? 'default' : 'ghost'} 
              size="sm" 
              className={`h-7 px-3 text-xs ${activeTab === 'diff' ? 'shadow-sm' : ''}`}
              onClick={() => setActiveTab('diff')}
            >
              <Layout className="w-3.5 h-3.5 mr-1.5" />
              Diff
            </Button>
          </div>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <main className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal">
          {/* Left Sidebar - File Tree */}
          <Panel defaultSize={20} minSize={15} maxSize={30} className="bg-card">
            <div className="h-full flex flex-col">
              <div className="h-10 border-b flex items-center px-4 shrink-0 font-semibold text-xs tracking-wider uppercase text-muted-foreground">
                Explorer
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {files ? (
                  <FileTree 
                    nodes={files} 
                    onSelectFile={(path) => {
                      setSelectedPath(path);
                      if (activeTab !== 'editor') setActiveTab('editor');
                    }}
                    selectedPath={selectedPath}
                  />
                ) : (
                  <div className="p-4 text-center text-muted-foreground font-mono text-xs animate-pulse">Loading files...</div>
                )}
              </div>
            </div>
          </Panel>
          
          <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors" />
          
          {/* Center Panel - Editor or Diff */}
          <Panel defaultSize={50} minSize={30}>
            {activeTab === 'editor' ? (
              <EditorPanel workspaceId={id} selectedPath={selectedPath} />
            ) : (
              <DiffViewer workspaceId={id} />
            )}
          </Panel>
          
          <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors" />
          
          {/* Right Sidebar - AI Chat */}
          <Panel defaultSize={30} minSize={20} maxSize={40}>
            <ChatPanel workspaceId={id} />
          </Panel>
        </PanelGroup>
      </main>

      {/* Commit Dialog */}
      <Dialog open={isCommitDialogOpen} onOpenChange={setIsCommitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Commit Changes</DialogTitle>
            <DialogDescription>
              This will commit your changes and push them directly to {workspace.branch}.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label>Commit Message</Label>
              <Input 
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="e.g. Add user authentication"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCommit();
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCommitDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleCommit} 
              disabled={!commitMessage || commitChanges.isPending}
            >
              {commitChanges.isPending ? "Committing..." : "Commit & Push"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
