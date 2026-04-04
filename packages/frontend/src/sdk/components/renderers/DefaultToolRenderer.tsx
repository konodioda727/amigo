import type { ToolNames } from "@amigo-llm/types";
import type React from "react";
import type { ToolMessageRendererProps } from "../../types/renderers";
import { DefaultBashRenderer } from "./tools/DefaultBashRenderer";
import { DefaultBrowserSearchRenderer } from "./tools/DefaultBrowserSearchRenderer";
import { DefaultCompleteTaskRenderer } from "./tools/DefaultCompleteTaskRenderer";
import { DefaultCompletionResultRenderer } from "./tools/DefaultCompletionResultRenderer";
import { DefaultCreateDesignDocRenderer } from "./tools/DefaultCreateDesignDocRenderer";
import { DefaultCreateTaskDocsRenderer } from "./tools/DefaultCreateTaskDocsRenderer";
import { DefaultEditFileRenderer } from "./tools/DefaultEditFileRenderer";
import { DefaultExecuteTaskListRenderer } from "./tools/DefaultExecuteTaskListRenderer";
import { DefaultListDesignDocsRenderer } from "./tools/DefaultListDesignDocsRenderer";
import { DefaultReadDesignDocRenderer } from "./tools/DefaultReadDesignDocRenderer";
import { DefaultReadFileRenderer } from "./tools/DefaultReadFileRenderer";
import { DefaultReadSkillBundleRenderer } from "./tools/DefaultReadSkillBundleRenderer";
import { DefaultReadTaskDocsRenderer } from "./tools/DefaultReadTaskDocsRenderer";
import { DefaultUpsertAutomationRenderer } from "./tools/DefaultUpsertAutomationRenderer";
import { ToolAccordion } from "./tools/ToolAccordion";

// Tool-specific renderer map
const toolRendererMap: {
  [K in ToolNames]?: React.FC<ToolMessageRendererProps<K>>;
} = {
  browserSearch: DefaultBrowserSearchRenderer as React.FC<
    ToolMessageRendererProps<"browserSearch">
  >,
  bash: DefaultBashRenderer as React.FC<ToolMessageRendererProps<"bash">>,
  editFile: DefaultEditFileRenderer as React.FC<ToolMessageRendererProps<"editFile">>,
  readFile: DefaultReadFileRenderer as React.FC<ToolMessageRendererProps<"readFile">>,
  createTaskDocs: DefaultCreateTaskDocsRenderer as React.FC<
    ToolMessageRendererProps<"createTaskDocs">
  >,
  readTaskDocs: DefaultReadTaskDocsRenderer as React.FC<ToolMessageRendererProps<"readTaskDocs">>,
  executeTaskList: DefaultExecuteTaskListRenderer as React.FC<
    ToolMessageRendererProps<"executeTaskList">
  >,
  completeTask: DefaultCompleteTaskRenderer as React.FC<ToolMessageRendererProps<"completeTask">>,
  completionResult: DefaultCompletionResultRenderer as React.FC<
    ToolMessageRendererProps<"completionResult">
  >,
};

/**
 * Generic tool renderer for tools without custom renderers
 */
const GenericToolRenderer: React.FC<ToolMessageRendererProps<ToolNames>> = ({ message }) => {
  const { toolName, params, toolOutput, error, hasError, partial } = message;
  const paramsStr = JSON.stringify(params, null, 2);
  const isCompleted = toolOutput !== undefined;
  const isLoading = partial === true;

  return (
    <ToolAccordion
      title={`执行: ${toolName}`}
      isLoading={isLoading}
      hasError={hasError}
      error={error}
    >
      <div className="font-mono text-xs whitespace-pre-wrap break-all bg-neutral-100 p-2 rounded">
        {paramsStr}
      </div>
      {isCompleted && (
        <div className="mt-1 text-xs text-green-600 break-all">
          输出: {JSON.stringify(toolOutput)}
        </div>
      )}
    </ToolAccordion>
  );
};

/**
 * Default renderer for tool message type
 * Routes to specific tool renderers or falls back to generic renderer
 */
export const DefaultToolRenderer: React.FC<ToolMessageRendererProps<ToolNames>> = (props) => {
  const { message } = props;

  if (
    String(message.toolName) === "createDesignDocFromMarkup" ||
    String(message.toolName) === "replaceDesignSectionFromMarkup"
  ) {
    return (
      <DefaultCreateDesignDocRenderer
        {...(props as unknown as React.ComponentProps<typeof DefaultCreateDesignDocRenderer>)}
      />
    );
  }

  if (String(message.toolName) === "readDesignDoc") {
    return (
      <DefaultReadDesignDocRenderer
        {...(props as unknown as React.ComponentProps<typeof DefaultReadDesignDocRenderer>)}
      />
    );
  }

  if (String(message.toolName) === "listDesignDocs") {
    return (
      <DefaultListDesignDocsRenderer
        {...(props as unknown as React.ComponentProps<typeof DefaultListDesignDocsRenderer>)}
      />
    );
  }

  if (String(message.toolName) === "readSkillBundle") {
    return (
      <DefaultReadSkillBundleRenderer
        {...(props as unknown as React.ComponentProps<typeof DefaultReadSkillBundleRenderer>)}
      />
    );
  }

  if (String(message.toolName) === "upsertAutomation") {
    return (
      <DefaultUpsertAutomationRenderer
        {...(props as unknown as React.ComponentProps<typeof DefaultUpsertAutomationRenderer>)}
      />
    );
  }

  const CustomRenderer = toolRendererMap[message.toolName as ToolNames];

  if (CustomRenderer) {
    // @ts-expect-error - Type narrowing is complex with generic tool types
    return <CustomRenderer {...props} />;
  }

  return <GenericToolRenderer {...props} />;
};
