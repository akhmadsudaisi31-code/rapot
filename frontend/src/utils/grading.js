/**
 * Shared utility for grading logic
 */

export const getPredikat = (val) => {
    if (val >= 90) return 'A';
    if (val >= 80) return 'B';
    if (val >= 75) return 'C';
    return 'D';
};

const normalizeTopicText = (kdText, mapelInfo) => {
    if (typeof kdText === 'string') {
        const cleaned = kdText.trim();
        return cleaned || `materi ${mapelInfo}`;
    }

    if (Array.isArray(kdText)) {
        const joined = kdText
            .map((item) => (typeof item === 'string' ? item.trim() : ''))
            .filter(Boolean)
            .join(', ');
        return joined || `materi ${mapelInfo}`;
    }

    if (kdText && typeof kdText === 'object') {
        const candidates = ['text', 'kd', 'materi', 'description', 'desc', 'name', 'nama'];
        for (const key of candidates) {
            const value = kdText[key];
            if (typeof value === 'string' && value.trim()) {
                return value.trim();
            }
        }
        return `materi ${mapelInfo}`;
    }

    return `materi ${mapelInfo}`;
};

export const getDeskripsi = (val, mapelInfo, kdText = null) => {
    const topic = normalizeTopicText(kdText, mapelInfo);
    if (val >= 90) return `Menunjukkan pemahaman yang sangat mendalam dalam ${topic}.`;
    if (val >= 80) return `Memiliki kemampuan yang baik dalam memahami ${topic}.`;
    if (val >= 75) return `Cukup memahami konsep dasar dalam ${topic}, namun perlu ditingkatkan.`;
    return `Perlu bimbingan lebih lanjut untuk memahami ${topic}.`;
};
