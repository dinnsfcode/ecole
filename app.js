const views = [...document.querySelectorAll('.view')];
const navButtons = [...document.querySelectorAll('[data-view]')];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const workspaceStartsEmpty = true;

function animateView(view) {
  const items = view.querySelectorAll('.reveal');
  if (!window.gsap || reducedMotion) return;
  gsap.killTweensOf(items);
  gsap.fromTo(items,
    { y: 24, opacity: 0 },
    { y: 0, opacity: 1, duration: .68, stagger: .07, ease: 'power3.out', clearProps: 'transform' }
  );
}

function switchView(id) {
  const target = document.getElementById(id);
  if (!target) return;
  views.forEach(view => view.classList.toggle('active', view === target));
  navButtons.forEach(button => button.classList.toggle('active', button.dataset.view === id));
  window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
  animateView(target);
  trackActivity('page_view', id);
  if (id === 'students') loadTeacherConnections();
}

function applyRoleInterface(session, resolvedRole = window.ecoleUserRole) {
  if (!session?.user) return;
  const role = resolvedRole || (session.user.user_metadata?.role === 'student' ? 'student' : 'teacher');
  document.body.dataset.userRole = role;
  const firstName = session.user.user_metadata?.first_name?.trim();
  if (role === 'student') {
    const title = document.getElementById('student-home-title');
    if (title && firstName) {
      const emphasis = document.createElement('em');
      emphasis.textContent = 'Учимся в своём ритме.';
      title.replaceChildren(document.createTextNode(`Добро пожаловать, ${firstName}.`), document.createElement('br'), emphasis);
    }
    switchView('student-home');
  } else if (role === 'admin') {
    switchView('admin-dashboard');
    loadAdminDashboard();
  } else {
    switchView('today');
  }
}

function trackActivity(eventType, page = null, metadata = {}) {
  const client = window.ecoleSupabase;
  if (!client || !window.ecoleCurrentSession?.user) return;
  client.rpc('track_activity', {
    p_event_type: eventType,
    p_page: page,
    p_metadata: metadata
  }).then(() => {}).catch(() => {});
}

function formatAdminDate(value, withTime = true) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow', day: '2-digit', month: 'short', year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {})
  }).format(date);
}

function moscowDateKey(value = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date(value));
}

async function loadAdminDashboard() {
  const client = window.ecoleSupabase;
  if (!client || window.ecoleUserRole !== 'admin') return;
  const state = document.getElementById('adminLoadState');
  const body = document.getElementById('adminUsersBody');
  const activityList = document.getElementById('adminActivityList');
  if (state) state.textContent = 'Обновляем…';

  const [profilesResult, activityResult] = await Promise.all([
    client.from('profiles')
      .select('id,email,first_name,last_name,role,created_at,last_seen_at,last_page', { count: 'exact' })
      .order('created_at', { ascending: false }).limit(500),
    client.from('activity_events')
      .select('id,user_id,event_type,page,created_at').order('created_at', { ascending: false }).limit(60)
  ]);

  if (profilesResult.error) {
    if (state) state.textContent = 'Нужно выполнить файл supabase-admin.sql';
    if (body) body.innerHTML = '<tr><td colspan="5">Админ-таблицы ещё не подключены в Supabase.</td></tr>';
    return;
  }

  const profiles = profilesResult.data || [];
  const today = moscowDateKey();
  const activeToday = profiles.filter(profile => profile.last_seen_at && moscowDateKey(profile.last_seen_at) === today).length;
  document.getElementById('adminTotalUsers').textContent = String(profilesResult.count ?? profiles.length);
  document.getElementById('adminTeachers').textContent = String(profiles.filter(profile => profile.role === 'teacher').length);
  document.getElementById('adminStudents').textContent = String(profiles.filter(profile => profile.role === 'student').length);
  document.getElementById('adminActiveToday').textContent = String(activeToday);
  if (state) state.textContent = `Обновлено ${formatAdminDate(new Date())}`;

  if (body) {
    body.replaceChildren();
    if (!profiles.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 5; cell.textContent = 'Пользователей пока нет.'; row.append(cell); body.append(row);
    } else {
      const roleLabels = { admin: 'Администратор', teacher: 'Учитель', student: 'Ученик' };
      profiles.forEach(profile => {
        const row = document.createElement('tr');
        const name = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
        const cells = [
          name ? `${name}\n${profile.email}` : profile.email,
          roleLabels[profile.role] || profile.role,
          formatAdminDate(profile.created_at),
          formatAdminDate(profile.last_seen_at),
          profile.last_page || '—'
        ];
        cells.forEach((value, index) => {
          const cell = document.createElement('td');
          if (index === 0 && name) {
            const strong = document.createElement('strong'); strong.textContent = name;
            const small = document.createElement('small'); small.textContent = profile.email;
            cell.append(strong, small);
          } else {
            cell.textContent = value;
          }
          if (index === 1) cell.dataset.role = profile.role;
          row.append(cell);
        });
        body.append(row);
      });
    }
  }

  if (activityList) {
    activityList.replaceChildren();
    const events = activityResult.error ? [] : (activityResult.data || []);
    const profileMap = new Map(profiles.map(profile => [profile.id, profile]));
    if (!events.length) {
      const empty = document.createElement('p'); empty.textContent = 'Действий пока нет.'; activityList.append(empty);
    } else {
      const eventLabels = { sign_in: 'вошёл(ла) в аккаунт', page_view: 'открыл(а) раздел' };
      events.slice(0, 12).forEach(event => {
        const profile = profileMap.get(event.user_id);
        const item = document.createElement('article');
        const dot = document.createElement('span'); dot.className = 'admin-activity-dot';
        const text = document.createElement('div');
        const strong = document.createElement('strong'); strong.textContent = profile?.email || 'Пользователь';
        const description = document.createElement('p');
        description.textContent = `${eventLabels[event.event_type] || event.event_type}${event.page ? ` · ${event.page}` : ''}`;
        const time = document.createElement('small'); time.textContent = formatAdminDate(event.created_at);
        text.append(strong, description, time); item.append(dot, text); activityList.append(item);
      });
    }
  }
}

navButtons.forEach(button => button.addEventListener('click', () => switchView(button.dataset.view)));
document.querySelectorAll('[data-view-jump]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.viewJump)));

document.querySelectorAll('.filter-pills').forEach(group => {
  group.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    group.querySelectorAll('button').forEach(item => item.classList.remove('active'));
    button.classList.add('active');
  });
});

let activeStudentFilter = 'all';
const studentSearch = document.getElementById('studentSearch');
function applyStudentFilters() {
  const query = studentSearch?.value.trim().toLowerCase() || '';
  document.querySelectorAll('.student-card[data-kind]').forEach(card => {
    const kindMatches = activeStudentFilter === 'all' || card.dataset.kind === activeStudentFilter;
    const queryMatches = !query || card.textContent.toLowerCase().includes(query);
    card.classList.toggle('is-filtered', !(kindMatches && queryMatches));
  });
}
document.querySelectorAll('[data-student-filter]').forEach(button => button.addEventListener('click', () => {
  activeStudentFilter = button.dataset.studentFilter;
  applyStudentFilters();
}));
studentSearch?.addEventListener('input', applyStudentFilters);

const connectionRequestsPanel = document.getElementById('connectionRequestsPanel');
const connectionRequestList = document.getElementById('connectionRequestList');
const connectionRequestsState = document.getElementById('connectionRequestsState');
let teacherConnectionRows = [];
let studentConnectionRows = [];

function connectionStudentName(request) {
  const name = `${request.first_name || ''} ${request.last_name || ''}`.trim();
  return name || request.student_email || 'Новый ученик';
}

function renderConnectedStudents(requests = []) {
  teacherConnectionRows = requests;
  const grid = document.querySelector('.students-grid');
  if (!grid) return;
  const activeRequests = requests.filter(request => request.status === 'active');
  if (!activeRequests.length) {
    grid.innerHTML = emptyStateMarkup('Добавьте первого ученика', 'Когда вы примете заявку, ученик появится здесь.', 'student', '＋ Добавить ученика');
    document.querySelector('.nav-item[data-view="students"] .nav-count')?.replaceChildren(document.createTextNode(String(requests.filter(request => request.status === 'pending').length)));
    document.querySelectorAll('[data-student-filter]').forEach(button => {
      const labels = { all: `Все · ${activeRequests.length}`, student: `Ученики · ${activeRequests.length}`, group: 'Группы · 0' };
      button.textContent = labels[button.dataset.studentFilter] || button.textContent;
    });
    return;
  }
  grid.replaceChildren();
  activeRequests.forEach((request, index) => {
    const name = connectionStudentName(request);
    const avatar = initialsFromName(name);
    const card = document.createElement('article');
    card.className = `student-card reveal${index === 0 ? ' featured' : ''}`;
    card.dataset.kind = 'student';
    card.innerHTML = `<div class="student-top"><span class="avatar large peach">${avatar}</span><span class="status">Подключён</span></div><h3></h3><p></p><div class="skill-line"><span style="--p:0%"></span></div><div class="student-stats"><span><b>0</b> занятий</span><span><b>0</b> заданий</span><span><b>новый</b> профиль</span></div><button data-open-person>Открыть карточку ↗</button>`;
    card.querySelector('h3').textContent = name;
    card.querySelector('p').textContent = request.student_email || 'Профиль ученика';
    const button = card.querySelector('[data-open-person]');
    button.dataset.name = name;
    button.dataset.course = 'Новое обучение';
    button.dataset.avatar = avatar;
    button.addEventListener('click', () => openPersonWorkspace({
      name,
      course: 'Новое обучение',
      avatar,
      isRealConnection: true,
      studentEmail: request.student_email,
      connectionId: request.connection_id
    }, 'overview'));
    grid.append(card);
  });
  const pendingCount = requests.filter(request => request.status === 'pending').length;
  document.querySelector('.nav-item[data-view="students"] .nav-count')?.replaceChildren(document.createTextNode(String(activeRequests.length + pendingCount)));
  document.querySelectorAll('[data-student-filter]').forEach(button => {
    const labels = { all: `Все · ${activeRequests.length}`, student: `Ученики · ${activeRequests.length}`, group: 'Группы · 0' };
    button.textContent = labels[button.dataset.studentFilter] || button.textContent;
  });
  applyStudentFilters();
  renderConnectionConversations(activeRequests, 'teacher');
}

