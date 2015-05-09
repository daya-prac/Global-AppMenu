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
const Clutter = imports.gi.Clutter;
const Pango = imports.gi.Pango;
const Cairo = imports.cairo;

const Applet = imports.ui.applet;
const Main = imports.ui.main;
const Settings = imports.ui.settings;
const PopupMenu = imports.ui.popupMenu;


const AppletPath = imports.ui.appletManager.applets['globalAppMenu@lestcape'];
const IndicatorAppMenuWatcher = AppletPath.indicatorAppMenuWatcher;
const ConfigurableMenus = AppletPath.configurableMenus;


function MyMenuFactory() {
   this._init.apply(this, arguments);
}

MyMenuFactory.prototype = {
   __proto__: ConfigurableMenus.MenuFactory.prototype,

   _init: function() {
      ConfigurableMenus.MenuFactory.prototype._init.call(this);
      this.menuLayout = "expanded";
   },

   // RootMenuClass: Applet.AppletPopupMenu,
   // MenuItemClass: PopupMenu.PopupMenuItem,
   // SubMenuMenuItemClass: PopupMenu.PopupSubMenuMenuItem,
   // MenuSectionMenuItemClass: PopupMenu.PopupMenuSection,
   // SeparatorMenuItemClass: PopupMenu.PopupSeparatorMenuItem
   _createShellItem: function(factoryItem, launcher, orientation, menuManager) {
      // Decide whether it's a submenu or not
      let shellItem = null;
      let item_type = factoryItem.getFactoryType();
      if (item_type == ConfigurableMenus.FactoryClassTypes.RootMenuClass)
         shellItem = new ConfigurableMenus.ConfigurableMenuApplet(launcher, orientation, menuManager);
      if (item_type == ConfigurableMenus.FactoryClassTypes.SubMenuMenuItemClass)
         shellItem = new ConfigurableMenus.ConfigurablePopupSubMenuMenuItem("FIXME");
      else if (item_type == ConfigurableMenus.FactoryClassTypes.MenuSectionMenuItemClass)
         shellItem = new ConfigurableMenus.ConfigurablePopupMenuSection();
      else if (item_type == ConfigurableMenus.FactoryClassTypes.SeparatorMenuItemClass)
         shellItem = new PopupMenu.PopupSeparatorMenuItem('');
      else if(item_type == ConfigurableMenus.FactoryClassTypes.MenuItemClass)
         shellItem = new ConfigurableMenus.ConfigurableApplicationMenuItem("FIXME");
      //else
      //    throw new TypeError('Trying to instantiate a shell item with an invalid factory type');
      return shellItem;
   }
};

function GradientLabel() {
   this._init.apply(this, arguments);
}

