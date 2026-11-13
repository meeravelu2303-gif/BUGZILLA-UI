/*
 * bugs routes: URL -> middleware -> controller. No request logic here;
 * the handlers are in controllers/bugs.controller.ts.
 */
import express, { Router } from 'express';
import type { Env } from '../config/app.config';
import { requireAuth, requirePermission } from '../middleware/auth.middleware';
import { createBugsController } from '../controllers/bugs.controller';

export function bugsRouter(env: Env): Router {
  const router = Router();
  const controller = createBugsController(env);
  const auth = requireAuth(env);
  /*
   * POST /api/bugs/delete and /api/bugs/restore - soft delete (see services/softDelete.service.ts).
   * Testers and admins only. Bugzilla enforces the same line independently:
   * only they are members of the "Deleted bugs" group it refuses to let anyone
   * else add or remove.
   */
  const triage = requirePermission('canTriage');

  router.use(controller.announceBugChanges);
  router.get('/', auth, controller.listBugs);
  router.get('/count', auth, controller.countBugs);
  router.get('/export', auth, controller.exportBugs);
  router.post('/export/jobs', auth, controller.startExportJob);
  router.post('/export-pack/jobs', auth, controller.startExportPackJob);
  router.get('/export-pack/jobs/:jobId', auth, controller.getExportJob);
  router.delete('/export-pack/jobs/:jobId', auth, controller.cancelExportJob);
  router.get('/export-pack/jobs/:jobId/download', auth, controller.downloadExportJob);
  router.get('/stats', auth, controller.getBugStats);
  router.get('/comment-tags', auth, controller.getCommentTags);
  router.get('/:id', auth, controller.getBug);
  router.get('/:id/attachments/:attachmentId', auth, controller.downloadAttachment);
  router.post('/:id/attachments', auth, controller.createAttachment);
  router.post('/:id/attachments/upload', auth, express.raw({ type: () => true, limit: '60mb' }), controller.uploadAttachment);
  router.patch('/:id/attachments/:attachmentId', auth, controller.updateAttachment);
  router.delete('/:id/attachments/:attachmentId', auth, controller.deleteAttachment);
  router.patch('/:id/comments/:commentId', auth, controller.editComment);
  router.get('/:id/comments/:commentId/history', auth, controller.getCommentHistory);
  router.put('/:id/comments/:commentId/tags', auth, controller.setCommentTags);
  router.post('/', auth, controller.createBug);
  router.patch('/', auth, controller.bulkUpdateBugs);
  router.put('/:id/report', auth, controller.updateReport);
  router.post('/delete', auth, triage, controller.deleteBugs);
  router.post('/restore', auth, triage, controller.restoreDeletedBugs);
  router.get('/:id/transfer-options', auth, controller.getTransferOptions);
  router.post('/:id/transfer', auth, controller.transferBugToProduct);
  router.patch('/:id', auth, controller.updateBug);
  router.get('/:id/activity', auth, controller.getBugActivity);
  router.post('/:id/comments', auth, controller.addComment);

  return router;
}
