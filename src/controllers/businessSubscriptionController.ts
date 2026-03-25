import { Request, Response } from 'express';
import { sendError, sendSuccess } from '../utils/response.js';
import { getOutletSubscriptionSummary } from '../utils/subscriptionSummary.js';
import * as outletService from '../services/outletService.js';

export const getOutletSubscription = async (req: Request, res: Response) => {
  try {
    const { outletId } = req.params;

    const outlet = await outletService.getOutletById(outletId);
    if (!outlet) return sendError(res, 'Outlet not found', null, 404);
    const outletObj = outlet as unknown as { _id: unknown; name: string };

    const summary = await getOutletSubscriptionSummary(outletId, {
      assignedByUserId: (req as any).user?.id,
      notes: 'Auto-created on subscription access'
    });

    return sendSuccess(res, {
      outlet: { _id: outletObj._id, name: outletObj.name },
      ...summary
    });
  } catch (error: any) {
    console.error('getOutletSubscription error:', error);
    return sendError(res, error.message || 'Failed to fetch subscription');
  }
};
