/*
 * The whole API surface in one place: every router and the path it is mounted on.
 * Each <name>.route.ts maps URL -> middleware -> controller; the request logic
 * lives in controllers/, the business logic in services/.
 *
 * Mount order matters only for overlapping prefixes; keep it as listed.
 */
import type { Express } from 'express';
import type { Env } from '../config/app.config';
import { eventsRouter } from '../events/liveUpdates.event';
import { adminMetaRouter } from './adminMeta.route';
import { adminProductsRouter } from './adminProducts.route';
import { adminTeamsRouter } from './adminTeams.route';
import { adminUsersRouter } from './adminUsers.route';
import { authRouter } from './auth.route';
import { bugsRouter } from './bugs.route';
import { metaRouter } from './meta.route';
import { productsRouter } from './products.route';
import { proofRouter } from './proof.route';

export function mountRoutes(app: Express, env: Env): void {
  app.use('/api/auth', authRouter(env));
  app.use('/api/events', eventsRouter(env));
  app.use('/api/bugs', bugsRouter(env));
  app.use('/api/products', productsRouter(env));
  app.use('/api/meta', metaRouter(env));
  // No login on purpose: opened from links in an exported sheet; every link is signed and expires.
  app.use('/api/proof', proofRouter(env));
  app.use('/api/admin/users', adminUsersRouter(env));
  app.use('/api/admin/products', adminProductsRouter(env));
  app.use('/api/admin/meta', adminMetaRouter(env));
  app.use('/api/admin/teams', adminTeamsRouter(env));
}
