import * as repo from '../../repositories/brand/brandMemberRepository.js';

interface MemberDoc {
    _id: unknown;
    user_id: unknown;
    role: string;
    permissions: unknown;
    assigned_outlets?: unknown[];
    created_at?: Date;
}

interface BrandDoc {
    owner_user_id?: { toString(): string };
    admin_user_id?: { toString(): string };
    settings?: { allow_cross_user_sync?: boolean };
    _id?: unknown;
}

interface MembershipDoc {
    role: string;
    permissions?: { can_sync_menu?: boolean; can_manage_outlets?: boolean; can_manage_members?: boolean };
    assigned_outlets?: unknown[];
    _id?: unknown;
}

export const getBrandMembers = async (brandId: string, userId: string) => {
    const brand = await repo.findBrandById(brandId);
    if (!brand) throw new Error('Brand not found');

    const membership = await repo.findMembership(brandId, userId) as MembershipDoc | null;
    if (!membership) throw new Error('ACCESS_DENIED');

    const members = await repo.findAllMembers(brandId) as MemberDoc[];
    return members.map(m => ({ id: m._id, userId: m.user_id, role: m.role, permissions: m.permissions, assignedOutlets: m.assigned_outlets, createdAt: m.created_at }));
};

export const addBrandMember = async (
    brandId: string,
    currentUserId: string,
    data: { userId: string; role?: string; permissions?: object; assignedOutlets?: string[] }
) => {
    const brand = await repo.findBrandById(brandId);
    if (!brand) throw new Error('Brand not found');

    const currentMembership = await repo.findMembership(brandId, currentUserId) as MembershipDoc | null;
    if (!currentMembership || currentMembership.role !== 'brand_owner') throw new Error('Only brand owners can add members');

    const existing = await repo.findMembership(brandId, data.userId);
    if (existing) throw new Error('User is already a member of this brand');

    const newMember = await repo.createMember({
        brand_id: brandId,
        user_id: data.userId,
        role: data.role || 'outlet_manager',
        permissions: data.permissions || { can_sync_menu: true, can_manage_outlets: false, can_manage_members: false },
        assigned_outlets: data.assignedOutlets || []
    }) as unknown as MemberDoc;

    return { id: newMember._id, userId: newMember.user_id, role: newMember.role, permissions: newMember.permissions, assignedOutlets: newMember.assigned_outlets };
};

export const updateBrandMemberRole = async (
    brandId: string,
    currentUserId: string,
    targetUserId: string,
    updates: { role?: string; permissions?: object; assignedOutlets?: string[] }
) => {
    const brand = await repo.findBrandById(brandId);
    if (!brand) throw new Error('Brand not found');

    const currentMembership = await repo.findMembership(brandId, currentUserId) as MembershipDoc | null;
    if (!currentMembership || currentMembership.role !== 'brand_owner') throw new Error('Only brand owners can update member roles');

    if (currentUserId === targetUserId && updates.role !== 'brand_owner') throw new Error('Cannot change your own role');

    const updateData: Record<string, unknown> = {};
    if (updates.role) updateData.role = updates.role;
    if (updates.permissions) updateData.permissions = updates.permissions;
    if (updates.assignedOutlets) updateData.assigned_outlets = updates.assignedOutlets;

    const updated = await repo.updateMember(brandId, targetUserId, updateData) as MemberDoc | null;
    if (!updated) throw new Error('Member not found');

    return { id: updated._id, userId: updated.user_id, role: updated.role, permissions: updated.permissions, assignedOutlets: updated.assigned_outlets };
};

export const removeBrandMember = async (brandId: string, currentUserId: string, targetUserId: string) => {
    const brand = await repo.findBrandById(brandId);
    if (!brand) throw new Error('Brand not found');

    const currentMembership = await repo.findMembership(brandId, currentUserId) as MembershipDoc | null;
    if (!currentMembership || currentMembership.role !== 'brand_owner') throw new Error('Only brand owners can remove members');

    if (currentUserId === targetUserId) throw new Error('Cannot remove yourself from the brand');

    const result = await repo.deleteMember(brandId, targetUserId);
    if (!result) throw new Error('Member not found');
};

export const getBrandOutlets = async (brandId: string, userId: string) => {
    const brand = await repo.findBrandById(brandId) as BrandDoc | null;
    if (!brand) throw new Error('Brand not found');

    let membership = await repo.findMembership(brandId, userId) as MembershipDoc | null;

    if (!membership) {
        const userOutlets = await repo.findUserOutletsForBrand(brandId, userId);
        if (userOutlets.length > 0) {
            const isBrandOwner = brand.owner_user_id?.toString() === userId || brand.admin_user_id?.toString() === userId;
            membership = await repo.createMember({
                brand_id: brandId,
                user_id: userId,
                role: isBrandOwner ? 'brand_owner' : 'outlet_manager',
                permissions: { can_sync_menu: true, can_manage_outlets: isBrandOwner, can_manage_members: isBrandOwner }
            }) as unknown as MembershipDoc;
            if (isBrandOwner && !brand.settings?.allow_cross_user_sync) {
                await repo.enableCrossUserSync(brandId);
            }
        }
    }

    if (!membership) throw new Error('ACCESS_DENIED');

    if (membership.permissions?.can_sync_menu) return repo.findApprovedOutlets(brandId);
    return repo.findUserApprovedOutlets(brandId, userId);
};

export const getBrandMemberPermissions = async (brandId: string, userId: string) => {
    const brand = await repo.findBrandById(brandId) as BrandDoc | null;
    if (!brand) throw new Error('Brand not found');

    let membership = await repo.findMembership(brandId, userId) as MembershipDoc | null;

    if (!membership) {
        const userOutlets = await repo.findUserOutletsForBrand(brandId, userId);
        if (userOutlets.length > 0) {
            const isBrandOwner = brand.owner_user_id?.toString() === userId || brand.admin_user_id?.toString() === userId;
            membership = await repo.createMember({
                brand_id: brandId,
                user_id: userId,
                role: isBrandOwner ? 'brand_owner' : 'outlet_manager',
                permissions: { can_sync_menu: true, can_manage_outlets: isBrandOwner, can_manage_members: isBrandOwner }
            }) as unknown as MembershipDoc;
        }
    }

    if (!membership) {
        return { isMember: false, role: null, permissions: { can_sync_menu: false, can_manage_outlets: false, can_manage_members: false } };
    }

    return { isMember: true, role: membership.role, permissions: membership.permissions, assignedOutlets: membership.assigned_outlets };
};

export const updateBrandSettings = async (brandId: string, userId: string, settings: { allow_cross_user_sync?: boolean }) => {
    const brand = await repo.findBrandById(brandId) as BrandDoc | null;
    if (!brand) throw new Error('Brand not found');

    const membership = await repo.findMembership(brandId, userId) as MembershipDoc | null;
    if (!membership || membership.role !== 'brand_owner') throw new Error('Only brand owners can update brand settings');

    const updates: Record<string, unknown> = {};
    if (settings.allow_cross_user_sync !== undefined) updates['settings.allow_cross_user_sync'] = settings.allow_cross_user_sync;

    const updated = await repo.updateBrandSettings(brandId, updates) as { _id: unknown; settings: unknown } | null;
    return { id: updated?._id, settings: updated?.settings };
};
