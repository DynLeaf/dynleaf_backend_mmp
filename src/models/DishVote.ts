import mongoose, { Document, Schema } from 'mongoose';

export interface IDishVote extends Document {
    user_id: mongoose.Types.ObjectId;
    food_item_id: mongoose.Types.ObjectId;
    vote_type: 'up' | 'down';
    created_at: Date;
    updated_at: Date;
}

const dishVoteSchema = new Schema<IDishVote>({
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    food_item_id: { type: Schema.Types.ObjectId, ref: 'FoodItem', required: true, index: true },
    vote_type: { type: String, enum: ['up', 'down'], required: true },
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Compound index to ensure one vote per user per food item
dishVoteSchema.index({ user_id: 1, food_item_id: 1 }, { unique: true });

// Index for analytics queries
dishVoteSchema.index({ food_item_id: 1, vote_type: 1 });
dishVoteSchema.index({ created_at: -1 });

export const DishVote = mongoose.model<IDishVote>('DishVote', dishVoteSchema);
