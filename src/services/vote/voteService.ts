import mongoose from 'mongoose';
import { voteRepository } from '../../repositories/vote/voteRepository.js';
import * as foodItemRepository from '../../repositories/foodItemRepository.js';
import { 
  ToggleVoteResponseDto, 
  UserVoteResponseDto, 
  VoteAnalyticsResponseDto 
} from '../../dto/vote/vote.dto.js';
import { AppError, ErrorCode } from '../../errors/AppError.js';

export class VoteService {
  async toggleVote(userId: string, foodItemIdOrSlug: string, voteType: 'up' | 'down'): Promise<ToggleVoteResponseDto> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Resolve food item ID
      let foodItemId = foodItemIdOrSlug;
      if (!mongoose.Types.ObjectId.isValid(foodItemIdOrSlug)) {
        const foodItem = await foodItemRepository.findBySlug(foodItemIdOrSlug);
        if (!foodItem) {
          throw new AppError('Food item not found', 404);
        }
        foodItemId = foodItem._id.toString();
      } else {
        const foodItem = await foodItemRepository.findById(foodItemIdOrSlug);
        if (!foodItem) {
          throw new AppError('Food item not found', 404);
        }
      }

      const existingVote = await voteRepository.findUserVote(userId, foodItemId);
      
      let action: 'added' | 'removed' | 'changed';
      let currentVote: 'up' | 'down' | null = voteType;
      let updatedFoodItem;

      if (existingVote) {
        if (existingVote.vote_type === voteType) {
          // Toggle off
          updatedFoodItem = await voteRepository.removeVote(existingVote._id.toString(), foodItemId, voteType, session);
          action = 'removed';
          currentVote = null;
        } else {
          // Change vote
          updatedFoodItem = await voteRepository.updateVote(existingVote._id.toString(), foodItemId, existingVote.vote_type as 'up' | 'down', voteType, session);
          action = 'changed';
        }
      } else {
        // New vote
        updatedFoodItem = await voteRepository.createVote(userId, foodItemId, voteType, session);
        action = 'added';
      }

      await session.commitTransaction();

      return {
        success: true,
        action,
        currentVote,
        upvoteCount: updatedFoodItem?.upvote_count || 0
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async getUserVote(userId: string, foodItemIdOrSlug: string): Promise<UserVoteResponseDto> {
    let foodItemId = foodItemIdOrSlug;
    if (!mongoose.Types.ObjectId.isValid(foodItemIdOrSlug)) {
      const foodItem = await foodItemRepository.findBySlug(foodItemIdOrSlug);
      if (!foodItem) throw new AppError('Food item not found', 404);
      foodItemId = foodItem._id.toString();
    }

    const vote = await voteRepository.findUserVote(userId, foodItemId);
    return {
      success: true,
      voteType: vote ? (vote.vote_type as 'up' | 'down') : null
    };
  }

  async getVoteAnalytics(foodItemIdOrSlug: string): Promise<VoteAnalyticsResponseDto> {
    let foodItemId = foodItemIdOrSlug;
    if (!mongoose.Types.ObjectId.isValid(foodItemIdOrSlug)) {
      const foodItem = await foodItemRepository.findBySlug(foodItemIdOrSlug);
      if (!foodItem) throw new AppError('Food item not found', 404);
      foodItemId = foodItem._id.toString();
    }

    const [upvotes, downvotes] = await Promise.all([
      voteRepository.countVotes(foodItemId, 'up'),
      voteRepository.countVotes(foodItemId, 'down')
    ]);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const trend = await voteRepository.getVoteTrend(foodItemId, sevenDaysAgo);

    const total = upvotes + downvotes;
    return {
      success: true,
      analytics: {
        upvotes,
        downvotes,
        total,
        ratio: total > 0 ? upvotes / total : 0,
        trend
      }
    };
  }

  async submitVoteReview(userId: string, foodItemIdOrSlug: string, reviewText: string) {
    let foodItemId = foodItemIdOrSlug;
    if (!mongoose.Types.ObjectId.isValid(foodItemIdOrSlug)) {
      const foodItem = await foodItemRepository.findBySlug(foodItemIdOrSlug);
      if (!foodItem) throw new AppError('Food item not found', 404);
      foodItemId = foodItem._id.toString();
    }

    const trimmed = reviewText.trim().slice(0, 500);
    const vote = await voteRepository.updateVoteReview(userId, foodItemId, trimmed, new Date());

    if (!vote) {
      throw new AppError('You must vote on this dish before leaving a review', 404);
    }

    return {
      success: true,
      message: 'Review submitted successfully',
      reviewText: vote.review_text,
      submittedAt: vote.review_submitted_at
    };
  }
}

export const voteService = new VoteService();
