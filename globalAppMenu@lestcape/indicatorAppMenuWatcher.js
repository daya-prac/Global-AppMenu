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
//const Gtk = imports.gi.Gtk;
const Gdk = imports.gi.Gdk;
//const GdkX11 = imports.gi.GdkX11; 

const Lang = imports.lang;
const Signals = imports.signals;

const Main = imports.ui.main;

const AppletPath = imports.ui.appletManager.applets['globalAppMenu@lestcape'];
const Utility = AppletPath.utility;
const DBusMenu = AppletPath.dbusMenu;

const WATCHER_INTERFACE = 'com.canonical.AppMenu.Registrar';
const WATCHER_OBJECT = '/com/canonical/AppMenu/Registrar';

const AppmenuMode = {
    MODE_STANDARD: 0,
    MODE_UNITY: 1,
    MODE_UNITY_ALL_MENUS: 2
};

const logName = "Indicator AppMenu Whatcher. ";

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
function IndicatorAppMenuWatcher() {
    this._init.apply(this, arguments);
}

IndicatorAppMenuWatcher.prototype = {

    _init: function(mode, icon_size) {
        this._registered_windows = { };
        this._nameWatcher = { };

        this._mode = mode;
        this._last_xid = 0;
        this._isDestroyed = false;
        this._icon_size = icon_size;
        this._init_enviroment();

        this._dbusImpl = Gio.DBusExportedObject.wrapJSObject(Utility.DBusRegistrar, this);
        this._dbusImpl.export(Gio.DBus.session, WATCHER_OBJECT);
        this._everAcquiredName = false;
        this._ownName = Gio.DBus.session.own_name(WATCHER_INTERFACE,
                                  Gio.BusNameOwnerFlags.NONE,
                                  Lang.bind(this, this._acquiredName),
                                  Lang.bind(this, this._lostName));
  
        this._tracker = Cinnamon.WindowTracker.get_default();
        this._tracker_windows_changed_id = this._tracker.connect('tracked-windows-changed',
                                           Lang.bind(this, this._updateWindowList));

        this._register_all_windows();

        this._notify_workspaces_changed_id = global.screen.connect('notify::n-workspaces',
                                             Lang.bind(this, this._register_all_windows));
        this._windows_changed_id = global.screen.get_display().connect('notify::focus-window',
                                  Lang.bind(this, this._on_window_changed));
        this._on_window_changed();
    },

    _init_enviroment: function() {
        this.system = Utility.system;
        this.system.set_shell_shows_appmenu(true);
        this.system.set_shell_shows_menubar(true);
        this.system.active_unity_menu_proxy(true);
        let is_ready_unity_gtk_module = this.system.active_unity_gtk_module(true);
        if(!is_ready_unity_gtk_module)
            Main.notify("You need restart your computer: " + is_ready_unity_gtk_module);
        //FIXME this is not working and cause nemo to crash
        //let gtk_settings = Gtk.Settings.get_default();
        //gtk_settings.set_property('gtk-shell-shows-menubar', true);
        //let att_id = GdkX11.x11_get_xatom_by_name("_MOTIF_WM_HINTS");
        //let atom = GdkX11.x11_xatom_to_atom(att_id);
        //let atom = Gdk.Atom.intern("_MOTIF_WM_HINTS", false);
        //Main.notify("eso  " + atom);
        //log("Enviroment values: " + GLib.getenv('GTK_MODULES') + " " + GLib.getenv('UBUNTU_MENUPROXY') + " " + gtk_settings.gtk_shell_shows_menubar);
    },
/*

        this._cinnamonwm = global.window_manager;
        this._cinnamonwm.connect('minimize', Lang.bind(this, this._minimizeWindow));
        this._cinnamonwm.connect('maximize', Lang.bind(this, this._maximizeWindow));
        this._cinnamonwm.connect('unmaximize', Lang.bind(this, this._unmaximizeWindow));
        this._cinnamonwm.connect('tile', Lang.bind(this, this._maximizeWindow));
        this._last_wind = null;
    },

    _minimizeWindow: function(cinnamonwm, actor) {
      // Main.notify("minimize")
    },

    _maximizeWindow: function(cinnamonwm, actor) {
        try {
        log("enter _maximizeWindow");
        let xid = this._guess_window_xid(global.display.focus_window);
        if((xid in this._registered_windows)) {//&&(this._registered_windows[xid].appmenu)) {
           //if(this._last_wind)
           //    this._last_wind.unmaximize();
           //let screen = Gdk.Screen.get_default();
           let screen = global.gdk_screen;
           let gdk_win = screen.get_active_window();
           if (gdk_win) {
               gdk_win.set_decorations(Gdk.WMDecoration.BORDER);
               let [x, y] = gdk_win.get_position();
               //gdk_win.move_resize(0, 0, gdk_win.get_width() + x, gdk_win.get_height() + y);
               this._last_wind_w = gdk_win.get_width();
               this._last_wind_h = gdk_win.get_height();
               this._last_wind_x = x;
               this._last_wind_y = y;
               gdk_win.move(0,0);
               gdk_win.resize(this._last_wind_w + x, this._last_wind_h + y);
               gdk_win.process_all_updates();
               //gdk_win.resize(this._last_wind_x, this._last_wind_y);
               //global.gdk_screen.get_display().sync();
               //gdk_win.unref();
              // gdk_win.show();

               //Main.notify("maximize");
           }
           //this.oldFullscreenPref = Meta.prefs_get_force_fullscreen();
           //Meta.prefs_set_force_fullscreen(false);
        }
        } catch(e) {Main.notify("er1 " + e.message)}
    },

    _unmaximizeWindow : function(cinnamonwm, actor) {
        try {
        log("enter _unmaximizeWindow");
        let xid = this._guess_window_xid(global.display.focus_window);
        if((xid in this._registered_windows)) {//&&(this._registered_windows[xid].appmenu)) {
           //let screen = Gdk.Screen.get_default();
           let screen = global.gdk_screen;
           let gdk_win = screen.get_active_window();
           if (gdk_win) {
              gdk_win.set_decorations(Gdk.WMDecoration.ALL);
              gdk_win.process_all_updates();
              //gdk_win.unref();
              //global.gdk_screen.get_display().sync();
           }
           //Meta.prefs_set_force_fullscreen(this.oldFullscreenPref);
        }
        } catch(e) {Main.notify("er1 " + e.message)}
    },

    _list_meta: function(xid) {
        //global->ibus_window
        //if(actor.meta_window.get_window_type() == Meta.WindowType.NORMAL)
        //[ok, decorations] = gdk_win.get_decorations();
        //actor.get_meta_window();
        ///Meta.enable_unredirect_for_screen(global.screen);
        ///Meta.disable_unredirect_for_screen(global.screen);
        //let windows = [];
        //let windowActors = global.get_window_actors();
        //for (let i in windowActors) {
            //Main.notify(""+windowActors[i])
        //    windows.push(windowActors[i].get_meta_window());
            //Main.notify(""+windowActors[i].get_meta_window().get_wm_class())  the app name.
        //}
        //let att_id = GdkX11.x11_get_xatom_by_name("_MOTIF_WM_HINTS");
        //let atom = GdkX11.x11_xatom_to_atom(att_id);
        //let atom = Gdk.Atom.intern("_MOTIF_WM_HINTS", false);
        //Main.notify("eso  " + atom);
        //log("Enviroment values: " + GLib.getenv('GTK_MODULES') + " " +
        //  GLib.getenv('UBUNTU_MENUPROXY') + " " + gtk_settings.gtk_shell_shows_menubar);
    },
    */

    _acquiredName: function() {
        this._everAcquiredName = true;
        global.log(logName + "Acquired name " + WATCHER_INTERFACE);
    },

    _lostName: function() {
        if (this._everAcquiredName)
            global.log(logName + "Lost name " + WATCHER_INTERFACE);
        else
            global.logWarning(logName + "Failed to acquire " + WATCHER_INTERFACE);
    },

/* functions */
    RegisterWindowAsync: function(params, invocation) {
        let [windowId, menubarObjectPath] = params;
        let wind = null;
        this._register_window_xid(windowId, wind, menubarObjectPath, invocation.get_sender());
        //Main.notify('RegisterWindow: ' + windowId + " " + invocation.get_sender() + " " + menubarObjectPath);
        this.EmitWindowRegistered(windowId, invocation.get_sender(), menubarObjectPath);
        //let retval = GLib.Variant.new('(b)', [result]);
        //invocation.return_value(null);
        //this.EmitWindowUnregistered(windowId);
    },

    UnregisterWindowAsync: function(params, invocation) {
        let [windowId] = params;
        //Main.notify('UnregisterWindow: ' + windowId + " " + invocation.get_sender() + " " + menubarObjectPath);
        this.EmitWindowUnregistered(windowId);
    },

    GetMenuForWindowAsync: function(params, invocation) {
        let [windowId] = params;
        //Main.notify('GetMenuForWindow: ' + params + " " + invocation.get_sender());
        let retval;
        if(windowId in this._registered_windows)
            retval = GLib.Variant.new('(so)', [this._registered_windows[xid].sender, this._registered_windows[xid].menubarObjectPath]);
        else
            retval = [];
        invocation.return_value(retval);
    },

    GetMenusAsync: function(params, invocation) {
        //Main.notify('GetMenus: ' + params + " " + invocation.get_sender());
        let result = [];
        for(let xid in this._registered_windows) {
            result.push([xid, this._registered_windows[xid].sender, this._registered_windows[xid].menubarObjectPath]);
        }
        let retval = GLib.Variant.new('(a(uso))', result);
        invocation.return_value(retval);
    },

/* Signals */
    EmitWindowRegistered: function(windowId, service, menubarObjectPath) {
        this._dbusImpl.emit_signal('WindowRegistered', GLib.Variant.new('(uso)', [windowId, service, menubarObjectPath]));
        //Main.notify('EmitWindowRegistered: ' + windowId + " " + service + " " + menubarObjectPath);
    },

    EmitWindowUnregistered: function(windowId) {
        this._dbusImpl.emit_signal('WindowUnregistered', GLib.Variant.new('(u)', [windowId]));
        //Main.notify('EmitWindowUnregistered: ' + windowId);
    },

    //async because we may need to check the presence of a menubar object as well as the creation is async.
    _get_menu_client: function(xid, callback) {
        if(xid in this._registered_windows) {
            var sender = this._registered_windows[xid].sender;
            var path = this._registered_windows[xid].menubarObjectPath;
            var is_gtk = this._registered_windows[xid].isGtk;
            if((sender != "")&&(path != "")) {
                if(!is_gtk) {
                    this._validateMenu(sender, path, Lang.bind(this, function(r, name, path) {
                        if (r) {
                            if(!this._registered_windows[xid].appMenu) {
                                //Main.notify("no " + this._registered_windows[xid].window.title)
                                global.log(logName + "Creating menu on " + [name, path]);
                                callback(xid, new DBusMenu.DBusClient(name, path));
                            } else {
                                callback(xid, null);
                            }
                        } else {
                            callback(xid, null);
                        }
                    }));
                } else {
                    if(!this._registered_windows[xid].appMenu) {
                        //Main.notify("si " + this._registered_windows[xid].window.title + " " + path + " " + this._registered_windows[xid].appmenuObjectPath)
                        global.log(logName + "Creating menu on "+[sender, path]);
                        callback(xid, new DBusMenu.DBusClientGtk(sender, path));
                    } else {
                        callback(xid, null);
                    }
                }
            } else {
                callback(xid, null);
            }
        } else {
            callback(xid, null);
        }
    },

    _on_menu_client_ready: function(xid, client) {
        if (client != null) {
            this._registered_windows[xid].appMenu = client;
            if(!this._registered_windows[xid].window) {
                this._register_all_windows();
            }
            if (this._guess_window_xid(global.display.focus_window) == xid)
                this._on_window_changed();
            let root = client.get_root();
            root.connectAndRemoveOnDestroy({
                'childs-empty'   : Lang.bind(this, this._on_menu_empty, xid),
                'destroy'        : Lang.bind(this, this._on_menu_destroy, xid)
            });
        }
    },

    _on_menu_empty: function(root, xid) {
        //we don't have alternatives now, so destroy the appmenu.
        this._on_menu_destroy(root, xid);
    },

    _on_menu_destroy: function(root, xid) {
        if((xid) && (xid in this._registered_windows)) {
            let appMenu = this._registered_windows[xid].appMenu;
            this._registered_windows[xid].appMenu = null;
            if(appMenu) appMenu.destroy();
            this.EmitWindowUnregistered(parseInt(xid));
            if(this._last_xid == xid)
                this.emit('on_appmenu_changed', this._registered_windows[xid].window);
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
                    global.logWarning(logName + "Invalid menu. " + e);
                    return callback(false);
                }
                var version = val.deep_unpack()[0].deep_unpack();
                //fixme: what do we implement?
                if (version >= 2) {
                    return callback(true, bus, path);
                } else {
                    global.logWarning(logName + "Incompatible dbusmenu version " + version);
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
                let xid = this._guess_window_xid(wind);
                if(xid)
                    this._register_window_xid(xid, wind);
            }
        }
    },

    _updateWindowList: function () {
        let current = new Array();
        for(let index = 0; index < global.screen.n_workspaces; index++) {
            let metaWorkspace = global.screen.get_workspace_by_index(index);
            let win_list = metaWorkspace.list_windows();
            // For each window, let's make sure we add it!
            for(let pos in win_list) {
                let wind = win_list[pos];
                let xid = this._guess_window_xid(wind);
                if(xid)
                    current.push(xid.toString());
            }
        }
        for (let xid in this._registered_windows) {
            if(current.indexOf(xid) == -1) {
                //Main.notify("es " + xid);
                //Main.notify("es " + this._registered_windows[xid].application.get_name());
                let appMenu = this._registered_windows[xid].appMenu;
                delete this._registered_windows[xid];
                if(appMenu)
                    appMenu.destroy();
            }
        }
    },

    set_icon_size: function(icon_size) {
        if(this._icon_size != icon_size) {
            this._icon_size = icon_size;
            for (let xid in this._registered_windows) {
                this._update_icon(xid);
            }
            if(this._last_xid) {
                this.emit('on_appmenu_changed', this._registered_windows[this._last_xid].window);
            }
        }
    },

    _update_icon: function(xid) {
        if (xid in this._registered_windows) {
            if(this._registered_windows[xid].icon) {
                this._registered_windows[xid].icon.destroy();
                this._registered_windows[xid].icon = null;
            }
            let app = this._registered_windows[xid].application;
            if(app) {
              let icon = app.create_icon_texture(this._icon_size);
              this._registered_windows[xid].icon = icon;
            }
        }
    },

    _register_window_xid: function(xid, wind, menubarPath, sender_dbus) {
        let appT = null;
        let is_gtk = false;
        let appmenuPath = "";
        if(wind) {
            appT = this._tracker.get_window_app(wind);
            if((!menubarPath)||(!sender_dbus)) {
                let menubar_object_path = wind.get_gtk_menubar_object_path();
                let appmenu_object_path = wind.get_gtk_app_menu_object_path();
                let unique_bus_name = wind.get_gtk_unique_bus_name();
                //Main.notify("" + wind.title + " " + appT.get_name() + " " + menubar_object_path + " " + unique_bus_name)
                if((unique_bus_name)&&((menubar_object_path)||(appmenu_object_path))) {
                    if(menubar_object_path)
                        menubarPath = menubar_object_path;
                    if(appmenu_object_path)
                        appmenuPath = appmenu_object_path;
                    sender_dbus = unique_bus_name;
                    is_gtk = true;
                }
            }
        }
        if(!menubarPath) menubarPath = "";
        if(!sender_dbus) sender_dbus = "";

        if (xid in this._registered_windows) { //"org/gtk/Application/anonymous/menus/menubar"
            /*if ((menubarPath != "") && (this._registered_windows[xid].menubarObjectPath != "") && (this._registered_windows[xid].menubarObjectPath != menubarPath))
                Main.notify("Wrong menubarPath " + this._registered_windows[xid].window + " " + wind.title);
            if ((sender_dbus != "") && (this._registered_windows[xid].sender != "") && (this._registered_windows[xid].sender != sender_dbus))
                Main.notify("Wrong sender");
            if ((appT != null) && (this._registered_windows[xid].application != null) && (this._registered_windows[xid].application != appT))
                Main.notify("Wrong application");
            if ((wind != null) && (this._registered_windows[xid].window != null) && (this._registered_windows[xid].window != wind))
                Main.notify("Wrong window");*/

            //this._registered_windows[xid].menubarObjectPath = menubarPath;
            //this._registered_windows[xid].sender = sender_dbus;

            //FIXME firefox is who called the Wrong menubarPath, so is here the problem?
            //if ((menubarPath != "") && (this._registered_windows[xid].menubarObjectPath == "")) 
            if(menubarPath != "")
                this._registered_windows[xid].menubarObjectPath = menubarPath;
            if(appmenuPath != "")
                this._registered_windows[xid].appmenuObjectPath = appmenuPath;
                //this._registered_windows[xid].menubarObjectPath = appmenuPath;
            if(sender_dbus != "")
                this._registered_windows[xid].sender = sender_dbus;
            if(appT)
                this._registered_windows[xid].application = appT;
            if(wind)
                this._registered_windows[xid].window = wind;
            /*
            if(this._registered_windows[xid].menubarObjectPath == "")
                this._registered_windows[xid].menubarObjectPath = menubarPath;
            if(this._registered_windows[xid].appmenuObjectPath == "")
                this._registered_windows[xid].appmenuObjectPath = appmenuPath;
            if(this._registered_windows[xid].sender == "")
                this._registered_windows[xid].sender = sender_dbus;
            if(!this._registered_windows[xid].application)
                this._registered_windows[xid].application = appT;
            if(!this._registered_windows[xid].window)
                this._registered_windows[xid].window = wind;*/
        } else {
            this._registered_windows[xid] = {
                window: wind,
                application: appT,
                menubarObjectPath: menubarPath,
                //menubarObjectPath: appmenuPath,
                appmenuObjectPath: appmenuPath,
                sender: sender_dbus,
                isGtk: is_gtk,
                icon: null,
                appMenu: null
            };
        }

        this._update_icon(xid);
        if ((xid in this._registered_windows) && (!this._registered_windows[xid].appMenu)) {
            if ((this._registered_windows[xid].menubarObjectPath != "") && (this._registered_windows[xid].sender != "")) {
                this._get_menu_client(xid, Lang.bind(this, this._on_menu_client_ready));
            } else if ((this._registered_windows[xid].menubarObjectPath == "") || (this._registered_windows[xid].sender == "")) {
                try {
                    let command = "xprop -id " + xid + " -notype _GTK_UNIQUE_BUS_NAME && " +
                                  "xprop -id " + xid + " -notype _GTK_MENUBAR_OBJECT_PATH && " +
                                  "xprop -id " + xid + " -notype _GTK_APP_MENU_OBJECT_PATH";
                    let terminal = new Utility.TerminalReader(command, Lang.bind(this, this._on_terminal_read));
                    terminal.executeReader();
                } catch(e){
                    global.log(logName + "Not found properties for " + xid + " windows id");
                }
            } 
        }
    },

    _on_terminal_read: function(command, sucess, result) {
        if(sucess) {
            let xid = parseInt(command.substring(10, command.indexOf(" -notype")));
            let lines = result.split("\n");
            let obj_keys = { "_GTK_UNIQUE_BUS_NAME":"", "_GTK_MENUBAR_OBJECT_PATH":"", "_GTK_APP_MENU_OBJECT_PATH":"" };
            if(this._get_values(lines, obj_keys)) {
                this._registered_windows[xid].sender = obj_keys["_GTK_UNIQUE_BUS_NAME"];
                this._registered_windows[xid].menubarObjectPath = obj_keys["_GTK_MENUBAR_OBJECT_PATH"];
                this._registered_windows[xid].appmenuObjectPath = obj_keys["_GTK_APP_MENU_OBJECT_PATH"];
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
        let xid = this._guess_window_xid(wind);
        if((xid) && (xid in this._registered_windows)) {
            let appmenu = this._registered_windows[xid].appMenu;
            if (appmenu)
                return appmenu.get_root();
        }
        return null;
    },

    get_app_for_window: function(wind) {
        let xid = this._guess_window_xid(wind);
        if((xid) && (xid in this._registered_windows))
            return this._registered_windows[xid].application;
        return null;
    },

    get_icon_for_window: function(wind) {
        let xid = this._guess_window_xid(wind);
        if((xid) && (xid in this._registered_windows))
            return this._registered_windows[xid].icon;
        return null;
    },

    destroy: function() {
      try{
        if (!this._isDestroyed) {
            // this doesn't do any sync operation and doesn't allow us to hook up the event of being finished
            // which results in our unholy debounce hack (see extension.js)
            Gio.DBus.session.unown_name(this._ownName);
            this._dbusImpl.unexport();
            this._isDestroyed = true;
            if(this._windows_changed_id > 0) {
                global.screen.get_display().disconnect(this._windows_changed_id);
                this._windows_changed_id = 0;
            }
            if(this._notify_workspaces_changed_id > 0) {
                global.screen.disconnect(this._notify_workspaces_changed_id);
                this._notify_workspaces_changed_id = 0;
            }
            if(this._tracker_windows_changed_id > 0) {
                this._tracker.disconnect(this._tracker_windows_changed_id);
                this._tracker_windows_changed_id = 0;
            }
            for (let xid in this._registered_windows) {
                let register = this._registered_windows[xid];
                if (register.icon)
                    register.icon.destroy();
                if (register.appMenu)
                    register.appMenu.destroy();
            }
            this._registered_windows = null;
            this.system.set_shell_shows_appmenu(false);
            this.system.set_shell_shows_menubar(false);
            this.system.active_unity_menu_proxy(false);
            //system.active_unity_gtk_module(false); When?
        }
      } catch(e){Main.notify("error", e.message)}
    },

    _on_window_changed: function() {
        let wind = null;
        let xid = this._guess_window_xid(global.display.focus_window);
        if((xid) && (!(xid in this._registered_windows) || (!this._registered_windows[xid].appMenu))) {
            this._register_all_windows();
        }
        if(xid in this._registered_windows)
            wind = this._registered_windows[xid].window;
        this.emit('on_appmenu_changed', wind);
        this._last_xid = xid;
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
    _guess_window_xid: function (wind) {
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
        global.logError("[maximus]: Could not find XID for window with title %s".format(wind.title));
        return null;
    }
};
Signals.addSignalMethods(IndicatorAppMenuWatcher.prototype);