function renderConnectionRequests(requests = []) {
  if (!connectionRequestsPanel || !connectionRequestList) return;
  connectionRequestsPanel.hidden = false;
  const pending = requests.filter(request => request.status === 'pending');
  connectionRequestList.replaceChildren();
  if (connectionRequestsState) {
    connectionRequestsState.textContent = pending.length
      ? `${pending.length} ${pending.length === 1 ? 'новая заявка ждёт решения.' : 'новые заявки ждут решения.'}`
      : 'Новых заявок пока нет. Когда ученик введёт ваш код, он появится здесь.';
  }
  if (!pending.length) return;
  pending.forEach(request => {
    const name = connectionStudentName(request);
    const item = document.createElement('div');
    item.className = 'connection-request';
    item.dataset.connectionId = request.connection_id;
    const avatar = document.createElement('span');
    avatar.className = 'avatar peach';
    avatar.textContent = initialsFromName(name);
    const info = document.createElement('div');
    const title = document.createElement('h4');
    title.textContent = name;
    const email = document.createElement('p');
    email.textContent = request.student_email || 'email не указан';
    const date = document.createElement('small');
    date.textContent = `Отправлено ${formatAdminDate(request.created_at)}`;
    info.append(title, email, date);
    const actions = document.createElement('div');
    actions.className = 'connection-request-actions';
    const accept = document.createElement('button');
    accept.type = 'button';
    accept.dataset.connectionAction = 'accept';
    accept.textContent = 'Принять';
    const reject = document.createElement('button');
    reject.type = 'button';
    reject.dataset.connectionAction = 'reject';
    reject.textContent = 'Отклонить';
    actions.append(accept, reject);
    item.append(avatar, info, actions);
    connectionRequestList.append(item);
  });
}

async function loadTeacherConnections() {
  const client = window.ecoleSupabase;
  const userId = window.ecoleCurrentSession?.user?.id;
  if (!connectionRequestsPanel || window.ecoleUserRole === 'student') return;
  if (!client || !userId) {
    connectionRequestsPanel.hidden = true;
    return;
  }
  connectionRequestsPanel.hidden = false;
  if (connectionRequestsState) connectionRequestsState.textContent = 'Проверяем заявки…';
  const { data, error } = await client.rpc('get_teacher_connection_requests');
  if (error) {
    if (connectionRequestsState) connectionRequestsState.textContent = 'Чтобы видеть заявки, обновите SQL-файл в Supabase.';
    showToast(`Заявки не загрузились: ${error.message}`);
    return;
  }
  renderConnectionRequests(data || []);
  renderConnectedStudents(data || []);
}

function teacherNameFromConnection(connection) {
  const name = `${connection.first_name || ''} ${connection.last_name || ''}`.trim();
  return name || connection.teacher_email || 'Преподаватель';
}

function renderStudentConnections(connections = []) {
  studentConnectionRows = connections;
  const active = connections.filter(connection => connection.status === 'active');
  const pending = connections.filter(connection => connection.status === 'pending');
  const greeting = document.getElementById('studentGreeting');
  const courseCard = document.querySelector('.student-course-card .student-course-placeholder');
  const nextCard = document.querySelector('.student-next-card');
  const scheduleEmpty = document.querySelector('#student-schedule .student-simple-empty');
  if (!connections.length) return;
  if (greeting) {
    if (active.length) {
      greeting.textContent = `Вы подключены к преподавателю ${teacherNameFromConnection(active[0])}. Расписание, задания и материалы появятся после того, как преподаватель их добавит.`;
    } else if (pending.length) {
      greeting.textContent = `Заявка преподавателю ${teacherNameFromConnection(pending[0])} отправлена. Ждём подтверждения.`;
    }
  }
  if (courseCard) {
    const connection = active[0] || pending[0];
    const name = teacherNameFromConnection(connection);
    courseCard.innerHTML = `<span class="student-card-empty-icon" aria-hidden="true">${initialsFromName(name)}</span><div><strong>${active.length ? 'Вы подключены к преподавателю' : 'Заявка ожидает подтверждения'}</strong><p>${name}${connection.teacher_email ? ` · ${connection.teacher_email}` : ''}</p></div><button class="soft-button" type="button" data-view-jump="student-schedule">${active.length ? 'Открыть расписание' : 'Проверить позже'}</button>`;
    courseCard.querySelector('[data-view-jump]')?.addEventListener('click', event => switchView(event.currentTarget.dataset.viewJump));
  }
  if (nextCard && active.length) {
    nextCard.querySelector('.student-status-pill').textContent = 'Подключено';
    nextCard.querySelector('h2').textContent = 'Преподаватель подключён';
    nextCard.querySelector('p').textContent = 'Занятий пока нет. Когда преподаватель запланирует урок, он появится здесь и в расписании.';
    const action = nextCard.querySelector('[data-student-action="join"]');
    if (action) {
      action.removeAttribute('data-student-action');
      action.textContent = 'Открыть расписание →';
      action.addEventListener('click', () => switchView('student-schedule'), { once: true });
    }
  }
  if (scheduleEmpty && active.length) {
    scheduleEmpty.innerHTML = '<span class="student-card-empty-icon" aria-hidden="true">□</span><div><span class="eyebrow">Преподаватель подключён</span><h2>Расписание пока пусто</h2><p>Когда преподаватель назначит урок, здесь появятся дата, московское время и ссылка на занятие.</p></div>';
  }
  renderConnectionConversations(active, 'student');
}

async function loadStudentConnections() {
  const client = window.ecoleSupabase;
  const userId = window.ecoleCurrentSession?.user?.id;
  if (!client || !userId || window.ecoleUserRole !== 'student') return;
  const { data, error } = await client.rpc('get_student_teacher_connections');
  if (error) {
    showToast(`Подключение не загрузилось: ${error.message}`);
    return;
  }
  renderStudentConnections(data || []);
}

async function updateTeacherConnection(connectionId, action) {
  const client = window.ecoleSupabase;
  if (!client || !connectionId) return;
  const fn = action === 'accept' ? 'accept_teacher_connection' : 'reject_teacher_connection';
  const label = action === 'accept' ? 'принимаем' : 'отклоняем';
  const item = document.querySelector(`[data-connection-id="${connectionId}"]`);
  item?.querySelectorAll('button').forEach(button => { button.disabled = true; });
  showToast(`Заявку ${label}…`);
  const { error } = await client.rpc(fn, { p_connection_id: connectionId });
  if (error) {
    item?.querySelectorAll('button').forEach(button => { button.disabled = false; });
    showToast(`Не удалось обновить заявку: ${error.message}`);
    return;
  }
  showToast(action === 'accept' ? 'Ученик добавлен' : 'Заявка отклонена');
  loadTeacherConnections();
}

document.getElementById('refreshConnectionRequests')?.addEventListener('click', loadTeacherConnections);
connectionRequestList?.addEventListener('click', event => {
  const button = event.target.closest('[data-connection-action]');
  if (!button) return;
  const item = button.closest('[data-connection-id]');
  updateTeacherConnection(item?.dataset.connectionId, button.dataset.connectionAction);
});

let activePerson = { name: 'Маша Соколова', course: '3D Generalist', avatar: 'МС' };

