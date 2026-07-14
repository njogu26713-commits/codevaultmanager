import * as React from "react"
import { useGetMe, useLogout } from "@/lib/api"
import { useLocation } from "wouter"
import { SiGithub } from "react-icons/si"
import { Button } from "@/components/ui/button"

export default function Auth() {
  const { data: user, isLoading } = useGetMe();
  const [, setLocation] = useLocation();

  React.useEffect(() => {
    if (user) {
      setLocation("/repos");
    }
  }, [user, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <div className="animate-pulse flex items-center gap-2">
          <div className="h-4 w-4 bg-primary rounded-full"></div>
          <span className="font-mono text-sm">Authenticating...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-4">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="space-y-4">
          <div className="mx-auto w-16 h-16 bg-primary text-primary-foreground rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 mb-8 transform -rotate-6">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold tracking-tight font-sans">CodeVault</h1>
          <p className="text-muted-foreground font-mono text-sm">
            AI Software Engineer
          </p>
        </div>

        <div className="bg-card border rounded-xl p-8 space-y-6 shadow-sm">
          <p className="text-sm">
            Connect your GitHub account to start shipping code directly from the workspace.
          </p>
          <Button 
            className="w-full font-medium" 
            size="lg"
            onClick={() => window.location.href = '/api/auth/github'}
          >
            <SiGithub className="mr-2 h-4 w-4" />
            Continue with GitHub
          </Button>
        </div>
      </div>
    </div>
  );
}
