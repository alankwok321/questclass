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

export async function createHomeworkAssignment(payload) {
  return await window.QuestClassFirebase?.createHomeworkAssignment?.(payload);
}

export async function listHomeworkAssignments(limit = 50) {
  return await window.QuestClassFirebase?.listHomeworkAssignments?.(limit);
}

export async function listMyHomework(limit = 50) {
  return await window.QuestClassFirebase?.listMyHomework?.(limit);
}

export async function submitHomework(payload) {
  return await window.QuestClassFirebase?.submitHomework?.(payload);
}

export async function updateHomeworkAssignmentStatus(payload) {
  return await window.QuestClassFirebase?.updateHomeworkAssignmentStatus?.(payload);
}

export async function upsertQuestionBankItem(payload) {
  return await window.QuestClassFirebase?.upsertQuestionBankItem?.(payload);
}

export async function listQuestionBank(limit = 200) {
  return await window.QuestClassFirebase?.listQuestionBank?.(limit);
}

export async function getQuestionBankItemsByIds(ids) {
  return await window.QuestClassFirebase?.getQuestionBankItemsByIds?.(ids);
}

export async function listMySubmissions(limit = 100) {
  return await window.QuestClassFirebase?.listMySubmissions?.(limit);
}

export async function listSubmissionsForAssignment(assignmentId, limit = 200) {
  return await window.QuestClassFirebase?.listSubmissionsForAssignment?.(assignmentId, limit);
}

export async function listStudents(limit = 200) {
  return await window.QuestClassFirebase?.listStudents?.(limit);
}
