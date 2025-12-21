import { writable } from "svelte/store";

export type LicenseInfo = {
    isPro: boolean;
    licenseKey: string | null;
    purchaseDate: string | null;
    exportsMade: number;
};

const DEFAULT_LICENSE: LicenseInfo = {
    isPro: false,
    licenseKey: null,
    purchaseDate: null,
    exportsMade: 0,
};

// Open-source friendly: Bypass paywall in development or if not explicitly enabled
export const isPaywallEnabled = import.meta.env.VITE_ENABLE_PAYWALL === "true";

const createLicenseStore = () => {
    const stored = localStorage.getItem("app_license");
    const initial = stored ? JSON.parse(stored) : DEFAULT_LICENSE;

    const { subscribe, set, update } = writable<LicenseInfo>(initial);

    return {
        subscribe,
        activatePro: (key: string) => {
            update(state => {
                const newState = {
                    ...state,
                    isPro: true,
                    licenseKey: key,
                    purchaseDate: new Date().toISOString(),
                };
                localStorage.setItem("app_license", JSON.stringify(newState));
                return newState;
            });
        },
        recordExport: () => {
            update(state => {
                const newState = {
                    ...state,
                    exportsMade: state.exportsMade + 1,
                };
                localStorage.setItem("app_license", JSON.stringify(newState));
                return newState;
            });
        },
        reset: () => {
            set(DEFAULT_LICENSE);
            localStorage.removeItem("app_license");
        },
    };
};

export const licenseStore = createLicenseStore();

export const hasSeenOnboarding = (() => {
    const stored = localStorage.getItem("has_seen_onboarding") === "true";
    const { subscribe, set } = writable<boolean>(stored);

    return {
        subscribe,
        complete: () => {
            set(true);
            localStorage.setItem("has_seen_onboarding", "true");
        },
    };
})();
