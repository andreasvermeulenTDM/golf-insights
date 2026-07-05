import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { sendChatMessage, type Citation } from "../api/apiClient";

interface Message {
  role: "user" | "assistant";
  text: string;
  citations?: Citation[];
}

export function ChatView() {
  const { idToken } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!input.trim() || !idToken) return;
    const userMessage: Message = { role: "user", text: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setSending(true);
    setError(null);
    try {
      const res = await sendChatMessage(idToken, userMessage.text, sessionId);
      setSessionId(res.sessionId);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: res.answer, citations: res.citations },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="chat-view">
      <div className="message-list">
        {messages.map((m, i) => (
          <div key={i} className={`message message-${m.role}`}>
            <p>{m.text}</p>
            {m.citations && m.citations.length > 0 && (
              <details>
                <summary>Sources ({m.citations.length})</summary>
                <ul>
                  {m.citations.map((c, ci) => (
                    <li key={ci}>{c.text?.slice(0, 200) ?? "(no excerpt)"}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ))}
        {sending && <div className="message message-assistant">Thinking...</div>}
      </div>
      {error && <p className="error">{error}</p>}
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about the golf knowledge base..."
          disabled={sending}
        />
        <button type="submit" disabled={sending || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
