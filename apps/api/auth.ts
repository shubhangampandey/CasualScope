import type { Request, Response, NextFunction } from "express";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import argon2 from "argon2";
import { Store } from "../../packages/storage/index.js";
import { config, isWebOrigin } from "../../packages/shared/config.js";
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
export function authenticated(store: Store, optional = false) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies?.cs_session;
    if (!token) {
      res
        .status(optional ? 200 : 401)
        .json(optional ? null : { error: "Authentication required" });
      return;
    }
    const session = await store.get<Session>("system", "session", hash(token));
    if (!session || session.expires < Date.now()) {
      res
        .status(optional ? 200 : 401)
        .json(optional ? null : { error: "Session expired" });
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
        (req.get("origin") && !isWebOrigin(req.get("origin")))
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
  const user = await store.userByEmail<User>(email);
  const dummy =
    "$argon2id$v=19$m=65536,t=3,p=4$YWdlbnRmZW5jZWR1bW15MQ$VJx52Vr26KxLUEYGwN/N5IR4dp/Kg/POJ6VKJNrDj0k";
  const valid = await argon2
    .verify(user?.password ?? dummy, password)
    .catch(() => false);
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
export async function register(
  store: Store,
  name: string,
  email: string,
  password: string,
  res: Response,
) {
  const normalizedEmail = email.trim().toLowerCase();
  const conflict = () =>
    Object.assign(
      new Error("An account already exists for this email. Sign in instead."),
      { status: 409 },
    );
  if (await store.userByEmail(normalizedEmail)) throw conflict();
  const workspace = randomUUID();
  const user: User = {
    id: `account-${hash(normalizedEmail)}`,
    name,
    email: normalizedEmail,
    password: await argon2.hash(password, { type: argon2.argon2id }),
    memberships: [{ workspace, role: "owner", environments: ["commerce"] }],
  };
  try {
    await store.createAccount(user, {
      id: workspace,
      name: `${name}'s workspace`,
      environments: ["commerce"],
    });
  } catch (error) {
    const code = error as { code?: string; errcode?: number };
    if (code.code === "P2002" || code.errcode === 1555 || code.errcode === 2067)
      throw conflict();
    throw error;
  }
  return login(store, normalizedEmail, password, res);
}
