import {
  bootstrapDefaultLocalWebUser,
  ensureAmigoMysqlSchema,
  runAmigoMysqlMigrations,
} from "./migrations";
import { createAmigoMysqlPool, requireAmigoMysqlConfigFromEnv, withAmigoTransaction } from "./pool";
import type { AmigoMysqlConfig, AmigoMysqlDatabase, LocalWebBootstrapOptions } from "./types";

export * from "./drizzle";
export * from "./mysql";
export * from "./mysqlConversationPersistenceProvider";
export * from "./pool";
export * from "./schema";
export * from "./types";

export function createAmigoMysqlDatabase(config: AmigoMysqlConfig): AmigoMysqlDatabase {
  const pool = createAmigoMysqlPool(config);

  return {
    pool,
    migrate: () => runAmigoMysqlMigrations(pool),
    bootstrapDefaultLocalWebUser: (options?: LocalWebBootstrapOptions) =>
      bootstrapDefaultLocalWebUser(pool, options),
    close: () => pool.end(),
  };
}

export function createAmigoMysqlDatabaseFromEnv(): AmigoMysqlDatabase {
  return createAmigoMysqlDatabase(requireAmigoMysqlConfigFromEnv());
}

export { ensureAmigoMysqlSchema, runAmigoMysqlMigrations, withAmigoTransaction };
