// Day-log add-on config. The chat id can be overridden via env; the default is
// Andrey's day-log group so the report cron and the ingest allow-list work
// out of the box.
export const DAYLOG_CHAT_ID = process.env.DAYLOG_CHAT_ID || '-5407249737';

/** Hour (Europe/Prague) after which the daily summary is auto-posted. */
export const DAYLOG_REPORT_HOUR = Number(process.env.DAYLOG_REPORT_HOUR) || 22;
