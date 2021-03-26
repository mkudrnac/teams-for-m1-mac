
const { app, shell, BrowserWindow, Menu } = require('electron');
const WindowStateManager = require('electron-window-state-manager');
const path = require('path');
const login = require('../login');
const iconPath = path.join(__dirname, '..', 'assets', 'icons', 'icon-96x96.png');
const customCSS = require('../customCSS');
const Menus = require('../menus');
const notifications = require('../notifications');
const onlineOffline = require('../onlineOffline');

let aboutBlankRequestCount = 0;
let window = null;
const mainWindowState = new WindowStateManager('mainWindow', {
	defaultWidth: 1200,
	defaultHeight: 800,
});

exports.onAppReady = function onAppReady() {
	const { session } = require('electron')
	session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
		callback({
			responseHeaders: Object.assign({
				"Content-Security-Policy": ["default-src 'self'"]
			}, details.responseHeaders)
		});
	});

	window = createWindow();
	// new Menus(window, config, iconPath);

	window.on('page-title-updated', (event, title) => {
		window.webContents.send('page-title', title);
	});

	if (config.enableDesktopNotificationsHack) {
		notifications.addDesktopNotificationHack(iconPath);
	}

	window.webContents.on('new-window', onNewWindow);

	window.webContents.session.webRequest.onBeforeRequest(onBeforeRequestHandler);

	login.handleLoginDialogTry(window);
	if (config.onlineOfflineReload) {
		onlineOffline.reloadPageWhenOfflineToOnline(window, config.url);
	}

	window.webContents.setUserAgent(config.chromeUserAgent);

	if (!config.minimized) {
		window.once('ready-to-show', () => window.show());
	}

	window.webContents.on('did-finish-load', () => {
		console.log('did-finish-load');
		window.webContents.executeJavaScript(`
			openBrowserButton = document.getElementById('openTeamsClientInBrowser');
			openBrowserButton && openBrowserButton.click();
		`);
		window.webContents.executeJavaScript(`
			tryAgainLink = document.getElementById('try-again-link');
			tryAgainLink && tryAgainLink.click()
		`);
		customCSS.onDidFinishLoad(window.webContents);
	});

	const url = processArgs(process.argv);
	window.loadURL(url ? url : config.url);

	if (config.webDebug) {
		window.openDevTools();
	}

	window.on('close', (event) => {
		console.log('close ' + app.quitting);
		mainWindowState.saveState(window);
		if (app.quitting) {
			window = null;
		} else {
			event.preventDefault();
			window.hide();
		}
	});
	app.on('activate', () => {
		console.log('activate');
		window.show()
	});
	app.on('window-all-closed', () => {
		console.log('window-all-closed');
		if (process.platform !== 'darwin') {
			app.quit();
		}
	});
	app.on('before-quit', () => {
		console.log('before-quit');
		app.quitting = true
	});
};

exports.onAppSecondInstance = function onAppSecondInstance(event, args) {
	console.log('second-instance started');
	let allowFurtherRequests = true;
	if (window) {
		event.preventDefault();
		const url = processArgs(args);
		if (url && allowFurtherRequests) {
			allowFurtherRequests = false;
			setTimeout(() => { allowFurtherRequests = true; }, 10000);
		} else {
			if (window.isMinimized()) window.restore();
			window.focus();
		}
	}
};

function processArgs(args) {
	console.debug('processArgs', args);
	for (const arg of args) {
		if (arg.startsWith('https://teams.microsoft.com/l/meetup-join/')) {
			console.log('meetup-join argument received with https protocol');
			window.show();
			return arg;
		}
		if (arg.startsWith('msteams:/l/meetup-join/')) {
			console.log('meetup-join argument received with msteams protocol');
			window.show();
			return config.url + arg.substring(8, arg.length);
		}
	}
}

function onBeforeRequestHandler(details, callback) {
	// Check if the counter was incremented
	if (aboutBlankRequestCount < 1) {
		// Proceed normally
		callback({});
	} else {
		// Open the request externally
		console.debug('DEBUG - webRequest to  ' + details.url + ' intercepted!');
		shell.openExternal(details.url);
		// decrement the counter
		aboutBlankRequestCount -= 1;
		callback({ cancel: true });
	}
}

function onNewWindow(event, url, frame, disposition, options) {
	console.log('onNewWindow');
	if (url.startsWith('https://teams.microsoft.com/l/meetup-join')) {
		event.preventDefault();
	} else if (url === 'about:blank') {
		event.preventDefault();
		// Increment the counter
		aboutBlankRequestCount += 1;
		// Create a new hidden window to load the request in the background
		console.debug('DEBUG - captured about:blank');
		const win = new BrowserWindow({
			webContents: options.webContents, // use existing webContents if provided
			show: false
		});

		// Close the new window once it is done loading.
		win.once('ready-to-show', () => win.close());

		event.newGuest = win;
	} else if (disposition !== 'background-tab') {
		event.preventDefault();
		shell.openExternal(url);
	}
}

function createWindow() {
	// Create the window
	const window = new BrowserWindow({
		x: mainWindowState.x,
		y: mainWindowState.y,

		width: mainWindowState.width,
		height: mainWindowState.height,
		backgroundColor: '#fff',

		show: false,
		autoHideMenuBar: true,
		icon: iconPath,

		webPreferences: {
			partition: config.partition,
			preload: path.join(__dirname, '..', 'browser', 'index.js'),
			nativeWindowOpen: true,
			plugins: true,
			nodeIntegration: false,
			allowRunningInsecureContent: true,
			allowFurtherRequests: true,
		},
	});

	return window;
}
