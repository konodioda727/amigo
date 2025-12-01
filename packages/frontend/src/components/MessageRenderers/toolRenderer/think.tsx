import type { ToolRendererProps } from "./index";
import { Streamdown } from "streamdown";

const ThinkRenderer: React.FC<ToolRendererProps<"think">> = ({ params, updateTime }) => {
  // Extract the actual content from params
  // params should be a string for think tool
  let thinkContent = "";
  
  if (typeof params === "string") {
    thinkContent = params;
  } else if (params && typeof params === "object") {
    // Fallback: if params is an object, try to extract content
    const paramsObj = params as Record<string, unknown>;
    thinkContent = (paramsObj.content as string) || JSON.stringify(params);
  }

  if (!thinkContent) {
    return null;
  }

  return (
    <div className="mb-4">
      <div className="flex items-start gap-3 p-4 rounded-lg bg-base-200/30 border border-base-300/50">
        <div className="text-2xl mt-0.5">💭</div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-base-content/60 mb-2">思考过程</div>
          <div className="prose prose-sm max-w-none text-base-content/90">
            <Streamdown>{thinkContent}</Streamdown>
          </div>
        </div>
      </div>
      {updateTime && (
        <div className="text-xs text-base-content/40 mt-1 ml-11">
          {new Date(updateTime).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
};

export default ThinkRenderer;
