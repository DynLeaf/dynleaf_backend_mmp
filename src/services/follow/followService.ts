import * as followRepo from '../../repositories/followRepository.js';
import * as outletService from '../outletService.js';
import { AppError, ErrorCode } from '../../errors/AppError.js';

export const followOutlet = async (userId: string, requestedOutletId: string) => {
  const outlet = await outletService.getOutletById(requestedOutletId);
  if (!outlet) {
    throw new AppError('Outlet not found', 404, ErrorCode.OUTLET_NOT_FOUND);
  }

  const actualOutletId = String(outlet._id);
  await followRepo.upsertFollow(userId, actualOutletId);
  return { message: 'Followed successfully' };
};

export const unfollowOutlet = async (userId: string, requestedOutletId: string) => {
  const outlet = await outletService.getOutletById(requestedOutletId);
  const actualOutletId = outlet ? String(outlet._id) : requestedOutletId;

  await followRepo.removeFollow(userId, actualOutletId);
  return { message: 'Unfollowed successfully' };
};

export const checkFollowStatus = async (userId: string, requestedOutletId: string) => {
  const outlet = await outletService.getOutletById(requestedOutletId);
  const actualOutletId = outlet ? String(outlet._id) : requestedOutletId;

  const following = await followRepo.isFollowing(userId, actualOutletId);
  return { is_following: following };
};

export const getOutletFollowersCount = async (requestedOutletId: string) => {
  const outlet = await outletService.getOutletById(requestedOutletId);
  const actualOutletId = outlet ? String(outlet._id) : requestedOutletId;

  const count = await followRepo.countByOutlet(actualOutletId);
  return { count };
};

export const getFollowedOutlets = async (userId: string, page: number, limit: number) => {
  const skip = (page - 1) * limit;

  const [follows, total] = await Promise.all([
    followRepo.getFollowedOutletsAggregate(userId, skip, limit),
    followRepo.countByUser(userId)
  ]);

  return {
    follows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total
    }
  };
};
