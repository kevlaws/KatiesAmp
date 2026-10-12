import { closeModal, openModal } from '@mantine/modals';
import { t } from 'i18next';
import isElectron from 'is-electron';
import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Group } from '/@/shared/components/group/group';
import { ModalButton } from '/@/shared/components/modal/model-shared';
import { PasswordInput } from '/@/shared/components/password-input/password-input';
import { Spinner } from '/@/shared/components/spinner/spinner';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';
import { toast } from '/@/shared/components/toast/toast';

const DJ_ACCESS_MODAL_ID = 'dj-access';
const DJ_PASSWORD_SETTINGS_MODAL_ID = 'dj-password-settings';
const localSettings = isElectron() ? window.api.localSettings : null;

const DjAccessForm = ({
    onCancel,
    onSuccess,
}: {
    onCancel?: () => void;
    onSuccess: () => void;
}) => {
    const { t } = useTranslation();
    const [configured, setConfigured] = useState<boolean>();
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [password, setPassword] = useState('');

    useEffect(() => {
        localSettings
            ?.djPasswordIsSet()
            .then(setConfigured)
            .catch(() => setError(t('setting.djModePasswordUnavailable')));
    }, [t]);

    const cancel = () => {
        closeModal(DJ_ACCESS_MODAL_ID);
        onCancel?.();
    };

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        setError('');

        if (!configured) {
            setError(t('setting.djModePasswordNotConfigured'));
            return;
        }

        setIsSubmitting(true);
        try {
            if (!(await localSettings?.djPasswordVerify(password))) {
                setError(t('setting.djModeInvalidPassword'));
                return;
            }

            closeModal(DJ_ACCESS_MODAL_ID);
            onSuccess();
        } catch {
            setError(t('setting.djModePasswordUnavailable'));
        } finally {
            setIsSubmitting(false);
        }
    };

    if (configured === undefined && !error) return <Spinner container />;

    return (
        <form onSubmit={submit}>
            <Stack gap="md">
                <Text>{t('setting.djModeUnlockDescription')}</Text>
                <PasswordInput
                    autoFocus
                    error={error || undefined}
                    label={t('setting.djModePassword')}
                    maxLength={128}
                    minLength={6}
                    onChange={(event) => setPassword(event.currentTarget.value)}
                    required
                    value={password}
                />
                <Group justify="flex-end">
                    <ModalButton onClick={cancel} variant="subtle">
                        {t('common.cancel')}
                    </ModalButton>
                    <ModalButton loading={isSubmitting} type="submit" variant="filled">
                        {t('setting.djModeUnlock')}
                    </ModalButton>
                </Group>
            </Stack>
        </form>
    );
};

const DjPasswordSettingsForm = ({ onSuccess }: { onSuccess?: () => void }) => {
    const { t } = useTranslation();
    const [configured, setConfigured] = useState<boolean>();
    const [confirmPassword, setConfirmPassword] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [newPassword, setNewPassword] = useState('');

    useEffect(() => {
        localSettings
            ?.djPasswordIsSet()
            .then(setConfigured)
            .catch(() => setError(t('setting.djModePasswordUnavailable')));
    }, [t]);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        setError('');

        if (newPassword !== confirmPassword) {
            setError(t('setting.djModePasswordMismatch'));
            return;
        }

        if (newPassword.length < 6 || newPassword.length > 128) {
            setError(t('setting.djModePasswordRequirements'));
            return;
        }

        setIsSubmitting(true);
        try {
            const success = configured
                ? await localSettings?.djPasswordChange(currentPassword, newPassword)
                : await localSettings?.djPasswordSet(newPassword);

            if (!success) {
                setError(
                    configured
                        ? t('setting.djModeInvalidCurrentPassword')
                        : t('setting.djModePasswordRequirements'),
                );
                return;
            }

            closeModal(DJ_PASSWORD_SETTINGS_MODAL_ID);
            toast.success({ message: t('setting.djModePasswordSaved') });
            onSuccess?.();
        } catch {
            setError(t('setting.djModePasswordUnavailable'));
        } finally {
            setIsSubmitting(false);
        }
    };

    if (configured === undefined && !error) return <Spinner container />;

    return (
        <form onSubmit={submit}>
            <Stack gap="md">
                <Text>{t('setting.djModePasswordDescription')}</Text>
                {configured && (
                    <PasswordInput
                        autoFocus
                        label={t('setting.djModeCurrentPassword')}
                        maxLength={128}
                        minLength={6}
                        onChange={(event) => setCurrentPassword(event.currentTarget.value)}
                        required
                        value={currentPassword}
                    />
                )}
                <PasswordInput
                    autoFocus={!configured}
                    error={error || undefined}
                    label={t('setting.djModeNewPassword')}
                    maxLength={128}
                    minLength={6}
                    onChange={(event) => setNewPassword(event.currentTarget.value)}
                    required
                    value={newPassword}
                />
                <PasswordInput
                    label={t('setting.djModeConfirmPassword')}
                    maxLength={128}
                    minLength={6}
                    onChange={(event) => setConfirmPassword(event.currentTarget.value)}
                    required
                    value={confirmPassword}
                />
                <Group justify="flex-end">
                    <ModalButton
                        onClick={() => closeModal(DJ_PASSWORD_SETTINGS_MODAL_ID)}
                        variant="subtle"
                    >
                        {t('common.cancel')}
                    </ModalButton>
                    <ModalButton loading={isSubmitting} type="submit" variant="filled">
                        {configured
                            ? t('setting.djModeChangePassword')
                            : t('setting.djModeSetPassword')}
                    </ModalButton>
                </Group>
            </Stack>
        </form>
    );
};

export const requestDjAccess = (onSuccess: () => void, onCancel?: () => void) => {
    if (!localSettings) {
        onSuccess();
        return;
    }

    openModal({
        children: <DjAccessForm onCancel={onCancel} onSuccess={onSuccess} />,
        closeOnClickOutside: false,
        closeOnEscape: false,
        modalId: DJ_ACCESS_MODAL_ID,
        title: t('setting.djModeAccessTitle'),
        withCloseButton: false,
    });
};

export const openDjPasswordSettingsModal = (onSuccess?: () => void) => {
    if (!localSettings) return;

    openModal({
        children: <DjPasswordSettingsForm onSuccess={onSuccess} />,
        closeOnClickOutside: false,
        modalId: DJ_PASSWORD_SETTINGS_MODAL_ID,
        title: t('setting.djModePasswordTitle'),
    });
};
