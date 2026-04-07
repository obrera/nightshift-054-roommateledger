import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Hono } from "hono";
import type { Context, Next } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { z } from "zod";
import { db } from "./db";

type UserRecord = {
  id: string;
  email: string;
  name: string;
  created_at: string;
};

type AppEnv = {
  Variables: {
    user: UserRecord | null;
  };
};

const app = new Hono<AppEnv>();
const SESSION_COOKIE = "roommateledger_session";
const port = Number(process.env.PORT ?? 3000);

const authSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(120)
});

const choreSchema = z.object({
  title: z.string().trim().min(2).max(120),
  details: z.string().trim().max(500).default(""),
  assigneeId: z.string().nullable(),
  dueDate: z.string().min(10).max(10)
});

const expenseSchema = z.object({
  title: z.string().trim().min(2).max(120),
  amount: z.number().positive(),
  payerId: z.string(),
  participantIds: z.array(z.string()).min(1),
  notes: z.string().trim().max(500).default(""),
  spentOn: z.string().min(10).max(10)
});

const shoppingSchema = z.object({
  title: z.string().trim().min(2).max(120),
  quantity: z.string().trim().min(1).max(60),
  priority: z.enum(["low", "medium", "high"])
});

function jsonError(c: Context, status: number, message: string) {
  return c.json({ error: message }, status);
}

function centsToAmount(cents: number) {
  return Number((cents / 100).toFixed(2));
}

function amountToCents(amount: number) {
  return Math.round(amount * 100);
}

function normalizeDate(date: string) {
  return new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function sessionCookieOptions() {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "Lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30
  };
}

function publicUser(user: UserRecord) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.created_at
  };
}

function listUsers() {
  return db
    .query(
      "SELECT id, email, name, created_at FROM users ORDER BY name COLLATE NOCASE ASC"
    )
    .all() as UserRecord[];
}

function logActivity(actorId: string, entityType: string, entityId: string, action: string, summary: string) {
  db
    .query(
      "INSERT INTO activity_logs (id, actor_id, entity_type, entity_id, action, summary) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(randomUUID(), actorId, entityType, entityId, action, summary);
}

function calculateSettlements() {
  const users = listUsers();
  const balances = new Map(users.map((user) => [user.id, 0]));
  const expenses = db
    .query(
      `SELECT e.id, e.amount_cents, e.payer_id
       FROM expenses e
       ORDER BY e.spent_on DESC, e.created_at DESC`
    )
    .all() as Array<{ id: string; amount_cents: number; payer_id: string }>;

  for (const expense of expenses) {
    const participants = db
      .query("SELECT user_id FROM expense_participants WHERE expense_id = ? ORDER BY user_id")
      .all(expense.id) as Array<{ user_id: string }>;

    if (!participants.length) {
      continue;
    }

    const share = expense.amount_cents / participants.length;
    balances.set(expense.payer_id, (balances.get(expense.payer_id) ?? 0) + expense.amount_cents);

    for (const participant of participants) {
      balances.set(participant.user_id, (balances.get(participant.user_id) ?? 0) - share);
    }
  }

  const creditors = Array.from(balances.entries())
    .filter(([, amount]) => amount > 0.5)
    .map(([userId, amount]) => ({ userId, amount }))
    .sort((a, b) => b.amount - a.amount);

  const debtors = Array.from(balances.entries())
    .filter(([, amount]) => amount < -0.5)
    .map(([userId, amount]) => ({ userId, amount: Math.abs(amount) }))
    .sort((a, b) => b.amount - a.amount);

  const userMap = new Map(users.map((user) => [user.id, publicUser(user)]));
  const suggestions: Array<{ from: ReturnType<typeof publicUser>; to: ReturnType<typeof publicUser>; amount: number }> = [];

  let creditorIndex = 0;
  let debtorIndex = 0;

  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];
    const settled = Math.min(creditor.amount, debtor.amount);

    if (settled > 0.5) {
      suggestions.push({
        from: userMap.get(debtor.userId)!,
        to: userMap.get(creditor.userId)!,
        amount: centsToAmount(Math.round(settled))
      });
    }

    creditor.amount -= settled;
    debtor.amount -= settled;

    if (creditor.amount <= 0.5) {
      creditorIndex += 1;
    }

    if (debtor.amount <= 0.5) {
      debtorIndex += 1;
    }
  }

  return suggestions;
}

