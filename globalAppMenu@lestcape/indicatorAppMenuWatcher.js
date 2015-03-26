// Copyright (C) 2014-2015 Lester Carballo Pérez <lestcape@gmail.com>
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License
// as published by the Free Software Foundation; either version 2
// of the License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program; if not, write to the Free Software
// Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Cinnamon = imports.gi.Cinnamon;

const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Signals = imports.signals;

const Main = imports.ui.main;
const Applet = imports.ui.applet;
const PopupMenu = imports.ui.popupMenu;

const AppletPath = imports.ui.appletManager.applets['globalAppMenu@lestcape'];
const Util = AppletPath.util;
const DBusMenu = AppletPath.dbusMenu;

const WATCHER_INTERFACE = 'com.canonical.AppMenu.Registrar';
const WATCHER_OBJECT = '/com/canonical/AppMenu/Registrar';

const AppmenuMode = {
    MODE_STANDARD: 0,
    MODE_UNITY: 1,
    MODE_UNITY_ALL_MENUS: 2
};

const stubs_blacklist = [
	/* Firefox */
	"/firefox.desktop",
	/* Thunderbird */
	"/thunderbird.desktop",
	/* Open Office */
	"/openoffice.org-base.desktop",
	"/openoffice.org-impress.desktop",
	"/openoffice.org-calc.desktop",
	"/openoffice.org-math.desktop",
	"/openoffice.org-draw.desktop",
	"/openoffice.org-writer.desktop",
	/* Blender */
	"/blender-fullscreen.desktop",
	"/blender-windowed.desktop",
	/* Eclipse */
	"/eclipse.desktop"
];

/*
 * The IndicatorAppMenuWatcher class implements the IndicatorAppMenu dbus object
 */
function IndicatorAppMenuWatcher(launcher, mode) {
    this._init(launcher, mode);
}

