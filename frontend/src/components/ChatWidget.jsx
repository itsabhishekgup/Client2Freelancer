import { useEffect, useRef, useState } from "react";
import { chatWithAssistant } from "../lib/liveApi";

const QUICK_REPLIES = [
  "How do I create an escrow?",
  "Why are my funds not released?",
  "How do I get a refund?",
  "How does dispute resolution work?",
];

function BotIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2.5 13.7 8l5.5 1.7-5.5 1.7L12 17l-1.7-5.6L4.8 9.7 10.3 8 12 2.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 11.5 21 3l-8.5 18-2-8-8.5-1.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatText(text) {
  return text.split("\n").map((rawLine, i) => {
    const line = rawLine.trim();
    if (!line) return <div className="chat-msg-gap" key={i} />;

    const isBullet = line.startsWith("•");
    const content = isBullet ? line.slice(1).trim() : line;
    const parts = content.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);

    const rendered = parts.map((part, j) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={j}>{part.slice(2, -2)}</strong>
      ) : (
        <span key={j}>{part}</span>
      ),
    );

    if (isBullet) {
      return (
        <div className="chat-msg-bullet" key={i}>
          <span className="chat-msg-bullet-dot" aria-hidden="true" />
          {rendered}
        </div>
      );
    }
    return (
      <div className="chat-msg-line" key={i}>
        {rendered}
      </div>
    );
  });
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, loading, open]);

  const send = async (raw) => {
    const text = (raw ?? input).trim();
    if (!text || loading) return;
    setInput("");
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);
    try {
      const res = await chatWithAssistant(text, history);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: res.answer || "I could not find an answer. Please try rephrasing your question.",
          source: res.source,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Unable to reach the support service. It looks like the backend is not running.\n\n1. Start it with: cd backend && python -m uvicorn main:app --port 8000\n2. Alternatively, open the Help Center (sidebar > Help Center) for guidance.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={`chat-fab ${open ? "chat-fab--open" : ""}`}
        aria-label={open ? "Close assistant" : "Open assistant"}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        {open ? "✕" : <BotIcon />}
      </button>

      {open && (
        <div className="chat-panel" role="dialog" aria-label="Escrow Copilot">
          <div className="chat-head">
            <span className="chat-head-avatar" aria-hidden="true">
              <BotIcon />
            </span>
            <div className="chat-head-copy">
              <strong>Escrow Copilot</strong>
              <span>Trained on the full escrow lifecycle · clear, accurate answers</span>
            </div>
            <button
              type="button"
              className="chat-head-close"
              aria-label="Close assistant"
              onClick={() => setOpen(false)}
            >
              ✕
            </button>
          </div>

          <div className="chat-body" ref={listRef}>
            {messages.length === 0 && !loading && (
              <div className="chat-welcome">
                <p>
                  Hello. I'm Escrow Copilot — trained on the full ArcBridge
                  lifecycle. Ask me about creating escrows, deposits, disputes,
                  refunds, wallet setup, or any error you run into, in English
                  or Hindi.
                </p>
                <div className="chat-quick">
                  {QUICK_REPLIES.map((q) => (
                    <button key={q} type="button" onClick={() => send(q)}>
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`chat-msg ${msg.role === "user" ? "chat-msg--user" : "chat-msg--bot"}`}>
                {msg.role === "assistant" && (
                  <span className="chat-msg-avatar" aria-hidden="true">
                    <BotIcon />
                  </span>
                )}
                <div className="chat-msg-bubble">{formatText(msg.content)}</div>
              </div>
            ))}

            {loading && (
              <div className="chat-msg chat-msg--bot">
                <span className="chat-msg-avatar" aria-hidden="true">
                  <BotIcon />
                </span>
                <div className="chat-msg-bubble chat-typing" aria-label="Assistant is typing">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
          </div>

          <div className="chat-input-row">
            <input
              type="text"
              value={input}
              placeholder="Type your question…"
              aria-label="Ask the assistant"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
              }}
            />
            <button type="button" className="chat-send" aria-label="Send" disabled={loading || !input.trim()} onClick={() => send()}>
              <SendIcon />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
