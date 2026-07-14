import { Router, type IRouter } from "express";
import { eq, and, asc } from "drizzle-orm";
import { db, workspacesTable, messagesTable } from "@workspace/db";
import {
  ListMessagesParams,
  SendMessageParams,
  SendMessageBody,
} from "@workspace/api-zod";
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

// List messages for a workspace
router.get("/workspaces/:workspaceId/messages", requireAuth, async (req, res): Promise<void> => {
  const params = ListMessagesParams.safeParse(req.params);
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

  const rows = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.workspaceId, workspace.id))
    .orderBy(asc(messagesTable.createdAt));

  res.json(
    rows.map((m) => ({
      id: m.id,
      workspaceId: m.workspaceId,
      role: m.role,
      content: m.content,
      fileChanges: (m.fileChanges as any) ?? null,
      createdAt: m.createdAt.toISOString(),
    })),
  );
});

// Send a message — triggers AI code generation
router.post("/workspaces/:workspaceId/messages", requireAuth, async (req, res): Promise<void> => {
  const params = SendMessageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = SendMessageBody.safeParse(req.body);
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

  // Save user message
  const [userMsg] = await db
    .insert(messagesTable)
    .values({
      workspaceId: workspace.id,
      role: "user",
      content: body.data.content,
      fileChanges: null,
    })
    .returning();

  // Build context: file tree + sample of small text files
  const [fileTree, fileNodes] = await Promise.all([
    getFileTreeAsString(workspace.id),
    getFileTree(workspace.id),
  ]);

  // Gather context files (up to 20 small text files)
  const contextFiles: { path: string; content: string }[] = [];
  const flatFiles: string[] = [];
  function flatten(nodes: typeof fileNodes): void {
    for (const n of nodes) {
      if (n.type === "file") flatFiles.push(n.path);
      else if (n.children) flatten(n.children);
    }
  }
  flatten(fileNodes);

  const priorityExtensions = [
    "ts", "tsx", "js", "jsx", "py", "go", "rs",
    "json", "yaml", "yml", "toml", "md",
  ];
  const sorted = [...flatFiles].sort((a, b) => {
    const extA = a.split(".").pop() ?? "";
    const extB = b.split(".").pop() ?? "";
    return (
      (priorityExtensions.includes(extA) ? 0 : 1) -
      (priorityExtensions.includes(extB) ? 0 : 1)
    );
  });

  for (const fp of sorted.slice(0, 20)) {
    try {
      const content = await readFile(workspace.id, fp);
      if (content.length < 15000) {
        contextFiles.push({ path: fp, content });
      }
    } catch {
      // skip unreadable files
    }
  }

  // Call AI
  let aiResult: Awaited<ReturnType<typeof generateCodeChanges>>;
  try {
    aiResult = await generateCodeChanges(body.data.content, fileTree, contextFiles);
  } catch (err) {
    logger.error({ err }, "AI code generation failed");
    // Save error message and respond
    const [errMsg] = await db
      .insert(messagesTable)
      .values({
        workspaceId: workspace.id,
        role: "assistant",
        content:
          "I encountered an error generating code. Please check that the GROQ_API_KEY is configured.",
        fileChanges: null,
      })
      .returning();

    res.json({
      message: {
        id: errMsg.id,
        workspaceId: errMsg.workspaceId,
        role: errMsg.role,
        content: errMsg.content,
        fileChanges: null,
        createdAt: errMsg.createdAt.toISOString(),
      },
      fileChanges: [],
    });
    return;
  }

  // Apply file changes to disk
  for (const change of aiResult.fileChanges) {
    try {
      if (change.action === "delete") {
        // Deletion handled via git rm — just leave it; the diff will show it
      } else if (change.content != null) {
        await writeFile(workspace.id, change.path, change.content);
      }
    } catch (err) {
      logger.warn({ err, path: change.path }, "Failed to apply file change");
    }
  }

  // Save assistant message
  const [assistantMsg] = await db
    .insert(messagesTable)
    .values({
      workspaceId: workspace.id,
      role: "assistant",
      content: aiResult.summary,
      fileChanges: aiResult.fileChanges as any,
    })
    .returning();

  res.json({
    message: {
      id: assistantMsg.id,
      workspaceId: assistantMsg.workspaceId,
      role: assistantMsg.role,
      content: assistantMsg.content,
      fileChanges: aiResult.fileChanges,
      createdAt: assistantMsg.createdAt.toISOString(),
    },
    fileChanges: aiResult.fileChanges,
  });
});

export default router;
