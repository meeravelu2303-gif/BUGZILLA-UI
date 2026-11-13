/*
 * proof routes: URL -> middleware -> controller. No request logic here;
 * the handlers are in controllers/proof.controller.ts.
 */
import { Router } from 'express';
import type { Env } from '../config/app.config';
import { createProofController } from '../controllers/proof.controller';

export function proofRouter(env: Env): Router {
  const router = Router();
  const controller = createProofController(env);

  router.get('/bug/:bugId', controller.getBugProof);
  router.get('/file/:id', controller.getProofFile);

  return router;
}
