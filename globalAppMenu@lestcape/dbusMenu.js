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
const Atk = imports.gi.Atk;
const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const St = imports.gi.St;
const GdkPixbuf = imports.gi.GdkPixbuf;
const Lang = imports.lang;
const Signals = imports.signals;

const PopupMenu = imports.ui.popupMenu;
const Main = imports.ui.main;

const AppletPath = imports.ui.appletManager.applets['globalAppMenu@lestcape'];
const ConfigurableMenus = AppletPath.configurableMenus;
const Util = AppletPath.util;

const BusClientProxy = Gio.DBusProxy.makeProxyWrapper(Util.DBusMenu);
const BusGtkClientProxy = Gio.DBusProxy.makeProxyWrapper(Util.DBusGtkMenu);
const ActionsGtkClientProxy = Gio.DBusProxy.makeProxyWrapper(Util.ActionsGtk);


// we list all the properties we know and use here, so we won' have to deal with unexpected type mismatches
const MandatedTypes = {
    'visible'           : GLib.VariantType.new("b"),
    'enabled'           : GLib.VariantType.new("b"),
    'label'             : GLib.VariantType.new("s"),
    'type'              : GLib.VariantType.new("s"),
    'children-display'  : GLib.VariantType.new("s"),
    'icon-name'         : GLib.VariantType.new("s"),
    'icon-data'         : GLib.VariantType.new("ay"),
    'toggle-type'       : GLib.VariantType.new("s"),
    'toggle-state'      : GLib.VariantType.new("i"),
    'action'            : GLib.VariantType.new("s"),
    'target'            : GLib.VariantType.new("v"),
    'accel'             : GLib.VariantType.new("s"),
    'param-type'        : GLib.VariantType.new("g"),
    'parameters'        : GLib.VariantType.new("av")
};

const DefaultValues = {
    'visible'    : GLib.Variant.new_boolean(true),
    'enabled'    : GLib.Variant.new_boolean(true),
    'label'      : GLib.Variant.new_string(""),
    'type'       : GLib.Variant.new_string("standard"),
    'action'     : GLib.Variant.new_string(""),
    'accel'      : GLib.Variant.new_string("")
    // elements not in here must return null
};

//////////////////////////////////////////////////////////////////////////
// PART ONE: "ViewModel" backend implementation.
// Both code and design are inspired by libdbusmenu
//////////////////////////////////////////////////////////////////////////

/**
 * Saves menu property values and handles type checking and defaults
 */
function PropertyStore(initial_properties) {
    this._init(initial_properties);
}

PropertyStore.prototype = {

    _init: function(initial_properties) {
        this._props = {};

        if (initial_properties) {
            for (let i in initial_properties) {
                this.set(i, initial_properties[i]);
            }
        }
    },

    set: function(name, value) {
        if (name in MandatedTypes && value && !value.is_of_type(MandatedTypes[name]))
            global.logWarning("Cannot set property "+name+": type mismatch!");
        else if (value)
            this._props[name] = value;
        else
            delete this._props[name];
    },

    get: function(name) {
        if (name in this._props)
            return this._props[name];
        else if (name in DefaultValues)
            return DefaultValues[name];
        else
            return null;
    }
};

/**
 * Saves menu property values and handles type checking and defaults
 */
function PropertyGtkStore(initial_properties) {
    this._init(initial_properties);
}

PropertyGtkStore.prototype = {
    __proto__: PropertyStore.prototype,

    _init: function(initial_properties) {
        PropertyStore.prototype._init.call(this, initial_properties);
    },

    set: function(name, value) {
        /*if (name in MandatedTypes && value && !value.is_of_type(MandatedTypes[name]))
            global.logWarning("Cannot set property "+name+": type mismatch!");
        else*/ if (value)
            this._props[name] = value;
        else
            delete this._props[name];
    }
};

/**
 * Represents a single menu item
 */
function DbusMenuItem(client, id, properties, children_ids) {
    this._init(client, id, properties, children_ids);
}

