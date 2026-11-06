(() => {
  const { DISPLAY_FONTS, MONO_FONTS, ALL_TOKEN_KEYS, FALLBACK_THEMES } =
    window.SUBWAVE_THEME_DATA;

  // DOM References
  const rootEl = document.documentElement;
  const widgetFrame = document.getElementById('widget-frame');
  const setupView = document.getElementById('setup-view');
  const cardView = document.getElementById('card-view');
  const pillView = document.getElementById('pill-view');
  const themeDrawer = document.getElementById('theme-drawer');
  const misregisterFlood = document.getElementById('misregister-flood');

  // Setup View Elements
  const setupBtnBack = document.getElementById('setup-btn-back');
  const setupBtnPin = document.getElementById('setup-btn-pin');
  const setupBtnClose = document.getElementById('setup-btn-close');
  const setupForm = document.getElementById('setup-form');
  const setupUrlInput = document.getElementById('setup-url-input');
  const setupSubmitBtn = document.getElementById('setup-submit-btn');
  const setupPassRow = document.getElementById('setup-pass-row');
  const setupPassInput = document.getElementById('setup-pass-input');
  const setupStatus = document.getElementById('setup-status');
  const setupSavedList = document.getElementById('setup-saved-list');

  // Card & Pill View Elements
  const statusLed = document.getElementById('status-led');
  const stationNameEl = document.getElementById('station-name');
  const djBadgeEl = document.getElementById('dj-badge');

  const btnThemes = document.getElementById('btn-themes');
  const btnPillMode = document.getElementById('btn-pill-mode');
  const btnPin = document.getElementById('btn-pin');
  const btnClose = document.getElementById('btn-close');

  const coverImg = document.getElementById('cover-img');
  const pillCoverImg = document.getElementById('pill-cover-img');
  const eqBadge = document.getElementById('eq-badge');

  const titleWrap = document.getElementById('title-wrap');
  const titleMarquee = document.getElementById('title-marquee');
  const trackTitleEl = document.getElementById('track-title');
  const trackArtistEl = document.getElementById('track-artist');
  const trackAlbumEl = document.getElementById('track-album');
  const trackTagsEl = document.getElementById('track-tags');
  const trackClockEl = document.getElementById('track-clock');

  const pillTitleWrap = document.getElementById('pill-title-wrap');
  const pillTitleMarquee = document.getElementById('pill-title-marquee');
  const pillTrackTitleEl = document.getElementById('pill-track-title');
  const pillTrackArtistEl = document.getElementById('pill-track-artist');

  const btnPlay = document.getElementById('btn-play');
  const iconPlay = document.getElementById('icon-play');
  const iconStop = document.getElementById('icon-stop');
  const iconSpinner = document.getElementById('icon-spinner');

  const pillBtnPlay = document.getElementById('pill-btn-play');
  const pillIconPlay = document.getElementById('pill-icon-play');
  const pillIconStop = document.getElementById('pill-icon-stop');
  const pillIconSpinner = document.getElementById('pill-icon-spinner');

  const playbackLabel = document.getElementById('playback-label');
  const bitrateLabel = document.getElementById('bitrate-label');
  const listenersPill = document.getElementById('listeners-pill');
  const btnOpenWeb = document.getElementById('btn-open-web');

  const volumeZone = document.getElementById('volume-zone');
  const pillVolumeZone = document.getElementById('pill-volume-zone');
  const volumeSlider = document.getElementById('volume-slider');
  const btnMute = document.getElementById('btn-mute');
  const iconVolOn = document.getElementById('icon-vol-on');
  const iconVolOff = document.getElementById('icon-vol-off');
  const pillBtnMute = document.getElementById('pill-btn-mute');
  const pillIconVolOn = document.getElementById('pill-icon-vol-on');
  const pillIconVolOff = document.getElementById('pill-icon-vol-off');
  const pillBtnPin = document.getElementById('pill-btn-pin');
  const pillBtnExpand = document.getElementById('pill-btn-expand');

  const btnFollowStation = document.getElementById('btn-follow-station');
  const btnRefreshThemes = document.getElementById('btn-refresh-themes');
  const themeGrid = document.getElementById('theme-grid');
  const themeCaption = document.getElementById('theme-caption');
  const drawerStationLabel = document.getElementById('drawer-station-label');
  const btnChangeStation = document.getElementById('btn-change-station');

  const audio = document.getElementById('radio-audio');

  // Application State
  let settings = {
    stationUrl: '',
    stationPassword: '',
    savedStations: [],
    themeSelection: 'station',
    volume: 0.8,
    muted: false,
    alwaysOnTop: true,
    mode: 'card',
  };

  let inSetupScreen = false;
  let drawerOpen = false;
  let themes = [...FALLBACK_THEMES];
  let stationDefaultThemeId = 'classic-dark';
  let appliedThemeId = '';

  let playingWanted = false;
  let audioState = 'stopped'; // 'stopped' | 'buffering' | 'playing'
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let lastAudioTime = 0;
  let lastProgressCheckAt = 0;

  let streamMount = '/stream.mp3';
  let streamFormat = 'MP3';
  let streamBitrate = 160;
  let streamOnline = false;
  let listenerAuthRequired = false;

  let currentTrack = {
    id: null,
    title: 'Connecting to station…',
    artist: 'SUB/WAVE Radio',
    album: '',
    startedAtMs: null,
    durationSec: null,
    year: null,
    genre: null,
    bpm: null,
  };
  let stationName = 'SUB/WAVE Radio';
  let serverClockOffsetMs = 0;
  let currentCoverUrl = '';

  // Color probe element for resolving oklch() / color-mix() into rgb() for SVG feFlood
  const colorProbe = document.createElement('span');
  colorProbe.style.cssText = 'position:fixed;opacity:0;pointer-events:none;color:var(--accent);';
  document.body.appendChild(colorProbe);

  function normalizeStationUrl(raw) {
    let u = String(raw || '').trim();
    if (!u) return '';
    u = u.replace(/^htts:\/\//i, 'https://');
    if (!/^https?:\/\//i.test(u)) {
      const isLocal = /^(localhost|\d{1,3}(?:\.\d{1,3}){3}|[a-z0-9-]+\.local)(?::|\/|$)/i.test(u);
      u = `${isLocal ? 'http' : 'https'}://${u}`;
    }
    return u.replace(/\/+$/, '');
  }

  function formatClock(sec) {
    if (typeof sec !== 'number' || !Number.isFinite(sec) || sec < 0) return '--:--';
    const total = Math.floor(sec);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function buildAuthHeaders(password) {
    const headers = {};
    const pw = typeof password === 'string' ? password : settings.stationPassword;
    if (pw) headers['x-station-auth'] = pw;
    return headers;
  }

  async function fetchJsonFrom(baseUrl, pathname, opts = {}) {
    const { timeoutMs = 6000, password } = opts;
    const base = normalizeStationUrl(baseUrl);
    if (!base) throw new Error('No station URL');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${base}${pathname}`, {
        signal: controller.signal,
        cache: 'no-store',
        headers: buildAuthHeaders(password),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchJson(pathname, timeoutMs = 6000) {
    return fetchJsonFrom(settings.stationUrl, pathname, { timeoutMs });
  }

  // ==========================================================================
  // FIRST-RUN & SWITCH STATION ONBOARDING
  // ==========================================================================

  function setSetupMessage(msg, isError = false) {
    setupStatus.textContent = msg;
    setupStatus.classList.toggle('error', Boolean(isError));
  }

  function renderSavedStationChips() {
    setupSavedList.innerHTML = '';
    for (const st of settings.savedStations || []) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'saved-station-chip';
      chip.textContent = st.name || st.url.replace(/^https?:\/\//, '');
      chip.title = st.url;
      chip.addEventListener('click', () => {
        setupUrlInput.value = st.url;
        setupPassRow.classList.add('hidden');
        setupPassInput.value = st.password || '';
        connectToStation(st.url, st.password || '');
      });
      setupSavedList.appendChild(chip);
    }
  }

  async function openSetupScreen(prefillCurrent = false) {
    inSetupScreen = true;
    drawerOpen = false;
    setupBtnBack.classList.toggle('hidden', !settings.stationUrl);
    setupUrlInput.value = prefillCurrent ? settings.stationUrl : '';
    setupPassInput.value = prefillCurrent ? settings.stationPassword || '' : '';
    setupPassRow.classList.add('hidden');
    setSetupMessage('Supports all station themes & live streams.', false);
    renderSavedStationChips();

    widgetFrame.classList.remove('mode-pill');
    widgetFrame.classList.add('mode-card');
    setupView.classList.remove('hidden');
    cardView.classList.add('hidden');
    pillView.classList.add('hidden');

    await window.subwaveWidget?.setViewMode('setup');
    requestAnimationFrame(() => setupUrlInput.focus());
  }

  async function connectToStation(rawUrl, rawPassword = '') {
    const candidateUrl = normalizeStationUrl(rawUrl);
    if (!candidateUrl) {
      setSetupMessage('Please enter a station URL (e.g. https://radio.example.com).', true);
      setupUrlInput.focus();
      return;
    }

    setupSubmitBtn.disabled = true;
    setSetupMessage('Connecting to SUB/WAVE station…', false);

    try {
      const state = await fetchJsonFrom(candidateUrl, '/api/state', {
        timeoutMs: 7000,
        password: rawPassword,
      });

      if (!state || typeof state !== 'object' || (!('current' in state) && !('station' in state))) {
        throw new Error('Not a valid SubWave station');
      }

      const isLocked = Boolean(state.privacy?.privatePlayer || state.privacy?.listenerAuth);
      const pw = String(rawPassword || '').trim();

      if (isLocked) {
        if (!pw) {
          setupPassRow.classList.remove('hidden');
          setSetupMessage('Private station — enter the listener password to tune in.', true);
          setupSubmitBtn.disabled = false;
          setupPassInput.focus();
          return;
        }
        // Verify listener password against POST /api/station-auth
        const authRes = await fetch(`${candidateUrl}/api/station-auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: pw }),
        });
        if (!authRes.ok) {
          setupPassRow.classList.remove('hidden');
          setSetupMessage(
            authRes.status === 429
              ? 'Too many password attempts — please wait a moment.'
              : 'Incorrect listener password.',
            true
          );
          setupSubmitBtn.disabled = false;
          setupPassInput.select();
          return;
        }
      }

      // Validated! Switch cleanly
      const wasPlaying = playingWanted;
      if (wasPlaying) stopStream();

      const resolvedName = state.station?.name || 'SUB/WAVE Radio';
      const existingList = (settings.savedStations || []).filter((s) => s.url !== candidateUrl);
      const updatedSaved = [{ url: candidateUrl, name: resolvedName }, ...existingList].slice(0, 8);

      settings.stationUrl = candidateUrl;
      settings.stationPassword = isLocked ? pw : '';
      settings.savedStations = updatedSaved;
      listenerAuthRequired = Boolean(state.privacy?.listenerAuth);

      // Reset station-specific caches before loading the newly connected station
      themes = [...FALLBACK_THEMES];
      stationDefaultThemeId = state.theme?.active || 'classic-dark';
      stationName = resolvedName;
      currentCoverUrl = '';
      coverImg.classList.add('hidden');
      pillCoverImg.classList.add('hidden');

      await window.subwaveWidget?.updateSettings({
        stationUrl: settings.stationUrl,
        stationPassword: settings.stationPassword,
        savedStations: settings.savedStations,
      });

      drawerStationLabel.textContent = candidateUrl.replace(/^https?:\/\//, '');
      inSetupScreen = false;
      await applyLayoutMode(settings.mode === 'pill' ? 'pill' : 'card', false);
      await Promise.all([refreshThemesFromStation(), pollStationState(), pollNowPlaying()]);
      if (wasPlaying) startStream();
    } catch {
      setSetupMessage('Could not reach a SUB/WAVE station at that URL.', true);
    } finally {
      setupSubmitBtn.disabled = false;
    }
  }

  // ==========================================================================
  // THEME ENGINE (Exact SubWave Token + Texture + Finish Application)
  // ==========================================================================

  function resolveEffectiveTheme() {
    const targetId =
      settings.themeSelection === 'station' ? stationDefaultThemeId : settings.themeSelection;
    return (
      themes.find((t) => t.id === targetId) ||
      themes.find((t) => t.id === stationDefaultThemeId) ||
      themes[0]
    );
  }

  function applyTheme(force = false) {
    const theme = resolveEffectiveTheme();
    if (!theme) return;

    const signature = `${theme.id}:${JSON.stringify(theme.tokens || {})}`;
    if (!force && appliedThemeId === signature) {
      updateThemePickerSelection(theme);
      return;
    }
    appliedThemeId = signature;

    for (const key of ALL_TOKEN_KEYS) {
      rootEl.style.removeProperty(key);
    }
    rootEl.style.removeProperty('--display-font-family');
    rootEl.style.removeProperty('--mono-font-family');
    rootEl.removeAttribute('data-texture');
    rootEl.removeAttribute('data-finish');

    rootEl.setAttribute('data-theme', theme.mode === 'light' ? 'light' : 'dark');

    const tokens = theme.tokens || {};
    for (const [key, val] of Object.entries(tokens)) {
      if (key === '--display-font') {
        const stack = DISPLAY_FONTS[val];
        if (stack) rootEl.style.setProperty('--display-font-family', stack);
      } else if (key === '--mono-font') {
        const stack = MONO_FONTS[val];
        if (stack) rootEl.style.setProperty('--mono-font-family', stack);
      } else if (key === '--texture') {
        if (val === 'scanline' || val === 'halftone') {
          rootEl.setAttribute('data-texture', val);
        }
      } else if (key === '--finish') {
        if (val === 'bloom' || val === 'misregister') {
          rootEl.setAttribute('data-finish', val);
        }
      } else {
        rootEl.style.setProperty(key, val);
      }
    }

    requestAnimationFrame(() => {
      const resolvedAccent = getComputedStyle(colorProbe).color;
      if (resolvedAccent && misregisterFlood) {
        misregisterFlood.setAttribute('flood-color', resolvedAccent);
      }
      refreshMarquees();
    });

    updateThemePickerSelection(theme);
    syncMainProcessState();
  }

  function describeTheme(theme) {
    if (!theme) return '';
    const prefix =
      settings.themeSelection === 'station' ? `${theme.name} (Station default)` : theme.name;
    return theme.description ? `${prefix} — ${theme.description}` : prefix;
  }

  function updateThemePickerSelection(activeTheme) {
    btnFollowStation.classList.toggle('active', settings.themeSelection === 'station');
    const tiles = themeGrid.querySelectorAll('.theme-tile');
    tiles.forEach((tile) => {
      const id = tile.dataset.themeId;
      const isSelected =
        settings.themeSelection === 'station'
          ? id === activeTheme?.id
          : id === settings.themeSelection;
      tile.classList.toggle('selected', isSelected);
      tile.setAttribute('aria-checked', String(isSelected));
    });
    if (activeTheme) {
      themeCaption.textContent = describeTheme(activeTheme);
    }
  }

  function renderThemeGrid() {
    themeGrid.innerHTML = '';
    const ordered = [...themes].sort((a, b) => {
      if (Boolean(a.builtin) !== Boolean(b.builtin)) {
        return a.builtin ? 1 : -1;
      }
      return a.name.localeCompare(b.name);
    });

    const effective = resolveEffectiveTheme();

    for (const theme of ordered) {
      const t = theme.tokens || {};
      const bg = t['--bg'] || (theme.mode === 'dark' ? '#100e0c' : '#f3efe6');
      const ink = t['--ink'] || (theme.mode === 'dark' ? '#ece6dc' : '#161412');
      const accent = t['--accent'] || '#ee343b';
      const fontStack = DISPLAY_FONTS[t['--display-font']] || DISPLAY_FONTS.fraunces;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'theme-tile';
      btn.dataset.themeId = theme.id;
      btn.setAttribute('role', 'radio');
      btn.title = `${theme.name}${theme.builtin === false ? ' (Custom Station Theme)' : ''}`;
      btn.style.background = bg;
      btn.style.color = ink;

      const aa = document.createElement('span');
      aa.className = 'theme-tile-aa';
      aa.style.fontFamily = fontStack;
      aa.textContent = 'Aa';
      btn.appendChild(aa);

      if (theme.builtin === false) {
        const star = document.createElement('span');
        star.className = 'theme-tile-custom';
        star.textContent = '★';
        btn.appendChild(star);
      }

      const stripe = document.createElement('span');
      stripe.className = 'theme-tile-stripe';
      stripe.style.background = accent;
      btn.appendChild(stripe);

      btn.addEventListener('mouseenter', () => {
        themeCaption.textContent = `${theme.name}${theme.description ? ` — ${theme.description}` : ''}`;
      });
      btn.addEventListener('mouseleave', () => {
        themeCaption.textContent = describeTheme(resolveEffectiveTheme());
      });
      btn.addEventListener('click', async () => {
        settings.themeSelection = theme.id;
        await window.subwaveWidget?.updateSettings({ themeSelection: theme.id });
        applyTheme();
      });

      themeGrid.appendChild(btn);
    }

    updateThemePickerSelection(effective);
  }

  async function refreshThemesFromStation() {
    if (!settings.stationUrl) return;
    try {
      const data = await fetchJson('/api/themes');
      if (data && Array.isArray(data.themes) && data.themes.length > 0) {
        themes = data.themes;
      }
      if (data?.active) {
        stationDefaultThemeId = data.active;
      }
      renderThemeGrid();
      applyTheme();
    } catch {
      renderThemeGrid();
      applyTheme();
    }
  }

  // ==========================================================================
  // MARQUEE & METADATA RENDERING
  // ==========================================================================

  function updateSingleMarquee(wrapEl, trackEl) {
    if (!wrapEl || !trackEl) return;
    wrapEl.classList.remove('is-overflowing');
    trackEl.style.removeProperty('--scroll-dist');
    const wrapW = wrapEl.clientWidth;
    const trackW = trackEl.scrollWidth;
    if (wrapW > 0 && trackW > wrapW + 4) {
      const dist = -(trackW - wrapW + 10);
      trackEl.style.setProperty('--scroll-dist', `${dist}px`);
      wrapEl.classList.add('is-overflowing');
    }
  }

  function refreshMarquees() {
    updateSingleMarquee(titleWrap, titleMarquee);
    updateSingleMarquee(pillTitleWrap, pillTitleMarquee);
  }

  function updateCoverArt(subsonicId) {
    const base = normalizeStationUrl(settings.stationUrl);
    const nextUrl =
      base && subsonicId ? `${base}/api/cover/${encodeURIComponent(subsonicId)}` : '';
    if (nextUrl === currentCoverUrl) return;
    currentCoverUrl = nextUrl;

    if (!nextUrl) {
      coverImg.classList.add('hidden');
      pillCoverImg.classList.add('hidden');
      return;
    }

    const preload = new Image();
    preload.onload = () => {
      if (currentCoverUrl !== nextUrl) return;
      coverImg.src = nextUrl;
      pillCoverImg.src = nextUrl;
      coverImg.classList.remove('hidden');
      pillCoverImg.classList.remove('hidden');
    };
    preload.onerror = () => {
      if (currentCoverUrl !== nextUrl) return;
      coverImg.classList.add('hidden');
      pillCoverImg.classList.add('hidden');
    };
    preload.src = nextUrl;
  }

  function updateMediaSession() {
    if (!('mediaSession' in navigator)) return;
    try {
      const artwork = currentCoverUrl
        ? [{ src: currentCoverUrl, sizes: '512x512', type: 'image/jpeg' }]
        : [];
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title || stationName,
        artist: currentTrack.artist || stationName,
        album: currentTrack.album || stationName,
        artwork,
      });
      navigator.mediaSession.playbackState = audioState === 'playing' ? 'playing' : 'paused';
    } catch {
      // Ignore unsupported formats
    }
  }

  async function pollNowPlaying() {
    if (!settings.stationUrl || inSetupScreen) return;
    try {
      const data = await fetchJson('/api/now-playing');
      const np = data?.nowPlaying || {};

      if (data?.context?.at) {
        const srvMs = Date.parse(data.context.at);
        if (Number.isFinite(srvMs)) {
          serverClockOffsetMs = srvMs - Date.now();
        }
      }

      if (data?.dj?.station) {
        stationName = data.dj.station;
        stationNameEl.textContent = stationName.toUpperCase();
      }

      const djParts = [];
      const showOrDj = data?.activeShow?.name || data?.dj?.name;
      if (showOrDj) djParts.push(showOrDj);
      if (typeof data?.context?.weather?.temp === 'number') {
        const unit = data.context.weather.tempUnit || 'C';
        djParts.push(`${Math.round(data.context.weather.temp)}°${unit}`);
      }
      djBadgeEl.textContent = djParts.join(' · ');

      streamOnline = Boolean(data?.streamOnline);
      if (data?.stream) {
        if (data.stream.opusEnabled) {
          streamMount = '/stream.opus';
          streamFormat = 'OPUS';
        } else {
          streamMount = data.stream.mount || '/stream.mp3';
          streamFormat = (data.stream.format || 'mp3').toUpperCase();
        }
        streamBitrate = data.stream.bitrate || data.streamBitrate || 160;
      }
      bitrateLabel.textContent = `${streamBitrate}K ${streamFormat}`;

      const listenerCount = data?.listeners?.current ?? data?.context?.listeners?.count ?? 0;
      listenersPill.textContent = String(listenerCount);
      listenersPill.title = `${listenerCount} active listener${listenerCount === 1 ? '' : 's'} (peak ${
        data?.listeners?.peak ?? listenerCount
      })`;

      const title = np.title || (streamOnline ? stationName : 'Station Idle');
      const artist = np.artist || data?.dj?.name || '';
      const album = np.album || data?.dj?.tagline || '';

      const trackChanged = currentTrack.id !== (np.subsonic_id || title);
      currentTrack.id = np.subsonic_id || title;
      currentTrack.title = title;
      currentTrack.artist = artist;
      currentTrack.album = album;
      currentTrack.durationSec = typeof np.duration === 'number' ? np.duration : currentTrack.durationSec;
      currentTrack.year = np.year || null;
      currentTrack.genre = np.genre || null;
      currentTrack.bpm = typeof np.bpm === 'number' ? Math.round(np.bpm) : null;

      if (typeof np.timestamp === 'number' && np.timestamp > 0) {
        currentTrack.startedAtMs = np.timestamp * 1000;
      }

      trackTitleEl.textContent = title;
      trackArtistEl.textContent = artist || stationName;
      trackAlbumEl.textContent =
        album || normalizeStationUrl(settings.stationUrl).replace(/^https?:\/\//, '');

      pillTrackTitleEl.textContent = title;
      pillTrackArtistEl.textContent = artist || stationName;

      const tags = [];
      if (currentTrack.year) tags.push(String(currentTrack.year));
      if (currentTrack.genre) {
        const firstGenre = String(currentTrack.genre).split(',')[0].trim();
        if (firstGenre) tags.push(firstGenre);
      }
      if (currentTrack.bpm) tags.push(`${currentTrack.bpm} BPM`);
      trackTagsEl.textContent = tags.length ? tags.join(' · ') : 'ON AIR';

      updateCoverArt(np.subsonic_id);
      if (trackChanged) {
        requestAnimationFrame(refreshMarquees);
        updateMediaSession();
        syncMainProcessState();
      }
      updatePlaybackUi();
      tickProgress();
    } catch {
      if (audioState === 'stopped') {
        playbackLabel.textContent = 'OFFLINE';
      }
      statusLed.className = 'status-led';
    }
  }

  async function pollStationState() {
    if (!settings.stationUrl || inSetupScreen) return;
    try {
      const state = await fetchJson('/api/state');
      if (state?.station?.name) {
        stationName = state.station.name;
        stationNameEl.textContent = stationName.toUpperCase();
      }
      listenerAuthRequired = Boolean(state?.privacy?.listenerAuth);
      if (state?.current?.startedAt) {
        const parsed = Date.parse(state.current.startedAt);
        if (Number.isFinite(parsed)) {
          currentTrack.startedAtMs = parsed;
        }
      }
      if (typeof state?.current?.duration === 'number') {
        currentTrack.durationSec = state.current.duration;
      }
      if (state?.theme?.active && state.theme.active !== stationDefaultThemeId) {
        stationDefaultThemeId = state.theme.active;
        if (!themes.some((t) => t.id === stationDefaultThemeId)) {
          await refreshThemesFromStation();
        } else {
          applyTheme();
        }
      }
      tickProgress();
    } catch {
      // Ignore transient poll errors
    }
  }

  function tickProgress() {
    if (!settings.stationUrl || inSetupScreen) return;
    const dur = currentTrack.durationSec;
    const startMs = currentTrack.startedAtMs;
    if (typeof dur === 'number' && dur > 0 && typeof startMs === 'number' && startMs > 0) {
      const nowServerMs = Date.now() + serverClockOffsetMs;
      const elapsed = Math.max(0, Math.min(dur, (nowServerMs - startMs) / 1000));
      const ratio = Math.max(0, Math.min(1, elapsed / dur));
      rootEl.style.setProperty('--progress', ratio.toFixed(4));
      trackClockEl.textContent = `${formatClock(elapsed)} / ${formatClock(dur)}`;
    } else {
      rootEl.style.setProperty('--progress', audioState === 'playing' ? '1' : '0');
      trackClockEl.textContent = audioState === 'playing' ? 'LIVE' : '--:--';
    }
  }

  // ==========================================================================
  // AUDIO STREAMING & AUTO-RECONNECT
  // ==========================================================================

  function clearReconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function scheduleReconnect() {
    if (!playingWanted || reconnectTimer) return;
    audioState = 'buffering';
    updatePlaybackUi();
    const delay = Math.min(8000, 1500 * Math.pow(1.6, reconnectAttempt++));
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (playingWanted) startStream();
    }, delay);
  }

  function startStream() {
    const base = normalizeStationUrl(settings.stationUrl);
    if (!base) {
      openSetupScreen(false);
      return;
    }
    clearReconnect();
    playingWanted = true;
    audioState = 'buffering';
    updatePlaybackUi();
    syncMainProcessState();

    const params = new URLSearchParams({ _t: String(Date.now()) });
    if (listenerAuthRequired && settings.stationPassword) {
      params.set('auth', settings.stationPassword);
    }
    audio.src = `${base}${streamMount}?${params.toString()}`;
    audio.volume = settings.muted ? 0 : settings.volume;
    audio.muted = Boolean(settings.muted);

    const p = audio.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        if (playingWanted) scheduleReconnect();
      });
    }
  }

  function stopStream() {
    playingWanted = false;
    reconnectAttempt = 0;
    clearReconnect();
    audioState = 'stopped';
    try {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    } catch {
      // Ignore cleanup errors
    }
    updatePlaybackUi();
    updateMediaSession();
    syncMainProcessState();
  }

  function togglePlay() {
    if (!settings.stationUrl) return;
    if (playingWanted) {
      stopStream();
    } else {
      startStream();
    }
  }

  audio.addEventListener('playing', () => {
    if (!playingWanted) return;
    reconnectAttempt = 0;
    audioState = 'playing';
    lastAudioTime = audio.currentTime;
    lastProgressCheckAt = Date.now();
    updatePlaybackUi();
    updateMediaSession();
    syncMainProcessState();
  });

  audio.addEventListener('waiting', () => {
    if (!playingWanted) return;
    audioState = 'buffering';
    updatePlaybackUi();
  });

  audio.addEventListener('error', () => {
    if (playingWanted) scheduleReconnect();
  });

  audio.addEventListener('ended', () => {
    if (playingWanted) scheduleReconnect();
  });

  // Watchdog for silent TCP stream stalls
  setInterval(() => {
    if (!playingWanted || audioState !== 'playing') return;
    const now = Date.now();
    if (audio.currentTime > lastAudioTime + 0.05) {
      lastAudioTime = audio.currentTime;
      lastProgressCheckAt = now;
    } else if (now - lastProgressCheckAt > 9000) {
      lastProgressCheckAt = now;
      startStream();
    }
  }, 3000);

  function updatePlaybackUi() {
    const isBuffering = audioState === 'buffering';
    const isPlaying = audioState === 'playing';

    iconPlay.classList.toggle('hidden', isBuffering || isPlaying);
    iconStop.classList.toggle('hidden', !isPlaying);
    iconSpinner.classList.toggle('hidden', !isBuffering);

    pillIconPlay.classList.toggle('hidden', isBuffering || isPlaying);
    pillIconStop.classList.toggle('hidden', !isPlaying);
    pillIconSpinner.classList.toggle('hidden', !isBuffering);

    eqBadge.classList.toggle('hidden', !isPlaying);

    statusLed.className = 'status-led';
    if (isBuffering) {
      statusLed.classList.add('buffering');
      playbackLabel.textContent = 'TUNING…';
    } else if (isPlaying) {
      statusLed.classList.add('playing');
      playbackLabel.textContent = 'ON AIR';
    } else if (streamOnline) {
      statusLed.classList.add('online');
      playbackLabel.textContent = 'READY';
    } else {
      playbackLabel.textContent = 'STANDBY';
    }
  }

  // ==========================================================================
  // VOLUME, PIN, VIEW MODES & IPC SYNC
  // ==========================================================================

  function applyVolumeUi() {
    const effectivePct = settings.muted ? 0 : Math.round(settings.volume * 100);
    volumeSlider.value = String(effectivePct);
    volumeSlider.style.setProperty('--vol-pct', `${effectivePct}%`);

    audio.volume = Math.max(0, Math.min(1, settings.volume));
    audio.muted = Boolean(settings.muted || settings.volume === 0);

    const showMuted = Boolean(settings.muted || settings.volume === 0);
    iconVolOn.classList.toggle('hidden', showMuted);
    iconVolOff.classList.toggle('hidden', !showMuted);
    pillIconVolOn.classList.toggle('hidden', showMuted);
    pillIconVolOff.classList.toggle('hidden', !showMuted);
  }

  async function setVolume(nextVol, unmute = true) {
    const clamped = Math.max(0, Math.min(1, Number(nextVol)));
    settings.volume = clamped;
    if (unmute && clamped > 0 && settings.muted) {
      settings.muted = false;
    }
    applyVolumeUi();
    await window.subwaveWidget?.updateSettings({
      volume: settings.volume,
      muted: settings.muted,
    });
  }

  async function toggleMute() {
    settings.muted = !settings.muted;
    if (!settings.muted && settings.volume === 0) {
      settings.volume = 0.5;
    }
    applyVolumeUi();
    await window.subwaveWidget?.updateSettings({
      volume: settings.volume,
      muted: settings.muted,
    });
  }

  function applyPinUi() {
    const pinned = Boolean(settings.alwaysOnTop);
    btnPin.classList.toggle('active', pinned);
    pillBtnPin.classList.toggle('active', pinned);
    setupBtnPin.classList.toggle('active', pinned);
  }

  async function togglePin() {
    settings.alwaysOnTop = !settings.alwaysOnTop;
    applyPinUi();
    await window.subwaveWidget?.updateSettings({ alwaysOnTop: settings.alwaysOnTop });
  }

  async function applyLayoutMode(mode, openDrawer = false) {
    if (!settings.stationUrl) {
      await openSetupScreen(false);
      return;
    }
    inSetupScreen = false;
    settings.mode = mode === 'pill' ? 'pill' : 'card';
    drawerOpen = settings.mode === 'card' && Boolean(openDrawer);

    const isPill = settings.mode === 'pill';
    setupView.classList.add('hidden');
    widgetFrame.classList.toggle('mode-pill', isPill);
    widgetFrame.classList.toggle('mode-card', !isPill);
    cardView.classList.toggle('hidden', isPill);
    pillView.classList.toggle('hidden', !isPill);
    themeDrawer.classList.toggle('hidden', !drawerOpen);
    btnThemes.classList.toggle('active', drawerOpen);

    const windowTarget = isPill ? 'pill' : drawerOpen ? 'themes' : 'card';
    await window.subwaveWidget?.setViewMode(windowTarget);
    requestAnimationFrame(refreshMarquees);
  }

  function syncMainProcessState() {
    window.subwaveWidget?.syncState({
      configured: Boolean(settings.stationUrl),
      playing: playingWanted,
      stationName,
      trackTitle: settings.stationUrl ? currentTrack.title : 'Connect a station to begin',
      trackArtist: settings.stationUrl ? currentTrack.artist : '',
      activeThemeId: resolveEffectiveTheme()?.id || '',
      stationDefaultThemeId,
      themes: themes.map((t) => ({ id: t.id, name: t.name, builtin: t.builtin })),
    });
  }

  // ==========================================================================
  // EVENT LISTENERS
  // ==========================================================================

  setupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    connectToStation(setupUrlInput.value, setupPassInput.value);
  });

  setupBtnBack.addEventListener('click', () => {
    if (settings.stationUrl) {
      applyLayoutMode(settings.mode, false);
    }
  });

  setupBtnPin.addEventListener('click', togglePin);
  setupBtnClose.addEventListener('click', () => {
    window.subwaveWidget?.windowAction('close');
  });

  btnPlay.addEventListener('click', togglePlay);
  pillBtnPlay.addEventListener('click', togglePlay);

  btnMute.addEventListener('click', toggleMute);
  pillBtnMute.addEventListener('click', toggleMute);

  volumeSlider.addEventListener('input', (e) => {
    const pct = Number(e.target.value) / 100;
    setVolume(pct, true);
  });

  function onWheelVolume(e) {
    e.preventDefault();
    const step = e.deltaY < 0 ? 0.05 : -0.05;
    setVolume((settings.muted ? 0 : settings.volume) + step, true);
  }
  volumeZone.addEventListener('wheel', onWheelVolume, { passive: false });
  pillVolumeZone.addEventListener('wheel', onWheelVolume, { passive: false });

  btnPin.addEventListener('click', togglePin);
  pillBtnPin.addEventListener('click', togglePin);

  btnPillMode.addEventListener('click', () => applyLayoutMode('pill', false));
  pillBtnExpand.addEventListener('click', () => applyLayoutMode('card', false));

  btnThemes.addEventListener('click', async () => {
    const nextDrawer = !drawerOpen;
    await applyLayoutMode('card', nextDrawer);
    if (nextDrawer) {
      refreshThemesFromStation();
    }
  });

  btnFollowStation.addEventListener('click', async () => {
    settings.themeSelection = 'station';
    await window.subwaveWidget?.updateSettings({ themeSelection: 'station' });
    applyTheme();
  });

  btnRefreshThemes.addEventListener('click', () => {
    refreshThemesFromStation();
  });

  btnChangeStation.addEventListener('click', () => {
    openSetupScreen(true);
  });

  btnOpenWeb.addEventListener('click', () => {
    if (settings.stationUrl) {
      window.subwaveWidget?.openExternal(normalizeStationUrl(settings.stationUrl));
    }
  });

  btnClose.addEventListener('click', () => {
    window.subwaveWidget?.windowAction('close');
  });

  // Right-click anywhere on widget opens native context menu
  window.addEventListener('contextmenu', (e) => {
    if (e.target === setupUrlInput || e.target === setupPassInput) return;
    e.preventDefault();
    window.subwaveWidget?.windowAction('context-menu');
  });

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    const active = document.activeElement;
    if (active === setupUrlInput || active === setupPassInput) {
      if (e.key === 'Escape' && settings.stationUrl) {
        applyLayoutMode(settings.mode, false);
      }
      return;
    }
    if (inSetupScreen) return;

    if (e.code === 'Space') {
      e.preventDefault();
      togglePlay();
    } else if (e.key === 'm' || e.key === 'M') {
      e.preventDefault();
      toggleMute();
    } else if (e.key === 'Escape' && drawerOpen) {
      e.preventDefault();
      applyLayoutMode('card', false);
    }
  });

  // Windows Media Keys integration
  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.setActionHandler('play', () => startStream());
      navigator.mediaSession.setActionHandler('pause', () => stopStream());
      navigator.mediaSession.setActionHandler('stop', () => stopStream());
    } catch {
      // Ignore unsupported handlers
    }
  }

  // Commands arriving from System Tray / Context Menu
  window.subwaveWidget?.onTrayCommand((cmd) => {
    if (!cmd) return;
    if (cmd.action === 'toggle-play') {
      togglePlay();
    } else if (cmd.action === 'toggle-mute') {
      toggleMute();
    } else if (cmd.action === 'set-mode') {
      applyLayoutMode(cmd.mode, false);
    } else if (cmd.action === 'set-pin') {
      settings.alwaysOnTop = Boolean(cmd.alwaysOnTop);
      applyPinUi();
    } else if (cmd.action === 'set-theme') {
      settings.themeSelection = cmd.themeId || 'station';
      applyTheme();
    } else if (cmd.action === 'open-setup') {
      openSetupScreen(false);
    } else if (cmd.action === 'switch-station' && cmd.url) {
      connectToStation(cmd.url, '');
    }
  });

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  async function init() {
    if (window.subwaveWidget?.getSettings) {
      const saved = await window.subwaveWidget.getSettings();
      if (saved) settings = { ...settings, ...saved };
    }

    settings.stationUrl = normalizeStationUrl(settings.stationUrl);
    drawerStationLabel.textContent = settings.stationUrl.replace(/^https?:\/\//, '');

    applyVolumeUi();
    applyPinUi();
    renderThemeGrid();
    applyTheme(true);

    if (!settings.stationUrl) {
      await openSetupScreen(false);
    } else {
      await applyLayoutMode(settings.mode, false);
      await Promise.all([refreshThemesFromStation(), pollStationState(), pollNowPlaying()]);
    }

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => refreshMarquees());
    }

    setInterval(pollNowPlaying, 5000);
    setInterval(pollStationState, 10000);
    setInterval(refreshThemesFromStation, 60000);
    setInterval(tickProgress, 500);
  }

  init();
})();
