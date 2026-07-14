import { Router, type IRouter } from "express";
import { z } from "zod";
import { Workspace, Message } from "../lib/db";
import {
  getFileTree,
  readFile,
  writeFile,
  getFileTreeAsString,
} from "../lib/workspace-manager";
import { generateCodeChanges } from "../lib/groq-client";
import { logger } from "../lib/logger";

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

const SendMessageBody = z.object({ content: z.string().min(1) });

function serializeMessage(m: any) {
  return {
    id: m._id,
    workspaceId: m.workspaceId,
    role: m.role,
    content: m.content,
    fileChanges: m.fileChanges ?? null,
    createdAt: m.createdAt.toISOString(),
  };
}

// List messages for a workspace
router.get("/workspaces/:workspaceId/messages", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as Express.User;
  const workspace = await getOwnedWorkspace(user.id, req.params.workspaceId);
  if (!workspace) { res.status(404).json({ error: "Workspace not found" }); return; }

  const messages = await Message.find({ workspaceId: workspace._id }).sort({ createdAt: 1 });
  res.json(messages.map(serializeMessage));
});

// Send a message — triggers AI code generation
router.post("/workspaces/:workspaceId/messages", requireAuth, async (req, res): Promise<void> => {
  const body = SendMessageBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "content is required" }); return; }

  const user = req.user as Express.User;
  const workspace = await getOwnedWorkspace(user.id, req.params.workspaceId);
  if (!workspace) { res.status(404).json({ error: "Workspace not found" }); return; }

  // Save user message
  const userMsg = await Message.create({
    _id: crypto.randomUUID(),
    workspaceId: workspace._id,
    role: "user",
    content: body.data.content,
    fileChanges: null,
  });

  // Build context: file tree + sample text files
  const [fileTree, fileNodes] = await Promise.all([
    getFileTreeAsString(workspace._id),
    getFileTree(workspace._id),
  ]);

  const contextFiles: Array<{ path: string; content: string }> = [];
  const flattenFiles = (nodes: any[]): string[] => {
    const paths: string[] = [];
    for (const n of nodes) {
      if (n.type === "file") paths.push(n.path);
      if (n.children) paths.push(...flattenFiles(n.children));
    }
    return paths;
  };

  for (const filePath of flattenFiles(fileNodes).slice(0, 20)) {
    try {
      const content = await readFile(workspace._id, filePath);
      if (content.length < 50_000) {
        contextFiles.push({ path: filePath, content });
      }
    } catch {
      // skip unreadable files
    }
  }

  // Call AI
  let aiResult: { summary: string; fileChanges: any[] };
  try {
    aiResult = await generateCodeChanges(body.data.content, fileTree, contextFiles);
  } catch (err) {
    logger.error({ err }, "AI generation failed");
    const errMsg = await Message.create({
      _id: crypto.randomUUID(),
      workspaceId: workspace._id,
      role: "assistant",
      content: "Sorry, I encountered an error generating changes. Please try again.",
      fileChanges: null,
    });
    res.status(500).json({ message: serializeMessage(errMsg), fileChanges: [] });
    return;
  }

  // Apply file changes
  for (const change of aiResult.fileChanges) {
    try {
      if (change.action !== "delete" && change.content != null) {
        await writeFile(workspace._id, change.path, change.content);
      }
    } catch (err) {
      logger.warn({ err, path: change.path }, "Failed to apply file change");
    }
  }

  // Save assistant message
  const assistantMsg = await Message.create({
    _id: crypto.randomUUID(),
    workspaceId: workspace._id,
    role: "assistant",
    content: aiResult.summary,
    fileChanges: aiResult.fileChanges,
  });

  res.json({ message: serializeMessage(assistantMsg), fileChanges: aiResult.fileChanges });
});

export default router;
