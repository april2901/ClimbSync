import { firebaseConfig, ADMIN_EMAIL } from './config.js';

// Global variables
let db, auth;
let currentUser = null;
let isAdmin = false;
let schedulesList = [];

// Calendar start and end bounds
let startMondayDate = null;
let endSundayDate = null;
let calendarDays = [];

// Active listeners (to unsubscribe when closing modals or reloading)
let schedulesUnsubscribe = null;
let activeCommentsUnsubscribe = null;
let activeScheduleId = null;

// DOM Elements
const authPanel = document.getElementById('auth-panel');
const loginBtn = document.getElementById('login-btn');
const shareBtn = document.getElementById('share-btn');
const weeksContainer = document.getElementById('weeks-container');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');

// Modals
const eventModal = document.getElementById('event-modal');
const eventForm = document.getElementById('event-form');
const eventIdInput = document.getElementById('event-id');
const eventTypeInputs = document.getElementsByName('event-type');
const eventDateInput = document.getElementById('event-date');
const eventStartTimeInput = document.getElementById('event-start-time');
const eventEndTimeInput = document.getElementById('event-end-time');
const eventGymNameInput = document.getElementById('event-gym-name');
const gymNameGroup = document.getElementById('gym-name-group');
const deleteEventBtn = document.getElementById('delete-event-btn');
const modalTitle = document.getElementById('modal-title');

// Comments Modal
const commentsModal = document.getElementById('comments-modal');
const commentsModalTitle = document.getElementById('comments-modal-title');
const detailGymName = document.getElementById('detail-gym-name');
const detailTimeText = document.getElementById('detail-time-text');
const commentsList = document.getElementById('comments-list');
const commentsCountSpan = document.getElementById('comments-count');
const commentForm = document.getElementById('comment-form');
const commentTextInput = document.getElementById('comment-text');
const currentUserAvatar = document.getElementById('current-user-avatar');
const commentLoginPromo = document.getElementById('comment-login-promo');
const commentLoginBtn = document.getElementById('comment-login-btn');

// Participants Elements
const participantsSection = document.getElementById('participants-section');
const participantsList = document.getElementById('participants-list');
const participantsCountSpan = document.getElementById('participants-count');
const joinBtn = document.getElementById('join-btn');

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  const isReady = initFirebase();
  if (!isReady) return;
  
  setupCalendarDates();
  renderCalendarSkeleton();
  setupEventListeners();
});

// 1. Firebase Initialization
function initFirebase() {
  if (firebaseConfig.apiKey === "YOUR_API_KEY_HERE" || !firebaseConfig.apiKey) {
    renderConfigWarning();
    return false;
  }

  // Initialize Firebase (Compat)
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
  auth = firebase.auth();

  // Listen to Auth state changes
  auth.onAuthStateChanged(handleAuthStateChanged);
  return true;
}

// Warning UI when Firebase is not configured
function renderConfigWarning() {
  weeksContainer.innerHTML = `
    <div class="loading-state" style="border: 1px dashed var(--error); border-radius: var(--border-radius-lg); padding: 40px; margin: 20px 0;">
      <i data-lucide="alert-triangle" style="stroke: var(--error); width: 48px; height: 48px; margin-bottom: 16px;"></i>
      <h3 style="color: var(--text-primary); font-size: 18px; font-weight: 700; margin-bottom: 8px;">Firebase 설정이 필요합니다.</h3>
      <p style="text-align: center; font-size: 14px; max-width: 500px; line-height: 1.6; color: var(--text-secondary);">
        웹사이트를 활성화하려면 <code>config.js</code> 파일을 열어 Firebase 인증 정보(apiKey 등) 및 <code>ADMIN_EMAIL</code>을 실제 정보로 수정해주셔야 합니다.
      </p>
    </div>
  `;
  lucide.createIcons();
}