function selectPersonTab(tabName = 'course') {
  const activePanel = document.querySelector(`[data-person-panel="${tabName}"]`);
  document.querySelectorAll('[data-person-tab]').forEach(tab => tab.classList.toggle('active', tab.dataset.personTab === tabName));
  document.querySelectorAll('[data-person-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.personPanel === tabName));
  if (activePanel && window.gsap && !reducedMotion) {
    gsap.fromTo(activePanel, { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: .38, ease: 'power3.out' });
  }
}

function renderEmptyPersonWorkspace(person) {
  const overview = document.querySelector('[data-person-panel="overview"]');
  const course = document.querySelector('[data-person-panel="course"]');
  const materials = document.querySelector('[data-person-panel="materials"]');
  const history = document.querySelector('[data-person-panel="history"]');
  if (overview) {
    overview.innerHTML = `<article class="panel"><span class="eyebrow">О человеке</span><h2>Профиль подключён</h2><p>${person.studentEmail || 'Ученик'} уже связан с вашим профилем. Здесь появятся цель обучения, заметки и ближайшая встреча, когда вы их добавите.</p></article><article class="panel"><span class="eyebrow">Следующая встреча</span><h2>Пока не назначена</h2><p>Запланируйте первый урок — он появится у вас и у ученика в расписании.</p></article>`;
  }
  if (course) {
    course.className = 'person-panel course-workspace';
    course.innerHTML = `<section class="course-lessons reveal real-empty-course">${emptyStateMarkup('Курс пока пустой', 'Добавьте первый урок, материалы или домашнее задание — и здесь начнёт собираться индивидуальная траектория ученика.', 'lesson', '＋ Запланировать урок')}</section>`;
  }
  if (materials) {
    materials.innerHTML = `<article class="panel">${emptyStateMarkup('Материалов пока нет', 'Файлы и ссылки появятся здесь только после того, как вы добавите их к конкретному уроку или профилю ученика.', 'material', '＋ Добавить материал')}</article>`;
  }
  if (history) {
    history.innerHTML = `<article class="panel">${emptyStateMarkup('История занятий пуста', 'Проведённые уроки, записи и домашние задания появятся здесь после первых занятий.', 'lesson', '＋ Запланировать урок')}</article>`;
  }
}

function openPersonWorkspace(person, tabName = 'course') {
  activePerson = {
    name: person.name || 'Ученик',
    course: person.course || 'Индивидуальная программа',
    avatar: person.avatar || '—',
    isRealConnection: Boolean(person.isRealConnection),
    studentEmail: person.studentEmail || ''
  };
  document.getElementById('personAvatar').textContent = activePerson.avatar;
  document.getElementById('person-detail-title').textContent = activePerson.name;
  document.getElementById('personCourseLabel').textContent = activePerson.course;
  document.getElementById('personCourseTitle').textContent = activePerson.course.split(' · ')[0];
  if (activePerson.isRealConnection) renderEmptyPersonWorkspace(activePerson);
  selectPersonTab(tabName);
  switchView('person-detail');
}

document.querySelectorAll('[data-open-person]').forEach(button => button.addEventListener('click', () => {
  openPersonWorkspace({ name: button.dataset.name, course: button.dataset.course, avatar: button.dataset.avatar });
}));

document.querySelectorAll('[data-person-tab]').forEach(tab => tab.addEventListener('click', () => selectPersonTab(tab.dataset.personTab)));

let activeHomeworkItem = document.querySelector('.homework-item.active');
let homeworkFilter = 'review';
const homeworkSearch = document.getElementById('homeworkSearch');

function showHomeworkItem(item) {
  if (!item) return;
  activeHomeworkItem = item;
  document.querySelectorAll('.homework-item').forEach(entry => entry.classList.toggle('active', entry === item));
  document.getElementById('reviewStudent').textContent = item.dataset.student;
  document.getElementById('reviewCourse').textContent = item.dataset.course;
  document.getElementById('reviewAvatar').textContent = item.dataset.avatar;
  document.getElementById('reviewTitle').textContent = item.dataset.title;
  document.getElementById('reviewDescription').textContent = item.dataset.description;
  document.getElementById('reviewFile').textContent = item.dataset.file;
  document.getElementById('reviewDue').textContent = item.dataset.due;
  const sourceState = item.querySelector('.item-state');
  const reviewState = document.getElementById('reviewState');
  reviewState.textContent = sourceState?.textContent || 'На проверке';
  reviewState.className = sourceState?.className || 'item-state';
  document.getElementById('homeworkFeedback').value = '';
  if (window.gsap && !reducedMotion) gsap.fromTo('#homeworkReview', { opacity: .55, y: 6 }, { opacity: 1, y: 0, duration: .24, ease: 'power2.out' });
}

function applyHomeworkFilters() {
  const query = homeworkSearch?.value.trim().toLowerCase() || '';
  document.querySelectorAll('.homework-item').forEach(item => {
    const matchesStatus = item.dataset.homeworkStatus === homeworkFilter;
    const matchesQuery = !query || item.textContent.toLowerCase().includes(query);
    item.classList.toggle('is-hidden', !(matchesStatus && matchesQuery));
  });
}

document.querySelectorAll('.homework-item').forEach(item => item.addEventListener('click', () => showHomeworkItem(item)));
document.querySelectorAll('[data-homework-filter]').forEach(button => button.addEventListener('click', () => {
  homeworkFilter = button.dataset.homeworkFilter;
  document.querySelectorAll('[data-homework-filter]').forEach(item => item.classList.toggle('active', item === button));
  applyHomeworkFilters();
}));
homeworkSearch?.addEventListener('input', applyHomeworkFilters);
document.getElementById('assignHomework')?.addEventListener('click', () => showToast('Следующим шагом соберём форму нового задания'));
document.getElementById('openHomeworkStudent')?.addEventListener('click', () => {
  if (!activeHomeworkItem) return;
  openPersonWorkspace({ name: activeHomeworkItem.dataset.student, course: activeHomeworkItem.dataset.course, avatar: activeHomeworkItem.dataset.avatar }, 'course');
});
document.getElementById('saveHomeworkReview')?.addEventListener('click', () => {
  const feedback = document.getElementById('homeworkFeedback');
  if (!feedback.value.trim()) {
    feedback.setCustomValidity('Добавьте короткую обратную связь для ученика');
    feedback.reportValidity();
    feedback.focus();
    return;
  }
  feedback.setCustomValidity('');
  if (activeHomeworkItem) {
    activeHomeworkItem.dataset.homeworkStatus = 'completed';
    const state = activeHomeworkItem.querySelector('.item-state');
    if (state) { state.textContent = 'Проверено'; state.className = 'item-state assigned'; }
  }
  const waiting = document.querySelectorAll('.homework-item[data-homework-status="review"]').length;
  document.getElementById('homeworkNavCount').textContent = String(waiting);
  showToast('Проверка сохранена и отправлена ученику');
  applyHomeworkFilters();
});
document.getElementById('homeworkFeedback')?.addEventListener('input', event => event.target.setCustomValidity(''));

function renderChatPlaceholder(person) {
  const chatPane = document.querySelector('.chat-pane');
  const thread = document.getElementById('chatThread');
  const composer = document.getElementById('messageComposer');
  if (!chatPane || !thread) return;
  document.getElementById('chatAvatar').textContent = person.avatar;
  document.getElementById('chatName').textContent = person.name;
  document.getElementById('chatContext').textContent = person.context;
  thread.innerHTML = emptyStateMarkup('История сообщений пуста', 'Диалог создан из подключения ученика и преподавателя. Следующим шагом подключим сохранение сообщений в Supabase.', '', '');
  composer?.querySelector('textarea')?.setAttribute('placeholder', 'Сообщения включим после обновления таблицы direct_messages');
}

function renderConnectionConversations(rows = [], viewer = 'teacher') {
  const list = document.getElementById('conversationList');
  if (!list) return;
  const activeRows = rows.filter(row => row.status === 'active');
  list.replaceChildren();
  if (!activeRows.length) {
    list.innerHTML = emptyStateMarkup('Диалогов пока нет', viewer === 'student' ? 'После подтверждения преподавателя здесь появится личный чат.' : 'После принятия ученика здесь появится личный чат.', '', '');
    const chatPane = document.querySelector('.chat-pane');
    if (chatPane) chatPane.innerHTML = emptyStateMarkup('Выберите будущий диалог', 'Переписка будет связана с конкретным учеником или группой.');
    document.getElementById('messagesNavCount')?.replaceChildren(document.createTextNode('0'));
    return;
  }
  activeRows.forEach((row, index) => {
    const name = viewer === 'student' ? teacherNameFromConnection(row) : connectionStudentName(row);
    const email = viewer === 'student' ? row.teacher_email : row.student_email;
    const avatar = initialsFromName(name);
    const button = document.createElement('button');
    button.className = `conversation${index === 0 ? ' active' : ''}`;
    button.dataset.unread = '0';
    button.dataset.connectionConversation = row.connection_id;
    button.innerHTML = `<span class="avatar peach">${avatar}</span><span><strong></strong><small></small></span><time>новый</time>`;
    button.querySelector('strong').textContent = name;
    button.querySelector('small').textContent = email ? `Диалог готов · ${email}` : 'Диалог готов';
    button.addEventListener('click', () => {
      document.querySelectorAll('.conversation').forEach(item => item.classList.toggle('active', item === button));
      renderChatPlaceholder({
        name,
        avatar,
        context: viewer === 'student' ? 'Личный диалог с преподавателем' : 'Личный диалог с учеником'
      });
    });
    list.append(button);
    if (index === 0) {
      renderChatPlaceholder({
        name,
        avatar,
        context: viewer === 'student' ? 'Личный диалог с преподавателем' : 'Личный диалог с учеником'
      });
    }
  });
  document.getElementById('messagesNavCount')?.replaceChildren(document.createTextNode('0'));
}

const conversationData = {
  sofia: { name: 'София Ли', avatar: 'СЛ', avatarClass: 'blue', context: 'Portfolio · личный диалог', course: 'Portfolio', messages: [
    { text: 'Добрый день! Я обновила вводную часть кейса и добавила результаты исследования.', time: '12:38' },
    { text: 'Отлично. Вижу, что история стала яснее. Сейчас посмотрю новую версию.', time: '12:39', mine: true },
    { text: 'Отправила новую версию — посмотрите, пожалуйста, когда будет время.', time: '12:40', attachment: 'case_03_update.pdf' }
  ]},
  blender: { name: 'Blender Junior', avatar: 'BJ', avatarClass: 'peach', context: 'Группа · 4 ученика', course: '3D-графика', messages: [
    { text: 'А запись сегодняшнего урока уже доступна?', time: '11:18' },
    { text: 'Да, добавлю её в материалы группы в течение часа.', time: '11:21', mine: true }
  ]},
  ilya: { name: 'Илья Ветров', avatar: 'ИВ', avatarClass: 'lilac', context: 'UI Design · личный диалог', course: 'UI Design', messages: [
    { text: 'Спасибо за комментарии! Поправлю сетку и пришлю второй вариант.', time: 'вчера' },
    { text: 'Хорошо. Обрати внимание ещё и на расстояние между заголовком и кнопкой.', time: 'вчера', mine: true }
  ]},
  artem: { name: 'Артём Белов', avatar: 'АБ', avatarClass: '', context: 'Python · личный диалог', course: 'Python', messages: [
    { text: 'Следующий урок остаётся в субботу?', time: 'пн' },
    { text: 'Да, в 12:00. Перед уроком пришлю короткое задание.', time: 'пн', mine: true }
  ]}
};
let activeConversation = 'sofia';
let messageFilter = 'all';

function renderChat(conversationId, markRead = true) {
  if (workspaceStartsEmpty) return;
  const data = conversationData[conversationId];
  if (!data) return;
  activeConversation = conversationId;
  document.querySelectorAll('.conversation').forEach(item => {
    const active = item.dataset.conversation === conversationId;
    item.classList.toggle('active', active);
    if (active && markRead) {
      item.dataset.unread = '0';
      item.querySelector(':scope > b')?.remove();
    }
  });
  const avatar = document.getElementById('chatAvatar');
  avatar.textContent = data.avatar;
  avatar.className = `avatar ${data.avatarClass}`.trim();
  document.getElementById('chatName').textContent = data.name;
  document.getElementById('chatContext').textContent = data.context;
  const thread = document.getElementById('chatThread');
  thread.replaceChildren();
  const date = document.createElement('span');
  date.className = 'chat-date';
  date.textContent = 'Сегодня';
  thread.append(date);
  data.messages.forEach(message => {
    const bubble = document.createElement('article');
    bubble.className = `message-bubble${message.mine ? ' mine' : ''}`;
    const text = document.createElement('p');
    text.textContent = message.text;
    bubble.append(text);
    if (message.attachment) {
      const attachment = document.createElement('div');
      attachment.className = 'message-attachment';
      const icon = document.createElement('span'); icon.textContent = 'PDF';
      const name = document.createElement('strong'); name.textContent = message.attachment;
      attachment.append(icon, name);
      bubble.append(attachment);
    }
    const time = document.createElement('time');
    time.textContent = message.time;
    bubble.append(time);
    thread.append(bubble);
  });
  thread.scrollTop = thread.scrollHeight;
  const unread = [...document.querySelectorAll('.conversation')].reduce((sum, item) => sum + Number(item.dataset.unread || 0), 0);
  document.getElementById('messagesNavCount').textContent = String(unread);
}

function applyConversationFilters() {
  const query = document.getElementById('conversationSearch')?.value.trim().toLowerCase() || '';
  document.querySelectorAll('.conversation').forEach(item => {
    const matchesQuery = !query || item.textContent.toLowerCase().includes(query);
    const matchesFilter = messageFilter === 'all' || Number(item.dataset.unread || 0) > 0;
    item.classList.toggle('is-hidden', !(matchesQuery && matchesFilter));
  });
}

document.querySelectorAll('.conversation').forEach(item => item.addEventListener('click', () => renderChat(item.dataset.conversation)));
document.querySelectorAll('[data-view="messages"]').forEach(button => button.addEventListener('click', () => renderChat(activeConversation, true)));
document.querySelectorAll('[data-message-filter]').forEach(button => button.addEventListener('click', () => {
  messageFilter = button.dataset.messageFilter;
  document.querySelectorAll('[data-message-filter]').forEach(item => item.classList.toggle('active', item === button));
  applyConversationFilters();
}));
document.getElementById('conversationSearch')?.addEventListener('input', applyConversationFilters);
document.getElementById('messageComposer')?.addEventListener('submit', event => {
  event.preventDefault();
  if (workspaceStartsEmpty) {
    showToast('Сначала добавьте ученика, чтобы начать диалог');
    return;
  }
  const input = document.getElementById('messageInput');
  const text = input.value.trim();
  if (!text) return;
  conversationData[activeConversation].messages.push({ text, time: new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date()), mine: true });
  const preview = document.querySelector(`.conversation[data-conversation="${activeConversation}"] small`);
  if (preview) preview.textContent = text;
  input.value = '';
  renderChat(activeConversation);
});
document.getElementById('openChatPerson')?.addEventListener('click', () => {
  const data = conversationData[activeConversation];
  openPersonWorkspace({ name: data.name, course: data.course, avatar: data.avatar }, 'course');
});
document.getElementById('newMessage')?.addEventListener('click', () => document.getElementById('conversationSearch')?.focus());
renderChat(activeConversation, false);

