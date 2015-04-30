// Copyright (C) 2011 Giovanni Campagna
// Copyright (C) 2013-2014 Jonas Kümmerlin <rgcjonas@gmail.com>
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

const Lang = imports.lang;
const Signals = imports.signals;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const GdkPixbuf = imports.gi.GdkPixbuf;
const Main = imports.ui.main;

const AppletPath = imports.ui.appletManager.applets['globalAppMenu@lestcape'];
const Utility = AppletPath.utility;
const ConfigurableMenus = AppletPath.configurableMenus;

const BusClientProxy = Gio.DBusProxy.makeProxyWrapper(Utility.DBusMenu);
const BusGtkClientProxy = Gio.DBusProxy.makeProxyWrapper(Utility.DBusGtkMenu);
const ActionsGtkClientProxy = Gio.DBusProxy.makeProxyWrapper(Utility.ActionsGtk);

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
    //'target'            : GLib.VariantType.new("v"),
    'accel'             : GLib.VariantType.new("s"),
};

const DefaultValues = {
    'visible'    : GLib.Variant.new_boolean(true),
    'enabled'    : GLib.Variant.new_boolean(true),
    'label'      : GLib.Variant.new_string(""),
    'type'       : GLib.Variant.new_string(""),
    'action'     : GLib.Variant.new_string(""),
    'accel'      : GLib.Variant.new_string("")
    // elements not in here must return null
};

const IconTheme = Gtk.IconTheme.get_default();

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
        if (name in MandatedTypes && value && value.is_of_type && !value.is_of_type(MandatedTypes[name]))
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
    },

    compare_new: function(name, new_value) {
        if(!(name in MandatedTypes))
            return true; 
        if (name in MandatedTypes && new_value && new_value.is_of_type && !new_value.is_of_type(MandatedTypes[name]))
            return false;

        let old_value = this.get(name);
        if (old_value == new_value)
            return false;
        if (new_value && !old_value || old_value && !new_value)
            return true;

        let is_old_container = old_value.is_container();
        let is_new_container = new_value.is_container();

        if ((!is_old_container) && (!is_new_container)) {
            return (old_value.compare(new_value) != 0);
        } else if (is_old_container != is_new_container)
            return true;

        let array_old = old_value.deep_unpack();
        let array_new = new_value.deep_unpack();
        if(array_old.length != array_new.length)
            return true;
        for(let child in array_old) {
            if(!(child in array_new) || (array_old[child] != array_new[child]))
                return true;
        }
        return false;
    },

    get_string: function(prop_name) {
        let prop = this.get_variant(prop_name);
        return prop ? prop.get_string()[0] : null;
    },

    get_variant: function(prop_name) {
        return this.get(prop_name);
    },

    get_bool: function(prop_name) {
        let prop  = this.get_variant(prop_name);
        return prop ? prop.get_boolean() : false;
    },

    get_int: function(prop_name) {
        let prop = this.get_variant(prop_name);
        return prop ? prop.get_int32() : 0;
    },

    set_variant: function(prop, value) {
        //if (new_value && !old_value || old_value && !new_value || old_value.compare(new_value) != 0)
        if (this.compare_new(prop, value)) {
            this.set(prop, value);
            return true;
        }
        return false;
    }
};

/**
 * Represents a single menu item
 */
function DbusMenuItem(id, children_ids, properties, client) {
    this._init(id, children_ids, properties, client);
}

