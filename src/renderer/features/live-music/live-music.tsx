import { useTranslation } from 'react-i18next';

import { Venue, venueNames } from './lineup';
import { useLineup } from './live-music-context';
import styles from './live-music.module.css';

import { NativeScrollArea } from '/@/renderer/components/native-scroll-area/native-scroll-area';
import { SidebarSection } from '/@/renderer/features/sidebar/components/sidebar-section';
import { Button } from '/@/shared/components/button/button';
import { Icon } from '/@/shared/components/icon/icon';
import { Select } from '/@/shared/components/select/select';

const timeFormat = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
});
const fullDate = new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeZone: 'Europe/London' });
const shortDate = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/London',
    weekday: 'short',
});

export default function LiveMusicRoute() {
    return (
        <NativeScrollArea noHeader>
            <LineupView />
        </NativeScrollArea>
    );
}

export function SidebarLiveMusic() {
    const { t } = useTranslation();
    return (
        <SidebarSection id="live-music" title={t('page.liveMusic.today')}>
            <LineupView compact />
        </SidebarSection>
    );
}

function LineupView({ compact = false }: { compact?: boolean }) {
    const { t } = useTranslation();
    const { canChoose, choose, date, failed, loading, refresh, shows, venue } = useLineup();
    return (
        <div className={compact ? styles.compact : styles.full}>
            {!compact && <h1>{t('page.liveMusic.today')}</h1>}
            {canChoose && (
                <Select
                    aria-label={t('page.liveMusic.choose')}
                    data={venueNames}
                    onChange={(value) => {
                        if (value) choose(value as Venue);
                    }}
                    placeholder={t('page.liveMusic.choose')}
                    value={venue ?? null}
                />
            )}
            {venue ? (
                <>
                    <div className={styles.toolbar}>
                        <span>
                            {venue} ·{' '}
                            {(compact ? shortDate : fullDate).format(new Date(date + 'T12:00:00Z'))}
                        </span>
                        <Button
                            disabled={loading}
                            leftSection={<Icon icon="refresh" size="xs" />}
                            onClick={refresh}
                            size="xs"
                            variant="outline"
                        >
                            {t(compact ? 'common.refresh' : 'page.liveMusic.refresh')}
                        </Button>
                    </div>
                    <div role="status">
                        {failed
                            ? t(shows ? 'page.liveMusic.saved' : 'page.liveMusic.unavailable')
                            : loading && !shows
                              ? t('page.liveMusic.loading')
                              : null}
                        {shows?.length === 0 && <div>{t('page.liveMusic.empty')}</div>}
                    </div>
                    {Boolean(shows?.length) && (
                        <table aria-label={t('page.liveMusic.today')}>
                            <thead className={compact ? styles.screenReaderOnly : undefined}>
                                <tr>
                                    <th scope="col">{t('page.liveMusic.start')}</th>
                                    <th scope="col">{t('page.liveMusic.artist')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {shows?.map((show) => (
                                    <tr key={show.id}>
                                        <td>
                                            <time dateTime={new Date(show.start).toISOString()}>
                                                {timeFormat.format(show.start)}
                                            </time>
                                        </td>
                                        <td>
                                            {compact && <span aria-hidden="true">- </span>}
                                            {show.artist}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </>
            ) : (
                !canChoose && <p>{t('page.liveMusic.unmapped')}</p>
            )}
        </div>
    );
}