const mobileMore = document.getElementById('mobileMore');
const mobileMoreMenu = document.getElementById('mobileMoreMenu');
mobileMore?.addEventListener('click', () => {
  const open = mobileMoreMenu.classList.toggle('open');
  mobileMore.setAttribute('aria-expanded', String(open));
  mobileMoreMenu.setAttribute('aria-hidden', String(!open));
});
navButtons.forEach(button => button.addEventListener('click', () => {
  mobileMoreMenu?.classList.remove('open');
  mobileMore?.setAttribute('aria-expanded', 'false');
  mobileMoreMenu?.setAttribute('aria-hidden', 'true');
}));

document.querySelectorAll('.tasks input').forEach(input => {
  input.addEventListener('change', () => input.closest('label').classList.toggle('done', input.checked));
});

const todayLessonOffsets = {
  'light-materials': 138,
  'ilya-figma': 288,
  'sofia-portfolio': 408
};
const todayLessonStarts = Object.fromEntries(Object.entries(todayLessonOffsets).map(([id, minutes]) => [id, Date.now() + minutes * 60000]));

function remainingMinutes(lessonId) {
  return Math.ceil((todayLessonStarts[lessonId] - Date.now()) / 60000);
}

function formatLessonCountdown(minutes) {
  if (minutes <= 0 && minutes > -120) return 'урок уже идёт';
  if (minutes <= -120) return 'урок завершён';
  if (minutes < 60) return `через ${minutes} мин`;
  if (minutes < 1440) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `через ${hours} ч ${rest} мин` : `через ${hours} ч`;
  }
  const days = Math.floor(minutes / 1440);
  return `через ${days} ${days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'}`;
}

function updateTodayLessonActions() {
  document.querySelectorAll('[data-today-lesson]').forEach(button => {
    if (!(button.dataset.todayLesson in todayLessonStarts)) return;
    const minutes = remainingMinutes(button.dataset.todayLesson);
    const isLiveWindow = minutes <= 30 && minutes > -120;
    const isPast = minutes <= -120;
    const label = isPast ? 'Посмотреть итоги' : isLiveWindow ? 'Начать урок' : 'Подготовиться';
    const arrow = button.querySelector('span');
    if (arrow) button.firstChild.textContent = `${label} `;
    else button.textContent = `${label} ↗`;
    button.dataset.actionState = isPast ? 'past' : isLiveWindow ? 'start' : 'prepare';
    button.setAttribute('aria-label', `${label}: ${formatLessonCountdown(minutes)}`);
  });

  if (!document.querySelector('[data-today-lesson]')) {
    const summary = document.getElementById('todayLessonSummary');
    if (summary) summary.textContent = 'На сегодня занятий пока нет';
    return;
  }

  const nearestMinutes = remainingMinutes('light-materials');
  const countdown = formatLessonCountdown(nearestMinutes);
  const countdownLabel = document.getElementById('nextLessonCountdown');
  if (countdownLabel) countdownLabel.textContent = countdown;
  const summary = document.getElementById('todayLessonSummary');
  if (summary) summary.textContent = `Первый урок в 14:30 · ${countdown}`;
}

document.querySelectorAll('[data-today-lesson]').forEach(button => button.addEventListener('click', () => {
  const lessonId = button.dataset.todayLesson;
  const minutes = remainingMinutes(lessonId);
  if (minutes <= 30 && minutes > -120) {
    switchView('lesson');
    showToast('Пространство урока открыто');
    return;
  }
  switchView('schedule');
  requestAnimationFrame(() => {
    const calendarEvent = document.querySelector(`.calendar-event[data-lesson="${lessonId}"]`);
    if (calendarEvent) openLessonDrawer(calendarEvent);
  });
}));

function openTodayLesson(lessonId) {
  const savedRow = savedLessonRowsCache.find(row => `db-${row.id}` === lessonId);
  if (savedRow && lessonActionState(savedRow).state === 'start') {
    switchView('lesson');
    showToast('Пространство урока открыто');
    return;
  }
  const minutes = remainingMinutes(lessonId);
  const calendarEvent = document.querySelector(`.calendar-event[data-lesson="${lessonId}"]`);
  if (Number.isFinite(minutes) && minutes <= 30 && minutes > -120) {
    switchView('lesson');
    showToast('Пространство урока открыто');
    return;
  }
  switchView('schedule');
  requestAnimationFrame(() => {
    if (calendarEvent) openLessonDrawer(calendarEvent);
  });
}

updateTodayLessonActions();
window.setInterval(() => {
  updateTodayLessonActions();
  refreshSavedLessonActions();
}, 30000);

const modal = document.getElementById('modal');
const openModal = () => {
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  if (window.gsap && !reducedMotion) gsap.fromTo('.modal', { y: 25, scale: .97, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: .45, ease: 'power3.out' });
};
const closeModal = () => {
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
};
document.getElementById('newLesson').addEventListener('click', openModal);
document.querySelectorAll('.quick-plan').forEach(button => button.addEventListener('click', openModal));
document.querySelectorAll('.schedule-add').forEach(button => button.addEventListener('click', openModal));
document.querySelector('.modal-close').addEventListener('click', closeModal);
modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeModal(); });
document.querySelector('.modal-submit').addEventListener('click', createNewLesson);

const lessonData = {
  'olga-python': { student: 'Оля Крылова', avatar: 'ОК', course: 'Python · индивидуально', date: 'Понедельник, 22 июня', time: '10:00–11:30', number: '№ 8', title: 'Python: функции', description: 'Разобрать аргументы функций, области видимости и закрепить тему на небольшой практике.', readiness: 75, status: 'Запланировано' },
  'blender-group': { student: 'Blender Junior', avatar: 'BJ', course: 'Группа · 4 ученика', date: 'Вторник, 23 июня', time: '12:00–14:00', number: '№ 5', title: 'Моделирование сцены', description: 'Собрать окружение из простых форм и подготовить сцену к следующему этапу — работе со светом.', readiness: 60, status: 'Нужно подготовить' },
  'ilya-figma': { student: 'Илья Ветров', avatar: 'ИВ', course: 'Figma · индивидуально', date: 'Среда, 24 июня', time: '14:30–16:00', number: '№ 7', title: 'Первый лендинг', description: 'Разобрать сетку, первый экран и собрать цельную композицию лендинга в Figma.', readiness: 90, status: 'Готово к уроку' },
  'sofia-portfolio': { student: 'София Ли', avatar: 'СЛ', course: 'Portfolio · менторинг', date: 'Среда, 24 июня', time: '17:00–18:30', number: '№ 18', title: 'Portfolio review', description: 'Разбор третьего кейса, логики истории и визуальной подачи результатов проекта.', readiness: 45, status: 'Нужны материалы' },
  'english-group': { student: 'English B1', avatar: 'B1', course: 'Группа · 6 учеников', date: 'Четверг, 25 июня', time: '11:00–13:00', number: '№ 12', title: 'Speaking club', description: 'Практика свободного диалога: путешествия, планы и неожиданные ситуации.', readiness: 80, status: 'Запланировано' },
  'light-materials': { student: 'Blender Junior', avatar: 'BJ', course: 'Группа · 4 ученика', date: 'Пятница, 26 июня', time: '14:30–16:30', number: '№ 6', title: 'Свет и материалы', description: 'Настроить базовую схему света и сравнить поведение трёх типов материалов.', readiness: 70, status: 'Запланировано' },
  'artem-python': { student: 'Артём Белов', avatar: 'АБ', course: 'Python · индивидуально', date: 'Суббота, 27 июня', time: '12:00–13:30', number: '№ 10', title: 'Игровая логика', description: 'Собрать систему очков, условий победы и перезапуска небольшой игры.', readiness: 55, status: 'Нужно подготовить' }
};

const lessonColorClasses = ['rose-event', 'lavender-event', 'blue-event', 'peach-event', 'lime-event', 'dark-calendar-event'];
let selectedNewLessonColor = 'lavender-event';
let activeLessonButton = null;

function moscowLessonDateTime(dateValue, timeValue) {
  return new Date(`${dateValue}T${timeValue}:00+03:00`);
}

function initialsFromName(value) {
  return String(value || 'Урок').trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() || 'У';
}

function normalizeLessonFormat(formatValue) {
  const text = String(formatValue || '').toLowerCase();
  if (text.includes('груп')) return 'mixed';
  if (text.includes('мент')) return 'online';
  return 'online';
}

function lessonGridPlacement(startsAt, duration) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Moscow',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(startsAt).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  const weekdayMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  const gridDay = weekdayMap[parts.weekday] || 1;
  const hours = Number(parts.hour);
  const minutes = Number(parts.minute);
  const gridRow = Math.max(1, (hours - 9) * 2 + Math.floor(minutes / 30) + 1);
  const gridSpan = Math.max(2, Math.min(24 - gridRow + 1, Math.round(duration / 30)));
  return { gridDay, gridRow, gridSpan };
}

function formatLessonTimeRange(startsAt, duration) {
  const end = new Date(startsAt.getTime() + duration * 60000);
  const formatter = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    hour: '2-digit',
    minute: '2-digit'
  });
  return `${formatter.format(startsAt)}–${formatter.format(end)}`;
}

function formatLessonDateLabel(startsAt) {
  const label = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  }).format(startsAt);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function lessonStartDateKey(row) {
  return moscowDateKey(row.starts_at);
}

function lessonStartMinutes(row) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date(row.starts_at)).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return Number(parts.hour) * 60 + Number(parts.minute);
}

function lessonCountdownText(minutes) {
  if (minutes > 0 && minutes < 60) return `через ${minutes} мин`;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `через ${hours} ч ${rest} мин` : `через ${hours} ч`;
  }
  if (minutes > -120) return 'урок идёт';
  return 'завершён';
}

let savedLessonRowsCache = [];

function lessonActionState(row) {
  const start = new Date(row.starts_at).getTime();
  const end = start + Number(row.duration_minutes || 60) * 60000;
  const now = Date.now();
  if (now > end) return { label: 'Посмотреть итоги', state: 'past' };
  if (now >= start - 10 * 60000 && now <= end) return { label: 'Зайти на урок', state: 'start' };
  return { label: 'Подготовиться', state: 'prepare' };
}

function refreshSavedLessonActions() {
  if (!savedLessonRowsCache.length) return;
  savedLessonRowsCache.forEach(row => {
    const lessonId = `db-${row.id}`;
    const action = lessonActionState(row);
    document.querySelectorAll(`[data-today-lesson="${lessonId}"]`).forEach(button => {
      button.dataset.actionState = action.state;
      if (button.querySelector('span')) {
        button.firstChild.textContent = `${action.label} `;
      } else {
        button.textContent = `${action.label} ↗`;
      }
    });
  });
}

