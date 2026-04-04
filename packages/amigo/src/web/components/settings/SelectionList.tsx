import type React from "react";
import type { SettingsListItem } from "./types";

interface SelectionListProps {
  items: SettingsListItem[];
  emptyState: React.ReactNode;
}

const SelectionList: React.FC<SelectionListProps> = ({ items, emptyState }) => {
  if (items.length === 0) {
    return emptyState;
  }

  return (
    <div className="space-y-1">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={item.onClick}
          className={`w-full rounded-xl px-3 py-2 text-left transition ${
            item.active
              ? "bg-slate-100 text-slate-950"
              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`}
        >
          <div className="flex items-center gap-2">
            <div className="truncate text-[13px] font-medium">{item.label}</div>
            {item.badge ? (
              <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-medium text-white">
                {item.badge}
              </span>
            ) : null}
          </div>
          {item.description ? (
            <div className="mt-0.5 truncate text-[11px] text-slate-400">{item.description}</div>
          ) : null}
        </button>
      ))}
    </div>
  );
};

export default SelectionList;
