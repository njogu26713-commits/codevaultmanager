import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, workspacesTable } from "@workspace/db";
import {
  ListFilesParams,
  ReadFileParams,
  ReadFileBody,
  WriteFileParams,
  WriteFileBody,
} from "@workspace/api-zod";
import {
  getFileTree,
  readFile,
  writeFile,
  detectLanguage,
} from "../lib/workspace-manager";

const router: IRouter = Router();

function requireAuth(req: any, res: any, next: any): void {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  next();
}

async function getOwnedWorkspace(userId: string, workspaceId: string) {
  const [workspace] = await db
    .select()
    .from(workspacesTable)
    .where(
      and(
        eq(workspacesTable.id, workspaceId),
        eq(workspacesTable.userId, userId),
      ),
    );
  return workspace ?? null;
}

// List files in a workspace
router.get("/workspaces/:workspaceId/files", requireAuth, async (req, res): Promise<void> => {
  const params = ListFilesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const user = req.user as Express.User;
  const workspace = await getOwnedWorkspace(user.id, params.data.workspaceId);
  if (!workspace) {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }

  const tree = await getFileTree(workspace.id);
  res.json(tree);
});

// Read a file (path in request body)
router.post("/workspaces/:workspaceId/files/read", requireAuth, async (req, res): Promise<void> => {
  const params = ReadFileParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = ReadFileBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const user = req.user as Express.User;
  const workspace = await getOwnedWorkspace(user.id, params.data.workspaceId);
  if (!workspace) {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }

  try {
    const content = await readFile(workspace.id, body.data.path);
    res.json({
      path: body.data.path,
      content,
      language: detectLanguage(body.data.path),
    });
  } catch {
    res.status(404).json({ error: "File not found" });
  }
});

// Write a file (path + content in request body)
router.put("/workspaces/:workspaceId/files/write", requireAuth, async (req, res): Promise<void> => {
  const params = WriteFileParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = WriteFileBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const user = req.user as Express.User;
  const workspace = await getOwnedWorkspace(user.id, params.data.workspaceId);
  if (!workspace) {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }

  await writeFile(workspace.id, body.data.path, body.data.content);
  res.json({
    path: body.data.path,
    content: body.data.content,
    language: detectLanguage(body.data.path),
  });
});

export default router;