function getDashboardData() {
  const users = listUsers();

  const chores = db
    .query(
      `SELECT c.*, u.name AS assignee_name, creator.name AS creator_name
       FROM chores c
       LEFT JOIN users u ON u.id = c.assignee_id
       JOIN users creator ON creator.id = c.created_by
       ORDER BY c.completed ASC, c.due_date ASC, c.created_at DESC`
    )
    .all() as Array<
      Database.Row & {
        assignee_name: string | null;
        creator_name: string;
      }
    >;

  const expenses = db
    .query(
      `SELECT e.*, payer.name AS payer_name, creator.name AS creator_name
       FROM expenses e
       JOIN users payer ON payer.id = e.payer_id
       JOIN users creator ON creator.id = e.created_by
       ORDER BY e.spent_on DESC, e.created_at DESC`
    )
    .all() as Array<
      Database.Row & {
        payer_name: string;
        creator_name: string;
      }
    >;

  const expensesWithParticipants = expenses.map((expense) => {
    const participants = db
      .query(
        `SELECT u.id, u.email, u.name, u.created_at
         FROM expense_participants ep
         JOIN users u ON u.id = ep.user_id
         WHERE ep.expense_id = ?
         ORDER BY u.name COLLATE NOCASE ASC`
      )
      .all(expense.id) as UserRecord[];

    return {
      id: String(expense.id),
      title: String(expense.title),
      amount: centsToAmount(Number(expense.amount_cents)),
      payerId: String(expense.payer_id),
      payerName: expense.payer_name,
      notes: String(expense.notes),
      spentOn: String(expense.spent_on),
      createdAt: String(expense.created_at),
      createdBy: String(expense.created_by),
      creatorName: expense.creator_name,
      participants: participants.map(publicUser)
    };
  });

  const shopping = db
    .query(
      `SELECT s.*, claimer.name AS claimer_name, creator.name AS creator_name
       FROM shopping_items s
       LEFT JOIN users claimer ON claimer.id = s.claimed_by
       JOIN users creator ON creator.id = s.created_by
       ORDER BY s.purchased ASC,
                CASE s.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
                s.created_at DESC`
    )
    .all() as Array<
      Database.Row & {
        claimer_name: string | null;
        creator_name: string;
      }
    >;

  const activity = db
    .query(
      `SELECT a.*, u.name AS actor_name
       FROM activity_logs a
       JOIN users u ON u.id = a.actor_id
       ORDER BY a.created_at DESC
       LIMIT 50`
    )
    .all() as Array<Database.Row & { actor_name: string }>;

  return {
    users: users.map(publicUser),
    chores: chores.map((chore) => ({
      id: String(chore.id),
      title: String(chore.title),
      details: String(chore.details),
      assigneeId: chore.assignee_id ? String(chore.assignee_id) : null,
      assigneeName: chore.assignee_name,
      dueDate: String(chore.due_date),
      completed: Boolean(chore.completed),
      completedAt: chore.completed_at ? String(chore.completed_at) : null,
      createdBy: String(chore.created_by),
      creatorName: chore.creator_name,
      createdAt: String(chore.created_at),
      overdue: !Boolean(chore.completed) && String(chore.due_date) < todayIso()
    })),
    expenses: expensesWithParticipants,
    settlements: calculateSettlements(),
    shopping: shopping.map((item) => ({
      id: String(item.id),
      title: String(item.title),
      quantity: String(item.quantity),
      priority: String(item.priority),
      claimedBy: item.claimed_by ? String(item.claimed_by) : null,
      claimerName: item.claimer_name,
      purchased: Boolean(item.purchased),
      purchasedAt: item.purchased_at ? String(item.purchased_at) : null,
      createdBy: String(item.created_by),
      creatorName: item.creator_name,
      createdAt: String(item.created_at)
    })),
    activity: activity.map((entry) => ({
      id: String(entry.id),
      actorId: String(entry.actor_id),
      actorName: entry.actor_name,
      entityType: String(entry.entity_type),
      entityId: String(entry.entity_id),
      action: String(entry.action),
      summary: String(entry.summary),
      createdAt: String(entry.created_at)
    }))
  };
}

app.use("/api/*", async (c, next: Next) => {
  const sessionId = getCookie(c, SESSION_COOKIE);

  if (!sessionId) {
    c.set("user", null);
    return next();
  }

  const session = db
    .query(
      `SELECT s.id, s.expires_at, u.id AS user_id, u.email, u.name, u.created_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`
    )
    .get(sessionId) as
    | (Database.Row & {
        user_id: string;
      })
    | null;

  if (!session || String(session.expires_at) < new Date().toISOString()) {
    db.query("DELETE FROM sessions WHERE id = ?").run(sessionId);
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    c.set("user", null);
    return next();
  }

  c.set("user", {
    id: String(session.user_id),
    email: String(session.email),
    name: String(session.name),
    created_at: String(session.created_at)
  });

  await next();
});

