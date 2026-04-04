import { afterEach, describe, expect, it } from "bun:test";
import { captureDraftPreviewScreenshot, getScreenshotConfig } from "../screenshot";

const originalEnabled = process.env.AMIGO_SCREENSHOT_ENABLED;
const originalBrowserPath = process.env.AMIGO_SCREENSHOT_BROWSER_PATH;
const originalNodePath = process.env.AMIGO_SCREENSHOT_NODE_PATH;

afterEach(() => {
  if (originalEnabled === undefined) {
    delete process.env.AMIGO_SCREENSHOT_ENABLED;
  } else {
    process.env.AMIGO_SCREENSHOT_ENABLED = originalEnabled;
  }

  if (originalBrowserPath === undefined) {
    delete process.env.AMIGO_SCREENSHOT_BROWSER_PATH;
  } else {
    process.env.AMIGO_SCREENSHOT_BROWSER_PATH = originalBrowserPath;
  }

  if (originalNodePath === undefined) {
    delete process.env.AMIGO_SCREENSHOT_NODE_PATH;
  } else {
    process.env.AMIGO_SCREENSHOT_NODE_PATH = originalNodePath;
  }
});

describe("screenshot provider", () => {
  it("stays disabled when env flag is missing", async () => {
    delete process.env.AMIGO_SCREENSHOT_ENABLED;
    delete process.env.AMIGO_SCREENSHOT_BROWSER_PATH;

    expect(getScreenshotConfig()).toBeNull();

    const artifact = await captureDraftPreviewScreenshot({
      taskId: "task-1",
      draftId: "draft-1",
      revision: 1,
      previewHtmlPath: "/tmp/non-existent-preview.html",
      deviceMode: "desktop",
    });

    expect(artifact.status).toBe("disabled");
    expect(artifact.localFilePath).toBeNull();
  });
});
