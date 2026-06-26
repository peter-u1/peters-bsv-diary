import type { Entry } from "../types/Entry";

type SidebarProps = {
  entries: Entry[];
  selectedEntry: Entry | null;
  onSelect: (entry: Entry) => void;
};

function Sidebar({ entries, selectedEntry, onSelect }: SidebarProps) {
  return (
    <div
      style={{
        width: 450,
        minWidth: 450,
        borderRight: "1px solid #ccc",
        padding: 20,
      }}
    >
      <button>+ Neuer Eintrag</button>

      <h2>Einträge</h2>

      {entries.map((entry) => (
        <div
          key={entry.id}
          onClick={() => onSelect(entry)}
          style={{
            borderBottom: "1px solid #ddd",
            padding: "10px 0",
            cursor: "pointer",
            backgroundColor:
              selectedEntry?.id === entry.id ? "#eee" : "transparent",
          }}
        >
          <strong>{entry.createdAt}</strong>
          <br />
          {entry.text.substring(0, 80)}
          {entry.text.length > 80 ? "..." : ""}
        </div>
      ))}
    </div>
  );
}

export default Sidebar;