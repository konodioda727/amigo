import type React from "react";
import type { ReadSummaryRendererProps } from "../../types/renderers";
import { ToolAccordion } from "./tools/ToolAccordion";

const DetailSection: React.FC<{
  title: string;
  items: string[];
}> = ({ title, items }) => {
  if (items.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium uppercase tracking-wide text-neutral-400">{title}</div>
      <div className="space-y-1 text-sm text-neutral-600">
        {items.map((item) => (
          <div key={`${title}-${item}`} className="break-words">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
};

export const DefaultReadSummaryRenderer: React.FC<ReadSummaryRendererProps> = ({ message }) => {
  const hasDetails =
    message.files.length > 0 || message.searches.length > 0 || message.resources.length > 0;

  return (
    <ToolAccordion title={message.text} isExpandedDefault={false}>
      {hasDetails ? (
        <>
          <DetailSection title="文件" items={message.files} />
          <DetailSection title="搜索" items={message.searches} />
          <DetailSection title="资料" items={message.resources} />
        </>
      ) : (
        <div className="text-sm text-neutral-600">
          本次聚合包含 {message.toolCount} 个读取操作。
        </div>
      )}
    </ToolAccordion>
  );
};
