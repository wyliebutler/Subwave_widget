const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  screen,
  shell,
  nativeImage,
} = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const IS_MAC = process.platform === 'darwin';

// Allow tray / media-key triggered live stream playback without gesture blocks
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const DIMENSIONS = {
  setup: { width: 356, height: 218 },
  card: { width: 356, height: 192 },
  themes: { width: 356, height: 376 },
  pill: { width: 344, height: 58 },
};

const DEFAULT_SETTINGS = {
  stationUrl: '',
  stationPassword: '',
  savedStations: [], // [{ url, name }]
  themeSelection: 'station', // 'station' or theme id
  volume: 0.8,
  muted: false,
  alwaysOnTop: true,
  hideDockIcon: false, // macOS only: hide Dock icon to run purely in Menu Bar
  mode: 'card', // 'card' | 'pill'
  bounds: null, // { x, y }
};

let mainWindow = null;
let tray = null;
let isQuitting = false;
let currentViewMode = 'card'; // 'setup' | 'card' | 'themes' | 'pill'
let preExpandY = null;

// Live runtime state mirrored from renderer for the Tray / Context Menu
let liveState = {
  configured: false,
  playing: false,
  stationName: 'SUB/WAVE Radio',
  trackTitle: 'Connect a station to begin',
  trackArtist: '',
  activeThemeId: 'classic-dark',
  stationDefaultThemeId: 'classic-dark',
  themes: [],
};

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'widget-settings.json');
}

