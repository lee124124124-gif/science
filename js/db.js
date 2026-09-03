// IndexedDB 저장소: 업로드된 시뮬레이션과 건의사항을 브라우저에 영구 저장한다.
// (백엔드 서버 없이 동작하므로, 데이터는 업로드한 브라우저/기기에만 저장된다.)

const DB_NAME = 'scienceSimHub';
const DB_VERSION = 1;

let dbConnectionPromise = null;

// 커넥션을 재사용하지 않고 매번 새로 열면(특히 헤드리스/느린 환경에서) 두 번째 연결이
// 첫 연결의 업그레이드 트랜잭션 뒤에서 멈춰버리는 경우가 있어, 하나의 연결을 캐시해 공유한다.
// 다만 아주 드물게 open() 요청 자체가 어떤 이벤트도 발생시키지 않고 멈추는 경우가 있어(브라우저 쪽
// 문제로 보인다), 일정 시간 안에 열리지 않으면 캐시를 비우고 다음 호출에서 다시 시도할 수 있게 한다.
function openDB() {
  if (dbConnectionPromise) return dbConnectionPromise;

  dbConnectionPromise = new Promise((resolve, reject) => {
    let settled = false;
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      dbConnectionPromise = null;
      reject(new Error('indexedDB.open() timed out'));
    }, 5000);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('simulations')) {
        const store = db.createObjectStore('simulations', { keyPath: 'id' });
        store.createIndex('level', 'level', { unique: false });
      }
      if (!db.objectStoreNames.contains('feedback')) {
        const fb = db.createObjectStore('feedback', { keyPath: 'id', autoIncrement: true });
        fb.createIndex('simulationId', 'simulationId', { unique: false });
      }
    };
    req.onsuccess = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve(req.result);
    };
    req.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      dbConnectionPromise = null;
      reject(req.error);
    };
  });

  return dbConnectionPromise;
}

async function addSimulation(sim) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('simulations', 'readwrite');
    tx.objectStore('simulations').add(sim);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllSimulations() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('simulations', 'readonly');
    const req = tx.objectStore('simulations').getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => b.createdAt - a.createdAt));
    req.onerror = () => reject(req.error);
  });
}

async function getSimulation(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('simulations', 'readonly');
    const req = tx.objectStore('simulations').get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function deleteSimulation(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['simulations', 'feedback'], 'readwrite');
    tx.objectStore('simulations').delete(id);
    const fbIndex = tx.objectStore('feedback').index('simulationId');
    const cursorReq = fbIndex.openCursor(IDBKeyRange.only(id));
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function addFeedback(feedback) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('feedback', 'readwrite');
    tx.objectStore('feedback').add(feedback);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getFeedbackForSim(simulationId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('feedback', 'readonly');
    const index = tx.objectStore('feedback').index('simulationId');
    const req = index.getAll(IDBKeyRange.only(simulationId));
    req.onsuccess = () => resolve(req.result.sort((a, b) => b.createdAt - a.createdAt));
    req.onerror = () => reject(req.error);
  });
}

async function getGeneralFeedback() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('feedback', 'readonly');
    const req = tx.objectStore('feedback').getAll();
    req.onsuccess = () => resolve(
      req.result.filter(f => !f.simulationId).sort((a, b) => b.createdAt - a.createdAt)
    );
    req.onerror = () => reject(req.error);
  });
}

async function getAllFeedback() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('feedback', 'readonly');
    const req = tx.objectStore('feedback').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function addReply(feedbackId, message, byAdmin) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('feedback', 'readwrite');
    const store = tx.objectStore('feedback');
    const getReq = store.get(feedbackId);
    getReq.onsuccess = () => {
      const doc = getReq.result;
      if (!doc) return;
      doc.replies = doc.replies || [];
      doc.replies.push({ message, createdAt: Date.now(), byAdmin: !!byAdmin });
      store.put(doc);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function updateFeedback(id, message) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('feedback', 'readwrite');
    const store = tx.objectStore('feedback');
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const doc = getReq.result;
      if (!doc) return;
      doc.message = message;
      store.put(doc);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteFeedback(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('feedback', 'readwrite');
    tx.objectStore('feedback').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function updateReply(feedbackId, index, message) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('feedback', 'readwrite');
    const store = tx.objectStore('feedback');
    const getReq = store.get(feedbackId);
    getReq.onsuccess = () => {
      const doc = getReq.result;
      if (!doc || !doc.replies || !doc.replies[index]) return;
      doc.replies[index].message = message;
      store.put(doc);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteReply(feedbackId, index) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('feedback', 'readwrite');
    const store = tx.objectStore('feedback');
    const getReq = store.get(feedbackId);
    getReq.onsuccess = () => {
      const doc = getReq.result;
      if (!doc || !doc.replies) return;
      doc.replies.splice(index, 1);
      store.put(doc);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
