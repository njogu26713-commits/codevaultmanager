import { Router, type IRouter } from "express";
import { z } from "zod";
import { Workspace } from "../lib/db";
import { getFileTree, readFile, writeFile, detectLanguage, ensureWorkspaceDir } from "../lib/workspace-manager";

const router: IRouter = Router();

function requireAuth(req: any, res: any, next: any): void {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  next();
}

async function getOwnedWorkspace(userId: string, workspaceId: string) {
  return Workspace.findOne({ _id: workspaceId, userId });
}

const ReadFileBody = z.object({ path: z.string().min(1) });
const WriteFileBody = z.object({ path: z.string().min(1), content: z.string() });

// List files
router.get("/workspaces/:workspaceId/files", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as Express.User;
  const workspace = await getOwnedWorkspace(user.id, req.params.workspaceId);
  if (!workspace) { res.status(404).json({ error: "Workspace not found" }); return; }

  await ensureWorkspaceDir(workspace._id, workspace.name, workspace.type, workspace.template ?? null);
  const tree = await getFileTree(workspace._id);
  res.json(tree);
});

// Read a file
router.post("/workspaces/:workspaceId/files/read", requireAuth, async (req, res): Promise<void> => {
  const body = ReadFileBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "path is required" }); return; }

  const user = req.user as Express.User;
  const workspace = await getOwnedWorkspace(user.id, req.params.workspaceId);
  if (!workspace) { res.status(404).json({ error: "Workspace not found" }); return; }

  try {
    const content = await readFile(workspace._id, body.data.path);
    res.json({ path: body.data.path, content, language: detectLanguage(body.data.path) });
  } catch {
    res.status(404).json({ error: "File not found" });
  }
});

// Write a file
router.put("/workspaces/:workspaceId/files/write", requireAuth, async (req, res): Promise<void> => {
  const body = WriteFileBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "path and content are required" }); return; }

  const user = req.user as Express.User;
  const workspace = await getOwnedWorkspace(user.id, req.params.workspaceId);
  if (!workspace) { res.status(404).json({ error: "Workspace not found" }); return; }

  await writeFile(workspace._id, body.data.path, body.data.content);
  res.json({ path: body.data.path, content: body.data.content, language: detectLanguage(body.data.path) });
});

export default router;
