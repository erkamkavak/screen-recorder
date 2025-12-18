import type { RenderFormat } from "../stores/reviewSession";

export type RenderFormatOption = {
    value: RenderFormat;
    label: string;
    supported: boolean;
};

export type PointerIconOption = {
    id: string;
    label: string;
    data: string | null;
    pressedData?: string | null;
};
