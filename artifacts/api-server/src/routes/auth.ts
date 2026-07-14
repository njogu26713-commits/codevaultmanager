import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import passport from "passport";
import { User } from "../lib/db";

const router: IRouter = Router();

const SignupBody = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  password: z.string().min(6),
});

const LoginBody = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

// Sign up — create a new account and immediately log in
router.post("/auth/signup", async (req, res): Promise<void> => {
  const parsed = SignupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }

  const { email, name, password } = parsed.data;

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    res.status(409).json({ error: "An account with that email already exists" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({ email, name, passwordHash });

  const sessionUser: Express.User = {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
  };

  req.logIn(sessionUser, (err) => {
    if (err) {
      res.status(500).json({ error: "Login after signup failed" });
      return;
    }
    res.status(201).json(sessionUser);
  });
});

// Log in with email + password
router.post("/auth/login", (req, res, next): void => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  passport.authenticate(
    "local",
    (err: Error | null, user: Express.User | false, info: { message?: string } | undefined) => {
      if (err) return next(err);
      if (!user) {
        res.status(401).json({ error: info?.message ?? "Invalid email or password" });
        return;
      }
      req.logIn(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        res.json({ id: user.id, email: user.email, name: user.name });
      });
    },
  )(req, res, next);
});

// Get current authenticated user
router.get("/auth/me", (req, res): void => {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const u = req.user;
  res.json({ id: u.id, email: u.email, name: u.name });
});

// Log out
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
