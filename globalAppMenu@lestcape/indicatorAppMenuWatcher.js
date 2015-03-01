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
function IndicatorAppMenuWatcher(mode) {
    this._init(mode);
}

IndicatorAppMenuWatcher.prototype = {

    _init: function(mode) {
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

        this.tracker = Cinnamon.WindowTracker.get_default();
        Mainloop.timeout_add(10000, Lang.bind(this, function () {
            try {
            this._register_all_windows();
            for(let xid in this._registered_windows) {
                if(this._registered_windows[xid].application) {
                    let app = this._registered_windows[xid].application;
                    //Main.notify(app.get_name() + " " + app.get_id() + " " + xid);
                } else if(this._registered_windows[xid].window) {
                    let wind = this._registered_windows[xid].window;
                    //Main.notify(wind.title + " " + xid);
                }
            }
            } catch(e) {Main.notify("error " + e.message);}
        }));

        this.current_menu_client = null;
        this.windows_changed_id = global.screen.get_display().connect('notify::focus-window',
                                  Lang.bind(this, this._on_window_changed));
        this._on_window_changed();
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
        this._register_window_xid(windowId, menuObjectPath, invocation.get_sender());
        Main.notify('RegisterWindow: ' + windowId + " " + invocation.get_sender() + " " + menuObjectPath);
        this.EmitWindowRegistered(windowId, invocation.get_sender(), menuObjectPath);
        //let retval = GLib.Variant.new('(b)', [result]);
        //invocation.return_value(null);
        //this.EmitWindowUnregistered(windowId);
    },

    UnregisterWindowAsync: function(params, invocation) {
        Main.notify('UnregisterWindow');
        let [windowId] = params;
        Main.notify('UnregisterWindow: ' + windowId + " " + invocation.get_sender() + " " + menuObjectPath);
        this.EmitWindowUnregistered(windowId);
    },

    GetMenuForWindowAsync: function(params, invocation) {
        let [windowId] = params;
        Main.notify('GetMenuForWindow: ' + params + " " + invocation.get_sender());
        let retval;
        if(windowId in this._registered_windows)
            retval = GLib.Variant.new('(so)', [this._registered_windows[xid].sender, this._registered_windows[xid].menuObjectPath]);
        else
            retval = [];
        invocation.return_value(retval);
    },

    GetMenusAsync: function(params, invocation) {
        Main.notify('GetMenus: ' + params + " " + invocation.get_sender());
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
        Main.notify('EmitWindowRegistered: ' + windowId + " " + service + " " + menuObjectPath);
    },

    EmitWindowUnregistered: function(windowId) {
        this._dbusImpl.emit_signal('WindowUnregistered', GLib.Variant.new('(u)', windowId));
        Main.notify('EmitWindowUnregistered: ' + windowId);
    },

    select_menu: function(xid) {
        let window = null;
        if(xid in this._registered_windows) {
            this.current_menu_client = this._registered_windows[xid].appMenu;
            window = this._registered_windows[xid].window;
        } else {
            this.current_menu_client = null;
        }
        this.emit('on_appmenu_changed', window, this.current_menu_client);
    },

    get_current_menu_client: function() {
        return this.current_menu_client;
    },

    //async because we may need to check the presence of a menubar object as well as the creation is async.
    _get_menu_client: function(xid, callback) {
        var sender = this._registered_windows[xid].sender;
        var path = this._registered_windows[xid].menuObjectPath;
        this._validateMenu(sender, path, function(r, name, path) {
            if (r) {
                global.log("creating menu on "+[name, path]);
                callback(xid, new DBusMenu.Client(name, path));
            } else {
                callback(xid, null);
            }
        });
    },

    _on_menu_client_ready: function(xid, client) {
        if(client != null) {
            this._registered_windows[xid].appMenu = client;
        }
        //this.select_menu(xid);
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
                this._register_window(win_list[pos]);
            }
        }
    },

    _register_window: function (wind) {
        try {
            let xxid = this._guess_Window_XID(wind);
            if(xxid != null) {
                let appT = this.tracker.get_window_app(wind);
                let xid = parseInt(xxid, 16);
                if (xid in this._registered_windows) {
                    this._registered_windows[xid].window = wind;
                    this._registered_windows[xid].application = appT;
                } else {
                    this._registered_windows[xid] = {
                        window: wind,
                        application: appT,
                        menuObjectPath: null,
                        sender: null,
                        appMenu: null
                    };
                }
            }
        } catch(e) {global.logWarning(e.message);}
    },

    _register_window_xid: function(xid, menuPath, sender_dbus) {
      try {
        if (xid in this._registered_windows) {
            this._registered_windows[xid].menuObjectPath = menuPath;
            this._registered_windows[xid].sender = sender_dbus;
        } else {
            this._registered_windows[xid] = {
                window: null,
                application: null,
                menuObjectPath: menuPath,
                sender: sender_dbus,
                appMenu: null
            };
        }
        this._get_menu_client(xid, Lang.bind(this, this._on_menu_client_ready));
      }catch(e){Main.notify(e.message);}
    },

    _on_window_changed: function() {
        let xid = this._get_last_focused_Window();
        if(xid) {
            this._register_window(global.display.focus_window);
            this.select_menu(xid);
        }
    },

    _get_last_focused_Window: function () {
        try {
            let wind = global.display.focus_window;
            if(wind) {
                let xxid = this._guess_Window_XID(wind);
                if(xxid != null)
                    return parseInt(xxid, 16);
            }
        }catch(e) {Main.notify("error " + e.message);}
        return null;
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
        let id = null;
        // if window title has non-utf8 characters, get_description() complains
        // "Failed to convert UTF-8 string to JS string: Invalid byte sequence in conversion input",
        // event though get_title() works.
        try {
            id = wind.get_description().match(/0x[0-9a-f]+/);
            if (id) {
                id = id[0];
                return id;
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
                    return id[1];
                }

                // Otherwise, just grab the child and hope for the best
                id = str.split(/child(?:ren)?:/)[1].match(/0x[0-9a-f]+/);
                if (id) {
                    return id[0];
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
