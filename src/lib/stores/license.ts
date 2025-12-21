import { writable } from "svelte/store";
import { validateLicense, activateLicense } from "../licensing/polar";

export type LicenseInfo = {
    isPro: boolean;
    licenseKey: string | null;
    activationId: string | null;
    purchaseDate: string | null;
    lastValidated: string | null;
    exportsMade: number;
};

const DEFAULT_LICENSE: LicenseInfo = {
    isPro: false,
    licenseKey: null,
    activationId: null,
    purchaseDate: null,
    lastValidated: null,
    exportsMade: 0,
};

// Open-source friendly: Bypass paywall in development or if not explicitly enabled
export const isPaywallEnabled = import.meta.env.VITE_ENABLE_PAYWALL === "true";
const ORGANIZATION_ID = import.meta.env.VITE_POLAR_ORGANIZATION_ID || "";

const createLicenseStore = () => {
    const stored = localStorage.getItem("app_license");
    let initial = DEFAULT_LICENSE;
    if (stored) {
        try {
            initial = JSON.parse(stored);
        } catch {
            // Corrupted data, fall back to default
        }
    }

    const { subscribe, set, update } = writable<LicenseInfo>(initial);

    const persist = (state: LicenseInfo) => {
        localStorage.setItem("app_license", JSON.stringify(state));
    };

    return {
        subscribe,

        /**
         * Validates and activates a license key with Polar.sh
         */
        activateWithPolar: async (key: string) => {
            if (!ORGANIZATION_ID) {
                console.error("VITE_POLAR_ORGANIZATION_ID is not set");
                return { success: false, error: "Configuration error: Organization ID missing" };
            }

            try {
                // 1. First validate the key exists
                const valResult = await validateLicense(key, ORGANIZATION_ID);
                if (!valResult.valid) {
                    return { success: false, error: valResult.error };
                }

                // 2. Activate for this machine
                const machineName = (await window.electronAPI?.getMachineName()) || "Desktop App Instance";
                const actResult = await activateLicense(key, ORGANIZATION_ID, machineName);

                if (!actResult.valid) {
                    return { success: false, error: actResult.error };
                }

                const newState: LicenseInfo = {
                    isPro: true,
                    licenseKey: key,
                    activationId: actResult.activation.id,
                    purchaseDate: new Date().toISOString(),
                    lastValidated: new Date().toISOString(),
                    exportsMade: initial.exportsMade, // Preserve exports count
                };

                set(newState);
                persist(newState);
                return { success: true };
            } catch (err: any) {
                return { success: false, error: err.message || "Activation failed" };
            }
        },

        /**
         * Verifies if the stored license is still valid
         */
        verify: async () => {
            if (!isPaywallEnabled) return true;

            const current = localStorage.getItem("app_license")
                ? JSON.parse(localStorage.getItem("app_license")!) as LicenseInfo
                : initial;

            if (!current.licenseKey || !current.activationId) return false;

            try {
                const result = await validateLicense(current.licenseKey, ORGANIZATION_ID);
                if (result.valid) {
                    update(state => {
                        const newState = { ...state, isPro: true, lastValidated: new Date().toISOString() };
                        persist(newState);
                        return newState;
                    });
                    return true;
                } else {
                    // License revoked or expired
                    set(DEFAULT_LICENSE);
                    persist(DEFAULT_LICENSE);
                    return false;
                }
            } catch (err) {
                console.error("Verification failed, assuming offline and keeping PRO for now:", err);
                return true;
            }
        },

        activatePro: (key: string) => {
            update(state => {
                const newState = {
                    ...state,
                    isPro: true,
                    licenseKey: key,
                    purchaseDate: new Date().toISOString(),
                };
                persist(newState);
                return newState;
            });
        },

        recordExport: () => {
            update(state => {
                const newState = {
                    ...state,
                    exportsMade: state.exportsMade + 1,
                };
                persist(newState);
                return newState;
            });
        },

        reset: () => {
            set(DEFAULT_LICENSE);
            persist(DEFAULT_LICENSE);
        },

        resetExports: () => {
            update(state => {
                const newState = {
                    ...state,
                    exportsMade: 0,
                };
                persist(newState);
                return newState;
            });
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
        reset: () => {
            set(false);
            localStorage.removeItem("has_seen_onboarding");
            licenseStore.resetExports();
        },
    };
})();
