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
const Main = imports.ui.main;

const AppletPath = imports.ui.appletManager.applets['globalAppMenu@lestcape'];
const AppletDir = imports.ui.appletManager.appletMeta['globalAppMenu@lestcape'].path;
const interfacesDir = Gio.file_new_for_path(AppletDir).get_child("interfaces-xml");

const StatusNotifierItem = loadInterfaceXml("StatusNotifierItem.xml");
const Properties = loadInterfaceXml("Properties.xml");
const StatusNotifierWatcher = loadInterfaceXml("StatusNotifierWatcher.xml");
const DBusMenu = loadInterfaceXml("DBusMenu.xml");
const DBusAppMenu = loadInterfaceXml("DBusAppmenu.xml");
const DBusGtkMenu = loadInterfaceXml("DBusGtkMenu.xml");
const ActionsGtk = loadInterfaceXml("ActionsGtk.xml");


/**
 * loads a xml file into an in-memory string
 */
function loadInterfaceXml(filename) {

    let file = interfacesDir.get_child(filename);

    let [ result, contents ] = GLib.file_get_contents(file.get_path());

    if (result) {
        //HACK: The "" + trick is important as hell because file_get_contents returns
        // an object (WTF?) but Gio.makeProxyWrapper requires `typeof() == "string"`
        // Otherwise, it will try to check `instanceof XML` and fail miserably because there
        // is no `XML` on very recent SpiderMonkey releases (or, if SpiderMonkey is old enough,
        // will spit out a TypeError soon).
        return "<node>" + contents + "</node>";
    } else {
        throw new Error("AppIndicatorSupport: Could not load file: "+filename);
    }
};

/**
 * will take the given signals and handlers, connect them to the object
 * and push the id needed to disconnect it into the given array.
 * the id array is returned, too
 *
 * if you do not pass a predefined array, it will be created for you.
 */
const connectAndSaveId = function(target, handlers /* { "signal": handler } */, idArray) {
    idArray = typeof idArray != 'undefined' ? idArray : [];
    for (let signal in handlers) {
        idArray.push(target.connect(signal, handlers[signal]));
    }
    return idArray;
}

/**
 * will connect the given handlers to the object, and automatically disconnect them
 * when the 'destroy' signal is emitted
 */
const connectAndRemoveOnDestroy = function(target, handlers, /* optional */ destroyTarget, /* optional */ destroySignal) {
    var ids, destroyId;

    ids = connectAndSaveId(target, handlers);

    if (typeof destroyTarget == 'undefined') destroyTarget = target;
    if (typeof destroySignal == 'undefined') destroySignal = 'destroy';

//    if (!destroyTarget.connect)
//        return;

    destroyId = destroyTarget.connect(destroySignal, function() {
        disconnectArray(target, ids);
        destroyTarget.disconnect(destroyId);
    });
}

/**
 * disconnect an array of signal handler ids. The ids are then removed from the array.
 */
const disconnectArray = function(target, idArray) {
    for (let handler = idArray.shift(); handler !== undefined; handler = idArray.shift()) {
        target.disconnect(handler);
    }
}

/**
 * connects a handler and removes it after the first call, or if the source object is destroyed
 */
const connectOnce = function(target, signal, handler, /* optional */ destroyTarget, /* optional */ destroySignal) {
    var signalId, destroyId;

    if (typeof destroyTarget == 'undefined') destroyTarget = target;
    if (typeof destroySignal == 'undefined') destroySignal = 'destroy';

    signalId = target.connect(signal, function() {
        target.disconnect(signalId);
        handler.apply(this, arguments);
    })

    if (!destroyTarget.connect)
        return;

    destroyId = destroyTarget.connect(destroySignal, function() {
        target.disconnect(signalId);
    })
}

/**
 * Workaround for https://bugzilla.gnome.org/show_bug.cgi?id=734071
 *
 * Will append the given name with a number to distinguish code loaded later from the last loaded version
 */
const WORKAROUND_RELOAD_TYPE_REGISTER = function(name) {
    return 'Gjs_' + name + '__' + global['--appindicator-loaded-count'];
}