DbusMenuItem.prototype = {

    // will steal the properties object
    _init: function(client, id, properties, children_ids) {
        this._client = client;
        this._id = id;
        if (client instanceof DBusClientGtk)
            this._propStore = new PropertyGtkStore(properties);
        else
            this._propStore = new PropertyStore(properties);
        
        this._children_ids = children_ids;
    },

    property_get: function(prop_name) {
        let prop = this.property_get_variant(prop_name);
        return prop ? prop.get_string()[0] : null;
    },

    property_get_variant: function(prop_name) {
        return this._propStore.get(prop_name);
    },

    property_get_bool: function(prop_name) {
        let prop  = this.property_get_variant(prop_name);
        return prop ? prop.get_boolean() : false;
    },

    property_get_int: function(prop_name) {
        let prop = this.property_get_variant(prop_name);
        return prop ? prop.get_int32() : 0;
    },

    property_set: function(prop, value) {
        let old_value = this._propStore.get(prop);

        this._propStore.set(prop, value);

        let new_value = this._propStore.get(prop);

        if (new_value && !old_value || old_value && !new_value || old_value.compare(new_value) != 0)
            this.emit('property-changed', prop, this.property_get_variant(prop));
    },

    get_children_ids: function() {
        return this._children_ids.concat(); // clone it!
    },

    add_child: function(pos, child_id) {
        this._children_ids.splice(pos, 0, child_id);
        this.emit('child-added', this._client.get_item(child_id), pos);
    },

    remove_child: function(child_id) {
        // find it
        let pos = -1;
        for (let i = 0; i < this._children_ids.length; ++i) {
            if (this._children_ids[i] == child_id) {
                pos = i;
                break;
            }
        }

        if (pos < 0) {
            global.logError("Trying to remove child which doesn't exist");
        } else {
            this._children_ids.splice(pos, 1);
            this.emit('child-removed', this._client.get_item(child_id));
        }
    },

    move_child: function(child_id, newpos) {
        // find the old position
        let oldpos = -1;
        for (let i = 0; i < this._children_ids.length; ++i) {
            if (this._children_ids[i] == child_id) {
                oldpos = i;
                break;
            }
        }

        if (oldpos < 0) {
            global.logError("tried to move child which wasn't in the list");
            return;
        }

        if (oldpos != newpos) {
            this._children_ids.splice(oldpos, 1);
            this._children_ids.splice(newpos, 0, child_id);
            this.emit('child-moved', oldpos, newpos, this._client.get_item(child_id));
        }
    },

    get_children: function() {
        return this._children_ids.map(function(el) {
            return this._client.get_item(el);
        }, this);
    },

    handle_event: function(event, data, timestamp) {
        if (!data)
            data = GLib.Variant.new_int32(0);

        this._client.send_event(this._id, event, data, timestamp);
    },

    get_id: function() {
        return this._id;
    },

    send_about_to_show: function() {
        this._client.send_about_to_show(this._id);
    }
};
Signals.addSignalMethods(DbusMenuItem.prototype);

/**
 * The client does the heavy lifting of actually reading layouts and distributing events
 */
function DBusClient(busName, busPath) {
    this._init(busName, busPath);
}

