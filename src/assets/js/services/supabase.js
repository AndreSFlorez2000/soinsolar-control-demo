const config = window.SOLAR_DEMO_CONFIG ?? { demoMode: true };

let client = null;

if (config.supabaseUrl && config.supabasePublishableKey && window.supabase?.createClient) {
  client = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
}

export function isDemoMode() {
  return config.demoMode !== false || !client;
}

export function getSupabaseClient() {
  return client;
}

export async function signIn(email, password) {
  if (isDemoMode()) return { user: { email, role: "administrador" }, demo: true };
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { user: data.user, demo: false };
}

export async function signOut() {
  if (!client) return;
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function connectionStatus() {
  if (!client) return { connected: false, mode: "demo" };
  const { error } = await client.auth.getSession();
  return { connected: !error, mode: "supabase", error: error?.message };
}

