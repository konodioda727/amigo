import type React from "react";
import { INPUT_CLASS } from "./constants";

export const FormListItem: React.FC<{
  label: string;
  description?: string;
  children: React.ReactNode;
}> = ({ label, description, children }) => (
  <div className="border-b border-slate-200 py-5 last:border-b-0">
    <div className="mb-3">
      <div className="text-sm font-medium text-slate-900">{label}</div>
      {description ? (
        <div className="mt-1 text-xs leading-5 text-slate-500">{description}</div>
      ) : null}
    </div>
    {children}
  </div>
);

export const Field: React.FC<{
  label: string;
  description?: string;
  children: React.ReactNode;
}> = ({ label, description, children }) => (
  <div className="space-y-2">
    <div>
      <div className="text-sm font-medium text-slate-900">{label}</div>
      {description ? (
        <div className="mt-1 text-xs leading-5 text-slate-500">{description}</div>
      ) : null}
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
  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700">
    {value}
  </div>
);

export const StatusRow: React.FC<{
  label: string;
  value: string;
  tone: "active" | "muted";
}> = ({ label, value, tone }) => (
  <div className="flex items-center justify-between gap-4 px-6 py-4">
    <div className="text-sm font-medium text-slate-900">{label}</div>
    <span
      className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
        tone === "active" ? "bg-slate-900 text-white" : "border border-slate-200 text-slate-500"
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
    <div className="max-w-md rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-8 text-center">
      <div className="text-base font-semibold text-slate-950">{title}</div>
      <div className="mt-2 text-sm leading-6 text-slate-500">{description}</div>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  </div>
);
