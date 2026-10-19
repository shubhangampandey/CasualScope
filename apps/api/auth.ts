import type { Request, Response, NextFunction } from "express";
import { createHash, randomBytes } from "node:crypto";
import argon2 from "argon2";
import { Store } from "../../packages/storage/index.js";
import { config } from "../../packages/shared/config.js";
export const roles = [
  "owner",
  "administrator",
  "sre",
  "investigator",
  "viewer",
] as const;
export type Role = (typeof roles)[number];
export interface User {
  id: string;
  email: string;
  name: string;
  password: string;
  memberships: { workspace: string; role: Role; environments: string[] }[];
}
export interface Session {
  id: string;
  userId: string;
  expires: number;
  csrf: string;
}
export interface Auth {
  user: User;
  session: Session;
  workspace: string;
  environment: string;
  role: Role;
}
declare global {
  namespace Express {
    interface Request {
      auth: Auth;
    }
  }
}
export const hash = (v: string) => createHash("sha256").update(v).digest("hex");
export async function seed(store: Store) {
  const id = "northstar-engineer";
  if (!(await store.get("system", "user", id))) {
    await store.put<User>("system", "user", {
      id,
      email: process.env.DEMO_EMAIL || "engineer@northstar.local",
      name: "Northstar Engineer",
      password: await argon2.hash(
        process.env.DEMO_PASSWORD || "Northstar-local-2026!",
        { type: argon2.argon2id },
      ),
      memberships: [
        { workspace: "northstar", role: "owner", environments: ["commerce"] },
      ],
    });
    await store.put("northstar", "workspace", {
      id: "northstar",
      name: "Northstar Engineering",
      environments: ["commerce"],
    });
  }
}
export function authenticated(store: Store) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies?.cs_session;
    if (!token) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const session = await store.get<Session>("system", "session", hash(token));
    if (!session || session.expires < Date.now()) {
      res.status(401).json({ error: "Session expired" });
      return;
    }
    const user = await store.get<User>("system", "user", session.userId);
    const workspace = req.get("x-workspace") || user?.memberships[0]?.workspace;
    const membership = user?.memberships.find((m) => m.workspace === workspace),
      environment = req.get("x-environment") || "commerce";
    if (
      !user ||
      !membership ||
      !membership.environments.includes(environment)
    ) {
      res.status(403).json({ error: "Workspace or environment access denied" });
      return;
    }
    req.auth = {
      user,
      session,
      workspace: workspace!,
      environment,
      role: membership.role,
    };
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (
        req.get("x-csrf-token") !== session.csrf ||
        (req.get("origin") && req.get("origin") !== config.WEB_ORIGIN)
      ) {
        res.status(403).json({ error: "CSRF verification failed" });
        return;
      }
    }
    next();
  };
}
export function permission(action: "experiment" | "write" | "admin") {
  return (req: Request, res: Response, next: NextFunction) => {
    const allowed =
      action === "admin"
        ? ["owner", "administrator"]
        : action === "experiment"
          ? ["owner", "administrator", "sre"]
          : ["owner", "administrator", "sre", "investigator"];
    if (!allowed.includes(req.auth.role)) {
      res.status(403).json({ error: "Role does not permit this action" });
      return;
    }
    next();
  };
}
export async function login(
  store: Store,
  email: string,
  password: string,
  res: Response,
) {
  const users = await store.list<User>("system", "user", 500);
  const user = users.find((u) => u.email === email);
  const valid = user
    ? await argon2.verify(user.password, password)
    : await argon2.verify(await argon2.hash("timing-padding"), password);
  if (!user || !valid) return undefined;
  const token = randomBytes(32).toString("hex"),
    session: Session = {
      id: hash(token),
      userId: user.id,
      expires: Date.now() + 8 * 3600000,
      csrf: randomBytes(24).toString("hex"),
    };
  await store.put("system", "session", session);
  res.cookie("cs_session", token, {
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 8 * 3600000,
    path: "/",
  });
  return {
    user: { name: user.name, email: user.email, memberships: user.memberships },
    csrf: session.csrf,
  };
}