// 2. Setup 3-Week Calendar Dates
function setupCalendarDates() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Find Monday of this week (Mon is 1, Sun is 0)
  const currentDayOfWeek = today.getDay();
  const daysToSubtract = currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1;
  
  startMondayDate = new Date(today);
  startMondayDate.setDate(today.getDate() - daysToSubtract);

  // End date is 3 weeks (21 days) after startMondayDate (so 20 days added)
  endSundayDate = new Date(startMondayDate);
  endSundayDate.setDate(startMondayDate.getDate() + 20);
  endSundayDate.setHours(23, 59, 59, 999);

  // Generate all 21 days
  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
  
  for (let i = 0; i < 21; i++) {
    const d = new Date(startMondayDate);
    d.setDate(startMondayDate.getDate() + i);
    
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const dateVal = String(d.getDate()).padStart(2, '0');
    const dateString = `${year}-${month}-${dateVal}`;
    
    // Check if it's today
    const isToday = d.getTime() === today.getTime();
    
    // Group index: 0 = This Week, 1 = Next Week, 2 = Week After Next
    const weekIndex = Math.floor(i / 7);

    calendarDays.push({
      date: d,
      dateString,
      dateText: `${month}.${dateVal}`,
      dayName: dayNames[d.getDay()],
      isToday,
      weekIndex
    });
  }
}

// 3. Render Calendar Skeleton UI
function renderCalendarSkeleton() {
  weeksContainer.innerHTML = '';

  const weekTitles = ["이번 주", "다음 주", "다다음 주"];

  for (let w = 0; w < 3; w++) {
    const weekStart = calendarDays[w * 7];
    const weekEnd = calendarDays[w * 7 + 6];
    
    const weekColumn = document.createElement('section');
    weekColumn.className = 'week-column';
    weekColumn.innerHTML = `
      <div class="week-header">
        <h3 class="week-title">
          <i data-lucide="calendar"></i>
          <span>${weekTitles[w]}</span>
        </h3>
        <span class="week-range">${weekStart.dateText} - ${weekEnd.dateText}</span>
      </div>
      <div class="day-list" id="week-${w}-days"></div>
    `;
    weeksContainer.appendChild(weekColumn);

    const dayListContainer = document.getElementById(`week-${w}-days`);
    
    // Append 7 days for this week
    for (let d = w * 7; d < w * 7 + 7; d++) {
      const dayInfo = calendarDays[d];
      
      const dayCard = document.createElement('div');
      dayCard.className = `day-card ${dayInfo.isToday ? 'today' : ''}`;
      dayCard.setAttribute('data-day', dayInfo.dayName);
      dayCard.innerHTML = `
        <div class="day-card-header">
          <div class="day-info">
            <span class="day-name">${dayInfo.dayName}</span>
            <span class="day-date">${dayInfo.dateText}</span>
            ${dayInfo.isToday ? '<span class="day-badge-today">TODAY</span>' : ''}
          </div>
          <button class="add-event-btn hidden admin-only" data-date="${dayInfo.dateString}" title="일정 추가">
            <i data-lucide="plus"></i>
          </button>
        </div>
        <div class="day-events" id="events-${dayInfo.dateString}">
          <div class="no-schedule">일정 없음</div>
        </div>
      `;
      dayListContainer.appendChild(dayCard);
    }
  }

  lucide.createIcons();
}

// 4. Handle Auth State Changed
function handleAuthStateChanged(user) {
  currentUser = user;
  
  if (user) {
    isAdmin = user.email === ADMIN_EMAIL;
    
    // Profile Panel
    authPanel.innerHTML = `
      <div class="user-profile">
        <img class="user-avatar" src="${user.photoURL || 'https://via.placeholder.com/150'}" alt="${user.displayName}">
        <div class="user-info-text">
          <span class="user-name">${user.displayName}</span>
          <span class="user-role-badge ${isAdmin ? 'admin' : 'friend'}">
            ${isAdmin ? '관리자' : '친구'}
          </span>
        </div>
        <button id="logout-btn" class="logout-btn" title="로그아웃">
          <i data-lucide="log-out"></i>
        </button>
      </div>
    `;

    // Hook logout event
    document.getElementById('logout-btn').addEventListener('click', () => {
      auth.signOut().then(() => showToast("로그아웃 되었습니다."));
    });

    // Update Modals & Inputs visibility
    currentUserAvatar.src = user.photoURL || 'https://via.placeholder.com/150';
    commentForm.classList.remove('hidden');
    commentLoginPromo.classList.add('hidden');

    // Admin visibility options
    if (isAdmin) {
      document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
    } else {
      document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
    }
  } else {
    isAdmin = false;
    
    // Sign-in Button
    authPanel.innerHTML = `
      <button id="login-btn" class="login-btn">
        <i data-lucide="log-in"></i>
        <span>Google 로그인</span>
      </button>
    `;

    document.getElementById('login-btn').addEventListener('click', loginWithGoogle);
    
    commentForm.classList.add('hidden');
    commentLoginPromo.classList.remove('hidden');
    document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
  }

  // Refresh Lucide Icons
  lucide.createIcons();

  // Start listening to Schedules
  listenToSchedules();
}

