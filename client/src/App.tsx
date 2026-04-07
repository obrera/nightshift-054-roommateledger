import { FormEvent, useEffect, useState } from "react";

type User = {
  id: string;
  email: string;
  name: string;
  createdAt: string;
};

type Chore = {
  id: string;
  title: string;
  details: string;
  assigneeId: string | null;
  assigneeName: string | null;
  dueDate: string;
  completed: boolean;
  completedAt: string | null;
  createdBy: string;
  creatorName: string;
  createdAt: string;
  overdue: boolean;
};

type Expense = {
  id: string;
  title: string;
  amount: number;
  payerId: string;
  payerName: string;
  notes: string;
  spentOn: string;
  createdAt: string;
  createdBy: string;
  creatorName: string;
  participants: User[];
};

type ShoppingItem = {
  id: string;
  title: string;
  quantity: string;
  priority: "low" | "medium" | "high";
  claimedBy: string | null;
  claimerName: string | null;
  purchased: boolean;
  purchasedAt: string | null;
  createdBy: string;
  creatorName: string;
  createdAt: string;
};

type Activity = {
  id: string;
  actorId: string;
  actorName: string;
  entityType: string;
  entityId: string;
  action: string;
  summary: string;
  createdAt: string;
};

type Settlement = {
  from: User;
  to: User;
  amount: number;
};

type DashboardPayload = {
  user: User;
  users: User[];
  chores: Chore[];
  expenses: Expense[];
  settlements: Settlement[];
  shopping: ShoppingItem[];
  activity: Activity[];
};

type AuthMode = "login" | "register";

const today = new Date().toISOString().slice(0, 10);

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    ...init
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({ error: "Request failed." }))) as {
      error?: string;
    };
    throw new Error(error.error ?? "Request failed.");
  }

  return response.json() as Promise<T>;
}

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function money(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD"
  }).format(value);
}

function SectionHeader(props: { title: string; subtitle: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-xl font-semibold text-white">{props.title}</h2>
        <p className="mt-1 text-sm text-slate-400">{props.subtitle}</p>
      </div>
      {props.action}
    </div>
  );
}

function StatCard(props: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-glow">
      <div className="text-xs uppercase tracking-[0.22em] text-slate-500">{props.label}</div>
      <div className="mt-3 text-2xl font-semibold text-white">{props.value}</div>
      <div className="mt-2 text-sm text-slate-400">{props.hint}</div>
    </div>
  );
}

