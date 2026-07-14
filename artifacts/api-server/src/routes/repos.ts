import { Router, type IRouter } from "express";
import { listUserRepos, createRepo } from "../lib/github-client";
import { CreateRepoBody } from "@workspace/api-zod";

const router: IRouter = Router();

function requireAuth(req: any, res: any, next: any): void {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  next();
}

// List the authenticated user's repos
router.get("/repos", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as Express.User;
  const repos = await listUserRepos(user.accessToken);
  res.json(repos);
});

// Create a new repo
router.post("/repos", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateRepoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const user = req.user as Express.User;
  const { name, description, private: isPrivate, autoInit } = parsed.data;
  const repo = await createRepo(
    user.accessToken,
    name,
    description,
    isPrivate,
    autoInit,
  );
  res.status(201).json(repo);
});

export default router;
