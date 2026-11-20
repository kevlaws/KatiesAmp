export function isCurrentMpvQueuePair(
    expectedCurrentUniqueId: string | undefined,
    expectedNextUniqueId: string | undefined,
    currentUniqueId: string | undefined,
    nextUniqueId: string | undefined,
) {
    return expectedCurrentUniqueId === currentUniqueId && expectedNextUniqueId === nextUniqueId;
}
