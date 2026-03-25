import { OfferEvent } from '../../models/OfferEvent.js';

export const getTopOffersByEngagement = async (start: Date, end: Date, limit: number = 10) => {
    return OfferEvent.aggregate([
        { $match: { timestamp: { $gte: start, $lte: end } } },
        {
            $group: {
                _id: '$offer_id',
                views: { $sum: { $cond: [{ $in: ['$event_type', ['impression', 'view']] }, 1, 0] } },
                clicks: { $sum: { $cond: [{ $eq: ['$event_type', 'click'] }, 1, 0] } },
                code_copies: { $sum: { $cond: [{ $eq: ['$event_type', 'code_copy'] }, 1, 0] } },
            },
        },
        {
            $addFields: {
                score: { $add: ['$views', { $multiply: ['$clicks', 2] }, { $multiply: ['$code_copies', 3] }] },
            },
        },
        { $sort: { score: -1 } },
        { $limit: limit },
    ]);
};

export const createEvent = async (data: any) => {
    return await OfferEvent.create(data);
};

export const aggregateEvents = async (pipeline: any[]) => {
    return await OfferEvent.aggregate(pipeline);
};

export const insertMany = async (events: any[]) => {
    return await OfferEvent.insertMany(events, { ordered: false });
};
