import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes";
import { logger } from "./lib/logger";
import { passport } from "./lib/passport-config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === "production";

const app: Express = express();

// ---------------------------------------------------------------------------
// CORS — dev only (in prod the Express server serves the frontend directly)
// ---------------------------------------------------------------------------
if (!isProd) {
  const allowedOrigins = process.env.REPLIT_DEV_DOMAIN
    ? [`https://${process.env.REPLIT_DEV_DOMAIN}`, "http://localhost"]
    : ["http://localhost"];

  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
    }),
  );
}

// ---------------------------------------------------------------------------
// Request logging
// ---------------------------------------------------------------------------
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------
if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required");
}

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: isProd,
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: isProd ? "strict" : "lax",
    },
  }),
);

app.use(passport.initialize());
app.use(passport.session());

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------
app.use("/api", router);

// ---------------------------------------------------------------------------
// Serve frontend in production (React build output)
// ---------------------------------------------------------------------------
if (isProd) {
  // In Railway the CWD is the repo root, so this resolves correctly regardless
  // of where the compiled dist/index.mjs lives.
  const frontendDist =
    process.env.FRONTEND_DIST_PATH ??
    path.join(process.cwd(), "artifacts/codevault/dist/public");

  logger.info({ frontendDist }, "Serving frontend static files");

  app.use(express.static(frontendDist));

  // SPA fallback — send index.html for any non-API route (Express 5 wildcard syntax)
  app.get("/{*splat}", (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

export default app;
