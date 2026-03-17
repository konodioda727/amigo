import { ImageIcon, LayoutTemplate } from "lucide-react";
import type React from "react";
import { ToolAccordion } from "./ToolAccordion";

interface DesignAssetDetail {
  id: string;
  type: "image" | "component";
  name: string;
  description?: string | null;
  tags?: string[];
  updatedAt?: string;
  createdAt?: string;
  thumbnailUrl?: string | null;
  url?: string;
  width?: number | null;
  height?: number | null;
  markupText?: string;
}

interface ReadDesignAssetToolOutput {
  success?: boolean;
  asset?: DesignAssetDetail | null;
  validationErrors?: string[];
  message?: string;
}

interface ReadDesignAssetRendererProps {
  message: {
    params?: Record<string, unknown>;
    toolOutput?: ReadDesignAssetToolOutput;
    error?: string;
    hasError?: boolean;
    partial?: boolean;
  };
  isLatest: boolean;
}

export const DefaultReadDesignAssetRenderer: React.FC<ReadDesignAssetRendererProps> = ({
  message,
}) => {
  const { params, toolOutput, error, hasError, partial } = message;
  const isCompleted = toolOutput !== undefined;
  const isLoading = partial === true;
  const asset = toolOutput?.asset || null;
  const assetId = typeof params?.assetId === "string" ? params.assetId : asset?.id || "";

  return (
    <ToolAccordion
      icon={asset?.type === "image" ? <ImageIcon size={14} /> : <LayoutTemplate size={14} />}
      title={`设计资产: ${assetId || "未命名"}`}
      isLoading={isLoading}
      hasError={hasError}
      error={error}
    >
      {!asset ? <div className="text-xs text-neutral-500">未找到资产详情</div> : null}
      {asset ? (
        <div className="space-y-2 text-xs">
          <div className="text-neutral-700">
            <span className="font-medium">{asset.name}</span>
            <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] uppercase text-neutral-500">
              {asset.type}
            </span>
          </div>
          <div className="break-all text-neutral-500">{asset.id}</div>
          {asset.description ? <div className="text-neutral-600">{asset.description}</div> : null}
          {asset.thumbnailUrl ? (
            <img
              src={asset.thumbnailUrl}
              alt={asset.name}
              className="h-24 w-full rounded border border-neutral-200 object-cover"
            />
          ) : null}
          {asset.type === "image" && asset.url ? (
            <div className="rounded bg-neutral-50 p-2 text-neutral-600">
              <div>
                {asset.width && asset.height ? `${asset.width} x ${asset.height}` : "未记录尺寸"}
              </div>
              <div className="mt-1 break-all">{asset.url}</div>
            </div>
          ) : null}
          {asset.type === "component" && asset.markupText ? (
            <pre className="overflow-auto rounded bg-neutral-50 p-2 text-[11px] leading-5 text-neutral-700">
              {asset.markupText}
            </pre>
          ) : null}
          {asset.tags && asset.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
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
      ) : null}
    </ToolAccordion>
  );
};