DBusClient.prototype = {

    _init: function(busName, busPath) {
        this._proxy = new BusClientProxy(Gio.DBus.session, busName, busPath, Lang.bind(this, this._clientReady));
        let init_id = this._get_init_id();
        this._items = {};
        this._items[init_id] = new DbusMenuItem(this, init_id, { 'children-display': GLib.Variant.new_string('submenu') }, []);

        // will be set to true if a layout update is requested while one is already in progress
        // then the handler that completes the layout update will request another update
        this._flagLayoutUpdateRequired = false;
        this._flagLayoutUpdateInProgress = false;

        // property requests are queued
        this._propertiesRequestedFor = [ /* ids */ ];
    },

    get_root: function() {
        return this._items[this._get_init_id()];
    },

    _get_init_id: function() {
        return 0;
    },

    _requestLayoutUpdate: function() {
        if (this._flagLayoutUpdateInProgress)
            this._flagLayoutUpdateRequired = true;
        else
            this._beginLayoutUpdate();
    },

    _requestProperties: function(id) {
        // if we don't have any requests queued, we'll need to add one
        if (this._propertiesRequestedFor.length < 1)
            GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, Lang.bind(this, this._beginRequestProperties));

        if (this._propertiesRequestedFor.filter(function(e) { return e === id; }).length == 0)
            this._propertiesRequestedFor.push(id);

    },

    _beginRequestProperties: function() {
        this._proxy.GetGroupPropertiesRemote(this._propertiesRequestedFor, [], Lang.bind(this, this._endRequestProperties));

        this._propertiesRequestedFor = [];

        return false;
    },

    _endRequestProperties: function(result, error) {
        if (error) {
            global.logWarning("Could not retrieve properties: "+error);
            return;
        }

        // for some funny reason, the result array is hidden in an array
        result[0].forEach(function([id, properties]) {
            if (!(id in this._items))
                return;

            for (let prop in properties)
                this._items[id].property_set(prop, properties[prop]);
        }, this);
    },

    // Traverses the list of cached menu items and removes everyone that is not in the list
    // so we don't keep alive unused items
    _gcItems: function() {
        let tag = new Date().getTime();

        let toTraverse = [ this._get_init_id() ];
        while (toTraverse.length > 0) {
            let item = this.get_item(toTraverse.shift());
            item._dbusClientGcTag = tag;
            Array.prototype.push.apply(toTraverse, item.get_children_ids());
        }

        for (let i in this._items)
            if (this._items[i]._dbusClientGcTag != tag)
                delete this._items[i];
    },

    // the original implementation will only request partial layouts if somehow possible
    // we try to save us from multiple kinds of race conditions by always requesting a full layout
    _beginLayoutUpdate: function() {
        // we only read the type property, because if the type changes after reading all properties,
        // the view would have to replace the item completely which we try to avoid
        this._proxy.GetLayoutRemote(0, -1, [ 'type', 'children-display' ], Lang.bind(this, this._endLayoutUpdate));

        this._flagLayoutUpdateRequired = false;
        this._flagLayoutUpdateInProgress = true;
    },

    _endLayoutUpdate: function(result, error) {
        if (error) {
            global.logWarning("While reading menu layout: "+error);
            return;
        }

        let [ revision, root ] = result;
        this._doLayoutUpdate(root);

        /* fake about to show for firefox: https://bugs.launchpad.net/plasma-widget-menubar/+bug/878165
        this._items[0].get_children_ids().forEach(function(child_id) {
            this.send_about_to_show(child_id);
        }, this);*/

        this._gcItems();

        if (this._flagLayoutUpdateRequired)
            this._beginLayoutUpdate();
        else
            this._flagLayoutUpdateInProgress = false;
    },

    _doLayoutUpdate: function(item) {
        let [ id, properties, children ] = item;

        let children_unpacked = children.map(function(child) { return child.deep_unpack(); });
        let children_ids = children_unpacked.map(function(child) { return child[0]; });

        // make sure all our children exist
        children_unpacked.forEach(this._doLayoutUpdate, this);

        // make sure we exist
        if (id in this._items) {
            // we do, update our properties if necessary
            for (let prop in properties) {
                this._items[id].property_set(prop, properties[prop]);
            }

            // make sure our children are all at the right place, and exist
            let old_children_ids = this._items[id].get_children_ids();
            for (let i = 0; i < children_ids.length; ++i) {
                // try to recycle an old child
                let old_child = -1;
                for (let j = 0; j < old_children_ids.length; ++j) {
                    if (old_children_ids[j] == children_ids[i]) {
                        old_child = old_children_ids.splice(j, 1)[0];
                        break;
                    }
                }

                if (old_child < 0) {
                    // no old child found, so create a new one!
                    this._items[id].add_child(i, children_ids[i]);
                } else {
                    // old child found, reuse it!
                    this._items[id].move_child(children_ids[i], i);
                }
            }

            // remove any old children that weren't reused
            old_children_ids.forEach(function(child_id) { this._items[id].remove_child(child_id); }, this);
        } else {
            // we don't, so let's create us
            this._items[id] = new DbusMenuItem(this, id, properties, children_ids);
            this._requestProperties(id);
        }

        return id;
    },

    _clientReady: function(result, error) {
        if (error) {
            global.logWarning("Could not initialize menu proxy: "+error);
            //FIXME: show message to the user?
        }

        this._requestLayoutUpdate();

        // listen for updated layouts and properties
        this._proxy.connectSignal("LayoutUpdated", Lang.bind(this, this._onLayoutUpdated));
        this._proxy.connectSignal("ItemsPropertiesUpdated", Lang.bind(this, this._onPropertiesUpdated));
    },

    get_item: function(id) {
        if (id in this._items)
            return this._items[id];

        global.logWarning("trying to retrieve item for non-existing id "+id+" !?");
        return null;
    },

    // we don't need to cache and burst-send that since it will not happen that frequently
    send_about_to_show: function(id) {
        this._proxy.AboutToShowRemote(id, Lang.bind(this, function(result, error) {
            if (error)
                global.logWarning("while calling AboutToShow: "+error);
            else if (result && result[0])
                this._requestLayoutUpdate();
        }));
    },

    send_event: function(id, event, params, timestamp) {
        this._proxy.EventRemote(id, event, params, timestamp, function(result, error) { /* we don't care */ });
    },

    _onLayoutUpdated: function() {
        this._requestLayoutUpdate();
    },

    _onPropertiesUpdated: function(proxy, name, [changed, removed]) {
        changed.forEach(function([id, props]) {
            if (!(id in this._items))
                return;

            for (let prop in props)
                this._items[id].property_set(prop, props[prop]);
        }, this);
        removed.forEach(function([id, propNames]) {
            if (!(id in this._items))
                return;

            propNames.forEach(function(propName) {
                this._items[id].property_set(propName, null);
            }, this);
        }, this);
    },

    destroy: function() {
        this.emit('destroy');

        Signals._disconnectAll.apply(this._proxy);

        this._proxy = null;
    }
};
Signals.addSignalMethods(DBusClient.prototype);

function DBusClientGtk(busName, busPath) {
    this._init(busName, busPath);
}

