import passport from "passport";
import { Strategy as GitHubStrategy, type Profile } from "passport-github2";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

function getCallbackURL(): string {
  return (
    process.env.GITHUB_CALLBACK_URL ??
    `https://${process.env.REPLIT_DEV_DOMAIN}/api/auth/github/callback`
  );
}

function registerGitHubStrategy(): void {
  const clientID = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientID || !clientSecret) {
    logger.warn(
      "GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET not set — GitHub OAuth disabled",
    );
    return;
  }

  passport.use(
    new GitHubStrategy(
      {
        clientID,
        clientSecret,
        callbackURL: getCallbackURL(),
        scope: ["repo", "user:email"],
      },
      async (
        accessToken: string,
        _refreshToken: string,
        profile: Profile,
        done: (err: Error | null, user?: Express.User | false) => void,
      ) => {
        try {
          const githubId = parseInt(profile.id, 10);
          const [existing] = await db
            .select()
            .from(usersTable)
            .where(eq(usersTable.githubId, githubId));

          if (existing) {
            const [updated] = await db
              .update(usersTable)
              .set({ accessToken, updatedAt: new Date() })
              .where(eq(usersTable.id, existing.id))
              .returning();
            return done(null, updated as Express.User);
          }

          const [created] = await db
            .insert(usersTable)
            .values({
              githubId,
              login: profile.username ?? profile.displayName ?? "user",
              name: profile.displayName ?? null,
              email: (profile.emails as any)?.[0]?.value ?? null,
              avatarUrl: (profile.photos as any)?.[0]?.value ?? "",
              accessToken,
            })
            .returning();

          return done(null, created as Express.User);
        } catch (err) {
          logger.error({ err }, "GitHub OAuth strategy error");
          return done(err as Error);
        }
      },
    ),
  );

  logger.info({ callbackURL: getCallbackURL() }, "GitHub OAuth strategy registered");
}

// Register on load — silently skips if env vars not yet configured
registerGitHubStrategy();

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, id));
    done(null, user ?? null);
  } catch (err) {
    done(err);
  }
});

export { passport };