// Login trigger
function loginWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider)
    .then((result) => {
      showToast(`${result.user.displayName}님 환영합니다!`);
    })
    .catch((error) => {
      console.error(error);
      showToast("로그인에 실패했습니다.");
    });
}

// 5. Setup event listeners
function setupEventListeners() {
  // Share Button
  shareBtn.addEventListener('click', () => {
    const currentUrl = window.location.href;
    navigator.clipboard.writeText(currentUrl)
      .then(() => showToast("일정 공유 링크가 클립보드에 복사되었습니다!"))
      .catch(() => showToast("링크 복사에 실패했습니다."));
  });

  // Modal Close buttons
  document.querySelectorAll('.close-modal-btn, .cancel-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modalId = btn.getAttribute('data-modal');
      closeModal(modalId);
    });
  });

  // Form submission: Create / Edit Schedule
  eventForm.addEventListener('submit', handleEventFormSubmit);

  // Delete event btn
  deleteEventBtn.addEventListener('click', handleEventDelete);

  // Type change inside schedule form
  eventTypeInputs.forEach(input => {
    input.addEventListener('change', (e) => {
      updateGymInputState(e.target.value);
    });
  });

  // Delegated dynamic calendar clicks (+ buttons or editing)
  weeksContainer.addEventListener('click', (e) => {
    // Click on Add button (+)
    const addBtn = e.target.closest('.add-event-btn');
    if (addBtn) {
      e.stopPropagation();
      const dateStr = addBtn.getAttribute('data-date');
      openAddEventModal(dateStr);
      return;
    }

    // Click on climbing event item (to open comments)
    const eventItem = e.target.closest('.event-item');
    if (eventItem) {
      const id = eventItem.getAttribute('data-id');
      const type = eventItem.getAttribute('data-type');
      
      // If clicking admin edit icon specifically (and user is admin)
      const editBtn = e.target.closest('.edit-event-btn');
      if (editBtn && isAdmin) {
        e.stopPropagation();
        openEditEventModal(id);
        return;
      }

      if (type === 'climbing') {
        openCommentsModal(id);
      } else if (type === 'other' && isAdmin) {
        // "Other Schedule" clicked by Admin -> Open Edit Modal directly
        openEditEventModal(id);
      }
    }
  });

  // Comment submit
  commentForm.addEventListener('submit', handleCommentFormSubmit);

  // Login via comments card promo
  commentLoginBtn.addEventListener('click', loginWithGoogle);

  // Join button toggle
  joinBtn.addEventListener('click', handleJoinToggle);
}

// 6. Listen to Schedules from Firestore
function listenToSchedules() {
  if (schedulesUnsubscribe) {
    schedulesUnsubscribe();
  }

  // Format start and end date strings for query
  const startStr = calendarDays[0].dateString;
  const endStr = calendarDays[20].dateString;

  schedulesUnsubscribe = db.collection('schedules')
    .where('date', '>=', startStr)
    .where('date', '<=', endStr)
    .onSnapshot((snapshot) => {
      schedulesList = [];
      snapshot.forEach(doc => {
        schedulesList.push({ id: doc.id, ...doc.data() });
      });
      renderSchedules();
    }, (error) => {
      console.error("Schedules Sync Error:", error);
    });
}