async function requireAuth(c: Context<AppEnv>, next: Next) {
  if (!c.get("user")) {
    return jsonError(c, 401, "Authentication required.");
  }

  await next();
}

app.post("/api/auth/register", async (c) => {
  const parsed = authSchema.extend({ name: z.string().trim().min(2).max(80) }).safeParse(await c.req.json());

  if (!parsed.success) {
    return jsonError(c, 400, "Invalid registration payload.");
  }

  const existing = db.query("SELECT id FROM users WHERE email = ?").get(parsed.data.email);
  if (existing) {
    return jsonError(c, 409, "An account with that email already exists.");
  }

  const userId = randomUUID();
  const sessionId = randomUUID();
  const passwordHash = await Bun.password.hash(parsed.data.password);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();

  db.query("INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)").run(
    userId,
    parsed.data.email,
    parsed.data.name,
    passwordHash
  );
  db.query("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").run(
    sessionId,
    userId,
    expiresAt
  );
  logActivity(userId, "auth", userId, "register", `${parsed.data.name} joined RoommateLedger.`);

  setCookie(c, SESSION_COOKIE, sessionId, sessionCookieOptions());

  return c.json({
    user: publicUser({
      id: userId,
      email: parsed.data.email,
      name: parsed.data.name,
      created_at: new Date().toISOString()
    }),
    ...getDashboardData()
  });
});

app.post("/api/auth/login", async (c) => {
  const parsed = authSchema.safeParse(await c.req.json());

  if (!parsed.success) {
    return jsonError(c, 400, "Invalid login payload.");
  }

  const user = db
    .query("SELECT id, email, name, password_hash, created_at FROM users WHERE email = ?")
    .get(parsed.data.email) as (UserRecord & { password_hash: string }) | null;

  if (!user || !(await Bun.password.verify(parsed.data.password, user.password_hash))) {
    return jsonError(c, 401, "Invalid email or password.");
  }

  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();

  db.query("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").run(
    sessionId,
    user.id,
    expiresAt
  );
  logActivity(user.id, "auth", user.id, "login", `${user.name} signed in.`);

  setCookie(c, SESSION_COOKIE, sessionId, sessionCookieOptions());
  return c.json({
    user: publicUser(user),
    ...getDashboardData()
  });
});

app.post("/api/auth/logout", requireAuth, (c) => {
  const user = c.get("user")!;
  const sessionId = getCookie(c, SESSION_COOKIE);
  if (sessionId) {
    db.query("DELETE FROM sessions WHERE id = ?").run(sessionId);
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  logActivity(user.id, "auth", user.id, "logout", `${user.name} signed out.`);
  return c.json({ ok: true });
});

app.get("/api/bootstrap", requireAuth, (c) => {
  return c.json({
    user: publicUser(c.get("user")!),
    ...getDashboardData()
  });
});

app.post("/api/chores", requireAuth, async (c) => {
  const parsed = choreSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return jsonError(c, 400, "Invalid chore payload.");
  }

  const user = c.get("user")!;
  const id = randomUUID();
  db.query(
    "INSERT INTO chores (id, title, details, assignee_id, due_date, created_by) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, parsed.data.title, parsed.data.details, parsed.data.assigneeId, normalizeDate(parsed.data.dueDate), user.id);
  logActivity(user.id, "chore", id, "create", `Created chore "${parsed.data.title}".`);
  return c.json(getDashboardData());
});

app.patch("/api/chores/:id/toggle", requireAuth, (c) => {
  const user = c.get("user")!;
  const existing = db.query("SELECT id, title, completed FROM chores WHERE id = ?").get(c.req.param("id")) as
    | Database.Row
    | null;

  if (!existing) {
    return jsonError(c, 404, "Chore not found.");
  }

  const nextCompleted = Number(existing.completed) ? 0 : 1;
  db.query(
    "UPDATE chores SET completed = ?, completed_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(nextCompleted, nextCompleted ? new Date().toISOString() : null, c.req.param("id"));
  logActivity(
    user.id,
    "chore",
    c.req.param("id"),
    nextCompleted ? "complete" : "reopen",
    `${nextCompleted ? "Completed" : "Reopened"} chore "${String(existing.title)}".`
  );
  return c.json(getDashboardData());
});

app.patch("/api/chores/:id", requireAuth, async (c) => {
  const parsed = choreSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return jsonError(c, 400, "Invalid chore payload.");
  }

  const user = c.get("user")!;
  const updated = db.query(
    "UPDATE chores SET title = ?, details = ?, assignee_id = ?, due_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(
    parsed.data.title,
    parsed.data.details,
    parsed.data.assigneeId,
    normalizeDate(parsed.data.dueDate),
    c.req.param("id")
  );
  if (!updated.changes) {
    return jsonError(c, 404, "Chore not found.");
  }
  logActivity(user.id, "chore", c.req.param("id"), "update", `Updated chore "${parsed.data.title}".`);
  return c.json(getDashboardData());
});

app.post("/api/expenses", requireAuth, async (c) => {
  const parsed = expenseSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return jsonError(c, 400, "Invalid expense payload.");
  }

  const user = c.get("user")!;
  const id = randomUUID();
  const amountCents = amountToCents(parsed.data.amount);
  db.transaction(() => {
    db.query(
      "INSERT INTO expenses (id, title, amount_cents, payer_id, notes, spent_on, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(
      id,
      parsed.data.title,
      amountCents,
      parsed.data.payerId,
      parsed.data.notes,
      normalizeDate(parsed.data.spentOn),
      user.id
    );

    const insertParticipant = db.query(
      "INSERT INTO expense_participants (expense_id, user_id) VALUES (?, ?)"
    );
    for (const participantId of Array.from(new Set(parsed.data.participantIds))) {
      insertParticipant.run(id, participantId);
    }
  })();
  logActivity(user.id, "expense", id, "create", `Logged expense "${parsed.data.title}" for $${parsed.data.amount.toFixed(2)}.`);
  return c.json(getDashboardData());
});

