import { Router, type IRouter } from "express";
import { spawn, type ChildProcess } from "child_process";
import fs from "fs/promises";
import path from "path";
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function dirExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

async function fileExists(p: string): Promise<boolean> {
  try { const s = await fs.stat(p); return s.isFile(); } catch { return false; }
}

/** Returns the shell install command for a given template, or null if nothing to install. */
async function getInstallCommand(
  template: string | null,
  dir: string,
): Promise<{ cmd: string; args: string[] } | null> {
  const hasPkg = await fileExists(path.join(dir, "package.json"));
  const hasReqs = await fileExists(path.join(dir, "requirements.txt"));

  if (hasPkg) return { cmd: "npm", args: ["install"] };
  if (hasReqs) return { cmd: "pip3", args: ["install", "-r", "requirements.txt"] };
  return null;
}

/** Returns the run command for a project. Auto-installs deps first if needed. */
function getRunScript(template: string | null): { cmd: string; args: string[] } | null {
  switch (template) {
    case "node":
      return {
        cmd: "sh",
        args: ["-c", "[ -d node_modules ] || npm install && node index.js"],
      };
    case "express":
      return {
        cmd: "sh",
        args: ["-c", "[ -d node_modules ] || npm install && node server.js"],
      };
    case "react":
      return {
        cmd: "sh",
        args: ["-c", "[ -d node_modules ] || npm install && npm run dev -- --host 0.0.0.0"],
      };
    case "python":
      return {
        cmd: "sh",
        args: ["-c", "[ -f requirements.txt ] && pip3 install -r requirements.txt -q; python3 main.py"],
      };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// SSE streaming helper
// ---------------------------------------------------------------------------
function sseSetup(res: any) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  return (type: string, payload: object) =>
    res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`);
}

// ---------------------------------------------------------------------------
// Spawn helper — streams output, resolves when done
// ---------------------------------------------------------------------------
function spawnStream(
  cmd: string,
  args: string[],
  cwd: string,
  send: (type: string, payload: object) => void,
  registry: Map<string, ChildProcess>,
  key: string,
  req: any,
): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      cwd,
      env: { ...process.env, NODE_ENV: "development", FORCE_COLOR: "0", npm_config_fund: "false", npm_config_audit: "false" },
    });
    registry.set(key, proc);

    proc.stdout?.on("data", (chunk: Buffer) => send("stdout", { text: chunk.toString() }));
    proc.stderr?.on("data", (chunk: Buffer) => send("stderr", { text: chunk.toString() }));

    proc.on("close", (code) => { registry.delete(key); resolve(code ?? 0); });
    proc.on("error", (err) => {
      registry.delete(key);
      send("stderr", { text: `Error: ${err.message}\n` });
      resolve(1);
    });

    req.on("close", () => {
      if (registry.has(key)) { try { proc.kill("SIGTERM"); } catch {} registry.delete(key); }
    });
  });
}

// ---------------------------------------------------------------------------
// POST /api/workspaces/:id/install — install dependencies, stream via SSE
// ---------------------------------------------------------------------------
router.post("/workspaces/:workspaceId/install", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as any;
  const workspace = await Workspace.findOne({ _id: req.params.workspaceId, userId: user.id });
  if (!workspace) { res.status(404).json({ error: "Workspace not found" }); return; }

  const prev = running.get(workspace._id);
  if (prev) { try { prev.kill("SIGTERM"); } catch {} running.delete(workspace._id); }

  await ensureWorkspaceDir(
    workspace._id,
    workspace.name,
    workspace.type as "blank" | "template",
    workspace.template ?? null,
  );

  const dir = getWorkspaceDir(workspace._id);
  const send = sseSetup(res);
  const installCmd = await getInstallCommand(workspace.template ?? null, dir);

  if (!installCmd) {
    send("stderr", { text: "No package manager detected (no package.json or requirements.txt).\n" });
    send("exit", { code: 1 });
    res.end();
    return;
  }

  const cmdStr = [installCmd.cmd, ...installCmd.args].join(" ");
  send("start", { cmd: cmdStr });
  logger.info({ workspaceId: workspace._id, cmd: cmdStr }, "Installing dependencies");

  const code = await spawnStream(installCmd.cmd, installCmd.args, dir, send, running, workspace._id, req);
  send("exit", { code });
  res.end();
});

// ---------------------------------------------------------------------------
// POST /api/workspaces/:id/run — auto-install if needed, then run, stream via SSE
// ---------------------------------------------------------------------------
router.post("/workspaces/:workspaceId/run", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as any;
  const workspace = await Workspace.findOne({ _id: req.params.workspaceId, userId: user.id });
  if (!workspace) { res.status(404).json({ error: "Workspace not found" }); return; }

  const prev = running.get(workspace._id);
  if (prev) { try { prev.kill("SIGTERM"); } catch {} running.delete(workspace._id); }

  await ensureWorkspaceDir(
    workspace._id,
    workspace.name,
    workspace.type as "blank" | "template",
    workspace.template ?? null,
  );

  const dir = getWorkspaceDir(workspace._id);
  const runScript = workspace.type === "blank"
    ? { cmd: "sh", args: ["-c", "ls -la"] }
    : getRunScript(workspace.template ?? null);

  const send = sseSetup(res);

  if (!runScript) {
    send("stderr", { text: "No run command configured for this project type.\n" });
    send("exit", { code: 1 });
    res.end();
    return;
  }

  const cmdStr = [runScript.cmd, ...runScript.args].join(" ");
  send("start", { cmd: workspace.template === "node" ? "node index.js" : workspace.template === "express" ? "node server.js" : workspace.template === "python" ? "python3 main.py" : cmdStr });
  logger.info({ workspaceId: workspace._id, cmd: cmdStr }, "Running workspace");

  const code = await spawnStream(runScript.cmd, runScript.args, dir, send, running, workspace._id, req);
  send("exit", { code });
  res.end();
});

// ---------------------------------------------------------------------------
// DELETE /api/workspaces/:id/run — stop running process
// ---------------------------------------------------------------------------
router.delete("/workspaces/:workspaceId/run", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as any;
  const workspace = await Workspace.findOne({ _id: req.params.workspaceId, userId: user.id });
  if (!workspace) { res.status(404).json({ error: "Workspace not found" }); return; }

  const proc = running.get(workspace._id);
  if (proc) { try { proc.kill("SIGTERM"); } catch {} running.delete(workspace._id); }
  res.json({ stopped: !!proc });
});

export default router;
