import * as React from "react"
import { useGetMe } from "@/lib/api"
import { useLocation } from "wouter"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useQueryClient } from "@tanstack/react-query"

type Mode = "login" | "signup"

export default function Auth() {
  const { data: user, isLoading } = useGetMe()
  const [, setLocation] = useLocation()
  const queryClient = useQueryClient()

  const [mode, setMode] = React.useState<Mode>("login")
  const [email, setEmail] = React.useState("")
  const [name, setName] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (user) setLocation("/repos")
  }, [user, setLocation])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse flex items-center gap-2">
          <div className="h-4 w-4 bg-primary rounded-full" />
          <span className="font-mono text-sm text-muted-foreground">Loading…</span>
        </div>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const endpoint = mode === "signup" ? "/api/auth/signup" : "/api/auth/login"
      const body: Record<string, string> = { email, password }
      if (mode === "signup") body.name = name

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Something went wrong")
        return
      }

      await queryClient.invalidateQueries()
      setLocation("/repos")
    } catch {
      setError("Network error — please try again")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="mx-auto w-14 h-14 bg-primary text-primary-foreground rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 transform -rotate-6">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-7 h-7">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">CodeVault</h1>
          <p className="text-muted-foreground font-mono text-xs">AI Software Engineer</p>
        </div>

        {/* Card */}
        <div className="bg-card border rounded-2xl p-6 shadow-sm space-y-5">
          <h2 className="text-base font-semibold text-center">
            {mode === "login" ? "Sign in to your account" : "Create an account"}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-sm">Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  autoComplete="name"
                  className="h-11 text-base"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="h-11 text-base"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder={mode === "signup" ? "At least 6 characters" : "Your password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                className="h-11 text-base"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full h-11 text-base" disabled={submitting}>
              {submitting
                ? "Please wait…"
                : mode === "login"
                ? "Sign in"
                : "Create account"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            {mode === "login" ? (
              <>Don&apos;t have an account?{" "}
                <button
                  type="button"
                  className="text-primary hover:underline font-medium"
                  onClick={() => { setMode("signup"); setError(null) }}
                >
                  Sign up
                </button>
              </>
            ) : (
              <>Already have an account?{" "}
                <button
                  type="button"
                  className="text-primary hover:underline font-medium"
                  onClick={() => { setMode("login"); setError(null) }}
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
