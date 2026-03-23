import type { MySql2Database } from "drizzle-orm/mysql2";
import { drizzle } from "drizzle-orm/mysql2";
import { getMysqlPool } from "./mysql";
import * as schema from "./schema";

let db: MySql2Database<typeof schema> | null = null;

export const getDrizzleDb = (): MySql2Database<typeof schema> => {
  if (!db) {
    db = drizzle(getMysqlPool(), { schema, mode: "default" });
  }
  return db;
};

export { schema };
