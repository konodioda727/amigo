import { chromium, type Browser, type BrowserContext, type Page, devices } from "playwright";
import { logger } from "./logger";

/**
 * 浏览器管理器 - 单例模式管理 Playwright 浏览器实例
 */
class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private isInitializing = false;

  /**
   * 获取或创建浏览器实例
   */
  async getBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) {
      return this.browser;
    }

    // 防止并发初始化
    while (this.isInitializing) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (this.browser?.isConnected()) {
      return this.browser;
    }

    this.isInitializing = true;
    try {
      // 从环境变量读取是否使用有头浏览器
      const headless = process.env.BROWSER_HEADLESS !== "false";
      
      logger.info(`[BrowserManager] 启动浏览器 (headless: ${headless})...`);
      this.browser = await chromium.launch({
        headless,
        args: [
          "--disable-blink-features=AutomationControlled",
          "--disable-features=IsolateOrigins,site-per-process",
          "--disable-site-isolation-trials",
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--disable-gpu",
          "--hide-scrollbars",
          "--mute-audio",
          "--disable-background-networking",
          "--disable-background-timer-throttling",
          "--disable-backgrounding-occluded-windows",
          "--disable-breakpad",
          "--disable-component-extensions-with-background-pages",
          "--disable-extensions",
          "--disable-features=TranslateUI",
          "--disable-ipc-flooding-protection",
          "--disable-renderer-backgrounding",
          "--enable-features=NetworkService,NetworkServiceInProcess",
          "--force-color-profile=srgb",
          "--metrics-recording-only",
        ],
        ignoreDefaultArgs: ["--enable-automation"],
      });
      logger.info("[BrowserManager] 浏览器启动成功");
      return this.browser;
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * 获取或创建浏览器上下文
   */
  async getContext(): Promise<BrowserContext> {
    if (this.context) {
      return this.context;
    }

    const browser = await this.getBrowser();
    const deviceConfig = devices["Desktop Chrome"];

    // 获取系统时区
    const timezoneOffset = new Date().getTimezoneOffset();
    let timezoneId = "Asia/Shanghai";
    
    if (timezoneOffset <= -480 && timezoneOffset > -600) {
      timezoneId = "Asia/Shanghai";
    } else if (timezoneOffset <= -540) {
      timezoneId = "Asia/Tokyo";
    } else if (timezoneOffset <= 0 && timezoneOffset > -60) {
      timezoneId = "Europe/London";
    } else if (timezoneOffset <= 300 && timezoneOffset > 240) {
      timezoneId = "America/New_York";
    }

    this.context = await browser.newContext({
      ...deviceConfig,
      locale: "zh-CN",
      timezoneId,
      colorScheme: "light",
      permissions: ["geolocation", "notifications"],
      acceptDownloads: true,
      isMobile: false,
      hasTouch: false,
      javaScriptEnabled: true,
    });

    // 设置额外的浏览器属性以避免检测
    await this.context.addInitScript(`
      // 覆盖 navigator 属性
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      Object.defineProperty(navigator, "plugins", {
        get: () => [1, 2, 3, 4, 5],
      });
      Object.defineProperty(navigator, "languages", {
        get: () => ["zh-CN", "zh", "en-US", "en"],
      });

      // 添加 chrome 对象
      window.chrome = {
        runtime: {},
        loadTimes: () => {},
        csi: () => {},
        app: {},
      };

      // WebGL 指纹随机化
      if (typeof WebGLRenderingContext !== "undefined") {
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function (parameter) {
          if (parameter === 37445) return "Intel Inc.";
          if (parameter === 37446) return "Intel Iris OpenGL Engine";
          return getParameter.call(this, parameter);
        };
      }

      // 模拟真实的屏幕尺寸
      Object.defineProperty(window.screen, "width", { get: () => 1920 });
      Object.defineProperty(window.screen, "height", { get: () => 1080 });
      Object.defineProperty(window.screen, "colorDepth", { get: () => 24 });
      Object.defineProperty(window.screen, "pixelDepth", { get: () => 24 });
    `);

    return this.context;
  }

  /**
   * 获取或创建页面实例
   */
  async getPage(): Promise<Page> {
    const context = await this.getContext();
    const page = await context.newPage();
    
    // 设置默认超时
    page.setDefaultTimeout(30000);
    
    return page;
  }

  /**
   * 关闭浏览器上下文
   */
  async closeContext(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
  }

  /**
   * 关闭浏览器
   */
  async close(): Promise<void> {
    try {
      if (this.context) {
        await this.context.close();
        this.context = null;
      }
      if (this.browser?.isConnected()) {
        await this.browser.close();
        this.browser = null;
        logger.info("[BrowserManager] 浏览器已关闭");
      }
    } catch (error) {
      logger.error("[BrowserManager] 关闭浏览器时出错:", error);
    }
  }
}

// 导出单例实例
export const browserManager = new BrowserManager();

// 进程退出时清理
process.on("exit", () => {
  browserManager.close();
});

process.on("SIGINT", () => {
  browserManager.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  browserManager.close();
  process.exit(0);
});
