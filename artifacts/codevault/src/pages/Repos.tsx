import * as React from "react"
import { useGetMe } from "@/lib/api"
import { useLocation } from "wouter"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog"
import { LogOut, Plus, Clock, FolderOpen, Code2 } from "lucide-react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type WorkspaceStatus = "creating" | "ready" | "error"
type ProjectType = "blank" | "template"
type Template = "node" | "python" | "react" | "express"

interface Workspace {
  id: string
  name: string
  type: ProjectType
  template: Template | null
  status: WorkspaceStatus
  createdAt: string
  lastAccessedAt: string | null
}

const TEMPLATES: Array<{ value: Template; label: string; description: string; icon: string }> = [
  { value: "node",    label: "Node.js",   description: "index.js + package.json",     icon: "🟩" },
  { value: "python",  label: "Python",    description: "main.py + requirements.txt",  icon: "🐍" },
  { value: "react",   label: "React",     description: "Vite + React",               icon: "⚛️" },
  { value: "express", label: "Express",   description: "REST API server",             icon: "🚂" },
]

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------
async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

function useWorkspaces() {
  return useQuery<Workspace[]>({
    queryKey: ["workspaces"],
    queryFn: () => apiFetch("/api/workspaces"),
  })
}

function useCreateWorkspace() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { name: string; type: ProjectType; template?: Template }) =>
      apiFetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspaces"] }),
  })
}

function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiFetch("/api/auth/logout", { method: "POST" }),
    onSuccess: () => qc.clear(),
  })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function timeAgo(iso: string | null): string {
  if (!iso) return "Never"
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "Just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function templateLabel(t: Template | null): string {
  return TEMPLATES.find(x => x.value === t)?.label ?? "Blank"
}

function templateIcon(t: Template | null): string {
  return TEMPLATES.find(x => x.value === t)?.icon ?? "📄"
}

// ---------------------------------------------------------------------------
// New Project Dialog
// ---------------------------------------------------------------------------
function NewProjectDialog({ onCreate }: { onCreate: (id: string) => void }) {
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [type, setType] = React.useState<ProjectType>("blank")
  const [template, setTemplate] = React.useState<Template>("node")
  const [error, setError] = React.useState<string | null>(null)
  const create = useCreateWorkspace()

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const ws: Workspace = await create.mutateAsync({
        name: name.trim(),
        type,
        ...(type === "template" ? { template } : {}),
      })
      setOpen(false)
      setName("")
      setType("blank")
      onCreate(ws.id)
    } catch (err: any) {
      setError(err.message ?? "Failed to create project")
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" />
          New Project
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create a new project</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCreate} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="proj-name">Project name</Label>
            <Input
              id="proj-name"
              placeholder="my-awesome-project"
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Starting point</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType("blank")}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  type === "blank"
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border hover:bg-muted/50"
                }`}
              >
                <div className="text-lg mb-1">📄</div>
                <div className="text-sm font-medium">Blank</div>
                <div className="text-xs text-muted-foreground">Empty project</div>
              </button>
              <button
                type="button"
                onClick={() => setType("template")}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  type === "template"
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border hover:bg-muted/50"
                }`}
              >
                <div className="text-lg mb-1">🗂️</div>
                <div className="text-sm font-medium">Template</div>
                <div className="text-xs text-muted-foreground">Starter files</div>
              </button>
            </div>
          </div>

          {type === "template" && (
            <div className="space-y-2">
              <Label>Template</Label>
              <div className="grid grid-cols-2 gap-2">
                {TEMPLATES.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTemplate(t.value)}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      template === t.value
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <div className="text-lg mb-1">{t.icon}</div>
                    <div className="text-sm font-medium">{t.label}</div>
                    <div className="text-xs text-muted-foreground">{t.description}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={create.isPending || !name.trim()}>
              {create.isPending ? "Creating…" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function Repos() {
  const { data: user, isLoading: userLoading } = useGetMe()
  const { data: workspaces, isLoading: wsLoading } = useWorkspaces()
  const logout = useLogout()
  const [, setLocation] = useLocation()
  const [search, setSearch] = React.useState("")

  React.useEffect(() => {
    if (!userLoading && !user) setLocation("/")
  }, [user, userLoading, setLocation])

  async function handleLogout() {
    await logout.mutateAsync()
    setLocation("/")
  }

  const filtered = React.useMemo(() => {
    if (!workspaces) return []
    return workspaces.filter(w => w.name.toLowerCase().includes(search.toLowerCase()))
  }, [workspaces, search])

  const initials = user?.name
    ? user.name.split(" ").map((p: string) => p[0]).join("").slice(0, 2).toUpperCase()
    : "?"

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary text-primary-foreground rounded-lg flex items-center justify-center transform -rotate-6">
            <Code2 className="w-4 h-4" />
          </div>
          <span className="font-bold text-lg">CodeVault</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-semibold">
              {initials}
            </div>
            <span>{user?.name}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            disabled={logout.isPending}
            className="gap-1.5 text-muted-foreground"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </Button>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Your Projects</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Open a project to start coding with AI
            </p>
          </div>
          <NewProjectDialog onCreate={id => setLocation(`/workspace/${id}`)} />
        </div>

        {/* Search */}
        {workspaces && workspaces.length > 4 && (
          <Input
            placeholder="Search projects…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="max-w-sm"
          />
        )}

        {/* List */}
        {wsLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="border border-dashed rounded-xl p-12 text-center space-y-3">
            <FolderOpen className="w-10 h-10 mx-auto text-muted-foreground/50" />
            <p className="font-medium text-muted-foreground">
              {search ? "No matching projects" : "No projects yet"}
            </p>
            {!search && (
              <p className="text-sm text-muted-foreground">
                Create your first project to start building with AI.
              </p>
            )}
          </div>
        ) : (
          <div className="border rounded-xl overflow-hidden bg-card divide-y">
            {filtered.map(ws => (
              <div
                key={ws.id}
                className="p-4 flex items-center justify-between hover:bg-muted/40 transition-colors group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-2xl">{templateIcon(ws.template)}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm truncate">{ws.name}</span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 shrink-0">
                        {ws.type === "template" ? templateLabel(ws.template) : "Blank"}
                      </Badge>
                      {ws.status === "error" && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 shrink-0">Error</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      <Clock className="w-3 h-3" />
                      <span>{timeAgo(ws.lastAccessedAt ?? ws.createdAt)}</span>
                    </div>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="font-mono text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => setLocation(`/workspace/${ws.id}`)}
                  disabled={ws.status !== "ready"}
                >
                  Open
                </Button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