IndicatorAppMenuWatcher.prototype = {

    _init: function(launcher, mode) {
        this._init_enviroment();

        this._dbusImpl = Gio.DBusExportedObject.wrapJSObject(Util.DBusAppMenu, this);
        this._dbusImpl.export(Gio.DBus.session, WATCHER_OBJECT);
        this._everAcquiredName = false;
        this._ownName = Gio.DBus.session.own_name(WATCHER_INTERFACE,
                                  Gio.BusNameOwnerFlags.NONE,
                                  Lang.bind(this, this._acquiredName),
                                  Lang.bind(this, this._lostName));
        this._registered_windows = { };
        this._nameWatcher = { };

        this.mode = mode;
        this.launcher = null;
        this.set_launcher(launcher);

        this.tracker = Cinnamon.WindowTracker.get_default();

        this._register_all_windows();

        this.notify_workspaces_changed_id = global.screen.connect('notify::n-workspaces',
                                            Lang.bind(this, this._register_all_windows));
        this.windows_changed_id = global.screen.get_display().connect('notify::focus-window',
                                  Lang.bind(this, this._on_window_changed));
        this._on_window_changed();
    },

    _init_enviroment: function() {
        let is_ready = true;
        let env_gtk = GLib.getenv('GTK_MODULES');
        if(env_gtk) {
            if(env_gtk.indexOf("unity-gtk-module" ) == -1) {
                env_gtk += ":unity-gtk-module";
                GLib.setenv('GTK_MODULES', env_gtk, true);
                is_ready = false;
            }
        } else {
            env_gtk = "unity-gtk-module";
            GLib.setenv('GTK_MODULES', env_gtk. false);
            is_ready = false;
        }
        
        let env_ubu = GLib.getenv('UBUNTU_MENUPROXY');
        if(env_ubu != "1") {
            GLib.setenv('UBUNTU_MENUPROXY', "1", true);
            is_ready = false;
        }
        /*if((!is_ready) && (this._is_cinnamon_session_start())) {
            this._restart_nemo();
        }*/
        //log("Enviroment values: " + GLib.getenv('GTK_MODULES') + " " + GLib.getenv('UBUNTU_MENUPROXY'));
    },

    _is_cinnamon_session_start: function() {
        let string_file = this._readFile(GLib.get_home_dir() + "/.xsession-errors");
        return ((string_file) || (string_file.indexOf("About to start Cinnamon") == string_file.lastIndexOf("About to start Cinnamon")));
    },

    _restart_nemo: function() {
        //this._execCommand("nemo -q");
        //this._execCommand("nemo -n");//FIXME
        log("restart nemoooooooooooooo");
    },

    _readFile: function(path) {
        try {
            let file = Gio.file_new_for_path(path);
            if(file.query_exists(null))
            {
                let fstream = file.read(null);
                let dstream = new Gio.DataInputStream({ base_stream: fstream });
                let data = dstream.read_until("", null);
                fstream.close(null);
                return data.toString();
            }
        } catch(e) {
            Main.notifyError(_("Error:"), e.message);
        }
        return null;
    },

    _execCommand: function(command) {
        try {
            let [success, argv] = GLib.shell_parse_argv(command);
            this._trySpawnSync(argv);
            return true;
        } catch (e) {
            let title = _("Execution of '%s' failed:").format(command);
            Main.notifyError(title, e.message);
        }
        return false;
    },

    _trySpawnSync: function(argv) {
        try {   
            GLib.spawn_sync(null, argv, null,
                            GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.STDOUT_TO_DEV_NULL  | GLib.SpawnFlags.STDERR_TO_DEV_NULL,
                            null, null);
        } catch (err) {
            if (err.code == GLib.SpawnError.G_SPAWN_ERROR_NOENT) {
                err.message = _("Command not found.");
            } else {
                // The exception from gjs contains an error string like:
                //   Error invoking GLib.spawn_command_line_async: Failed to
                //   execute child process "foo" (No such file or directory)
                // We are only interested in the part in the parentheses. (And
                // we can't pattern match the text, since it gets localized.)
                err.message = err.message.replace(/.*\((.+)\)/, '$1');
            }
            throw err;
        }
    },

    _trySpawnAsync: function(argv) {
        try {   
            GLib.spawn_async(null, argv, null,
                             GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.STDOUT_TO_DEV_NULL  | GLib.SpawnFlags.STDERR_TO_DEV_NULL,
                             null, null);
        } catch (err) {
            if (err.code == GLib.SpawnError.G_SPAWN_ERROR_NOENT) {
                err.message = _("Command not found.");
            } else {
                // The exception from gjs contains an error string like:
                //   Error invoking GLib.spawn_command_line_async: Failed to
                //   execute child process "foo" (No such file or directory)
                // We are only interested in the part in the parentheses. (And
                // we can't pattern match the text, since it gets localized.)
                err.message = err.message.replace(/.*\((.+)\)/, '$1');
            }
            throw err;
        }
    },

    set_launcher: function(launcher) {
        this.launcher = launcher;
    },

    _acquiredName: function() {
        this._everAcquiredName = true;
        global.log('Acquired name ' + WATCHER_INTERFACE);
    },

    _lostName: function() {
        if (this._everAcquiredName)
            global.log('Lost name ' + WATCHER_INTERFACE);
        else
            global.logWarning('Failed to acquire ' + WATCHER_INTERFACE);
    },

    // create a unique index for the _items dictionary
    _getItemId: function(bus_name, obj_path) {
        return bus_name + obj_path;
    },

    get_appIndicator_by_id: function(id) {
        if (id in this._items)
            return this._items[id];
        return null;
    },

/* functions */
    RegisterWindowAsync: function(params, invocation) {
        let [windowId, menuObjectPath] = params;
        let wind = null;
        this._register_window_xid(windowId, wind, menuObjectPath, invocation.get_sender());
        //Main.notify('RegisterWindow: ' + windowId + " " + invocation.get_sender() + " " + menuObjectPath);
        this.EmitWindowRegistered(windowId, invocation.get_sender(), menuObjectPath);
        //let retval = GLib.Variant.new('(b)', [result]);
        //invocation.return_value(null);
        //this.EmitWindowUnregistered(windowId);
    },

    UnregisterWindowAsync: function(params, invocation) {
        let [windowId] = params;
        //Main.notify('UnregisterWindow: ' + windowId + " " + invocation.get_sender() + " " + menuObjectPath);
        this.EmitWindowUnregistered(windowId);
    },

    GetMenuForWindowAsync: function(params, invocation) {
        let [windowId] = params;
        //Main.notify('GetMenuForWindow: ' + params + " " + invocation.get_sender());
        let retval;
        if(windowId in this._registered_windows)
            retval = GLib.Variant.new('(so)', [this._registered_windows[xid].sender, this._registered_windows[xid].menuObjectPath]);
        else
            retval = [];
        invocation.return_value(retval);
    },

    GetMenusAsync: function(params, invocation) {
        //Main.notify('GetMenus: ' + params + " " + invocation.get_sender());
        let result = [];
        for(let xid in this._registered_windows) {
            result.push([xid, this._registered_windows[xid].sender, this._registered_windows[xid].menuObjectPath]);
        }
        let retval = GLib.Variant.new('(a(uso))', result);
        invocation.return_value(retval);
    },

/* Signals */
    EmitWindowRegistered: function(windowId, service, menuObjectPath) {
        this._dbusImpl.emit_signal('WindowRegistered', GLib.Variant.new('(uso)', [windowId, service, menuObjectPath]));
        //Main.notify('EmitWindowRegistered: ' + windowId + " " + service + " " + menuObjectPath);
    },

    EmitWindowUnregistered: function(windowId) {
        this._dbusImpl.emit_signal('WindowUnregistered', GLib.Variant.new('(u)', windowId));
        //Main.notify('EmitWindowUnregistered: ' + windowId);
    },

    //async because we may need to check the presence of a menubar object as well as the creation is async.
    _get_menu_client: function(xid, callback) {
        if(xid in this._registered_windows) {
            var sender = this._registered_windows[xid].sender;
            var path = this._registered_windows[xid].menuObjectPath;
            var is_gtk = this._registered_windows[xid].isGtk;
            if((sender != "")&&(path != "")) {
                if(!is_gtk) {
                    this._validateMenu(sender, path, function(r, name, path) {
                        if (r) {
                            global.log("creating menu on "+[name, path]);
                            callback(xid, new DBusMenu.Client(name, path, is_gtk));
                        } else {
                            callback(xid, null);
                        }
                    });
                } else {
                    callback(xid, new DBusMenu.Client(sender, path, is_gtk));
                }
            } else {
                callback(xid, null);
            }
        } else {
            callback(xid, null);
        }
    },

    _on_menu_client_ready: function(xid, client) {
        if ((client != null) && (this.launcher)) {
            let menu = new Applet.AppletPopupMenu(this.launcher, this.launcher.orientation);
            menu.actor.add_style_class_name('menu-background');
            let menuManager = new PopupMenu.PopupMenuManager(this.launcher);
            menuManager.addMenu(menu);
            client.attachToMenu(menu);
            menu._client = client;
            menu._manager = menuManager;
            this._registered_windows[xid].appMenu = menu;
            if(!this._registered_windows[xid].windows) {
                this._register_all_windows();
            }
            if (this._guess_Window_XID(global.display.focus_window) == xid)
                this._on_window_changed();
        }
    },

    _validateMenu: function(bus, path, callback) {
        Gio.DBus.session.call(
            bus, path, "org.freedesktop.DBus.Properties", "Get",
            GLib.Variant.new("(ss)", ["com.canonical.dbusmenu", "Version"]),
            GLib.VariantType.new("(v)"), Gio.DBusCallFlags.NONE, -1, null, function(conn, result) {
                try {
                    var val = conn.call_finish(result);
                } catch (e) {
                    global.logWarning("Invalid menu: "+e);
                    return callback(false);
                }
                var version = val.deep_unpack()[0].deep_unpack();
                //fixme: what do we implement?
                if (version >= 2) {
                    return callback(true, bus, path);
                } else {
                    global.logWarning("Incompatible dbusmenu version: "+version);
                    return callback(false);
                }
            }, null
        );
    },

    _register_all_windows: function () {
        for(let index = 0; index < global.screen.n_workspaces; index++) {
            let metaWorkspace = global.screen.get_workspace_by_index(index);
            let win_list = metaWorkspace.list_windows();
            // For each window, let's make sure we add it!
            for(let pos in win_list) {
                let wind = win_list[pos];
                let xid = this._guess_Window_XID(wind);
                if(xid)
                    this._register_window_xid(xid, wind);
            }
        }
    },

    _register_window_xid: function(xid, wind, menuPath, sender_dbus) {
      try {
        let appT = null;
        let is_gtk = false;
        if(wind) {
            appT = this.tracker.get_window_app(wind);
            if((!menuPath)||(!sender_dbus)) {
                //get_gtk_menubar_object_path(); get_gtk_app_menu_object_path();
                let menu_object_path = wind.get_gtk_menubar_object_path();
                let unique_bus_name = wind.get_gtk_unique_bus_name();
                if((menu_object_path)&&(unique_bus_name)) {
                    menuPath = menu_object_path;
                    sender_dbus = unique_bus_name;
                    is_gtk = true;
                }
            }
        }
        if(!menuPath) menuPath = "";
        if(!sender_dbus) sender_dbus = "";

        if (xid in this._registered_windows) {
            /*if ((menuPath != "") && (this._registered_windows[xid].menuObjectPath != "") && (this._registered_windows[xid].menuObjectPath != menuPath))
                Main.notify("Wrong menuPath");
            if ((sender_dbus != "") && (this._registered_windows[xid].sender != "") && (this._registered_windows[xid].sender != sender_dbus))
                Main.notify("Wrong sender");
            if ((appT != null) && (this._registered_windows[xid].application != null) && (this._registered_windows[xid].application != appT))
                Main.notify("Wrong application");
            if ((wind != null) && (this._registered_windows[xid].window != null) && (this._registered_windows[xid].window != wind))
                Main.notify("Wrong window");*/

            //this._registered_windows[xid].menuObjectPath = menuPath;
            //this._registered_windows[xid].sender = sender_dbus;
            if(menuPath != "")
                this._registered_windows[xid].menuObjectPath = menuPath;
            if(sender_dbus != "")
                this._registered_windows[xid].sender = sender_dbus;
            if(appT)
                this._registered_windows[xid].application = appT;
            if(wind)
                this._registered_windows[xid].window = wind;
        } else {
            this._registered_windows[xid] = {
                window: wind,
                application: appT,
                menuObjectPath: menuPath,
                sender: sender_dbus,
                isGtk: is_gtk,
                appMenu: null
            };
        }
        if ((this.launcher) && (xid in this._registered_windows) && (!this._registered_windows[xid].appMenu)) {
            if ((this._registered_windows[xid].menuObjectPath != "") && (this._registered_windows[xid].sender != "")) {
                this._get_menu_client(xid, Lang.bind(this, this._on_menu_client_ready));
            } else if ((this._registered_windows[xid].menuObjectPath == "") || (this._registered_windows[xid].sender == "")) {
                //_GTK_MENUBAR_OBJECT_PATH _GTK_MENUBAR_OBJECT_PATH
                let terminal = new TerminalReader("xprop -id " + xid + " -notype _GTK_UNIQUE_BUS_NAME && " +
                                                  "xprop -id " + xid + " -notype _GTK_MENUBAR_OBJECT_PATH",
                                                  Lang.bind(this, this._on_terminal_read));
                terminal.executeReader();
            } 
        }
      }catch(e){Main.notify(e.message);}
    },

    _on_terminal_read: function(command, sucess, result) {
        if(sucess) {
            let sender_dbus = "";
            let menuPath = "";
            let xid = parseInt(command.substring(10, command.indexOf(" -notype")));
            let lines = result.split("\n");
            let obj_keys = { "_GTK_UNIQUE_BUS_NAME":"", "_GTK_MENUBAR_OBJECT_PATH":"" };
            if(this._get_values(lines, obj_keys)) {
                this._registered_windows[xid].menuObjectPath = obj_keys["_GTK_MENUBAR_OBJECT_PATH"];
                this._registered_windows[xid].sender = obj_keys["_GTK_UNIQUE_BUS_NAME"];
                this._registered_windows[xid].isGtk = true;
                this._get_menu_client(xid, Lang.bind(this, this._on_menu_client_ready));
            }
        }
    },

    _get_values: function(lines, obj_keys) {
        let line_index = 0;
        let result = true;
        let index;
        for (let key in obj_keys) {
            if(line_index < lines.length) {
                index = lines[line_index].indexOf(key + " = ");
                if(index == 0)
                    obj_keys[key] = lines[0].substring(key.length + 4, lines[0].length-1);
                else
                    result = false;
            }
        }
        return result;
    },

    get_menu_for_window: function(wind) {
        let xid = this._guess_Window_XID(wind);
        if((xid) && (xid in this._registered_windows))
            return this._registered_windows[xid].appMenu;
        return null;
    },

    get_app_for_window: function(wind) {
        let xid = this._guess_Window_XID(wind);
        if((xid) && (xid in this._registered_windows))
            return this._registered_windows[xid].application;
        return null;
    },

    _on_window_changed: function() {
        let wind = null;
        let xid = this._guess_Window_XID(global.display.focus_window);
        if((xid) && (!(xid in this._registered_windows) || (!this._registered_windows[xid].appMenu))) {
            this._register_all_windows();
        }
        if(xid in this._registered_windows)
            wind = this._registered_windows[xid].window;
        this.emit('on_appmenu_changed', wind);
    },

    // NOTE: we prefer to use the window's XID but this is not stored
    // anywhere but in the window's description being [XID (%10s window title)].
    // And I'm not sure I want to rely on that being the case always.
    // (mutter/src/core/window-props.c)
    //
    // If we use the windows' title, `xprop` grabs the "least-focussed" window
    // (bottom of stack I suppose).
    //
    // Can match winow.get_startup_id() to WM_WINDOW_ROLE(STRING)
    // If they're not equal, then try the XID ?
    _guess_Window_XID: function (wind) {
        if (!wind)
            return null;

        let id = null;
        // if window title has non-utf8 characters, get_description() complains
        // "Failed to convert UTF-8 string to JS string: Invalid byte sequence in conversion input",
        // event though get_title() works.
        if (wind.get_xwindow)
            return wind.get_xwindow();
        try {
            id = wind.get_description().match(/0x[0-9a-f]+/);
            if (id) {
                return parseInt(id[0], 16);
            }
        } catch (err) {
        }

        // use xwininfo, take first child.
        let act = wind.get_compositor_private();
        if (act) {
            id = GLib.spawn_command_line_sync('xwininfo -children -id 0x%x'.format(act['x-window']));
            if (id[0]) {
                let str = id[1].toString();

                // The X ID of the window is the one preceding the target window's title.
                // This is to handle cases where the window has no frame and so
                // act['x-window'] is actually the X ID we want, not the child.
                let regexp = new RegExp('(0x[0-9a-f]+) +"%s"'.format(wind.title));
                id = str.match(regexp);
                if (id) {
                    return parseInt(id[1], 16);
                }

                // Otherwise, just grab the child and hope for the best
                id = str.split(/child(?:ren)?:/)[1].match(/0x[0-9a-f]+/);
                if (id) {
                    return parseInt(id[0], 16);
                }
            }
        }
        // debugging for when people find bugs..
        log("[maximus]: Could not find XID for window with title %s".format(wind.title));
        return null;
    }

/*
    RegisterStatusNotifierItemAsync: function(params, invocation) {
        // it would be too easy if all application behaved the same
        // instead, ayatana patched gnome apps to send a path
        // while kde apps send a bus name
        let service = params[0];
        let bus_name, obj_path;
        //if (service.charAt(0) == '/') { // looks like a path
            bus_name = invocation.get_sender();
            obj_path = service;
        //} else { // we hope it is a bus name
        //    bus_name = service;
        //    obj_path = ITEM_OBJECT;
        //}

        let id = this._getItemId(bus_name, obj_path);

        if(this._items[id]) {
            //delete the old one and add the new indicator
            global.logWarning("Attempting to re-register "+id+"; resetting instead");
            this._items[id].reset();
        } else {
            global.log("registering "+id+" for the first time.");
            this._items[id] = new AppIndicator.AppIndicator(bus_name, obj_path);
            this._dbusImpl.emit_signal('ServiceRegistered', GLib.Variant.new('(s)', service));
            this._nameWatcher[id] = Gio.DBus.session.watch_name(bus_name, Gio.BusNameWatcherFlags.NONE, null,
                                        Lang.bind(this, this._itemVanished));
            this.emit('on_indicator_dispatch', id);
            this._dbusImpl.emit_property_changed('RegisteredStatusNotifierItems',
                GLib.Variant.new('as', this.RegisteredStatusNotifierItems));
            global.log("done registering");
        }
        invocation.return_value(null);
    },

    _itemVanished: function(proxy, bus_name) {
        // FIXME: this is useless if the path name disappears while the bus stays alive (not unheard of)
        for (var i in this._items) {
            if (i.indexOf(bus_name) == 0) {
                this._remove(i);
            }
        }
    },

    _remove: function(id) {
        this._items[id].destroy();
        delete this._items[id];
        Gio.DBus.session.unwatch_name(this._nameWatcher[id]);
        delete this._nameWatcher[id];
        this._dbusImpl.emit_signal('ServiceUnregistered', GLib.Variant.new('(s)', id));
        this._dbusImpl.emit_property_changed('RegisteredStatusNotifierItems', GLib.Variant.new('as', this.RegisteredStatusNotifierItems));
    },

    RegisterNotificationHost: function(service) {
        throw new Gio.DBusError('org.gnome.Shell.UnsupportedMethod',
                        'Registering additional notification hosts is not supported');
    },

    IsNotificationHostRegistered: function() {
        return true;
    },

    ProtocolVersion: function() {
        // "The version of the protocol the StatusNotifierWatcher instance implements." [sic]
        // in what syntax?
        return "%s/%s (KDE; compatible; mostly) Cinnamon/%s".format("globalAppMenu@lestcape", "0.1", CinnamonConfig.PACKAGE_VERSION);
    },

    get RegisteredStatusNotifierItems() {
        return Object.keys(this._items);
    },

    get IsStatusNotifierHostRegistered() {
        return true;
    },

    destroy: function() {
        if (!this._isDestroyed) {
            // this doesn't do any sync operation and doesn't allow us to hook up the event of being finished
            // which results in our unholy debounce hack (see extension.js)
            Gio.DBus.session.unown_name(this._ownName);
            this._dbusImpl.unexport();
            for (var i in this._nameWatcher) {
                Gio.DBus.session.unwatch_name(this._nameWatcher[i]);
            }
            delete this._nameWatcher;
            for (var i in this._items) {
                this._items[i].destroy();
            }
            delete this._items;
            this._isDestroyed = true;
        }
    }*/
};
Signals.addSignalMethods(IndicatorAppMenuWatcher.prototype);


