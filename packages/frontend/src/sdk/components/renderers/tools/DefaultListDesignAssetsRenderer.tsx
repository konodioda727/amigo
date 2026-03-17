import { ImageIcon, LayoutTemplate } from "lucide-react";
import type React from "react";
import { ToolAccordion } from "./ToolAccordion";

interface AssetSummary {
  id: string;
  type: "image" | "component";
  name: string;
  description?: string | null;
  tags?: string[];
  updatedAt?: string;
  thumbnailUrl?: string | null;
  url?: string;
  width?: number | null;
  height?: number | null;
}

interface ListDesignAssetsToolOutput {
  success?: boolean;
  assets?: AssetSummary[];
  validationErrors?: string[];
  message?: string;
}

interface ListDesignAssetsRendererProps {
  message: {
    toolOutput?: ListDesignAssetsToolOutput;
    error?: string;
    hasError?: boolean;
    partial?: boolean;
  };
  isLatest: boolean;
}

export const DefaultListDesignAssetsRenderer: React.FC<ListDesignAssetsRendererProps> = ({
  message,
}) => {
  const { toolOutput, error, hasError, partial } = message;
  const isCompleted = toolOutput !== undefined;
  const isLoading = partial === true;
  const assets = Array.isArray(toolOutput?.assets) ? toolOutput.assets : [];

  return (
    <ToolAccordion
      icon={<LayoutTemplate size={14} />}
      title={`设计资产列表: ${assets.length}`}
      isLoading={isLoading}
      hasError={hasError}
      error={error}
    >
      <div className="space-y-2">
        {assets.length === 0 ? (
          <div className="text-xs text-neutral-500">当前没有设计资产</div>
        ) : null}
        {assets.map((asset) => (
          <div key={asset.id} className="rounded border border-neutral-200 bg-white/80 p-2 text-xs">
            <div className="flex items-center gap-2 text-neutral-700">
              {asset.type === "image" ? <ImageIcon size={14} /> : <LayoutTemplate size={14} />}
              <span className="font-medium">{asset.name}</span>
              <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] uppercase text-neutral-500">
                {asset.type}
              </span>
            </div>
            <div className="mt-1 break-all text-neutral-500">{asset.id}</div>
            {asset.description ? (
              <div className="mt-1 text-neutral-600">{asset.description}</div>
            ) : null}
            {asset.thumbnailUrl ? (
              <img
                src={asset.thumbnailUrl}
                alt={asset.name}
                className="mt-2 h-20 w-full rounded object-cover border border-neutral-200"
              />
            ) : null}
            {asset.type === "image" && asset.url ? (
              <div className="mt-1 text-neutral-500 break-all">
                {asset.width && asset.height ? `${asset.width} x ${asset.height} · ` : null}
                {asset.url}
              </div>
            ) : null}
            {asset.tags && asset.tags.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {asset.tags.map((tag) => (
                  <span
                    key={`${asset.id}-${tag}`}
                    className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-600"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </ToolAccordion>
  );
};
