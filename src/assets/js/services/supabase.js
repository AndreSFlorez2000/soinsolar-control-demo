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

export function requireSupabaseClient() {
  if (!client) {
    throw new Error(
      "Supabase no está configurado. Copia config.example.js como config.js y define la URL y la llave publicable."
    );
  }
  return client;
}

export async function signIn(email, password) {
  if (isDemoMode()) {
    return { user: { email, role: "administrador" }, demo: true };
  }

  const { data, error } = await requireSupabaseClient().auth.signInWithPassword({
    email,
    password
  });

  if (error) throw error;
  return { user: data.user, session: data.session, demo: false };
}

export async function signOut() {
  if (!client) return;
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function getCurrentSession() {
  if (!client) return null;
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function verifyDatabaseConnection() {
  if (!client) {
    return {
      configured: false,
      authenticated: false,
      databaseReachable: false,
      mode: "demo",
      message: "La aplicación funciona con datos demostrativos."
    };
  }

  const { data: sessionData, error: sessionError } = await client.auth.getSession();

  if (sessionError) {
    return {
      configured: true,
      authenticated: false,
      databaseReachable: false,
      mode: "supabase",
      message: sessionError.message
    };
  }

  if (!sessionData.session) {
    return {
      configured: true,
      authenticated: false,
      databaseReachable: false,
      mode: "supabase",
      message: "Conexión configurada; se requiere iniciar sesión para consultar datos protegidos."
    };
  }

  const { error: queryError } = await client
    .from("project_financial_summary")
    .select("id", { count: "exact", head: true });

  return {
    configured: true,
    authenticated: true,
    databaseReachable: !queryError,
    mode: "supabase",
    message: queryError
      ? queryError.message
      : "Autenticación, RLS y consulta a la base de datos verificadas."
  };
}

export async function connectionStatus() {
  const status = await verifyDatabaseConnection();
  return {
    connected: status.configured && (!status.authenticated || status.databaseReachable),
    ...status
  };
}

