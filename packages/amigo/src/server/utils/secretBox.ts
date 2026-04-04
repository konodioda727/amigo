import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";

const readSecretMaterial = (): string => {
  const configured = (process.env.AMIGO_SETTINGS_ENCRYPTION_KEY || "").trim();
  if (configured) {
    return configured;
  }

  const authSecret = (process.env.BETTER_AUTH_SECRET || "").trim();
  if (authSecret) {
    return authSecret;
  }

  return "amigo-dev-secret-change-me";
};

const buildKey = () => createHash("sha256").update(readSecretMaterial()).digest();

export const encryptSecret = (plainText: string): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, buildKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(".");
};

export const decryptSecret = (payload: string): string => {
  const [version, ivBase64, authTagBase64, encryptedBase64] = payload.split(".");
  if (version !== "v1" || !ivBase64 || !authTagBase64 || !encryptedBase64) {
    throw new Error("无效的密文格式");
  }

  const decipher = createDecipheriv(ALGORITHM, buildKey(), Buffer.from(ivBase64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagBase64, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, "base64")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
};
