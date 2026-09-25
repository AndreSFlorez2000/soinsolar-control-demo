import { installAuthSecurityUi } from "./auth-ui.js?v=1.4.0";

const config = window.SOINSOLAR_CONFIG ?? { demoMode: false };

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
  return config.demoMode === true;
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

  if (error) {
    if (error.code === "email_not_confirmed") {
      throw new Error("Debes confirmar el correo antes de iniciar sesión.");
    }
    if (error.code === "invalid_credentials") {
      throw new Error("Correo o contraseña incorrectos.");
    }
    throw new Error("No fue posible validar el acceso. Inténtalo nuevamente.");
  }
  return { user: data.user, session: data.session, demo: false };
}

export async function registerAccount({ fullName, email, password }) {
  if (isDemoMode()) throw new Error("El registro solo está disponible en la aplicación conectada.");
  const name = String(fullName ?? "").trim();
  const address = String(email ?? "").trim().toLowerCase();
  if (name.length < 3) throw new Error("Ingresa tu nombre completo.");
  if (!address || !address.includes("@")) throw new Error("Ingresa un correo válido.");
  if (String(password ?? "").length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres.");

  const redirect = `${window.location.origin}${window.location.pathname}`;
  const { data, error } = await requireSupabaseClient().auth.signUp({
    email: address,
    password,
    options: { data: { full_name: name }, emailRedirectTo: redirect }
  });
  if (error) {
    if (error.status === 429) throw new Error("Espera un momento antes de volver a intentarlo.");
    throw new Error("No fue posible solicitar la cuenta. Verifica el correo o inténtalo más tarde.");
  }
  return { session: data.session };
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

export async function getCurrentUser() {
  const { data, error } = await requireSupabaseClient().auth.getUser();
  if (error) throw error;
  return data.user;
}

export async function getCurrentUserEmail() {
  const { data, error } = await requireSupabaseClient().auth.getUser();
  if (error) throw error;
  if (!data.user?.email) throw new Error("La sesión no tiene un correo asociado.");
  return data.user.email;
}

function passwordRecoveryRedirectUrl() {
  const redirectUrl = new URL(window.location.href);
  redirectUrl.search = "";
  redirectUrl.hash = "";
  redirectUrl.searchParams.set("recovery", "1");
  return redirectUrl.toString();
}

export async function requestPasswordReset(email) {
  if (isDemoMode()) {
    throw new Error("La recuperación de contraseña solo está disponible en el entorno conectado.");
  }

  const normalizedEmail = String(email ?? "").trim().toLocaleLowerCase("es");
  if (!normalizedEmail) throw new Error("Ingresa el correo institucional.");

  const { error } = await requireSupabaseClient().auth.resetPasswordForEmail(normalizedEmail, {
    redirectTo: passwordRecoveryRedirectUrl()
  });

  if (error) {
    if (error.status === 429) {
      throw new Error("Espera un minuto antes de solicitar otro enlace.");
    }
    throw new Error("No fue posible enviar el enlace de recuperación.");
  }

  return { email: normalizedEmail };
}

export async function updatePassword(newPassword) {
  if (isDemoMode()) {
    throw new Error("El cambio de contraseña solo está disponible en el entorno conectado.");
  }
  if (String(newPassword ?? "").length < 8) {
    throw new Error("La nueva contraseña debe tener al menos 8 caracteres.");
  }

  const { data, error } = await requireSupabaseClient().auth.updateUser({
    password: newPassword
  });
  if (error) throw new Error("No fue posible actualizar la contraseña. Solicita un enlace nuevo.");
  return data.user;
}

export function onPasswordRecovery(callback) {
  if (!client) return () => {};
  const { data } = client.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") callback(session);
  });
  return () => data.subscription.unsubscribe();
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

function initializeAuthSecurity() {
  installAuthSecurityUi({
    enabled: !isDemoMode(),
    getCurrentSession,
    getCurrentUserEmail,
    onPasswordRecovery,
    requestPasswordReset,
    signOut,
    updatePassword
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeAuthSecurity, { once: true });
} else {
  initializeAuthSecurity();
}
