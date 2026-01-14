import { Response } from 'express';
import { User } from '../models/User.js';
import { Follow } from '../models/Follow.js';
import { saveBase64Image } from '../utils/fileUpload.js';
import { AuthRequest } from '../middleware/authMiddleware.js';

export const getUserProfile = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({
                status: false,
                data: null,
                message: 'Unauthorized',
                error: 'User not authenticated'
            });
        }

        const user = await User.findById(userId).select('-password_hash');

        if (!user) {
            return res.status(404).json({
                status: false,
                data: null,
                message: 'User not found',
                error: null
            });
        }

        // Get following count
        const followingCount = await Follow.countDocuments({ user: userId });

        res.json({
            status: true,
            data: {
                ...user.toObject(),
                following_count: followingCount
            },
            message: 'User profile retrieved successfully',
            error: null
        });
    } catch (error: any) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({
            status: false,
            data: null,
            message: 'Failed to fetch user profile',
            error: error.message
        });
    }
};

export const updateUserProfile = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({
                status: false,
                data: null,
                message: 'Unauthorized',
                error: 'User not authenticated'
            });
        }

        const { full_name, email, bio } = req.body;
        const avatar_url: unknown =
            (req.body?.avatar_url as unknown) ??
            (req.body?.avatarUrl as unknown) ??
            (req.body?.imageUrl as unknown) ??
            (req.body?.url as unknown);

        const updateData: any = {};

        if (full_name !== undefined) updateData.full_name = full_name;
        if (email !== undefined) updateData.email = email;
        if (bio !== undefined) updateData.bio = bio;
        if (typeof avatar_url === 'string') {
            if (avatar_url.startsWith('data:image')) {
                try {
                    const uploadResult = await saveBase64Image(avatar_url, 'avatars');
                    updateData.avatar_url = uploadResult.url;
                } catch (uploadError) {
                    console.error('Error uploading avatar:', uploadError);
                    return res.status(400).json({
                        status: false,
                        data: null,
                        message: 'Failed to upload avatar image',
                        error: 'Image upload failed'
                    });
                }
            } else {
                updateData.avatar_url = avatar_url;
            }
        } else if (avatar_url !== undefined) {
            return res.status(400).json({
                status: false,
                data: null,
                message: 'Invalid avatar_url',
                error: 'avatar_url must be a string'
            });
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({
                status: false,
                data: null,
                message: 'No valid fields to update',
                error: 'Please provide at least one field to update'
            });
        }

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $set: updateData },
            { new: true, runValidators: true }
        ).select('-password_hash');

        if (!updatedUser) {
            return res.status(404).json({
                status: false,
                data: null,
                message: 'User not found',
                error: null
            });
        }

        res.json({
            status: true,
            data: updatedUser,
            message: 'Profile updated successfully',
            error: null
        });
    } catch (error: any) {
        console.error('Error updating user profile:', error);
        res.status(500).json({
            status: false,
            data: null,
            message: 'Failed to update profile',
            error: error.message
        });
    }
};

export const uploadAvatar = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({
                status: false,
                data: null,
                message: 'Unauthorized',
                error: 'User not authenticated'
            });
        }

        const { image, imageUrl, url } = req.body as { image?: string; imageUrl?: string; url?: string };
        const input = imageUrl || url || image;

        if (!input || typeof input !== 'string') {
            return res.status(400).json({
                status: false,
                data: null,
                message: 'Invalid image data',
                error: 'Please provide image (base64) or imageUrl (hosted URL)'
            });
        }

        let avatarUrl: string;
        if (input.startsWith('data:image')) {
            const uploadResult = await saveBase64Image(input, 'outlets');
            avatarUrl = uploadResult.url;
        } else if (input.startsWith('http://') || input.startsWith('https://') || input.startsWith('/uploads/')) {
            avatarUrl = input;
        } else {
            return res.status(400).json({
                status: false,
                data: null,
                message: 'Invalid image data',
                error: 'Please provide a valid base64 image or a hosted URL'
            });
        }

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $set: { avatar_url: avatarUrl } },
            { new: true }
        ).select('-password_hash');

        res.json({
            status: true,
            data: {
                avatar_url: avatarUrl,
                user: updatedUser
            },
            message: 'Avatar uploaded successfully',
            error: null
        });
    } catch (error: any) {
        console.error('Error uploading avatar:', error);
        res.status(500).json({
            status: false,
            data: null,
            message: 'Failed to upload avatar',
            error: error.message
        });
    }
};
