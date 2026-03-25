export const normalizeString = (value: any): string => {
    if (value === null || value === undefined) return '';
    return String(value).trim();
};

export const parseBoolean = (value: any, defaultValue: boolean): boolean => {
    if (value === undefined || value === null) return defaultValue;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    if (typeof value === 'string') {
        const v = value.toLowerCase().trim();
        if (['true', '1', 'yes', 'y'].includes(v)) return true;
        if (['false', '0', 'no', 'n'].includes(v)) return false;
    }
    return defaultValue;
};

export const parsePriceNumber = (value: any): number | null => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') {
        const cleaned = value.replace(/[^0-9.-]/g, '');
        const parsed = parseFloat(cleaned);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};

export const normalizeTags = (value: any): string[] => {
    if (Array.isArray(value)) {
        return value.map(v => normalizeString(v)).filter(Boolean);
    }
    if (typeof value === 'string') {
        return value
            .split(/[,;|]/)
            .map(v => v.trim())
            .filter(Boolean);
    }
    return [];
};

export const normalizeVariants = (value: any): { size: string; price: number }[] | undefined => {
    if (value === undefined || value === null) return undefined;
    if (!Array.isArray(value)) return undefined;

    const variants: { size: string; price: number }[] = [];
    for (const v of value) {
        const rawSize = (v as any)?.size ?? (v as any)?.name;
        const size = normalizeString(rawSize);
        const price = parsePriceNumber((v as any)?.price);
        if (!size) return undefined;
        if (price === null || price < 0) return undefined;
        variants.push({ size, price });
    }
    return variants;
};
