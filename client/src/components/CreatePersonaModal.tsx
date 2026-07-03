interface CreatePersonaModalProps {
  open: boolean;
  channelUrl: string;
  loading: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
}

export default function CreatePersonaModal({
  open,
  channelUrl,
  loading,
  onChange,
  onClose,
  onSubmit,
}: CreatePersonaModalProps) {
  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Create a new persona</h2>
        <p className="muted">
          Paste a YouTube channel URL. Ingestion runs in the background.
        </p>
        <form onSubmit={onSubmit}>
          <input
            autoFocus
            placeholder="https://www.youtube.com/@channel"
            value={channelUrl}
            onChange={(e) => onChange(e.target.value)}
          />
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Submitting..." : "Create persona"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
