import { useEffect, useState } from "react";
import type { CreatorRequestSummary, Persona } from "../api";
import {
  formatFollowers,
  getCreatorRequestStatusLabel,
  getInitials,
  getPendingPersonaAvatar,
  getPendingPersonaName,
  isActiveCreatorRequest,
} from "../utils";

interface PersonaPickerProps {
  pinnedPersonas: Persona[];
  explorePersonas: Persona[];
  pendingRequests: CreatorRequestSummary[];
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

function matchesPersonaSearch(persona: Persona, query: string): boolean {
  if (!query) return true;
  return (
    persona.name.toLowerCase().includes(query) ||
    (persona.handle?.toLowerCase().includes(query) ?? false) ||
    (persona.description?.toLowerCase().includes(query) ?? false)
  );
}

function PersonaRow({
  persona,
  onSelect,
  pinned = false,
}: {
  persona: Persona;
  onSelect: (persona: Persona) => void;
  pinned?: boolean;
}) {
  return (
    <button
      type="button"
      className={`persona-row ${pinned ? "persona-row-pinned" : ""}`}
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
  );
}

function PendingPersonaRow({ request }: { request: CreatorRequestSummary }) {
  const name = getPendingPersonaName(request);
  const avatarUrl = getPendingPersonaAvatar(request);
  const isFailed = request.status === "failed";
  const isActive = isActiveCreatorRequest(request);

  return (
    <div
      className={`persona-row persona-row-pending ${isFailed ? "persona-row-failed" : ""}`}
      aria-disabled={!isFailed}
    >
      <div className="persona-avatar-wrap">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="persona-avatar-img" />
        ) : (
          <span className="persona-avatar persona-avatar-pending">
            {getInitials(name)}
          </span>
        )}
        {isActive && <span className="persona-avatar-ring" aria-hidden />}
      </div>

      <div className="persona-info">
        <span className="persona-name">{name}</span>
        <span className="persona-desc">
          {isFailed
            ? request.error?.message ?? "Ingestion failed"
            : "Building persona from YouTube"}
        </span>
      </div>

      <span
        className={`persona-badge ${isFailed ? "persona-badge-failed" : "persona-badge-pending"}`}
      >
        {isActive && <span className="spinner" aria-hidden />}
        {getCreatorRequestStatusLabel(request.status)}
      </span>
    </div>
  );
}

export default function PersonaPicker({
  pinnedPersonas,
  explorePersonas,
  pendingRequests,
  search,
  onSearchChange,
  onSelect,
  onCreateClick,
}: PersonaPickerProps) {
  const query = search.trim().toLowerCase();
  const hasPinned = pinnedPersonas.length > 0;
  const [exploreOpen, setExploreOpen] = useState(!hasPinned);

  useEffect(() => {
    if (!hasPinned) {
      setExploreOpen(true);
    }
  }, [hasPinned]);

  const filteredPending = pendingRequests.filter((request) => {
    if (!query) return true;
    const name = getPendingPersonaName(request).toLowerCase();
    return (
      name.includes(query) ||
      request.inputChannelUrl.toLowerCase().includes(query)
    );
  });

  const filteredPinned = pinnedPersonas.filter((persona) =>
    matchesPersonaSearch(persona, query),
  );

  const filteredExplore = explorePersonas.filter((persona) =>
    matchesPersonaSearch(persona, query),
  );

  useEffect(() => {
    if (query && filteredExplore.length > 0) {
      setExploreOpen(true);
    }
  }, [query, filteredExplore.length]);

  const hasResults =
    filteredPending.length > 0 ||
    filteredPinned.length > 0 ||
    filteredExplore.length > 0;

  const showExploreToggle = explorePersonas.length > 0;

  return (
    <div className="picker-page">
      <div className="picker-header">
      <p className="eyebrow">New chat</p>
      <h1 className="picker-title">Who do you want to talk to?</h1>
      </div>

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
          {!hasResults && (
            <p className="muted persona-empty">
              No personas ready yet. Create one below.
            </p>
          )}

          {filteredPending.map((request) => (
            <PendingPersonaRow key={request._id} request={request} />
          ))}

          {filteredPinned.length > 0 && (
            <div className="persona-section">
              <p className="persona-section-label">Pinned</p>
              {filteredPinned.map((persona) => (
                <PersonaRow
                  key={persona.id}
                  persona={persona}
                  onSelect={onSelect}
                  pinned
                />
              ))}
            </div>
          )}

          {showExploreToggle && (
            <div className="persona-section">
              <button
                type="button"
                className="explore-toggle"
                onClick={() => setExploreOpen((open) => !open)}
                aria-expanded={exploreOpen}
              >
                <span>Explore more creators</span>
                <span className="explore-meta">
                  {filteredExplore.length}
                  <svg
                    className={`explore-chevron ${exploreOpen ? "open" : ""}`}
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <path
                      d="m6 9 6 6 6-6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </button>

              {exploreOpen &&
                filteredExplore.map((persona) => (
                  <PersonaRow
                    key={persona.id}
                    persona={persona}
                    onSelect={onSelect}
                  />
                ))}

              {exploreOpen && filteredExplore.length === 0 && query && (
                <p className="muted persona-empty">No matching creators</p>
              )}
            </div>
          )}
        </div>

        <button type="button" className="create-persona-link" onClick={onCreateClick}>
          + Create a new persona
        </button>
      </div>

      <p className="picker-hint">Pick a creator persona to start the conversation</p>
    </div>
  );
}
