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
    <div className="space-y-0.5">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={item.onClick}
          className={`w-full rounded-sm px-3 py-2 text-left transition border border-transparent ${
            item.active
              ? "bg-white shadow-sm border-slate-200 text-slate-900"
              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`}
        >
          <div className="flex items-center gap-2">
            <div className="truncate text-xs font-semibold">{item.label}</div>
            {item.badge ? (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
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
