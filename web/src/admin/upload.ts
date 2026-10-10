// Resumable upload straight from the browser to Google Drive.
// The server only creates the upload session (see POST /api/admin/drive/uploads/init),
// so large installers never pass through the (small) application server.

type Resp = { status: number; text: string; range: string | null };

function putXhr(url: string, body: Blob | null, headers: Record<string, string>, signal: AbortSignal, onUp?: (loaded: number) => void): Promise<Resp> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const x = new XMLHttpRequest();
    x.open('PUT', url);
    for (const [k, v] of Object.entries(headers)) x.setRequestHeader(k, v);
    x.upload.onprogress = (e) => onUp?.(e.loaded);
    x.onload = () => resolve({ status: x.status, text: x.responseText, range: x.getResponseHeader('Range') });
    x.onerror = () => reject(new Error('network'));
    x.onabort = () => reject(new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', () => x.abort(), { once: true });
    x.send(body);
  });
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function queryOffset(uri: string, total: number, signal: AbortSignal): Promise<number | null> {
  try {
    const r = await putXhr(uri, null, { 'Content-Range': `bytes */${total}` }, signal);
    if (r.status === 308) {
      const m = r.range?.match(/bytes=0-(\d+)/);
      if (m) return Number(m[1]) + 1;
      return r.range === null ? null : 0;
    }
  } catch (e) { if ((e as Error).name === 'AbortError') throw e; }
  return null; // unknown: caller retries the same chunk
}

export async function uploadResumable(uri: string, file: File, chunkSize: number, onProgress: (sent: number, total: number) => void, signal: AbortSignal): Promise<{ id: string }> {
  const total = file.size;
  let offset = 0;
  let attempt = 0;
  while (offset < total) {
    const start = offset;
    const end = Math.min(start + chunkSize, total) - 1;
    try {
      const r = await putXhr(uri, file.slice(start, end + 1), { 'Content-Range': `bytes ${start}-${end}/${total}` }, signal, (l) => onProgress(Math.min(total, start + l), total));
      if (r.status === 200 || r.status === 201) {
        const j = JSON.parse(r.text || '{}');
        if (!j.id) throw new Fatal('Google finished the upload but did not return a file ID.');
        onProgress(total, total);
        return { id: j.id as string };
      }
      if (r.status === 308) { offset = end + 1; attempt = 0; onProgress(offset, total); continue; }
      if (r.status === 404 || r.status === 410) throw new Fatal('The upload session expired. Start the upload again.');
      if (r.status === 401 || r.status === 403) throw new Fatal(`Google refused the upload (HTTP ${r.status}). If this is a storage problem, pick another account.`);
      throw new Error(`HTTP ${r.status}`);
    } catch (e) {
      if ((e as Error).name === 'AbortError' || e instanceof Fatal) throw e;
      if (++attempt > 5) throw new Error('The connection kept failing. Check your internet and try again.');
      await sleep(Math.min(30_000, 1000 * 2 ** attempt));
      const known = await queryOffset(uri, total, signal); // ask Google how much it already has
      if (known !== null && known <= total) offset = known;
    }
  }
  throw new Error('Upload ended without a confirmation from Google. Start the upload again.');
}
class Fatal extends Error {}
