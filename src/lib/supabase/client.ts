'use client';
import { createBrowserClient } from '@supabase/ssr';
import { SUPABASE_KEY, SUPABASE_URL } from './config';

let client: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  if (!client) client = createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
  return client;
}
