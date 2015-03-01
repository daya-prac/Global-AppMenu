//Este es el applet.....


// Copyright (C) 2014 Jonas Kümmerlin <rgcjonas@gmail.com>
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
const Clutter = imports.gi.Clutter;
const St = imports.gi.St;

const Lang = imports.lang;
const Main = imports.ui.main;
const Panel = imports.ui.panel;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const AppletPath = imports.ui.appletManager.applets['globalAppMenu@lestcape'];
const AppIndicator = AppletPath.appIndicator;
const DBusMenu = AppletPath.dbusMenu;
const Util = AppletPath.util;

/*
 * IndicatorStatusIcon implements an icon in the system status area
 */
function IndicatorStatusIcon(indicator) {
    this._init(indicator);
}

IndicatorStatusIcon.prototype = {
    __proto__: PanelMenu.Button.prototype,
    
    _init: function(indicator) {
        this.parent(null, 'FIXME'); //no name yet (?)
        
        this._indicator = indicator;
        
        this._iconBox = new AppIndicator.IconActor(indicator, Panel.PANEL_ICON_SIZE);
        if (!this._box) // Gnome Shell 3.10
            this.actor.add_actor(this._box = new St.BoxLayout());

        this._box.destroy_all_children();
        this._box.add_actor(this._iconBox);
        Util.connectAndRemoveOnDestroy(this.actor, {
            'button-press-event': Lang.bind(this, this._boxClicked)
        })

        global.log("Adding indicator as status menu");

        Util.connectAndRemoveOnDestroy(this._indicator, {
            'ready': Lang.bind(this, this._display),
            'label': Lang.bind(this, this._updateLabel)
        }, this)

        if (this._indicator.isReady)
            this._display();
    },
    
    _updateLabel: function() {
        var label = this._indicator.label;
        if (label) {
            if (!this._label || !this._labelBin) {
                this._labelBin = new St.Bin({ y_align: St.Align.MIDDLE, y_fill: false });
                this._label = new St.Label();
                this._labelBin.add_actor(this._label);
                this._box.add_actor(this._labelBin);
            }
            this._label.set_text(label);
            if (!this._box.contains(this._labelBin)) this._box.add_actor(this._labelBin); //FIXME: why is it suddenly necessary?
        } else {
            if (this._label) {
                this._labelBin.destroy_all_children();
                this._box.remove_actor(this._labelBin);
                this._labelBin.destroy();
                delete this._labelBin;
                delete this._label;
            }
        }
    },
    
    destroy: function() {
        global.log('destroying '+this._indicator.id+'...')

        // destroy stuff owned by us
        if (this._menuClient)
            this._menuClient.destroy()

        this._iconBox.destroy()

        this._box.destroy_all_children()
        
        //call parent
        this.parent()
    },
    
    _display: function() {
        this._updateLabel()

        this._indicator.getMenuClient(Lang.bind(this, function(client){
            if (client != null) {
                this._menuClient = client
                client.attachToMenu(this.menu)
            }
            
            Main.panel.addToStatusArea("appindicator-"+this._indicator.id, this, 1, 'right')
        }));
    },
    
    _boxClicked: function(actor, event) {
        //HACK: event should be a ClutterButtonEvent but we get only a ClutterEvent (why?)
        //      because we can't access click_count, we'll create our own double click detector.
        var treshold = Clutter.Settings.get_default().double_click_time;
        var now = new Date().getTime();
        if (this._lastClicked && (now - this._lastClicked) < treshold) {
            this._lastClicked = null; //reset double click detector
            this._indicator.open();
        } else {
            this._lastClicked = now;
        }
    }
};
