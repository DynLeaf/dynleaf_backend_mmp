import { OnboardingSession } from '../../models/OnboardingSession.js';

interface StepData {
    [key: string]: unknown;
}

export const findActiveDraft = (userId: string) =>
    OnboardingSession.findOne({ user_id: userId, status: 'draft' }).sort({ updated_at: -1 });

export const createDraft = (userId: string, stepNumber: number) =>
    OnboardingSession.create({
        user_id: userId,
        status: 'draft',
        current_step: stepNumber,
        step_data: {}
    });

export const saveDraftStep = async (
    session: unknown,
    stepNumber: number,
    stepData: StepData,
    brandId?: string,
    outletId?: string
) => {
    const s = session as {
        current_step: number;
        step_data: StepData;
        brand_id?: string;
        outlet_id?: string;
        save: () => Promise<void>;
    };
    s.current_step = stepNumber;
    s.step_data = { ...s.step_data, [`step${stepNumber}`]: stepData };
    if (brandId) s.brand_id = brandId;
    if (outletId) s.outlet_id = outletId;
    await s.save();
    return s;
};

export const findDraftById = (sessionId: string, userId: string) =>
    OnboardingSession.findOne({ _id: sessionId, user_id: userId, status: 'draft' });

export const deleteDraftById = (session: { deleteOne: () => Promise<void> }) =>
    session.deleteOne();

export const deleteAllDrafts = (userId: string) =>
    OnboardingSession.deleteMany({ user_id: userId, status: 'draft' });

export const findSessionsWithPopulate = (query: object) =>
    OnboardingSession.find(query)
        .populate('brand_id', 'name logo_url')
        .populate('outlet_id', 'name')
        .sort({ updated_at: -1 });
