import mongoose from 'mongoose';
import { Follow } from '../models/Follow.js';

export const countByUser = async (userId: string): Promise<number> => {
  return Follow.countDocuments({ user: userId });
};

export const countByOutlet = async (outletId: string): Promise<number> => {
  return Follow.countDocuments({ outlet: outletId });
};

export const upsertFollow = async (userId: string, outletId: string): Promise<void> => {
  await Follow.findOneAndUpdate(
    { user: userId, outlet: outletId },
    { $setOnInsert: { user: userId, outlet: outletId } },
    { upsert: true, new: true }
  );
};

export const removeFollow = async (userId: string, outletId: string): Promise<void> => {
  await Follow.findOneAndDelete({ user: userId, outlet: outletId });
};

export const isFollowing = async (userId: string, outletId: string): Promise<boolean> => {
  const follow = await Follow.findOne({ user: userId, outlet: outletId }).lean();
  return !!follow;
};

export const getFollowedOutletsAggregate = async (userId: string, skip: number, limit: number) => {
  return Follow.aggregate([
    { $match: { user: new mongoose.Types.ObjectId(userId) } },
    { $sort: { created_at: -1 } },
    { $skip: skip },
    { $limit: limit },
    {
      $lookup: {
        from: 'outlets',
        localField: 'outlet',
        foreignField: '_id',
        as: 'outlet'
      }
    },
    { $unwind: { path: '$outlet', preserveNullAndEmptyArrays: false } },
    {
      $lookup: {
        from: 'brands',
        localField: 'outlet.brand_id',
        foreignField: '_id',
        as: 'outlet.brand'
      }
    },
    { $unwind: { path: '$outlet.brand', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        user: 1,
        outlet: {
          _id: 1,
          name: 1,
          banner_image_url: 1,
          cover_image_url: 1,
          location: 1,
          address: 1,
          brand: {
            _id: '$outlet.brand._id',
            logo_url: '$outlet.brand.logo_url',
            name: '$outlet.brand.name',
            cuisines: '$outlet.brand.cuisines'
          }
        },
        created_at: 1
      }
    }
  ]);
};

export const findByOutlet = async (outletId: string) => {
    return await Follow.find({ outlet: outletId }).select('user').lean();
};
