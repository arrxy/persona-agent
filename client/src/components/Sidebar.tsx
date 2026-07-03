import { useEffect, useRef, useState } from "react";
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
  onDeleteConversation: (conversationId: string) => void;
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
  onDeleteConversation,
  onLogout,
}: SidebarProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userMenuOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node)
      ) {
        setUserMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [userMenuOpen]);

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
              <div
                key={conversation._id}
                className={`history-item-wrap ${activeConversationId === conversation._id ? "active" : ""}`}
              >
                <button
                  type="button"
                  className="history-item"
                  onClick={() => onSelectConversation(conversation)}
                >
                  <div className="history-text">
                    <span className="history-title">
                      {conversation.title || "New conversation"}
                    </span>
                    <span className="history-meta">
                      • {getCreatorLabel(conversation)}
                    </span>
                  </div>
                  <span className="history-time">
                    {formatRelativeTime(conversation.updatedAt)}
                  </span>
                </button>
                <button
                  type="button"
                  className="history-delete"
                  aria-label="Delete chat"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDeleteConversation(conversation._id);
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="sidebar-footer" ref={userMenuRef}>
        <button
          type="button"
          className="user-chip"
          aria-expanded={userMenuOpen}
          aria-haspopup="menu"
          onClick={() => setUserMenuOpen((open) => !open)}
        >
          <span className="user-avatar">{getInitials(user.name || "You")}</span>
          <span className="user-chip-name">{user.name || "You"}</span>
        </button>

        {userMenuOpen && (
          <div className="user-menu" role="menu">
            <div className="user-menu-header">
              <span className="user-menu-name">{user.name || "You"}</span>
              <span className="user-menu-email">{user.email}</span>
            </div>
            <button
              type="button"
              className="user-menu-item"
              role="menuitem"
              onClick={() => {
                setUserMenuOpen(false);
                onLogout();
              }}
            >
              Log out
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