// 7. Render schedules inside dynamic calendar days
function renderSchedules() {
  // First, clear all schedules from days and show "일정 없음"
  calendarDays.forEach(day => {
    const eventContainer = document.getElementById(`events-${day.dateString}`);
    if (eventContainer) {
      eventContainer.innerHTML = '<div class="no-schedule">일정 없음</div>';
    }
  });

  // Group schedules by date
  const grouped = {};
  schedulesList.forEach(event => {
    if (!grouped[event.date]) {
      grouped[event.date] = [];
    }
    grouped[event.date].push(event);
  });

  // Render schedules
  Object.keys(grouped).forEach(dateStr => {
    const eventContainer = document.getElementById(`events-${dateStr}`);
    if (!eventContainer) return;

    eventContainer.innerHTML = '';
    
    // Sort events by startTime
    const eventsOnDay = grouped[dateStr];
    eventsOnDay.sort((a, b) => a.startTime.localeCompare(b.startTime));

    eventsOnDay.forEach(event => {
      const isClimbing = event.type === 'climbing';
      const eventCard = document.createElement('div');
      
      // Class names
      eventCard.className = `event-item ${event.type}`;
      if (isAdmin) {
        eventCard.className += ' admin-editable';
      }
      eventCard.setAttribute('data-id', event.id);
      eventCard.setAttribute('data-type', event.type);

      // Participants facepile for calendar
      let facepileHtml = '';
      if (isClimbing && event.participants && event.participants.length > 0) {
        facepileHtml = `
          <div class="event-participants-facepile">
            <div class="facepile-avatars">
              ${event.participants.slice(0, 4).map(p => `
                <img class="facepile-avatar" src="${p.photo || 'https://via.placeholder.com/150'}" alt="${p.name}" title="${p.name}">
              `).join('')}
            </div>
            <span class="facepile-text">${event.participants.length}명 참여</span>
          </div>
        `;
      }

      // Contents
      if (isClimbing) {
        const cCount = event.commentCount || 0;
        eventCard.innerHTML = `
          <div class="event-details">
            <span class="event-time">
              <i data-lucide="clock"></i> ${event.startTime} - ${event.endTime}
            </span>
            <span class="event-title">${event.gymName}</span>
            ${facepileHtml}
          </div>
          <div class="event-meta">
            ${cCount > 0 ? `
              <span class="comments-count-badge" title="댓글 수">
                <i data-lucide="message-square"></i> ${cCount}
              </span>
            ` : ''}
          </div>
          ${isAdmin ? `
            <button class="edit-event-btn admin-only" title="일정 수정">
              <i data-lucide="edit-3"></i>
            </button>
          ` : ''}
        `;
      } else {
        eventCard.innerHTML = `
          <div class="event-details">
            <span class="event-time">
              <i data-lucide="clock"></i> ${event.startTime} - ${event.endTime}
            </span>
            <span class="event-title"><i data-lucide="calendar-off"></i> ${event.gymName || '다른 일정'}</span>
          </div>
          ${isAdmin ? `
            <button class="edit-event-btn admin-only" title="일정 수정">
              <i data-lucide="edit-3"></i>
            </button>
          ` : ''}
        `;
      }

      eventContainer.appendChild(eventCard);
    });
  });

  // Re-apply Admin Visibility
  if (isAdmin) {
    document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
  }

  // If comments modal is currently open for a schedule, update its participants too
  if (activeScheduleId) {
    updateCommentsModalParticipants();
  }

  // Load Lucide Icons
  lucide.createIcons();
}

// 8. Modals logic
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  modal.classList.add('hidden');
  document.body.style.overflow = '';
  
  if (modalId === 'comments-modal') {
    activeScheduleId = null;
    if (activeCommentsUnsubscribe) {
      activeCommentsUnsubscribe();
      activeCommentsUnsubscribe = null;
    }
  }
}

// Helper to update Event Modal label and placeholder dynamically
function updateGymInputState(type) {
  const label = document.getElementById('event-gym-name-label');
  if (type === 'other') {
    label.textContent = "장소 또는 설명";
    eventGymNameInput.setAttribute('placeholder', "예: 개인 약속, 회사 업무 등");
  } else {
    label.textContent = "클라이밍장 이름";
    eventGymNameInput.setAttribute('placeholder', "예: 더클라임 강남점, 볼더프렌즈");
  }
}

