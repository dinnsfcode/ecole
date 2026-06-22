(function initialiseEcoleAuth() {
  const settings = window.ECOLE_SUPABASE;
  const authGate = document.getElementById('authGate');
  const appShell = document.getElementById('appShell');
  const form = document.getElementById('authForm');
  const message = document.getElementById('authMessage');
  const submit = document.getElementById('authSubmit');
  const submitLabel = submit.querySelector('span');
  const nameFields = document.getElementById('authNameFields');
  const emailInput = document.getElementById('authEmail');
  const passwordInput = document.getElementById('authPassword');
  let mode = 'login';

  function setMessage(text = '', type = '') {
    message.textContent = text;
    message.className = `auth-message${type ? ` ${type}` : ''}`;
  }

  function setLoading(loading) {
    submit.disabled = loading;
    submit.classList.toggle('is-loading', loading);
    submitLabel.textContent = loading ? 'Подождите…' : mode === 'login' ? 'Войти' : 'Создать аккаунт';
  }

  function translateAuthError(error) {
    const text = String(error?.message || '').toLowerCase();
    if (text.includes('invalid login credentials')) return 'Неверная почта или пароль. Проверьте данные и попробуйте снова.';
    if (text.includes('email not confirmed')) return 'Сначала подтвердите почту по ссылке из письма.';
    if (text.includes('already registered') || text.includes('already been registered')) return 'Аккаунт с такой почтой уже существует. Попробуйте войти.';
    if (text.includes('password')) return 'Пароль должен содержать не менее 6 символов.';
    if (text.includes('rate limit')) return 'Слишком много попыток. Подождите немного и попробуйте снова.';
    return 'Не удалось выполнить запрос. Проверьте интернет и попробуйте ещё раз.';
  }

  function updateUserInterface(session) {
    const signedIn = Boolean(session?.user);
    window.ecoleCurrentSession = session || null;
    authGate.hidden = signedIn;
    appShell.setAttribute('aria-hidden', String(!signedIn));
    document.body.classList.toggle('is-authenticated', signedIn);

    document.dispatchEvent(new CustomEvent('ecole:session', { detail: { session: session || null } }));
    if (!signedIn) return;
    const metadata = session.user.user_metadata || {};
    const fieldValues = {
      profileFirstName: metadata.first_name,
      profileLastName: metadata.last_name,
      profileSubject: metadata.subject,
      profileDescription: metadata.description
    };
    Object.entries(fieldValues).forEach(([id, value]) => {
      const field = document.getElementById(id);
      if (field && value) field.value = value;
    });
    window.requestAnimationFrame(() => {
      document.getElementById('profileFirstName')?.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  function setMode(nextMode) {
    mode = nextMode;
    const registering = mode === 'register';
    document.querySelectorAll('[data-auth-mode]').forEach(button => {
      const active = button.dataset.authMode === mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    nameFields.hidden = !registering;
    passwordInput.autocomplete = registering ? 'new-password' : 'current-password';
    document.getElementById('authTitle').textContent = registering ? 'Создайте своё пространство' : 'Войдите в своё пространство';
    document.getElementById('authLead').textContent = registering ? 'Начните собирать обучение в понятную систему.' : 'Продолжите работу с учениками и занятиями.';
    submitLabel.textContent = registering ? 'Создать аккаунт' : 'Войти';
    setMessage();
  }

  if (!settings?.url || !settings?.publishableKey || !window.supabase?.createClient) {
    setMessage('Подключение к Supabase не настроено. Обновите страницу или обратитесь к владельцу сайта.', 'error');
    submit.disabled = true;
    return;
  }

  const client = window.supabase.createClient(settings.url, settings.publishableKey);
  window.ecoleSupabase = client;

  document.querySelectorAll('[data-auth-mode]').forEach(button => {
    button.addEventListener('click', () => setMode(button.dataset.authMode));
  });

  document.getElementById('togglePassword')?.addEventListener('click', event => {
    const reveal = passwordInput.type === 'password';
    passwordInput.type = reveal ? 'text' : 'password';
    event.currentTarget.textContent = reveal ? 'Скрыть' : 'Показать';
    event.currentTarget.setAttribute('aria-label', reveal ? 'Скрыть пароль' : 'Показать пароль');
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    setMessage();
    if (!form.reportValidity()) return;
    setLoading(true);

    try {
      if (mode === 'register') {
        const firstName = document.getElementById('authFirstName').value.trim();
        const lastName = document.getElementById('authLastName').value.trim();
        if (!firstName) {
          document.getElementById('authFirstName').focus();
          setMessage('Укажите имя — оно появится в вашем профиле.', 'error');
          return;
        }
        const { data, error } = await client.auth.signUp({
          email: emailInput.value.trim(),
          password: passwordInput.value,
          options: {
            emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
            data: { first_name: firstName, last_name: lastName }
          }
        });
        if (error) throw error;
        if (!data.session) {
          setMessage('Готово! Мы отправили письмо. Откройте его и подтвердите регистрацию.', 'success');
          form.reset();
        }
      } else {
        const { error } = await client.auth.signInWithPassword({
          email: emailInput.value.trim(),
          password: passwordInput.value
        });
        if (error) throw error;
      }
    } catch (error) {
      setMessage(translateAuthError(error), 'error');
    } finally {
      setLoading(false);
    }
  });

  document.getElementById('signOutButton')?.addEventListener('click', async () => {
    const button = document.getElementById('signOutButton');
    button.disabled = true;
    const { error } = await client.auth.signOut();
    button.disabled = false;
    if (error) window.alert('Не удалось выйти. Проверьте интернет и попробуйте снова.');
  });

  document.getElementById('saveProfile')?.addEventListener('click', async () => {
    const profileForm = document.getElementById('profileForm');
    if (!profileForm?.reportValidity()) return;
    const profileData = {
      first_name: document.getElementById('profileFirstName').value.trim(),
      last_name: document.getElementById('profileLastName').value.trim(),
      subject: document.getElementById('profileSubject').value.trim(),
      description: document.getElementById('profileDescription').value.trim()
    };
    const { error } = await client.auth.updateUser({ data: profileData });
    const state = document.getElementById('profileSaveState');
    if (error) {
      state.textContent = 'Не удалось сохранить в облаке';
      state.classList.remove('saved');
    } else {
      state.textContent = 'Сохранено в облаке';
      state.classList.add('saved');
    }
  });

  client.auth.onAuthStateChange((_event, session) => updateUserInterface(session));
  client.auth.getSession().then(({ data, error }) => {
    if (error) setMessage(translateAuthError(error), 'error');
    updateUserInterface(data?.session || null);
  });
})();
