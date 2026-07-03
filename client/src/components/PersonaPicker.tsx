import type { Persona } from "../api";
import { formatFollowers, getInitials } from "../utils";

interface PersonaPickerProps {
  personas: Persona[];
  search: string;
  onSearchChange: (value: string) => void;
  onSelect: (persona: Persona) => void;
  onCreateClick: () => void;
}

function personaDescription(persona: Persona): string {
  if (persona.description?.trim()) {
    return persona.description.trim().slice(0, 72);
  }
  if (persona.handle) return `@${persona.handle}`;
  return "YouTube creator persona";
}

export default function PersonaPicker({
  personas,
  search,
  onSearchChange,
  onSelect,
  onCreateClick,
}: PersonaPickerProps) {
  const filtered = personas.filter((persona) => {
    if (!search.trim()) return true;
    const query = search.toLowerCase();
    return (
      persona.name.toLowerCase().includes(query) ||
      persona.handle?.toLowerCase().includes(query) ||
      persona.description?.toLowerCase().includes(query)
    );
  });

  return (
    <div className="picker-page">
      <p className="eyebrow">New chat</p>
      <h1 className="picker-title">Who do you want to talk to?</h1>

      <div className="picker-card">
        <div className="picker-toolbar">
          <div className="search-field search-field-inline">
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
              <path
                d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Zm6.25-1.35 4.2 4.2"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <input
              placeholder="Search personas"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn-icon"
            aria-label="Create persona"
            onClick={onCreateClick}
          >
            +
          </button>
        </div>

        <div className="persona-list">
          {filtered.length === 0 && (
            <p className="muted persona-empty">
              No personas ready yet. Create one below.
            </p>
          )}
          {filtered.map((persona) => (
            <button
              key={persona.id}
              type="button"
              className="persona-row"
              onClick={() => onSelect(persona)}
            >
              {persona.avatarUrl ? (
                <img src={persona.avatarUrl} alt="" className="persona-avatar-img" />
              ) : (
                <span className="persona-avatar">{getInitials(persona.name)}</span>
              )}
              <div className="persona-info">
                <span className="persona-name">{persona.name}</span>
                <span className="persona-desc">{personaDescription(persona)}</span>
              </div>
              {persona.subscriberCount != null && (
                <span className="persona-stats">
                  {formatFollowers(persona.subscriberCount)}
                </span>
              )}
            </button>
          ))}
        </div>

        <button type="button" className="create-persona-link" onClick={onCreateClick}>
          + Create a new persona
        </button>
      </div>

      <p className="picker-hint">Pick a creator persona to start the conversation</p>
    </div>
  );
}