app.post("/api/shopping", requireAuth, async (c) => {
  const parsed = shoppingSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return jsonError(c, 400, "Invalid shopping item payload.");
  }

  const user = c.get("user")!;
  const id = randomUUID();
  db.query(
    "INSERT INTO shopping_items (id, title, quantity, priority, created_by) VALUES (?, ?, ?, ?, ?)"
  ).run(id, parsed.data.title, parsed.data.quantity, parsed.data.priority, user.id);
  logActivity(user.id, "shopping", id, "create", `Added shopping item "${parsed.data.title}".`);
  return c.json(getDashboardData());
});

app.patch("/api/shopping/:id/claim", requireAuth, (c) => {
  const user = c.get("user")!;
  const item = db.query("SELECT id, title, claimed_by FROM shopping_items WHERE id = ?").get(c.req.param("id")) as
    | Database.Row
    | null;
  if (!item) {
    return jsonError(c, 404, "Shopping item not found.");
  }

  const nextClaimedBy = item.claimed_by ? null : user.id;
  db.query("UPDATE shopping_items SET claimed_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(
    nextClaimedBy,
    c.req.param("id")
  );
  logActivity(
    user.id,
    "shopping",
    c.req.param("id"),
    nextClaimedBy ? "claim" : "unclaim",
    `${nextClaimedBy ? "Claimed" : "Released"} shopping item "${String(item.title)}".`
  );
  return c.json(getDashboardData());
});

app.patch("/api/shopping/:id/purchase", requireAuth, (c) => {
  const user = c.get("user")!;
  const item = db.query("SELECT id, title, purchased FROM shopping_items WHERE id = ?").get(c.req.param("id")) as
    | Database.Row
    | null;
  if (!item) {
    return jsonError(c, 404, "Shopping item not found.");
  }

  const nextPurchased = Number(item.purchased) ? 0 : 1;
  db.query(
    "UPDATE shopping_items SET purchased = ?, purchased_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(nextPurchased, nextPurchased ? new Date().toISOString() : null, c.req.param("id"));
  logActivity(
    user.id,
    "shopping",
    c.req.param("id"),
    nextPurchased ? "purchase" : "reopen",
    `${nextPurchased ? "Marked" : "Reopened"} shopping item "${String(item.title)}".`
  );
  return c.json(getDashboardData());
});

app.get("/api/health", (c) => c.json({ ok: true }));

const clientDist = resolve(process.cwd(), "dist", "client");
const clientIndex = resolve(clientDist, "index.html");

app.get("*", async (c) => {
  const pathname = c.req.path === "/" ? "/index.html" : c.req.path;
  const requested = resolve(clientDist, `.${pathname}`);

  if (existsSync(requested) && !requested.endsWith("/")) {
    return new Response(Bun.file(requested));
  }

  if (existsSync(clientIndex)) {
    return new Response(await readFile(clientIndex), {
      headers: {
        "Content-Type": "text/html; charset=utf-8"
      }
    });
  }

  return c.text("Client build not found. Run `bun run build` first.", 503);
});

export default {
  port,
  fetch: app.fetch
};

console.log(`RoommateLedger server listening on http://localhost:${port}`);
