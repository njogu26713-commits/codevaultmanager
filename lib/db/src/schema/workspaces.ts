import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const workspacesTable = pgTable("workspaces", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  repoFullName: text("repo_full_name").notNull(),
  branch: text("branch").notNull(),
  // 'ready' | 'cloning' | 'error'
  status: text("status").notNull().default("cloning"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }),
});

export const insertWorkspaceSchema = createInsertSchema(workspacesTable).omit({
  createdAt: true,
});
export type InsertWorkspace = z.infer<typeof insertWorkspaceSchema>;
export type Workspace = typeof workspacesTable.$inferSelect;
