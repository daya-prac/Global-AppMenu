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

            this.settings = new Settings.AppletSettings(this, this.uuid, instance_id);
            //this.settings.bindProperty(Settings.BindingDirection.IN,
            //    "indicator-location", "indicator_location", this._on_indicator_location_change, null);
            this.menuManager = new PopupMenu.PopupMenuManager(this);
            this.menu = new Applet.AppletPopupMenu(this, this.orientation);
            //this.menu = new ConfigurableMenus.ConfigurableMenuApplet(this, this.orientation);
            this.menuManager.addMenu(this.menu); 
            this.menu.actor.add_style_class_name('menu-background');
            this.indicatorDbus = new IndicatorAppMenuWatcher.IndicatorAppMenuWatcher(IndicatorAppMenuWatcher.AppmenuMode.MODE_STANDARD);
            this.indicatorDbus.connect('on_appmenu_changed', Lang.bind(this, this._on_appmenu_changed));
        }
	catch(e) {
            Main.notify("init error " + e.message);
            global.logError(e);
        }
    },

    _on_appmenu_changed: function(indicator, window, menu_client) {
      try {
        this.actor.destroy_all_children();
        if(window) {
            let tracker = Cinnamon.WindowTracker.get_default();
            let app = tracker.get_window_app(window);
            if(app) {
                let icon = app.create_icon_texture(this._panelHeight);
                let actorlabel = new St.Label({ style_class: 'applet-label', reactive: true, track_hover: true, text: app.get_name() });
                let actorIcon = new St.BoxLayout({ style_class: 'applet-box', reactive: true, track_hover: true });
                actorIcon.add(icon, { y_align: St.Align.MIDDLE, y_fill: false });
                this.actor.add(actorIcon, { y_align: St.Align.MIDDLE, y_fill: false });
                this.actor.add(actorlabel, { y_align: St.Align.MIDDLE, y_fill: false });

                if(menu_client) {
                    menu_client.attachToMenu(this.menu);
                    actorIcon.connect('button-press-event', Lang.bind(this, this._onIconButtonPressEvent));
                    actorlabel.connect('button-press-event', Lang.bind(this, this._onIconButtonPressEvent));
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
        if(event.get_button() == 1) {
            this.menu.toggle();
        }
        return false;
    }
};

function main(metadata, orientation, panel_height, instance_id) {
    let myApplet = new MyApplet(metadata, orientation, panel_height, instance_id);
    return myApplet;
}
