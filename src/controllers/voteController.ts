import { Request, Response } from 'express';
import { voteService } from '../services/vote/voteService.js';

export const toggleVote = async (req: Request, res: Response) => {
  try {
    const { foodItemId } = req.params;
    const { voteType } = req.body;
    const userId = (req as any).user.id;

    if (!['up', 'down'].includes(voteType)) {
      return res.status(400).json({ message: 'Invalid vote type' });
    }

    const result = await voteService.toggleVote(userId, foodItemId, voteType);
    return res.json(result);
  } catch (error: any) {
    console.error('Error toggling vote:', error);
    return res.status(error.statusCode || 500).json({ 
      message: error.message || 'Server error' 
    });
  }
};

export const getUserVote = async (req: Request, res: Response) => {
  try {
    const { foodItemId } = req.params;
    const userId = (req as any).user.id;

    const result = await voteService.getUserVote(userId, foodItemId);
    return res.json(result);
  } catch (error: any) {
    console.error('Error fetching user vote:', error);
    return res.status(error.statusCode || 500).json({ 
      message: error.message || 'Server error' 
    });
  }
};

export const getVoteAnalytics = async (req: Request, res: Response) => {
  try {
    const { foodItemId } = req.params;

    const result = await voteService.getVoteAnalytics(foodItemId);
    return res.json(result);
  } catch (error: any) {
    console.error('Error fetching vote analytics:', error);
    return res.status(error.statusCode || 500).json({ 
      message: error.message || 'Server error' 
    });
  }
};

export const submitVoteReview = async (req: Request, res: Response) => {
  try {
    const { foodItemId } = req.params;
    const { reviewText } = req.body;
    const userId = (req as any).user.id;

    if (!reviewText || typeof reviewText !== 'string' || !reviewText.trim()) {
      return res.status(400).json({ message: 'Review text is required' });
    }

    const result = await voteService.submitVoteReview(userId, foodItemId, reviewText);
    return res.json(result);
  } catch (error: any) {
    console.error('Error submitting vote review:', error);
    return res.status(error.statusCode || 500).json({ 
      message: error.message || 'Server error' 
    });
  }
};
