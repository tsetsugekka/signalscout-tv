import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const catalogCache=sqliteTable("catalog_cache",{key:text("key").primaryKey(),payload:text("payload").notNull(),syncedAt:integer("synced_at").notNull(),checkedAt:integer("checked_at").notNull()});