DbusMenuItem.prototype = {
    __proto__: ConfigurableMenus.PopupMenuAbstractFactory.prototype,

    // will steal the properties object
    _init: function(id, children_ids, properties, client) {
        ConfigurableMenus.PopupMenuAbstractFactory.prototype._init.call(this, id, children_ids, this._createParameters(properties, client));
    },

    // FIXME We really don't need the PropertyStore object, and some private function
    // could make a clean on our "unsave" variants.
    _createParameters: function(properties, client) {
        this._client = client;
        let propStore = new PropertyStore(properties);
        let params = {};
        if("label" in properties)
            params.label = propStore.get_string("label").replace(/_([^_])/, "$1");
        if("accel" in properties)
            params.accel = this._getAccel(propStore.get_string("accel"));
        if("enabled" in properties)
            params.sensitive = propStore.get_bool("enabled");
        if("visible" in properties)
            params.visible = propStore.get_bool("visible");
        if("toggle-type" in properties)
            params.toggleType = propStore.get_string("toggle-type");
        if("toggle-state" in properties)
            params.toggleState = propStore.get_int("toggle-state");
        if("icon-name" in properties)
            params.iconName = propStore.get_string("icon-name");
        if("icon-data" in properties)
            params.iconData = this._getGdkIcon(propStore.get_variant("icon-data"));
        if(("children-display" in properties)||("type" in properties))
            params.type = this._getFactoryType(propStore.get_string('children-display'), propStore.get_string('type'))
        if("action" in properties)
            params.action = propStore.get_string("action").replace("unity.", "");
        if("param-type" in properties)
            params.paramType = propStore.get_variant("param-type");
        return params;
    },

    updatePropertiesAsVariant: function(properties) {
        let propStore = new PropertyStore(properties);
        if("label" in properties)
            this.setLabel(propStore.get_string("label").replace(/_([^_])/, "$1"));
        if("accel" in properties)
            this.setAccel(this._getAccel(propStore.get_string("accel")));
        if("enabled" in properties)
            this.setSensitive(propStore.get_bool("enabled"));
        if("visible" in properties)
            this.setVisible(propStore.get_bool("visible"));
        if("toggle-type" in properties)
            this.setToggleType(propStore.get_string("toggle-type"));
        if("toggle-state" in properties)
            this.setToggleState(propStore.get_int("toggle-state"));
        if("icon-name" in properties)
            this.setIconName(propStore.get_string("icon-name"));
        if("icon-data" in properties)
            this.setGdkIcon(this._getGdkIcon(propStore.get_variant("icon-data")));
        if(("children-display" in properties)||("type" in properties))
            this.setFactoryType(this._getFactoryType(propStore.get_string('children-display'), propStore.get_string('type')));
        if("action" in properties)
            this.setAction(propStore.get_string("action").replace("unity.", ""));
        if("param-type" in properties)
            this.setParamType(propStore.get_variant("param-type"));
    },

    getItemById: function(id) {
        return this._client.get_item(id);
    },

    handleEvent: function(event, params) {
        if(event in ConfigurableMenus.FactoryEventTypes) {
            this._client.send_event(this._id, event, params, 0);
            if(event == ConfigurableMenus.FactoryEventTypes.opened)
                this._client.send_about_to_show(this._id);
        }
    },

    _getAccel: function(accel_name) {
        if (accel_name) {
            [key, mods] = Gtk.accelerator_parse(accel_name);
            return Gtk.accelerator_get_label(key, mods);
        }
        return null;
    },

    _getFactoryType: function(child_display, child_type) {
        if((child_display) || (child_type)) {
            if ((child_display == "rootmenu")||(this._id == this._client.get_root_id()))
                return ConfigurableMenus.FactoryClassTypes.RootMenuClass;
            if (child_display == "submenu")
                return ConfigurableMenus.FactoryClassTypes.SubMenuMenuItemClass;
            else if (child_display == "section")
                return ConfigurableMenus.FactoryClassTypes.MenuSectionMenuItemClass;
            else if (child_type == "separator")
                return ConfigurableMenus.FactoryClassTypes.SeparatorMenuItemClass;
            /*else if (this._client.get_root() == this)
                return ConfigurableMenus.FactoryClassTypes.SeparatorMenuItemClass;*/
            return ConfigurableMenus.FactoryClassTypes.MenuItemClass;
        }
        return null;
    },

    _getGdkIcon: function(value) {
        try {
            if (value) {
                let data = value.get_data_as_bytes()
                let stream = Gio.MemoryInputStream.new_from_bytes(data);
                return GdkPixbuf.Pixbuf.new_from_stream(stream, null);
            }
        } catch(e) {
            global.log("Error loading icon.");
        }
        return null;
    },

    destroy: function() {
        if(this._client) {
            ConfigurableMenus.PopupMenuAbstractFactory.prototype.destroy.call(this);
            this._client = null;
        }
    }
};

