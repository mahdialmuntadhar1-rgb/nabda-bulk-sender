export function normalizePhone(phone) {
    if (!phone)
        return null;
    let cleaned = phone.trim();
    const hasPlus = cleaned.charAt(0) === '+';
    cleaned = cleaned.split('').filter(c => c >= '0' && c <= '9').join('');
    if (!cleaned)
        return null;
    if (cleaned.startsWith('07') && cleaned.length === 11) {
        return '+' + '964' + cleaned.substring(1);
    }
    if (cleaned.startsWith('7') && cleaned.length === 10) {
        return '+' + '964' + cleaned;
    }
    if (cleaned.startsWith('964') && cleaned.length === 13) {
        return '+' + cleaned;
    }
    if (cleaned.length === 12 && cleaned.startsWith('9647')) {
        return '+' + cleaned;
    }
    if (hasPlus && cleaned.length >= 10) {
        return '+' + cleaned;
    }
    return null;
}
export function stripPlus(phone) {
    if (phone.charAt(0) === '+') {
        return phone.substring(1);
    }
    return phone;
}
