import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { Workspace } from "../lib/db";
import { ensureWorkspaceDir, getWorkspaceDir } from "../lib/workspace-manager";

const router = Router();

const MIME_TYPES: Record<string, string> = {
  ".html":  "text/html; charset=utf-8",
  ".htm":   "text/html; charset=utf-8",
  ".css":   "text/css; charset=utf-8",
  ".js":    "text/javascript; charset=utf-8",
  ".mjs":   "text/javascript; charset=utf-8",
  ".cjs":   "text/javascript; charset=utf-8",
  ".ts":    "text/typescript; charset=utf-8",
  ".json":  "application/json; charset=utf-8",
  ".svg":   "image/svg+xml",
  ".png":   "image/png",
  ".jpg":   "image/jpeg",
  ".jpeg":  "image/jpeg",
  ".gif":   "image/gif",
  ".webp":  "image/webp",
  ".ico":   "image/x-icon",
  ".woff":  "font/woff",
  ".woff2": "font/woff2",
  ".ttf":   "font/ttf",
  ".txt":   "text/plain; charset=utf-8",
  ".xml":   "application/xml",
  ".webmanifest": "application/manifest+json",
};

function requireAuth(req: any, res: any, next: any): void {
  if (!req.user) { res.status(401).send("Not authenticated"); return; }
  next();
}

// Serve workspace files for live preview
// Route: GET /preview/:workspaceId  (root → index.html)
//         GET /preview/:workspaceId/path/to/file.css
router.get("/preview/:workspaceId/{*splat}", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as any;
  const workspace = await Workspace.findOne({ _id: req.params.workspaceId, userId: user.id });
  if (!workspace) { res.status(404).send("Workspace not found"); return; }

  await ensureWorkspaceDir(workspace._id, workspace.name, workspace.type, workspace.template ?? null);

  const dir = getWorkspaceDir(workspace._id);
  const splat = Array.isArray(req.params.splat)
    ? req.params.splat.join("/")
    : (req.params.splat ?? "");

  // Normalise: empty or "/" → serve index.html
  const reqPath = splat === "" || splat === "/" ? "index.html" : splat;
  const fullPath = path.resolve(dir, reqPath);

  // Path traversal guard
  if (!fullPath.startsWith(dir)) { res.status(403).send("Forbidden"); return; }

  const sendFile = async (filePath: string): Promise<boolean> => {
    try {
      const content = await fs.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      res.setHeader("Content-Type", MIME_TYPES[ext] ?? "application/octet-stream");
      res.setHeader("X-Frame-Options", "SAMEORIGIN");
      // Disable caching so Refresh in the iframe always fetches fresh content
      res.setHeader("Cache-Control", "no-store");
      res.send(content);
      return true;
    } catch {
      return false;
    }
  };

  // Try the exact path, then fall back to index.html (SPA routing)
  if (!await sendFile(fullPath)) {
    if (!await sendFile(path.join(dir, "index.html"))) {
      res.status(404).send(
        `<html><body style="font-family:monospace;padding:2rem;color:#888">
          <h2>No preview available</h2>
          <p>Create an <strong>index.html</strong> file to see a preview here.</p>
        </body></html>`,
      );
    }
  }
});

export default router;
