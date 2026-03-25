import * as sessionRepo from '../../repositories/onboarding/onboardingSessionRepository.js';
import * as complianceRepo from '../../repositories/onboarding/complianceRepository.js';
import mongoose from 'mongoose';

interface StepSaveResult {
    sessionId: unknown;
    currentStep: number;
    lastSavedAt: Date;
}

interface DraftResult {
    hasDraft: boolean;
    sessionId?: unknown;
    currentStep?: number;
    lastSavedAt?: Date;
    brandId?: string;
    outletId?: string;
    stepData?: object;
}

type SessionDocument = {
    _id: unknown;
    current_step: number;
    step_data: object;
    brand_id?: string;
    outlet_id?: string;
    updated_at: Date;
};

export const saveOnboardingStep = async (
    userId: string,
    stepNumber: number,
    stepData: Record<string, unknown>
): Promise<StepSaveResult> => {
    let session = await sessionRepo.findActiveDraft(userId);

    if (!session) {
        session = await sessionRepo.createDraft(userId, stepNumber);
    }

    const saved = await sessionRepo.saveDraftStep(
        session,
        stepNumber,
        stepData,
        typeof stepData.brandId === 'string' ? stepData.brandId : undefined,
        typeof stepData.outletId === 'string' ? stepData.outletId : undefined
    ) as unknown as SessionDocument;

    return {
        sessionId: saved._id,
        currentStep: saved.current_step,
        lastSavedAt: saved.updated_at
    };
};

export const getOnboardingDraft = async (userId: string): Promise<DraftResult> => {
    const session = await sessionRepo.findActiveDraft(userId) as SessionDocument | null;

    if (!session) {
        return { hasDraft: false, currentStep: 1 };
    }

    return {
        hasDraft: true,
        sessionId: session._id,
        currentStep: session.current_step,
        lastSavedAt: session.updated_at,
        brandId: session.brand_id,
        outletId: session.outlet_id,
        stepData: session.step_data
    };
};

export const getOnboardingSessions = (userId: string, status?: string) => {
    const query: Record<string, unknown> = { user_id: userId };
    if (status) query.status = status;
    return sessionRepo.findSessionsWithPopulate(query);
};

export const clearOnboardingDraft = async (userId: string, sessionId?: string): Promise<void> => {
    if (sessionId) {
        const session = await sessionRepo.findDraftById(sessionId, userId);
        if (!session) throw new Error('Draft session not found');
        await sessionRepo.deleteDraftById(session as { deleteOne: () => Promise<void> });
    } else {
        await sessionRepo.deleteAllDrafts(userId);
    }
};

export const createComplianceRecord = async (
    outletId: mongoose.Types.ObjectId | string,
    complianceData: { fssai?: string; gstNo?: string; gstPercent?: string }
): Promise<{ id: string } | null> => {
    if (!complianceData.fssai && !complianceData.gstNo) return null;

    const doc = await complianceRepo.createCompliance({
        outlet_id: outletId,
        fssai_number: complianceData.fssai?.trim() || undefined,
        gst_number: complianceData.gstNo?.trim()?.toUpperCase() || undefined,
        gst_percentage: complianceData.gstPercent ? parseFloat(complianceData.gstPercent) : undefined,
        is_verified: false
    });

    return { id: (doc as unknown as { _id: { toString(): string } })._id.toString() };
};
