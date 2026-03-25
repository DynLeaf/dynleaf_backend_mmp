export interface RecordEventRequestDto {
    event_type: 'clicked' | 'dismissed';
    metadata?: Record<string, unknown>;
}
