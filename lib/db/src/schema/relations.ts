import { relations } from "drizzle-orm";
import { domainsTable, metricsTable, watchlistTable, usersTable } from "./domains";

export const domainsRelations = relations(domainsTable, ({ one, many }) => ({
  metrics: one(metricsTable, {
    fields: [domainsTable.id],
    references: [metricsTable.domainId],
  }),
  watchlist: many(watchlistTable),
}));

export const metricsRelations = relations(metricsTable, ({ one }) => ({
  domain: one(domainsTable, {
    fields: [metricsTable.domainId],
    references: [domainsTable.id],
  }),
}));

export const watchlistRelations = relations(watchlistTable, ({ one }) => ({
  domain: one(domainsTable, {
    fields: [watchlistTable.domainId],
    references: [domainsTable.id],
  }),
  user: one(usersTable, {
    fields: [watchlistTable.userId],
    references: [usersTable.id],
  }),
}));

export const usersRelations = relations(usersTable, ({ many }) => ({
  watchlist: many(watchlistTable),
}));
