// Where accounts and synced learning states live (Supabase project in Frankfurt). The publishable key is meant to be
// public: it only allows what the row level security rules allow – each signed-in user reads and writes their own rows.
export const SYNC_CONFIG = Object.freeze({
  url: 'https://rrbmfligewiihebdaupz.supabase.co',
  key: 'sb_publishable_pxZiZXykGFWkeVXQeQVHxw_DpW45SJZ',
});
