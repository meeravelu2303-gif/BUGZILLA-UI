/*
 * auth routes: URL -> middleware -> controller. No request logic here;
 * the handlers are in controllers/auth.controller.ts.
 */
import { Router } from 'express';
import { type Env } from '../config/app.config';
import { requireAuth } from '../middleware/auth.middleware';
import { createAuthController } from '../controllers/auth.controller';
import { forgotPasswordRateLimit, loginRateLimit, resetAttemptRateLimit } from '../middleware/rateLimit.middleware';

export function authRouter(env: Env): Router {
  const router = Router();
  const controller = createAuthController(env);

  router.post('/forgot-password', forgotPasswordRateLimit, controller.forgotPassword);
  router.post('/reset-password/validate', resetAttemptRateLimit, controller.checkResetToken);
  router.post('/reset-password', resetAttemptRateLimit, controller.resetPassword);
  router.post('/login', loginRateLimit, controller.loginUser);
  router.post('/logout', controller.logoutUser);
  router.post('/change-password', requireAuth(env), controller.changePassword);
  router.get('/me', requireAuth(env), controller.getMe);

  return router;
}
