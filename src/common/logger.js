// logger.js

// Global logging configuration
const LogConfig = {
    enableStandardLogs: true,    // Standard logs (info)
    enableDetailedLogs: true,    // Detailed/debug logs
    enableWarningLogs: true,     // Warnings
    enableErrorLogs: true,       // Errors
    logPrefix: "TheOneSuspender"    // Base prefix for all logs
};

// Component identifiers for logging
export const LogComponent = {
    BACKGROUND: "BG",
    CONTENT: "CS",
    SUSPENDED: "Page",
    POPUP: "Popup",
    OPTIONS: "Options",
    SUSPENSION: "Suspend",
    SCHEDULING: "Schedule",
    GENERAL: ""  // General logs use the base prefix only
};

/**
 * Log a message at the info level
 * @param {string} message - The message to log
 * @param {string} [component=LogComponent.GENERAL] - The component generating the log
 * @param  {...any} args - Additional arguments to log
 */
export function log(message, component = LogComponent.GENERAL, ...args) {
    if (!LogConfig.enableStandardLogs) return;

    const prefix = component
        ? `[${LogConfig.logPrefix} ${component}]`
        : `[${LogConfig.logPrefix}]`;

    console.log(prefix, message, ...args);
}

/**
 * Log a detailed message (debug level)
 * @param {string} message - The message to log
 * @param {string} [component=LogComponent.GENERAL] - The component generating the log
 * @param  {...any} args - Additional arguments to log
 */
export function detailedLog(message, component = LogComponent.GENERAL, ...args) {
    if (!LogConfig.enableDetailedLogs) return;

    const prefix = component
        ? `[${LogConfig.logPrefix} ${component} DETAIL]`
        : `[${LogConfig.logPrefix} DETAIL]`;

    console.log(prefix, message, ...args);
}

/**
 * Log a warning message
 * @param {string} message - The message to log
 * @param {string} [component=LogComponent.GENERAL] - The component generating the log
 * @param  {...any} args - Additional arguments to log
 */
export function logWarning(message, component = LogComponent.GENERAL, ...args) {
    if (!LogConfig.enableWarningLogs) return;

    const prefix = component
        ? `[${LogConfig.logPrefix} ${component} WARNING]`
        : `[${LogConfig.logPrefix} WARNING]`;

    console.warn(prefix, message, ...args);
}

/**
 * Log an error message with context and smart categorization
 * @param {string} context - The operation context where the error occurred
 * @param {Error|string} error - The error object or message
 * @param {string} [component=LogComponent.GENERAL] - The component generating the log
 * @param  {...any} extraInfo - Additional information to log
 */
export function logError(context, error, component = LogComponent.GENERAL, ...extraInfo) {
    if (!LogConfig.enableErrorLogs) return;

    let errorMessage;

    if (error instanceof Error) {
        errorMessage = error.message;
        // Log the stack trace in detailed mode
        if (LogConfig.enableDetailedLogs && error.stack) {
            const stackPrefix = component
                ? `[${LogConfig.logPrefix} ${component} STACK]`
                : `[${LogConfig.logPrefix} STACK]`;
            console.debug(stackPrefix, `Stack trace for ${context}:`, error.stack);
        }
    } else {
        errorMessage = String(error);
    }

    // For fatal errors, use error level
    const prefix = component
        ? `[${LogConfig.logPrefix} ${component} ERROR]`
        : `[${LogConfig.logPrefix} ERROR]`;

    if (extraInfo && extraInfo.length > 0) {
        console.error(prefix, `${context}: ${errorMessage}`, ...extraInfo);
    } else {
        console.error(prefix, `${context}: ${errorMessage}`);
    }
}

/**
 * Wrap an async function with smart error handling based on error categories
 * @template T
 * @param {string} context - Operation context for error logging
 * @param {() => Promise<T>} fn - Async function to execute
 * @param {string} [component=LogComponent.GENERAL] - The component generating the log
 * @param {function} [sendResponseForErrorHandler] - Optional callback to send error response
 * @returns {Promise<T|null>} - Returns null on error, otherwise the function result
 */
export async function withErrorHandling(context, fn, sendResponseForErrorHandler, component = LogComponent.GENERAL) {
    try {
        return await fn();
    } catch (error) {
        logError(context, error, component);
        if (sendResponseForErrorHandler && typeof sendResponseForErrorHandler === 'function') {
            try {
                sendResponseForErrorHandler({ error: error.message || 'An unexpected error occurred.' });
            } catch (e) {
                logError(context, `Failed to send error response: ${e.message}`, component);
            }
        }
        return null;
    }
}

/**
 * Create a wrapped version of chrome.alarms.clear that handles errors properly
 * @param {string} alarmName - Name of the alarm to clear
 * @returns {Promise<boolean>} - Whether the alarm was successfully cleared
 */
export async function safeClearAlarm(alarmName) {
    if (!alarmName) return false;

    try {
        await chrome.alarms.clear(alarmName);
        detailedLog(`Alarm '${alarmName}' cleared successfully`, LogComponent.SCHEDULING);
        return true;
    } catch (error) {
        logError('safeClearAlarm', error, LogComponent.SCHEDULING);
        return false;
    }
}

// Remove isNonFatalError and ErrorCategory from default export
export default {
    log,
    detailedLog,
    logWarning,
    logError,
    withErrorHandling,
    safeClearAlarm,
    LogComponent
}; 