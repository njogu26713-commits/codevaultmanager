import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, workspacesTable } from "@workspace/db";
import {
  GetDiffParams,
  ListBranchesParams,
  SwitchBranchParams,
  SwitchBranchBody,
  CommitChangesParams,
  CommitChangesBody,
} from "@workspace/api-zod";
import {
  getDiff,
  listBranches,
  switchBranch,
  commitAndPush,
} from "../lib/workspace-manager";
import { generateCommitMessage } from "../lib/groq-client";

const router: IRouter = Router();

function requireAuth(req: any, res: any, next: any): void {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  next();
}

async function getOwnedWorkspace(userId: string, workspaceId: string) {
  const [w] = await db
    .select()
    .from(workspacesTable)
    .where(
      and(
        eq(workspacesTable.id, workspaceId),
        eq(workspacesTable.userId, userId),
      ),
    );
  return w ?? null;
}

// Get diff of uncommitted changes
router.get("/workspaces/:workspaceId/diff", requireAuth, async (req, res): Promise<void> => {
  const params = GetDiffParams.safeParse(req.params);
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

  const diffs = await getDiff(workspace.id);
  res.json(diffs);
});

// List branches
router.get("/workspaces/:workspaceId/branches", requireAuth, async (req, res): Promise<void> => {
  const params = ListBranchesParams.safeParse(req.params);
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

  const branches = await listBranches(workspace.id);
  res.json(branches);
});

// Switch branch
router.patch("/workspaces/:workspaceId/branch", requireAuth, async (req, res): Promise<void> => {
  const params = SwitchBranchParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = SwitchBranchBody.safeParse(req.body);
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

  await switchBranch(workspace.id, body.data.branch);

  const [updated] = await db
    .update(workspacesTable)
    .set({ branch: body.data.branch })
    .where(eq(workspacesTable.id, workspace.id))
    .returning();

  res.json({
    id: updated.id,
    repoFullName: updated.repoFullName,
    branch: updated.branch,
    status: updated.status,
    createdAt: updated.createdAt.toISOString(),
    lastAccessedAt: updated.lastAccessedAt?.toISOString() ?? null,
  });
});

// Commit all staged changes and push
router.post("/workspaces/:workspaceId/commit", requireAuth, async (req, res): Promise<void> => {
  const params = CommitChangesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = CommitChangesBody.safeParse(req.body);
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

  // Generate commit message if not provided
  let commitMessage = body.data.message ?? null;
  if (!commitMessage) {
    const diffs = await getDiff(workspace.id);
    commitMessage = await generateCommitMessage(diffs).catch(
      () => "feat: apply AI-generated changes",
    );
  }

  const result = await commitAndPush(
    user.accessToken,
    workspace.id,
    commitMessage,
    workspace.repoFullName,
  );

  res.json(result);
});

export default router;