// 9. Admin Scheduling Modals
function openAddEventModal(dateStr) {
  modalTitle.textContent = "새 일정 추가";
  eventIdInput.value = "";
  
  // Set default form values
  eventDateInput.value = dateStr;
  eventStartTimeInput.value = "18:00";
  eventEndTimeInput.value = "21:00";
  eventGymNameInput.value = "";
  
  // Set Type default
  document.querySelector('input[name="event-type"][value="climbing"]').checked = true;
  updateGymInputState('climbing');
  
  deleteEventBtn.classList.add('hidden');
  
  openModal('event-modal');
}

function openEditEventModal(id) {
  const event = schedulesList.find(e => e.id === id);
  if (!event) return;

  modalTitle.textContent = "일정 수정";
  eventIdInput.value = event.id;
  eventDateInput.value = event.date;
  eventStartTimeInput.value = event.startTime;
  eventEndTimeInput.value = event.endTime;
  
  if (event.type === 'climbing') {
    document.querySelector('input[name="event-type"][value="climbing"]').checked = true;
    updateGymInputState('climbing');
    eventGymNameInput.value = event.gymName || '';
  } else {
    document.querySelector('input[name="event-type"][value="other"]').checked = true;
    updateGymInputState('other');
    eventGymNameInput.value = event.gymName || '';
  }

  deleteEventBtn.classList.remove('hidden');
  openModal('event-modal');
}

