import { Request, Response } from 'express';
import { User } from '../models/User.js';
import jwt from 'jsonwebtoken';

export const sendOtp = async (req: Request, res: Response) => {
    try {
        const { phone } = req.body;
        if (!phone) return res.status(400).json({ error: 'Phone number is required' });

        // Logic to send OTP (Mocked for now)
        console.log(`Sending OTP to ${phone}: 123456`);

        res.json({ success: true, message: 'OTP sent successfully' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const verifyOtp = async (req: Request, res: Response) => {
    try {
        const { phone, otp } = req.body;
        if (!phone || !otp) return res.status(400).json({ error: 'Phone and OTP are required' });

        // Logic to verify OTP (Mocked: 123456 is valid)
        if (otp !== '123456') return res.status(401).json({ error: 'Invalid OTP' });

        let user = await User.findOne({ phone });
        if (!user) {
            user = await User.create({ phone });
        }

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'supersecret', { expiresIn: '7d' });

        res.json({
            token,
            user: {
                id: user._id,
                currentStep: user.currentStep
            }
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
