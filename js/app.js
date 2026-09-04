(() => {
  const grid = document.getElementById('grid');
  const emptyState = document.getElementById('emptyState');
  const tabButtons = document.querySelectorAll('.tab-btn');
  const subTabsNav = document.getElementById('subTabs');

  const feedbackPage = document.getElementById('feedbackPage');
  const feedbackPageForm = document.getElementById('feedbackPageForm');
  const feedbackPageText = document.getElementById('feedbackPageText');
  const feedbackPageList = document.getElementById('feedbackPageList');

  const adminPanel = document.getElementById('adminPanel');
  const adminLogin = document.getElementById('adminLogin');
  const adminLoginForm = document.getElementById('adminLoginForm');
  const adminPasswordInput = document.getElementById('adminPasswordInput');
  const adminLoginError = document.getElementById('adminLoginError');
  const adminContent = document.getElementById('adminContent');
  const adminSimList = document.getElementById('adminSimList');
  const adminFeedbackList = document.getElementById('adminFeedbackList');
  const passwordChangeForm = document.getElementById('passwordChangeForm');
  const passwordChangeMsg = document.getElementById('passwordChangeMsg');

  const uploadForm = document.getElementById('uploadForm');
  const uploadFormTitle = document.getElementById('uploadFormTitle');
  const uploadSubmitBtn = document.getElementById('uploadSubmitBtn');
  const uploadCancelBtn = document.getElementById('uploadCancelBtn');
  const uploadContentHint = document.getElementById('uploadContentHint');
  const fileInputGroup = document.getElementById('fileInputGroup');
  const codeInputGroup = document.getElementById('codeInputGroup');

  const viewer = document.getElementById('viewer');
  const viewerTitle = document.getElementById('viewerTitle');
  const simFrame = document.getElementById('simFrame');
  const closeViewerBtn = document.getElementById('closeViewer');
  const feedbackForm = document.getElementById('feedbackForm');
  const feedbackText = document.getElementById('feedbackText');
  const feedbackList = document.getElementById('feedbackList');

  let currentLevel = 'middle';
  let currentCategory = 'm1';
  let currentSimId = null;
  let isAdminUnlocked = false;
  let renderToken = 0;
  let editingKey = null;
  let expandedFeedbackId = null;
  let editingSimId = null;

  const LEVEL_ICON = { middle: '🧪', high: '🧬' };
  const DEFAULT_PASSWORD = 'qwer1234';
  const AUTHOR_TOKEN_KEY = 'scienceSimHub_authorToken';
  const LAST_TAB_KEY = 'scienceSimHub_lastTab';
  const LAST_CATEGORY_KEY = 'scienceSimHub_lastCategory';
  const LAST_SIM_KEY = 'scienceSimHub_lastSimId';

  // 로그인 없이도 "본인이 쓴 의견"을 구분할 수 있도록, 브라우저마다 고유 토큰을 하나 만들어 재사용한다.
  function getAuthorToken() {
    let token = localStorage.getItem(AUTHOR_TOKEN_KEY);
    if (!token) {
      token = crypto.randomUUID();
      localStorage.setItem(AUTHOR_TOKEN_KEY, token);
    }
    return token;
  }
  const authorToken = getAuthorToken();

  const CATEGORIES = {
    middle: [
      { value: 'm1', label: '1학년' },
      { value: 'm2', label: '2학년' },
      { value: 'm3', label: '3학년' },
    ],
    high: [
      { value: 'h_integrated', label: '통합과학' },
      { value: 'h_physics', label: '물리학' },
      { value: 'h_mechanics', label: '역학과 에너지' },
      { value: 'h_em', label: '전자기와 양자' },
    ],
  };
  const CATEGORY_LABEL = {};
  const CATEGORY_LEVEL = {};
  Object.entries(CATEGORIES).forEach(([level, list]) => {
    list.forEach(c => {
      CATEGORY_LABEL[c.value] = c.label;
      CATEGORY_LEVEL[c.value] = level;
    });
  });

  // 모바일에서 입력창(textarea)에 포커스가 남아있으면 가상 키보드가 계속 떠 있고,
  // 이때 브라우저가 자체적으로 히스토리 항목을 하나 더 만들어 뒤로가기를 한 번 더
  // 눌러야 실행 화면이 닫히는 경우가 있었다. 의견/답글을 남긴 직후 포커스를 명시적으로
  // 풀어(키보드를 닫아) 이런 여분의 히스토리 항목이 생기지 않게 한다.
  function blurActiveInput() {
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function formatDate(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  async function sha256(text) {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function ensurePasswordInitialized() {
    const existing = await getAdminPasswordHash();
    if (!existing) {
      await setAdminPasswordHash(await sha256(DEFAULT_PASSWORD));
    }
  }

  // --- 대시보드 그리드 (중학생/고등학생) ---
  // 탭을 빠르게 전환하면 이전 탭의 렌더링이 늦게 끝나면서 새 탭 화면을 덮어쓸 수 있어,
  // 호출 시점의 renderToken을 기억해두고 그 사이 다른 탭으로 바뀌었으면 그리지 않는다.
  async function renderGrid() {
    const myToken = renderToken;
    const all = await getAllSimulations();
    if (myToken !== renderToken) return;
    const list = all.filter(s => s.category === currentCategory);

    grid.innerHTML = '';
    grid.hidden = false;
    emptyState.hidden = list.length > 0;

    for (const sim of list) {
      const card = document.createElement('button');
      card.className = 'card';
      card.type = 'button';
      card.dataset.id = sim.id;

      const thumbHtml = sim.thumbnail
        ? `<img src="${sim.thumbnail}" alt="${escapeHtml(sim.title)} 미리보기">`
        : `<div class="thumb-placeholder">${LEVEL_ICON[sim.level]}</div>`;

      card.innerHTML = `
        <div class="card-thumb">${thumbHtml}</div>
        <div class="card-body">
          <span class="level-badge">${CATEGORY_LABEL[sim.category]}</span>
          <h3>${escapeHtml(sim.title)}</h3>
          <p>${escapeHtml(sim.description || '')}</p>
        </div>
      `;
      card.addEventListener('click', () => openViewer(sim.id));
      grid.appendChild(card);
    }
  }

  // --- 서브탭 (학년/과목) ---
  function renderSubTabs() {
    subTabsNav.innerHTML = CATEGORIES[currentLevel].map(c => `
      <button type="button" class="subtab-btn ${c.value === currentCategory ? 'active' : ''}" data-category="${c.value}">${c.label}</button>
    `).join('');
  }

  subTabsNav.addEventListener('click', (e) => {
    const btn = e.target.closest('.subtab-btn');
    if (!btn) return;
    currentCategory = btn.dataset.category;
    renderSubTabs();
    renderGrid();
    saveTabState();
  });

  // --- 탭 전환 ---
  // 새로고침해도 보던 탭(학년/과목 포함)이 유지되도록 마지막으로 본 탭을 저장해둔다.
  function saveTabState() {
    localStorage.setItem(LAST_TAB_KEY, currentLevel);
    if (currentLevel === 'middle' || currentLevel === 'high') {
      localStorage.setItem(LAST_CATEGORY_KEY, currentCategory);
    }
  }

  function showTab(level) {
    renderToken++;
    editingKey = null;
    expandedFeedbackId = null;
    tabButtons.forEach(b => b.classList.toggle('active', b.dataset.level === level));
    currentLevel = level;

    grid.hidden = true;
    emptyState.hidden = true;
    subTabsNav.hidden = true;
    feedbackPage.hidden = true;
    adminPanel.hidden = true;

    if (level === 'admin') {
      adminPanel.hidden = false;
      renderAdminGate();
    } else if (level === 'feedback') {
      feedbackPage.hidden = false;
      renderFeedbackPage();
    } else {
      subTabsNav.hidden = false;
      if (!CATEGORIES[level].some(c => c.value === currentCategory)) {
        currentCategory = CATEGORIES[level][0].value;
      }
      renderSubTabs();
      renderGrid();
    }

    saveTabState();
  }

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => showTab(btn.dataset.level));
  });

  // --- 건의사항(공통) 렌더링 — 개별 시뮬레이션 패널과 공용 로직 ---
  function editForm(kind, id, index, message) {
    return `
      <form class="edit-form" data-kind="${kind}" data-id="${id}" ${index != null ? `data-index="${index}"` : ''}>
        <textarea id="activeEditTextarea" rows="2" required>${escapeHtml(message)}</textarea>
        <div class="item-actions">
          <button type="submit" class="btn btn-primary btn-sm">저장</button>
          <button type="button" class="btn btn-sm cancel-edit-btn">취소</button>
        </div>
      </form>
    `;
  }

  function itemActions(kind, id, index, canEdit, canDelete) {
    if (!canEdit && !canDelete) return '';
    const idxAttr = index != null ? ` data-index="${index}"` : '';
    const editBtn = canEdit
      ? `<button type="button" class="btn-link edit-item-btn" data-kind="${kind}" data-id="${id}"${idxAttr}>수정</button>`
      : '';
    const delBtn = canDelete
      ? `<button type="button" class="btn-link delete-item-btn" data-kind="${kind}" data-id="${id}"${idxAttr}>삭제</button>`
      : '';
    return `<div class="item-actions">${editBtn}${delBtn}</div>`;
  }

  // 관리자는 모든 의견/답글을 수정·삭제할 수 있고, 일반 방문자는 로그인 없이도
  // 자신이 작성한 의견(브라우저에 저장된 authorToken으로 식별)만 수정하고 답글을 계속 달 수 있다.
  // 삭제는 관리자만 가능하다 — 모두가 지울 수 있으면 신고/모니터링 목적을 해칠 수 있어서다.
  function renderReplyBlock(f) {
    const feedbackKey = `feedback-${f.id}`;
    const isEditingFeedback = editingKey === feedbackKey;
    const isOwner = !!f.authorToken && f.authorToken === authorToken;
    const canReply = isAdminUnlocked || isOwner;

    const replies = (f.replies || []).map((r, idx) => {
      const replyKey = `reply-${f.id}-${idx}`;
      const isEditingReply = editingKey === replyKey;
      const badge = r.byAdmin ? '선생님 답글' : '작성자 답글';
      const body = isEditingReply
        ? editForm('reply', f.id, idx, r.message)
        : `<p>${escapeHtml(r.message)}</p><time>${formatDate(r.createdAt)}</time>${itemActions('reply', f.id, idx, isAdminUnlocked, isAdminUnlocked)}`;
      return `
        <li class="reply-item">
          <span class="reply-badge">${badge}</span>
          ${body}
        </li>
      `;
    }).join('');

    const replyList = replies ? `<ul class="reply-list">${replies}</ul>` : '';
    const replyForm = (canReply && !isEditingFeedback)
      ? `<form class="reply-form" data-id="${f.id}">
           <textarea id="activeReplyTextarea" rows="2" placeholder="답글을 입력하세요" required></textarea>
           <button type="submit" class="btn btn-primary btn-sm">답글 달기</button>
         </form>`
      : '';

    const feedbackBody = isEditingFeedback
      ? editForm('feedback', f.id, null, f.message)
      : `<p>${escapeHtml(f.message)}</p><time>${formatDate(f.createdAt)}</time>${itemActions('feedback', f.id, null, isAdminUnlocked || isOwner, isAdminUnlocked || isOwner)}`;

    return `
      <li class="feedback-item">
        ${feedbackBody}
        ${replyList}
        ${replyForm}
      </li>
    `;
  }

  async function handleFeedbackAreaClick(refreshFn, e) {
    const editBtn = e.target.closest('.edit-item-btn');
    const delBtn = e.target.closest('.delete-item-btn');
    const cancelBtn = e.target.closest('.cancel-edit-btn');

    if (editBtn) {
      editingKey = editBtn.dataset.index != null
        ? `reply-${editBtn.dataset.id}-${editBtn.dataset.index}`
        : `feedback-${editBtn.dataset.id}`;
      refreshFn();
    } else if (delBtn) {
      const isReply = delBtn.dataset.kind === 'reply';
      if (!confirm(isReply ? '이 답글을 삭제하시겠습니까?' : '이 의견을 삭제하시겠습니까? 답글도 함께 삭제됩니다.')) return;
      if (isReply) {
        await deleteReply(delBtn.dataset.id, Number(delBtn.dataset.index));
      } else {
        await deleteFeedback(delBtn.dataset.id);
      }
      refreshFn();
    } else if (cancelBtn) {
      editingKey = null;
      refreshFn();
    }
  }

  async function handleFeedbackAreaSubmit(refreshFn, e) {
    const replyForm = e.target.closest('.reply-form');
    const edit = e.target.closest('.edit-form');

    if (replyForm) {
      e.preventDefault();
      const id = replyForm.dataset.id;
      const message = replyForm.querySelector('textarea').value.trim();
      if (!message) return;
      blurActiveInput();
      await addReply(id, message, isAdminUnlocked);
      refreshFn();
    } else if (edit) {
      e.preventDefault();
      const message = edit.querySelector('textarea').value.trim();
      if (!message) return;
      blurActiveInput();
      if (edit.dataset.kind === 'feedback') {
        await updateFeedback(edit.dataset.id, message);
      } else {
        await updateReply(edit.dataset.id, Number(edit.dataset.index), message);
      }
      editingKey = null;
      refreshFn();
    }
  }

  // --- 건의사항 탭 (전체 공통 의견) ---
  async function renderFeedbackPage() {
    const myToken = renderToken;
    const list = await getGeneralFeedback();
    if (myToken !== renderToken) return;
    feedbackPageList.innerHTML = list.length
      ? list.map(renderReplyBlock).join('')
      : '<li class="feedback-empty">아직 등록된 의견이 없습니다.</li>';
  }

  feedbackPageForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = feedbackPageText.value.trim();
    if (!message) return;
    blurActiveInput();
    // simulationId를 null로 명시하면 'feedback' 스토어의 simulationId 인덱스에 값을 넣으려다
    // 오류가 나므로, 시뮬레이션에 속하지 않은 일반 의견은 이 필드를 아예 넣지 않는다.
    await addFeedback({ message, createdAt: Date.now(), authorToken });
    feedbackPageText.value = '';
    renderFeedbackPage();
  });

  feedbackPageList.addEventListener('submit', (e) => handleFeedbackAreaSubmit(renderFeedbackPage, e));
  feedbackPageList.addEventListener('click', (e) => handleFeedbackAreaClick(renderFeedbackPage, e));

  // --- 관리자: 로그인 / 비밀번호 변경 ---
  function renderAdminGate() {
    if (isAdminUnlocked) {
      adminLogin.hidden = true;
      adminContent.hidden = false;
      renderAdminList();
      renderAdminFeedbackOverview();
    } else {
      adminLogin.hidden = false;
      adminContent.hidden = true;
      adminPasswordInput.value = '';
      adminLoginError.hidden = true;
    }
  }

  adminLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const hash = await sha256(adminPasswordInput.value);
    const stored = await getAdminPasswordHash();
    if (hash === stored) {
      isAdminUnlocked = true;
      renderAdminGate();
    } else {
      adminLoginError.hidden = false;
    }
  });

  passwordChangeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const cur = document.getElementById('curPassword').value;
    const next = document.getElementById('newPassword').value;
    const confirmNext = document.getElementById('newPasswordConfirm').value;

    const showMsg = (text, isError) => {
      passwordChangeMsg.textContent = text;
      passwordChangeMsg.className = 'admin-msg ' + (isError ? 'error' : 'success');
      passwordChangeMsg.hidden = false;
    };

    const curHash = await sha256(cur);
    const stored = await getAdminPasswordHash();
    if (curHash !== stored) {
      showMsg('현재 비밀번호가 올바르지 않습니다.', true);
      return;
    }
    if (next.length < 4) {
      showMsg('새 비밀번호는 4자 이상이어야 합니다.', true);
      return;
    }
    if (next !== confirmNext) {
      showMsg('새 비밀번호 확인이 일치하지 않습니다.', true);
      return;
    }

    await setAdminPasswordHash(await sha256(next));
    passwordChangeForm.reset();
    showMsg('비밀번호가 변경되었습니다.', false);
  });

  // --- 관리자: 시뮬레이션 목록 관리 ---
  async function renderAdminList() {
    const myToken = renderToken;
    const all = await getAllSimulations();
    if (myToken !== renderToken) return;
    adminSimList.innerHTML = all.length
      ? all.map(sim => `
          <li data-id="${sim.id}">
            <div class="admin-sim-info">
              <span class="level-badge">${CATEGORY_LABEL[sim.category]}</span>
              <strong>${escapeHtml(sim.title)}</strong>
              <span class="admin-sim-date">${formatDate(sim.createdAt)}</span>
            </div>
            <div class="admin-sim-actions">
              <button type="button" class="btn btn-sm admin-edit-btn">수정</button>
              <button type="button" class="btn btn-danger btn-sm admin-delete-btn">삭제</button>
            </div>
          </li>
        `).join('')
      : '<li class="feedback-empty">아직 업로드된 시뮬레이션이 없습니다.</li>';
  }

  adminSimList.addEventListener('click', async (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    const id = li.dataset.id;

    if (e.target.closest('.admin-delete-btn')) {
      if (!confirm('이 시뮬레이션을 삭제하시겠습니까? 관련된 건의사항도 함께 삭제됩니다.')) return;
      await deleteSimulation(id);
      if (editingSimId === id) cancelSimEdit();
      renderAdminList();
      return;
    }

    if (e.target.closest('.admin-edit-btn')) {
      const sim = await getSimulation(id);
      if (!sim) return;
      startSimEdit(sim);
    }
  });

  // --- 관리자: 업로드된 시뮬레이션 수정 ---
  // 업로드 폼을 그대로 재사용한다 — 관리자가 "수정" 버튼을 누르면 그 시뮬레이션의
  // 기존 값으로 폼을 채우고, 제출 시 새로 추가하는 대신 기존 문서를 갱신한다.
  // HTML 파일/코드는 다시 첨부하지 않아도 되며, 비워두면 기존 내용을 그대로 유지한다.
  function startSimEdit(sim) {
    editingSimId = sim.id;
    document.getElementById('simTitle').value = sim.title;
    document.getElementById('simCategory').value = sim.category;
    document.getElementById('simDesc').value = sim.description || '';
    document.getElementById('simFile').value = '';
    document.getElementById('simCode').value = '';
    uploadForm.querySelector('input[name="uploadMode"][value="file"]').checked = true;
    fileInputGroup.hidden = false;
    codeInputGroup.hidden = true;

    uploadFormTitle.textContent = '시뮬레이션 수정';
    uploadSubmitBtn.textContent = '수정 완료';
    uploadCancelBtn.hidden = false;
    uploadContentHint.textContent = 'HTML 파일/코드를 다시 첨부하면 실행 내용과 미리보기가 새로 바뀝니다. 비워두면 기존 내용이 그대로 유지됩니다.';
    uploadForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function cancelSimEdit() {
    editingSimId = null;
    uploadForm.reset();
    fileInputGroup.hidden = false;
    codeInputGroup.hidden = true;
    uploadFormTitle.textContent = '새 시뮬레이션 업로드';
    uploadSubmitBtn.textContent = '업로드';
    uploadCancelBtn.hidden = true;
    uploadContentHint.textContent = '미리보기 이미지는 업로드 후 시뮬레이션 실행 화면을 자동으로 캡처해서 만들어집니다.';
  }

  uploadCancelBtn.addEventListener('click', cancelSimEdit);

  // --- 관리자: 건의사항/답글 현황 ---
  // 모든 의견(건의사항 탭 + 시뮬레이션별)을 한곳에 모아 답글 개수를 보여주고,
  // 클릭하면 펼쳐져서 그 자리에서 바로 답글을 달거나 관리할 수 있다.
  async function renderAdminFeedbackOverview() {
    const myToken = renderToken;
    const [allFeedback, allSims] = await Promise.all([getAllFeedback(), getAllSimulations()]);
    if (myToken !== renderToken) return;

    const simTitleById = {};
    allSims.forEach(s => { simTitleById[s.id] = s.title; });

    const sorted = allFeedback.slice().sort((a, b) => b.createdAt - a.createdAt);

    adminFeedbackList.innerHTML = sorted.length
      ? sorted.map(f => {
          const replyCount = (f.replies || []).length;
          const source = f.simulationId
            ? (simTitleById[f.simulationId] || '삭제된 시뮬레이션')
            : '건의사항 탭';
          const isExpanded = expandedFeedbackId === f.id;
          return `
            <li class="admin-feedback-item">
              <button type="button" class="admin-feedback-summary" data-id="${f.id}">
                <span class="admin-feedback-source">${escapeHtml(source)}</span>
                <span class="admin-feedback-msg">${escapeHtml(f.message)}</span>
                <span class="admin-feedback-reply-count ${replyCount ? 'has-replies' : ''}">💬 ${replyCount}</span>
              </button>
              ${isExpanded ? `<ul class="feedback-page-list">${renderReplyBlock(f)}</ul>` : ''}
            </li>
          `;
        }).join('')
      : '<li class="feedback-empty">아직 등록된 의견이 없습니다.</li>';
  }

  adminFeedbackList.addEventListener('click', (e) => {
    const summaryBtn = e.target.closest('.admin-feedback-summary');
    if (summaryBtn) {
      const id = summaryBtn.dataset.id;
      expandedFeedbackId = expandedFeedbackId === id ? null : id;
      renderAdminFeedbackOverview();
      return;
    }
    handleFeedbackAreaClick(renderAdminFeedbackOverview, e);
  });
  adminFeedbackList.addEventListener('submit', (e) => handleFeedbackAreaSubmit(renderAdminFeedbackOverview, e));

  // --- 업로드: 파일 / 코드 붙여넣기 전환 ---
  document.querySelectorAll('input[name="uploadMode"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const mode = document.querySelector('input[name="uploadMode"]:checked').value;
      fileInputGroup.hidden = mode !== 'file';
      codeInputGroup.hidden = mode !== 'code';
    });
  });

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file, 'utf-8');
    });
  }

  // --- 업로드된 HTML을 오프스크린 iframe에 렌더링해 미리보기 이미지를 자동 캡처 ---
  function captureThumbnail(htmlContent) {
    return new Promise((resolve) => {
      if (typeof html2canvas === 'undefined') {
        resolve(null);
        return;
      }

      const frame = document.createElement('iframe');
      frame.style.cssText = 'position:fixed; left:-10000px; top:0; width:800px; height:450px; border:0; visibility:hidden;';
      frame.sandbox = 'allow-scripts allow-same-origin';
      document.body.appendChild(frame);

      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        frame.remove();
        resolve(result);
      };

      const timeoutId = setTimeout(() => finish(null), 8000);

      frame.addEventListener('load', () => {
        setTimeout(async () => {
          try {
            const doc = frame.contentDocument;
            const canvas = await html2canvas(doc.documentElement, {
              width: 800,
              height: 450,
              windowWidth: 800,
              windowHeight: 450,
              backgroundColor: '#ffffff',
            });
            finish(canvas.toDataURL('image/jpeg', 0.72));
          } catch (err) {
            finish(null);
          }
        }, 900);
      });

      // blob: URL 대신 srcdoc을 쓴다 — blob URL은 만든 문서(탭)에 묶여 있어서, 뒤로가기/
      // 히스토리 복원 등으로 문서 상태가 재구성될 때 이미 해제(revoke)된 blob을 가리키게 되면
      // 브라우저가 "파일을 찾을 수 없음/삭제됨" 같은 오류를 보여주는 경우가 있었다.
      // srcdoc은 그런 별도 URL/생명주기가 없어 이 문제 자체가 생기지 않는다.
      frame.srcdoc = htmlContent;
    });
  }

  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const title = document.getElementById('simTitle').value.trim();
    const category = document.getElementById('simCategory').value;
    const level = CATEGORY_LEVEL[category];
    const description = document.getElementById('simDesc').value.trim();
    const mode = document.querySelector('input[name="uploadMode"]:checked').value;
    const htmlFile = document.getElementById('simFile').files[0];
    const codeText = document.getElementById('simCode').value.trim();

    const hasNewContent = mode === 'file' ? !!htmlFile : !!codeText;

    if (!editingSimId && !hasNewContent) {
      alert(mode === 'file' ? 'HTML 파일을 선택해주세요.' : 'HTML 코드를 입력해주세요.');
      return;
    }

    const submitBtn = uploadSubmitBtn;
    submitBtn.disabled = true;

    try {
      let htmlContent = null;
      let thumbnail = null;

      if (hasNewContent) {
        htmlContent = mode === 'file' ? await readFileAsText(htmlFile) : codeText;
        submitBtn.textContent = '미리보기 생성 중...';
        thumbnail = await captureThumbnail(htmlContent);
      }

      if (editingSimId) {
        submitBtn.textContent = '수정 중...';
        const updates = { title, level, category, description };
        if (hasNewContent) {
          updates.htmlContent = htmlContent;
          updates.thumbnail = thumbnail;
        }
        await updateSimulation(editingSimId, updates);
        cancelSimEdit();
      } else {
        submitBtn.textContent = '업로드 중...';
        await addSimulation({
          id: crypto.randomUUID(),
          title,
          level,
          category,
          description,
          htmlContent,
          thumbnail,
          createdAt: Date.now(),
        });
        uploadForm.reset();
        fileInputGroup.hidden = false;
        codeInputGroup.hidden = true;
      }
      renderAdminList();
    } catch (err) {
      alert((editingSimId ? '수정' : '업로드') + ' 중 오류가 발생했습니다: ' + err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = editingSimId ? '수정 완료' : '업로드';
    }
  });

  // --- 시뮬레이션 실행 화면 ---
  // 뒤로가기로 실행 화면을 닫는 로직은 두 겹으로 되어 있다.
  //
  // 1) popstate 이벤트: 대부분의 경우 뒤로가기를 누르면 브라우저가 즉시 이 이벤트를
  //    보내주므로, 이걸로 바로 화면을 닫는다. (빠른 경로)
  //
  // 2) 주소 상태 감시(폴링): popstate가 "왜인지" 오지 않는 경우가 실제로 관찰되었다
  //    (브라우저/환경에 따라 같은 문서 안에서의 뒤로가기인데도 이벤트가 아예 발생하지
  //    않는 경우가 있는 것으로 보인다). 이벤트에만 의존하면 그 경우 화면이 절대 안
  //    닫히므로, 뷰어가 열려 있는 동안 0.15초마다 "지금 주소가 우리가 뷰어를 열 때
  //    붙여둔 해시(#viewer)와 여전히 같은가"를 직접 확인한다. 뒤로가기든, 앞으로가기든,
  //    주소창 직접 수정이든, popstate가 발생했든 안 했든 상관없이 "주소가 바뀌었는데
  //    뷰어가 열려 있다"는 상태만 되면 곧바로 닫는다 — 원인이 무엇이든 결과적으로
  //    항상 닫히는 것을 보장하기 위한 안전망이다.
  //
  // 히스토리는 뷰어를 열 때 딱 하나만 쌓고(#viewer), 닫힐 때는 그 자리를 그대로 둔 채
  // 화면만 정리한다 — 다음에 다시 열 때 항상 "현재 대시보드 자리 → 위로 하나 push"이므로
  // 여러 번 열고 닫아도 로직이 매번 동일하게 반복된다.
  history.replaceState({ view: 'dashboard' }, '', location.pathname + location.search);
  try { localStorage.removeItem('scienceSimHub_debugLog'); } catch (err) { /* 무시 */ }

  const VIEWER_HASH = '#viewer';
  let viewerWatchTimer = null;

  function startViewerWatch() {
    stopViewerWatch();
    viewerWatchTimer = setInterval(() => {
      if (!viewer.hidden && location.hash !== VIEWER_HASH) {
        closeViewerUI();
      }
    }, 150);
  }

  function stopViewerWatch() {
    if (viewerWatchTimer) {
      clearInterval(viewerWatchTimer);
      viewerWatchTimer = null;
    }
  }

  async function openViewer(id) {
    const sim = await getSimulation(id);
    if (!sim) {
      localStorage.removeItem(LAST_SIM_KEY);
      return;
    }

    currentSimId = id;
    editingKey = null;
    viewerTitle.textContent = sim.title;
    localStorage.setItem(LAST_SIM_KEY, id);

    // blob: URL 대신 srcdoc을 쓴다 — blob URL은 만든 문서에 묶여 있어서, 뒤로가기 등으로
    // 문서 상태가 재구성될 때 이미 해제(revoke)된 blob을 가리키면 브라우저가 "파일을
    // 찾을 수 없음/삭제됨" 같은 오류를 보여주는 경우가 있었다. srcdoc은 그런 별도
    // URL·생명주기가 없어 이 문제 자체가 생기지 않는다.
    simFrame.srcdoc = sim.htmlContent;

    await renderFeedbackList(id);
    viewer.hidden = false;
    document.body.style.overflow = 'hidden';
    startViewerWatch();

    if (location.hash !== VIEWER_HASH) {
      // 화면 전환(viewer.hidden = false)이 끝난 뒤, 다음 그리기 프레임으로 한 번 더
      // 미뤄서 history.pushState를 호출한다. 크로미움 계열 브라우저에서 push 직후
      // 곧바로 뒤로가기 버튼을 누르면, 브라우저 툴바 쪽이 새 히스토리 상태를 아직
      // 반영하지 못해 첫 클릭이 씹히고 두 번째 클릭부터 반응하는 현상이 관찰되었다 —
      // 화면이 다 그려질 시간을 살짝 벌어주면 이 문제가 줄어든다.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      try { history.pushState({ view: 'viewer' }, '', VIEWER_HASH); } catch (err) { /* 무시 */ }
    }
  }

  // 뷰어를 닫는 실제 화면 처리는 여기 한 곳에서만 한다 — popstate로 감지되든, 폴링으로
  // 감지되든, X 버튼 클릭이든, 이 함수가 불리기만 하면 화면은 무조건 닫힌다.
  function closeViewerUI() {
    if (viewer.hidden) return;
    stopViewerWatch();
    viewer.hidden = true;
    document.body.style.overflow = '';
    simFrame.srcdoc = '';
    currentSimId = null;
    editingKey = null;
    localStorage.removeItem(LAST_SIM_KEY);
  }

  // 뒤로가기를 한 번 눌렀는데도 대시보드(해시 없는 자리)에 도달하지 못한 경우를 대비한
  // 안전장치: 브라우저가 몰래 여분의 히스토리 항목을 끼워 넣거나, 이번 popstate가 아직
  // 우리가 쌓아둔 뷰어 자리를 완전히 벗어나지 못한 경우, 대시보드에 닿을 때까지 한 단계씩
  // 더 자동으로 되돌아간다 — 사용자는 몇 번을 눌렀든 결과적으로 대시보드까지 도달한다.
  let autoBackChain = 0;
  window.addEventListener('popstate', () => {
    closeViewerUI();
    if (location.hash !== '' && autoBackChain < 5) {
      autoBackChain++;
      setTimeout(() => {
        try { history.back(); } catch (err) { autoBackChain = 0; }
      }, 0);
    } else {
      autoBackChain = 0;
    }
  });

  function closeViewer() {
    if (viewer.hidden) return;
    // 화면은 즉시, 무조건 닫는다 — history.back()이 어떤 이유로든 실패하거나 늦게 반영돼도
    // 화면 전환 자체는 이 시점에 이미 끝나 있다.
    closeViewerUI();
    if (location.hash === VIEWER_HASH) {
      try { history.back(); } catch (err) { /* 무시 */ }
    }
  }

  closeViewerBtn.addEventListener('click', closeViewer);

  async function renderFeedbackList(simId) {
    const list = await getFeedbackForSim(simId);
    feedbackList.innerHTML = list.length
      ? list.map(renderReplyBlock).join('')
      : '<li class="feedback-empty">아직 등록된 의견이 없습니다.</li>';
  }

  feedbackForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentSimId) return;
    const message = feedbackText.value.trim();
    if (!message) return;
    blurActiveInput();

    await addFeedback({
      simulationId: currentSimId,
      message,
      createdAt: Date.now(),
      authorToken,
    });
    feedbackText.value = '';
    await renderFeedbackList(currentSimId);
  });

  feedbackList.addEventListener('submit', (e) => handleFeedbackAreaSubmit(() => renderFeedbackList(currentSimId), e));
  feedbackList.addEventListener('click', (e) => handleFeedbackAreaClick(() => renderFeedbackList(currentSimId), e));

  (async () => {
    await ensurePasswordInitialized();

    const savedCategory = localStorage.getItem(LAST_CATEGORY_KEY);
    if (savedCategory && CATEGORY_LABEL[savedCategory]) {
      currentCategory = savedCategory;
    }
    const savedTab = localStorage.getItem(LAST_TAB_KEY);
    const validTabs = ['middle', 'high', 'feedback', 'admin'];
    showTab(validTabs.includes(savedTab) ? savedTab : 'middle');

    // 새로고침 직전에 열려있던 시뮬레이션이 있으면 그대로 다시 열어준다.
    const savedSimId = localStorage.getItem(LAST_SIM_KEY);
    if (savedSimId) {
      await openViewer(savedSimId);
    }
  })();
})();
