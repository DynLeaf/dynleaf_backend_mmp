import { outletQRRepository } from '../../repositories/qr/outletQRRepository.js';
import { mallQRRepository } from '../../repositories/qr/mallQRRepository.js';
import * as outletRepo from '../../repositories/outletRepository.js';
import {
    normalizeMallName,
    extractMallName,
    buildMallKey,
    getMallGroupKey,
    extractGroupKeyFromMallKey
} from '../../utils/mallKeyUtils.js';

export class QRConfigService {
    async getApprovedOutletsWithConfig(page: number, limit: number, search = '') {
        const skip = (page - 1) * limit;
        const query: Record<string, unknown> = { approval_status: 'APPROVED' };
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { slug: { $regex: search, $options: 'i' } }
            ];
        }

        const outlets = await outletRepo.findPaged(query, skip, limit) as unknown as Array<Record<string, unknown>>;
        const outletIds = outlets.map(o => (o._id as { toString(): string }).toString());
        const qrConfigs = await outletQRRepository.findByOutletIds(outletIds);
        const qrConfigMap = new Map(qrConfigs.map(config => [(config as unknown as { outlet_id: { toString(): string } }).outlet_id.toString(), config]));

        const enrichedOutlets = outlets.map(outlet => ({
            ...outlet,
            qr_config: qrConfigMap.get((outlet._id as { toString(): string }).toString()) || null
        }));

        const total = await outletRepo.countWithQuery(query);
        return { outlets: enrichedOutlets, total, page, limit, totalPages: Math.ceil(total / limit) };
    }

    async getDerivedMalls(page: number, limit: number, search = '') {
        const outlets = await outletRepo.findActiveApproved() as unknown as Array<Record<string, unknown>>;
        const mallMap = new Map<string, Record<string, unknown>>();

        for (const outlet of outlets) {
            const brand = outlet.brand_id as Record<string, unknown>;
            if (!brand || brand.verification_status !== 'approved' || !brand.is_active) continue;
            const mallName = normalizeMallName(extractMallName((outlet.address as Record<string, string>)?.full) || '');
            if (!mallName) continue;
            const mallKey = buildMallKey(mallName, (outlet.address as Record<string, string>)?.city, (outlet.address as Record<string, string>)?.state);
            const groupKey = getMallGroupKey(mallName);

            if (!mallMap.has(groupKey)) {
                mallMap.set(groupKey, { key: null, group_key: groupKey, name: mallName, city: (outlet.address as Record<string, string>)?.city || null, state: (outlet.address as Record<string, string>)?.state || null, outlet_count: 0, key_candidates: new Map([[mallKey, 1]]) });
            } else {
                const existing = mallMap.get(groupKey)!;
                (existing.key_candidates as Map<string, number>).set(mallKey, ((existing.key_candidates as Map<string, number>).get(mallKey) || 0) + 1);
            }
            (mallMap.get(groupKey)!.outlet_count as number);
            mallMap.get(groupKey)!.outlet_count = ((mallMap.get(groupKey)!.outlet_count as number) || 0) + 1;
        }

        let malls = Array.from(mallMap.values());
        if (search) {
            const sv = String(search).toLowerCase();
            malls = malls.filter(m => (m.name as string).toLowerCase().includes(sv) || ((m.city as string) || '').toLowerCase().includes(sv) || ((m.state as string) || '').toLowerCase().includes(sv));
        }

        const mallKeys = malls.flatMap(m => Array.from((m.key_candidates as Map<string, number>).keys()));
        const configs = await mallQRRepository.findByMallKeys(mallKeys);
        const configMap = new Map(configs.map(c => [(c as unknown as Record<string, unknown>).mall_key as string, c]));

        const enrichedMalls = malls.map(mall => {
            const keyCandidates = Array.from((mall.key_candidates as Map<string, number>).entries()).sort((a, b) => b[1] - a[1]);
            const keyWithConfig = keyCandidates.find(([k]) => configMap.has(k))?.[0];
            const selectedKey = keyWithConfig || keyCandidates[0]?.[0] || mall.group_key;
            return { key: selectedKey, name: mall.name, city: mall.city, state: mall.state, outlet_count: mall.outlet_count, qr_config: (keyWithConfig && configMap.get(keyWithConfig)) || configMap.get(selectedKey as string) || null };
        }).sort((a, b) => (a.name as string).localeCompare(b.name as string));

        const total = enrichedMalls.length;
        const start = (page - 1) * limit;
        return { malls: enrichedMalls.slice(start, start + limit), total, page, limit, totalPages: Math.ceil(total / limit) };
    }

    async getMallMetaByKey(mallKey: string) {
        const requestedGroupKey = extractGroupKeyFromMallKey(mallKey);
        const outlets = await outletRepo.findActiveApprovedSelectAddress() as unknown as Array<Record<string, unknown>>;

        for (const outlet of outlets) {
            const brand = outlet.brand_id as Record<string, unknown>;
            if (!brand || brand.verification_status !== 'approved' || !brand.is_active) continue;
            const mallName = normalizeMallName(extractMallName((outlet.address as Record<string, string>)?.full) || '');
            if (!mallName) continue;
            const key = buildMallKey(mallName, (outlet.address as Record<string, string>)?.city, (outlet.address as Record<string, string>)?.state);
            const groupKey = getMallGroupKey(mallName);
            if (key === mallKey || groupKey === requestedGroupKey) {
                return { mallName, city: (outlet.address as Record<string, string>)?.city, state: (outlet.address as Record<string, string>)?.state };
            }
        }
        return null;
    }
}

export const qrConfigService = new QRConfigService();
