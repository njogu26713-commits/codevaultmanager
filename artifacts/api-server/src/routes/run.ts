import { Router, type IRouter } from "express";
import { spawn, type ChildProcess } from "child_process";
import { Workspace } from "../lib/db";
import { getWorkspaceDir, ensureWorkspaceDir } from "../lib/workspace-manager";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Per-workspace running process registry
const running = new Map<string, ChildProcess>();

function requireAuth(req: any, res: any, next: any): void {
  if (!req.user) { res.status(401).json({ error: "Not authenticated" }); return; }
  next();
}

function getRunCommand(
  type: string,
  template: string | null,
): { cmd: string; args: string[] } | null {
  if (type === "blank") return { cmd: "sh", args: ["-c", "ls -la"] };
  switch (template) {
    case "node":    return { cmd: "node", args: ["index.js"] };
    case "python":  return { cmd: "python3", args: ["main.py"] };
    case "express": return { cmd: "node", args: ["server.js"] };
    case "react":   return {
      cmd: "sh",
      args: ["-c", "echo 'React projects need: npm install && npm run dev'"],
    };
    default:        return null;
  }
}

// POST /api/workspaces/:id/run — stream run output via SSE
router.post("/workspaces/:workspaceId/run", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as any;
  const workspace = await Workspace.findOne({ _id: req.params.workspaceId, userId: user.id });
  if (!workspace) { res.status(404).json({ error: "Workspace not found" }); return; }

  // Kill any existing process for this workspace
  const prev = running.get(workspace._id);
  if (prev) { try { prev.kill("SIGTERM"); } catch {} running.delete(workspace._id); }

  await ensureWorkspaceDir(
    workspace._id,
    workspace.name,
    workspace.type as "blank" | "template",
    workspace.template ?? null,
  );

  const dir = getWorkspaceDir(workspace._id);
  const runCmd = getRunCommand(workspace.type, workspace.template ?? null);

  // SSE setup
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (type: string, payload: object) =>
    res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`);

  if (!runCmd) {
    send("stderr", { text: "No run command configured for this project type.\n" });
    send("exit", { code: 1 });
    res.end();
    return;
  }

  const cmdStr = [runCmd.cmd, ...runCmd.args].join(" ");
  send("start", { cmd: cmdStr });
  logger.info({ workspaceId: workspace._id, cmd: cmdStr }, "Running workspace");

  const proc = spawn(runCmd.cmd, runCmd.args, {
    cwd: dir,
    env: { ...process.env, NODE_ENV: "development", FORCE_COLOR: "0" },
  });

  running.set(workspace._id, proc);

  proc.stdout?.on("data", (chunk: Buffer) => send("stdout", { text: chunk.toString() }));
  proc.stderr?.on("data", (chunk: Buffer) => send("stderr", { text: chunk.toString() }));

  proc.on("close", (code) => {
    running.delete(workspace._id);
    send("exit", { code: code ?? 0 });
    res.end();
  });

  proc.on("error", (err) => {
    running.delete(workspace._id);
    send("stderr", { text: `Error: ${err.message}\n` });
    send("exit", { code: 1 });
    res.end();
  });

  // Client disconnect → kill process
  req.on("close", () => {
    if (running.has(workspace._id)) {
      try { proc.kill("SIGTERM"); } catch {}
      running.delete(workspace._id);
    }
  });
});

// DELETE /api/workspaces/:id/run — stop a running process
router.delete("/workspaces/:workspaceId/run", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as any;
  const workspace = await Workspace.findOne({ _id: req.params.workspaceId, userId: user.id });
  if (!workspace) { res.status(404).json({ error: "Workspace not found" }); return; }

  const proc = running.get(workspace._id);
  if (proc) {
    try { proc.kill("SIGTERM"); } catch {}
    running.delete(workspace._id);
  }
  res.json({ stopped: !!proc });
});

export default router;
