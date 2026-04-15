import type React from "react";
import { INPUT_CLASS } from "./constants";

export const FormListItem: React.FC<{
  label: string;
  description?: string;
  children: React.ReactNode;
}> = ({ label, description, children }) => (
  <div className="border-b border-slate-200 py-4 last:border-b-0">
    <div className="mb-2.5">
      <div className="text-[13px] font-semibold text-slate-900">{label}</div>
      {description ? <div className="mt-0.5 text-xs text-slate-500">{description}</div> : null}
    </div>
    {children}
  </div>
);

export const Field: React.FC<{
  label: string;
  description?: string;
  children: React.ReactNode;
}> = ({ label, description, children }) => (
  <div className="space-y-1.5">
    <div>
      <div className="text-[13px] font-medium text-slate-900">{label}</div>
      {description ? <div className="mt-0.5 text-xs text-slate-500">{description}</div> : null}
    </div>
    {children}
  </div>
);

export const NumberField: React.FC<{
  label: string;
  description?: string;
  value?: number;
  onChange: (value: number | undefined) => void;
  step?: string;
}> = ({ label, description, value, onChange, step = "1" }) => (
  <Field label={label} description={description}>
    <input
      type="number"
      value={value ?? ""}
      step={step}
      onChange={(event) => {
        const rawValue = event.target.value.trim();
        onChange(rawValue ? Number(rawValue) : undefined);
      }}
      className={INPUT_CLASS}
    />
  </Field>
);

export const ReadonlyValue: React.FC<{
  value: string;
}> = ({ value }) => (
  <div className="rounded border border-slate-200 bg-slate-50 px-3 py-1.5 text-[13px] text-slate-700">
    {value}
  </div>
);

export const StatusRow: React.FC<{
  label: string;
  value: string;
  tone: "active" | "muted";
}> = ({ label, value, tone }) => (
  <div className="flex items-center justify-between gap-4 px-4 py-2 hover:bg-slate-50 rounded-sm transition">
    <div className="text-xs font-medium text-slate-900">{label}</div>
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
        tone === "active" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"
      }`}
    >
      {value}
    </span>
  </div>
);

export const EmptyStateCard: React.FC<{
  title: string;
  description: string;
  action?: React.ReactNode;
}> = ({ title, description, action }) => (
  <div className="flex h-full items-center justify-center">
    <div className="w-full max-w-sm rounded border border-slate-200 bg-slate-50/50 px-5 py-6 text-center shadow-sm">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-1.5 text-xs text-slate-500">{description}</div>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  </div>
);
