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
  getGetDiffQueryKey,
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
import { Code2, ArrowLeft, GitCommit, FolderOpen, Bot, GitPullRequest, FileCode } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useQueryClient } from "@tanstack/react-query"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Mobile detection
// ---------------------------------------------------------------------------
function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false,
  )
  React.useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener("resize", handler)
    return () => window.removeEventListener("resize", handler)
  }, [])
  return isMobile
}

type MobileTab = "files" | "editor" | "chat" | "diff"

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function Workspace() {
  const { id } = useParams<{ id: string }>()
  const [, setLocation] = useLocation()
  const queryClient = useQueryClient()
  const isMobile = useIsMobile()

  const { data: workspace, isLoading: isWsLoading } = useGetWorkspace(id, {
    query: {
      enabled: !!id,
      queryKey: getGetWorkspaceQueryKey(id),
      refetchInterval: (query) =>
        query.state.data?.status === "cloning" ? 2000 : false,
    },
  })

  const { data: stats } = useGetWorkspaceStats(id, {
    query: {
      enabled: workspace?.status === "ready",
      queryKey: getGetWorkspaceStatsQueryKey(id),
      refetchInterval: 5000,
    },
  })

  const { data: files } = useListFiles(id, {
    query: {
      enabled: workspace?.status === "ready",
      queryKey: getListFilesQueryKey(id),
    },
  })

  const commitChanges = useCommitChanges()
  const closeWorkspace = useCloseWorkspace()

  const [selectedPath, setSelectedPath] = React.useState<string>("")
  const [activeEditorTab, setActiveEditorTab] = React.useState<"editor" | "diff">("editor")
  const [mobileTab, setMobileTab] = React.useState<MobileTab>("files")
  const [isCommitDialogOpen, setIsCommitDialogOpen] = React.useState(false)
  const [commitMessage, setCommitMessage] = React.useState("")

  // Auto-switch to editor on mobile when a file is selected
  const handleFileSelect = (path: string) => {
    setSelectedPath(path)
    if (isMobile) setMobileTab("editor")
  }

  const handleCommit = () => {
    if (!commitMessage) return
    commitChanges.mutate(
      { workspaceId: id, data: { message: commitMessage } },
      {
        onSuccess: () => {
          setIsCommitDialogOpen(false)
          setCommitMessage("")
          queryClient.invalidateQueries({ queryKey: getGetWorkspaceStatsQueryKey(id) })
          queryClient.invalidateQueries({ queryKey: getGetDiffQueryKey(id) })
        },
      },
    )
  }

  const handleClose = () => {
    closeWorkspace.mutate(
      { workspaceId: id },
      { onSuccess: () => setLocation("/repos") },
    )
  }

  // ---------------------------------------------------------------------------
  // Loading / error states
  // ---------------------------------------------------------------------------
  if (isWsLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center font-mono text-sm text-muted-foreground">
        Loading workspace…
      </div>
    )
  }

  if (!workspace) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center font-mono text-sm text-red-500">
        Workspace not found
      </div>
    )
  }

  if (workspace.status === "error") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <p className="text-red-500 font-mono text-sm">Failed to create project.</p>
        <Button onClick={() => setLocation("/repos")}>Go back</Button>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Shared header
  // ---------------------------------------------------------------------------
  const header = (
    <header className="border-b bg-card flex items-center justify-between px-3 py-2 gap-2 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => setLocation("/repos")}
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-1.5 min-w-0">
          <Code2 className="w-4 h-4 text-primary shrink-0" />
          <span className="font-semibold text-sm truncate">{workspace.name}</span>
        </div>
        {stats && (
          <Badge variant="secondary" className="font-mono text-[10px] hidden sm:flex shrink-0">
            {stats.uncommittedChanges > 0 ? `${stats.uncommittedChanges} changes` : "clean"}
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {stats && stats.uncommittedChanges > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1.5"
            onClick={() => setIsCommitDialogOpen(true)}
          >
            <GitCommit className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Commit</span>
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-8 text-xs text-muted-foreground hidden md:flex"
          onClick={handleClose}
          disabled={closeWorkspace.isPending}
        >
          Close
        </Button>
      </div>
    </header>
  )

  // ---------------------------------------------------------------------------
  // Mobile layout — bottom tab bar + single active panel
  // ---------------------------------------------------------------------------
  if (isMobile) {
    const mobileTabs: Array<{ id: MobileTab; label: string; icon: React.ReactNode }> = [
      { id: "files",  label: "Files",  icon: <FolderOpen className="w-5 h-5" /> },
      { id: "editor", label: "Editor", icon: <FileCode className="w-5 h-5" /> },
      { id: "chat",   label: "AI",     icon: <Bot className="w-5 h-5" /> },
      { id: "diff",   label: "Diff",   icon: <GitPullRequest className="w-5 h-5" /> },
    ]

    return (
      <div className="h-screen flex flex-col bg-background overflow-hidden">
        {header}

        {/* Active panel — fills all remaining space above the tab bar */}
        <div className="flex-1 overflow-hidden">
          {mobileTab === "files" && (
            <FileTree
              nodes={files ?? []}
              selectedPath={selectedPath}
              onSelectFile={handleFileSelect}
            />
          )}
          {mobileTab === "editor" && (
            <EditorPanel workspaceId={id} selectedPath={selectedPath} />
          )}
          {mobileTab === "chat" && (
            <ChatPanel workspaceId={id} />
          )}
          {mobileTab === "diff" && (
            <DiffViewer workspaceId={id} />
          )}
        </div>

        {/* Bottom tab bar */}
        <nav className="border-t bg-card flex shrink-0" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          {mobileTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setMobileTab(tab.id)}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
                mobileTab === tab.id
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>

        <CommitDialog
          open={isCommitDialogOpen}
          onOpenChange={setIsCommitDialogOpen}
          commitMessage={commitMessage}
          setCommitMessage={setCommitMessage}
          onCommit={handleCommit}
          isPending={commitChanges.isPending}
        />
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Desktop layout — resizable panels
  // ---------------------------------------------------------------------------
  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {header}

      <main className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal" className="h-full">
          {/* Left — File tree */}
          <Panel defaultSize={18} minSize={12} maxSize={30}>
            <FileTree
              nodes={files ?? []}
              selectedPath={selectedPath}
              onSelectFile={setSelectedPath}
            />
          </Panel>

          <PanelResizeHandle className="w-px bg-border hover:bg-primary/50 transition-colors" />

          {/* Centre — Editor / Diff */}
          <Panel defaultSize={52} minSize={30}>
            <div className="flex flex-col h-full">
              {/* Tab switcher */}
              <div className="flex border-b bg-muted/20 shrink-0">
                {(["editor", "diff"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveEditorTab(tab)}
                    className={cn(
                      "px-4 py-2 text-xs font-medium capitalize transition-colors",
                      activeEditorTab === tab
                        ? "border-b-2 border-primary text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {tab === "editor" ? "Editor" : "Changes"}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-hidden">
                {activeEditorTab === "editor" ? (
                  <EditorPanel workspaceId={id} selectedPath={selectedPath} />
                ) : (
                  <DiffViewer workspaceId={id} />
                )}
              </div>
            </div>
          </Panel>

          <PanelResizeHandle className="w-px bg-border hover:bg-primary/50 transition-colors" />

          {/* Right — AI Chat */}
          <Panel defaultSize={30} minSize={20} maxSize={40}>
            <ChatPanel workspaceId={id} />
          </Panel>
        </PanelGroup>
      </main>

      <CommitDialog
        open={isCommitDialogOpen}
        onOpenChange={setIsCommitDialogOpen}
        commitMessage={commitMessage}
        setCommitMessage={setCommitMessage}
        onCommit={handleCommit}
        isPending={commitChanges.isPending}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared commit dialog
// ---------------------------------------------------------------------------
function CommitDialog({
  open,
  onOpenChange,
  commitMessage,
  setCommitMessage,
  onCommit,
  isPending,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  commitMessage: string
  setCommitMessage: (v: string) => void
  onCommit: () => void
  isPending: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Commit Changes</DialogTitle>
          <DialogDescription>
            Save a snapshot of your current changes to the local git history.
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
              onKeyDown={(e) => { if (e.key === "Enter") onCommit() }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onCommit} disabled={!commitMessage || isPending}>
            {isPending ? "Committing…" : "Commit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