function updateTodayFromLessons(rows = []) {
  savedLessonRowsCache = rows;
  const today = moscowDateKey();
  const todayRows = rows
    .filter(row => lessonStartDateKey(row) === today)
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  const now = Date.now();
  const upcoming = todayRows
    .filter(row => new Date(row.starts_at).getTime() + Number(row.duration_minutes || 60) * 60000 > now)
    .sort((a, b) => Math.abs(new Date(a.starts_at) - now) - Math.abs(new Date(b.starts_at) - now));
  const nearest = upcoming[0] || null;

  const lessonCount = document.querySelector('#today .stat-strip article:first-child strong');
  if (lessonCount) lessonCount.textContent = String(todayRows.length);
  const lessonNote = document.querySelector('#today .stat-strip article:first-child em');
  if (lessonNote) lessonNote.textContent = todayRows.length ? 'Сегодня' : 'Пока пусто';

  const agenda = document.querySelector('#today .agenda-timeline');
  if (agenda) {
    agenda.replaceChildren();
    if (!todayRows.length) {
      agenda.insertAdjacentHTML('beforeend', emptyStateMarkup('На сегодня занятий нет', 'Запланируйте первый урок — он появится здесь и в недельном календаре.', 'lesson', '+ Запланировать занятие'));
    } else {
      todayRows.forEach((row, index) => {
        const prepared = lessonRowToUi(row).data;
        const lessonId = `db-${row.id}`;
        const item = document.createElement('div');
        item.className = `agenda-event${index === 0 ? ' primary-event' : ' compact'}`;
        item.dataset.startInMinutes = String(Math.max(0, Math.round((new Date(row.starts_at) - now) / 60000)));
        const time = document.createElement('time');
        const [start, end] = prepared.time.split('–');
        time.textContent = start;
        const endSmall = document.createElement('small');
        endSmall.textContent = end || '';
        time.append(endSmall);
        const content = document.createElement('div');
        const type = document.createElement('span');
        type.className = 'event-type';
        type.textContent = prepared.course;
        const title = document.createElement('h4');
        title.textContent = prepared.title;
        const participant = document.createElement('p');
        participant.textContent = prepared.student;
        content.append(type, title, participant);
        const button = document.createElement('button');
        button.dataset.todayLesson = lessonId;
        const action = lessonActionState(row);
        button.dataset.actionState = action.state;
        button.textContent = `${action.label} ↗`;
        button.addEventListener('click', () => openTodayLesson(lessonId));
        item.append(time, content, button);
        agenda.append(item);
      });
    }
  }

  const summary = document.getElementById('todayLessonSummary');
  const nextLesson = document.querySelector('#today .next-compact');
  if (!nearest) {
    if (summary) summary.textContent = 'На сегодня занятий пока нет';
    if (nextLesson) nextLesson.innerHTML = `<span class="eyebrow">Ближайший урок</span>${emptyStateMarkup('Уроков пока нет', 'Добавьте занятие, чтобы видеть подготовку и время начала.', 'lesson', '+ Новое занятие')}`;
    return;
  }

  const prepared = lessonRowToUi(nearest).data;
  const minutes = Math.round((new Date(nearest.starts_at) - now) / 60000);
  const countdown = lessonCountdownText(minutes);
  if (summary) summary.textContent = `Первый урок в ${prepared.time.split('–')[0]} · ${countdown}`;
  if (nextLesson) {
    const action = lessonActionState(nearest);
    nextLesson.innerHTML = `<div class="card-head"><span class="eyebrow">Ближайший урок</span><span class="live-in" id="nextLessonCountdown">${countdown}</span></div><div class="session-time">${prepared.time.split('–')[0]} <span>— ${prepared.time.split('–')[1] || ''}</span></div><h3>${prepared.title}</h3><p>${prepared.student}</p><button data-today-lesson="db-${nearest.id}" data-action-state="${action.state}" id="nextLessonAction">${action.label} <span>↗</span></button>`;
    nextLesson.querySelector('[data-today-lesson]')?.addEventListener('click', () => openTodayLesson(`db-${nearest.id}`));
  }
}

function renderLessonEvent(lessonId, data, placement, colorClass = 'lavender-event') {
  const eventLayer = document.querySelector('.event-layer');
  if (!eventLayer) return null;
  const event = document.createElement('button');
  event.className = `calendar-event ${colorClass}`;
  event.dataset.lesson = lessonId;
  event.dataset.persistedLesson = 'true';
  event.style.gridColumn = String(placement.gridDay);
  event.style.gridRow = `${placement.gridRow} / span ${placement.gridSpan}`;
  const time = document.createElement('small');
  time.textContent = data.time;
  const heading = document.createElement('strong');
  heading.textContent = data.title;
  const meta = document.createElement('span');
  meta.textContent = `${data.student} · ${data.course.split(' · ')[0]}`;
  const badge = document.createElement('i');
  badge.textContent = data.course.includes('Груп') ? 'GR' : data.course.includes('Мент') ? 'ME' : '1:1';
  event.append(time, heading, meta, badge);
  event.addEventListener('click', () => openLessonDrawer(event));
  eventLayer.querySelector('.workspace-empty')?.remove();
  eventLayer.append(event);
  return event;
}

function lessonRowToUi(row) {
  const startsAt = new Date(row.starts_at);
  const duration = Number(row.duration_minutes || 60);
  let colorClass = 'lavender-event';
  let uiFormat = row.student_summary || 'Индивидуальное';
  try {
    const notes = JSON.parse(row.teacher_notes || '{}');
    if (lessonColorClasses.includes(notes.colorClass)) colorClass = notes.colorClass;
    if (notes.uiFormat) uiFormat = notes.uiFormat;
  } catch (_error) {}
  const participant = row.location || 'Ученик';
  return {
    colorClass,
    placement: lessonGridPlacement(startsAt, duration),
    data: {
      student: participant,
      avatar: initialsFromName(participant),
      course: `${uiFormat} · сохранено`,
      date: formatLessonDateLabel(startsAt),
      time: formatLessonTimeRange(startsAt, duration),
      number: 'Сохранено',
      title: row.title,
      description: 'Урок сохранён в Supabase. Домашку и материалы подключим следующим шагом.',
      readiness: 20,
      status: 'Сохранено в базе',
      color: colorClass
    }
  };
}

async function loadSavedLessons() {
  const client = window.ecoleSupabase;
  const userId = window.ecoleCurrentSession?.user?.id;
  if (!client || !userId || window.ecoleUserRole === 'student') return;
  const { data, error } = await client
    .from('lessons')
    .select('id,title,starts_at,duration_minutes,format,location,teacher_notes,student_summary,group_id')
    .eq('teacher_id', userId)
    .order('starts_at', { ascending: true });
  if (error) {
    showToast(`Уроки не загрузились из Supabase: ${error.message}`);
    return;
  }
  document.querySelectorAll('[data-persisted-lesson="true"]').forEach(item => item.remove());
  (data || []).forEach(row => {
    const lessonId = `db-${row.id}`;
    const prepared = lessonRowToUi(row);
    lessonData[lessonId] = prepared.data;
    renderLessonEvent(lessonId, prepared.data, prepared.placement, prepared.colorClass);
  });
  updateTodayFromLessons(data || []);
}

function eventColorClass(eventButton) {
  return lessonColorClasses.find(color => eventButton?.classList.contains(color)) || 'lavender-event';
}

function updateDrawerColorChoice(colorClass) {
  const buttons = [...document.querySelectorAll('[data-lesson-color]')];
  buttons.forEach(button => button.classList.toggle('active', button.dataset.lessonColor === colorClass));
  const selected = buttons.find(button => button.dataset.lessonColor === colorClass);
  document.getElementById('lessonColorName').textContent = selected?.dataset.colorName || 'Лавандовый';
}

document.querySelectorAll('[data-new-lesson-color]').forEach(button => button.addEventListener('click', () => {
  selectedNewLessonColor = button.dataset.newLessonColor;
  document.querySelectorAll('[data-new-lesson-color]').forEach(item => {
    const active = item === button;
    item.classList.toggle('active', active);
    item.setAttribute('aria-checked', String(active));
  });
  document.getElementById('newLessonColorName').textContent = button.dataset.colorName;
}));

async function createNewLesson() {
  const titleInput = document.getElementById('newLessonTitle');
  const participantInput = document.getElementById('newLessonParticipant');
  const dateInput = document.getElementById('newLessonDate');
  const timeInput = document.getElementById('newLessonTime');
  const formatInput = document.getElementById('newLessonFormat');
  const durationInput = document.getElementById('newLessonDuration');
  const requiredFields = [titleInput, participantInput, dateInput, timeInput];
  const invalidField = requiredFields.find(field => !field?.checkValidity());
  if (invalidField) { invalidField.reportValidity(); return; }

  const lessonDate = new Date(`${dateInput.value}T12:00:00`);
  const jsDay = lessonDate.getDay();
  const gridDay = jsDay === 0 ? 7 : jsDay;
  const [hours, minutes] = timeInput.value.split(':').map(Number);
  const duration = Number(durationInput.value);
  const gridRow = Math.max(1, (hours - 9) * 2 + Math.floor(minutes / 30) + 1);
  const gridSpan = Math.max(2, Math.min(24 - gridRow + 1, Math.round(duration / 30)));
  const endMinutes = hours * 60 + minutes + duration;
  const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;
  const lessonId = `created-${Date.now()}`;
  const colorClass = selectedNewLessonColor;
  const participant = participantInput.value.trim();
  const title = titleInput.value.trim();
  const format = formatInput.value;
  const initials = participant.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
  const dateLabel = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(lessonDate);

  const client = window.ecoleSupabase;
  const userId = window.ecoleCurrentSession?.user?.id;
  if (!client || !userId) {
    showToast('Сначала войдите в аккаунт, чтобы сохранить урок');
    return;
  }

  const submitButton = document.querySelector('.modal-submit');
  const originalButtonHtml = submitButton?.innerHTML;
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.innerHTML = 'Сохраняем… <span>↗</span>';
  }

  const { error } = await client
    .from('lessons')
    .insert({
      teacher_id: userId,
      group_id: null,
      title,
      starts_at: moscowLessonDateTime(dateInput.value, timeInput.value).toISOString(),
      duration_minutes: duration,
      format: normalizeLessonFormat(format),
      location: participant,
      teacher_notes: JSON.stringify({
        colorClass,
        uiFormat: format,
        temporaryParticipantLabel: participant
      }),
      student_summary: format
    });

  if (submitButton) {
    submitButton.disabled = false;
    submitButton.innerHTML = originalButtonHtml;
  }

  if (error) {
    showToast(`Урок не сохранился в Supabase: ${error.message}`);
    return;
  }

  loadSavedLessons();

  lessonData[lessonId] = {
    student: participant,
    avatar: initials,
    course: `${format} · новое занятие`,
    date: dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1),
    time: `${timeInput.value}–${endTime}`,
    number: 'Новое',
    title,
    description: 'Добавьте план, материалы и домашнее задание перед проведением урока.',
    readiness: 20,
    status: 'Новое занятие',
    color: colorClass
  };

  const event = document.createElement('button');
  event.className = `calendar-event ${colorClass}`;
  event.dataset.lesson = lessonId;
  event.dataset.persistedLesson = 'true';
  event.style.gridColumn = String(gridDay);
  event.style.gridRow = `${gridRow} / span ${gridSpan}`;
  const time = document.createElement('small');
  time.textContent = `${timeInput.value}–${endTime}`;
  const heading = document.createElement('strong');
  heading.textContent = title;
  const meta = document.createElement('span');
  meta.textContent = `${participant} · ${format.toLowerCase()}`;
  const badge = document.createElement('i');
  badge.textContent = format === 'Групповое' ? 'GR' : format === 'Менторинг' ? 'ME' : '1:1';
  event.append(time, heading, meta, badge);
  event.addEventListener('click', () => openLessonDrawer(event));
  const eventLayer = document.querySelector('.event-layer');
  eventLayer?.querySelector('.workspace-empty')?.remove();
  eventLayer?.append(event);

  closeModal();
  switchView('schedule');
  requestAnimationFrame(() => {
    if (window.gsap && !reducedMotion) gsap.fromTo(event, { scale: .82, opacity: 0 }, { scale: 1, opacity: 1, duration: .45, ease: 'back.out(1.5)' });
    window.setTimeout(() => openLessonDrawer(event), reducedMotion ? 0 : 260);
  });
  showToast('Новое занятие добавлено в расписание');
}

