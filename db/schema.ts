import { sqliteTable, text, integer, primaryKey, index } from "drizzle-orm/sqlite-core";
export const connections=sqliteTable("connections",{
 id:text("id").primaryKey(), credentials:text("credentials").notNull(),
 snapshot:text("snapshot"),lastSync:text("last_sync"),error:text("error"),
 lockUntil:integer("lock_until").notNull().default(0),
 lockToken:text("lock_token"),
});
export const records=sqliteTable("records",{
 snapshot:text("snapshot").notNull(), storeId:text("store_id").notNull(),
 productId:integer("product_id").notNull(), payload:text("payload").notNull(),
},t=>[primaryKey({columns:[t.snapshot,t.storeId,t.productId]}),index("idx_records_store_snapshot").on(t.storeId,t.snapshot)]);
export const settings=sqliteTable("settings",{id:text("id").primaryKey(),payload:text("payload").notNull()});

export const syncJobs=sqliteTable("sync_jobs",{
 storeId:text("store_id").primaryKey(),runId:text("run_id").notNull(),
 status:text("status").notNull(),cursor:text("cursor").notNull(),
 startedAt:text("started_at").notNull(),updatedAt:text("updated_at").notNull(),
 error:text("error"),
});
