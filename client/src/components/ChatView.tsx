import { useEffect, useRef } from "react";
import type { ChatMessage } from "../api";

interface ChatViewProps {
  personaName: string;
  messages: ChatMessage[];
  input: string;
  loading: boolean;
  error: string;
  showSources: number | null;
  onInputChange: (value: string) => void;
  onSend: (event: React.FormEvent) => void;
  onToggleSources: (index: number) => void;
}

export default function ChatView({
  personaName,
  messages,
  input,
  loading,
  error,
  showSources,
  onInputChange,
  onSend,
  onToggleSources,
}: ChatViewProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  return (
    <div className="chat-view">
      <header className="chat-topbar">
        <div>
          <p className="eyebrow">Chat</p>
          <h2>{personaName}</h2>
        </div>
      </header>

      <div className="chat-messages">
        {messages.length === 0 && (
          <p className="muted chat-empty">
            Ask {personaName} anything — opinions, comparisons, recommendations...
          </p>
        )}
        {messages.map((message, index) => (
          <div key={index} className={`message ${message.role}`}>
            <div className="message-bubble">{message.content}</div>
            {message.role === "assistant" &&
              message.sources &&
              message.sources.length > 0 && (
                <div className="message-sources">
                  <button
                    type="button"
                    className="sources-link"
                    onClick={() => onToggleSources(index)}
                  >
                    {showSources === index ? "Hide" : "Show"} sources (
                    {message.sources.length})
                  </button>
                  {showSources === index && (
                    <ul>
                      {message.sources.slice(0, 5).map((source, i) => (
                        <li key={i}>
                          {source.videoTitle && <strong>{source.videoTitle}: </strong>}
                          {source.text.slice(0, 140)}...
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
          </div>
        ))}
        {loading && (
          <div className="message assistant">
            <div className="message-bubble typing">Thinking...</div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {error && <p className="error chat-error">{error}</p>}

      <form className="chat-composer" onSubmit={onSend}>
        <input
          placeholder={`Message ${personaName}...`}
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          disabled={loading}
        />
        <button type="submit" className="btn-primary" disabled={loading || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
