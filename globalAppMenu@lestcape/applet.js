const Gio = imports.gi.Gio;
const St = imports.gi.St;
const Signals = imports.signals;
const Lang = imports.lang;

const Applet = imports.ui.applet;
const Main = imports.ui.main;
const Settings = imports.ui.settings;
const PopupMenu = imports.ui.popupMenu;

const AppletPath = imports.ui.appletManager.applets['globalAppMenu@lestcape'];
const IndicatorAppMenuWatcher = AppletPath.indicatorAppMenuWatcher;
const Cinnamon = imports.gi.Cinnamon;
//const ConfigurableMenus = AppletPath.configurableMenus;

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
            this.icon_signal_id = 0;
            this.label_signal_id = 0;

            this.settings = new Settings.AppletSettings(this, this.uuid, instance_id);
            this.indicatorDbus = new IndicatorAppMenuWatcher.IndicatorAppMenuWatcher(this, IndicatorAppMenuWatcher.AppmenuMode.MODE_STANDARD);
            this.indicatorDbus.connect('on_appmenu_changed', Lang.bind(this, this._on_appmenu_changed));
        }
	catch(e) {
            Main.notify("init error " + e.message);
            global.logError(e);
        }
    },

    _on_appmenu_changed: function(indicator, window) {
      try {
        if((this.menu) && (this.menu.isOpen))
            this.menu.close();
        this.menu = null;
        if(this.icon_signal_id > 0)
            this.actorIcon.disconnect(this.icon_signal_id);
        if(this.label_signal_id > 0)
            this.actorlabel.disconnect(this.label_signal_id);
        this.icon_signal_id = 0;
        this.label_signal_id = 0;
        this.actor.destroy_all_children();
        if(window) {
            let app = this.indicatorDbus.get_app_for_window(window);
            if(app) {
                //Main.notify("app found" + app.get_name());
                let icon = app.create_icon_texture(this._panelHeight);
                this.actorlabel = new St.Label({ style_class: 'applet-label', reactive: true, track_hover: true, text: app.get_name() });
                this.actorIcon = new St.BoxLayout({ style_class: 'applet-box', reactive: true, track_hover: true });
                this.actorIcon.add(icon, { y_align: St.Align.MIDDLE, y_fill: false });
                this.actor.add(this.actorIcon, { y_align: St.Align.MIDDLE, y_fill: false });
                this.actor.add(this.actorlabel, { y_align: St.Align.MIDDLE, y_fill: false });
                
                this.menu = this.indicatorDbus.get_menu_for_window(window);
                if(this.menu) {
                    this.icon_signal_id = this.actorIcon.connect('button-press-event', Lang.bind(this, this._onIconButtonPressEvent));
                    this.label_signal_id = this.actorlabel.connect('button-press-event', Lang.bind(this, this._onIconButtonPressEvent));
                } else {
                    //Main.notify("menu not found " + app.get_name());
                }
            } else {
                Main.notify("app not found");
            }
        }
      }catch(e){Main.notify("Errors", e.message);}
    },

    on_applet_removed_from_panel: function() {
    },

    _onIconButtonPressEvent: function(actor, event) {
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
