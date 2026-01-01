import mongoose, { Document, Schema } from 'mongoose';

// Track individual user views for seen/unseen status
export interface IStoryView extends Document {
    userId: mongoose.Types.ObjectId;
    storyId: mongoose.Types.ObjectId;
    outletId: mongoose.Types.ObjectId; // For efficient querying
    viewedAt: Date;
    completedAllSlides: boolean; // True if user viewed all slides
}

const storyViewSchema = new Schema<IStoryView>({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    storyId: { type: Schema.Types.ObjectId, ref: 'Story', required: true },
    outletId: { type: Schema.Types.ObjectId, ref: 'Outlet', required: true },
    viewedAt: { type: Date, default: Date.now },
    completedAllSlides: { type: Boolean, default: false }
}, { timestamps: true });

// Compound index to ensure one view record per user per story
storyViewSchema.index({ userId: 1, storyId: 1 }, { unique: true });
storyViewSchema.index({ userId: 1, outletId: 1 }); // For checking seen status per outlet
storyViewSchema.index({ storyId: 1 }); // For counting views per story

export const StoryView = mongoose.model<IStoryView>('StoryView', storyViewSchema);
