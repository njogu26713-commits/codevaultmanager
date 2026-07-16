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
import { streamThinking, generateCodeChanges } from "../lib/groq-client";
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

// Send a message — streams SSE phases then a final done event
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

  const phase = (name: "thinking" | "preparing" | "working" | "finalizing") => {
    send("phase", { name });
  };

  const step = (text: string) => {
    send("step", { text });
  };

  try {
    // ── PREPARING ──────────────────────────────────────────────────────────
    phase("preparing");

    step("Saving your message…");
    const userMsg = await Message.create({
      _id: crypto.randomUUID(),
      workspaceId: workspace._id,
      role: "user",
      content: body.data.content,
      fileChanges: null,
    });
    send("user_message", { message: serializeMessage(userMsg) });

    await ensureWorkspaceDir(workspace._id, workspace.name, workspace.type, workspace.template ?? null);

    step("Reading project files…");
    const [fileTree, fileNodes] = await Promise.all([
      getFileTreeAsString(workspace._id),
      getFileTree(workspace._id),
    ]);

    const flattenFiles = (nodes: any[]): string[] => {
      const paths: string[] = [];
      for (const n of nodes) {
        if (n.type === "file") paths.push(n.path);
        if (n.children) paths.push(...flattenFiles(n.children));
      }
      return paths;
    };

    const filePaths = flattenFiles(fileNodes).slice(0, 20);
    step(`Loaded ${filePaths.length} file${filePaths.length !== 1 ? "s" : ""} for context`);

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

    // ── THINKING ───────────────────────────────────────────────────────────
    phase("thinking");

    try {
      await streamThinking(body.data.content, fileTree, (chunk) => {
        send("thinking_chunk", { text: chunk });
      });
    } catch (err) {
      // Non-fatal — if thinking stream fails, continue to working phase
      logger.warn({ err }, "Thinking stream failed, continuing");
    }

    // ── WORKING ────────────────────────────────────────────────────────────
    phase("working");
    step("Generating response…");

    let aiResult: { type: "code" | "chat"; reply: string; summary: string; fileChanges: any[] };
    try {
      aiResult = await generateCodeChanges(body.data.content, fileTree, contextFiles);
    } catch (err) {
      logger.error({ err }, "AI generation failed");
      const errMsg = await Message.create({
        _id: crypto.randomUUID(),
        workspaceId: workspace._id,
        role: "assistant",
        content: "Sorry, I encountered an error. Please try again.",
        fileChanges: null,
      });
      send("done", { message: serializeMessage(errMsg), fileChanges: [] });
      res.end();
      return;
    }

    if (aiResult.type === "code") {
      step(`Planned ${aiResult.fileChanges.length} file change${aiResult.fileChanges.length !== 1 ? "s" : ""}`);
      for (const change of aiResult.fileChanges) {
        if (change.action === "delete") {
          step(`Deleting ${change.path}`);
        } else {
          step(`${change.action === "create" ? "Creating" : "Updating"} ${change.path}`);
        }
        try {
          if (change.action !== "delete" && change.content != null) {
            await writeFile(workspace._id, change.path, change.content);
          }
        } catch (err) {
          logger.warn({ err, path: change.path }, "Failed to apply file change");
          step(`⚠ Could not write ${change.path}`);
        }
      }
    }

    // ── FINALIZING ─────────────────────────────────────────────────────────
    phase("finalizing");
    step("Saving to database…");

    const assistantMsg = await Message.create({
      _id: crypto.randomUUID(),
      workspaceId: workspace._id,
      role: "assistant",
      content: aiResult.reply,
      fileChanges: aiResult.type === "code" ? aiResult.fileChanges : null,
    });

    step("Done");
    send("done", { message: serializeMessage(assistantMsg), fileChanges: aiResult.fileChanges });
  } catch (err) {
    logger.error({ err }, "Unexpected error in message handler");
    send("done", { message: null, fileChanges: [], error: "Server error" });
  }

  res.end();
});

export default router;
