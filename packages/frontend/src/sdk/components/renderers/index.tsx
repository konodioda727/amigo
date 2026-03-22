/**
 * Default Message Renderers
 *
 * This module exports default renderer implementations for all message types.
 * These renderers can be used as-is or replaced with custom implementations
 * via the WebSocketProvider's renderers prop.
 */

import type { MessageRendererMap } from "../../types/renderers";
import { DefaultAlertRenderer } from "./DefaultAlertRenderer";
import { DefaultAskFollowupQuestionRenderer } from "./DefaultAskFollowupQuestionRenderer";
import { DefaultErrorRenderer } from "./DefaultErrorRenderer";
import { DefaultInterruptRenderer } from "./DefaultInterruptRenderer";
import { DefaultMessageRenderer } from "./DefaultMessageRenderer";
import { DefaultThinkRenderer } from "./DefaultThinkRenderer";
import { DefaultToolRenderer } from "./DefaultToolRenderer";
import { DefaultUserMessageRenderer } from "./DefaultUserMessageRenderer";

/**
 * Default renderer map
 *
 * Maps message types to their default renderer components.
 * Custom renderers provided via WebSocketProvider will override these defaults.
 *
 * @example
 * ```tsx
 * import { defaultRenderers } from '@amigo-llm/frontend';
 *
 * // Use default renderers
 * <WebSocketProvider>
 *   <App />
 * </WebSocketProvider>
 *
 * // Override specific renderers
 * <WebSocketProvider
 *   renderers={{
 *     message: CustomMessageRenderer,
 *     tool: CustomToolRenderer,
 *   }}
 * >
 *   <App />
 * </WebSocketProvider>
 * ```
 */
export const defaultRenderers: MessageRendererMap = {
  message: (props) => <DefaultMessageRenderer {...props} />,
  think: (props) => <DefaultThinkRenderer {...props} />,
  tool: (props) => <DefaultToolRenderer {...props} />,
  userSendMessage: (props) => <DefaultUserMessageRenderer {...props} />,
  askFollowupQuestion: (props) => <DefaultAskFollowupQuestionRenderer {...props} />,
  interrupt: (props) => <DefaultInterruptRenderer {...props} />,
  error: (props) => <DefaultErrorRenderer {...props} />,
  alert: (props) => <DefaultAlertRenderer {...props} />,
};

export { DefaultAlertRenderer } from "./DefaultAlertRenderer";
export { DefaultAskFollowupQuestionRenderer } from "./DefaultAskFollowupQuestionRenderer";
export { DefaultErrorRenderer } from "./DefaultErrorRenderer";
export { DefaultInterruptRenderer } from "./DefaultInterruptRenderer";
// Re-export individual renderers for direct use
export { DefaultMessageRenderer } from "./DefaultMessageRenderer";
export { DefaultThinkRenderer } from "./DefaultThinkRenderer";
export { DefaultToolRenderer } from "./DefaultToolRenderer";
export { DefaultUserMessageRenderer } from "./DefaultUserMessageRenderer";
export { DefaultBrowserSearchRenderer } from "./tools/DefaultBrowserSearchRenderer";
// Re-export tool-specific renderers
export {
  DefaultEditFileRenderer,
  EditFileResultBody,
} from "./tools/DefaultEditFileRenderer";
export {
  DefaultReadFileRenderer,
  ReadFileResultBody,
} from "./tools/DefaultReadFileRenderer";
export { DefaultReadSkillBundleRenderer } from "./tools/DefaultReadSkillBundleRenderer";
export { DefaultUpsertAutomationRenderer } from "./tools/DefaultUpsertAutomationRenderer";
export { ToolAccordion } from "./tools/ToolAccordion";
