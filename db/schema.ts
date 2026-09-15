import { sqliteTable, text, integer, primaryKey, index, uniqueIndex } from "drizzle-orm/sqlite-core";
export const connections=sqliteTable("connections",{
 id:text("id").primaryKey(), credentials:text("credentials").notNull(),
 snapshot:text("snapshot"),lastSync:text("last_sync"),error:text("error"),
 lockUntil:integer("lock_until").notNull().default(0),
 lockToken:text("lock_token"),
 sourceRevision:integer("source_revision").notNull().default(0),
 snapshotRevision:integer("snapshot_revision").notNull().default(0),
});
export const records=sqliteTable("records",{
 snapshot:text("snapshot").notNull(), storeId:text("store_id").notNull(),
 productId:integer("product_id").notNull(), payload:text("payload").notNull(),
},t=>[primaryKey({columns:[t.snapshot,t.storeId,t.productId]}),index("idx_records_store_snapshot").on(t.storeId,t.snapshot)]);
export const settings=sqliteTable("settings",{id:text("id").primaryKey(),payload:text("payload").notNull()});

export const trackingHistory=sqliteTable('tracking_history',{
 id:integer('id').primaryKey({autoIncrement:true}),eventKey:text('event_key').notNull(),
 shipmentId:text('shipment_id').notNull(),orderRef:text('order_ref').notNull(),
 tracking:text('tracking').notNull(),carrier:text('carrier').notNull(),recordedAt:text('recorded_at').notNull(),
 kind:text('kind').notNull(),status:text('status'),statusChanged:integer('status_changed').notNull().default(0),payload:text('payload').notNull(),
},t=>[uniqueIndex('idx_tracking_history_event').on(t.eventKey),index('idx_tracking_history_shipment').on(t.shipmentId,t.id),index('idx_tracking_history_tracking').on(t.tracking,t.id),index('idx_tracking_history_order').on(t.orderRef,t.id)]);

export const syncJobs=sqliteTable("sync_jobs",{
 storeId:text("store_id").primaryKey(),runId:text("run_id").notNull(),
 status:text("status").notNull(),cursor:text("cursor").notNull(),
 startedAt:text("started_at").notNull(),updatedAt:text("updated_at").notNull(),
 error:text("error"),
});

export const whatsappMessages=sqliteTable("whatsapp_messages",{
 id:text("id").primaryKey(),fromNumber:text("from_number").notNull(),question:text("question").notNull(),
 receivedAt:integer("received_at").notNull(),createdAt:integer("created_at").notNull(),updatedAt:integer("updated_at").notNull(),
 status:text("status").notNull().default("pending"),reply:text("reply"),nextPart:integer("next_part").notNull().default(0),
 attempts:integer("attempts").notNull().default(0),availableAt:integer("available_at").notNull(),
 leaseToken:text("lease_token"),leaseUntil:integer("lease_until").notNull().default(0),
 lastError:text("last_error"),lastMessageId:text("last_message_id"),
},t=>[index("idx_whatsapp_status_available").on(t.status,t.availableAt)]);
