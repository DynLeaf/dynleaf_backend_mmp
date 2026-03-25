import mongoose from 'mongoose';
import { DishVote } from '../../models/DishVote.js';
import { FoodItem } from '../../models/FoodItem.js';

export class VoteRepository {
  async findUserVote(userId: string, foodItemId: string) {
    return DishVote.findOne({
      user_id: new mongoose.Types.ObjectId(userId),
      food_item_id: new mongoose.Types.ObjectId(foodItemId)
    }).lean();
  }

  async findUserVotesForItems(userId: string, foodItemIds: string[]) {
    return DishVote.find({
      user_id: new mongoose.Types.ObjectId(userId),
      food_item_id: { $in: foodItemIds.map(id => new mongoose.Types.ObjectId(id)) }
    }).select('food_item_id vote_type').lean();
  }

  async createVote(userId: string, foodItemId: string, voteType: 'up' | 'down', session?: mongoose.ClientSession) {
    await DishVote.create(
      [{
        user_id: new mongoose.Types.ObjectId(userId),
        food_item_id: new mongoose.Types.ObjectId(foodItemId),
        vote_type: voteType
      }],
      { session }
    );

    const updateField = voteType === 'up' ? 'upvote_count' : 'downvote_count';
    return FoodItem.findByIdAndUpdate(
      foodItemId,
      { $inc: { [updateField]: 1 } },
      { session, new: true }
    ).lean();
  }

  async updateVote(voteId: string, foodItemId: string, oldVoteType: 'up' | 'down', newVoteType: 'up' | 'down', session?: mongoose.ClientSession) {
    await DishVote.findByIdAndUpdate(
      voteId,
      { vote_type: newVoteType },
      { session }
    );

    const oldField = oldVoteType === 'up' ? 'upvote_count' : 'downvote_count';
    const newField = newVoteType === 'up' ? 'upvote_count' : 'downvote_count';

    return FoodItem.findByIdAndUpdate(
      foodItemId,
      { $inc: { [oldField]: -1, [newField]: 1 } },
      { session, new: true }
    ).lean();
  }

  async removeVote(voteId: string, foodItemId: string, voteType: 'up' | 'down', session?: mongoose.ClientSession) {
    await DishVote.findByIdAndDelete(voteId).session(session || null);

    const updateField = voteType === 'up' ? 'upvote_count' : 'downvote_count';
    return FoodItem.findByIdAndUpdate(
      foodItemId,
      { $inc: { [updateField]: -1 } },
      { session, new: true }
    ).lean();
  }

  async updateVoteReview(userId: string, foodItemId: string, reviewText: string, reviewDate: Date) {
    return DishVote.findOneAndUpdate(
      { 
        user_id: new mongoose.Types.ObjectId(userId), 
        food_item_id: new mongoose.Types.ObjectId(foodItemId) 
      },
      { review_text: reviewText, review_submitted_at: reviewDate },
      { new: true }
    ).lean();
  }

  async countVotes(foodItemId: string, voteType: 'up' | 'down') {
    return DishVote.countDocuments({ 
      food_item_id: new mongoose.Types.ObjectId(foodItemId), 
      vote_type: voteType 
    });
  }

  async getVoteTrend(foodItemId: string, since: Date) {
    return DishVote.aggregate([
      {
        $match: {
          food_item_id: new mongoose.Types.ObjectId(foodItemId),
          created_at: { $gte: since }
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
  }
}

export const voteRepository = new VoteRepository();
