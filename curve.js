export const POINT_COUNT = 11;

export function sanitizeCurve(values) {
    if (!Array.isArray(values) || values.length !== POINT_COUNT ||
        !values.every(Number.isFinite))
        return null;

    const out = values.map(v => Math.min(100, Math.max(0, v)));
    for (let i = 1; i < out.length; i++)
        out[i] = Math.min(out[i], out[i - 1]);   // non-increasing
    return out;
}

export function loadCurve(settings) {
    const stored = sanitizeCurve(settings.get_value('brightness-curve').deepUnpack());
    if (stored)
        return stored;

    console.warn('[DynamicBrightness] Stored curve is invalid, using default');
    return sanitizeCurve(settings.get_default_value('brightness-curve').deepUnpack());
}

export function evalCurve(curve, x) {
    if (!Number.isFinite(x))
        x = 0;
    const n = curve.length - 1;
    const pos = Math.min(Math.max(x, 0), 1) * n;
    const i = Math.min(Math.floor(pos), n - 1);
    return curve[i] + (curve[i + 1] - curve[i]) * (pos - i);
}

export function toBrightness(curveValue, min, max) {
    return Math.round(min + (max - min) * curveValue / 100);
}