DBusClientGtk.prototype = {
    __proto__: DBusClient.prototype,

    _init: function(busName, busPath) {
        //DBusClient.prototype._init.call(this, busName, );
        this._busName = busName;
        this._busPath = busPath;
        this.gtk_menubar_menus = null;
        this.labels_ids = {};

        this._proxy_menu = new BusGtkClientProxy(Gio.DBus.session, this._busName, this._busPath, Lang.bind(this, this._clientReady));
        //FIXME we need to translate the id to the appmenu way?
        let init_id = this._get_init_id();
        this._items = {};
        this._items[init_id] = new DbusMenuItem(this, init_id, { 'children-display': GLib.Variant.new_string('submenu') }, []);

        // will be set to true if a layout update is requested while one is already in progress
        // then the handler that completes the layout update will request another update
        this._flagLayoutUpdateRequired = false;
        this._flagLayoutUpdateInProgress = false;

        // property requests are queued
        this._propertiesRequestedFor = [ /* ids */ ];
    },

    _get_init_id: function() {
        return "02"; //FIXME will start always on 02?
    },

    _requestActionsUpdate: function() {
        let action_ids = [];
        this._proxy_action.DescribeAllRemote(Lang.bind(this, this._endActionsUpdate));
    },

    _endActionsUpdate: function(result, error) {//FIXME not all values are updated.
        if (error) {
            global.logWarning("While reading menu actions: "+error);
            return;
        }
        if((result) && (result[0])) {
          try {
            //Main.notify("act" + Object.keys(result[0]))
            let properties_hash = result[0];
            let isNotCreate = false;
            for(let action_id in properties_hash) {
                if((isNotCreate)&&(!(action_id in this.actions_ids))) {
                    isNotCreate = true;
                    this._create_actions_ids();
                }
                let id = this.actions_ids[action_id];
                if (!(id in this._items))
                    return;

                let properties = properties_hash[action_id];
                this._items[id].property_set("enabled", GLib.Variant.new_boolean(properties[0]));
                if(properties[1])
                    this._items[id].property_set("param-type", GLib.Variant.new("g", properties[1]));
                else
                    this._items[id].property_set("param-type", GLib.Variant.new("g", ""));

                if(properties[2])
                    this._items[id].property_set("parameters", properties[2]);
            }
          } catch(e) {Main.notify("AAA" + e.message);}
        }
    },

    _create_actions_ids: function() {
        this.actions_ids = {};//FIXME add and remove better?
        for(let id in this._items) {
            let action_id = this._items[id].property_get("action");
            if(action_id) {
                this.actions_ids[action_id.replace("unity.", "")] = id;
            }
        }
        //Main.notify("val " + Object.keys(this.actions_ids));
    },

    _requestLayoutUpdate: function() {
        if (this._flagLayoutUpdateInProgress)
            this._flagLayoutUpdateRequired = true;
        else
            this._beginLayoutUpdate();
    },

    // the original implementation will only request partial layouts if somehow possible
    // we try to save us from multiple kinds of race conditions by always requesting a full layout
    _beginLayoutUpdate: function() {
        // we only read the type property, because if the type changes after reading all properties,
        // the view would have to replace the item completely which we try to avoid
        //this._proxy_menu.GetLayoutRemote(0, -1, [ 'type', 'children-display' ], Lang.bind(this, this._endLayoutUpdate));
        let init_menu = [];
        for (let x = 0; x < 1024; x++) { init_menu.push(x); }

        this._proxy_menu.StartRemote(init_menu, Lang.bind(this, this._endLayoutUpdate));

        this._flagLayoutUpdateRequired = false;
        this._flagLayoutUpdateInProgress = true;
    },

    _endLayoutUpdate: function(result, error) {
        if (error) {
            global.logWarning("While reading menu layout: "+error);
            return;
        }

        //Now unpack the menu and create a fake root item?
        if((result) && (result[0])) {
            let init_id = this._get_init_id();
            this.gtk_menubar_menus = {};
            this.gtk_menubar_menus[init_id] = [];
            //Main.notify("Newwwwwwwwwwwww " + result[0]);
            result[0].forEach(function([menu_pos, section_pos, section_items]) {
                this.gtk_menubar_menus["" + menu_pos + section_pos] = section_items;
            }, this);
            //Main.notify("Endddddddddddddddddd " + Object.keys(this.gtk_menubar_menus));
            this._doLayoutUpdate(init_id, { "children-display": GLib.Variant.new_string("submenu") } );
        }

        this._gcItems();
        this._create_actions_ids();

        if (this._flagLayoutUpdateRequired)
            this._beginLayoutUpdate();
        else
            this._flagLayoutUpdateInProgress = false;
    },

    _doLayoutUpdate: function(id, properties) {
        //Main.notify("Gtk Menu Is: " + id);
        try {
            let children_ids = [];
            let menu_section, id_sub, new_pos;
            if(id in this.gtk_menubar_menus) {
                let item = this.gtk_menubar_menus[id];
                for(let pos in item) {
                    menu_section = item[pos];
                    menu_section["type"] = GLib.Variant.new_string("standard");
                    if(":section" in menu_section) {
                        new_pos = menu_section[":section"].deep_unpack();
                        id_sub = "" + new_pos[0] + new_pos[1];
                        children_ids.push(id_sub);
                        menu_section["children-display"] = GLib.Variant.new_string("section");
                        this._doLayoutUpdate(id_sub, menu_section);
                    }
                    else if(":submenu" in menu_section) {
                        new_pos = menu_section[":submenu"].deep_unpack();
                        id_sub = "" + new_pos[0] + new_pos[1];
                        children_ids.push(id_sub);
                        menu_section["children-display"] = GLib.Variant.new_string("submenu");
                        this._doLayoutUpdate(id_sub, menu_section);
                    } else {
                        id_sub = "" + id + "" + pos;
                        children_ids.push(id_sub);
                        this._doLayoutUpdate(id_sub, menu_section);
                    }
                }
            }

            if (id in this._items) {
                // we do, update our properties if necessary
                for (let prop in properties) {
                    this._items[id].property_set(prop, properties[prop]);
                }

                // make sure our children are all at the right place, and exist
                let old_children_ids = this._items[id].get_children_ids();
                for (let i = 0; i < children_ids.length; ++i) {
                    // try to recycle an old child
                    let old_child = -1;
                    for (let j = 0; j < old_children_ids.length; ++j) {
                        if (old_children_ids[j] == children_ids[i]) {
                            old_child = old_children_ids.splice(j, 1)[0];
                            break;
                        }
                    }

                    if (old_child < 0) {
                        // no old child found, so create a new one!
                        this._items[id].add_child(i, children_ids[i]);
                    } else {
                        // old child found, reuse it!
                        this._items[id].move_child(children_ids[i], i);
                    }
                }

                // remove any old children that weren't reused
                old_children_ids.forEach(function(child_id) { this._items[id].remove_child(child_id); }, this);
            } else {
                // we don't, so let's create us
                this._items[id] = new DbusMenuItem(this, id, properties, children_ids);
                //this._requestProperties(id);
            }
        } catch (e) {Main.notify("Errorrrrr " + e.message);}
        return id;
    },

    send_about_to_show: function(id) {
    },

    send_event: function(id, event, params, timestamp) {//FIXME no match signal id
        let action_id = this._items[id].property_get("action");
        if(action_id) {
            let plataform = {};
            params = this._items[id].property_get_variant("parameters");
            if(!params) params = GLib.Variant.new("av", []);
            this._proxy_action.ActivateRemote(action_id.replace("unity.", ""), params, plataform, function(result, error) { /* we don't care */ })
        }
    },

    destroy: function() {
        this.emit('destroy');

        Signals._disconnectAll.apply(this._proxy);

        let init_menu = [];
        for (let x = 0; x < 1024; x++) { init_menu.push(x); }
        this._proxy_menu.EndRemote(init_menu, Lang.bind(this, function(result, error) {/*Nothing to do*/ }));
        this._proxy_menu = null;
    },

    _onLayoutUpdated: function() {
        this._requestLayoutUpdate();
    },

    _clientReady: function(result, error) {
        if (error) {
            global.logWarning("Could not initialize menu proxy: "+error);
            //FIXME: show message to the user?
        }
        this._proxy_action = new ActionsGtkClientProxy(Gio.DBus.session, this._busName, this._busPath, Lang.bind(this, this._clientActionReady));
    },

    _clientActionReady: function(result, error) {
        if (error) {
            global.logWarning("Could not initialize menu proxy: "+error);
            //FIXME: show message to the user?
        }
        this._requestLayoutUpdate();
        this._requestActionsUpdate();

        // listen for updated layouts and actions
        this._proxy_menu.connectSignal("Changed", Lang.bind(this, this._onLayoutUpdated));
        this._proxy_action.connectSignal("Changed", Lang.bind(this, this._onActionsUpdated));
    }
};
Signals.addSignalMethods(DBusClientGtk.prototype);

