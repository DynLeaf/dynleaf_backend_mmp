/**
 * Fail-Proof Analytics Schema Parser
 * Handles malformed, incomplete, or unexpected data gracefully
 */

import crypto from 'crypto';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface ParsedEvent {
    type: string;
    timestamp: Date;
    session_id: string;
    page: string;
    device_type: 'mobile' | 'desktop' | 'tablet';
    platform: string;
    user_id?: string;
    outlet_id?: string;
    payload: Record<string, any>;

    // Server-added metadata
    received_at: Date;
    ip_address?: string;
    server_timestamp: Date;
    processing_time_ms?: number;
    api_version: string;
    event_hash: string;

    // Parsing metadata
    is_valid: boolean;
    validation_errors: string[];
    source_raw?: any;
}

export interface ParsedBatch {
    events: ParsedEvent[];
    metadata: {
        session_id: string;
        device_info: any;
        network_type?: string;
        app_version?: string;
        batch_id: string;
        events_count: number;

        // Server-added
        received_at: Date;
        ip_address?: string;
        processing_time_ms?: number;
    };

    // Batch-level stats
    total_events: number;
    valid_events: number;
    invalid_events: number;
    parsing_errors: string[];
}

// ============================================================================
// SCHEMA PARSER
// ============================================================================

export class AnalyticsSchemaParser {
    private apiVersion = '2.0.0';

    /**
     * Parse entire batch with fail-safe guarantees
     */
    public parseBatch(rawBody: any, ipAddress?: string): ParsedBatch {
        const startTime = Date.now();
        const receivedAt = new Date();

        // Handle completely empty or malformed body
        if (!rawBody || typeof rawBody !== 'object') {
            return this.createEmptyBatch(receivedAt, ipAddress, startTime);
        }

        const events = Array.isArray(rawBody.events) ? rawBody.events : [];
        const metadata = rawBody.metadata || {};

        // Parse all events (never fail on individual event errors)
        const parsedEvents: ParsedEvent[] = [];
        const parsingErrors: string[] = [];

        for (let i = 0; i < events.length; i++) {
            try {
                const parsed = this.parseEvent(events[i], metadata, receivedAt, ipAddress);
                parsedEvents.push(parsed);

                if (!parsed.is_valid) {
                    parsingErrors.push(`Event ${i}: ${parsed.validation_errors.join(', ')}`);
                }
            } catch (error: any) {
                // Even if parsing completely fails, create a fallback event
                parsingErrors.push(`Event ${i}: Critical parse error - ${error.message}`);
                parsedEvents.push(this.createFallbackEvent(events[i], receivedAt, ipAddress, error.message));
            }
        }

        const processingTime = Date.now() - startTime;

        return {
            events: parsedEvents,
            metadata: {
                session_id: this.parseSessionId(metadata.session_id),
                device_info: metadata.device_info || { type: 'unknown' },
                network_type: metadata.network_type,
                app_version: metadata.app_version,
                batch_id: metadata.batch_id || this.generateBatchId(),
                events_count: events.length,
                received_at: receivedAt,
                ip_address: ipAddress,
                processing_time_ms: processingTime,
            },
            total_events: events.length,
            valid_events: parsedEvents.filter(e => e.is_valid).length,
            invalid_events: parsedEvents.filter(e => !e.is_valid).length,
            parsing_errors: parsingErrors,
        };
    }

    /**
     * Parse individual event with maximum fault tolerance
     */
    private parseEvent(
        rawEvent: any,
        batchMetadata: any,
        receivedAt: Date,
        ipAddress?: string
    ): ParsedEvent {
        const validationErrors: string[] = [];
        const serverTimestamp = new Date();

        // Parse type (required, but provide fallback)
        const type = this.parseEventType(rawEvent.type, validationErrors);

        // Parse timestamp (use server time if missing)
        const timestamp = this.parseTimestamp(rawEvent.timestamp, serverTimestamp, validationErrors);

        // Parse session_id (auto-generate if missing)
        const session_id = this.parseSessionId(
            rawEvent.session_id || batchMetadata.session_id,
            validationErrors
        );

        // Parse page (default to '/')
        const page = this.parsePage(rawEvent.page, validationErrors);

        // Parse device_type (default to 'unknown' -> 'desktop')
        const device_type = this.parseDeviceType(rawEvent.device_type, validationErrors);

        // Parse platform (default to 'web')
        const platform = this.parsePlatform(rawEvent.platform);

        // Parse optional fields
        const user_id = rawEvent.user_id;
        const outlet_id = rawEvent.outlet_id || rawEvent.payload?.outlet_id;

        // Parse payload (always succeed, even if empty)
        const payload = this.parsePayload(rawEvent.payload);

        // Generate event hash for idempotency
        const event_hash = this.generateEventHash(type, timestamp, session_id, payload);

        const event: ParsedEvent = {
            type,
            timestamp,
            session_id,
            page,
            device_type,
            platform,
            user_id,
            outlet_id,
            payload,
            received_at: receivedAt,
            ip_address: ipAddress,
            server_timestamp: serverTimestamp,
            api_version: this.apiVersion,
            event_hash,
            is_valid: validationErrors.length === 0,
            validation_errors: validationErrors,
            source_raw: process.env.NODE_ENV === 'development' ? rawEvent : undefined,
        };

        return event;
    }

