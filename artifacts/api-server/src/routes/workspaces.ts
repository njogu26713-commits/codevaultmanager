import { Router, type IRouter } from "express";
import { z } from "zod";
import { Workspace, Message } from "../lib/db";
import {
  createProject,
  deleteWorkspaceDir,
  getWorkspaceStats,
} from "../lib/workspace-manager";

const router: IRouter = Router();

function requireAuth(req: any, res: any, next: any): void {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  next();
}

const CreateWorkspaceBody = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(["blank", "template"]),
  template: z.enum(["node", "python", "react", "express"]).optional(),
});

function serializeWorkspace(w: any) {
  return {
    id: w._id,
    name: w.name,
    type: w.type,
    template: w.template ?? null,
    status: w.status,
    createdAt: w.createdAt.toISOString(),
    lastAccessedAt: w.lastAccessedAt?.toISOString() ?? null,
  };
}

// List workspaces for the current user
router.get("/workspaces", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as Express.User;
  const workspaces = await Workspace.find({ userId: user.id }).sort({ lastAccessedAt: -1 });
  res.json(workspaces.map(serializeWorkspace));
});

// Create a new project
router.post("/workspaces", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateWorkspaceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }

  const user = req.user as Express.User;
  const { name, type, template } = parsed.data;

  // Create workspace record first (status: creating)
  const workspace = await Workspace.create({
    _id: crypto.randomUUID(),
    userId: user.id,
    name,
    type,
    template: template ?? null,
    status: "creating",
    lastAccessedAt: new Date(),
  });

  try {
    await createProject(workspace._id, name, type, template ?? null);
    workspace.status = "ready";
    await workspace.save();
  } catch (err) {
    workspace.status = "error";
    await workspace.save();
    req.log?.error?.({ err }, "Failed to create project");
    res.status(500).json({ error: "Failed to create project" });
    return;
  }

  res.status(201).json(serializeWorkspace(workspace));
});

// Get a specific workspace
router.get("/workspaces/:workspaceId", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as Express.User;
  const workspace = await Workspace.findOne({ _id: req.params.workspaceId, userId: user.id });
  if (!workspace) {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }
  workspace.lastAccessedAt = new Date();
  await workspace.save();
  res.json(serializeWorkspace(workspace));
});

// Get workspace stats
router.get("/workspaces/:workspaceId/stats", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as Express.User;
  const workspace = await Workspace.findOne({ _id: req.params.workspaceId, userId: user.id });
  if (!workspace) {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }

  try {
    const stats = await getWorkspaceStats(workspace._id);
    res.json(stats);
  } catch {
    res.status(500).json({ error: "Failed to get stats" });
  }
});

// Delete (close) a workspace
router.delete("/workspaces/:workspaceId", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as Express.User;
  const workspace = await Workspace.findOne({ _id: req.params.workspaceId, userId: user.id });
  if (!workspace) {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }

  await Promise.all([
    deleteWorkspaceDir(workspace._id),
    Message.deleteMany({ workspaceId: workspace._id }),
    workspace.deleteOne(),
  ]);

  res.json({ status: "ok" });
});

export default router;
