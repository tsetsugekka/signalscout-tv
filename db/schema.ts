import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const catalogCache=sqliteTable("catalog_cache",{key:text("key").primaryKey(),payload:text("payload").notNull(),syncedAt:integer("synced_at").notNull(),checkedAt:integer("checked_at").notNull()});
export const sourceHealth=sqliteTable("source_health",{source:text("source").primaryKey(),okAt:integer("ok_at").notNull().default(0),failedAt:integer("failed_at").notNull().default(0)});
