import express from 'express';
import cors from 'cors';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// ============================================================================
// UNIFIED PHONE NORMALIZATION - MUST MATCH FRONTEND EXACTLY
// ============================================================================

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

    // Rule 4: 964XXXXXXXXX (13 digits, starts with 964)
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

function detectLanguage(text) {
    if (!text || typeof text !== 'string') return 'unknown';

    const arabicRegex = /[\u0600-\u06FF]/g;
    const arabicMatches = text.match(arabicRegex);

    if (arabicMatches && arabicMatches.length / text.length > 0.4) {
        return 'arabic';
    }

    return 'unknown';
}

// ============================================================================
// MIDDLEWARE & SETUP
// ============================================================================

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ============================================================================
// API ENDPOINTS
// ============================================================================

/**
 * GET /api/contacts
 * Load contacts from Supabase
 */
app.get('/api/contacts', async (req, res) => {
    try {
        if (!supabase) {
            return res.status(500).json({
                success: false,
                error: 'Supabase not configured'
            });
        }

        let table = req.query.table || 'businesses';
        const cityFilter = req.query.city;
        const categoryFilter = req.query.category;
        const loadAll = req.query.loadAll === 'true';

        // Get count
        let countQuery = supabase.from(table).select('*', { count: 'exact', head: true });
        if (cityFilter) countQuery = countQuery.eq('city', cityFilter);
        if (categoryFilter) countQuery = countQuery.eq('category', categoryFilter);

        const { count: totalCount, error: countError } = await countQuery;

        if (countError) {
            return res.status(404).json({
                success: false,
                error: `Table '${table}' not found`
            });
        }

        let data = [];
        let loadedCount = 0;

        if (loadAll && totalCount > 0) {
            const pageSize = 1000;
            const totalPages = Math.ceil(totalCount / pageSize);

            for (let page = 0; page < totalPages; page++) {
                const from = page * pageSize;
                const to = from + pageSize - 1;

                let query = supabase.from(table).select('*').range(from, to);
                if (cityFilter) query = query.eq('city', cityFilter);
                if (categoryFilter) query = query.eq('category', categoryFilter);

                const { data: pageData, error: pageError } = await query;
                if (pageError) throw pageError;

                if (pageData) {
                    data = data.concat(pageData);
                    loadedCount = data.length;
                }
            }
        } else {
            let query = supabase.from(table).select('*').limit(1000);
            if (cityFilter) query = query.eq('city', cityFilter);
            if (categoryFilter) query = query.eq('category', categoryFilter);

            const { data: defaultData, error: defaultError } = await query;
            if (defaultError) throw defaultError;

            data = defaultData || [];
            loadedCount = data.length;
        }

        res.json({
            success: true,
            contacts: data || [],
            totalCount: totalCount || 0,
            loadedCount: loadedCount,
            isPartial: loadedCount < (totalCount || 0)
        });
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/send
 * Send WhatsApp message
 */
app.post('/api/send', async (req, res) => {
    try {
        const { phone, name, message, campaignName } = req.body;

        // Validate
        if (!phone || !message) {
            return res.status(400).json({
                success: false,
                error: 'Missing phone or message'
            });
        }

        const normalized = normalizePhoneNumber(phone);
        if (!normalized || !isValidIraqiPhone(phone)) {
            return res.status(400).json({
                success: false,
                error: `Invalid phone: ${phone}`
            });
        }

        // TODO: Send via WhatsApp provider (Nabda, Twilio, etc.)
        // For now, log and return success

        console.log(`[SEND] ${name} (${normalized}): ${message.substring(0, 50)}...`);

        res.json({
            success: true,
            message: 'Message queued for sending',
            phone: normalized,
            name,
            campaign: campaignName
        });
    } catch (error) {
        console.error('Send error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/campaigns/active
 * Check for incomplete campaigns
 */
app.get('/api/campaigns/active', async (req, res) => {
    try {
        // TODO: Query database for active campaigns
        res.json({ success: false });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/validate-csv
 * Validate CSV data
 */
app.post('/api/validate-csv', express.json({ limit: '50mb' }), async (req, res) => {
    try {
        const { csvText } = req.body;

        if (!csvText) {
            return res.status(400).json({
                success: false,
                error: 'No CSV text provided'
            });
        }

        const lines = csvText.split('\n').filter(l => l.trim());
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

        const contacts = [];
        const phoneIdx = headers.indexOf('phone');

        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            const phone = phoneIdx >= 0 ? values[phoneIdx]?.trim() : '';

            const normalized = normalizePhoneNumber(phone);
            const isValid = normalized && isValidIraqiPhone(phone);

            contacts.push({
                rowNumber: i + 1,
                phone,
                phone_normalized: normalized,
                isValid: isValid ? 'valid' : 'invalid'
            });
        }

        const valid = contacts.filter(c => c.isValid === 'valid').length;
        const invalid = contacts.filter(c => c.isValid === 'invalid').length;

        res.json({
            success: true,
            total: contacts.length,
            valid,
            invalid,
            contacts: contacts.slice(0, 100) // First 100 for preview
        });
    } catch (error) {
        console.error('Validation error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================================
// START SERVER
// ============================================================================

app.listen(PORT, () => {
    console.log(`🚀 Nabda Bulk Sender running on port ${PORT}`);
    console.log(`📱 Open http://localhost:${PORT}`);
});
