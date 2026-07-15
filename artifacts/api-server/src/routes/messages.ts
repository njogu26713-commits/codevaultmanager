import { Router, type IRouter } from "express";
import { z } from "zod";
import { Workspace, Message } from "../lib/db";
import {
  getFileTree,
  readFile,
  writeFile,
  getFileTreeAsString,
  ensureWorkspaceDir,
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

// Send a message — streams SSE steps then a final done event
router.post("/workspaces/:workspaceId/messages", requireAuth, async (req, res): Promise<void> => {
  const body = SendMessageBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "content is required" }); return; }

  const user = req.user as Express.User;
  const workspace = await getOwnedWorkspace(user.id, req.params.workspaceId);
  if (!workspace) { res.status(404).json({ error: "Workspace not found" }); return; }

  // --- Set up SSE ---
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (type: string, payload: object) => {
    res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`);
  };

  const step = (text: string, icon?: string) => {
    send("step", { text, icon: icon ?? "arrow" });
  };

  try {
    // 1. Save user message
    step("Saving your message…", "save");
    const userMsg = await Message.create({
      _id: crypto.randomUUID(),
      workspaceId: workspace._id,
      role: "user",
      content: body.data.content,
      fileChanges: null,
    });
    send("user_message", { message: serializeMessage(userMsg) });

    // 2. Ensure workspace dir exists (recreate if /tmp was wiped)
    await ensureWorkspaceDir(workspace._id, workspace.name, workspace.type, workspace.template ?? null);

    // 3. Read file tree
    step("Reading project file tree…", "folder");
    const [fileTree, fileNodes] = await Promise.all([
      getFileTreeAsString(workspace._id),
      getFileTree(workspace._id),
    ]);

    // 3. Load file contents
    const flattenFiles = (nodes: any[]): string[] => {
      const paths: string[] = [];
      for (const n of nodes) {
        if (n.type === "file") paths.push(n.path);
        if (n.children) paths.push(...flattenFiles(n.children));
      }
      return paths;
    };

    const filePaths = flattenFiles(fileNodes).slice(0, 20);
    step(`Loading ${filePaths.length} file${filePaths.length !== 1 ? "s" : ""} for context…`, "file");

    const contextFiles: Array<{ path: string; content: string }> = [];
    for (const filePath of filePaths) {
      try {
        const content = await readFile(workspace._id, filePath);
        if (content.length < 50_000) {
          contextFiles.push({ path: filePath, content });
        }
      } catch {
        // skip unreadable files
      }
    }

    // 4. Call AI
    step("Sending request to AI (Groq llama-3.3-70b)…", "bot");

    let aiResult: { summary: string; fileChanges: any[] };
    try {
      aiResult = await generateCodeChanges(body.data.content, fileTree, contextFiles);
    } catch (err) {
      logger.error({ err }, "AI generation failed");
      step("AI returned an error — saving failure message.", "error");
      const errMsg = await Message.create({
        _id: crypto.randomUUID(),
        workspaceId: workspace._id,
        role: "assistant",
        content: "Sorry, I encountered an error generating changes. Please try again.",
        fileChanges: null,
      });
      send("done", { message: serializeMessage(errMsg), fileChanges: [] });
      res.end();
      return;
    }

    step(`AI returned ${aiResult.fileChanges.length} file change${aiResult.fileChanges.length !== 1 ? "s" : ""}…`, "sparkle");

    // 5. Apply file changes
    for (const change of aiResult.fileChanges) {
      if (change.action === "delete") {
        step(`Deleting ${change.path}`, "trash");
      } else {
        step(`Writing ${change.path}`, "write");
      }
      try {
        if (change.action !== "delete" && change.content != null) {
          await writeFile(workspace._id, change.path, change.content);
        }
      } catch (err) {
        logger.warn({ err, path: change.path }, "Failed to apply file change");
        step(`⚠ Could not write ${change.path}`, "warn");
      }
    }

    // 6. Save assistant message
    step("Saving response to database…", "save");
    const assistantMsg = await Message.create({
      _id: crypto.randomUUID(),
      workspaceId: workspace._id,
      role: "assistant",
      content: aiResult.summary,
      fileChanges: aiResult.fileChanges,
    });

    step("Done!", "check");
    send("done", { message: serializeMessage(assistantMsg), fileChanges: aiResult.fileChanges });
  } catch (err) {
    logger.error({ err }, "Unexpected error in message handler");
    step("Unexpected server error.", "error");
    send("done", { message: null, fileChanges: [], error: "Server error" });
  }

  res.end();
});

export default router;