const scheduleShell = document.getElementById('scheduleShell');
const lessonDrawer = document.getElementById('lessonDrawer');

function setDrawerContent(data) {
  document.getElementById('drawerStatus').textContent = data.status;
  document.getElementById('drawerDate').textContent = data.date;
  document.getElementById('drawerAvatar').textContent = data.avatar;
  document.getElementById('drawerStudent').textContent = data.student;
  document.getElementById('drawerCourse').textContent = data.course;
  document.getElementById('drawerTime').textContent = data.time;
  document.getElementById('drawerLessonNumber').textContent = data.number;
  document.getElementById('drawerTitle').textContent = data.title;
  document.getElementById('drawerDescription').textContent = data.description;
  document.getElementById('readinessValue').textContent = `${data.readiness}%`;
  document.getElementById('readinessLine').style.width = `${data.readiness}%`;
}

function openLessonDrawer(eventButton) {
  const data = lessonData[eventButton.dataset.lesson];
  if (!data || !scheduleShell || !lessonDrawer) return;
  activeLessonButton = eventButton;
  document.querySelectorAll('.calendar-event').forEach(event => event.classList.toggle('selected', event === eventButton));
  setDrawerContent(data);
  updateDrawerColorChoice(data.color || eventColorClass(eventButton));
  if (!window.matchMedia('(max-width: 900px)').matches) {
    const shellWidth = scheduleShell.clientWidth;
    const drawerWidth = window.innerWidth <= 1180 ? 340 : 370;
    const visibleCalendarWidth = Math.max(280, shellWidth - drawerWidth - 14);
    const calendarWidth = Math.max(820, document.querySelector('.calendar-days')?.scrollWidth || 820);
    const day = Math.max(1, Math.min(7, Number.parseInt(eventButton.style.gridColumn, 10) || 1));
    const selectedDayCenter = 58 + ((calendarWidth - 58) / 7) * (day - .5);
    const desiredPan = visibleCalendarWidth / 2 - selectedDayCenter;
    const minimumPan = visibleCalendarWidth - calendarWidth;
    const pan = Math.max(minimumPan, Math.min(0, desiredPan));
    scheduleShell.style.setProperty('--calendar-pan', `${Math.round(pan)}px`);
  }
  scheduleShell.classList.add('drawer-open');
  const mobile = window.matchMedia('(max-width: 900px)').matches;
  if (window.gsap && !reducedMotion) {
    gsap.killTweensOf(lessonDrawer);
    gsap.fromTo(lessonDrawer, mobile ? { y: '105%', opacity: 0 } : { x: '105%', opacity: 0 }, { x: 0, y: 0, opacity: 1, duration: .52, ease: 'power3.out' });
  } else {
    lessonDrawer.style.opacity = '1';
    lessonDrawer.style.transform = 'none';
  }
}

function closeLessonDrawer() {
  if (!scheduleShell || !lessonDrawer) return;
  const mobile = window.matchMedia('(max-width: 900px)').matches;
  const finish = () => {
    scheduleShell.classList.remove('drawer-open');
    scheduleShell.style.setProperty('--calendar-pan', '0px');
    lessonDrawer.style.opacity = '';
    lessonDrawer.style.transform = '';
    document.querySelectorAll('.calendar-event').forEach(event => event.classList.remove('selected'));
    activeLessonButton = null;
  };
  if (window.gsap && !reducedMotion) gsap.to(lessonDrawer, { x: mobile ? 0 : '105%', y: mobile ? '105%' : 0, opacity: 0, duration: .34, ease: 'power2.in', onComplete: finish });
  else finish();
}

document.querySelectorAll('.calendar-event').forEach(event => event.addEventListener('click', () => openLessonDrawer(event)));
document.querySelector('.drawer-close')?.addEventListener('click', closeLessonDrawer);

document.querySelectorAll('[data-lesson-color]').forEach(button => button.addEventListener('click', () => {
  if (!activeLessonButton) return;
  const colorClass = button.dataset.lessonColor;
  lessonColorClasses.forEach(color => activeLessonButton.classList.remove(color));
  activeLessonButton.classList.add(colorClass);
  const data = lessonData[activeLessonButton.dataset.lesson];
  if (data) data.color = colorClass;
  updateDrawerColorChoice(colorClass);
  if (window.gsap && !reducedMotion) gsap.fromTo(activeLessonButton, { scale: .97 }, { scale: 1, duration: .22, ease: 'power2.out' });
  showToast(`Цвет занятия: ${button.dataset.colorName.toLowerCase()}`);
}));

document.querySelectorAll('[data-drawer-tab]').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('[data-drawer-tab]').forEach(item => item.classList.toggle('active', item === tab));
    document.querySelectorAll('[data-drawer-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.drawerPanel === tab.dataset.drawerTab));
    if (window.gsap && !reducedMotion) gsap.fromTo(`[data-drawer-panel="${tab.dataset.drawerTab}"]`, { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: .28 });
  });
});

document.querySelectorAll('.destination-switch button').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.destination-switch button').forEach(item => item.classList.toggle('active', item === button));
}));

const materialInput = document.getElementById('materialInput');
document.getElementById('addMaterial')?.addEventListener('click', () => materialInput?.click());
materialInput?.addEventListener('change', () => {
  [...materialInput.files].forEach(file => {
    const article = document.createElement('article');
    const extension = file.name.includes('.') ? file.name.split('.').pop().slice(0, 4).toUpperCase() : 'FILE';
    article.innerHTML = `<span class="file-icon peach-bg">${extension}</span><div><strong>${file.name}</strong><small>${Math.max(1, Math.round(file.size / 1024))} КБ · новый файл</small></div><button>•••</button>`;
    document.getElementById('materialsList').append(article);
  });
  document.getElementById('materialCount').textContent = document.querySelectorAll('#materialsList article').length;
  showToast('Материал добавлен в урок');
  materialInput.value = '';
});

function showToast(message) {
  document.querySelector('.schedule-toast')?.remove();
  const toast = document.createElement('div');
  toast.className = 'schedule-toast';
  toast.textContent = message;
  document.body.append(toast);
  if (window.gsap && !reducedMotion) gsap.from(toast, { y: 15, opacity: 0, duration: .3 });
  window.setTimeout(() => {
    if (window.gsap && !reducedMotion) gsap.to(toast, { y: 10, opacity: 0, duration: .25, onComplete: () => toast.remove() });
    else toast.remove();
  }, 2200);
}

document.querySelector('.prepare-board')?.addEventListener('click', () => { closeLessonDrawer(); switchView('lesson'); showToast('Открыта доска для подготовки'); });
document.querySelector('.join-call')?.addEventListener('click', () => { closeLessonDrawer(); switchView('lesson'); showToast('Комната урока открыта заранее'); });
document.getElementById('openDrawerCourse')?.addEventListener('click', () => {
  const name = document.getElementById('drawerStudent').textContent;
  const course = document.getElementById('drawerCourse').textContent;
  const avatar = document.getElementById('drawerAvatar').textContent;
  closeLessonDrawer();
  openPersonWorkspace({ name, course, avatar }, 'course');
});
document.querySelector('.today-button')?.addEventListener('click', () => showToast('Показана текущая неделя'));
document.querySelectorAll('.view-switch button').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.view-switch button').forEach(item => item.classList.toggle('active', item === button));
  if (button.textContent.trim() === 'Месяц') showToast('Месячный вид соберём следующим экраном');
}));

const availabilityToggle = document.querySelector('.availability-toggle');
const availabilityLayer = document.getElementById('availabilityLayer');
availabilityToggle?.addEventListener('click', () => {
  const visible = availabilityToggle.classList.toggle('active');
  availabilityToggle.setAttribute('aria-pressed', String(visible));
  availabilityToggle.querySelector('b').textContent = visible ? 'видно' : 'скрыто';
  availabilityLayer?.classList.toggle('hidden', !visible);
  if (window.gsap && !reducedMotion && visible) gsap.fromTo('.free-slot', { opacity: 0 }, { opacity: 1, duration: .28, stagger: .035 });
});

document.querySelectorAll('.free-slot').forEach(slot => slot.addEventListener('click', () => {
  openModal();
  const titleInput = modal.querySelector('input:not([type])');
  if (titleInput) titleInput.value = `Новое занятие · ${slot.dataset.freeSlot}`;
}));

function planLessonForActivePerson() {
  document.getElementById('newLessonParticipant').value = activePerson.name;
  document.getElementById('newLessonTitle').value = '';
  openModal();
  window.setTimeout(() => document.getElementById('newLessonTitle')?.focus(), reducedMotion ? 0 : 120);
}

document.querySelectorAll('.person-plan, .add-course-lesson, .plan-draft').forEach(button => button.addEventListener('click', planLessonForActivePerson));
document.querySelectorAll('.open-specific-lesson, .course-lesson.completed > button').forEach(button => button.addEventListener('click', () => {
  switchView('lesson');
  showToast(`Открыто пространство занятия: ${activePerson.name}`);
}));

const courseMaterialInput = document.getElementById('courseMaterialInput');
let courseMaterialCount = 3;
document.querySelectorAll('.course-material, .person-add-material').forEach(button => button.addEventListener('click', () => courseMaterialInput?.click()));
courseMaterialInput?.addEventListener('change', () => {
  const added = courseMaterialInput.files?.length || 0;
  if (!added) return;
  courseMaterialCount += added;
  const status = document.getElementById('courseMaterialStatus');
  if (status) status.textContent = `План готов на 70% · добавлено ${courseMaterialCount} материалов`;
  showToast(`${added === 1 ? 'Материал добавлен' : `Добавлено материалов: ${added}`} к курсу ${activePerson.name}`);
  courseMaterialInput.value = '';
});