function TerminalReader(command, callback) {
   this._init(command, callback);
}

TerminalReader.prototype = {
   _init: function(command, callback) {
      this._callbackPipe = callback;
      this._commandPipe = command;
      this.idle = true;
      this._childWatch = null;
   },

   executeReader: function() {
      if(this.idle) {
         this.idle = false;
         try {
            let [success, argv] = GLib.shell_parse_argv("sh -c '" + this._commandPipe + "'");
            if(success) {
               let [exit, pid, stdin, stdout, stderr] =
                    GLib.spawn_async_with_pipes(null, /* cwd */
                                                argv, /* args */
                                                null, /* env */
                                                GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD, /*Use env path and no repet*/
                                                null /* child_setup */);

               this._childPid = pid;
               this._stdin = new Gio.UnixOutputStream({ fd: stdin, close_fd: true });
               this._stdout = new Gio.UnixInputStream({ fd: stdout, close_fd: true });
               this._stderr = new Gio.UnixInputStream({ fd: stderr, close_fd: true });
         
               // We need this one too, even if don't actually care of what the process
               // has to say on stderr, because otherwise the fd opened by g_spawn_async_with_pipes
               // is kept open indefinitely
               this._stderrStream = new Gio.DataInputStream({ base_stream: this._stderr });
               this._dataStdout = new Gio.DataInputStream({ base_stream: this._stdout });
               this._cancellableStderrStream = new Gio.Cancellable();
               this._cancellableStdout = new Gio.Cancellable();

               this.resOut = 1;
               this._readStdout();
               this.resErr = 1;
               this._readStderror();

               this._childWatch = GLib.child_watch_add(GLib.PRIORITY_DEFAULT, pid, Lang.bind(this, function(pid, status, requestObj) {
                  GLib.source_remove(this._childWatch);
                  this._childWatch = null;
                  this._stdin.close(null);
                  this.idle = true;
               }));
            }
            //throw
         } catch(err) {
            if (err.code == GLib.SpawnError.G_SPAWN_ERROR_NOENT) {
               err.message = _("Command not found.");
            } else {
               // The exception from gjs contains an error string like:
               //   Error invoking GLib.spawn_command_line_async: Failed to
               //   execute child process "foo" (No such file or directory)
               // We are only interested in the part in the parentheses. (And
               // we can't pattern match the text, since it gets localized.)
               err.message = err.message.replace(/.*\((.+)\)/, '$1');
            }
            throw err;
         }
      }
   },

   destroy: function() {
      try {
         if(this._childWatch) {
            GLib.source_remove(this._childWatch);
            this._childWatch = null;
         }
         if(!this._dataStdout.is_closed()) {
            this._cancellableStdout.cancel();
            this._stdout.close_async(0, null, Lang.bind(this, this.closeStdout));
         }
         if(!this._stderrStream.is_closed()) {
            this._cancellableStderrStream.cancel();
            this._stderrStream.close_async(0, null, Lang.bind(this, this.closeStderrStream));
         }
         this._stdin.close(null);
         this.idle = true;
      }
      catch(e) {
         Main.notify("Error on close" + this._dataStdout.is_closed(), e.message);
      }
   },

   closeStderrStream: function(std, result) {
      try {
        std.close_finish(result);
      } catch(e) {
         std.close_async(0, null, Lang.bind(this, this.closeStderrStream));
      }
   },

   closeStdout: function(std, result) {
      try {
        std.close_finish(result);
      } catch(e) {
         std.close_async(0, null, Lang.bind(this, this.closeStderrStream));
      }
   },

   _readStdout: function() {
      this._dataStdout.fill_async(-1, GLib.PRIORITY_DEFAULT, this._cancellableStdout, Lang.bind(this, function(stream, result) {
         try {
            if(!this._dataStdout.is_closed()) {
               if(this.resOut != -1)
                  this.resOut = this._dataStdout.fill_finish(result);// end of file
               if(this.resOut == 0) {
                  let val = stream.peek_buffer().toString();
                  if(val != "")
                     this._callbackPipe(this._commandPipe, true, val);
                  this._stdout.close(this._cancellableStdout);
               } else {
                  // Try to read more
                  this._dataStdout.set_buffer_size(2 * this._dataStdout.get_buffer_size());
                  this._readStdout();
               }
            }
         } catch(e) {
            global.log(e.toString());
         }
      }));
   },

   _readStderror: function() {
      this._stderrStream.fill_async(-1, GLib.PRIORITY_DEFAULT, this._cancellableStderrStream, Lang.bind(this, function(stream, result) {
         try {
            if(!this._stderrStream.is_closed()) {
               if(this.resErr != -1)
                  this.resErr = this._stderrStream.fill_finish(result);
               if(this.resErr == 0) { // end of file
                  let val = stream.peek_buffer().toString();
                  if(val != "")
                     this._callbackPipe(this._commandPipe, false, val);
                  this._stderr.close(null);
               } else {
                  this._stderrStream.set_buffer_size(2 * this._stderrStream.get_buffer_size());
                  this._readStderror();
               }
            }
         } catch(e) {
            global.log(e.toString());
         }
      }));
   }
};
