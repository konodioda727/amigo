/**
 * Test setup for React component tests
 * Configures happy-dom as the DOM environment
 */

import { Window } from "happy-dom";

// Create a window instance
const window = new Window();
const document = window.document;

// Set globals
global.window = window as any;
global.document = document as any;
global.navigator = window.navigator as any;
global.HTMLElement = window.HTMLElement as any;
global.Element = window.Element as any;
