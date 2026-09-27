/**
 * Web Worker that prepares a receipt photo (lib/receipt-prep.ts) off the page, so scrolling and buttons stay smooth
 * while the phone straightens and cleans the photo.
 */
import { preparePhoto, type PrepareOptions } from './receipt-prep';

const scope = self as unknown as { onmessage: ((event: MessageEvent<{ id: number; photo: Blob; options: PrepareOptions }>) => void) | null; postMessage: (message: unknown, transfer?: Transferable[]) => void };
scope.onmessage = async (event: MessageEvent<{ id: number; photo: Blob; options: PrepareOptions }>) => {
  const { id, photo, options } = event.data;
  try {
    const prepared = await preparePhoto(photo, options);
    scope.postMessage({ id, ok: true, prepared }, [prepared.clean.buffer, prepared.even.buffer, prepared.bw.buffer]);
  } catch (error) {
    scope.postMessage({ id, ok: false, error: (error as Error)?.message || String(error) });
  }
};
