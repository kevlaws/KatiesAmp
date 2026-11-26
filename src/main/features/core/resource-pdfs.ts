import { app, ipcMain, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import log from '/@/main/logger';
import { MAX_RESOURCE_PDF_BYTES } from '/@/shared/types/resource-document';

const PDF_HEADER = Buffer.from('%PDF-');
let resourceDirectory: string | undefined;

ipcMain.handle('open-resource-pdf', async (_event, bytes: unknown, name: unknown) => {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_RESOURCE_PDF_BYTES) {
        throw new Error('Invalid resource PDF data');
    }

    const pdf = Buffer.from(bytes);
    if (!pdf.subarray(0, PDF_HEADER.length).equals(PDF_HEADER)) {
        throw new Error('Resource is not a PDF');
    }

    const title =
        typeof name === 'string'
            ? name
                  .slice(0, 80)
                  .replace(/[^\p{L}\p{N} _-]/gu, '')
                  .trim()
            : '';
    resourceDirectory ??= mkdtempSync(join(app.getPath('temp'), 'katiesamp-pdfs-'));
    const path = join(
        resourceDirectory,
        `${title || 'Resource'} - ${randomUUID().slice(0, 8)}.pdf`,
    );
    try {
        await writeFile(path, pdf, { flag: 'wx', mode: 0o600 });
        const error = await shell.openPath(path);
        if (error) throw new Error(error);
    } catch (error) {
        await rm(path, { force: true }).catch(() => undefined);
        log.warn('Could not open resource PDF', error);
        throw new Error('Could not open resource PDF');
    }
});

app.once('will-quit', () => {
    if (!resourceDirectory) return;
    try {
        rmSync(resourceDirectory, { force: true, recursive: true });
    } catch (error) {
        log.warn('Could not clean up temporary resource PDFs', error);
    }
});