const profileFields = {
  firstName: document.getElementById('profileFirstName'),
  lastName: document.getElementById('profileLastName'),
  subject: document.getElementById('profileSubject'),
  description: document.getElementById('profileDescription')
};
const avatarInput = document.getElementById('avatarInput');
const avatarPreviews = [document.getElementById('profileAvatarPreview'), document.getElementById('cardAvatarPreview')];
let profileAvatarUrl = '';

function profileInitials() {
  return `${profileFields.firstName?.value.trim().charAt(0) || ''}${profileFields.lastName?.value.trim().charAt(0) || ''}`.toUpperCase() || '—';
}

function updateProfilePreview(markDirty = true) {
  const fullName = `${profileFields.firstName?.value.trim() || ''} ${profileFields.lastName?.value.trim() || ''}`.trim() || 'Имя преподавателя';
  document.getElementById('cardProfileName').textContent = fullName;
  document.getElementById('cardProfileSubject').textContent = profileFields.subject?.value.trim() || 'Ваше направление';
  document.getElementById('cardProfileDescription').textContent = profileFields.description?.value.trim() || 'Здесь появится краткое описание вашего подхода к преподаванию.';
  document.getElementById('descriptionCount').textContent = profileFields.description?.value.length || 0;
  avatarPreviews.forEach(preview => { if (preview) preview.querySelector('span').textContent = profileInitials(); });
  if (markDirty) {
    const state = document.getElementById('profileSaveState');
    state.textContent = 'Изменения не сохранены';
    state.classList.remove('saved');
  }
}

async function loadTeacherInviteCode() {
  const card = document.querySelector('[data-teacher-code-card]');
  const codeEl = document.getElementById('teacherInviteCode');
  const state = document.getElementById('teacherInviteCodeState');
  const client = window.ecoleSupabase;
  const userId = window.ecoleCurrentSession?.user?.id;
  if (!card || !codeEl) return;
  if (window.ecoleUserRole === 'student') {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  if (!client || !userId) {
    codeEl.textContent = '—';
    if (state) state.textContent = 'Войдите в аккаунт, чтобы получить код преподавателя.';
    return;
  }
  codeEl.textContent = 'Загрузка…';
  const { data, error } = await client.rpc('ensure_teacher_invite_code');
  if (error) {
    codeEl.textContent = 'Не создан';
    if (state) state.textContent = `Не удалось получить код: ${error.message}`;
    return;
  }
  codeEl.textContent = data;
  if (state) state.textContent = 'Код хранится в Supabase и привязан к вашему профилю.';
}

document.getElementById('copyTeacherInviteCode')?.addEventListener('click', async () => {
  const code = document.getElementById('teacherInviteCode')?.textContent?.trim();
  if (!code || code === 'Загрузка…' || code === 'Не создан') return;
  try {
    await navigator.clipboard.writeText(code);
    showToast('Код преподавателя скопирован');
  } catch (_error) {
    showToast(`Код преподавателя: ${code}`);
  }
});

Object.values(profileFields).forEach(field => field?.addEventListener('input', () => updateProfilePreview(true)));

avatarInput?.addEventListener('change', () => {
  const file = avatarInput.files?.[0];
  if (!file) return;
  if (profileAvatarUrl) URL.revokeObjectURL(profileAvatarUrl);
  profileAvatarUrl = URL.createObjectURL(file);
  avatarPreviews.forEach(preview => {
    if (!preview) return;
    preview.querySelector('img').src = profileAvatarUrl;
    preview.classList.add('has-image');
  });
  updateProfilePreview(true);
  if (window.gsap && !reducedMotion) gsap.fromTo('.profile-avatar-preview img', { scale: 1.08, opacity: 0 }, { scale: 1, opacity: 1, duration: .45 });
});

document.getElementById('removeAvatar')?.addEventListener('click', () => {
  avatarPreviews.forEach(preview => { preview?.classList.remove('has-image'); preview?.querySelector('img')?.removeAttribute('src'); });
  avatarInput.value = '';
  if (profileAvatarUrl) URL.revokeObjectURL(profileAvatarUrl);
  profileAvatarUrl = '';
  updateProfilePreview(true);
});

document.getElementById('saveProfile')?.addEventListener('click', () => {
  if (!document.getElementById('profileForm').reportValidity()) return;
  const fullName = `${profileFields.firstName.value.trim()} ${profileFields.lastName.value.trim()}`;
  document.getElementById('sidebarName').textContent = fullName;
  document.getElementById('sidebarSubject').textContent = profileFields.subject.value.trim();
  const sidebarAvatar = document.getElementById('sidebarAvatar');
  if (profileAvatarUrl) {
    sidebarAvatar.textContent = '';
    sidebarAvatar.style.backgroundImage = `url("${profileAvatarUrl}")`;
    sidebarAvatar.style.backgroundSize = 'cover';
    sidebarAvatar.style.backgroundPosition = 'center';
  } else {
    sidebarAvatar.textContent = profileInitials();
    sidebarAvatar.style.backgroundImage = '';
  }
  if (!window.ecoleSupabase) {
    localStorage.setItem('educatorProfile', JSON.stringify({ firstName: profileFields.firstName.value, lastName: profileFields.lastName.value, subject: profileFields.subject.value, description: profileFields.description.value }));
  }
  const state = document.getElementById('profileSaveState');
  state.textContent = 'Сохранено';
  state.classList.add('saved');
  showToast('Профиль преподавателя сохранён');
});

try {
  const savedProfile = window.ecoleSupabase ? null : JSON.parse(localStorage.getItem('educatorProfile'));
  if (savedProfile) Object.entries(profileFields).forEach(([key, field]) => { if (savedProfile[key] && field) field.value = savedProfile[key]; });
} catch (_) {}
updateProfilePreview(false);

function emptyStateMarkup(title, text, action = '', actionLabel = '') {
  return `<div class="workspace-empty">
    <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M14 8.5h16l6 6V38a3 3 0 0 1-3 3H14a3 3 0 0 1-3-3V11.5a3 3 0 0 1 3-3Z"/><path d="M30 8.5v8h6M18 25h12M18 31h8"/></svg>
    <strong>${title}</strong><p>${text}</p>
    ${action ? `<button class="soft-button" type="button" data-empty-action="${action}">${actionLabel}</button>` : ''}
  </div>`;
}

function initialiseEmptyWorkspace() {
  if (!workspaceStartsEmpty) return;

  document.querySelectorAll('#today .stat-strip article strong').forEach(value => { value.textContent = '0'; });
  document.querySelectorAll('#today .stat-strip article em').forEach(note => { note.textContent = 'Пока пусто'; note.classList.remove('urgent'); });
  ['homeworkNavCount', 'messagesNavCount'].forEach(id => { const count = document.getElementById(id); if (count) count.textContent = '0'; });
  document.querySelector('.nav-item[data-view="students"] .nav-count')?.replaceChildren(document.createTextNode('0'));

  const agenda = document.querySelector('#today .agenda-timeline');
  if (agenda) agenda.innerHTML = emptyStateMarkup('На сегодня занятий нет', 'Запланируйте первый урок — он появится здесь и в недельном календаре.', 'lesson', '＋ Запланировать занятие');

  const nextLesson = document.querySelector('#today .next-compact');
  if (nextLesson) nextLesson.innerHTML = `<span class="eyebrow">Ближайший урок</span>${emptyStateMarkup('Уроков пока нет', 'Добавьте занятие, чтобы видеть подготовку и время начала.', 'lesson', '＋ Новое занятие')}`;

  const taskCard = document.querySelector('#today .tasks');
  if (taskCard) {
    taskCard.querySelectorAll('label,.text-action').forEach(item => item.remove());
    taskCard.insertAdjacentHTML('beforeend', emptyStateMarkup('Задач пока нет', 'Добавляйте небольшие дела на день, чтобы ничего не потерять.', 'task', '＋ Добавить задачу'));
  }

  const activity = document.querySelector('#today .activity');
  if (activity) {
    activity.querySelectorAll('.activity-item').forEach(item => item.remove());
    activity.insertAdjacentHTML('beforeend', emptyStateMarkup('Активности пока нет', 'Здесь появятся новые работы и сообщения учеников.'));
  }

  const weekloadTitle = document.querySelector('#today .weekload h3');
  if (weekloadTitle) weekloadTitle.textContent = '0 уроков · 0 часов';
  document.querySelectorAll('#today .week-bars i').forEach(bar => bar.style.setProperty('--h', '3%'));
  document.querySelectorAll('#today .week-bars small').forEach(count => { count.textContent = '0'; });
  const focus = document.querySelector('#today .focus-mini');
  if (focus) focus.innerHTML = '<div class="card-head"><span class="eyebrow">Фокус недели</span><span>0%</span></div><p>Добавьте учеников, чтобы отслеживать их движение по плану.</p><div class="focus-line"><span style="width:0"></span></div>';

  const eventLayer = document.querySelector('.event-layer');
  if (eventLayer) eventLayer.innerHTML = emptyStateMarkup('Неделя свободна', 'Создайте первое занятие — дату и время можно будет изменить позже.', 'lesson', '＋ Добавить занятие');
  closeLessonDrawer();

  const studentsGrid = document.querySelector('.students-grid');
  if (studentsGrid) studentsGrid.innerHTML = emptyStateMarkup('Добавьте первого ученика', 'Создайте личную карточку или соберите учебную группу.', 'student', '＋ Добавить ученика');
  const studentFilterLabels = { all: 'Все · 0', student: 'Ученики · 0', group: 'Группы · 0' };
  document.querySelectorAll('[data-student-filter]').forEach(button => { button.textContent = studentFilterLabels[button.dataset.studentFilter]; });

  const homeworkList = document.getElementById('homeworkList');
  if (homeworkList) homeworkList.innerHTML = emptyStateMarkup('Нет домашних заданий', 'Выданные работы и ответы учеников появятся в этой очереди.', 'homework', '＋ Создать задание');
  const homeworkReview = document.getElementById('homeworkReview');
  if (homeworkReview) homeworkReview.innerHTML = emptyStateMarkup('Нечего проверять', 'Когда ученик отправит работу, здесь откроются файл и поле обратной связи.');
  document.querySelectorAll('.work-summary article strong').forEach(value => { value.textContent = '0'; });

  const conversationList = document.getElementById('conversationList');
  if (conversationList) conversationList.innerHTML = emptyStateMarkup('Диалогов пока нет', 'После добавления ученика вы сможете написать ему сообщение.', 'student', '＋ Добавить ученика');
  const chatPane = document.querySelector('.chat-pane');
  if (chatPane) chatPane.innerHTML = emptyStateMarkup('Выберите будущий диалог', 'Здесь будет храниться переписка с учениками и группами.');

  document.querySelectorAll('.resource-column .resource').forEach(resource => resource.remove());
  const libraryFeature = document.querySelector('.library-feature');
  if (libraryFeature) libraryFeature.hidden = true;
  const resourceColumn = document.querySelector('.resource-column');
  if (resourceColumn) resourceColumn.insertAdjacentHTML('beforeend', emptyStateMarkup('Библиотека пока пуста', 'Добавляйте файлы, ссылки и шаблоны, чтобы использовать их на занятиях.', 'material', '＋ Добавить материал'));

  const previewStats = document.querySelectorAll('.preview-meta b');
  if (previewStats[0]) previewStats[0].textContent = '0';
  if (previewStats[1]) previewStats[1].textContent = '0';
  if (previewStats[2]) previewStats[2].textContent = '—';
}

function moscowNow() {
  const values = Object.fromEntries(new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date()).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return {
    year: Number(values.year), month: Number(values.month), day: Number(values.day),
    hour: Number(values.hour), minute: Number(values.minute),
    date: new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)))
  };
}

