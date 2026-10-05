import { pathToFileURL } from 'node:url';

const BETA_VERSION = /^(\d+\.\d+\.\d+)-beta\.(\d+)$/;
const RELEASE_VERSION = /^\d+\.\d+\.\d+$/;

/* eslint-disable @typescript-eslint/explicit-function-return-type */
export const resolveReleaseVersion = ({
    channel,
    currentVersion,
    releaseTags = [],
    requestedVersion = '',
}) => {
    const requested = requestedVersion.trim();
    let version;
    let manifest;

    if (channel === 'beta') {
        if (BETA_VERSION.test(requested)) {
            version = requested;
        } else {
            const baseVersion = requested || currentVersion.replace(/-.*$/, '');
            if (!RELEASE_VERSION.test(baseVersion)) {
                throw new Error(`Invalid beta base or exact version: ${baseVersion}`);
            }

            const betaPattern = new RegExp(
                `^v${baseVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-beta\\.(\\d+)$`,
            );
            const maxBeta = releaseTags.reduce((maximum, tag) => {
                const match = betaPattern.exec(tag);
                return match ? Math.max(maximum, Number(match[1])) : maximum;
            }, 0);
            version = `${baseVersion}-beta.${maxBeta + 1}`;
        }
        manifest = 'beta.yml';
    } else if (channel === 'release') {
        version = requested || currentVersion.replace(/-.*$/, '');
        if (!RELEASE_VERSION.test(version)) {
            throw new Error(`Invalid release version: ${version}`);
        }
        manifest = 'latest.yml';
    } else {
        throw new Error(`Unsupported release channel: ${channel}`);
    }

    const tag = `v${version}`;
    if (releaseTags.includes(tag)) {
        throw new Error(`Release ${tag} already exists.`);
    }

    return { manifest, tag, version };
};
/* eslint-enable @typescript-eslint/explicit-function-return-type */

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
    const channel = process.env.KATIESAMP_RELEASE_CHANNEL || '';
    const currentVersion = process.env.KATIESAMP_CURRENT_VERSION || '';
    const releaseTags = JSON.parse(process.env.KATIESAMP_RELEASE_TAGS || '[]');
    const requestedVersion = process.env.KATIESAMP_REQUESTED_VERSION || '';

    console.log(
        JSON.stringify(
            resolveReleaseVersion({ channel, currentVersion, releaseTags, requestedVersion }),
        ),
    );
}
