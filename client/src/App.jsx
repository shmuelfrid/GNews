import { useCallback, useMemo, useState } from "react";
import axios from "axios";
import clsx from "clsx";

const initialChatState = [];

function formatTimestamp(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function ApiKeyGate({ onSubmit, loading, error }) {
  const [apiKey, setApiKey] = useState("");
  const [instructions, setInstructions] = useState("");

  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit({ apiKey, instructions });
  };

  return (
    <div className="api-key-wrapper">
      <h2>Connect your OpenAI workspace</h2>
      <p>
        Enter an API key with access to GPT-4o or GPT-4o mini. Keys are never stored — they remain in browser memory for the
        duration of the session only.
      </p>
      {error ? <div className="error-banner">{error}</div> : null}
      <form onSubmit={handleSubmit}>
        <div className="form-field">
          <label htmlFor="api-key">OpenAI API key</label>
          <input
            id="api-key"
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="sk-..."
            required
            autoComplete="off"
          />
        </div>
        <div className="form-field">
          <label htmlFor="instructions">Workflow goal (optional)</label>
          <textarea
            id="instructions"
            rows={4}
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            placeholder="Describe what the agentic workflow should accomplish."
          />
        </div>
        <button type="submit" disabled={loading}>
          {loading ? "Starting..." : "Launch workspace"}
        </button>
      </form>
    </div>
  );
}

function TaskList({ tasks, activeTaskId }) {
  if (!tasks?.length) {
    return (
      <div className="empty-state">
        <p>Once a workflow starts, tasks will appear here.</p>
      </div>
    );
  }
  return (
    <div>
      {tasks.map((task) => (
        <div
          key={task.id}
          className={clsx("task-item", {
            active: task.id === activeTaskId,
            completed: task.status === "completed"
          })}
        >
          <div className="controls-row">
            <h3>{task.title}</h3>
            <span className={clsx("task-status", task.status)}>{task.status.replace(/_/g, " ")}</span>
          </div>
          <p>{task.description}</p>
          {task.outputs?.length ? (
            <details>
              <summary>Outputs</summary>
              {task.outputs.map((output, idx) => (
                <pre key={`${output.promptId}-${idx}`} style={{ whiteSpace: "pre-wrap", marginTop: "0.5rem" }}>
                  {output.content}
                </pre>
              ))}
            </details>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ChatHistory({ messages }) {
  if (!messages.length) {
    return (
      <div className="empty-state">
        <p>The conversation will appear here once the agent responds.</p>
      </div>
    );
  }
  return (
    <div className="chat-history">
      {messages.map((message, index) => (
        <div key={`${message.role}-${index}-${message.createdAt}`} className={clsx("chat-message", message.role)}>
          <div>{message.content}</div>
          <span className="timestamp">{formatTimestamp(message.createdAt)}</span>
        </div>
      ))}
    </div>
  );
}

function ChatInput({ onSend, disabled }) {
  const [draft, setDraft] = useState("");

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!draft.trim()) {
      return;
    }
    onSend(draft.trim());
    setDraft("");
  };

  return (
    <div className="chat-input">
      <form onSubmit={handleSubmit}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Share feedback, ideas, or adjustments for the agent..."
          disabled={disabled}
        />
        <button type="submit" disabled={disabled}>
          Send
        </button>
      </form>
    </div>
  );
}

export default function App() {
  const [workerId, setWorkerId] = useState(null);
  const [workerState, setWorkerState] = useState(null);
  const [messages, setMessages] = useState(initialChatState);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [initializing, setInitializing] = useState(false);

  const activeTaskId = useMemo(() => workerState?.tasks?.[workerState.currentTaskIndex]?.id, [workerState]);

  const handleStart = useCallback(
    async ({ apiKey, instructions }) => {
      setInitializing(true);
      setError("");
      try {
        const response = await axios.post("/api/session/start", { apiKey, instructions });
        setWorkerId(response.data.workerId);
        setWorkerState(response.data.state);
        const history = [...(response.data.state?.conversation ?? [])];
        if (!history.length && response.data.message) {
          history.push(response.data.message);
        }
        setMessages(history);
      } catch (err) {
        setError(err?.response?.data?.message || err.message || "Unable to start session.");
      } finally {
        setInitializing(false);
      }
    },
    []
  );

  const handleSend = useCallback(
    async (text) => {
      if (!workerId) return;
      setLoading(true);
      setError("");
      const userMessage = { role: "user", content: text, createdAt: new Date().toISOString() };
      setMessages((prev) => [...prev, userMessage]);
      try {
        const response = await axios.post(`/api/session/${workerId}/message`, { message: text });
        const updatedHistory = response.data.state?.conversation ?? [];
        setMessages(updatedHistory);
        setWorkerState(response.data.state);
      } catch (err) {
        setError(err?.response?.data?.message || err.message || "Unable to send message.");
      } finally {
        setLoading(false);
      }
    },
    [workerId]
  );

  const handleReset = useCallback(async () => {
    if (!workerId) return;
    setLoading(true);
    setError("");
    try {
      const response = await axios.post(`/api/session/${workerId}/reset`);
      setWorkerState(response.data.state);
      const history = response.data.state?.conversation ?? [];
      setMessages(history.length ? history : response.data.message ? [response.data.message] : []);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Unable to reset workflow.");
    } finally {
      setLoading(false);
    }
  }, [workerId]);

  if (!workerId) {
    return <ApiKeyGate onSubmit={handleStart} loading={initializing} error={error} />;
  }

  return (
    <div className="app-shell">
      <header>
        <h1>Agentic Workflow Studio</h1>
        <p>Create dynamic, multi-step AI workers and steer their progress in real-time.</p>
      </header>
      <main className="main-content">
        <aside className="workflow-panel">
          <div className="controls-row">
            <h2>Workflow</h2>
            <button onClick={handleReset} disabled={loading}>
              Reset
            </button>
          </div>
          <TaskList tasks={workerState?.tasks} activeTaskId={activeTaskId} />
        </aside>
        <section className="chat-panel">
          {error ? <div className="error-banner">{error}</div> : null}
          {loading ? <div className="loading-indicator">Thinking...</div> : null}
          <ChatHistory messages={messages} />
          <ChatInput onSend={handleSend} disabled={loading} />
        </section>
      </main>
    </div>
  );
}