    /**
     * Create fallback event for completely unparseable data
     */
    private createFallbackEvent(
        rawEvent: any,
        receivedAt: Date,
        ipAddress?: string,
        errorMessage?: string
    ): ParsedEvent {
        const serverTimestamp = new Date();
        const session_id = this.generateSessionId();

        return {
            type: 'error_occurred',
            timestamp: serverTimestamp,
            session_id,
            page: '/unknown',
            device_type: 'desktop',
            platform: 'web',
            payload: {
                error_type: 'analytics_parse_error',
                error_message: errorMessage || 'Failed to parse event',
                raw_data: JSON.stringify(rawEvent).substring(0, 1000), // Limit size
            },
            received_at: receivedAt,
            ip_address: ipAddress,
            server_timestamp: serverTimestamp,
            api_version: this.apiVersion,
            event_hash: this.generateEventHash('error_occurred', serverTimestamp, session_id, {}),
            is_valid: false,
            validation_errors: ['Critical parsing failure'],
        };
    }

    /**
     * Create empty batch for completely invalid requests
     */
    private createEmptyBatch(receivedAt: Date, ipAddress?: string, startTime?: number): ParsedBatch {
        return {
            events: [],
            metadata: {
                session_id: this.generateSessionId(),
                device_info: { type: 'unknown' },
                batch_id: this.generateBatchId(),
                events_count: 0,
                received_at: receivedAt,
                ip_address: ipAddress,
                processing_time_ms: startTime ? Date.now() - startTime : 0,
            },
            total_events: 0,
            valid_events: 0,
            invalid_events: 0,
            parsing_errors: ['Empty or malformed request body'],
        };
    }

    // ========================================================================
    // FIELD PARSERS
    // ========================================================================

    private parseEventType(type: any, errors: string[]): string {
        if (!type || typeof type !== 'string') {
            errors.push('Missing or invalid event type');
            return 'unknown_event';
        }
        return type;
    }

    private parseTimestamp(timestamp: any, fallback: Date, errors: string[]): Date {
        if (!timestamp) {
            errors.push('Missing timestamp, using server time');
            return fallback;
        }

        const parsed = new Date(timestamp);
        if (isNaN(parsed.getTime())) {
            errors.push('Invalid timestamp format, using server time');
            return fallback;
        }

        return parsed;
    }

    private parseSessionId(sessionId: any, errors?: string[]): string {
        if (!sessionId || typeof sessionId !== 'string') {
            if (errors) errors.push('Missing session_id, auto-generated');
            return this.generateSessionId();
        }
        return sessionId;
    }

    private parsePage(page: any, errors: string[]): string {
        if (!page || typeof page !== 'string') {
            errors.push('Missing page, defaulting to /');
            return '/';
        }
        return page;
    }

    private parseDeviceType(deviceType: any, errors: string[]): 'mobile' | 'desktop' | 'tablet' {
        const validTypes = ['mobile', 'desktop', 'tablet'];

        if (!deviceType || !validTypes.includes(deviceType)) {
            errors.push('Missing or invalid device_type, defaulting to desktop');
            return 'desktop';
        }

        return deviceType as 'mobile' | 'desktop' | 'tablet';
    }

    private parsePlatform(platform: any): string {
        if (!platform || typeof platform !== 'string') {
            return 'web';
        }
        return platform;
    }

    private parsePayload(payload: any): Record<string, any> {
        if (!payload || typeof payload !== 'object') {
            return {};
        }

        // Remove any potentially dangerous fields
        const sanitized = { ...payload };
        delete sanitized.__proto__;
        delete sanitized.constructor;

        return sanitized;
    }

    // ========================================================================
    // UTILITIES
    // ========================================================================

    private generateEventHash(type: string, timestamp: Date, sessionId: string, payload: any): string {
        const data = `${type}:${timestamp.toISOString()}:${sessionId}:${JSON.stringify(payload)}`;
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    private generateSessionId(): string {
        return `s_server_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    }

    private generateBatchId(): string {
        return `b_server_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    }
}
