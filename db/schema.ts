import {sqliteTable,text,integer,index} from 'drizzle-orm/sqlite-core';
export const usageCounters=sqliteTable('usage_counters',{bucket:text('bucket').primaryKey(),count:integer('count').notNull().default(0),expiresAt:integer('expires_at').notNull()},table=>[index('usage_expiry').on(table.expiresAt)]);
