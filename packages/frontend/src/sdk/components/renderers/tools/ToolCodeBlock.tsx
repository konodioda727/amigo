import type React from "react";

interface ToolCodeBlockProps {
  command?: string;
  output?: string;
  className?: string;
}

export const ToolCodeBlock: React.FC<ToolCodeBlockProps> = ({ command, output, className }) => (
  <div
    className={`rounded-lg bg-neutral-950 px-3 py-2 font-mono text-xs text-neutral-200 ${className || ""}`.trim()}
  >
    {command ? <div className="mb-1 text-emerald-400">$ {command}</div> : null}
    {output ? (
      <div className="max-h-56 overflow-auto whitespace-pre-wrap break-all text-neutral-200">
        {output}
      </div>
    ) : null}
  </div>
);
