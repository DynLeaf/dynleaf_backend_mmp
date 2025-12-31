import { Request, Response } from 'express';
import { DishVote } from '../models/DishVote.js';
import { FoodItem } from '../models/FoodItem.js';
import mongoose from 'mongoose';

export const toggleVote = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { foodItemId } = req.params;
    const { voteType } = req.body;
    const userId = (req as any).user.id;

    if (!['up', 'down'].includes(voteType)) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Invalid vote type' });
    }

    // Check existing vote
    const existingVote = await DishVote.findOne({
      user_id: userId,
      food_item_id: foodItemId
    }).session(session);

    let action: 'added' | 'removed' | 'changed';
    let newVoteType: 'up' | 'down' | null = voteType;

    if (existingVote) {
      if (existingVote.vote_type === voteType) {
        // Toggle off (remove vote)
        await DishVote.findByIdAndDelete(existingVote._id).session(session);
        action = 'removed';
        newVoteType = null;

        // Update counts
        const updateField = voteType === 'up' ? 'upvote_count' : 'downvote_count';
        await FoodItem.findByIdAndUpdate(
          foodItemId, 
          { $inc: { [updateField]: -1 } },
          { session }
        );

      } else {
        // Change vote (e.g., up -> down)
        existingVote.vote_type = voteType;
        await existingVote.save({ session });
        action = 'changed';

        // Update counts: decrement old, increment new
        const oldField = voteType === 'up' ? 'downvote_count' : 'upvote_count';
        const newField = voteType === 'up' ? 'upvote_count' : 'downvote_count';
        
        await FoodItem.findByIdAndUpdate(
          foodItemId, 
          { $inc: { [oldField]: -1, [newField]: 1 } },
          { session }
        );
      }
    } else {
      // Create new vote
      await DishVote.create(
        [{
          user_id: userId,
          food_item_id: foodItemId,
          vote_type: voteType
        }],
        { session }
      );
      action = 'added';

      // Update counts
      const updateField = voteType === 'up' ? 'upvote_count' : 'downvote_count';
      await FoodItem.findByIdAndUpdate(
        foodItemId, 
        { $inc: { [updateField]: 1 } },
        { session }
      );
    }

    // Get updated counts to return
    const updatedFoodItem = await FoodItem.findById(foodItemId)
      .select('upvote_count')
      .session(session);

    await session.commitTransaction();

    res.json({
      success: true,
      action,
      currentVote: newVoteType,
      upvoteCount: updatedFoodItem?.upvote_count || 0
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Error toggling vote:', error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    session.endSession();
  }
};

export const getUserVote = async (req: Request, res: Response) => {
  try {
    const { foodItemId } = req.params;
    const userId = (req as any).user.id;

    const vote = await DishVote.findOne({
      user_id: userId,
      food_item_id: foodItemId
    });

    res.json({
      success: true,
      voteType: vote ? vote.vote_type : null
    });

  } catch (error) {
    console.error('Error fetching user vote:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getVoteAnalytics = async (req: Request, res: Response) => {
  try {
    const { foodItemId } = req.params;

    // Get vote counts
    const [upvotes, downvotes] = await Promise.all([
      DishVote.countDocuments({ food_item_id: foodItemId, vote_type: 'up' }),
      DishVote.countDocuments({ food_item_id: foodItemId, vote_type: 'down' })
    ]);

    // Get vote trend (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const voteTrend = await DishVote.aggregate([
      {
        $match: {
          food_item_id: new mongoose.Types.ObjectId(foodItemId),
          created_at: { $gte: sevenDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$created_at' } },
            vote_type: '$vote_type'
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.date': 1 }
      }
    ]);

    res.json({
      success: true,
      analytics: {
        upvotes,
        downvotes,
        total: upvotes + downvotes,
        ratio: upvotes / (upvotes + downvotes || 1),
        trend: voteTrend
      }
    });

  } catch (error) {
    console.error('Error fetching vote analytics:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
