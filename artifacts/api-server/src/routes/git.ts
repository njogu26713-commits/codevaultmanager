import { Router, type IRouter } from "express";
import { z } from "zod";
import { Workspace } from "../lib/db";
import {
  getDiff,
  listBranches,
  switchBranch,
  commitChanges,
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
  return Workspace.findOne({ _id: workspaceId, userId });
}

const SwitchBranchBody = z.object({ branch: z.string().min(1) });
const CommitBody = z.object({ message: z.string().optional() });

// Get uncommitted diff
router.get("/workspaces/:workspaceId/diff", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as Express.User;
  const workspace = await getOwnedWorkspace(user.id, req.params.workspaceId);
  if (!workspace) { res.status(404).json({ error: "Workspace not found" }); return; }

  const diffs = await getDiff(workspace._id);
  res.json(diffs);
});

// List branches
router.get("/workspaces/:workspaceId/branches", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as Express.User;
  const workspace = await getOwnedWorkspace(user.id, req.params.workspaceId);
  if (!workspace) { res.status(404).json({ error: "Workspace not found" }); return; }

  const branches = await listBranches(workspace._id);
  res.json(branches);
});

// Switch branch
router.patch("/workspaces/:workspaceId/branch", requireAuth, async (req, res): Promise<void> => {
  const body = SwitchBranchBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "branch is required" }); return; }

  const user = req.user as Express.User;
  const workspace = await getOwnedWorkspace(user.id, req.params.workspaceId);
  if (!workspace) { res.status(404).json({ error: "Workspace not found" }); return; }

  await switchBranch(workspace._id, body.data.branch);
  res.json({ branch: body.data.branch });
});

// Commit changes (local commit; push if remote is configured)
router.post("/workspaces/:workspaceId/commit", requireAuth, async (req, res): Promise<void> => {
  const body = CommitBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const user = req.user as Express.User;
  const workspace = await getOwnedWorkspace(user.id, req.params.workspaceId);
  if (!workspace) { res.status(404).json({ error: "Workspace not found" }); return; }

  let message = body.data.message ?? null;
  if (!message) {
    const diffs = await getDiff(workspace._id);
    message = await generateCommitMessage(diffs).catch(() => "feat: apply changes");
  }

  const result = await commitChanges(workspace._id, message);
  res.json(result);
});

export default router;
