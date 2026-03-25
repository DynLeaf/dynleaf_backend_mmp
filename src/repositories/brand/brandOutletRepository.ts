import { Outlet } from '../../models/Outlet.js';
import { FoodItem } from '../../models/FoodItem.js';
import { Follow } from '../../models/Follow.js';
import { MallQRConfig } from '../../models/MallQRConfig.js';
import { OperatingHours } from '../../models/OperatingHours.js';
import mongoose from 'mongoose';

export const runOutletAggregate = (pipeline: mongoose.PipelineStage[]): Promise<unknown[]> =>
    Outlet.aggregate(pipeline);

export const getFoodItemDistinct = (field: string, filter: object): Promise<mongoose.Types.ObjectId[]> =>
    FoodItem.distinct(field, filter) as Promise<mongoose.Types.ObjectId[]>;

export const countUserFollow = (outletId: unknown) =>
    Follow.countDocuments({ outlet: outletId as any });

export const findUserFollow = (userId: string, outletId: unknown) =>
    Follow.findOne({ user: userId, outlet: outletId as any }).lean();

export const getMallQRConfigs = (mallKeys: string[]) =>
    MallQRConfig.find({ mall_key: { $in: mallKeys } }).lean();

export const getOperatingHours = (outletId: unknown) =>
    OperatingHours.find({ outlet_id: outletId as string })
        .sort({ day_of_week: 1 })
        .select('day_of_week open_time close_time is_closed')
        .lean();

export const countFoodItems = (outletId: unknown) =>
    FoodItem.countDocuments({ outlet_id: outletId as any, is_available: true, is_active: true });

export const aggregateFoodItems = (pipeline: mongoose.PipelineStage[]): Promise<unknown[]> =>
    FoodItem.aggregate(pipeline);

export const findActiveApprovedOutlets = () =>
    Outlet.find({ status: 'ACTIVE', approval_status: 'APPROVED' })
        .populate('brand_id', 'name slug logo_url verification_status is_active')
        .select('name slug address media avg_rating total_reviews location brand_id')
        .lean();