//////////////////////////////////////////////////////////////////////////
// PART TWO: "View" frontend implementation.
//////////////////////////////////////////////////////////////////////////

/**
 * Creates new wrapper menu items and injects methods for managing them at runtime.
 *
 * Many functions in this object will be bound to the created item and executed as event
 * handlers, so any `this` will refer to a menu item create in createItem
 */
const MenuItemFactory = {
    // Ornament polyfill for 3.8
    OrnamentType: PopupMenu.Ornament ? PopupMenu.Ornament : {
        NONE: 0,
        CHECK: 1,
        DOT: 2
    },

    _setOrnamentPolyfill: function(ornamentType) {
        if (ornamentType == MenuItemFactory.OrnamentType.CHECK) {
            this._ornament.set_text('\u2713');
            this.actor.add_accessible_state(Atk.StateType.CHECKED);
        } else if (ornamentType == MenuItemFactory.OrnamentType.DOT) {
            this._ornament.set_text('\u2022');
            this.actor.add_accessible_state(Atk.StateType.CHECKED);
        } else {
            this._ornament.set_text('');
            this.actor.remove_accessible_state(Atk.StateType.CHECKED);
        }
    },

    // GS3.8 uses a complicated system to compute the allocation for each child in pure JS
    // we hack together a function that allocates space for our ornament, using the x
    // calculations normally used for the dot and the y calculations used for every
    // other item. Thank god they replaced that whole allocation stuff in 3.10, so I don't
    // really need to understand how it works, as long as it looks right in 3.8
    _allocateOrnament: function(actor, box, flags) {
        if (!this._ornament) return;

        let height = box.y2 - box.y1;
        let direction = actor.get_text_direction();

        let dotBox = new Clutter.ActorBox();
        let dotWidth = Math.round(box.x1 / 2);

        if (direction == Clutter.TextDirection.LTR) {
            dotBox.x1 = Math.round(box.x1 / 4);
            dotBox.x2 = dotBox.x1 + dotWidth;
        } else {
            dotBox.x2 = box.x2 + 3 * Math.round(box.x1 / 4);
            dotBox.x1 = dotBox.x2 - dotWidth;
        }

        let [minHeight, naturalHeight] = this._ornament.get_preferred_height(dotBox.x2 - dotBox.x1);

        dotBox.y1 = Math.round(box.y1 + (height - naturalHeight) / 2);
        dotBox.y2 = dotBox.y1 + naturalHeight;

        this._ornament.allocate(dotBox, flags);
    },

    createItem: function(client, dbusItem) {
        // first, decide whether it's a submenu or not
        if (dbusItem.property_get("children-display") == "submenu")
            var shellItem = new PopupMenu.PopupSubMenuMenuItem("FIXME");
        else if (dbusItem.property_get("children-display") == "section")
            var shellItem = new ConfigurableMenus.PopupMenuSectionMenuItem();
        else if (dbusItem.property_get("type") == "separator")
            var shellItem = new PopupMenu.PopupSeparatorMenuItem('');
        else
            var shellItem = new PopupMenu.PopupMenuItem("FIXME");

        shellItem._dbusItem = dbusItem;
        shellItem._dbusClient = client;

        if (shellItem instanceof PopupMenu.PopupMenuItem) {
            shellItem._icon = new St.Icon({ style_class: 'popup-menu-icon', x_align: St.Align.END });
            if (shellItem.addActor) { //GS 3.8
                shellItem.addActor(shellItem._icon, { align: St.Align.END });
            } else { //GS >= 3.10
                shellItem.actor.add(shellItem._icon, { x_align: St.Align.END });
                shellItem.label.get_parent().child_set(shellItem.label, { expand: true });
            }

            // GS3.8: emulate the ornament stuff.
            // this is similar to how the setShowDot function works
            if (!shellItem.setOrnament) {
                shellItem._ornament = new St.Label();
                shellItem.actor.add_actor(shellItem._ornament);
                shellItem.setOrnament = MenuItemFactory._setOrnamentPolyfill;
                shellItem.actor.connect('allocate', Lang.bind(shellItem, MenuItemFactory._allocateOrnament)); //GS doesn't disconnect that one, either
            }
        }

        // initialize our state
        MenuItemFactory._updateLabel.call(shellItem);
        MenuItemFactory._updateOrnament.call(shellItem);
        MenuItemFactory._updateImage.call(shellItem);
        MenuItemFactory._updateVisible.call(shellItem);
        MenuItemFactory._updateSensitive.call(shellItem);

        // initially create children
        if (shellItem instanceof PopupMenu.PopupSubMenuMenuItem) {
            let children = dbusItem.get_children();
            for (let i = 0; i < children.length; ++i) {
                let ch_item = MenuItemFactory.createItem(client, children[i]);
                ch_item._parent = shellItem;
                shellItem.menu.addMenuItem(ch_item);
            }
        }

        // now, connect various events
        Util.connectAndRemoveOnDestroy(dbusItem, {
            'property-changed':   Lang.bind(shellItem, MenuItemFactory._onPropertyChanged),
            'child-added':        Lang.bind(shellItem, MenuItemFactory._onChildAdded),
            'child-removed':      Lang.bind(shellItem, MenuItemFactory._onChildRemoved),
            'child-moved':        Lang.bind(shellItem, MenuItemFactory._onChildMoved)
        }, shellItem);

        Util.connectAndRemoveOnDestroy(shellItem, {
            'activate':  Lang.bind(shellItem, MenuItemFactory._onActivate)
        });

        if (shellItem.menu) {
            Util.connectAndRemoveOnDestroy(shellItem.menu, {
                "open-state-changed": Lang.bind(shellItem, MenuItemFactory._onOpenStateChanged)
            });
        }
        return shellItem;
    },

    _onOpenStateChanged: function(menu, open) {
        if (open) {
            this._dbusItem.handle_event("opened", null, 0);
            this._dbusItem.send_about_to_show();
        } else {
            this._dbusItem.handle_event("closed", null, 0);
        }
    },

    _onActivate: function() {
        this._dbusItem.handle_event("clicked", GLib.Variant.new("i", 0), 0);
    },

    _onPropertyChanged: function(dbusItem, prop, value) {
        if (prop == "toggle-type" || prop == "toggle-state")
            MenuItemFactory._updateOrnament.call(this);
        else if (prop == "label")
            MenuItemFactory._updateLabel.call(this);
        else if (prop == "enabled")
            MenuItemFactory._updateSensitive.call(this);
        else if (prop == "visible")
            MenuItemFactory._updateVisible.call(this);
        else if (prop == "icon-name" || prop == "icon-data")
            MenuItemFactory._updateImage.call(this);
        else if (prop == "type" || prop == "children-display")
            MenuItemFactory._replaceSelf.call(this);
        //else
        //    Util.Logger.debug("Unhandled property change: "+prop);
    },

    _onChildAdded: function(dbusItem, child, position) {
        if (this instanceof PopupMenu.PopupSubMenuMenuItem) {
            this.menu.addMenuItem(MenuItemFactory.createItem(this._dbusClient, child), position);
        } else {
            Util.Logger.warn("Tried to add a child to non-submenu item. Better recreate it as whole");
            MenuItemFactory._replaceSelf.call(this);
        }
    },

    _onChildRemoved: function(dbusItem, child) {
        if (this instanceof PopupMenu.PopupSubMenuMenuItem) {
            // find it!
            this.menu._getMenuItems().forEach(function(item) {
                if (item._dbusItem == child)
                    item.destroy();
            });
        } else {
            Util.Logger.warn("Tried to remove a child from non-submenu item. Better recreate it as whole");
            MenuItemFactory._replaceSelf.call(this);
        }
    },

    _onChildMoved: function(dbusItem, child, oldpos, newpos) {
        if (this instanceof PopupMenu.PopupSubMenuMenuItem) {
            MenuUtils.moveItemInMenu(this.menu, child, newpos);
        } else {
            Util.Logger.warn("Tried to move a child in non-submenu item. Better recreate it as whole");
            MenuItemFactory._replaceSelf.call(this);
        }
    },

    _updateLabel: function() {
        let label = this._dbusItem.property_get("label").replace(/_([^_])/, "$1");

        if (this.label) // especially on GS3.8, the separator item might not even have a hidden label
            this.label.set_text(label);
    },

    _updateOrnament: function() {
        if (!this.setOrnament) return; // separators and alike might not have gotten the polyfill

        if (this._dbusItem.property_get("toggle-type") == "checkmark" && this._dbusItem.property_get_int("toggle-state"))
            this.setOrnament(MenuItemFactory.OrnamentType.CHECK);
        else if (this._dbusItem.property_get("toggle-type") == "radio" && this._dbusItem.property_get_int("toggle-state"))
            this.setOrnament(MenuItemFactory.OrnamentType.DOT);
        else
            this.setOrnament(MenuItemFactory.OrnamentType.NONE);
    },

    //data: GBytes
    _createPixbufFromMemoryImage: function(data) {
        let stream = Gio.MemoryInputStream.new_from_bytes(data);
        return GdkPixbuf.Pixbuf.new_from_stream(stream, null);
    },

    _updateImage: function() {
        if (!this._icon) return; // might be missing on submenus / separators

        let iconName = this._dbusItem.property_get("icon-name");
        let iconData = this._dbusItem.property_get_variant("icon-data");
        if (iconName)
            this._icon.icon_name = iconName;
        else if (iconData)
            this._icon.gicon = MenuItemFactory._createPixbufFromMemoryImage(iconData.get_data_as_bytes());
    },

    _updateVisible: function() {
        this.actor.visible = this._dbusItem.property_get_bool("visible");
    },

    _updateSensitive: function() {
        this.setSensitive(this._dbusItem.property_get_bool("enabled"));
    },

    _replaceSelf: function(newSelf) {
        // create our new self if needed
        if (!newSelf)
            newSelf = MenuItemFactory.createItem(this._dbusClient, this._dbusItem);

        // first, we need to find our old position
        let pos = -1;
        if(this._parent) {
            let family = this._parent._getMenuItems();
            for (let i = 0; i < family.length; ++i) {
                if (family[i] === this)
                    pos = i;
            }
        }

        if (pos < 0) {
            //throw new Error("DBusMenu: can't replace non existing menu item");
        } else {
            // add our new self while we're still alive
            this._parent.addMenuItem(newSelf, pos);
            // now destroy our old self
            this.destroy();
        }
    }
}

