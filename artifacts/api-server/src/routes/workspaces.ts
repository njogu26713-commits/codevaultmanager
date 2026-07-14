import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, workspacesTable, messagesTable } from "@workspace/db";
import {
  OpenWorkspaceBody,
  GetWorkspaceParams,
  CloseWorkspaceParams,
  GetWorkspaceStatsParams,
  ListWorkspacesResponse,
  OpenWorkspaceResponse,
  GetWorkspaceResponse,
} from "@workspace/api-zod";
import {
  cloneRepo,
  deleteWorkspaceDir,
  getWorkspaceStats,
} from "../lib/workspace-manager";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function requireAuth(req: any, res: any, next: any): void {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  next();
}

// List all workspaces for the current user
router.get("/workspaces", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as Express.User;
  const rows = await db
    .select()
    .from(workspacesTable)
    .where(eq(workspacesTable.userId, user.id))
    .orderBy(workspacesTable.lastAccessedAt);

  res.json(
    ListWorkspacesResponse.parse(
      rows.map((w) => ({
        id: w.id,
        repoFullName: w.repoFullName,
        branch: w.branch,
        status: w.status,
        createdAt: w.createdAt.toISOString(),
        lastAccessedAt: w.lastAccessedAt?.toISOString() ?? null,
      })),
    ),
  );
});

// Open (clone) a repo as a workspace
router.post("/workspaces", requireAuth, async (req, res): Promise<void> => {
  const parsed = OpenWorkspaceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const user = req.user as Express.User;
  const { repoFullName, branch } = parsed.data;

  // Check if workspace for this repo+branch already exists for user
  const [existing] = await db
    .select()
    .from(workspacesTable)
    .where(
      and(
        eq(workspacesTable.userId, user.id),
        eq(workspacesTable.repoFullName, repoFullName),
        eq(workspacesTable.branch, branch),
      ),
    );

  if (existing) {
    await db
      .update(workspacesTable)
      .set({ lastAccessedAt: new Date() })
      .where(eq(workspacesTable.id, existing.id));
    res.status(201).json(
      OpenWorkspaceResponse.parse({
        id: existing.id,
        repoFullName: existing.repoFullName,
        branch: existing.branch,
        status: existing.status,
        createdAt: existing.createdAt.toISOString(),
        lastAccessedAt: new Date().toISOString(),
      }),
    );
    return;
  }

  // Clone the repo — this happens in the background
  let workspaceId: string;
  try {
    workspaceId = await cloneRepo(user.accessToken, repoFullName, branch);
  } catch (err) {
    req.log.error({ err }, "Failed to clone repo");
    res.status(500).json({ error: "Failed to clone repository" });
    return;
  }

  const [workspace] = await db
    .insert(workspacesTable)
    .values({
      id: workspaceId,
      userId: user.id,
      repoFullName,
      branch,
      status: "ready",
      lastAccessedAt: new Date(),
    })
    .returning();

  res.status(201).json(
    OpenWorkspaceResponse.parse({
      id: workspace.id,
      repoFullName: workspace.repoFullName,
      branch: workspace.branch,
      status: workspace.status,
      createdAt: workspace.createdAt.toISOString(),
      lastAccessedAt: workspace.lastAccessedAt?.toISOString() ?? null,
    }),
  );
});

// Get a specific workspace
router.get("/workspaces/:workspaceId", requireAuth, async (req, res): Promise<void> => {
  const params = GetWorkspaceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const user = req.user as Express.User;
  const [workspace] = await db
    .select()
    .from(workspacesTable)
    .where(
      and(
        eq(workspacesTable.id, params.data.workspaceId),
        eq(workspacesTable.userId, user.id),
      ),
    );

  if (!workspace) {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }

  // Update last accessed
  await db
    .update(workspacesTable)
    .set({ lastAccessedAt: new Date() })
    .where(eq(workspacesTable.id, workspace.id));

  res.json(
    GetWorkspaceResponse.parse({
      id: workspace.id,
      repoFullName: workspace.repoFullName,
      branch: workspace.branch,
      status: workspace.status,
      createdAt: workspace.createdAt.toISOString(),
      lastAccessedAt: new Date().toISOString(),
    }),
  );
});

// Close (delete) a workspace
router.delete("/workspaces/:workspaceId", requireAuth, async (req, res): Promise<void> => {
  const params = CloseWorkspaceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const user = req.user as Express.User;
  const [workspace] = await db
    .select()
    .from(workspacesTable)
    .where(
      and(
        eq(workspacesTable.id, params.data.workspaceId),
        eq(workspacesTable.userId, user.id),
      ),
    );

  if (!workspace) {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }

  // Delete workspace directory and DB records
  await deleteWorkspaceDir(workspace.id).catch((err) => {
    logger.warn({ err, workspaceId: workspace.id }, "Failed to delete workspace dir");
  });

  await db
    .delete(messagesTable)
    .where(eq(messagesTable.workspaceId, workspace.id));

  await db
    .delete(workspacesTable)
    .where(eq(workspacesTable.id, workspace.id));

  res.sendStatus(204);
});

// Get workspace stats
router.get("/workspaces/:workspaceId/stats", requireAuth, async (req, res): Promise<void> => {
  const params = GetWorkspaceStatsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const user = req.user as Express.User;
  const [workspace] = await db
    .select()
    .from(workspacesTable)
    .where(
      and(
        eq(workspacesTable.id, params.data.workspaceId),
        eq(workspacesTable.userId, user.id),
      ),
    );

  if (!workspace) {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }

  const [stats, messageCount] = await Promise.all([
    getWorkspaceStats(workspace.id),
    db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.workspaceId, workspace.id))
      .then((rows) => rows.length),
  ]);

  res.json({
    totalFiles: stats.totalFiles,
    totalMessages: messageCount,
    currentBranch: stats.currentBranch,
    lastCommitMessage: stats.lastCommitMessage,
    lastCommitDate: stats.lastCommitDate,
    uncommittedChanges: stats.uncommittedChanges,
  });
});

export default router;
