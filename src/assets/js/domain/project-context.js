const prefix = "soinsolar:project-context:";

export function hasProject(projectId, projects) {
  return Boolean(projectId && projects.some((project) => project.projectId === projectId));
}

export function recallProject(storage, userId, projects) {
  if (!userId) return null;
  try {
    const projectId = storage.getItem(`${prefix}${userId}`);
    if (hasProject(projectId, projects)) return projectId;
    if (projectId) storage.removeItem(`${prefix}${userId}`);
  } catch { /* Un navegador sin almacenamiento local todavía puede navegar. */ }
  return null;
}

export function rememberProject(storage, userId, projectId, projects) {
  if (!userId || !hasProject(projectId, projects)) return false;
  try { storage.setItem(`${prefix}${userId}`, projectId); } catch { /* La selección funciona durante esta sesión. */ }
  return true;
}

export function forgetProject(storage, userId) {
  if (!userId) return;
  try { storage.removeItem(`${prefix}${userId}`); } catch { /* Almacenamiento no disponible. */ }
}
