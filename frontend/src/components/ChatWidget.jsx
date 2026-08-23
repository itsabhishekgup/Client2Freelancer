import { useEffect, useRef, useState } from "react";
import { chatWithAssistant } from "../lib/liveApi";

const QUICK_REPLIES = [
  "How do I create an escrow?",
  "Why are my funds not released?",
  "How do I get a refund?",
  "How does dispute resolution work?",
  "What is CCTP?",
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

/* ---- lightweight markdown rendering ---- */

function Inline({ text }) {
  // Tokenize inline code, bold, italic in one pass (bold before italic so ** wins).
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)/g;
  const tokens = [];
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) tokens.push({ t: "text", v: text.slice(last, m.index) });
    if (m[1]) tokens.push({ t: "code", v: m[1].slice(1, -1) });
    else if (m[2]) tokens.push({ t: "bold", v: m[2].slice(2, -2) });
    else if (m[3]) tokens.push({ t: "italic", v: m[3].slice(1, -1) });
    last = m.index + m[0].length;
  }
  if (last < text.length) tokens.push({ t: "text", v: text.slice(last) });

  return tokens.map((tok, i) => {
    if (tok.t === "code") {
      return (
        <code key={i} className="chat-inline-code">
          {tok.v}
        </code>
      );
    }
    if (tok.t === "bold") return <strong key={i}>{tok.v}</strong>;
    if (tok.t === "italic") return <em key={i}>{tok.v}</em>;
    return <span key={i}>{tok.v}</span>;
  });
}

function parseLine(rawLine, key) {
  const indentMatch = rawLine.match(/^\s*/);
  const indent = indentMatch ? indentMatch[0].length : 0;
  const line = rawLine.trim();
  if (!line) return <div className="chat-msg-gap" key={key} />;

  // Horizontal rule: --- / *** / ___
  if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
    return <div className="chat-msg-hr" key={key} aria-hidden="true" />;
  }

  // Headings: # / ## / ###
  const h = line.match(/^(#{1,3})\s+(.*)/);
  if (h) {
    return (
      <div className={`chat-msg-heading chat-msg-heading--${h[1].length}`} key={key}>
        <Inline text={h[2]} />
      </div>
    );
  }

  // Bullets: - * •
  const b = line.match(/^[-*•]\s+(.*)/);
  if (b) {
    const nested = indent >= 2;
    return (
      <div className={`chat-msg-bullet${nested ? " chat-msg-bullet--nested" : ""}`} key={key}>
        <span className="chat-msg-bullet-dot" aria-hidden="true" />
        <Inline text={b[1]} />
      </div>
    );
  }

  // Numbered lists: 1. / 1)
  const n = line.match(/^(\d{1,3})[.)]\s+(.*)/);
  if (n) {
    return (
      <div className="chat-msg-num" key={key}>
        <span className="chat-msg-num-idx" aria-hidden="true">
          {n[1]}.
        </span>
        <Inline text={n[2]} />
      </div>
    );
  }

  return (
    <div className="chat-msg-line" key={key}>
      <Inline text={line} />
    </div>
  );
}

function Markdown({ text }) {
  // Split fenced code blocks (``` ... ```) from regular prose.
  const segs = String(text).split(/```/);
  const out = [];
  segs.forEach((seg, i) => {
    if (i % 2 === 1) {
      const code = seg.replace(/^[a-zA-Z0-9_+-]*\n/, "").trimEnd();
      out.push(
        <pre key={`c${i}`} className="chat-code">
          <code>{code}</code>
        </pre>,
      );
    } else {
      seg.split("\n").forEach((ln, j) => out.push(parseLine(ln, `${i}-${j}`)));
    }
  });
  return out;
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const listRef = useRef(null);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  // Instant jump to bottom when the panel opens (no animation on first paint).
  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [open]);

  // Smooth-scroll to the latest message whenever the thread grows or typing starts.
  useEffect(() => {
    if (!open) return;
    const el = endRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading, open]);

  // Layout can shift after the smooth scroll starts (chips row, badge, fonts),
  // so settle at the true bottom once the animation has finished.
  useEffect(() => {
    if (!open || loading) return;
    const t = setTimeout(() => {
      const body = listRef.current;
      if (body) {
        body.scrollTop = body.scrollHeight;
      }
    }, 320);
    return () => clearTimeout(t);
  }, [messages, open, loading]);

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

  const showChips = messages.length > 0 && !loading;

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
              <span>Clear answers, in English or Hindi</span>
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
                  Hello. I'm Escrow Copilot — trained on the full Client2Freelancer
                  lifecycle. Ask me about creating escrows, deposits, disputes,
                  refunds, wallet setup, or any error you run into, in English
                  or Hindi.
                </p>
                <div className="chat-quick">
                  {QUICK_REPLIES.slice(0, 4).map((q) => (
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
                <div className="chat-msg-bubble">
                  <Markdown text={msg.content} />
                  {msg.role === "assistant" && msg.source && (
                    <span className={`chat-msg-source chat-msg-source--${msg.source}`}>
                      {msg.source === "llm" ? "AI" : "Instant"}
                    </span>
                  )}
                </div>
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
            <div ref={endRef} />
          </div>

          {showChips && (
            <div className="chat-chips" aria-label="Suggested questions">
              {QUICK_REPLIES.map((q) => (
                <button key={q} type="button" onClick={() => send(q)}>
                  {q}
                </button>
              ))}
            </div>
          )}

          <div className="chat-input-row">
            <input
              type="text"
              value={input}
              placeholder="Type your question…"
              aria-label="Ask the assistant"
              ref={inputRef}
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
