/**
 * UNIFIED PHONE NORMALIZATION
 * This is the SINGLE SOURCE OF TRUTH for phone normalization
 * Used by: frontend validation, preview, sending, duplicate detection
 * Must match backend exactly
 */

function normalizePhoneNumber(phone) {
    if (!phone || typeof phone !== 'string') return null;

    // Remove whitespace, dashes, commas
    let normalized = phone.trim()
        .replace(/\s/g, '')
        .replace(/-/g, '')
        .replace(/,/g, '')
        .replace(/\./g, '');

    if (!normalized) return null;

    // Remove leading + if present (we'll add it back at the end)
    if (normalized.startsWith('+')) {
        normalized = normalized.substring(1);
    }

    // Now extract only digits
    normalized = normalized.replace(/[^\d]/g, '');

    if (!normalized) return null;

    // NORMALIZATION RULES (priority order)

    // Rule 1: 07XXXXXXXXX (11 digits, starts with 07)
    if (normalized.length === 11 && normalized.startsWith('07')) {
        return '+964' + normalized.substring(1); // +9647XXXXXXXXX
    }

    // Rule 2: 7XXXXXXXXX (10 digits, starts with 7)
    if (normalized.length === 10 && normalized.startsWith('7')) {
        return '+964' + normalized; // +9647XXXXXXXXX
    }

    // Rule 3: 9647XXXXXXXXX (12 digits, starts with 9647)
    if (normalized.length === 12 && normalized.startsWith('9647')) {
        return '+' + normalized; // +9647XXXXXXXXX
    }

    // Rule 4: 964XXXXXXXXX (13 digits, starts with 964 - no 7)
    if (normalized.length === 13 && normalized.startsWith('964') && !normalized.startsWith('9647')) {
        return '+' + normalized; // +964XXXXXXXXX (but unlikely to be valid)
    }

    // Rule 5: Already in +9647XXXXXXXXX or +964XXXXXXXXX
    if (normalized.length === 13 && normalized.startsWith('964')) {
        return '+' + normalized; // +964...
    }

    return null; // Invalid format
}

function isValidIraqiPhone(phone) {
    if (!phone || typeof phone !== 'string') return false;
    const normalized = normalizePhoneNumber(phone);
    if (!normalized) return false;

    // Iraqi mobile: +9647XXXXXXXXX (13 chars total, 10 digits after +964)
    const iraqiPattern = /^\+9647\d{9}$/;
    return iraqiPattern.test(normalized);
}

/**
 * Detect language from business name or other text
 * Returns: 'arabic' | 'kurdish' | 'unknown'
 */
function detectLanguage(text) {
    if (!text || typeof text !== 'string') return 'unknown';

    // Arabic script detection
    const arabicRegex = /[\u0600-\u06FF]/g;
    const arabicMatches = text.match(arabicRegex);

    // Kurdish (Sorani/Kurmanji) uses Arabic-like chars and specific patterns
    const kurdishKeywords = ['کورد', 'کردی', 'سۆرانی', 'کورمانجی', 'ئاراپی'];
    const isKurdishText = kurdishKeywords.some(k => text.includes(k));

    if (isKurdishText) return 'kurdish';
    if (arabicMatches && arabicMatches.length / text.length > 0.4) return 'arabic';

    return 'unknown';
}

/**
 * Get template for language
 * Arabic template vs Kurdish template
 */
function getTemplateForLanguage(language) {
    const templates = {
        'arabic': {
            id: 'ar',
            name: 'Arabic',
            cta: '📞 للمزيد اضغط هنا'
        },
        'kurdish': {
            id: 'ku',
            name: 'Kurdish',
            cta: '📞 بۆ زیاتر کلیک بکە'
        },
        'unknown': {
            id: 'en',
            name: 'Unknown (Fallback)',
            cta: '📞 Click here for more'
        }
    };

    return templates[language] || templates['unknown'];
}
