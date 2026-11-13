import express, { Router } from 'express';
import { env } from '../config/app.config';
import { requireAuth, requirePermission } from '../middleware/auth.middleware';
import { forgotPasswordRateLimit, loginRateLimit, resetAttemptRateLimit } from '../middleware/rateLimit.middleware';
import { streamEvents } from '../events/liveUpdates.event';
import * as HealthController from '../controllers/health.controller';
import * as AuthController from '../controllers/auth.controller';
import * as BugsController from '../controllers/bugs.controller';
import * as ProductsController from '../controllers/products.controller';
import * as MetaController from '../controllers/meta.controller';
import * as ProofController from '../controllers/proof.controller';
import * as AdminUsersController from '../controllers/adminUsers.controller';
import * as AdminProductsController from '../controllers/adminProducts.controller';
import * as AdminMetaController from '../controllers/adminMeta.controller';
import * as AdminTeamsController from '../controllers/adminTeams.controller';

const router = Router();

const auth = requireAuth(env);
const canTriage = requirePermission('canTriage');
const viewUsers = [auth, requirePermission('canViewUsers')];
const manageUsers = [auth, requirePermission('canManageUsers')];
const viewProducts = [auth, requirePermission('canViewProducts')];
const manageProducts = [auth, requirePermission('canManageProducts')];
const createComponents = [auth, requirePermission('canCreateComponents')];
const rawUpload = express.raw({ type: () => true, limit: '60mb' });

// health
router.get('/health', HealthController.getHealth);

// auth
router.post('/auth/forgot-password', forgotPasswordRateLimit, AuthController.forgotPassword);
router.post('/auth/reset-password/validate', resetAttemptRateLimit, AuthController.checkResetToken);
router.post('/auth/reset-password', resetAttemptRateLimit, AuthController.resetPassword);
router.post('/auth/login', loginRateLimit, AuthController.loginUser);
router.post('/auth/logout', AuthController.logoutUser);
router.post('/auth/change-password', auth, AuthController.changePassword);
router.get('/auth/me', auth, AuthController.getMe);

// live updates
router.get('/events', auth, streamEvents);

// bugs
router.use('/bugs', BugsController.announceBugChanges);
router.get('/bugs', auth, BugsController.listBugs);
router.get('/bugs/count', auth, BugsController.countBugs);
router.get('/bugs/export', auth, BugsController.exportBugs);
router.post('/bugs/export/jobs', auth, BugsController.startExportJob);
router.post('/bugs/export-pack/jobs', auth, BugsController.startExportPackJob);
router.get('/bugs/export-pack/jobs/:jobId', auth, BugsController.getExportJob);
router.delete('/bugs/export-pack/jobs/:jobId', auth, BugsController.cancelExportJob);
router.get('/bugs/export-pack/jobs/:jobId/download', auth, BugsController.downloadExportJob);
router.get('/bugs/stats', auth, BugsController.getBugStats);
router.get('/bugs/comment-tags', auth, BugsController.getCommentTags);
router.get('/bugs/:id', auth, BugsController.getBug);
router.get('/bugs/:id/attachments/:attachmentId', auth, BugsController.downloadAttachment);
router.post('/bugs/:id/attachments', auth, BugsController.createAttachment);
router.post('/bugs/:id/attachments/upload', auth, rawUpload, BugsController.uploadAttachment);
router.patch('/bugs/:id/attachments/:attachmentId', auth, BugsController.updateAttachment);
router.delete('/bugs/:id/attachments/:attachmentId', auth, BugsController.deleteAttachment);
router.patch('/bugs/:id/comments/:commentId', auth, BugsController.editComment);
router.get('/bugs/:id/comments/:commentId/history', auth, BugsController.getCommentHistory);
router.put('/bugs/:id/comments/:commentId/tags', auth, BugsController.setCommentTags);
router.post('/bugs', auth, BugsController.createBug);
router.patch('/bugs', auth, BugsController.bulkUpdateBugs);
router.put('/bugs/:id/report', auth, BugsController.updateReport);
router.post('/bugs/delete', auth, canTriage, BugsController.deleteBugs);
router.post('/bugs/restore', auth, canTriage, BugsController.restoreDeletedBugs);
router.get('/bugs/:id/transfer-options', auth, BugsController.getTransferOptions);
router.post('/bugs/:id/transfer', auth, BugsController.transferBugToProduct);
router.patch('/bugs/:id', auth, BugsController.updateBug);
router.get('/bugs/:id/activity', auth, BugsController.getBugActivity);
router.post('/bugs/:id/comments', auth, BugsController.addComment);

// products
router.get('/products', auth, ProductsController.listProducts);

// field values, assignees, reporters
router.get('/meta', auth, MetaController.getMeta);
router.get('/meta/assignable-users', auth, MetaController.getAssignableUsers);
router.get('/meta/reporters', auth, MetaController.getReporters);

// signed proof links from exported sheets (no session: every link is signed and expires)
router.get('/proof/bug/:bugId', ProofController.getBugProof);
router.get('/proof/file/:id', ProofController.getProofFile);

// admin: users
router.use('/admin/users', AdminUsersController.announceDirectoryChanges);
router.get('/admin/users', ...viewUsers, AdminUsersController.listUsers);
router.get('/admin/users/:id', ...viewUsers, AdminUsersController.getUser);
router.post('/admin/users', ...manageUsers, AdminUsersController.createUser);
router.post('/admin/users/:id/welcome', ...manageUsers, AdminUsersController.sendWelcomeEmail);
router.patch('/admin/users/:id', ...manageUsers, AdminUsersController.updateUser);
router.get('/admin/users/:id/delete-check', ...manageUsers, AdminUsersController.getDeleteCheck);
router.delete('/admin/users/:id', ...manageUsers, AdminUsersController.deleteUser);

// admin: products, components, sub-components
router.use('/admin/products', AdminProductsController.announceDirectoryChanges);
router.get('/admin/products', ...viewProducts, AdminProductsController.listProducts);
router.post('/admin/products', ...manageProducts, AdminProductsController.createProduct);
router.patch('/admin/products/:id', ...manageProducts, AdminProductsController.updateProduct);
router.delete('/admin/products/:id', ...manageProducts, AdminProductsController.deleteProduct);
router.post('/admin/products/:id/components', ...createComponents, AdminProductsController.createComponent);
router.post('/admin/products/:id/subcomponents', ...createComponents, AdminProductsController.addSubcomponent);
router.patch('/admin/products/:id/subcomponents/:subId', ...manageProducts, AdminProductsController.editSubcomponent);
router.patch(
  '/admin/products/:id/components/:componentId',
  ...createComponents,
  AdminProductsController.updateComponent,
);
router.delete(
  '/admin/products/:id/components/:componentId',
  ...createComponents,
  AdminProductsController.deleteComponent,
);
router.delete(
  '/admin/products/:id/subcomponents/:subId',
  ...manageProducts,
  AdminProductsController.deleteSubcomponent,
);

// admin: Bugzilla parameters and groups
router.get('/admin/meta/parameters', auth, AdminMetaController.getParameters);
router.get('/admin/meta/groups', auth, AdminMetaController.getGroups);

// admin: teams
router.get('/admin/teams', ...manageUsers, AdminTeamsController.listTeams);
router.post('/admin/teams', ...manageUsers, AdminTeamsController.createTeam);
router.patch('/admin/teams/:id', ...manageUsers, AdminTeamsController.updateTeam);
router.delete('/admin/teams/:id', ...manageUsers, AdminTeamsController.deleteTeam);

export const apiRouter = router;