/**
 * Utility functions not necessarily belonging into the item factory
 */
const MenuUtils = {
    moveItemInMenu: function(menu, dbusItem, newpos) {
        //HACK: we're really getting into the internals of the PopupMenu implementation

        // First, find our wrapper. Children tend to lie. We do not trust the old positioning.
        let family = menu._getMenuItems();
        for (let i = 0; i < family.length; ++i) {
            if (family[i]._dbusItem == dbusItem) {
                // now, remove it
                menu.box.remove_child(family[i].actor);

                // and add it again somewhere else
                if (newpos < family.length && family[newpos] != family[i])
                    menu.box.insert_child_below(family[i].actor, family[newpos].actor);
                else
                    menu.box.add(family[i].actor);

                // skip the rest
                return;
            }
        }
    }
}

/**
 * Processes DBus events, creates the menu items and handles the actions
 *
 * Something like a mini-god-object
 */
function Client(busName, path, is_gtk) {
    this._init(busName, path, is_gtk);
}

Client.prototype = {

    _init: function(busName, path, is_gtk) {
        //this.parent();
        this._busName  = busName;
        this._busPath  = path;
        this._is_gtk  = is_gtk;
        if(is_gtk) {
            this._client = new DBusClientGtk(busName, path);
        } else
            this._client = new DBusClient(busName, path);
        this._rootMenu = null; // the shell menu
        this._rootItem = null; // the DbusMenuItem for the root

        this._rootItemDisconnectHandlers = [];
        this._menuDisconnectHandlers     = [];
        this._rootChangedHandler         = null;
    },

    // this will attach the client to an already existing menu that will be used as the root menu.
    // it will also connect the client to be automatically destroyed when the menu dies.
    attachToMenu: function(menu) {
        if(menu != this._rootMenu) {
            this._rootMenu = menu;
            this._rootItem = this._client.get_root();

            // cleanup: remove existing childs (just in case)
            this._rootMenu.removeAll();

            // connect handlers
            Util.connectAndSaveId(menu, {
                'open-state-changed': Lang.bind(this, this._onMenuOpened),
                'destroy'           : Lang.bind(this, this.destroy)
            }, this._menuDisconnectHandlers);
            Util.connectAndSaveId(this._rootItem, {
                'child-added'   : Lang.bind(this, this._onRootChildAdded),
                'child-removed' : Lang.bind(this, this._onRootChildRemoved),
                'child-moved'   : Lang.bind(this, this._onRootChildMoved)
            }, this._rootItemDisconnectHandlers);

            // fill the menu for the first time
            this._rootItem.get_children().forEach(function(child) {
                this._rootMenu.addMenuItem(MenuItemFactory.createItem(this, child));
            }, this);
        }
    },

    _setOpenedSubmenu: function(submenu) {
        if (!submenu)
            return;

        if (submenu._parent != this._rootMenu)
            return;

        if (submenu === this._openedSubMenu)
            return;

        if (this._openedSubMenu && this._openedSubMenu.isOpen)
            this._openedSubMenu.close(true);

        this._openedSubMenu = submenu;
    },

    _onRootChildAdded: function(dbusItem, child, position) {
        this._rootMenu.addMenuItem(MenuItemFactory.createItem(this, child), position);
    },

    _onRootChildRemoved: function(dbusItem, child) {
        // children like to play hide and seek
        // but we know how to find it for sure!
        this._rootMenu._getMenuItems().forEach(function(item) {
            if (item._dbusItem == child)
                item.destroy();
        });
    },

    _onRootChildMoved: function(dbusItem, child, oldpos, newpos) {
        MenuUtils.moveItemInMenu(this._rootMenu, dbusItem, newpos);
    },

    _onMenuOpened: function(menu, state) {
        if (!this._rootItem) return;

        if (state) {
            if (this._openedSubMenu && this._openedSubMenu.isOpen)
                this._openedSubMenu.close();

            this._rootItem.handle_event("opened", null, 0);
            this._rootItem.send_about_to_show();
        } else {
            this._rootItem.handle_event("closed", null, 0);
        }
    },

    destroy: function() {
        if (this._rootMenu)
            Util.disconnectArray(this._rootMenu, this._menuDisconnectHandlers);

        if (this._rootItem)
            Util.disconnectArray(this._rootItem, this._rootItemDisconnectHandlers);

        if (this._client)
            this._client.destroy();

        this._client   = null;
        this._rootItem = null;
        this._rootMenu = null;
    }
};
