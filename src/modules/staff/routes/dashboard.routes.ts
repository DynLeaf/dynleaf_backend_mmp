import { Router } from 'express';
import { dashboardController } from '../controllers/dashboard.controller.js';
import { staffAuthenticate, requireRole } from '../middleware/staffAuth.middleware.js';

const router = Router();

router.use(staffAuthenticate);

router.get('/sales', requireRole('salesman'), dashboardController.getSalesDashboard);
router.get('/sales/priority', requireRole('salesman'), dashboardController.getPriorityTasks);
router.post('/sales/priority/:customerId/reply', requireRole('salesman'), dashboardController.replyToPriorityNote);

router.get('/crafter', requireRole('crafter'), dashboardController.getCrafterDashboard);
router.get('/admin/sales-tracking', requireRole('admin'), dashboardController.getAdminSalesTracking);
router.get('/admin/sales-tracking/:id', requireRole('admin'), dashboardController.getAdminSalespersonDetails);
router.get('/admin/sales-tracking/:id/customers', requireRole('admin'), dashboardController.getAdminSalespersonCustomers);
router.post('/admin/sales-tracking/:id/customers/:customerId/priority', requireRole('admin'), dashboardController.setAdminCustomerPriority);
router.get('/admin/crafter-tracking', requireRole('admin'), dashboardController.getAdminCrafterTracking);
router.get('/admin/crafter-tracking/:id', requireRole('admin'), dashboardController.getAdminCrafterDetails);

export default router;
