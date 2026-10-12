import { createWithEqualityFn } from 'zustand/traditional';

type DjModeState = {
    expanded: boolean;
    setExpanded: (expanded: boolean) => void;
};

export const useDjModeStore = createWithEqualityFn<DjModeState>()((set) => ({
    expanded: false,
    setExpanded: (expanded) => set({ expanded }),
}));

export const useDjModeExpanded = () => useDjModeStore((state) => state.expanded);

export const useSetDjModeExpanded = () => useDjModeStore((state) => state.setExpanded);
