import { ReactNode } from 'react';

import styles from './sidebar.module.css';

import { Accordion } from '/@/shared/components/accordion/accordion';
import { Text } from '/@/shared/components/text/text';
import { useLocalStorage } from '/@/shared/hooks/use-local-storage';

export function SidebarSection({
    children,
    id,
    title,
}: {
    children: ReactNode;
    id: string;
    title: string;
}) {
    const [expanded, setExpanded] = useLocalStorage({
        defaultValue: true,
        getInitialValueInEffect: false,
        key: 'sidebar-expanded:' + id,
    });
    return (
        <Accordion
            classNames={{
                chevron: styles.venueChevron,
                content: styles.accordionContent,
                control: styles.accordionControl,
                item: styles.accordionItem,
            }}
            onChange={(value) => setExpanded(value === id)}
            value={expanded ? id : null}
        >
            <Accordion.Item value={id}>
                <Accordion.Control
                    onKeyDown={(event) => {
                        // Global queue hotkeys also listen for Enter and Space.
                        if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
                    }}
                >
                    <Text fw={500}>{title}</Text>
                </Accordion.Control>
                <Accordion.Panel>{children}</Accordion.Panel>
            </Accordion.Item>
        </Accordion>
    );
}
