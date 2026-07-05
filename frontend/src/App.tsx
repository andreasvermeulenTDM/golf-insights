import { useState } from "react";
import { useAuth } from "./auth/AuthContext";
import { ChatView } from "./pages/ChatView";
import { ReportsView } from "./pages/ReportsView";

type Tab = "chat" | "reports";

export function App() {
  const { user, login, logout } = useAuth();
  const [tab, setTab] = useState<Tab>("chat");

  if (!user) {
    return (
      <div className="centered">
        <button onClick={login}>Sign in</button>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Golf Insights</h1>
        <nav>
          <button className={tab === "chat" ? "active" : ""} onClick={() => setTab("chat")}>
            Chat
          </button>
          <button
            className={tab === "reports" ? "active" : ""}
            onClick={() => setTab("reports")}
          >
            One-Pagers
          </button>
        </nav>
        <button onClick={logout}>Sign out</button>
      </header>
      <main>{tab === "chat" ? <ChatView /> : <ReportsView />}</main>
    </div>
  );
}
