import { Request, Response } from 'express';
import { User } from '../models/User.js';
import jwt from 'jsonwebtoken';
import { sendSuccess, sendError } from '../utils/response.js';
import AppError from '../utils/AppError.js';

export const sendOtp = async (req: Request, res: Response) => {
    try {
        console.log('reached');
        const { phone } = req.body;
        if (!phone) return sendError(res, 'Phone number is required', 'Phone number is required', 400);
        console.log(`Sending OTP to ${phone}: 123456`);
        return sendSuccess(res, { sentTo: phone }, 'OTP sent successfullyss', 200);
    } catch (error: any) {
        return sendError(res, error, error?.message || 'Failed to send OTP', 500);
    }
};

export const verifyOtp = async (req: Request, res: Response) => {
    try {
        const { phone, otp } = req.body;
        if (!phone || !otp) return sendError(res, 'Phone and OTP are required', 'Phone and OTP are required', 400);

        if (otp !== '123456') return sendError(res, 'Invalid OTP', 'Invalid OTP', 401);
        let user = await User.findOne({ phone });
        if (!user) {
            user = await User.create({ phone });
        }
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'supersecret', { expiresIn: '7d' });
        return sendSuccess(res, {
            token,
            user: {
                id: user._id,
                currentStep: user.currentStep,
            },
        });
    } catch (error: any) {
        // If this is an operational AppError, pass its info via sendError
        if (error instanceof AppError) {
            return sendError(res, error, error.message, error.statusCode || 400);
        }
        return sendError(res, error, error?.message || 'Failed to verify OTP', 500);
    }
};
