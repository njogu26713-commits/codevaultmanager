import * as React from "react"
import { useGetMe, useListRepos, useCreateRepo, useListWorkspaces, useOpenWorkspace } from "@/lib/api"
import { useLocation } from "wouter"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Search, Plus, GitFork, LogOut, Clock, Code2 } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"

export default function Repos() {
  const { data: user, isLoading: isUserLoading } = useGetMe();
  const { data: repos, isLoading: isReposLoading } = useListRepos();
  const { data: workspaces, isLoading: isWorkspacesLoading } = useListWorkspaces();
  
  const createRepo = useCreateRepo();
  const openWorkspace = useOpenWorkspace();
  const [, setLocation] = useLocation();

  const [search, setSearch] = React.useState("");
  const [newRepoName, setNewRepoName] = React.useState("");
  const [newRepoDesc, setNewRepoDesc] = React.useState("");
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);

  React.useEffect(() => {
    if (!isUserLoading && !user) {
      setLocation("/");
    }
  }, [user, isUserLoading, setLocation]);

  const filteredRepos = React.useMemo(() => {
    if (!repos) return [];
    return repos.filter(r => 
      r.name.toLowerCase().includes(search.toLowerCase()) || 
      (r.description && r.description.toLowerCase().includes(search.toLowerCase()))
    );
  }, [repos, search]);

  const handleCreateRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRepoName) return;
    
    try {
      const repo = await createRepo.mutateAsync({
        data: {
          name: newRepoName,
          description: newRepoDesc,
          private: true,
          autoInit: true
        }
      });
      setIsDialogOpen(false);
      setNewRepoName("");
      setNewRepoDesc("");
      
      // Auto open it
      handleOpenWorkspace(repo.fullName, repo.defaultBranch || "main");
    } catch (err) {
      console.error("Failed to create repo", err);
    }
  };

  const handleOpenWorkspace = async (repoFullName: string, branch: string) => {
    // Check if we already have a workspace for this
    const existing = workspaces?.find(w => w.repoFullName === repoFullName && w.branch === branch);
    if (existing) {
      setLocation(`/workspace/${existing.id}`);
      return;
    }
    
    try {
      const workspace = await openWorkspace.mutateAsync({
        data: {
          repoFullName,
          branch
        }
      });
      setLocation(`/workspace/${workspace.id}`);
    } catch (err) {
      console.error("Failed to open workspace", err);
    }
  };

  if (isUserLoading || isReposLoading || isWorkspacesLoading) {
    return <div className="min-h-screen bg-background text-foreground flex items-center justify-center font-mono text-sm">Loading...</div>;
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b bg-card">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary text-primary-foreground rounded-lg flex items-center justify-center transform -rotate-6">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </div>
            <span className="font-bold tracking-tight">CodeVault</span>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium">
              <Avatar className="w-8 h-8">
                <AvatarImage src={user.avatarUrl} />
                <AvatarFallback>{user.login.slice(0,2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <span>{user.login}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-12 space-y-12">
        {workspaces && workspaces.length > 0 && (
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold tracking-tight">Recent Workspaces</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {workspaces.map(ws => (
                <Card 
                  key={ws.id} 
                  className="cursor-pointer hover:border-primary transition-colors hover:shadow-md"
                  onClick={() => setLocation(`/workspace/${ws.id}`)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Code2 className="w-4 h-4 text-primary" />
                          {ws.repoFullName.split('/')[1]}
                        </CardTitle>
                        <CardDescription className="font-mono text-xs">
                          {ws.repoFullName}
                        </CardDescription>
                      </div>
                      <Badge variant={ws.status === 'ready' ? 'default' : 'secondary'} className="capitalize text-xs">
                        {ws.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <GitFork className="w-3.5 h-3.5" />
                      <span className="font-mono">{ws.branch}</span>
                    </div>
                    {ws.lastAccessedAt && (
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{new Date(ws.lastAccessedAt).toLocaleDateString()}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold tracking-tight">Repositories</h2>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  New Repository
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Repository</DialogTitle>
                  <DialogDescription>
                    Create a new private GitHub repository and open it in a workspace.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreateRepo} className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Repository Name</Label>
                    <Input 
                      id="name" 
                      value={newRepoName} 
                      onChange={e => setNewRepoName(e.target.value)} 
                      placeholder="e.g. awesome-project"
                      autoFocus
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description (optional)</Label>
                    <Input 
                      id="description" 
                      value={newRepoDesc} 
                      onChange={e => setNewRepoDesc(e.target.value)} 
                      placeholder="What is this project about?"
                    />
                  </div>
                  <DialogFooter>
                    <Button variant="outline" type="button" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={!newRepoName || createRepo.isPending}>
                      {createRepo.isPending ? "Creating..." : "Create & Open"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search repositories..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 max-w-md"
            />
          </div>

          <div className="border rounded-xl overflow-hidden bg-card divide-y">
            {filteredRepos.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground font-mono text-sm">
                No repositories found.
              </div>
            ) : (
              filteredRepos.map(repo => (
                <div key={repo.id} className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{repo.name}</span>
                      {repo.private && <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 leading-none">Private</Badge>}
                    </div>
                    {repo.description && (
                      <p className="text-xs text-muted-foreground truncate max-w-xl">{repo.description}</p>
                    )}
                  </div>
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    className="font-mono text-xs"
                    onClick={() => handleOpenWorkspace(repo.fullName, repo.defaultBranch)}
                    disabled={openWorkspace.isPending}
                  >
                    Open Workspace
                  </Button>
                </div>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
