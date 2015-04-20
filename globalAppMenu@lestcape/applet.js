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

const St = imports.gi.St;
const Lang = imports.lang;

const Applet = imports.ui.applet;
const Main = imports.ui.main;
const Settings = imports.ui.settings;
const PopupMenu = imports.ui.popupMenu;

const AppletPath = imports.ui.appletManager.applets['globalAppMenu@lestcape'];
const IndicatorAppMenuWatcher = AppletPath.indicatorAppMenuWatcher;
const ConfigurableMenus = AppletPath.configurableMenus;

function MyApplet(metadata, orientation, panel_height, instance_id) {
    this._init(metadata, orientation, panel_height, instance_id);
}

MyApplet.prototype = {
    __proto__: Applet.Applet.prototype,

    _init: function(metadata, orientation, panel_height, instance_id) {
        Applet.Applet.prototype._init.call(this, orientation, panel_height, instance_id);
        try {
            this.uuid = metadata["uuid"];
            this.orientation = orientation;

            this.set_applet_tooltip("Global application menu");
            this.status_notifier_watcher = null;
            this._indicator_icons = [];

            this.actorIcon = new St.Bin();
            this.actorLabel = new St.Label({ style_class: 'applet-label' });
            this.actor.add(this.actorIcon, { y_align: St.Align.MIDDLE, y_fill: false });
            this.actor.add(this.actorLabel, { y_align: St.Align.MIDDLE, y_fill: false });

            this.settings = new Settings.AppletSettings(this, this.uuid, instance_id);
           /*this.menuFactory = new ConfigurableMenus.MenuFactory(this, this.orientation, {
                RootMenuClass: Applet.AppletPopupMenu,
                MenuItemClass: PopupMenu.PopupMenuItem,
                SubMenuMenuItemClass: PopupMenu.PopupSubMenuMenuItem,
                MenuSectionMenuItemClass: PopupMenu.PopupMenuSection,
                SeparatorMenuItemClass: PopupMenu.PopupSeparatorMenuItem
            });*/
            /*this.menuFactory = new ConfigurableMenus.MenuFactory(this, this.orientation, {
                RootMenuClass: ConfigurableMenus.ConfigurableMenuApplet,
                MenuItemClass: ConfigurableMenus.ConfigurablePopupMenuItem,
                SubMenuMenuItemClass: ConfigurableMenus.ConfigurablePopupSubMenuMenuItem,
                MenuSectionMenuItemClass: ConfigurableMenus.ConfigurablePopupMenuSection,
                SeparatorMenuItemClass: PopupMenu.PopupSeparatorMenuItem
            });*/
            this.menuFactory = new ConfigurableMenus.MenuFactory(this, this.orientation, {
                RootMenuClass: ConfigurableMenus.ConfigurableMenuApplet,
                MenuItemClass: PopupMenu.PopupMenuItem,
                //SubMenuMenuItemClass: ConfigurableMenus.ConfigurablePopupSubMenuMenuItem,
                SubMenuMenuItemClass: PopupMenu.PopupSubMenuMenuItem,
                MenuSectionMenuItemClass: PopupMenu.PopupMenuSection,
                SeparatorMenuItemClass: PopupMenu.PopupSeparatorMenuItem
            });
            this.menuFactory.connect("dropped", Lang.bind(this, this._on_menu_dropped));

            let icon_size = this._get_icon_size();

            this.indicatorDbus = new IndicatorAppMenuWatcher.IndicatorAppMenuWatcher(
                   IndicatorAppMenuWatcher.AppmenuMode.MODE_STANDARD, icon_size);
            this.indicatorDbus.connect('on_appmenu_changed', Lang.bind(this, this._on_appmenu_changed));
        }
	catch(e) {
            Main.notify("init error " + e.message);
            global.logError(e);
        }
    },

    _on_appmenu_changed: function(indicator, window) {
      try {
        let newLabel = null;
        let newIcon = null;
        let newMenu = null;
        if(window) {
            let app = this.indicatorDbus.get_app_for_window(window);
            if(app) {
                newIcon = this.indicatorDbus.get_icon_for_window(window);
                newLabel = app.get_name();
                let dbus_menu = this.indicatorDbus.get_menu_for_window(window);
                if(dbus_menu) {
                    newMenu = dbus_menu.get_shell_menu();
                    if(!newMenu) {
                        let menuManager = new PopupMenu.PopupMenuManager(this);
                        newMenu = this.menuFactory.build_shell_menu(dbus_menu, menuManager);
                    }
                }
            }
        }
        this._try_to_show(newLabel, newIcon, newMenu);

      }catch(e){Main.notify("Errors", e.message);}
    },

    _on_menu_dropped: function(fact, menu) {
       if(menu)
          menu.destroy();
    },

    _try_to_show: function(newLabel, newIcon, newMenu) {
        if((newLabel != null)&&(newIcon != null)) {
           this._change_appmenu(newLabel, newIcon, newMenu);
        } else  {
           this._clean_appmenu();
        }
        //Main.notify(" " + newLabel + " " + newIcon)        
    },

    _change_appmenu: function(newLabel, newIcon, newMenu) {
        if(this._is_new_menu(newMenu)) {
            this._close_menu();
            this.menu = newMenu;
            if((this.menu)&&(this.menu.default_displayed))
                this.menu.open();
        }
        if(this._is_new_app(newLabel, newIcon)) {
            this.actorLabel.set_text(newLabel);
            this.actorIcon.set_child(newIcon);
        }
    },

    _close_menu: function() {
        if((this.menu)&&(this.menu.isOpen))
            this.menu.close();
    },

    _clean_appmenu: function() {
        this._close_menu();
        this.menu = null;
        this.actorIcon.set_child(null);
        this.actorLabel.set_text("");
    },

    _is_new_app: function(newLabel, newIcon) {
        return ((newIcon != this.actorIcon.get_child())||
                (newLabel != this.actorLabel.get_text()));
    },

    _is_new_menu: function(newMenu) {
        return (newMenu != this.menu);
    },

    _get_icon_size: function() {
        let icon_size;
        let ui_scale = global.ui_scale;
        if(!ui_scale) ui_scale = 1;
        if (this._scaleMode)
            icon_size = this._panelHeight * Applet.COLOR_ICON_HEIGHT_FACTOR / ui_scale;
        else
            icon_size = Applet.FALLBACK_ICON_HEIGHT;
        return icon_size;
    },

    on_panel_height_changed: function() {
        let icon_size = this._get_icon_size();
        this.indicatorDbus.set_icon_size(icon_size);
    },

    on_applet_removed_from_panel: function() {
        this.indicatorDbus.destroy();
    },

    on_applet_clicked: function(event) {
        if((this._draggable)&&(!this._draggable.inhibit))
            return false;
        if((this.menu) && (event.get_button() == 1)) {
            this.menu.toggle();
        }
        return false;       
    }
};

function main(metadata, orientation, panel_height, instance_id) {
    let myApplet = new MyApplet(metadata, orientation, panel_height, instance_id);
    return myApplet;
}