GradientLabel.prototype = {
   _init: function(text, size) {
      this.text = text;
      this.size = size;

      this.actor = new St.Bin();
      //this.actor.add_effect_with_name("curl", new Clutter.BlurEffect());
      this._drawingArea = new St.DrawingArea({ style_class: 'applet-label' });
      this._drawingArea.connect('repaint', Lang.bind(this, this._onRepaint));
      this._drawingArea.connect('style-changed', Lang.bind(this, this._onStyleChanged));
      this.actor.set_child(this._drawingArea);
      this.margin = 2;
   },

   set_text: function(text) {
      this.text = text;
      this._updateSize();
   },

   set_text: function(text) {
      this.text = text;
      this._updateSize();
   },

   _onStyleChanged: function() {
      this.themeNode = this._drawingArea.get_theme_node();
      this._updateSize();
   },

   _updateSize: function() {
      if(this.themeNode) {
         let font    = this.themeNode.get_font();
         let context = this._drawingArea.get_pango_context();
         let metrics = context.get_metrics(font, context.get_language());
         let width   = Math.min(this.size, this.text.length) * metrics.get_approximate_char_width() / Pango.SCALE;
         let height  =  font.get_size() / Pango.SCALE;
         this._drawingArea.set_width(width);
         this._drawingArea.set_height(height + 2*this.margin);
      }
   },

   _onRepaint: function(area) {
      try {
      let cr = area.get_context();
      let [width, height] = area.get_surface_size();

      let resultText = this.text.substring(0, Math.min(this.size, this.text.length));

      let font = this.themeNode.get_font();
      let context = this._drawingArea.get_pango_context();
      let metrics = context.get_metrics(font, context.get_language());
      let fontSize = height - 2*this.margin;
      let startColor = this.themeNode.get_color('color');

      let weight = Cairo.FontWeight.NORMAL;
      if(font.get_weight() >= 700)
        weight = Cairo.FontWeight.BOLD;
      cr.selectFontFace(font.get_family(), Cairo.FontSlant.NORMAL, weight);
      cr.moveTo(0, height/2 + (metrics.get_descent()/Pango.SCALE) + 1);
      cr.setFontSize(fontSize);

      let shadowPattern = new Cairo.LinearGradient(0, 0, width, height);
      shadowPattern.addColorStopRGBA(0, 0, 0, 0, 1);
      shadowPattern.addColorStopRGBA(1, 0, 0, 0, 0);
      cr.setSource(shadowPattern);

      cr.showText(resultText);
      cr.fill();

      cr.moveTo(1, height/2 + (metrics.get_descent()/Pango.SCALE) + 1);
      cr.setFontSize(fontSize);
      let realPattern = new Cairo.LinearGradient(0, 0, width, height);
      realPattern.addColorStopRGBA(0, startColor.red / 255, startColor.green / 255, startColor.blue / 255, startColor.alpha / 255);
      realPattern.addColorStopRGBA(0.5, startColor.red / 255, startColor.green / 255, startColor.blue / 255, startColor.alpha / 255);
      realPattern.addColorStopRGBA(1, startColor.red / 255, startColor.green / 255, startColor.blue / 255, 0);
      cr.setSource(realPattern);

      cr.showText(resultText);
      cr.fill();
      } catch(e) {Main.notify("err"+ e.message)}
   }
};

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
            this.actorIcon.add_effect_with_name("desaturate", new Clutter.DesaturateEffect());
            this.actorIcon.remove_effect_by_name("desaturate");

            this.actorLabel = new St.Label({ style_class: 'applet-label' });
            this.gradient = new GradientLabel("", 10);
            this.actor.add(this.actorIcon, { y_align: St.Align.MIDDLE, y_fill: false });
            this.actor.add(this.actorLabel, { y_align: St.Align.MIDDLE, y_fill: false });
            this.actor.add(this.gradient.actor, { y_align: St.Align.MIDDLE, y_fill: false });

            this.settings = new Settings.AppletSettings(this, this.uuid, instance_id);

            this.menuFactory = new MyMenuFactory();

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
                    //newMenu = dbus_menu.getShellItem();
                    newMenu = this.menuFactory.getShellMenu(dbus_menu);
                    if(!newMenu) {
                        let menuManager = new ConfigurableMenus.ConfigurableMenuManager(this);
                        newMenu = this.menuFactory.buildShellMenu(dbus_menu, this, this.orientation, menuManager);
                    }

                }
            }
        }

        this._try_to_show(newLabel, newIcon, newMenu);

      }catch(e){Main.notify("Errors", e.message);}
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
        //newLabel = this._normalized_text(newLabel, 10);
        if(this._is_new_app(newLabel, newIcon)) {
            //this.actorLabel.set_text(newLabel);
            this.gradient.set_text(newLabel);
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
        //this.actorLabel.set_text("");
        this.gradient.set_text("");
    },

    _is_new_app: function(newLabel, newIcon) {
        return ((newIcon != this.actorIcon.get_child())||
                (newLabel != this.gradient.text));
    },

    _is_new_menu: function(newMenu) {
        return (newMenu != this.menu);
    },

    _normalized_text: function(text, size) {
       let result = text.substring(0, Math.min(size, text.length));
       return result;
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
