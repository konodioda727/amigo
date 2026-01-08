import type React from "react";
import type { AssignTaskUpdatedRendererProps } from "../../types/renderers";

/**
 * Default renderer for assignTaskUpdated message type
 * This is typically used internally and may not need visible rendering
 */
export const DefaultAssignTaskUpdatedRenderer: React.FC<AssignTaskUpdatedRendererProps> = ({
  message: _message,
  taskId: _taskId,
  isLatest: _isLatest,
}) => {
  // This message type is typically handled internally and doesn't need visible rendering
  // Return null to hide it from the UI
  return null;
};
