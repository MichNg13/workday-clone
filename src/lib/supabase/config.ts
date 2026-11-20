// Publishable (browser-safe) settings. Override with env vars on Vercel if you
// point the app at a different Supabase project.
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xdicjdhpvsinulerlgfb.supabase.co';

export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_UGoYKisJuL5DZDzcWgEKbQ_Xk_n_oVG';
