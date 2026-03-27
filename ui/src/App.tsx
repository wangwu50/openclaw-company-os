import { Route, Routes } from "react-router-dom";
import { Sidebar } from "./components/Sidebar.js";
import { Hall } from "./pages/Hall.js";
import { Chat } from "./pages/Chat.js";
import { Meeting } from "./pages/Meeting.js";
import { Decisions } from "./pages/Decisions.js";
import { useHall } from "./hooks/useApi.js";

export function App() {
  const { data, loading, error, refresh } = useHall();

  if (loading) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-muted)",
          fontSize: "var(--text-sm)",
        }}
      >
        加载中…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: "var(--space-4)",
          color: "var(--accent-error)",
          fontSize: "var(--text-sm)",
        }}
      >
        <div>连接失败：{error ?? "未知错误"}</div>
        <button
          onClick={() => void refresh()}
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            color: "var(--text-secondary)",
            fontSize: "var(--text-sm)",
            padding: "var(--space-2) var(--space-4)",
            cursor: "pointer",
          }}
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      <Sidebar
        employees={data.employees}
        pendingCount={data.pending.length}
        onEmployeeChange={() => void refresh()}
      />

      <div
        style={{
          flex: 1,
          display: "flex",
          overflow: "hidden",
        }}
      >
        <Routes>
          <Route
            path="/"
            element={<Hall data={data} onRefresh={refresh} />}
          />
          <Route
            path="/chat/:employeeId"
            element={<Chat employees={data.employees} />}
          />
          <Route
            path="/meeting"
            element={<Meeting employees={data.employees} />}
          />
          <Route path="/decisions" element={<Decisions employees={data.employees} />} />
        </Routes>
      </div>
    </div>
  );
}
