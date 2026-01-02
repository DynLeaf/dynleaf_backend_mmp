import { Request, Response } from 'express';
import { Outlet } from '../models/Outlet.js';
import { sendError, sendSuccess } from '../utils/response.js';
import { getOutletSubscriptionSummary } from '../utils/subscriptionSummary.js';

export const getOutletSubscription = async (req: Request, res: Response) => {
  try {
    const { outletId } = req.params;

    const outlet = await Outlet.findById(outletId).select('name');
    if (!outlet) return sendError(res, 'Outlet not found', null, 404);

    const summary = await getOutletSubscriptionSummary(outletId, {
      assignedByUserId: (req as any).user?.id,
      notes: 'Auto-created on subscription access'
    });

    return sendSuccess(res, {
      outlet: { _id: outlet._id, name: outlet.name },
      ...summary
    });
  } catch (error: any) {
    console.error('getOutletSubscription error:', error);
    return sendError(res, error.message || 'Failed to fetch subscription');
  }
};
