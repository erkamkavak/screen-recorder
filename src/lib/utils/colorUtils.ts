
export const hexToRgba = (hex: string, alpha = 1) => {
    let normalized = hex?.trim()?.replace(/^#/, "") ?? "";
    if (normalized.length === 3) {
        normalized = normalized
            .split("")
            .map((char) => char + char)
            .join("");
    }
    if (normalized.length !== 6) {
        return `rgba(249, 115, 22, ${alpha})`;
    }
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    if ([r, g, b].some((component) => Number.isNaN(component))) {
        return `rgba(249, 115, 22, ${alpha})`;
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