/**
 * The client does the heavy lifting of actually reading layouts and distributing events
 */
function DBusClient(busName, busPath) {
    this._init(busName, busPath);
}

DBusClient.prototype = {

    _init: function(busName, busPath) {
        this._busName = busName;
        this._busPath = busPath;
        this._idLayoutUpdate = 0;
        this._shell_menu = null;
        // Will be set to true if a layout update is requested while one is already in progress
        // then the handler that completes the layout update will request another update
        this._flagLayoutUpdateRequired = false;
        this._flagLayoutUpdateInProgress = false;
        // Property requests are queued
        this._propertiesRequestedFor = []; // ids

        let init_id = this.get_root_id();

        this._items = {};
        this._items[init_id] = new DbusMenuItem(init_id, [],
            { 'children-display': GLib.Variant.new_string('rootmenu'), 'visible': GLib.Variant.new_boolean(false) }, this);

        this._proxy_menu = this._start_main_proxy();
    },

    get_shell_menu: function() {
        return this._shell_menu;
    },

    set_shell_menu: function(shell_menu) {
        this._shell_menu = shell_menu;
    },

    get_root: function() {
        if (this._items)
            return this._items[this.get_root_id()];
        return null;
    },

    get_root_id: function() {
        return 0;
    },

    _start_main_proxy: function() {
        let proxy = new BusClientProxy(Gio.DBus.session, this._busName, this._busPath,
            Lang.bind(this, this._clientReady));
        return proxy;
    },

    _requestLayoutUpdate: function() {
        if(this._idLayoutUpdate != 0)
            this._idLayoutUpdate = 0;
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
        if(this._proxy_menu) {
            this._proxy_menu.GetGroupPropertiesRemote(this._propertiesRequestedFor, [],
                Lang.bind(this, this._endRequestProperties));
            this._propertiesRequestedFor = [];
        }
        return false;
    },

    _endRequestProperties: function(result, error) {
        if (error) {
            global.logWarning("Could not retrieve properties: "+error);
        } else if (this._items) {
            // for some funny reason, the result array is hidden in an array
            result[0].forEach(function([id, properties]) {
                if (!(id in this._items))
                    return;

                this._items[id].updatePropertiesAsVariant(properties);
            }, this);
        }
    },

    // Traverses the list of cached menu items and removes everyone that is not in the list
    // so we don't keep alive unused items
    _gcItems: function() {
        if (this._items) {
            let tag = new Date().getTime();

            let toTraverse = [ this.get_root_id() ];
            while (toTraverse.length > 0) {
                let item = this.get_item(toTraverse.shift());
                item._dbusClientGcTag = tag;
                Array.prototype.push.apply(toTraverse, item.getChildrenIds());
            }

            for (let id in this._items)
                if (this._items[id]._dbusClientGcTag != tag)
                    delete this._items[id];
        }
    },

    // the original implementation will only request partial layouts if somehow possible
    // we try to save us from multiple kinds of race conditions by always requesting a full layout
    _beginLayoutUpdate: function() {
        // we only read the type property, because if the type changes after reading all properties,
        // the view would have to replace the item completely which we try to avoid
        if(this._proxy_menu) {
            this._proxy_menu.GetLayoutRemote(0, -1, [ 'type', 'children-display' ], Lang.bind(this, this._endLayoutUpdate));
            this._flagLayoutUpdateInProgress = true;
        }
        this._flagLayoutUpdateRequired = false;

    },

    _endLayoutUpdate: function(result, error) {
        if (error) {
            global.logWarning("While reading menu layout: "+error);
            return;
        }

        let [ revision, root ] = result;
        this._doLayoutUpdate(root);

        this._gcItems();

        if (this._flagLayoutUpdateRequired)
            this._beginLayoutUpdate();
        else
            this._flagLayoutUpdateInProgress = false;
    },

    _doLayoutUpdate: function(item) {
        let [ id, properties, children ] = item;
        if(this._items) {
            let children_unpacked = children.map(function(child) { return child.deep_unpack(); });
            let children_ids = children_unpacked.map(function(child) { return child[0]; });

            // make sure all our children exist
            children_unpacked.forEach(this._doLayoutUpdate, this);

            // make sure we exist
            if (id in this._items) {
                // we do, update our properties if necessary
                this._items[id].updatePropertiesAsVariant(properties);

                // make sure our children are all at the right place, and exist
                let old_children_ids = this._items[id].getChildrenIds();
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
                        this._items[id].addChild(i, children_ids[i]);
                    } else {
                        // old child found, reuse it!
                        this._items[id].moveChild(children_ids[i], i);
                    }
                }

                // remove any old children that weren't reused
                old_children_ids.forEach(function(child_id) {
                    this._items[id].removeChild(child_id); 
                }, this);
            } else {
                // we don't, so let's create us
                this._items[id] = new DbusMenuItem(id, children_ids, properties, this);
                this._requestProperties(id);
            }
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
        if(this._proxy_menu) {
            this._proxy_menu.connectSignal("LayoutUpdated", Lang.bind(this, this._onLayoutUpdated));
            this._proxy_menu.connectSignal("ItemsPropertiesUpdated", Lang.bind(this, this._onPropertiesUpdated));
        }
    },

    get_item: function(id) {
        if ((this._items)&&(id in this._items))
            return this._items[id];

        global.logWarning("trying to retrieve item for non-existing id "+id+" !?");
        return null;
    },

    // we don't need to cache and burst-send that since it will not happen that frequently
    send_about_to_show: function(id) {
        if(this._proxy_menu) {
            this._proxy_menu.AboutToShowRemote(id, Lang.bind(this, function(result, error) {
                if (error)
                    global.logWarning("while calling AboutToShow: "+error);
                else if (result && result[0])
                    this._requestLayoutUpdate();
            }));
        }
    },

    // Fake about to show for firefox: https://bugs.launchpad.net/plasma-widget-menubar/+bug/878165
    _fake_send_about_to_show: function() {
        if(this._proxy_menu) {
            this._proxy_menu.GetLayoutRemote(0, -1, [ 'type', 'children-display' ],
                Lang.bind(this, function(result, error) {
                    if (error) {
                        global.logWarning("Could call GetLayout: "+error);
                        //FIXME: show message to the user?
                    }
                    let [ revision, root ] = result;
                    let [ id, properties, children ] = root;
                    let children_unpacked = children.map(function(child) { return child.deep_unpack(); });
                    let children_ids = children_unpacked.map(function(child) { return child[0]; });
                    children_ids.forEach(function(child_id) {
                        this._proxy_menu.AboutToShowRemote(child_id, 
                            Lang.bind(this, function(result, error){})); // we don't care
                    }, this);
                })
            );
        }
    },

    send_event: function(id, event, params, timestamp) {
        if(this._proxy_menu) {
            if (!params)
                params = GLib.Variant.new_int32(0);
            this._proxy_menu.EventRemote(id, event, params, timestamp, 
                function(result, error) {}); // we don't care
        }
    },

    _onLayoutUpdated: function(proxy, sender, items) {
        //if(items[1] == 0)
        //    this._fake_send_about_to_show();
        //else
        if(this._idLayoutUpdate == 0) {
            this._idLayoutUpdate = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE,
                Lang.bind(this, this._requestLayoutUpdate));
        }
    },

    _onPropertiesUpdated: function(proxy, name, [changed, removed]) {
        if (this._items) {
            changed.forEach(function([id, properties]) {
                if (!(id in this._items))
                    return;

                this._items[id].updatePropertiesAsVariant(properties);
            }, this);
            removed.forEach(function([id, propNames]) {
                if (!(id in this._items))
                    return;

                let properties = {};            
                propNames.forEach(function(propName) {
                    properties[propName] = null;
                }, this);
                this._items[id].updatePropertiesAsVariant(properties);
            }, this);
        }
    },

    destroy: function() {
        if(this._proxy_menu) {
            Signals._disconnectAll.apply(this._proxy_menu);
            this._proxy_menu = null;
            let root = this.get_root();
            root.destroy();
            this._items = null;
        }
    }
};

