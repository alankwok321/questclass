// Thin wrapper around the existing CDN-based firebase bridge.
// We keep the old implementation but call it from React.

export function firebaseEnabled() {
  return Boolean(window.QuestClassFirebase?.enabled?.());
}

export async function firebaseInit() {
  return await window.QuestClassFirebase?.init?.();
}

export async function signInWithGoogle() {
  return await window.QuestClassFirebase?.signInWithGoogle?.();
}

export async function signOut() {
  return await window.QuestClassFirebase?.signOut?.();
}

export async function getIdToken(forceRefresh = false) {
  return await window.QuestClassFirebase?.getIdToken?.(forceRefresh);
}

export async function getTeacherDashboard(classroomId = null) {
  return await window.QuestClassFirebase?.getTeacherDashboard?.(classroomId);
}

export async function listClassrooms() {
  return await window.QuestClassFirebase?.listClassrooms?.();
}

export async function createHomeworkAssignment(payload) {
  return await window.QuestClassFirebase?.createHomeworkAssignment?.(payload);
}
