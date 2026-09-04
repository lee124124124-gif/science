// 공유 저장소(Firestore): 업로드된 시뮬레이션과 건의사항을 모든 기기가 함께 보도록 저장한다.
// (예전에는 브라우저의 IndexedDB에만 저장해서 기기마다 데이터가 따로 보였다 — 그 문제를
// 해결하기 위해 Firebase Firestore를 사용한다. Storage는 유료(Blaze) 요금제가 필요해서
// 쓰지 않고, HTML 코드와 미리보기 이미지도 전부 Firestore 문서 안에 텍스트로 저장한다.)

const firebaseConfig = {
  apiKey: "AIzaSyAh3IBvMWVD32NiRNgSv6K_Bvdw35CVzDA",
  authDomain: "science-ffff6.firebaseapp.com",
  projectId: "science-ffff6",
  storageBucket: "science-ffff6.firebasestorage.app",
  messagingSenderId: "806373880729",
  appId: "1:806373880729:web:4b0465a328abaa5001d908"
};

firebase.initializeApp(firebaseConfig);
const fsdb = firebase.firestore();

const SIMULATIONS_COL = 'simulations';
const FEEDBACK_COL = 'feedback';
const SETTINGS_COL = 'settings';

// Firestore 문서 하나의 용량 제한은 약 1MiB(1,048,576바이트)다. 시뮬레이션 HTML 코드와
// 미리보기 이미지를 파일 저장소 없이 문서 안에 그대로 넣기 때문에, 여유를 두고 900KB를
// 넘으면 업로드 전에 미리 막고 안내 메시지를 보여준다.
const MAX_DOC_BYTES = 900 * 1024;
function assertSizeOk(obj) {
  const bytes = new Blob([JSON.stringify(obj)]).size;
  if (bytes > MAX_DOC_BYTES) {
    const kb = Math.round(bytes / 1024);
    throw new Error(`시뮬레이션 파일이 너무 큽니다(약 ${kb}KB, 최대 약 900KB). 더 가벼운 파일로 시도해주세요.`);
  }
}

async function addSimulation(sim) {
  assertSizeOk(sim);
  const { id, ...data } = sim;
  await fsdb.collection(SIMULATIONS_COL).doc(id).set(data);
}

async function getAllSimulations() {
  const snap = await fsdb.collection(SIMULATIONS_COL).orderBy('createdAt', 'desc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function getSimulation(id) {
  const doc = await fsdb.collection(SIMULATIONS_COL).doc(id).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : undefined;
}

async function updateSimulation(id, updates) {
  assertSizeOk(updates);
  await fsdb.collection(SIMULATIONS_COL).doc(id).update(updates);
}

async function deleteSimulation(id) {
  const batch = fsdb.batch();
  batch.delete(fsdb.collection(SIMULATIONS_COL).doc(id));
  const relatedFeedback = await fsdb.collection(FEEDBACK_COL).where('simulationId', '==', id).get();
  relatedFeedback.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
}

async function addFeedback(feedback) {
  await fsdb.collection(FEEDBACK_COL).add(feedback);
}

async function getFeedbackForSim(simulationId) {
  const snap = await fsdb.collection(FEEDBACK_COL).where('simulationId', '==', simulationId).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.createdAt - a.createdAt);
}

async function getGeneralFeedback() {
  const snap = await fsdb.collection(FEEDBACK_COL).get();
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(f => !f.simulationId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

async function getAllFeedback() {
  const snap = await fsdb.collection(FEEDBACK_COL).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function addReply(feedbackId, message, byAdmin) {
  const ref = fsdb.collection(FEEDBACK_COL).doc(feedbackId);
  await fsdb.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) return;
    const replies = doc.data().replies || [];
    replies.push({ message, createdAt: Date.now(), byAdmin: !!byAdmin });
    tx.update(ref, { replies });
  });
}

async function updateFeedback(id, message) {
  await fsdb.collection(FEEDBACK_COL).doc(id).update({ message });
}

async function deleteFeedback(id) {
  await fsdb.collection(FEEDBACK_COL).doc(id).delete();
}

async function updateReply(feedbackId, index, message) {
  const ref = fsdb.collection(FEEDBACK_COL).doc(feedbackId);
  await fsdb.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) return;
    const replies = doc.data().replies || [];
    if (!replies[index]) return;
    replies[index] = { ...replies[index], message };
    tx.update(ref, { replies });
  });
}

async function deleteReply(feedbackId, index) {
  const ref = fsdb.collection(FEEDBACK_COL).doc(feedbackId);
  await fsdb.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) return;
    const replies = (doc.data().replies || []).slice();
    replies.splice(index, 1);
    tx.update(ref, { replies });
  });
}

// --- 관리자 비밀번호 (모든 기기가 공유) ---
// 예전에는 localStorage에 저장해서 기기마다 비밀번호가 따로 놀았다 — 한 PC에서 바꾸면
// 다른 PC에서는 여전히 옛 비밀번호(또는 기본값)로 로그인되는 문제가 있었다.
async function getAdminPasswordHash() {
  const doc = await fsdb.collection(SETTINGS_COL).doc('admin').get();
  return doc.exists ? doc.data().passwordHash : null;
}

async function setAdminPasswordHash(hash) {
  await fsdb.collection(SETTINGS_COL).doc('admin').set({ passwordHash: hash }, { merge: true });
}