function DBusClientGtk(busName, busPath) {
    this._init(busName, busPath);
}

DBusClientGtk.prototype = {
    __proto__: DBusClient.prototype,

    _init: function(busName, busPath) {
        DBusClient.prototype._init.call(this, busName, busPath);
        this.labels_ids = {};
        this._idActionsUpdate = 0;
        this.gtk_menubar_menus = null;
    },

    get_root_id: function() {
        return "02"; //FIXME will start always on 02?
    },

    _start_main_proxy: function() {
        let proxy = new BusGtkClientProxy(Gio.DBus.session, this._busName, this._busPath,
            Lang.bind(this, this._clientReady));
        return proxy;
    },

    _requestActionsUpdate: function() {
        if(this._idActionsUpdate != 0)
            this._idActionsUpdate = 0;
        let action_ids = [];
        if(this._proxy_action)
            this._proxy_action.DescribeAllRemote(Lang.bind(this, this._endActionsUpdate));
    },

    _endActionsUpdate: function(result, error) {//FIXME not all values are updated.
        if (error) {
            global.logWarning("While reading menu actions: "+error);
            return;
        }
        if((result) && (result[0])) {
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
                this._items[id].setSensitive(properties[0]);
                if(properties[1])
                    this._items[id].setParamType(GLib.Variant.new("g", properties[1]));
                else
                    this._items[id].setParamType(GLib.Variant.new("g", ""));

                if((properties[2])&&(properties[2].length > 0)) {
                    this._items[id].setToggleType('checkmark');
                    let value = properties[2][0].deep_unpack();
                    this._items[id].setToggleState((value ? 1 : 0));
                } else if (this._items[id].getToggleState()) {
                    this._items[id].setToggleState(0);
                }
            }
        }
    },

    _create_actions_ids: function() {
        this.actions_ids = {};//FIXME add and remove better?
        let theme = Gtk.IconTheme.get_default();
        for(let id in this._items) {
            let action_id = this._items[id].getAction();
            if(action_id) {
                this.actions_ids[action_id] = id;
                try {
                    // FIXME we need to find a better way to get more standar gtk icons
                    // using the gtk-action-id.
                    let gtk_icon_name = action_id.toLowerCase();
                    if(IconTheme.has_icon(gtk_icon_name)) {
                        let icon = IconTheme.load_icon(gtk_icon_name, 25,
                                       Gtk.IconLookupFlags.GENERIC_FALLBACK);
                        this._items[id].setGdkIcon(icon);
                    }
                } catch(e) {
                   global.logWarning("While reading actions ids: " + error);
                }
            }
        }
    },

    _requestLayoutUpdate: function() {
        if(this._idLayoutUpdate != 0)
            this._idLayoutUpdate = 0;
        if (this._flagLayoutUpdateInProgress)
            this._flagLayoutUpdateRequired = true;
        else
            this._beginLayoutUpdate();
    },

    // FIXME Call End over the Cinnamon restart, will crash some Gtk applications.
    // This is because we need to call End the same number of times that we call Start,
    // and this can not be a waranty is Cinnamon destroy the object on the middle of
    // the process. So, we can call End when we call Start, but possible we not recive
    // some changes on the menu structure during the life of the Gtk applications or a
    // Cinnamon restart, but we don't like a glib-gio error with a corresponding core dump
    // for the Gtk applications.
    // GLib-GIO:ERROR: g_menu_exporter_group_unsubscribe: assertion failed:
    // (group->subscribed >= count)
    _beginLayoutUpdate: function() {
        this._flagLayoutUpdateRequired = false;
        if(this._proxy_menu) {
            this._flagLayoutUpdateInProgress = true;
            let init_menu = [];
            for (let x = 0; x < 1024; x++)
                init_menu.push(x);
            this._proxy_menu.StartRemote(init_menu, Lang.bind(this, this._endLayoutUpdate));
            this._proxy_menu.EndRemote(init_menu, Lang.bind(this, function(result, error) {})); // Nothing to do
        }
    },

    _endLayoutUpdate: function(result, error) {
        if (error) {
            global.logWarning("While reading menu layout: " + error);
            return;
        }

        //Now unpack the menu and create a fake root item?
        if((result) && (result[0])) {
            let init_id = this.get_root_id();
            this.gtk_menubar_menus = {};
            this.gtk_menubar_menus[init_id] = [];
            result[0].forEach(function([menu_pos, section_pos, section_items]) {
                this.gtk_menubar_menus["" + menu_pos + section_pos] = section_items;
            }, this);
            this._doLayoutUpdate(init_id, { "children-display": GLib.Variant.new_string("rootmenu"), 'visible': GLib.Variant.new_boolean(false) } );
        }

        this._gcItems();
        this._create_actions_ids();

        if (this._flagLayoutUpdateRequired)
            this._beginLayoutUpdate();
        else
            this._flagLayoutUpdateInProgress = false;
    },

    _doLayoutUpdate: function(id, properties) {
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
                        // FIXME We used here the label of the item to identify an item,
                        // but could be found a better id to handle this, the position
                        // is not a good one.
                        id_sub = "" + id + "" + menu_section["label"].unpack();//+ pos;
                        children_ids.push(id_sub);
                        this._doLayoutUpdate(id_sub, menu_section);
                    }
                }
            }

            if (id in this._items) {
                // we do, update our properties if necessary
                this._items[id].updatePropertiesAsVariant(properties);

                // make sure our children are all at the right place, and exist
                let old_children_ids = this._items[id].getChildrenIds();
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
                        this._items[id].addChild(i, children_ids[i]);
                    } else {
                        // old child found, reuse it!
                        this._items[id].moveChild(children_ids[i], i);
                    }
                }

                // remove any old children that weren't reused
                old_children_ids.forEach(function(child_id) { 
                    this._items[id].removeChild(child_id); 
                }, this);
            } else {
                // we don't, so let's create us
                this._items[id] = new DbusMenuItem(id, children_ids, properties, this);
                //this._requestProperties(id);
            }
        } catch (e) {
            global.log("Error " + e.message);
        }
        return id;
    },

    send_about_to_show: function(id) {
    },

    send_event: function(id, event, params, timestamp) {//FIXME no match signal id
        let action_id = this._items[id].getAction();
        if((action_id)&&(this._proxy_action)) {
            let plataform = {};
            if(!params)
                params = this._items[id].getParamType();
            if(!params) 
                params = GLib.Variant.new("av", []);
            this._proxy_action.ActivateRemote(action_id, params, plataform,
                function(result, error) {}); // we don't care
        }
    },

    _onLayoutUpdated: function() {
        if(this._idLayoutUpdate == 0) {
            this._idLayoutUpdate = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE,
                Lang.bind(this, this._requestLayoutUpdate));
        }
    },

    _onActionsUpdated: function() {
        if(this._idActionsUpdate == 0) {
            this._idActionsUpdate = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE,
                Lang.bind(this, this._requestActionsUpdate));
        }
    },

    _clientReady: function(result, error) {
        if (error) {
            global.logWarning("Could not initialize menu proxy: "+error);
            //FIXME: show message to the user?
        }
        this._proxy_action = new ActionsGtkClientProxy(Gio.DBus.session, this._busName, this._busPath,
            Lang.bind(this, this._clientActionReady));
    },

    _clientActionReady: function(result, error) {
        if (error) {
            global.logWarning("Could not initialize menu proxy: "+error);
            //FIXME: show message to the user?
        }
        this._requestLayoutUpdate();
        this._requestActionsUpdate();

        // listen for updated layouts and actions
        this._idLayoutUpdate = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, Lang.bind(this, function() {
            if(this._proxy_menu)
                this._proxy_menu.connectSignal("Changed", Lang.bind(this, this._onLayoutUpdated));
            if(this._proxy_action)
                this._proxy_action.connectSignal("Changed", Lang.bind(this, this._onActionsUpdated));
        }));
    },

    destroy: function() {
        if(this._proxy_menu) {
            DBusClient.prototype.destroy.call(this);
            this._proxy_menu = null;
        }
        if(this._proxy_action) {
            Signals._disconnectAll.apply(this._proxy_action);
            this._proxy_action = null;
        }
    }
};
