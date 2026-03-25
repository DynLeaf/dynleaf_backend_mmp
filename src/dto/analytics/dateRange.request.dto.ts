export interface DateRangeRequestDto {
    range?: string;
    date_from?: string; // ISO string
    date_to?: string;   // ISO string
    days?: string;      // Optional number of days for custom sliding windows
}