// Handle Admin Submit Schedule Form
function handleEventFormSubmit(e) {
  e.preventDefault();
  
  if (!isAdmin) {
    showToast("일정을 변경할 권한이 없습니다.");
    return;
  }

  const id = eventIdInput.value;
  const type = document.querySelector('input[name="event-type"]:checked').value;
  const date = eventDateInput.value;
  const startTime = eventStartTimeInput.value;
  const endTime = eventEndTimeInput.value;
  const gymName = eventGymNameInput.value.trim();

  // Validation
  if (startTime >= endTime) {
    showToast("종료 시간은 시작 시간보다 늦어야 합니다.");
    return;
  }

  const eventData = {
    type,
    date,
    startTime,
    endTime,
    gymName,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  if (id) {
    // Edit Existing
    db.collection('schedules').doc(id).update(eventData)
      .then(() => {
        closeModal('event-modal');
        showToast("일정이 수정되었습니다.");
      })
      .catch((err) => {
        console.error(err);
        showToast("일정 수정 실패");
      });
  } else {
    // Create New
    eventData.commentCount = 0;
    eventData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    db.collection('schedules').add(eventData)
      .then(() => {
        closeModal('event-modal');
        showToast("일정이 등록되었습니다.");
      })
      .catch((err) => {
        console.error(err);
        showToast("일정 추가 실패");
      });
  }
}

// Delete Event
function handleEventDelete() {
  const id = eventIdInput.value;
  if (!id) return;

  if (!isAdmin) {
    showToast("삭제 권한이 없습니다.");
    return;
  }

  if (confirm("정말로 이 일정을 삭제하시겠습니까?\n해당 일정의 댓글도 모두 삭제됩니다.")) {
    // 1. Delete associated comments
    db.collection('comments').where('scheduleId', '==', id).get()
      .then(snapshot => {
        const batch = db.batch();
        snapshot.docs.forEach(doc => {
          batch.delete(doc.ref);
        });
        return batch.commit();
      })
      .then(() => {
        // 2. Delete schedule doc
        return db.collection('schedules').doc(id).delete();
      })
      .then(() => {
        closeModal('event-modal');
        showToast("일정이 성공적으로 삭제되었습니다.");
      })
      .catch(err => {
        console.error("Delete Error:", err);
        showToast("일정 삭제 오류 발생.");
      });
  }
}

// 10. Comments System
function openCommentsModal(id) {
  const event = schedulesList.find(e => e.id === id);
  if (!event || event.type !== 'climbing') return;

  activeScheduleId = id;
  
  // Format Date Nicely for Modal Header (e.g. 2026년 06월 16일 (화))
  const dObj = new Date(event.date);
  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
  const dateStr = `${dObj.getFullYear()}년 ${String(dObj.getMonth() + 1).padStart(2, '0')}월 ${String(dObj.getDate()).padStart(2, '0')}일 (${dayNames[dObj.getDay()]})`;

  commentsModalTitle.textContent = `${dateStr} 일정 정보`;
  detailGymName.textContent = event.gymName;
  detailTimeText.textContent = `${event.startTime} - ${event.endTime}`;

  // Clear previous list
  commentsList.innerHTML = '<div class="spinner" style="margin: 30px auto;"></div>';
  commentsCountSpan.textContent = '0';

  // Update participants list and buttons
  updateCommentsModalParticipants();

  openModal('comments-modal');

  // Load comments in real-time
  if (activeCommentsUnsubscribe) {
    activeCommentsUnsubscribe();
  }

  activeCommentsUnsubscribe = db.collection('comments')
    .where('scheduleId', '==', id)
    .onSnapshot((snapshot) => {
      const comments = [];
      snapshot.forEach(doc => {
        comments.push({ id: doc.id, ...doc.data() });
      });

      // Sort by creation date in memory (no indices required on DB side)
      comments.sort((a, b) => {
        const t1 = a.createdAt ? a.createdAt.toMillis() : Date.now();
        const t2 = b.createdAt ? b.createdAt.toMillis() : Date.now();
        return t1 - t2;
      });

      renderComments(comments);
    }, (error) => {
      console.error("Comments Fetch Error:", error);
      commentsList.innerHTML = '<div class="comment-empty">댓글을 불러올 수 없습니다.</div>';
    });
}

// Render Comment List UI
function renderComments(comments) {
  commentsCountSpan.textContent = comments.length;
  
  if (comments.length === 0) {
    commentsList.innerHTML = '<div class="comment-empty">등록된 댓글이 없습니다. 첫 댓글을 달아보세요!</div>';
    return;
  }

  commentsList.innerHTML = '';
  comments.forEach(comment => {
    const isCommentAdmin = comment.userEmail === ADMIN_EMAIL;
    const canDelete = currentUser && (currentUser.uid === comment.userId || isAdmin);
    
    // Create card
    const commentCard = document.createElement('div');
    commentCard.className = 'comment-card';
    
    // Formatted time (friendly or simple date)
    let timeText = '방금 전';
    if (comment.createdAt) {
      const cDate = comment.createdAt.toDate();
      const hours = String(cDate.getHours()).padStart(2, '0');
      const minutes = String(cDate.getMinutes()).padStart(2, '0');
      timeText = `${cDate.getMonth() + 1}/${cDate.getDate()} ${hours}:${minutes}`;
    }

    commentCard.innerHTML = `
      <img class="user-avatar" src="${comment.userPhoto || 'https://via.placeholder.com/150'}" alt="${comment.userName}">
      <div class="comment-card-content">
        <div class="comment-card-header">
          <span class="comment-author">${comment.userName}</span>
          ${isCommentAdmin ? '<span class="comment-author-badge">관리자</span>' : ''}
          <span class="comment-time">${timeText}</span>
        </div>
        <p class="comment-text">${escapeHtml(comment.text)}</p>
      </div>
      ${canDelete ? `
        <button class="delete-comment-btn" data-id="${comment.id}" title="댓글 삭제">
          <i data-lucide="trash-2"></i>
        </button>
      ` : ''}
    `;

    // Hook delete button directly
    if (canDelete) {
      commentCard.querySelector('.delete-comment-btn').addEventListener('click', () => {
        deleteComment(comment.id);
      });
    }

    commentsList.appendChild(commentCard);
  });

  // Scroll to bottom
  commentsList.scrollTop = commentsList.scrollHeight;

  lucide.createIcons();
}

// Submit a new comment
function handleCommentFormSubmit(e) {
  e.preventDefault();

  if (!currentUser) {
    showToast("로그인이 필요한 서비스입니다.");
    return;
  }

  const text = commentTextInput.value.trim();
  if (!text || !activeScheduleId) return;

  commentTextInput.value = '';

  const newComment = {
    scheduleId: activeScheduleId,
    text,
    userId: currentUser.uid,
    userName: currentUser.displayName,
    userPhoto: currentUser.photoURL,
    userEmail: currentUser.email,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  // 1. Add to comments collection
  db.collection('comments').add(newComment)
    .then(() => {
      // 2. Increment commentCount in schedules collection
      return db.collection('schedules').doc(activeScheduleId).update({
        commentCount: firebase.firestore.FieldValue.increment(1)
      });
    })
    .catch((err) => {
      console.error("Add Comment Error:", err);
      showToast("댓글 저장에 실패했습니다.");
    });
}

// Delete comment
function deleteComment(commentId) {
  if (confirm("정말로 이 댓글을 삭제하시겠습니까?")) {
    db.collection('comments').doc(commentId).delete()
      .then(() => {
        if (activeScheduleId) {
          // Decrement count
          return db.collection('schedules').doc(activeScheduleId).update({
            commentCount: firebase.firestore.FieldValue.increment(-1)
          });
        }
      })
      .then(() => {
        showToast("댓글이 삭제되었습니다.");
      })
      .catch(err => {
        console.error("Delete Comment Error:", err);
        showToast("댓글 삭제 오류 발생.");
      });
  }
}

// Update participants chips list and join toggle button inside modal
function updateCommentsModalParticipants() {
  if (!activeScheduleId) return;
  const event = schedulesList.find(e => e.id === activeScheduleId);
  if (!event) return;

  const participants = event.participants || [];
  participantsCountSpan.textContent = participants.length;

  if (participants.length === 0) {
    participantsList.innerHTML = '<div class="no-schedule" style="padding: 0;">참여 중인 친구가 없습니다.</div>';
  } else {
    participantsList.innerHTML = '';
    participants.forEach(p => {
      const isPartAdmin = p.email === ADMIN_EMAIL;
      const chip = document.createElement('div');
      chip.className = `participant-chip ${isPartAdmin ? 'admin' : ''}`;
      chip.innerHTML = `
        <img class="user-avatar" src="${p.photo || 'https://via.placeholder.com/150'}" alt="${p.name}">
        <span>${p.name}</span>
      `;
      participantsList.appendChild(chip);
    });
  }

  // Show/Hide Join Button based on auth state
  if (!currentUser) {
    joinBtn.classList.add('hidden');
  } else {
    joinBtn.classList.remove('hidden');
    const hasJoined = participants.some(p => p.uid === currentUser.uid);
    if (hasJoined) {
      joinBtn.className = 'join-btn joined';
      joinBtn.innerHTML = '<i data-lucide="user-minus"></i> <span>참여 취소</span>';
    } else {
      joinBtn.className = 'join-btn';
      joinBtn.innerHTML = '<i data-lucide="user-plus"></i> <span>나도 갈래!</span>';
    }
  }
  lucide.createIcons();
}

// Join/Leave action click
function handleJoinToggle() {
  if (!currentUser || !activeScheduleId) {
    showToast("로그인이 필요합니다.");
    return;
  }
  
  const event = schedulesList.find(e => e.id === activeScheduleId);
  if (!event) return;

  const participants = event.participants || [];
  const hasJoined = participants.some(p => p.uid === currentUser.uid);
  const docRef = db.collection('schedules').doc(activeScheduleId);

  if (hasJoined) {
    // Leave the climbing schedule
    const updated = participants.filter(p => p.uid !== currentUser.uid);
    docRef.update({ participants: updated })
      .then(() => {
        showToast("동행 참여를 취소했습니다.");
      })
      .catch(err => {
        console.error("Leave Error:", err);
        showToast("동행 취소 중 오류 발생.");
      });
  } else {
    // Join the climbing schedule
    const newParticipant = {
      uid: currentUser.uid,
      name: currentUser.displayName,
      photo: currentUser.photoURL,
      email: currentUser.email
    };
    
    docRef.update({
      participants: firebase.firestore.FieldValue.arrayUnion(newParticipant)
    })
      .then(() => {
        showToast("동행 참여를 등록했습니다! 🧗");
      })
      .catch(err => {
        console.error("Join Error:", err);
        showToast("동행 등록 중 오류 발생.");
      });
  }
}

// 11. Helper functions
function showToast(message) {
  toastMessage.textContent = message;
  toast.classList.remove('hidden');
  
  // Clear any existing timeouts
  if (window.toastTimeout) {
    clearTimeout(window.toastTimeout);
  }
  
  window.toastTimeout = setTimeout(() => {
    toast.classList.add('hidden');
  }, 3000);
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
