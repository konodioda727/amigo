import { createAmigoApp } from "./app";

const isNonFatalStreamError = (reason: unknown) => {
  const message = reason instanceof Error ? reason.message : String(reason || "");
  return (
    message.includes("Failed to parse stream") || message.includes("Error reading from the stream")
  );
};

process.on("unhandledRejection", (reason) => {
  if (isNonFatalStreamError(reason)) {
    console.warn(`[amigo] ignore non-fatal stream rejection: ${String(reason)}`);
    return;
  }
  console.error("[amigo] unhandled rejection", reason);
});

process.on("uncaughtException", (error) => {
  if (isNonFatalStreamError(error)) {
    console.warn(`[amigo] ignore non-fatal stream error: ${error.message}`);
    return;
  }
  console.error("[amigo] uncaught exception", error);
});

const app = createAmigoApp();
app.server.start();

console.log(`[amigo] server started on :${app.port}`);
