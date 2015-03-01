// Copyright (C) 2011 Giovanni Campagna
// Copyright (C) 2013-2014 Jonas Kümmerlin <rgcjonas@gmail.com>
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
const Gtk = imports.gi.Gtk;

const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Main = imports.ui.main;
const Signals = imports.signals;

const CinnamonConfig = imports.misc.config;

const AppletPath = imports.ui.appletManager.applets['globalAppMenu@lestcape'];
const AppIndicator = AppletPath.appIndicator;
const IndicatorMessageSource = AppletPath.indicatorMessageSource;
const IndicatorStatusIcon = AppletPath.indicatorStatusIcon;
const Util = AppletPath.util;
//const Settings = AppletPath.Settings;
const SNIStatus = AppIndicator.SNIStatus;


// TODO: replace with org.freedesktop and /org/freedesktop when approved
const KDE_PREFIX = 'org.kde';
const AYATANA_PREFIX = 'org.ayatana';
const AYATANA_PATH_PREFIX = '/org/ayatana';

const WATCHER_BUS_NAME = KDE_PREFIX + '.StatusNotifierWatcher';
const WATCHER_INTERFACE = WATCHER_BUS_NAME;
const WATCHER_OBJECT = '/StatusNotifierWatcher';

const ITEM_OBJECT = '/StatusNotifierItem';


/*
 * The IndicatorDispatcher class will get all newly added or changed indicators
 * and delegate them to IndicatorStatusIcon or IndicatorMessageSource or discard them
 * depending on the settings and indicator state
 */

function IndicatorDispatcher() {
    this._init();
}

IndicatorDispatcher.prototype = {
    
    _init: function() {
        this._icons = {};
        //this._settingsChangedId = Settings.instance.connect("changed", Lang.bind(this, this._settingsChanged));
    },

    dispatch: function(indicator) {
        if (indicator.isReady) this._doDispatch(indicator);
        else indicator.connect("ready", Lang.bind(this, this._doDispatch, indicator));
    },

    _doDispatch: function(indicator) {
        this._icons[indicator.id] = {
            statusChangedId:    indicator.connect('status', Lang.bind(this, this._updatedStatus, indicator)),
            destroyedId:        indicator.connect('destroy', Lang.bind(this, this._freeContainer, indicator)),
            currentVisual:      null,
            indicator:          indicator
        };

        this._updatedStatus(indicator);
    },

    _updatedStatus: function(indicator) {
        if (!indicator)
            return;
        
        if (indicator.status == SNIStatus.PASSIVE && this._isVisible(indicator))
            this._hide(indicator);
        else if ((indicator.status == SNIStatus.ACTIVE || indicator.status == SNIStatus.NEEDS_ATTENTION)
                 && !this._isVisible(indicator))
            this._show(indicator);
    },

    _isVisible: function(indicator) {
        return (indicator.id in this._icons) && this._icons[indicator.id].currentVisual;
    },

    _show: function(indicator) {
        //if (Settings.instance.get(indicator.id) == "blacklist")
        //    this._icons[indicator.id].currentVisual = new NullIcon(indicator);
        //else if (Settings.instance.get(indicator.id) == "panel")
            this._icons[indicator.id].currentVisual = new IndicatorStatusIcon.IndicatorStatusIcon(indicator);
        //else
        //    this._icons[indicator.id].currentVisual = new IndicatorMessageSource.IndicatorMessageSource(indicator);
    },
    
    _hide: function(indicator) {
        this._icons[indicator.id].currentVisual.destroy(true);
        this._icons[indicator.id].currentVisual = null;
    },
    
    _redisplay: function(id) {
        if (!(id in this._icons))
            return;

        let indicator = this._icons[id].indicator;

        if (this._isVisible(indicator)) {
            this._hide(indicator);
            this._show(indicator);
        }
    },

    _freeContainer: function(indicator) {
        if (!(indicator.id in this._icons))
            return;

        indicator.disconnect(this._icons[indicator.id].statusChangedId);
        indicator.disconnect(this._icons[indicator.id].destroyedId);

        if (this._isVisible(indicator))
            this._hide(indicator);

        delete this._icons[indicator.id];
    },

    //_settingsChanged: function(obj, name) {
    //    if (name) {
    //        this._redisplay(name);
    //    } else {
    //        // readd every item
    //        for (var i in this._icons) {
    //            this._redisplay(i);
    //        }
    //    }
    //},

    getIconIds: function() {
        return Object.keys(this._icons);
    },
    
    destroy: function() {
        //FIXME: this is actually never called because the only global instance is never freed
        //Settings.instance.disconnect(this._settingsChangedId);
    }
};

// used by IndicatorDispatcher for blacklisted indicators
function NullIcon(indicator) {
    this._init(indicator);
}

NullIcon.prototype = {
    
    _init: function(indicator) {
        this._indicator = indicator;
    },

    destroy: function() {}
};

/*
 * The StatusNotifierWatcher class implements the StatusNotifierWatcher dbus object
 */
function StatusNotifierWatcher() {
    this._init();
}

StatusNotifierWatcher.prototype = {

    _init: function() {
        this._dbusImpl = Gio.DBusExportedObject.wrapJSObject(Util.StatusNotifierWatcher, this);
        this._dbusImpl.export(Gio.DBus.session, WATCHER_OBJECT);
        this._everAcquiredName = false;
        this._ownName = Gio.DBus.session.own_name(WATCHER_BUS_NAME,
                                  Gio.BusNameOwnerFlags.NONE,
                                  Lang.bind(this, this._acquiredName),
                                  Lang.bind(this, this._lostName));
        this._items = { };
        this._nameWatcher = { };
    },

    _acquiredName: function() {
        this._everAcquiredName = true;
    },

    _lostName: function() {
        if (this._everAcquiredName)
            global.log('Lost name' + WATCHER_BUS_NAME);
        else
            global.logWarning('Failed to acquire ' + WATCHER_BUS_NAME);
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

    RegisterStatusNotifierItemAsync: function(params, invocation) {
        // it would be too easy if all application behaved the same
        // instead, ayatana patched gnome apps to send a path
        // while kde apps send a bus name
        let service = params[0];
        let bus_name, obj_path;
        if (service.charAt(0) == '/') { // looks like a path
            bus_name = invocation.get_sender();
            obj_path = service;
        } else { // we hope it is a bus name
            bus_name = service;
            obj_path = ITEM_OBJECT;
        }

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
    }
};
Signals.addSignalMethods(StatusNotifierWatcher.prototype);
