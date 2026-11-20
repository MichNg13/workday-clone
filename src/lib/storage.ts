import { createClient } from './supabase/server';

/** Signed URLs (10 min) for private attachments the viewer is allowed to read. */
export async function signedUrls(paths: (string | null | undefined)[]) {
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  if (unique.length === 0) return {} as Record<string, string>;
  const supabase = await createClient();
  const { data } = await supabase.storage.from('attachments').createSignedUrls(unique, 600);
  const out: Record<string, string> = {};
  (data ?? []).forEach((d) => {
    if (d.signedUrl && d.path) out[d.path] = d.signedUrl;
  });
  return out;
}
