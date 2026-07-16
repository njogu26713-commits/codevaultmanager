import * as React from "react"
import { RefreshCw, ExternalLink, Monitor } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface PreviewPanelProps {
  workspaceId: string
  /** Bump this value to force the iframe to reload (e.g. after AI writes files) */
  refreshKey?: number
}

export function PreviewPanel({ workspaceId, refreshKey = 0 }: PreviewPanelProps) {
  const iframeRef = React.useRef<HTMLIFrameElement>(null)
  const [internalKey, setInternalKey] = React.useState(0)
  const [loading, setLoading] = React.useState(true)

  // When the parent bumps refreshKey, reload the iframe
  React.useEffect(() => {
    if (refreshKey > 0) {
      setInternalKey((k) => k + 1)
      setLoading(true)
    }
  }, [refreshKey])

  const previewUrl = `/api/preview/${workspaceId}/`

  const handleRefresh = () => {
    setInternalKey((k) => k + 1)
    setLoading(true)
  }

  const handleOpenTab = () => {
    window.open(previewUrl, "_blank", "noopener,noreferrer")
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/20 shrink-0">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <Monitor className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground font-mono truncate">{previewUrl}</span>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0"
          onClick={handleRefresh}
          title="Refresh preview"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0"
          onClick={handleOpenTab}
          title="Open in new tab"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* iframe */}
      <div className="flex-1 relative overflow-hidden">
        <iframe
          key={`${workspaceId}-${internalKey}`}
          ref={iframeRef}
          src={previewUrl}
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
          title="Preview"
          onLoad={() => setLoading(false)}
        />
      </div>
    </div>
  )
}
