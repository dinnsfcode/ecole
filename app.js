const views = [...document.querySelectorAll('.view')];
const navButtons = [...document.querySelectorAll('[data-view]')];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

let activePerson = { name: 'Маша Соколова', course: '3D Generalist', avatar: 'МС' };

function selectPersonTab(tabName = 'course') {
  const activePanel = document.querySelector(`[data-person-panel="${tabName}"]`);
  document.querySelectorAll('[data-person-tab]').forEach(tab => tab.classList.toggle('active', tab.dataset.personTab === tabName));
  document.querySelectorAll('[data-person-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.personPanel === tabName));
  if (activePanel && window.gsap && !reducedMotion) {
    gsap.fromTo(activePanel, { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: .38, ease: 'power3.out' });
  }
}

function openPersonWorkspace(person, tabName = 'course') {
  activePerson = {
    name: person.name || 'Ученик',
    course: person.course || 'Индивидуальная программа',
    avatar: person.avatar || '—'
  };
  document.getElementById('personAvatar').textContent = activePerson.avatar;
  document.getElementById('person-detail-title').textContent = activePerson.name;
  document.getElementById('personCourseLabel').textContent = activePerson.course;
  document.getElementById('personCourseTitle').textContent = activePerson.course.split(' · ')[0];
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

updateTodayLessonActions();
window.setInterval(updateTodayLessonActions, 30000);

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

function createNewLesson() {
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
  document.querySelector('.event-layer').append(event);

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

if (window.gsap && !reducedMotion) {
  gsap.from('.sidebar', { x: -24, opacity: 0, duration: .8, ease: 'power3.out' });
  gsap.from('.topbar-actions > *', { y: -12, opacity: 0, stagger: .06, duration: .5, delay: .15 });
}
animateView(document.querySelector('.view.active'));
