import { Outlet } from '../../models/Outlet.js';

export class OutletSearchRepository {
  async getNearbyOutlets(params: {
    pipeline: any[];
  }) {
    return Outlet.aggregate(params.pipeline);
  }

  async countNearbyOutlets(params: {
    pipeline: any[];
  }) {
    const results = await Outlet.aggregate([...params.pipeline, { $count: 'total' }]);
    return results[0]?.total || 0;
  }
}

export const outletSearchRepository = new OutletSearchRepository();
