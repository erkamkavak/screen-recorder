import { Polar } from "@polar-sh/sdk";

// Use environment variable to switch between sandbox and production
const isSandbox = import.meta.env.VITE_POLAR_SANDBOX === "true";

const polar = new Polar({
    server: isSandbox ? "sandbox" : "production",
});

export interface LicenseValidationResult {
    valid: boolean;
    error?: string;
    license_key?: any;
    activation?: any;
}

/**
 * Validates a license key with Polar.sh.
 */
export async function validateLicense(
    key: string,
    organizationId: string
): Promise<LicenseValidationResult> {
    try {
        const result = await polar.customerPortal.licenseKeys.validate({
            key,
            organizationId,
        });

        return {
            valid: true,
            license_key: result,
        };
    } catch (err: any) {
        console.error("License validation failed:", err);
        return {
            valid: false,
            error: err.message || "Invalid license key",
        };
    }
}

/**
 * Activates a license key for this specific device.
 */
export async function activateLicense(
    key: string,
    organizationId: string,
    label: string
): Promise<LicenseValidationResult> {
    try {
        const result = await polar.customerPortal.licenseKeys.activate({
            key,
            organizationId,
            label,
        });

        return {
            valid: true,
            activation: result,
        };
    } catch (err: any) {
        console.error("License activation failed:", err);
        return {
            valid: false,
            error: err.message || "Failed to activate license",
        };
    }
}
