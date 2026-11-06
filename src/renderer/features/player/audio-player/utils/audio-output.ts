export type AudioDeviceOption = {
    disabled?: boolean;
    label: string;
    value: string;
};

export type AudioOutputPreference = {
    deviceId: null | string | undefined;
    deviceLabel: null | string | undefined;
};

export type AudioSinkTarget = {
    setSinkId: (sinkId: string) => Promise<void>;
    sinkId?: string;
};

export const AUDIO_OUTPUT_RECOVERY_RETRY_MS = 15_000;
export const AUDIO_OUTPUT_RETRY_DELAYS_MS = [0, 500, 2000, 5000] as const;

const SYSTEM_DEFAULT_DEVICE_IDS = new Set(['', 'default']);

export const supportsAudioSinkSelection = (target: unknown): target is AudioSinkTarget => {
    if (!target || typeof target !== 'object') {
        return false;
    }

    return typeof (target as Partial<AudioSinkTarget>).setSinkId === 'function';
};

export const getWebAudioDevices = async (): Promise<AudioDeviceOption[]> => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const uniqueDeviceIds = new Set<string>();

    return (devices || [])
        .filter((device) => device.kind === 'audiooutput')
        .filter((device) => {
            if (uniqueDeviceIds.has(device.deviceId)) {
                return false;
            }

            uniqueDeviceIds.add(device.deviceId);
            return true;
        })
        .map((device) => ({
            label: device.label,
            value: device.deviceId,
        }));
};

export const getAudioOutputPreference = (
    deviceId: null | string,
    devices: AudioDeviceOption[],
): AudioOutputPreference => ({
    deviceId,
    deviceLabel: deviceId
        ? (devices.find((device) => device.value === deviceId)?.label ?? null)
        : null,
});

export const includeUnavailableAudioDevice = (
    devices: AudioDeviceOption[],
    preference: AudioOutputPreference,
): AudioDeviceOption[] => {
    const preferredId = preference.deviceId?.trim();
    const preferredLabel = preference.deviceLabel?.trim();
    const labelMatches = preferredLabel
        ? devices.filter((device) => device.label.trim() === preferredLabel)
        : [];

    if (
        !preferredId ||
        devices.some((device) => device.value === preferredId) ||
        labelMatches.length === 1
    ) {
        return devices;
    }

    return [
        {
            disabled: true,
            label: `${preference.deviceLabel || preferredId} (currently unavailable)`,
            value: preferredId,
        },
        ...devices,
    ];
};

/**
 * Keep the user's chosen endpoint even when Windows temporarily removes it.
 * If Windows recreates the same endpoint under a different Chromium id, an
 * unambiguous label match lets us reconnect to the same physical device.
 */
export const resolveAudioOutputDeviceId = (
    preference: AudioOutputPreference,
    devices: AudioDeviceOption[],
): null | string => {
    const preferredId = preference.deviceId?.trim();
    if (!preferredId) {
        return null;
    }

    if (SYSTEM_DEFAULT_DEVICE_IDS.has(preferredId)) {
        return preferredId;
    }

    if (devices.some((device) => device.value === preferredId)) {
        return preferredId;
    }

    const preferredLabel = preference.deviceLabel?.trim();
    if (preferredLabel) {
        const labelMatches = devices.filter((device) => device.label.trim() === preferredLabel);
        if (labelMatches.length === 1) {
            return labelMatches[0].value;
        }
    }

    // Do not silently replace the preference with the Windows default. Trying
    // the saved id may still succeed if enumeration is briefly incomplete.
    return preferredId;
};

export const toAudioSinkId = (deviceId: null | string | undefined): string => {
    const normalized = deviceId?.trim();
    return !normalized || SYSTEM_DEFAULT_DEVICE_IDS.has(normalized) ? '' : normalized;
};

export const applyAudioOutputPreference = async (
    target: AudioSinkTarget,
    preference: AudioOutputPreference,
    devices: AudioDeviceOption[],
): Promise<null | string> => {
    const resolvedDeviceId = resolveAudioOutputDeviceId(preference, devices);
    const sinkId = toAudioSinkId(resolvedDeviceId);

    if (target.sinkId !== sinkId) {
        await target.setSinkId(sinkId);
    }

    return resolvedDeviceId;
};