export function App() {
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [authForm, setAuthForm] = useState({
    name: "",
    email: "",
    password: ""
  });

  const [choreForm, setChoreForm] = useState({
    title: "",
    details: "",
    assigneeId: "",
    dueDate: today
  });

  const [expenseForm, setExpenseForm] = useState({
    title: "",
    amount: "",
    payerId: "",
    participantIds: [] as string[],
    notes: "",
    spentOn: today
  });

  const [shoppingForm, setShoppingForm] = useState({
    title: "",
    quantity: "1",
    priority: "medium" as "low" | "medium" | "high"
  });

  async function refresh() {
    setLoading(true);
    try {
      const data = await api<DashboardPayload>("/api/bootstrap");
      setDashboard(data);
      setExpenseForm((current) => ({
        ...current,
        payerId: current.payerId || data.user.id,
        participantIds: current.participantIds.length ? current.participantIds : data.users.map((user) => user.id)
      }));
      setError(null);
    } catch {
      setDashboard(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const endpoint = authMode === "register" ? "/api/auth/register" : "/api/auth/login";
      const payload =
        authMode === "register"
          ? authForm
          : {
              email: authForm.email,
              password: authForm.password
            };
      const data = await api<DashboardPayload>(endpoint, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setDashboard(data);
      setExpenseForm((current) => ({
        ...current,
        payerId: data.user.id,
        participantIds: data.users.map((user) => user.id)
      }));
      setAuthForm({ name: "", email: "", password: "" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Authentication failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitMutation<T>(request: () => Promise<T>, onSuccess: (payload: T) => void) {
    setSubmitting(true);
    setError(null);
    try {
      const payload = await request();
      onSuccess(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-aurora px-6">
        <div className="rounded-3xl border border-white/10 bg-white/5 px-6 py-5 text-sm text-slate-300 shadow-glow">
          Loading RoommateLedger...
        </div>
      </main>
    );
  }

  if (!dashboard) {
    return (
      <main className="min-h-screen bg-aurora px-5 py-8 text-slate-100 sm:px-8 lg:px-12">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-slate-900/90 via-slate-900/80 to-slate-800/60 p-8 shadow-glow">
            <span className="inline-flex rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs uppercase tracking-[0.28em] text-accent">
              Build 054
            </span>
            <h1 className="mt-6 max-w-xl text-4xl font-semibold leading-tight text-white sm:text-5xl">
              Shared chores, expenses, and shopping without the spreadsheet drift.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">
              RoommateLedger keeps the apartment operating from a single source of truth: server-side SQLite,
              session-based authentication, live settlement guidance, and a shared activity timeline.
            </p>
            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              <StatCard label="Chores" value="Due on time" hint="Assignees, deadlines, overdue alerts." />
              <StatCard label="Expenses" value="Split cleanly" hint="Payer tracking and settlement suggestions." />
              <StatCard label="Shopping" value="Claim fast" hint="Priority-aware list with claim and purchase state." />
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-slate-950/75 p-7 shadow-glow backdrop-blur">
            <div className="flex gap-2 rounded-full border border-white/10 bg-white/5 p-1">
              {(["login", "register"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setAuthMode(mode)}
                  className={classNames(
                    "flex-1 rounded-full px-4 py-2 text-sm font-medium capitalize transition",
                    authMode === mode
                      ? "bg-white text-slate-950"
                      : "text-slate-400 hover:bg-white/5 hover:text-white"
                  )}
                >
                  {mode}
                </button>
              ))}
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleAuth}>
              {authMode === "register" ? (
                <label className="block">
                  <span className="mb-2 block text-sm text-slate-300">Display name</span>
                  <input
                    value={authForm.name}
                    onChange={(event) => setAuthForm((current) => ({ ...current, name: event.target.value }))}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white"
                    placeholder="Jordan"
                    required
                  />
                </label>
              ) : null}

              <label className="block">
                <span className="mb-2 block text-sm text-slate-300">Email</span>
                <input
                  type="email"
                  value={authForm.email}
                  onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white"
                  placeholder="roommate@example.com"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm text-slate-300">Password</span>
                <input
                  type="password"
                  value={authForm.password}
                  onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white"
                  placeholder="Minimum 8 characters"
                  required
                />
              </label>

              {error ? <p className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-rose-200">{error}</p> : null}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-2xl bg-accent px-4 py-3 font-medium text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Working..." : authMode === "register" ? "Create household account" : "Sign in"}
              </button>
            </form>
          </section>
        </div>
      </main>
    );
  }

  const openChores = dashboard.chores.filter((chore) => !chore.completed).length;
  const overdueChores = dashboard.chores.filter((chore) => chore.overdue).length;
  const unpurchasedItems = dashboard.shopping.filter((item) => !item.purchased).length;

  return (
    <main className="min-h-screen bg-aurora px-4 py-5 text-slate-100 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <header className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-6 shadow-glow backdrop-blur">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <span className="inline-flex rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-xs uppercase tracking-[0.28em] text-accent">
                RoommateLedger
              </span>
              <h1 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">Household control panel</h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
                Signed in as <span className="font-medium text-white">{dashboard.user.name}</span>. Every action below writes to
                SQLite, updates the shared view, and leaves an audit trail tied to the authenticated account.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                {dashboard.users.length} roommates in the ledger
              </div>
              <button
                type="button"
                onClick={() =>
                  submitMutation(
                    () => api<{ ok: true }>("/api/auth/logout", { method: "POST" }),
                    () => setDashboard(null)
                  )
                }
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white transition hover:bg-white/10"
              >
                Sign out
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <StatCard label="Open chores" value={String(openChores)} hint={`${overdueChores} overdue right now`} />
            <StatCard label="Shared spend" value={money(dashboard.expenses.reduce((sum, expense) => sum + expense.amount, 0))} hint="Tracked in SQLite" />
            <StatCard label="Shopping left" value={String(unpurchasedItems)} hint="Unpurchased list items" />
            <StatCard label="Timeline" value={String(dashboard.activity.length)} hint="Most recent 50 actions" />
          </div>
        </header>

        {error ? <p className="mt-5 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-rose-200">{error}</p> : null}

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
          <section className="space-y-6">
            <div className="rounded-[2rem] border border-white/10 bg-slate-950/65 p-6 shadow-glow backdrop-blur">
              <SectionHeader
                title="Chores board"
                subtitle="Assign work, track due dates, and surface overdue tasks before they become arguments."
              />

              <form
                className="mt-5 grid gap-3 md:grid-cols-[1.3fr_1fr_0.9fr_auto]"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitMutation(
                    () =>
                      api<DashboardPayload>("/api/chores", {
                        method: "POST",
                        body: JSON.stringify({
                          ...choreForm,
                          assigneeId: choreForm.assigneeId || null
                        })
                      }),
                    (payload) => {
                      setDashboard(payload);
                      setChoreForm({ title: "", details: "", assigneeId: "", dueDate: today });
                    }
                  );
                }}
              >
                <input
                  value={choreForm.title}
                  onChange={(event) => setChoreForm((current) => ({ ...current, title: event.target.value }))}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white"
                  placeholder="Take out recycling"
                  required
                />
                <select
                  value={choreForm.assigneeId}
                  onChange={(event) => setChoreForm((current) => ({ ...current, assigneeId: event.target.value }))}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white"
                >
                  <option value="">Unassigned</option>
                  {dashboard.users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={choreForm.dueDate}
                  onChange={(event) => setChoreForm((current) => ({ ...current, dueDate: event.target.value }))}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white"
                  required
                />
                <button type="submit" disabled={submitting} className="rounded-2xl bg-accent px-4 py-3 font-medium text-slate-950">
                  Add chore
                </button>
                <textarea
                  value={choreForm.details}
                  onChange={(event) => setChoreForm((current) => ({ ...current, details: event.target.value }))}
                  className="md:col-span-4 min-h-24 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white"
                  placeholder="Notes, context, or standards for done."
                />
              </form>

              <div className="mt-5 space-y-3">
                {dashboard.chores.map((chore) => (
                  <article
                    key={chore.id}
                    className={classNames(
                      "rounded-3xl border p-4 transition sm:p-5",
                      chore.completed
                        ? "border-white/10 bg-white/5"
                        : chore.overdue
                          ? "border-rose-400/30 bg-rose-500/10"
                          : "border-white/10 bg-slate-900/60"
                    )}
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-medium text-white">{chore.title}</h3>
                          {chore.overdue ? (
                            <span className="rounded-full border border-rose-300/30 bg-rose-400/10 px-2.5 py-1 text-xs uppercase tracking-[0.2em] text-rose-200">
                              Overdue
                            </span>
                          ) : null}
                          {chore.completed ? (
                            <span className="rounded-full border border-accent/25 bg-accent/10 px-2.5 py-1 text-xs uppercase tracking-[0.2em] text-accent">
                              Done
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-300">{chore.details || "No extra notes."}</p>
                        <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-400">
                          <span>Assignee: {chore.assigneeName ?? "Unassigned"}</span>
                          <span>Due {formatDate(chore.dueDate)}</span>
                          <span>Added by {chore.creatorName}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          void submitMutation(
                            () => api<DashboardPayload>(`/api/chores/${chore.id}/toggle`, { method: "PATCH" }),
                            setDashboard
                          )
                        }
                        className={classNames(
                          "rounded-2xl px-4 py-2 text-sm font-medium transition",
                          chore.completed
                            ? "border border-white/10 bg-white/5 text-white hover:bg-white/10"
                            : "bg-accentWarm text-slate-950 hover:brightness-110"
                        )}
                      >
                        {chore.completed ? "Reopen" : "Mark complete"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-slate-950/65 p-6 shadow-glow backdrop-blur">
              <SectionHeader
                title="Expenses"
                subtitle="Log who paid, who participated, and let the settlement engine suggest the cleanest payback plan."
              />

              <form
                className="mt-5 grid gap-3 lg:grid-cols-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitMutation(
                    () =>
                      api<DashboardPayload>("/api/expenses", {
                        method: "POST",
                        body: JSON.stringify({
                          ...expenseForm,
                          amount: Number(expenseForm.amount)
                        })
                      }),
                    (payload) => {
                      setDashboard(payload);
                      setExpenseForm({
                        title: "",
                        amount: "",
                        payerId: payload.user.id,
                        participantIds: payload.users.map((user) => user.id),
                        notes: "",
                        spentOn: today
                      });
                    }
                  );
                }}
              >
                <input
                  value={expenseForm.title}
                  onChange={(event) => setExpenseForm((current) => ({ ...current, title: event.target.value }))}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white"
                  placeholder="Utilities bill"
                  required
                />
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={expenseForm.amount}
                  onChange={(event) => setExpenseForm((current) => ({ ...current, amount: event.target.value }))}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white"
                  placeholder="Amount"
                  required
                />
                <select
                  value={expenseForm.payerId}
                  onChange={(event) => setExpenseForm((current) => ({ ...current, payerId: event.target.value }))}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white"
                  required
                >
                  {dashboard.users.map((user) => (
                    <option key={user.id} value={user.id}>
                      Paid by {user.name}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={expenseForm.spentOn}
                  onChange={(event) => setExpenseForm((current) => ({ ...current, spentOn: event.target.value }))}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white"
                  required
                />
                <label className="lg:col-span-2">
                  <span className="mb-2 block text-sm text-slate-300">Split with</span>
                  <div className="flex flex-wrap gap-2">
                    {dashboard.users.map((user) => {
                      const selected = expenseForm.participantIds.includes(user.id);
                      return (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() =>
                            setExpenseForm((current) => {
                              const next = selected
                                ? current.participantIds.filter((participantId) => participantId !== user.id)
                                : [...current.participantIds, user.id];
                              return {
                                ...current,
                                participantIds: next
                              };
                            })
                          }
                          className={classNames(
                            "rounded-full border px-3 py-2 text-sm transition",
                            selected
                              ? "border-accent/40 bg-accent/10 text-accent"
                              : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                          )}
                        >
                          {user.name}
                        </button>
                      );
                    })}
                  </div>
                </label>
                <textarea
                  value={expenseForm.notes}
                  onChange={(event) => setExpenseForm((current) => ({ ...current, notes: event.target.value }))}
                  className="lg:col-span-2 min-h-24 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white"
                  placeholder="Optional notes, receipt context, or reimbursement details."
                />
                <button type="submit" disabled={submitting} className="rounded-2xl bg-accent px-4 py-3 font-medium text-slate-950 lg:col-span-2">
                  Log expense
                </button>
              </form>

              <div className="mt-6 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-3">
                  {dashboard.expenses.map((expense) => (
                    <article key={expense.id} className="rounded-3xl border border-white/10 bg-white/5 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-medium text-white">{expense.title}</h3>
                          <p className="mt-1 text-sm text-slate-400">
                            {expense.payerName} paid on {formatDate(expense.spentOn)}
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold text-white">{money(expense.amount)}</div>
                          <div className="text-sm text-slate-400">{expense.participants.length} participants</div>
                        </div>
                      </div>
                      <div className="mt-3 text-sm text-slate-300">{expense.notes || "No notes provided."}</div>
                      <div className="mt-3 text-sm text-slate-400">
                        Split with {expense.participants.map((participant) => participant.name).join(", ")}
                      </div>
                    </article>
                  ))}
                </div>

                <div className="rounded-3xl border border-accent/20 bg-accent/10 p-5">
                  <h3 className="text-lg font-medium text-white">Settlement suggestions</h3>
                  <p className="mt-2 text-sm text-slate-200/85">
                    Based on equal splits across each expense participant list.
                  </p>
                  <div className="mt-4 space-y-3">
                    {dashboard.settlements.length ? (
                      dashboard.settlements.map((settlement, index) => (
                        <div key={`${settlement.from.id}-${settlement.to.id}-${index}`} className="rounded-2xl border border-white/10 bg-slate-950/45 p-4 text-sm text-slate-100">
                          <span className="font-medium text-white">{settlement.from.name}</span> should send{" "}
                          <span className="font-medium text-accent">{money(settlement.amount)}</span> to{" "}
                          <span className="font-medium text-white">{settlement.to.name}</span>.
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4 text-sm text-slate-200">
                        Everyone is currently even.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-slate-950/65 p-6 shadow-glow backdrop-blur">
              <SectionHeader
                title="Shopping list"
                subtitle="Capture urgency, let roommates claim pickups, and keep the pantry state current."
              />

              <form
                className="mt-5 grid gap-3 md:grid-cols-[1.2fr_0.8fr_0.8fr_auto]"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitMutation(
                    () =>
                      api<DashboardPayload>("/api/shopping", {
                        method: "POST",
                        body: JSON.stringify(shoppingForm)
                      }),
                    (payload) => {
                      setDashboard(payload);
                      setShoppingForm({ title: "", quantity: "1", priority: "medium" });
                    }
                  );
                }}
              >
                <input
                  value={shoppingForm.title}
                  onChange={(event) => setShoppingForm((current) => ({ ...current, title: event.target.value }))}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white"
                  placeholder="Dish soap"
                  required
                />
                <input
                  value={shoppingForm.quantity}
                  onChange={(event) => setShoppingForm((current) => ({ ...current, quantity: event.target.value }))}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white"
                  placeholder="2 bottles"
                  required
                />
                <select
                  value={shoppingForm.priority}
                  onChange={(event) =>
                    setShoppingForm((current) => ({
                      ...current,
                      priority: event.target.value as "low" | "medium" | "high"
                    }))
                  }
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white"
                >
                  <option value="high">High priority</option>
                  <option value="medium">Medium priority</option>
                  <option value="low">Low priority</option>
                </select>
                <button type="submit" disabled={submitting} className="rounded-2xl bg-accent px-4 py-3 font-medium text-slate-950">
                  Add item
                </button>
              </form>

              <div className="mt-5 grid gap-3">
                {dashboard.shopping.map((item) => (
                  <article key={item.id} className="rounded-3xl border border-white/10 bg-white/5 p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-medium text-white">{item.title}</h3>
                          <span
                            className={classNames(
                              "rounded-full px-2.5 py-1 text-xs uppercase tracking-[0.2em]",
                              item.priority === "high"
                                ? "border border-rose-300/30 bg-rose-400/10 text-rose-200"
                                : item.priority === "medium"
                                  ? "border border-amber-300/30 bg-amber-400/10 text-amber-100"
                                  : "border border-slate-300/20 bg-slate-400/10 text-slate-200"
                            )}
                          >
                            {item.priority}
                          </span>
                          {item.purchased ? (
                            <span className="rounded-full border border-accent/25 bg-accent/10 px-2.5 py-1 text-xs uppercase tracking-[0.2em] text-accent">
                              Purchased
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 text-sm text-slate-300">Quantity: {item.quantity}</p>
                        <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-400">
                          <span>Claimed by {item.claimerName ?? "Nobody yet"}</span>
                          <span>Added by {item.creatorName}</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            void submitMutation(
                              () => api<DashboardPayload>(`/api/shopping/${item.id}/claim`, { method: "PATCH" }),
                              setDashboard
                            )
                          }
                          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10"
                        >
                          {item.claimedBy ? "Release" : "Claim"}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void submitMutation(
                              () => api<DashboardPayload>(`/api/shopping/${item.id}/purchase`, { method: "PATCH" }),
                              setDashboard
                            )
                          }
                          className={classNames(
                            "rounded-2xl px-4 py-2 text-sm font-medium",
                            item.purchased ? "border border-white/10 bg-white/5 text-white" : "bg-accentWarm text-slate-950"
                          )}
                        >
                          {item.purchased ? "Reopen" : "Mark purchased"}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <aside className="space-y-6">
            <section className="rounded-[2rem] border border-white/10 bg-slate-950/65 p-6 shadow-glow backdrop-blur">
              <SectionHeader title="Roommates" subtitle="Accounts currently participating in the shared ledger." />
              <div className="mt-5 space-y-3">
                {dashboard.users.map((user) => (
                  <div key={user.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="font-medium text-white">{user.name}</div>
                    <div className="mt-1 text-sm text-slate-400">{user.email}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-slate-950/65 p-6 shadow-glow backdrop-blur">
              <SectionHeader title="Activity" subtitle="Audit timeline tied to authenticated users and server writes." />
              <div className="mt-5 space-y-3">
                {dashboard.activity.map((entry) => (
                  <article key={entry.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="text-sm font-medium text-white">{entry.actorName}</div>
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{entry.entityType}</div>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{entry.summary}</p>
                    <p className="mt-3 text-xs text-slate-500">{formatDateTime(entry.createdAt)}</p>
                  </article>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
