import {
  pgTable,
  text,
  timestamp,
  doublePrecision,
  integer,
  boolean,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const domainStatusEnum = pgEnum("domain_status", [
  "EXPIRING",
  "EXPIRED",
  "AVAILABLE",
  "TAKEN",
  "AUCTION",
  "UNKNOWN",
]);

export const domainsTable = pgTable("domains", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sld: text("sld").notNull(),
  tld: text("tld").notNull(),
  status: domainStatusEnum("status").notNull().default("UNKNOWN"),
  source: text("source"),
  auctionUrl: text("auction_url"),
  auctionEndAt: timestamp("auction_end_at"),
  currentBid: doublePrecision("current_bid"),
  bidCount: integer("bid_count"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const metricsTable = pgTable("metrics", {
  id: text("id").primaryKey(),
  domainId: text("domain_id")
    .notNull()
    .references(() => domainsTable.id, { onDelete: "cascade" }),
  domainAuthority: doublePrecision("domain_authority"),
  backlinks: integer("backlinks"),
  referringDomains: integer("referring_domains"),
  domainAge: integer("domain_age"),
  registrar: text("registrar"),
  createdDate: timestamp("created_date"),
  expiresDate: timestamp("expires_date"),
  lengthScore: doublePrecision("length_score"),
  tldScore: doublePrecision("tld_score"),
  pronounceScore: doublePrecision("pronounce_score"),
  keywordScore: doublePrecision("keyword_score"),
  rarityScore: doublePrecision("rarity_score"),
  rarityTier: text("rarity_tier"),
  brandScore: doublePrecision("brand_score"),
  estimatedValue: doublePrecision("estimated_value"),
  niche: text("niche"),
  recommendation: text("recommendation"),
  aiReason: text("ai_reason"),
  aiScoredAt: timestamp("ai_scored_at"),
  trendScore: doublePrecision("trend_score"),
  trademarkRisk: text("trademark_risk"), // HIGH | MEDIUM | LOW | NONE
  trademarkReason: text("trademark_reason"),
  trademarkMatches: text("trademark_matches"), // JSON string of matches
  enrichedAt: timestamp("enriched_at"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const watchlistTable = pgTable(
  "watchlist_items",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    domainId: text("domain_id")
      .notNull()
      .references(() => domainsTable.id, { onDelete: "cascade" }),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("watchlist_user_domain_idx").on(t.userId, t.domainId)],
);

export const alertsTable = pgTable("alerts", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  telegramChatId: text("telegram_chat_id").notNull(),
  telegramBotToken: text("telegram_bot_token").notNull(),
  filterJson: text("filter_json").notNull().default("{}"),
  active: boolean("active").notNull().default(true),
  lastSentAt: timestamp("last_sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertDomainSchema = createInsertSchema(domainsTable);
export type InsertDomain = z.infer<typeof insertDomainSchema>;
export type Domain = typeof domainsTable.$inferSelect;
export type Metrics = typeof metricsTable.$inferSelect;
export type WatchlistItem = typeof watchlistTable.$inferSelect;
export type User = typeof usersTable.$inferSelect;
export type Alert = typeof alertsTable.$inferSelect;
