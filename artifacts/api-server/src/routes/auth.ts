import { Router, type IRouter } from "express";
import { passport } from "../lib/passport-config";

const router: IRouter = Router();

// Initiate GitHub OAuth
router.get("/auth/github", (req, res, next) => {
  if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
    res.status(503).send(
      "GitHub OAuth is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment secrets.",
    );
    return;
  }
  passport.authenticate("github", { scope: ["repo", "user:email"] })(req, res, next);
});

// OAuth callback — browser redirect, not a JSON endpoint
router.get(
  "/auth/github/callback",
  passport.authenticate("github", {
    failureRedirect: "/?error=auth_failed",
  }),
  (_req, res) => {
    res.redirect("/repos");
  },
);

// Get current authenticated user
router.get("/auth/me", (req, res): void => {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const u = req.user as Express.User;
  res.json({
    id: u.id,
    githubId: u.githubId,
    login: u.login,
    name: u.name ?? null,
    email: u.email ?? null,
    avatarUrl: u.avatarUrl,
  });
});

// Logout
router.post("/auth/logout", (req, res): void => {
  req.logout((err) => {
    if (err) {
      res.status(500).json({ error: "Logout failed" });
      return;
    }
    res.json({ status: "ok" });
  });
});

export default router;
