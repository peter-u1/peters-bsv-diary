import type { Entry } from "../types/Entry";

type SidebarProps = {
  entries: Entry[];
  selectedId: string | null;
  onSelect: (entry: Entry) => void;
  onNew: () => void;
};

function Sidebar({ entries, selectedId, onSelect, onNew }: SidebarProps) {
  return (
    <aside className="sidebar">
      <button
        type="button"
        className={`new-entry ${selectedId === null ? "active" : ""}`}
        onClick={onNew}
      >
        + Neuer Eintrag
      </button>

      {entries.length === 0 && (
        <p className="empty">Noch keine Einträge.</p>
      )}

      <ul>
        {entries.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              className={selectedId === entry.id ? "active" : ""}
              onClick={() => onSelect(entry)}
            >
              <span className="entry-head">
                <strong>{entry.createdAt}</strong>
                {entry.synced ? (
                  <span className="badge synced" title="Auf BSV gespeichert">
                    ✓ BSV
                  </span>
                ) : (
                  <span className="badge pending" title="Nur lokal gespeichert">
                    ● lokal
                  </span>
                )}
              </span>
              <span className="entry-preview">
                {entry.photo && "📷 "}
                {entry.text}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export default Sidebar;
