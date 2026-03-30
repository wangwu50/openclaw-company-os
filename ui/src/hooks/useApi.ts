import { useCallback, useEffect, useState } from "react";
import type { ActivityEvent, Decision, EmployeeReport, HallData } from "../types.js";

const BASE = "/company/api";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: res.statusText }))) as {
      error: string;
    };
    throw new Error(err.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export function useHall(refreshMs = 10_000) {
  const [data, setData] = useState<HallData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const hall = await fetchJson<HallData>(`${BASE}/hall`);
      setData(hall);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), refreshMs);
    return () => clearInterval(id);
  }, [refresh, refreshMs]);

  return { data, loading, error, refresh };
}

export function useDecisions() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [goalFilter, setGoalFilter] = useState("");

  const search = useCallback(async (q: string, employee: string, status: string, goal: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (employee) params.set("employee", employee);
      if (status) params.set("status", status);
      if (goal) params.set("goalId", goal);
      const qs = params.toString();
      const res = await fetchJson<{ decisions: Decision[] }>(`${BASE}/decisions${qs ? `?${qs}` : ""}`);
      setDecisions(res.decisions);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void search(query, employeeFilter, statusFilter, goalFilter);
  }, [query, employeeFilter, statusFilter, goalFilter, search]);

  return { decisions, loading, error, query, setQuery, employeeFilter, setEmployeeFilter, statusFilter, setStatusFilter, goalFilter, setGoalFilter };
}

export function useDecisionStats(goalId?: number) {
  const [stats, setStats] = useState<Record<string, number>>({});

  useEffect(() => {
    const qs = goalId ? `?goalId=${goalId}` : "";
    void fetchJson<{ stats: Record<string, number> }>(`${BASE}/decisions/stats${qs}`)
      .then((res) => setStats(res.stats))
      .catch(() => void 0);
  }, [goalId]);

  return stats;
}

export async function sendDecision(body: {
  pendingId?: number;
  employeeId: string;
  summary: string;
  choice: string;
  context?: string;
  goalId?: number;
}): Promise<void> {
  await fetchJson(`${BASE}/decisions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function chatWithEmployee(
  employeeId: string,
  message: string,
  goalId?: number,
): Promise<string> {
  const res = await fetchJson<{ reply: string }>(
    `${BASE}/chat/${employeeId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, goalId }),
    },
  );
  return res.reply;
}

/**
 * Streaming chat: calls the SSE endpoint, invokes onChunk for each partial token,
 * and resolves with the full concatenated text when done.
 */
export async function streamChatWithEmployee(
  employeeId: string,
  message: string,
  onChunk: (text: string) => void,
  goalId?: number,
): Promise<string> {
  const res = await fetch(`${BASE}/chat/${employeeId}/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, goalId }),
  });

  if (!res.ok || !res.body) {
    const err = (await res.json().catch(() => ({ error: res.statusText }))) as { error: string };
    throw new Error(err.error ?? res.statusText);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  let buf = "";
  let currentEvent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    // Parse SSE messages (blank line = end of message)
    const messages = buf.split("\n\n");
    buf = messages.pop() ?? "";

    for (const msg of messages) {
      const lines = msg.split("\n");
      currentEvent = "";
      let dataLine = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) currentEvent = line.slice(7).trim();
        else if (line.startsWith("data: ")) dataLine = line.slice(6);
      }
      if (!dataLine) continue;
      if (currentEvent === "error") {
        try { throw new Error(JSON.parse(dataLine) as string); } catch { throw new Error(dataLine); }
      }
      if (currentEvent === "chunk") {
        try {
          const text = JSON.parse(dataLine) as string;
          if (text) { full += text; onChunk(text); }
        } catch { /* skip */ }
      }
    }
  }

  return full;
}

export async function setGoal(body: {
  title: string;
  description?: string;
  quarter?: string;
}): Promise<void> {
  await fetchJson(`${BASE}/goals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function updateGoal(
  id: number,
  patch: { title?: string; description?: string; quarter?: string },
): Promise<void> {
  await fetchJson(`${BASE}/goals/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export async function deleteGoal(id: number): Promise<void> {
  await fetchJson(`${BASE}/goals/${id}`, { method: "DELETE" });
}

export async function reDecomposeGoal(id: number): Promise<void> {
  await fetchJson(`${BASE}/goals/${id}/decompose`, { method: "POST" });
}

export async function updateTask(
  id: number,
  fields: { status?: "pending" | "in_progress" | "done"; deadline?: string | null; priority?: string; extraGoalIds?: number[] | null },
): Promise<void> {
  await fetchJson(`${BASE}/tasks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
}

export async function generateEmployee(description: string): Promise<import("../types.js").Employee> {
  const res = await fetchJson<{ employee: import("../types.js").Employee }>(`${BASE}/employees/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description }),
  });
  return res.employee;
}

export async function createEmployee(emp: import("../types.js").Employee): Promise<void> {
  await fetchJson(`${BASE}/employees`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(emp),
  });
}

export async function deleteEmployee(id: string): Promise<void> {
  await fetchJson(`${BASE}/employees/${id}`, { method: "DELETE" });
}

export async function fetchReports(days: number, goalId?: number): Promise<EmployeeReport[]> {
  const params = new URLSearchParams({ days: String(days) });
  if (goalId !== undefined) params.set("goalId", String(goalId));
  const res = await fetchJson<{ reports: EmployeeReport[] }>(`${BASE}/reports?${params.toString()}`);
  return res.reports;
}

export function useActivity(refreshMs = 5_000, goalId?: number) {
  const [activity, setActivity] = useState<ActivityEvent[]>([]);

  const refresh = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ limit: "60" });
      if (goalId !== undefined) qs.set("goalId", String(goalId));
      const res = await fetchJson<{ activity: ActivityEvent[] }>(`${BASE}/activity?${qs.toString()}`);
      setActivity(res.activity);
    } catch {
      // silent
    }
  }, [goalId]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), refreshMs);
    return () => clearInterval(id);
  }, [refresh, refreshMs]);

  return activity;
}
