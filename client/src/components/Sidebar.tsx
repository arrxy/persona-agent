import type { ConversationSummary, User } from "../api";
import { formatRelativeTime, getInitials } from "../utils";

interface SidebarProps {
  user: User;
  historySearch: string;
  conversations: ConversationSummary[];
  activeConversationId?: string;
  onHistorySearchChange: (value: string) => void;
  onNewChat: () => void;
  onSelectConversation: (conversation: ConversationSummary) => void;
  onLogout: () => void;
}

function getCreatorLabel(conversation: ConversationSummary): string {
  const creator = conversation.creatorId;
  if (creator && typeof creator !== "string") {
    return creator.name;
  }
  return "Persona";
}

export default function Sidebar({
  user,
  historySearch,
  conversations,
  activeConversationId,
  onHistorySearchChange,
  onNewChat,
  onSelectConversation,
  onLogout,
}: SidebarProps) {
  const filtered = conversations.filter((conversation) => {
    if (!historySearch.trim()) return true;
    const query = historySearch.toLowerCase();
    const title = (conversation.title ?? "").toLowerCase();
    const creator = getCreatorLabel(conversation).toLowerCase();
    return title.includes(query) || creator.includes(query);
  });

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="brand">
          <div className="brand-icon" aria-hidden>
            <span className="play-icon" />
          </div>
          <span className="brand-name">Persona</span>
        </div>

        <button type="button" className="btn-primary btn-new-chat" onClick={onNewChat}>
          + New chat
        </button>

        <div className="search-field">
          <input
            placeholder="Search chats"
            value={historySearch}
            onChange={(e) => onHistorySearchChange(e.target.value)}
          />
        </div>

        <div className="history-section">
          <p className="section-label">History</p>
          <div className="history-list">
            {filtered.length === 0 && (
              <p className="muted history-empty">No chats yet</p>
            )}
            {filtered.map((conversation) => (
              <button
                key={conversation._id}
                type="button"
                className={`history-item ${activeConversationId === conversation._id ? "active" : ""}`}
                onClick={() => onSelectConversation(conversation)}
              >
                <div className="history-text">
                  <span className="history-title">
                    {conversation.title || "New conversation"}
                  </span>
                  <span className="history-meta">• {getCreatorLabel(conversation)}</span>
                </div>
                <span className="history-time">
                  {formatRelativeTime(conversation.updatedAt)}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="sidebar-footer">
        <button type="button" className="user-chip" onClick={onLogout}>
          <span className="user-avatar">{getInitials(user.name || "You")}</span>
          <span>{user.name || "You"}</span>
        </button>
      </div>
    </aside>
  );
}