function loadSettings() {
  try {
    const raw = fs.readFileSync(getSettingsPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      savedStations: Array.isArray(parsed?.savedStations) ? parsed.savedStations : [],
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

let settings = null;

function saveSettings(patch = {}) {
  settings = { ...settings, ...patch };
  try {
    fs.mkdirSync(path.dirname(getSettingsPath()), { recursive: true });
    fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save widget settings:', err);
  }
  return settings;
}

function applyMacDockVisibility(hideDock) {
  if (!IS_MAC || !app.dock) return;
  if (hideDock) {
    app.dock.hide();
  } else {
    app.dock.show().catch(() => {});
  }
}

function setupMacApplicationMenu() {
  if (!IS_MAC) {
    Menu.setApplicationMenu(null);
    return;
  }
  // Standard Edit roles are required on macOS so Cmd+C / Cmd+V / Cmd+A work in input fields
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        {
          label: 'Quit SubWave Widget',
          accelerator: 'Command+Q',
          click: () => {
            isQuitting = true;
            app.quit();
          },
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function getValidInitialPosition(width, height, savedBounds) {
  const displays = screen.getAllDisplays();
  if (savedBounds && typeof savedBounds.x === 'number' && typeof savedBounds.y === 'number') {
    const visible = displays.some((d) => {
      const wa = d.workArea;
      return (
        savedBounds.x + width > wa.x + 40 &&
        savedBounds.x < wa.x + wa.width - 40 &&
        savedBounds.y + height > wa.y + 24 &&
        savedBounds.y < wa.y + wa.height - 24
      );
    });
    if (visible) {
      return { x: Math.round(savedBounds.x), y: Math.round(savedBounds.y) };
    }
  }
  const primary = screen.getPrimaryDisplay().workArea;
  return {
    x: Math.round(primary.x + primary.width - width - 24),
    y: Math.round(primary.y + (IS_MAC ? 24 : primary.height - height - 24)),
  };
}

function applyAlwaysOnTop(win, enabled) {
  if (!win || win.isDestroyed()) return;
  if (enabled) {
    win.setAlwaysOnTop(true, 'floating');
    if (IS_MAC) {
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }
  } else {
    win.setAlwaysOnTop(false);
    if (IS_MAC) {
      win.setVisibleOnAllWorkspaces(false);
    }
  }
}

function resizeForMode(targetMode) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const spec = DIMENSIONS[targetMode] || DIMENSIONS.card;
  const currentBounds = mainWindow.getBounds();
  const display = screen.getDisplayMatching(currentBounds).workArea;

  let nextX = currentBounds.x;
  let nextY = currentBounds.y;

  if (targetMode === 'themes' && currentViewMode !== 'themes') {
    if (nextY + spec.height > display.y + display.height) {
      preExpandY = nextY;
      nextY = Math.max(display.y + 8, display.y + display.height - spec.height - 8);
    } else {
      preExpandY = null;
    }
  } else if (currentViewMode === 'themes' && targetMode !== 'themes' && preExpandY !== null) {
    nextY = preExpandY;
    preExpandY = null;
  } else if (nextY + spec.height > display.y + display.height) {
    nextY = Math.max(display.y + 8, display.y + display.height - spec.height - 8);
  }

  if (nextX + spec.width > display.x + display.width) {
    nextX = Math.max(display.x + 8, display.x + display.width - spec.width - 8);
  }

  currentViewMode = targetMode;
  mainWindow.setResizable(true);
  mainWindow.setMinimumSize(spec.width, spec.height);
  mainWindow.setMaximumSize(spec.width, spec.height);
  mainWindow.setBounds(
    {
      x: Math.round(nextX),
      y: Math.round(nextY),
      width: spec.width,
      height: spec.height,
    },
    false
  );
  mainWindow.setResizable(false);
}

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function buildAppMenuTemplate() {
  const hasStation = Boolean(settings.stationUrl);

  const themeItems = [
    {
      label: `Follow Station Default${liveState.stationDefaultThemeId ? ` (${liveState.stationDefaultThemeId})` : ''}`,
      type: 'radio',
      checked: settings.themeSelection === 'station',
      click: () => {
        saveSettings({ themeSelection: 'station' });
        sendToRenderer('tray:command', { action: 'set-theme', themeId: 'station' });
        refreshTray();
      },
    },
    { type: 'separator' },
    ...(liveState.themes || []).map((t) => ({
      label: `${t.name}${t.builtin === false ? ' ★' : ''}`,
      type: 'radio',
      checked: settings.themeSelection === t.id,
      click: () => {
        saveSettings({ themeSelection: t.id });
        sendToRenderer('tray:command', { action: 'set-theme', themeId: t.id });
        refreshTray();
      },
    })),
  ];

  const stationSubmenu = [
    ...(settings.savedStations || []).map((st) => ({
      label: st.name ? `${st.name} (${st.url.replace(/^https?:\/\//, '')})` : st.url,
      type: 'radio',
      checked: st.url === settings.stationUrl,
      click: () => {
        sendToRenderer('tray:command', { action: 'switch-station', url: st.url });
        if (mainWindow && !mainWindow.isVisible()) mainWindow.show();
      },
    })),
    ...(settings.savedStations?.length ? [{ type: 'separator' }] : []),
    {
      label: 'Connect to Another Station…',
      click: () => {
        if (mainWindow && !mainWindow.isVisible()) mainWindow.show();
        if (mainWindow) mainWindow.focus();
        sendToRenderer('tray:command', { action: 'open-setup' });
      },
    },
  ];

  const nowLine = liveState.trackTitle
    ? `${liveState.trackTitle}${liveState.trackArtist ? ` — ${liveState.trackArtist}` : ''}`
    : liveState.stationName;

  const macExtraItems = IS_MAC
    ? [
        {
          label: 'Hide Dock Icon (Menu Bar Only)',
          type: 'checkbox',
          checked: Boolean(settings.hideDockIcon),
          click: () => {
            const nextHide = !settings.hideDockIcon;
            saveSettings({ hideDockIcon: nextHide });
            applyMacDockVisibility(nextHide);
            refreshTray();
          },
        },
      ]
    : [];

  return [
    {
      label: `📻 ${liveState.stationName || 'SUB/WAVE Radio'}`,
      enabled: false,
    },
    {
      label: nowLine.length > 48 ? `${nowLine.slice(0, 47)}…` : nowLine,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: liveState.playing ? 'Stop Live Stream' : 'Play Live Stream',
      enabled: hasStation,
      click: () => sendToRenderer('tray:command', { action: 'toggle-play' }),
    },
    {
      label: 'Mute Audio',
      type: 'checkbox',
      checked: Boolean(settings.muted),
      enabled: hasStation,
      click: () => sendToRenderer('tray:command', { action: 'toggle-mute' }),
    },
    { type: 'separator' },
    {
      label: 'Ultra-Mini Pill Mode',
      type: 'checkbox',
      checked: settings.mode === 'pill',
      enabled: hasStation,
      click: () => {
        const nextMode = settings.mode === 'pill' ? 'card' : 'pill';
        saveSettings({ mode: nextMode });
        resizeForMode(nextMode);
        sendToRenderer('tray:command', { action: 'set-mode', mode: nextMode });
        if (mainWindow && !mainWindow.isVisible()) mainWindow.show();
        refreshTray();
      },
    },
    {
      label: 'Pin Always on Top',
      type: 'checkbox',
      checked: Boolean(settings.alwaysOnTop),
      click: () => {
        const nextPin = !settings.alwaysOnTop;
        saveSettings({ alwaysOnTop: nextPin });
        applyAlwaysOnTop(mainWindow, nextPin);
        sendToRenderer('tray:command', { action: 'set-pin', alwaysOnTop: nextPin });
        refreshTray();
      },
    },
    ...macExtraItems,
    {
      label: 'Themes',
      submenu: themeItems,
    },
    {
      label: 'Station',
      submenu: stationSubmenu,
    },
    { type: 'separator' },
    {
      label: mainWindow && mainWindow.isVisible() ? `Hide Widget to ${IS_MAC ? 'Menu Bar' : 'Tray'}` : 'Show Widget',
      click: () => {
        if (!mainWindow) return;
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
        refreshTray();
      },
    },
    {
      label: 'Open Station in Browser…',
      enabled: hasStation,
      click: () => {
        if (settings.stationUrl) shell.openExternal(settings.stationUrl);
      },
    },
    { type: 'separator' },
    {
      label: 'Quit SubWave Widget',
      accelerator: IS_MAC ? 'Command+Q' : undefined,
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ];
}

function getTrayImage(playing) {
  if (IS_MAC) {
    const macFile = playing ? 'trayMacLiveTemplate.png' : 'trayMacTemplate.png';
    const macPath = path.join(__dirname, '..', 'assets', macFile);
    if (fs.existsSync(macPath)) {
      const img = nativeImage.createFromPath(macPath);
      img.setTemplateImage(true);
      return img;
    }
  }
  const iconFile = playing ? 'tray-playing.png' : 'tray-idle.png';
  const fullPath = path.join(__dirname, '..', 'assets', iconFile);
  if (fs.existsSync(fullPath)) {
    return nativeImage.createFromPath(fullPath);
  }
  const fallback = path.join(__dirname, '..', 'assets', IS_MAC ? 'icon.png' : 'icon.ico');
  return fs.existsSync(fallback) ? nativeImage.createFromPath(fallback) : nativeImage.createEmpty();
}

function refreshTray() {
  if (!tray) return;
  tray.setImage(getTrayImage(liveState.playing));
  const statusPrefix = liveState.playing ? '▶ ' : '⏸ ';
  const tip = settings.stationUrl
    ? `${statusPrefix}${liveState.stationName || 'SUB/WAVE'}\n${liveState.trackTitle || ''}${
        liveState.trackArtist ? ` — ${liveState.trackArtist}` : ''
      }`
    : 'SUB/WAVE Widget — Connect a station';
  tray.setToolTip(tip.trim());
  tray.setContextMenu(Menu.buildFromTemplate(buildAppMenuTemplate()));
}

function createTray() {
  tray = new Tray(getTrayImage(false));
  if (!IS_MAC) {
    tray.on('click', () => {
      if (!mainWindow) return;
      if (mainWindow.isVisible()) {
        if (mainWindow.isFocused()) {
          mainWindow.hide();
        } else {
          mainWindow.focus();
        }
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
      refreshTray();
    });
  }
  refreshTray();
}

function createWindow() {
  const startMode = !settings.stationUrl ? 'setup' : settings.mode === 'pill' ? 'pill' : 'card';
  currentViewMode = startMode;
  const spec = DIMENSIONS[startMode];
  const pos = getValidInitialPosition(spec.width, spec.height, settings.bounds);

  const iconPath = path.join(__dirname, '..', 'assets', IS_MAC ? 'icon.png' : 'icon.ico');

  mainWindow = new BrowserWindow({
    x: pos.x,
    y: pos.y,
    width: spec.width,
    height: spec.height,
    minWidth: spec.width,
    maxWidth: spec.width,
    minHeight: spec.height,
    maxHeight: spec.height,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: true,
    fullscreenable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    icon: !IS_MAC && fs.existsSync(iconPath) ? iconPath : undefined,
    title: 'SubWave Widget',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  applyAlwaysOnTop(mainWindow, settings.alwaysOnTop);
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  let moveTimer = null;
  mainWindow.on('moved', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (currentViewMode === 'themes' && preExpandY !== null) return;
    clearTimeout(moveTimer);
    moveTimer = setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      const b = mainWindow.getBounds();
      saveSettings({ bounds: { x: b.x, y: b.y } });
    }, 250);
  });

  mainWindow.on('close', (e) => {
    if (!isQuitting && (liveState.playing || IS_MAC)) {
      e.preventDefault();
      mainWindow.hide();
      refreshTray();
    }
  });

  mainWindow.on('show', () => refreshTray());
  mainWindow.on('hide', () => refreshTray());
}

// Single-instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      refreshTray();
    }
  });

  app.whenReady().then(() => {
    settings = loadSettings();
    setupMacApplicationMenu();
    applyMacDockVisibility(Boolean(settings.hideDockIcon));
    createTray();
    createWindow();
  });
}

app.on('activate', () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
  } else {
    mainWindow.show();
    mainWindow.focus();
    refreshTray();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (!IS_MAC) {
    app.quit();
  }
});