function isoDate(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function capitalise(value) { return value.charAt(0).toUpperCase() + value.slice(1); }

function updateMoscowInterface(session = window.ecoleCurrentSession) {
  const now = moscowNow();
  const dateText = capitalise(new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()));
  const dayName = capitalise(new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', weekday: 'long' }).format(new Date()));
  const shortDate = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long' }).format(new Date());
  const greeting = now.hour < 12 ? 'Доброе утро' : now.hour < 18 ? 'Добрый день' : 'Добрый вечер';
  const firstName = session?.user?.user_metadata?.first_name?.trim();

  const todayKicker = document.querySelector('#today .today-header .kicker');
  if (todayKicker) todayKicker.innerHTML = `<span></span> ${dateText}`;
  const title = document.getElementById('today-title');
  if (title) title.textContent = firstName ? `${greeting}, ${firstName}` : greeting;
  const agendaDay = document.querySelector('#today .agenda-panel .section-heading h3');
  if (agendaDay) agendaDay.textContent = dayName;
  document.querySelectorAll('#today .date-switch span').forEach(label => { label.textContent = shortDate; });

  let clock = document.getElementById('moscowClock');
  if (!clock) {
    clock = document.createElement('span');
    clock.id = 'moscowClock';
    clock.className = 'moscow-clock';
    document.querySelector('.topbar-actions')?.prepend(clock);
  }
  clock.textContent = `${String(now.hour).padStart(2, '0')}:${String(now.minute).padStart(2, '0')} МСК`;

  const dayIndex = (now.date.getUTCDay() + 6) % 7;
  const weekStart = new Date(now.date); weekStart.setUTCDate(now.date.getUTCDate() - dayIndex);
  const weekEnd = new Date(weekStart); weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  const days = document.querySelectorAll('.calendar-days button');
  days.forEach((button, index) => {
    const date = new Date(weekStart); date.setUTCDate(weekStart.getUTCDate() + index);
    button.querySelector('small').textContent = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', timeZone: 'UTC' }).format(date).replace('.', '');
    button.querySelector('b').textContent = String(date.getUTCDate());
    button.classList.toggle('current', isoDate(date) === isoDate(now.date));
  });
  document.querySelectorAll('.day-columns i').forEach((column, index) => {
    column.classList.toggle('is-today', index === dayIndex);
    column.classList.toggle('current-column', index === dayIndex);
  });
  const nowLine = document.querySelector('.now-line');
  if (nowLine) {
    const minutesFromStart = (now.hour * 60 + now.minute) - (9 * 60);
    const top = Math.max(0, Math.min(864, minutesFromStart * 1.2));
    nowLine.style.setProperty('--now-line-top', `${top}px`);
    nowLine.classList.toggle('is-outside-hours', minutesFromStart < 0 || minutesFromStart > 720);
    const label = nowLine.querySelector('span');
    if (label) label.textContent = `${String(now.hour).padStart(2, '0')}:${String(now.minute).padStart(2, '0')}`;
  }
  const weekLabel = document.querySelector('.calendar-nav strong');
  if (weekLabel) {
    const start = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: weekStart.getUTCMonth() === weekEnd.getUTCMonth() ? undefined : 'long', timeZone: 'UTC' }).format(weekStart);
    const end = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(weekEnd);
    weekLabel.textContent = `${start}–${end}`;
  }

  const dateInput = document.getElementById('newLessonDate');
  if (dateInput) { dateInput.value = isoDate(now.date); dateInput.min = isoDate(weekStart); dateInput.max = isoDate(weekEnd); }
  const timeInput = document.getElementById('newLessonTime');
  if (timeInput) timeInput.value = `${String(Math.min(20, now.hour + 1)).padStart(2, '0')}:00`;

  if (firstName) {
    const lastName = session?.user?.user_metadata?.last_name?.trim() || '';
    document.getElementById('sidebarName').textContent = `${firstName} ${lastName}`.trim();
    document.getElementById('sidebarAvatar').textContent = `${firstName[0]}${lastName[0] || ''}`.toUpperCase();
  }
}

document.addEventListener('click', event => {
  const action = event.target.closest('[data-empty-action]')?.dataset.emptyAction;
  if (!action) return;
  if (action === 'lesson') { openModal(); return; }
  const labels = {
    student: 'Форма добавления ученика появится на следующем этапе',
    task: 'Форма новой задачи появится на следующем этапе',
    homework: 'Сначала добавьте ученика, затем можно будет выдать задание',
    material: 'Загрузка материалов появится на следующем этапе'
  };
  showToast(labels[action] || 'Раздел готовится');
});

let trackedSessionUser = null;
document.addEventListener('ecole:session', event => {
  updateMoscowInterface(event.detail.session);
  applyRoleInterface(event.detail.session, event.detail.role);
  const userId = event.detail.session?.user?.id;
  if (userId) {
    loadSavedLessons();
    loadTeacherInviteCode();
    loadTeacherConnections();
    loadStudentConnections();
  }
  if (userId && trackedSessionUser !== userId) {
    trackedSessionUser = userId;
    trackActivity('sign_in', event.detail.role === 'admin' ? 'admin-dashboard' : event.detail.role === 'student' ? 'student-home' : 'today');
  }
  if (!userId) trackedSessionUser = null;
});
document.getElementById('adminRefresh')?.addEventListener('click', loadAdminDashboard);
const studentInviteModal = document.getElementById('studentInviteModal');
const studentInviteInput = document.getElementById('studentInviteCodeInput');
const studentInviteMessage = document.getElementById('studentInviteMessage');
const studentInviteSubmit = document.getElementById('submitStudentInviteCode');

function setStudentInviteMessage(text = '', type = '') {
  if (!studentInviteMessage) return;
  studentInviteMessage.textContent = text;
  studentInviteMessage.className = `auth-message${type ? ` ${type}` : ''}`;
}

function openStudentInviteModal() {
  if (!studentInviteModal) {
    openStudentInviteFallback();
    return;
  }
  studentInviteModal.classList.add('open');
  studentInviteModal.setAttribute('aria-hidden', 'false');
  setStudentInviteMessage();
  window.setTimeout(() => studentInviteInput?.focus(), 80);
}

function closeStudentInviteModal() {
  studentInviteModal?.classList.remove('open');
  studentInviteModal?.setAttribute('aria-hidden', 'true');
}

function translateInviteError(error) {
  const text = String(error?.message || '').toLowerCase();
  if (text.includes('not found')) return 'Код не найден. Проверьте, что скопировали его полностью.';
  if (text.includes('self')) return 'Нельзя подключиться к своему же коду преподавателя.';
  if (text.includes('not authenticated')) return 'Сначала войдите в аккаунт ученика.';
  if (text.includes('Введите код')) return error.message;
  return `Не удалось отправить заявку: ${error?.message || 'попробуйте ещё раз'}`;
}

async function submitTeacherInviteCode(code) {
  const client = window.ecoleSupabase;
  const cleanCode = String(code || '').trim();
  if (!client || !window.ecoleCurrentSession?.user) throw new Error('Not authenticated');
  if (!cleanCode) throw new Error('Введите код преподавателя.');
  const { error } = await client.rpc('request_teacher_connection', { p_code: cleanCode });
  if (error) throw error;
}

async function openStudentInviteFallback() {
  const code = window.prompt('Введите код преподавателя, например ECOLE-A1B2C3D4');
  if (code === null) return;
  try {
    await submitTeacherInviteCode(code);
    showToast('Заявка преподавателю отправлена');
    window.alert('Заявка отправлена. Преподаватель увидит её у себя и сможет принять.');
  } catch (error) {
    const message = translateInviteError(error);
    showToast(message);
    window.alert(message);
  }
}

document.addEventListener('click', event => {
  if (!event.target.closest('[data-student-action="join"]')) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  openStudentInviteModal();
}, true);

document.getElementById('closeStudentInviteModal')?.addEventListener('click', closeStudentInviteModal);
studentInviteModal?.addEventListener('click', event => {
  if (event.target === studentInviteModal) closeStudentInviteModal();
});
studentInviteSubmit?.addEventListener('click', async () => {
  const client = window.ecoleSupabase;
  const code = studentInviteInput?.value.trim();
  if (!client || !window.ecoleCurrentSession?.user) {
    setStudentInviteMessage('Сначала войдите в аккаунт ученика.', 'error');
    return;
  }
  if (!code) {
    setStudentInviteMessage('Введите код преподавателя.', 'error');
    studentInviteInput?.focus();
    return;
  }
  studentInviteSubmit.disabled = true;
  studentInviteSubmit.innerHTML = 'Отправляем… <span>→</span>';
  const { error } = await client.rpc('request_teacher_connection', { p_code: code });
  studentInviteSubmit.disabled = false;
  studentInviteSubmit.innerHTML = 'Отправить заявку <span>→</span>';
  if (error) {
    const text = String(error.message || '').toLowerCase();
    const message = text.includes('not found')
      ? 'Код не найден. Проверьте, что скопировали его полностью.'
      : text.includes('self')
        ? 'Нельзя подключиться к своему же коду преподавателя.'
        : `Не удалось отправить заявку: ${error.message}`;
    setStudentInviteMessage(message, 'error');
    return;
  }
  setStudentInviteMessage('Заявка отправлена. Преподаватель увидит её у себя и сможет принять.', 'success');
  showToast('Заявка преподавателю отправлена');
});
document.addEventListener('click', event => {
  if (!event.target.closest('[data-student-action="join"]')) return;
  showToast('Коды приглашения подключим вместе с таблицами курсов в Supabase');
});
initialiseEmptyWorkspace();
updateMoscowInterface();
window.setInterval(() => updateMoscowInterface(), 60000);

if (window.gsap && !reducedMotion) {
  gsap.from('.sidebar', { x: -24, opacity: 0, duration: .8, ease: 'power3.out' });
  gsap.from('.topbar-actions > *', { y: -12, opacity: 0, stagger: .06, duration: .5, delay: .15 });
}
animateView(document.querySelector('.view.active'));
