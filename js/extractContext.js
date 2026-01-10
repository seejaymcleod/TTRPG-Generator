
// extractContext.js
// Polyfill for context extraction since the original file was checking for it

function extractContext(result, context) {
    if (!context) return;
    if (!result) return;

    // Check if result is an object
    if (typeof result === 'object') {
        // If it has context properties directly
        if (result.context) {
            Object.assign(context, result.context);
        }

        // Recursively check 'result' property if it exists
        if (result.result !== undefined) {
            extractContext(result.result, context);
        }

        // If it's an array, iterate
        if (Array.isArray(result)) {
            result.forEach(item => extractContext(item, context));
        } else {
            // Iterate object keys just in case, but usually structure is predictable
            // But let's be careful not to infinite loop if circular
            // The generated result structure from engine usually isn't circular in a way that breaks this simple walk
            // IF it follows the GeneratedResult interface
        }
    } else if (Array.isArray(result)) {
        result.forEach(item => extractContext(item, context));
    }
}

// Also helpful: helper to extract display value if not already present
function extractDisplayValueForTitle(res) {
    if (Array.isArray(res)) return res.length > 0 ? extractDisplayValueForTitle(res[0]) : '';
    if (typeof res === 'object' && res !== null) {
        if (res.result !== undefined) {
            if (typeof res.result === 'string') return res.result;
            return extractDisplayValueForTitle(res.result);
        }
        // Fallback for career-like objects or other
        return '';
    }
    return String(res || '');
}

// Expose to window
window.extractContext = extractContext;
window.extractDisplayValueForTitle = extractDisplayValueForTitle;