// IPC Handlers
ipcMain.handle('widget:get-settings', () => settings);

ipcMain.handle('widget:update-settings', (_evt, patch) => {
  const allowed = {};
  for (const key of [
    'stationUrl',
    'stationPassword',
    'savedStations',
    'themeSelection',
    'volume',
    'muted',
    'alwaysOnTop',
    'hideDockIcon',
    'mode',
  ]) {
    if (key in (patch || {})) allowed[key] = patch[key];
  }
  const updated = saveSettings(allowed);
  if ('alwaysOnTop' in allowed) {
    applyAlwaysOnTop(mainWindow, Boolean(allowed.alwaysOnTop));
  }
  if ('hideDockIcon' in allowed) {
    applyMacDockVisibility(Boolean(allowed.hideDockIcon));
  }
  refreshTray();
  return updated;
});

ipcMain.handle('widget:set-view-mode', (_evt, targetMode) => {
  if (!['setup', 'card', 'themes', 'pill'].includes(targetMode)) return currentViewMode;
  if (targetMode === 'card' || targetMode === 'pill') {
    saveSettings({ mode: targetMode });
  }
  resizeForMode(targetMode);
  refreshTray();
  return currentViewMode;
});

ipcMain.handle('widget:window-action', (_evt, action) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (action === 'hide-to-tray') {
    mainWindow.hide();
    refreshTray();
  } else if (action === 'close') {
    if (liveState.playing || IS_MAC) {
      mainWindow.hide();
      refreshTray();
    } else {
      isQuitting = true;
      app.quit();
    }
  } else if (action === 'quit') {
    isQuitting = true;
    app.quit();
  } else if (action === 'context-menu') {
    const menu = Menu.buildFromTemplate(buildAppMenuTemplate());
    menu.popup({ window: mainWindow });
  }
});

ipcMain.on('widget:sync-state', (_evt, patch) => {
  liveState = { ...liveState, ...(patch || {}) };
  refreshTray();
});

ipcMain.handle('widget:open-external', (_evt, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
    shell.openExternal(url);
  }
});
