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

const Cinnamon = imports.gi.Cinnamon;
const Applet = imports.ui.applet;
const PopupMenu = imports.ui.popupMenu;
const BoxPointer = imports.ui.boxpointer;
const Clutter = imports.gi.Clutter;
const Gtk = imports.gi.Gtk;
const Main = imports.ui.main;
const St = imports.gi.St;
const Atk = imports.gi.Atk;
const Tweener = imports.ui.tweener;
const Lang = imports.lang;
const Params = imports.misc.params;
const Signals = imports.signals;

const AppletPath = imports.ui.appletManager.applets['globalAppMenu@lestcape'];
const Utility = AppletPath.utility;

const OrnamentType = PopupMenu.Ornament ? PopupMenu.Ornament : {
    NONE: 0,
    CHECK: 1,
    DOT: 2
};

function ConfigurablePointer(arrowSide, binProperties) {
   this._init(arrowSide, binProperties);
}

ConfigurablePointer.prototype = {
   __proto__: BoxPointer.BoxPointer.prototype,

   _init: function(arrowSide, binProperties) {
      BoxPointer.BoxPointer.prototype._init.call (this, arrowSide, binProperties);
      this.actor._delegate = this;
      this.riseArrow = true;
      this.fixCorner = false;
      this.resizeSize = 0;
      this.shiftX = 0;
      this.shiftY = 0;
      try {
         let [res, selectedColor] = Clutter.Color.from_string("#505050");
         this.selectedColor = selectedColor;
      } catch (e) {
         let selectedColor = new Clutter.Color();
         selectedColor.from_string("#505050");
         this.selectedColor = selectedColor;
      }
   },

   setArrow: function(arrow) {
      this.riseArrow = arrow;
      this._border.queue_repaint();
   },

   fixToScreen: function(actor, fixScreen) {
      this.fixCorner = false;
      this.fixScreen = fixScreen;
      this.screenActor = actor;
      this.trySetPosition(actor, this._arrowAlignment);
      this._border.queue_repaint();
   },

   fixToCorner: function(actor, fixCorner) {
      this.fixScreen = false;
      this.fixCorner = fixCorner;
      this.trySetPosition(actor, this._arrowAlignment);
      this._border.queue_repaint();
   },

   setResizeArea: function(resizeSize) {
      this.resizeSize = resizeSize;
      this._border.queue_repaint();
   },

   getCurrentMenuThemeNode: function() {
      return this.themeNode;
   },

   setResizeAreaColor: function(resizeColor) {
      try {
         let [res, selectedColor] = Clutter.Color.from_string(resizeColor);
         this.selectedColor = selectedColor;
      } catch (e) {
         let selectedColor = new Clutter.Color();
         selectedColor.from_string(resizeColor);
         this.selectedColor = selectedColor;
      }
      this._border.queue_repaint();
   },

   trySetPosition: function(sourceActor, alignment) {
      // We need to show it now to force an allocation,
      // so that we can query the correct size.
      //this.actor.show();
      if(this.actor.visible) {
         this._sourceActor = sourceActor;
         this._arrowAlignment = alignment;
         this._reposition(sourceActor, alignment);
      }
   },

   shiftPosition: function(x, y) {
      // We need to show it now to force an allocation,
      // so that we can query the correct size.
      //this.actor.show();
      this.shiftX = x;
      this.shiftY = y;
      if(this.actor.visible) {
         this._reposition(this._sourceActor, this._arrowAlignment);
      }
   },

   _maxPanelSize: function() {
      if(Main.panelManager) {
         if(this._sourceActor) {
            let [x, y] = this._sourceActor.get_transformed_position();
            let i = 0;
            let monitor;
            for (; i < global.screen.get_n_monitors(); i++) {
               monitor = global.screen.get_monitor_geometry(i);
               if(x >= monitor.x && x < monitor.x + monitor.width &&
                  x >= monitor.y && y < monitor.y + monitor.height) {
                  break;
               }
            }
            let maxHeightBottom = 0;
            let maxHeightTop = 0;
            let panels = Main.panelManager.getPanelsInMonitor(i);
            for(let j in panels) {
               if(panels[j].bottomPosition)
                  maxHeightBottom = Math.max(maxHeightBottom, panels[j].actor.height);
               else
                  maxHeightTop = Math.max(maxHeightTop, panels[j].actor.height);
            }
            return [maxHeightBottom, maxHeightTop];
         }
      } else {
         if(!Main.panel2) {
            if(this._arrowSide == St.Side.TOP)
               return [0, Main.panel.actor.height];
            else
               return [Main.panel.actor.height, 0];
         }
         return [Main.panel2.actor.height, Main.panel.actor.height];
      }
      return 0;
   },

   _fixCorner: function(x, y, sourceActor, sourceAllocation, monitor, gap, borderWidth) {
      if((this.fixScreen)||(this.fixCorner)) {
         let [ax, ay] = sourceActor.get_transformed_position();
         if((this._arrowSide == St.Side.TOP)||(this._arrowSide == St.Side.BOTTOM)) {
            if(sourceAllocation.x1 < monitor.x + monitor.width/2) {
               if(this.fixScreen)
                  this._xOffset = -x;
               else
                  this._xOffset = -x + ax;
            } else {
               if((this.fixScreen)||(Math.abs(monitor.x + monitor.width - sourceAllocation.x2) < 10))
                  this._xOffset = -x + monitor.x + monitor.width - this.actor.width;
               else if(this.fixCorner)
                  this._xOffset = -x + ax - this.actor.width + sourceActor.width;
               if((this.fixScreen)||(this.fixCorner))
                  this.setArrowOrigin(this.actor.width - sourceActor.width/2);
            }
         } else {
            if(this.fixScreen) {
               let allocScreen = Cinnamon.util_get_transformed_allocation(this.screenActor);
               this._xOffset = - x + allocScreen.x1 + this.screenActor.width;
               //Main.notify("fixScree: " + Cinnamon.util_get_transformed_allocation(this.screenActor).y1);
               this._yOffset = - y + allocScreen.y1;
            }
         }

         if(this._arrowSide == St.Side.TOP) {//kicker warning
            let borderTop = this.themeNode.get_length('border-top');
            this._yOffset = -borderTop - gap + borderWidth;
         } else if(this._arrowSide == St.Side.BOTTOM) {
            let borderBottom = this.themeNode.get_length('border-bottom');
            this._yOffset = borderBottom + gap;
            if(this.fixScreen)
               this._yOffset += 3;
         }
         // Main.notify("x:" + x + " x1:" + sourceAllocation.x1 + " x2:" + sourceAllocation.x2 + " main:" + (monitor.x - monitor.width));
         //  Main.notify("y:" + y + " y1:" + sourceAllocation.y1 + " y2:" + sourceAllocation.y2 + " main:" + (monitor.x - monitor.height)); 
      } else {
         this._xOffset = 0;
         this._yOffset = 0;
      }
   },

   _shiftActor : function() {
      // Since the position of the BoxPointer depends on the allocated size
      // of the BoxPointer and the position of the source actor, trying
      // to position the BoxPoiner via the x/y properties will result in
      // allocation loops and warnings. Instead we do the positioning via
      // the anchor point, which is independent of allocation, and leave
      // x == y == 0.
      this.actor.set_anchor_point(-(Math.floor(this._xPosition + this.shiftX + this._xOffset)),
                                  -(Math.floor(this._yPosition + this.shiftY + this._yOffset)));
      this._border.queue_repaint();
   },

   _getTopMenu: function(actor) {
      while(actor) {
         if((actor._delegate) && (actor._delegate instanceof PopupMenu.PopupMenu))
            return actor._delegate;
         actor = actor.get_parent();
      }
      return null;
   },

   _reposition: function(sourceActor, alignment) {
try {
      // Position correctly relative to the sourceActor
      let sourceNode = sourceActor.get_theme_node();
      let sourceContentBox = sourceNode.get_content_box(sourceActor.get_allocation_box());
      let sourceAllocation = Cinnamon.util_get_transformed_allocation(sourceActor);
      let sourceCenterX = sourceAllocation.x1 + sourceContentBox.x1 + (sourceContentBox.x2 - sourceContentBox.x1) * this._sourceAlignment;
      let sourceCenterY = sourceAllocation.y1 + sourceContentBox.y1 + (sourceContentBox.y2 - sourceContentBox.y1) * this._sourceAlignment;
      let [minWidth, minHeight, natWidth, natHeight] = this.actor.get_preferred_size();

      // We also want to keep it onscreen, and separated from the
      // edge by the same distance as the main part of the box is
      // separated from its sourceActor
      let monitor = Main.layoutManager.findMonitorForActor(sourceActor);
      this.themeNode = this.actor.get_theme_node();
      let borderWidth = this.themeNode.get_length('-arrow-border-width');
      let arrowBase = this.themeNode.get_length('-arrow-base');
      let borderRadius = this.themeNode.get_length('-arrow-border-radius');
      let margin = (4 * borderRadius + borderWidth + arrowBase);
      let halfMargin = margin / 2;

      let gap = this.themeNode.get_length('-boxpointer-gap');

      let resX, resY;

      switch (this._arrowSide) {
      case St.Side.TOP:
          resY = sourceAllocation.y2 + gap;
          break;
      case St.Side.BOTTOM:
          resY = sourceAllocation.y1 - natHeight - gap;
          break;
      case St.Side.LEFT:
          resX = sourceAllocation.x2 + gap;
          break;
      case St.Side.RIGHT:
          resX = sourceAllocation.x1 - natWidth - gap;
          break;
      }

      // Now align and position the pointing axis, making sure
      // it fits on screen
      switch (this._arrowSide) {
      case St.Side.TOP:
      case St.Side.BOTTOM:
         resX = sourceCenterX - (halfMargin + (natWidth - margin) * alignment);
         resX = Math.max(resX, monitor.x + 10);
         resX = Math.min(resX, monitor.x + monitor.width - (10 + natWidth));
         this.setArrowOrigin(sourceCenterX - resX);
         break;

      case St.Side.LEFT:
      case St.Side.RIGHT:
         resY = sourceCenterY - (halfMargin + (natHeight - margin) * alignment);
         let [maxHeightBottom, maxHeightTop] = this._maxPanelSize();
         let maxPHV = Math.max(maxHeightBottom, maxHeightTop);
         resY = Math.max(resY, monitor.y + maxPHV);
         let topMenu = this._getTopMenu(sourceActor);
         if(Main.panelManager) {
            if(((maxHeightBottom == 0)||(maxHeightTop==0))&&(topMenu)&&(topMenu._arrowSide == St.Side.TOP)) {
               resY = Math.min(resY, monitor.y + monitor.height - (natHeight));
            } else {
               resY = Math.min(resY, monitor.y + monitor.height - (maxPHV + natHeight));
            }
         } else {
            if((!Main.panel2)&&(topMenu)&&(topMenu._arrowSide == St.Side.TOP)) {
               resY = Math.min(resY, monitor.y + monitor.height - (natHeight));
            } else {
               resY = Math.min(resY, monitor.y + monitor.height - (maxPHV + natHeight));
            }
         }

         this.setArrowOrigin(sourceCenterY - resY);
         break;
      }

      let parent = this.actor.get_parent();
      let success, x, y;
      while(!success) {
         [success, x, y] = parent.transform_stage_point(resX, resY);
         parent = parent.get_parent();
      }
      //Main.notify("fixScreen" + this.fixScreen + " fixCorner" + this.fixCorner)
      this._fixCorner(x, y, sourceActor, sourceAllocation, monitor, gap, borderWidth);
      this._xPosition = x;
      this._yPosition = y;
      this._shiftActor();
} catch(e) {
   Main.notify("repos", e.message);
}
   },

   _allocate: function(actor, box, flags) {
      let themeNode = this.actor.get_theme_node();
      let borderWidth = themeNode.get_length('-arrow-border-width');
      let rise = themeNode.get_length('-arrow-rise');
      if(!this.riseArrow) rise = Math.round(rise/2);
      let childBox = new Clutter.ActorBox();
      let availWidth = box.x2 - box.x1;
      let availHeight = box.y2 - box.y1;

      childBox.x1 = 0;
      childBox.y1 = 0;
      childBox.x2 = availWidth;
      childBox.y2 = availHeight;
      this._border.allocate(childBox, flags);

      childBox.x1 = borderWidth;
      childBox.y1 = borderWidth;
      childBox.x2 = availWidth - borderWidth;
      childBox.y2 = availHeight - borderWidth;
      switch (this._arrowSide) {
         case St.Side.TOP:
            childBox.y1 += rise;
            break;
         case St.Side.BOTTOM:
            childBox.y2 -= rise;
            break;
         case St.Side.LEFT:
            childBox.x1 += rise;
            break;
         case St.Side.RIGHT:
            childBox.x2 -= rise;
            break;
      }
      this.bin.allocate(childBox, flags);

      if(this._sourceActor && this._sourceActor.mapped)
         this._reposition(this._sourceActor, this._arrowAlignment);
   },

   _drawBorder: function(area) {
      this.themeNode = this.actor.get_theme_node();

      let borderWidth = this.themeNode.get_length('-arrow-border-width');
      let base = this.themeNode.get_length('-arrow-base');
      let rise = 0;
      if(this.riseArrow)
         rise = this.themeNode.get_length('-arrow-rise');

      let borderRadius = this.themeNode.get_length('-arrow-border-radius');

      let halfBorder = borderWidth / 2;
      let halfBase = Math.floor(base/2);

      let borderColor = this.themeNode.get_color('-arrow-border-color');
      let backgroundColor = this.themeNode.get_color('-arrow-background-color');

      let [width, height] = area.get_surface_size();
      let [boxWidth, boxHeight] = [width, height];
      if(this._arrowSide == St.Side.TOP || this._arrowSide == St.Side.BOTTOM) {
         boxHeight -= rise;
      } else {
         boxWidth -= rise;
      }
      let cr = area.get_context();
      Clutter.cairo_set_source_color(cr, borderColor);

      // Translate so that box goes from 0,0 to boxWidth,boxHeight,
      // with the arrow poking out of that
      if(this._arrowSide == St.Side.TOP) {
         cr.translate(0, rise);
      } else if (this._arrowSide == St.Side.LEFT) {
         cr.translate(rise, 0);
      }

      let [x1, y1] = [halfBorder, halfBorder];
      let [x2, y2] = [boxWidth - halfBorder, boxHeight - halfBorder];

      cr.moveTo(x1 + borderRadius, y1);
      if(this._arrowSide == St.Side.TOP) {
         if(this._arrowOrigin < (x1 + (borderRadius + halfBase))) {
            cr.lineTo(this._arrowOrigin, y1 - rise);
            cr.lineTo(Math.max(x1 + borderRadius, this._arrowOrigin) + halfBase, y1);
         } else if(this._arrowOrigin > (x2 - (borderRadius + halfBase))) {
            cr.lineTo(Math.min(x2 - borderRadius, this._arrowOrigin) - halfBase, y1);
            cr.lineTo(this._arrowOrigin, y1 - rise);
         } else {
            cr.lineTo(this._arrowOrigin - halfBase, y1);
            cr.lineTo(this._arrowOrigin, y1 - rise);
            cr.lineTo(this._arrowOrigin + halfBase, y1);
         }
      }

      cr.lineTo(x2 - borderRadius, y1);

      // top-right corner
      cr.arc(x2 - borderRadius, y1 + borderRadius, borderRadius,
             3*Math.PI/2, Math.PI*2);

      if(this._arrowSide == St.Side.RIGHT) {
         if(this._arrowOrigin < (y1 + (borderRadius + halfBase))) {
            cr.lineTo(x2 + rise, this._arrowOrigin);
            cr.lineTo(x2, Math.max(y1 + borderRadius, this._arrowOrigin) + halfBase);
         } else if(this._arrowOrigin > (y2 - (borderRadius + halfBase))) {
            cr.lineTo(x2, Math.min(y2 - borderRadius, this._arrowOrigin) - halfBase);
            cr.lineTo(x2 + rise, this._arrowOrigin);
         } else {
            cr.lineTo(x2, this._arrowOrigin - halfBase);
            cr.lineTo(x2 + rise, this._arrowOrigin);
            cr.lineTo(x2, this._arrowOrigin + halfBase);
         }
      }

      cr.lineTo(x2, y2 - borderRadius);

      // bottom-right corner
      cr.arc(x2 - borderRadius, y2 - borderRadius, borderRadius,
             0, Math.PI/2);

      if(this._arrowSide == St.Side.BOTTOM) {
         if(this._arrowOrigin < (x1 + (borderRadius + halfBase))) {
            cr.lineTo(Math.max(x1 + borderRadius, this._arrowOrigin) + halfBase, y2);
            cr.lineTo(this._arrowOrigin, y2 + rise);
         } else if(this._arrowOrigin > (x2 - (borderRadius + halfBase))) {
            cr.lineTo(this._arrowOrigin, y2 + rise);
            cr.lineTo(Math.min(x2 - borderRadius, this._arrowOrigin) - halfBase, y2);
         } else {
            cr.lineTo(this._arrowOrigin + halfBase, y2);
            cr.lineTo(this._arrowOrigin, y2 + rise);
            cr.lineTo(this._arrowOrigin - halfBase, y2);
         }
      }

      cr.lineTo(x1 + borderRadius, y2);

      // bottom-left corner
      cr.arc(x1 + borderRadius, y2 - borderRadius, borderRadius,
             Math.PI/2, Math.PI);

      if(this._arrowSide == St.Side.LEFT) {
         if(this._arrowOrigin < (y1 + (borderRadius + halfBase))) {
            cr.lineTo(x1, Math.max(y1 + borderRadius, this._arrowOrigin) + halfBase);
            cr.lineTo(x1 - rise, this._arrowOrigin);
         } else if(this._arrowOrigin > (y2 - (borderRadius + halfBase))) {
            cr.lineTo(x1 - rise, this._arrowOrigin);
            cr.lineTo(x1, Math.min(y2 - borderRadius, this._arrowOrigin) - halfBase);
         } else {
            cr.lineTo(x1, this._arrowOrigin + halfBase);
            cr.lineTo(x1 - rise, this._arrowOrigin);
            cr.lineTo(x1, this._arrowOrigin - halfBase);
         }
      }

      cr.lineTo(x1, y1 + borderRadius);

      // top-left corner
      cr.arc(x1 + borderRadius, y1 + borderRadius, borderRadius,
             Math.PI, 3*Math.PI/2);

      Clutter.cairo_set_source_color(cr, backgroundColor);
      cr.fillPreserve();
      Clutter.cairo_set_source_color(cr, borderColor);
      cr.setLineWidth(borderWidth);
      cr.stroke();

      if(this.resizeSize > 0) {
         let maxSpace = Math.max(this.resizeSize, borderRadius);
         let monitor = Main.layoutManager.findMonitorForActor(this._sourceActor);
         let sourceAllocation = Cinnamon.util_get_transformed_allocation(this._sourceActor);
         let actorAllocation = Cinnamon.util_get_transformed_allocation(this.actor);

         if(this._arrowSide == St.Side.BOTTOM) {
            if(sourceAllocation.x1 < (monitor.x + monitor.width/2)) {
               this.relativeSide = St.Side.LEFT;
               cr.moveTo(x2 - maxSpace - borderWidth, y1 - borderWidth);
               cr.lineTo(x2 + borderWidth, y1 + maxSpace + borderWidth);
               cr.lineTo(x2 + borderWidth, y1 - borderWidth);
               cr.lineTo(x2 - maxSpace - borderWidth, y1 - borderWidth);
            } else {
               this.relativeSide = St.Side.RIGHT;
               cr.moveTo(x1 + maxSpace + borderWidth, y1 - borderWidth);
               cr.lineTo(x1 - borderWidth, y1 + maxSpace + borderWidth);
               cr.lineTo(x1 - borderWidth, y1 - borderWidth);
               cr.lineTo(x1 + maxSpace + borderWidth, y1 - borderWidth);
            }
         } else if(this._arrowSide == St.Side.TOP) {
            if(sourceAllocation.x1 < (monitor.x + monitor.width/2)) {
               this.relativeSide = St.Side.LEFT;
               cr.moveTo(x2 + borderWidth, y2 - maxSpace - borderWidth);
               cr.lineTo(x2 - maxSpace - borderWidth, y2 + borderWidth);
               cr.lineTo(x2 + borderWidth, y2 + borderWidth);
               cr.lineTo(x2 + borderWidth, y2 - maxSpace - borderWidth);
            } else {
               this.relativeSide = St.Side.RIGHT;
               cr.moveTo(x1 - borderWidth, y2 - maxSpace - borderWidth);
               cr.lineTo(x1 + maxSpace + borderWidth, y2 + borderWidth);
               cr.lineTo(x1 - borderWidth, y2 + borderWidth);
               cr.lineTo(x1 - borderWidth, y2 - maxSpace - borderWidth);
            }
         } else if(this._arrowSide == St.Side.LEFT) {
            if((actorAllocation.y1 + actorAllocation.y2)/2 < (monitor.y + monitor.height/2)) {
               this.relativeSide = St.Side.TOP;
               cr.moveTo(x2 + borderWidth, y2 - maxSpace - borderWidth);
               cr.lineTo(x2 - maxSpace - borderWidth, y2 + borderWidth);
               cr.lineTo(x2 + borderWidth, y2 + borderWidth);
               cr.lineTo(x2 + borderWidth, y2 - maxSpace - borderWidth);
            } else {
               this.relativeSide = St.Side.BOTTOM;
               cr.moveTo(x2 - maxSpace - borderWidth, y1 - borderWidth);
               cr.lineTo(x2 + borderWidth, y1 + maxSpace + borderWidth);
               cr.lineTo(x2 + borderWidth, y1 - borderWidth);
               cr.lineTo(x2 - maxSpace - borderWidth, y1 - borderWidth);
            }
         } else if(this._arrowSide == St.Side.RIGHT) {
            if((actorAllocation.y1 + actorAllocation.y2)/2 < (monitor.y + monitor.height/2)) {
               this.relativeSide = St.Side.TOP;
               cr.moveTo(x1 - borderWidth, y2 - maxSpace - borderWidth);
               cr.lineTo(x1 + maxSpace + borderWidth, y2 + borderWidth);
               cr.lineTo(x1 - borderWidth, y2 + borderWidth);
               cr.lineTo(x1 - borderWidth, y2 - maxSpace - borderWidth);
            } else {
               this.relativeSide = St.Side.BOTTOM;
               cr.moveTo(x1 + maxSpace + borderWidth, y1 - borderWidth);
               cr.lineTo(x1 - borderWidth, y1 + maxSpace + borderWidth);
               cr.lineTo(x1 - borderWidth, y1 - borderWidth);
               cr.lineTo(x1 + maxSpace + borderWidth, y1 - borderWidth);
            }
         } else {
           Main.notify("otro" + this._arrowSide)
         }
         Clutter.cairo_set_source_color(cr, this.selectedColor);
         cr.fillPreserve();
         Clutter.cairo_set_source_color(cr, borderColor);
         cr.setLineWidth(1);
         cr.stroke();
      }
   }
};

function ConfigurableMenu(launcher, arrowAlignment, orientation, subMenu) {
   this._init(launcher, arrowAlignment, orientation, subMenu);
}

ConfigurableMenu.prototype = {
    //__proto__: PopupMenu.PopupMenuBase.prototype,
    __proto__: PopupMenu.PopupMenu.prototype, // compatibility reasons

   _init: function(launcher, arrowAlignment, orientation, subMenu) {
      PopupMenu.PopupMenuBase.prototype._init.call (this, (launcher ? launcher.actor: null), 'popup-menu-content');
      try {
         this._arrowAlignment = arrowAlignment;
         this._arrowSide = orientation;
         this.subMenu = subMenu;
         this.effectType = "none";
         this.effectTime = 0.4;
         this._automatic_open_control = true;
         this._paint_id = 0;
         this._paint_count = 0;
         this.old_parent = null;

         this.launcher = null;
         this.orientation_id = 0;
         this.set_launcher(launcher);

         this._boxPointer = new ConfigurablePointer(orientation,
                                                    { x_fill: true,
                                                      y_fill: true,
                                                      x_align: St.Align.START });
         this.actor = this._boxPointer.actor;

         this.actor._delegate = this;
         this.actor.style_class = 'popup-menu-boxpointer';
         this.actor.connect('key-press-event', Lang.bind(this, this._onKeyPressEvent));

         this._boxWrapper = new Cinnamon.GenericContainer();
         this._boxWrapper.connect('get-preferred-width', Lang.bind(this, this._boxGetPreferredWidth));
         this._boxWrapper.connect('get-preferred-height', Lang.bind(this, this._boxGetPreferredHeight));
         this._boxWrapper.connect('allocate', Lang.bind(this, this._boxAllocate));
         this._boxPointer.bin.set_child(this._boxWrapper);
         this._boxWrapper.add_actor(this.box);
         this.actor.add_style_class_name('popup-menu');

         global.focus_manager.add_group(this.actor);
         this.actor.reactive = true;
         this.actor.hide();
      } catch(e) {
         Main.notify("ErrorMenuCreation", e.message);
      }
   },

   set_launcher: function(launcher) {
      if(this.launcher != launcher) {
         if(this.orientation_id > 0) {
            if (this.launcher.actor instanceof Applet.Applet)
               this.launcher.disconnect(this.orientation_id);
            else if (this.launcher._applet)
               this.launcher._applet.disconnect(this.orientation_id);
            this.orientation_id = 0;
         }
         this.launcher = launcher;
         if(this.launcher) {
            this.sourceActor = this.launcher.actor;
            if (this.launcher.actor instanceof Applet.Applet)
               this.orientation_id = this.launcher.connect("orientation-changed", Lang.bind(this, this._onOrientationChanged));
            else if (this.launcher._applet)
               this.orientation_id = this.launcher._applet.connect("orientation-changed", Lang.bind(this, this._onOrientationChanged));
         }
      }
   },

   set_parent_menu: function(parent) {
      if(this.parentMenu != parent) { 
         this.parentMenu = parent;
      }
   },

   set_automatic_open_control: function(active) {
      if(this._automatic_open_control != active) {
          this._automatic_open_control = active;
          if(!this._automatic_open_control) {
             if(Main.popup_rendering)
                Main.popup_rendering = false;
             if(this._paint_id > 0)
                this.actor.disconnect(this._paint_id);
             this._paint_id = 0;
          }
      }
   },

   _onOrientationChanged: function(a, orientation) {
       this.setArrowSide(orientation);
   },

   _on_paint: function(actor) {
      if (this._paint_count < 2 || this.animating) {
         this._paint_count++;
         return;
      }

      if (this._paint_id > 0) {
         this.actor.disconnect(this._paint_id);
         this._paint_id = 0;
      }

      this._paint_count = 0;
      Main.popup_rendering = false;
   },

   setEffect: function(effect) {
      this.effectType = effect;
   },

   setEffectTime: function(effectTime) {
      this.effectTime = effectTime;
   },

   setArrowSide: function(side) {
      this._arrowSide = side;
      this._boxPointer.setArrowSide(side);
   },

   _boxGetPreferredWidth: function (actor, forHeight, alloc) {
      let columnWidths = this.getColumnWidths();
      this.setColumnWidths(columnWidths);
      // Now they will request the right sizes
      [alloc.min_size, alloc.natural_size] = this.box.get_preferred_width(forHeight);
   },

   _boxGetPreferredHeight: function (actor, forWidth, alloc) {
      [alloc.min_size, alloc.natural_size] = this.box.get_preferred_height(forWidth);
   },

   _boxAllocate: function (actor, box, flags) {
      this.box.allocate(box, flags);
   },

   _onKeyPressEvent: function(actor, event) {
      if(event.get_key_symbol() == Clutter.Escape) {
         this.close(true);
         return true;
      }
      return false;
   },

   setArrowOrigin: function(origin) {
      this._boxPointer.setArrowOrigin(origin);
   },

   setSourceAlignment: function(alignment) {
      this._boxPointer.setSourceAlignment(alignment);
   },

   // Setting the max-height won't do any good if the minimum height of the
   // menu is higher then the screen; it's useful if part of the menu is
   // scrollable so the minimum height is smaller than the natural height
   setMaxHeight: function() {
      if(Main.panelManager) {
         let [x, y] = this.sourceActor.get_transformed_position();

         let i = 0;
         let monitor;
         for (; i < global.screen.get_n_monitors(); i++) {
            monitor = global.screen.get_monitor_geometry(i);
            if(x >= monitor.x && x < monitor.x + monitor.width &&
               x >= monitor.y && y < monitor.y + monitor.height) {
               break;
            }
         }

         let maxHeight = monitor.height - this.actor.get_theme_node().get_length('-boxpointer-gap');

         let panels = Main.panelManager.getPanelsInMonitor(i);
         for(let j in panels) {
            maxHeight -= panels[j].actor.height;
         }

         this.actor.style = ('max-height: ' + maxHeight / global.ui_scale + 'px;');
      } else {
         let monitor = Main.layoutManager.primaryMonitor;
         let maxHeight = Math.round(monitor.height - Main.panel.actor.height - this.actor.get_theme_node().get_length('-boxpointer-gap'));
         if (Main.panel2!=null) maxHeight -= Main.panel2.actor.height;
            this.actor.style = ('max-height: ' + maxHeight + 'px;');
      }
   },

//*************************************************//
   _onKeyFocusOut: function (actor) {
      if(this._popupMenu.isOpen)
          return true;
        this.setActive(false);
      return false;
    },

   setArrow: function(arrow) {
      this._boxPointer.setArrow(arrow);
   },

   fixToCorner: function(fixCorner) {
      this._boxPointer.fixToCorner(this.sourceActor, fixCorner);
   },

   fixToScreen: function(fixCorner) {
      this._boxPointer.fixToScreen(this.sourceActor, fixCorner);
   },

   setResizeArea: function(resizeSize) {
      this._boxPointer.setResizeArea(resizeSize);
   },

   setResizeAreaColor: function(resizeColor) {
      this._boxPointer.setResizeAreaColor(resizeColor);
   },

   repositionActor: function(actor) {
      if((this.sourceActor)&&(this.sourceActor != actor)) {
         actor._delegate = this.sourceActor._delegate;
         actor._applet = this.sourceActor._applet;
         if(this.isOpen)
            this._boxPointer.trySetPosition(actor, this._arrowAlignment);

      }
   },

   setSubMenu: function(subMenu) {
      this.subMenu = subMenu;
   },

   getCurrentMenuThemeNode: function() {
      return this._boxPointer.getCurrentMenuThemeNode();
   },

   shiftPosition: function(x, y) {
      this._boxPointer.shiftPosition(x, y);
   },

   openClean: function(animate) {
      if (this.isOpen)
         return;
      this.old_parent = this.actor.get_parent();
      if(this.old_parent)
          this.old_parent.remove_actor(this.actor);
      Main.uiGroup.add_actor(this.actor);
      Main.popup_rendering = false;

      if (animate)
         this.animating = animate;
      else
         this.animating = false;

      this.setMaxHeight();

      this.isOpen = true;
        
      if (global.menuStackLength == undefined)
         global.menuStackLength = 0;
      global.menuStackLength += 1;

      this._boxPointer.setPosition(this.sourceActor, this._arrowAlignment);

      if(this._automatic_open_control)
          this._paint_id = this.actor.connect("paint", Lang.bind(this, this._on_paint));

      this._boxPointer.show(animate, Lang.bind(this, function () {
         this.animating = false;
      }));

      this.actor.raise_top();

      this.emit('open-state-changed', true);
   },

   closeClean: function(animate) {
      if (!this.isOpen)
         return;

       this.isOpen = false;
       global.menuStackLength -= 1;

       if(Main.panelManager) {
          for (let i in Main.panelManager.panels) {
             if (Main.panelManager.panels[i])
                Main.panelManager.panels[i]._hidePanel();
          }
       }

       if (this._activeMenuItem)
          this._activeMenuItem.setActive(false);

       this._boxPointer.hide(animate);
       Main.uiGroup.remove_actor(this.actor);
        if(this.old_parent)
          this.old_parent.add_actor(this.actor);
       this.emit('open-state-changed', false);
   },

   open: function(animate) {
      /*if(this.subMenu)
         this.subMenu.close();*/
      if(!this.isOpen) {
         this.openClean();
         this._boxPointer.trySetPosition(this.sourceActor, this._arrowAlignment);
         this._applyEffectOnOpen();
      }
   },

   close: function(animate) {
      /*if(this.subMenu)
         this.subMenu.close();*/
      if(this.isOpen) {
         this._applyEffectOnClose();
      }
   },

   _applyEffectOnOpen: function(animate) {
      switch(this.effectType) {
         case "none"  :
            this._effectNoneOpen();
            break;
         case "dispel":
            this._effectDispelOpen();
            break;
         case "hideHorizontal"  :
            this._effectHideHorizontalOpen();
            break;
         case "hideVertical"  :
            this._effectHideVerticalOpen();
            break;
         case "scale" :
            this._effectScaleOpen();
            break;
         case "windows":
            this._effectWindowsOpen();
            break;
      }
   },

   _applyEffectOnClose: function(animate) {
      switch(this.effectType) {
         case "none"  :
            this._effectNoneClose(animate);
            break;
         case "dispel":
            this._effectDispelClose();
            break;
         case "hideHorizontal":
            this._effectHideHorizontalClose();
            break;
         case "hideVertical":
            this._effectHideVerticalClose();
            break;
         case "scale" :
            this._effectScaleClose();
            break;
         case "windows":
            this._effectWindowsClose();
            break;
      }
   },

   _effectNoneOpen: function() {
   },

   _effectNoneClose: function(animate) {
      this.closeClean(animate);
   },

   _effectDispelOpen: function() {
      Tweener.addTween(this.actor,
      {  opacity: 0,
         time: 0,
         transition: 'easeInSine',
         onComplete: Lang.bind(this, function() {
            Tweener.addTween(this.actor,
            {  opacity: 255,
               time: this.effectTime,
               transition: 'easeInSine'
            })
         })
      });
   },

   _effectDispelClose: function() {
      Tweener.addTween(this.actor,
      {  opacity: 0,
         time: this.effectTime,
         transition: 'easeInSine',
         onComplete: Lang.bind(this, function() {
            this.closeClean(false);
         })
      });
   },
/*
   _effectGetOutOpen: function() {
      let [startX, ay] = this.sourceActor.get_transformed_position();
      let monitor = Main.layoutManager.primaryMonitor;
      if(startX > monitor.x + monitor.width/2)
          startX = monitor.x + monitor.width + 3*this.actor.width/2;
      else
          startX = 0;
      Tweener.addTween(this.actor,
      {
         x: startX,
         time: 0,
        // rotation_angle_x: -90,
         rotation_angle_y: 180,
         //rotation_angle_z: 90,
         transition: 'easeOutQuad',
         onComplete: Lang.bind(this, function() {
            Tweener.addTween(this.actor,
            {
                x: 0,
                //rotation_angle_x: 0,
                rotation_angle_y: 0,
                //rotation_angle_z: 0,
                time: this.effectTime
            })
         })
      });
   },

   _effectGetOutClose: function() {
      let [startX, ay] = this.sourceActor.get_transformed_position();
      let monitor = Main.layoutManager.primaryMonitor;
      if(startX > monitor.x + monitor.width/2)
          startX = monitor.x + monitor.width + 3*this.actor.width/2;
      else
          startX = 0;
      Tweener.addTween(this.actor,
      {
         x: startX,
         rotation_angle_y: 180,
         time: this.effectTime,
         transition: 'easeOutQuad',
         onComplete: Lang.bind(this, function() {
            
            PopupMenu.PopupMenuBase.prototype.close.call(this, false);
            Tweener.addTween(this.actor,
            {
                x: 0,
                rotation_angle_y: 0,
                time: 0
            })
         })
      });
   },*/

   _effectWindowsOpen: function() {
     let [startX, ay] = this.sourceActor.get_transformed_position();
      let monitor = Main.layoutManager.primaryMonitor;
      if(startX > monitor.x + monitor.width/2)
          startX = monitor.x + monitor.width + 3*this.actor.width/2;
      else
          startX = 0;
      Tweener.addTween(this.actor,
      {
         x: startX,
         time: 0,
         rotation_angle_y: 180,
         transition: 'easeOutQuad',
         onComplete: Lang.bind(this, function() {
            Tweener.addTween(this.actor,
            {
                x: 0,
                rotation_angle_y: 0,
                time: this.effectTime
            })
         })
      });
   },

   _effectWindowsClose: function() {
      let [startX, ay] = this.sourceActor.get_transformed_position();
      let monitor = Main.layoutManager.primaryMonitor;
      if(startX > monitor.x + monitor.width/2)
          startX = monitor.x + monitor.width + 3*this.actor.width/2;
      else
          startX = 0;
      Tweener.addTween(this.actor,
      {
         x: startX,
         rotation_angle_y: 180,
         time: this.effectTime,
         transition: 'easeOutQuad',
         onComplete: Lang.bind(this, function() {
            this.closeClean(false);
            Tweener.addTween(this.actor,
            {
                x: 0,
                rotation_angle_y: 0,
                time: 0
            })
         })
      });
   },

  _effectHideHorizontalOpen: function() {
      let [startX, ay] = this.sourceActor.get_transformed_position();
      let monitor = Main.layoutManager.primaryMonitor;
      if(startX > monitor.x + monitor.width/2)
         startX += this.sourceActor.width;
      Tweener.addTween(this.actor,
      {
         x: startX,
         scale_x: 0,
         opacity: 255,
         time: 0,
         transition: 'easeOutQuad',
         onComplete: Lang.bind(this, function() {
            Tweener.addTween(this.actor,
            {
                x: 0,
                scale_x: 1,
                opacity: 255,
                time: this.effectTime
            })
         })
      });
   },

   _effectHideHorizontalClose: function() {
      let [startX, ay] = this.sourceActor.get_transformed_position();
      let monitor = Main.layoutManager.primaryMonitor;
      if(startX > monitor.x + monitor.width/2)
         startX += this.sourceActor.width;
      Tweener.addTween(this.actor,
      {
         x: startX,
         scale_x: 0,
         opacity: 255,
         time: this.effectTime,
         transition: 'easeOutQuad',
         onComplete: Lang.bind(this, function() {
            this.closeClean(false);
            Tweener.addTween(this.actor,
            {
                x: 0,
                scale_x: 1,
                opacity: 255,
                time: 0
            })
         })
      });
   },

   _effectHideVerticalOpen: function() {
      let startY = this.sourceActor.height;
      if(this._arrowSide == St.Side.BOTTOM) {
         let monitor = Main.layoutManager.primaryMonitor;
         startY =  monitor.height - startY;
      }
      Tweener.addTween(this.actor,
      {
         y: startY,
         scale_y: 0,
         opacity: 255,
         time: 0,
         transition: 'easeOutQuad',
         onComplete: Lang.bind(this, function() {
            Tweener.addTween(this.actor,
            {
                y: 0,
                scale_y: 1,
                opacity: 255,
                time: this.effectTime
            })
         })
      });
   },

   _effectHideVerticalClose: function() {
      let startY = this.sourceActor.height;
      if(this._arrowSide == St.Side.BOTTOM) {
         let monitor = Main.layoutManager.primaryMonitor;
         startY =  monitor.height - startY;
      }
      Tweener.addTween(this.actor,
      {
         y: startY,
         scale_y: 0,
         opacity: 255,
         time: this.effectTime,
         transition: 'easeOutQuad',
         onComplete: Lang.bind(this, function() {
            this.closeClean(false);
            Tweener.addTween(this.actor,
            {
                y: 0,
                scale_y: 1,
                opacity: 255,
                time: 0
            })
         })
      });
   },

   _effectScaleOpen: function() {
      let monitor = Main.layoutManager.primaryMonitor;
      let [startX, ay] = this.sourceActor.get_transformed_position();
      let startY = this.sourceActor.height;
      if(startX > monitor.x + monitor.width/2)
         startX += this.sourceActor.width;
      if(this._arrowSide == St.Side.BOTTOM)
         startY =  monitor.height - startY;
      Tweener.addTween(this.actor,
      {
         x: startX, y: startY,
         scale_x: 0, scale_y: 0,
         opacity: 255,
         time: 0,
         transition: 'easeOutQuad',
         onComplete: Lang.bind(this, function() {
            Tweener.addTween(this.actor,
            {
                x: 0, y: 0,
                scale_x: 1, scale_y: 1,
                opacity: 255,
                time: this.effectTime
            })
         })
      });
   },

   _effectScaleClose: function() {
      let monitor = Main.layoutManager.primaryMonitor;
      let [startX, ay] = this.sourceActor.get_transformed_position();
      let startY = this.sourceActor.height;
      if(startX > monitor.x + monitor.width/2)
         startX += this.sourceActor.width;
      if(this._arrowSide == St.Side.BOTTOM)
         startY =  monitor.height - startY;
      Tweener.addTween(this.actor,
      {
         x: startX, y: startY,
         scale_x: 0, scale_y: 0,
         opacity: 255,
         time: this.effectTime,
         transition: 'easeOutQuad',
         onComplete: Lang.bind(this, function() {
            this.closeClean(false);
            Tweener.addTween(this.actor,
            {
                x: 0, y: 0,
                scale_x: 1, scale_y: 1,
                opacity: 255,
                time: 0
            })
         })
      });
   },

   destroy: function() {
      if(this._popupMenu) {
         this._popupMenu.close();
         this._menuManager.removeMenu(this._popupMenuu);
         this._popupMenu.destroy();
         this._popupMenu = null;
      }
      PopupMenu.PopupMenuBase.prototype.destroy.call(this);
   }
};

function ConfigurablePopupMenu(launcher, arrowAlignment, orientation, parentMenu) {
   this._init(launcher, arrowAlignment, orientation, parentMenu);
};

ConfigurablePopupMenu.prototype = {
   __proto__: ConfigurableMenu.prototype,

   _init: function(launcher, arrowAlignment, orientation, parentMenu) {
      ConfigurableMenu.prototype._init.call(this, parentMenu, arrowAlignment, orientation, this);
      this.parentMenu = parentMenu;
      if(this.parentMenu)
          this.parent_sourceActor = this.parentMenu.sourceActor;
      this.fixScreen = false;
      if((this.parentMenu)&&(this.parentMenu instanceof ConfigurableMenu))
         this.parentMenu.setSubMenu(this);
      this.actor.add_style_class_name('menu-context-menu');
   },

   reparentMenu: function(parentMenu, orientation) {
      //if(!this.fixScreen) {
         if((parentMenu)&&(parentMenu != this.parentMenu)) {
            this.setArrowSide(orientation);
            this.parentMenu = parentMenu;
            this.sourceActor = this.parentMenu.actor;
         }
     // }
   },

   fixToScreen: function(fixScreen) {
      try {
         if(fixScreen) //{
            this._boxPointer.fixToScreen(this.sourceActor, fixScreen);
         /*} else {
            this._boxPointer.fixToScreen(this.parentMenu.actor, fixScreen);
         }*/
         this.fixScreen = fixScreen;
      } catch(e) {
         Main.notify("eee", e.message);
      }
   },

   fixToCorner: function(fixCorner) {
     /* try {
         Main.notify("hola");
         if(fixScreen) {
            this._parentMenu = this.parentMenu;
            this.reparentMenu(this.parent.menu, this._boxPointer._arrowSide);
            if(this._boxPointer._arrowSide == St.Side.LEFT)
               Main.notify("left");
            this._boxPointer.fixToScreen(this.sourceActor, fixScreen);
         } else {
            this.parentMenu = this._parentMenu;
            this.reparentMenu(this.parentMenu, this._boxPointer._arrowSide);
            this._boxPointer.fixToScreen(this.sourceActor, fixScreen);
         }
      } catch(e) {
         Main.notify("eee", e.message);
      }*/
   },

   repositionActor: function(actor) {
      if((this.sourceActor)&&(this.sourceActor != actor)) {
         if(this.isOpen)
            this._boxPointer.trySetPosition(actor, this._arrowAlignment);
      }
   },

   open: function(animate) {
      /*if((this.parentMenu != this.parent)&&(!this.parentMenu.isOpen))
         return;*/

    try {
         Main.notify("open" + this.parentMenu.isOpen)
      if(this.parentMenu.isOpen) {
         //(Dalcde idea)Temporarily change source actor to Main.uiGroup to "trick"
         // the menu manager to think that right click submenus are part of it.
         Main.notify("open")
         this.parent_sourceActor = this.parentMenu.sourceActor;
         this.parentMenu.sourceActor = Main.uiGroup;

         ConfigurableMenu.prototype.openClean.call(this, animate);
      }
     } catch(e) {Main.notify("e" +e.message)}
   },

   close: function(animate) {
      this.parentMenu.sourceActor = this.parent_sourceActor;
      ConfigurableMenu.prototype.closeClean.call(this, animate);
      //if((this.parentMenu.isOpen)&&(this.parent.searchEntry))
      //   this.parent.searchEntry.grab_key_focus();
   }
};

function ConfigurablePopupSwitchMenuItem() {
    this._init.apply(this, arguments);
}

ConfigurablePopupSwitchMenuItem.prototype = {
    __proto__: PopupMenu.PopupBaseMenuItem.prototype,

    _init: function(text, imageOn, imageOff, active, params) {
        PopupMenu.PopupBaseMenuItem.prototype._init.call(this, params);

        this._imageOn = imageOn;
        this._imageOff = imageOff;

        let table = new St.Table({ homogeneous: false, reactive: true });

        this.label = new St.Label({ text: text });
        this.label.set_margin_left(6.0);

        this._switch = new PopupMenu.Switch(active);
        this._switch.actor.set_style_class_name("toggle-switch");
        this._switch.actor.add_style_class_name("toggle-switch-intl");

        if(active)
           this.icon = new St.Icon({ icon_name: this._imageOn, icon_type: St.IconType.FULLCOLOR, style_class: 'popup-menu-icon' });
        else
           this.icon = new St.Icon({ icon_name: this._imageOff, icon_type: St.IconType.FULLCOLOR, style_class: 'popup-menu-icon' });

        this._statusBin = new St.Bin({ x_align: St.Align.END });
        this._statusBin.set_margin_left(6.0);
        this._statusLabel = new St.Label({ text: '', style_class: 'popup-inactive-menu-item' });
        this._statusBin.child = this._switch.actor;

        table.add(this.icon, {row: 0, col: 0, col_span: 1, x_expand: false, x_align: St.Align.START});
        table.add(this.label, {row: 0, col: 1, col_span: 1, y_fill: false, y_expand: true, x_align: St.Align.MIDDLE, y_align: St.Align.MIDDLE});
        table.add(this._statusBin, {row: 0, col: 2, col_span: 1, x_expand: true, x_align: St.Align.END});

        this.addActor(table, { expand: true, span: 1, align: St.Align.START});
    },

    setToggleState: function(state) {
        if(state)
           this.icon.set_icon_name(this._imageOn);
        else
           this.icon.set_icon_name(this._imageOff);
        this._switch.setToggleState(state);
    },

    get_state: function() {
        return this._switch.state;
    }
};

function RadioButton() {
    this._init.apply(this, arguments);
}

RadioButton.prototype = {
    _init: function(state) {
        this.actor = new St.Bin({ style_class: 'radiobutton' });/*,
                                  accessible_role: Atk.Role.CHECK_BOX });*/
        //this.actor.set_style_class_name("check-box");
        this.setToggleState(state);
        this.actor.style = "background-image: url('radiobutton-off.svg');";
    },

    setToggleState: function(state) {
        this.actor.change_style_pseudo_class('checked', state);
        this.state = state;
    },

    toggle: function() {
        this.setToggleState(!this.state);
    }
};

function Switch() {
    this._init.apply(this, arguments);
}

Switch.prototype = {
    _init: function(state) {
        this.actor = new St.Bin({ style_class: 'toggle-switch' ,
                                  accessible_role: Atk.Role.CHECK_BOX});
        // Translators: this MUST be either "toggle-switch-us"
        // (for toggle switches containing the English words
        // "ON" and "OFF") or "toggle-switch-intl" (for toggle
        // switches containing "O" and "|"). Other values will
        // simply result in invisible toggle switches.
        this.actor.add_style_class_name("toggle-switch-intl");
        this.setToggleState(state);
    },

    setToggleState: function(state) {
        this.actor.change_style_pseudo_class('checked', state);
        this.state = state;
    },

    toggle: function() {
        this.setToggleState(!this.state);
    }
};

/**
 * ConfigurablePopupSubMenuMenuItem
 *
 * A class to extend the cinnamon standar PopupMenuSection
 * to support create an space area on some special context.
 */
function ConfigurablePopupSubMenuMenuItem() {
    this._init.apply(this, arguments);
}

ConfigurablePopupSubMenuMenuItem.prototype = {
    __proto__: PopupMenu.PopupSubMenuMenuItem.prototype,

    _init: function(text, hide_expander) {
        PopupMenu.PopupBaseMenuItem.prototype._init.call(this);

        this.actor.add_style_class_name('popup-submenu-menu-item');

        let table = new St.Table({ homogeneous: false,
                                      reactive: true });

        if (!hide_expander) {
            this._triangle = new St.Icon({ icon_name: "media-playback-start",
                                icon_type: St.IconType.SYMBOLIC,
                                style_class: 'popup-menu-icon' });

            table.add(this._triangle,
                    {row: 0, col: 0, col_span: 1, x_expand: false, x_align: St.Align.START});

            this.label = new St.Label({ text: text });
            this.label.set_margin_left(6.0);
            table.add(this.label,
                    {row: 0, col: 1, col_span: 1, x_align: St.Align.START});
        }
        else {
            this.label = new St.Label({ text: text });
            table.add(this.label,
                    {row: 0, col: 0, col_span: 1, x_align: St.Align.START});
        }
        this.actor.label_actor = this.label;
        this.addActor(table, { expand: true, span: 1, align: St.Align.START });

        this.menu = new ConfigurablePopupMenu(null, 0.0, St.Side.LEFT);
        this.menu.connect('open-state-changed', Lang.bind(this, this._subMenuOpenStateChanged));
        this.actor.connect('button-release-event', Lang.bind(this, this._onButtonReleaseEvent));
        this.actor.connect('key-press-event', Lang.bind(this, this._onKeyPressEvent));
    },

    _onButtonReleaseEvent: function (actor, event) {
        this.activate(event, false);
        return true;
    },

   activate: function(event) {
    try {
      let topMenu = this._getTopMenu(this.actor.get_parent());
      if(!topMenu)
         return false;

      this.menu.set_parent_menu(topMenu);
      this.menu.set_launcher(topMenu);

      if(this == topMenu._openedSubMenu)
         return false;

      if(topMenu._openedSubMenu && topMenu._openedSubMenu.isOpen)
         topMenu._openedSubMenu.close(false);

      topMenu._openedSubMenu = this;
      this.menu.open(true);
    } catch(e) {Main.notify("" + e.message);}
      return true
   },

   _getTopMenu: function(actor) {
      while(actor) {
         if((actor._delegate) && (actor._delegate instanceof PopupMenu.PopupMenu))
            return actor._delegate;
         actor = actor.get_parent();
      }
      return null;
   }
};

/**
 * ConfigurablePopupMenuSection
 *
 * A class to extend the cinnamon standar PopupMenuSection
 * to support create an space area on some special context.
 */
function ConfigurablePopupMenuSection() {
    this._init.apply(this, arguments);
}

ConfigurablePopupMenuSection.prototype = {
    __proto__: PopupMenu.PopupMenuSection.prototype,

    _init: function() {
        PopupMenu.PopupMenuSection.prototype._init.call(this);
    },
};

/**
 * ConfigurablePopupMenuItem
 *
 * A class to extend the cinnamon standar PopupMenuItem
 * to support ornaments and automatically close the submenus.
 */
function ConfigurablePopupMenuItem() {
    this._init.apply(this, arguments);
}

ConfigurablePopupMenuItem.prototype = {
    __proto__: PopupMenu.PopupMenuItem.prototype,

    _init: function(text, params) {
        //PopupMenu.PopupBaseMenuItem.prototype._init.call(this, params);
        params = Params.parse (params, { reactive: true,
                                         activate: true,
                                         hover: true,
                                         sensitive: true,
                                         style_class: null,
                                         focusOnHover: true,
                                         hideIcon: true
                                       });
        this.actor = new St.BoxLayout({ style_class: 'popup-menu-item',
                                        reactive: params.reactive,
                                        track_hover: params.reactive,
                                        can_focus: params.reactive,
                                        accessible_role: Atk.Role.MENU_ITEM
                                     });
        this.actor.connect('style-changed', Lang.bind(this, this._onStyleChanged));
        this.actor._delegate = this;

        this._children = [];
        this._dot = null;
        this._columnWidths = null;
        this._spacing = 0;
        this.active = false;
        this._activatable = params.reactive && params.activate;
        this.sensitive = true;
        this.focusOnHover = params.focusOnHover;

        this.setSensitive(this._activatable && params.sensitive);

        if (params.style_class)
            this.actor.add_style_class_name(params.style_class);

        if (this._activatable) {
            this.actor.connect('button-release-event', Lang.bind(this, this._onButtonReleaseEvent));
            this.actor.connect('key-press-event', Lang.bind(this, this._onKeyPressEvent));
        }
        if (params.reactive && params.hover)
            this.actor.connect('notify::hover', Lang.bind(this, this._onHoverChanged));
        if (params.reactive) {
            this.actor.connect('key-focus-in', Lang.bind(this, this._onKeyFocusIn));
            this.actor.connect('key-focus-out', Lang.bind(this, this._onKeyFocusOut));
        }

        this._icon = new St.Icon({ style_class: 'popup-menu-icon' });
        this.label = new St.Label({ text: text });
        this.actor.label_actor = this.label;
        this._ornament = new St.BoxLayout();
        this.actor.add(this._icon, { x_align: St.Align.START });
        this.actor.add(this.label, { y_align: St.Align.MIDDLE, y_fill:false, expand: true });
        this.actor.add(this._ornament, { x_align: St.Align.END, y_align: St.Align.MIDDLE, x_fill:false, expand: true });
        if (params.hideIcon)
            this._icon.hide();
    },

    setOrnament: function(ornamentType, status) {
        try {
        this._ornament.get_children().forEach(function(child) {
            child.destroy();
        });
        if (ornamentType == OrnamentType.CHECK) {
            let switchOrnament = new Switch(status);
            this._ornament.add(switchOrnament.actor);
            //Main.notify("hola CHECK")
        } else if (ornamentType == OrnamentType.DOT) {
            //Main.notify("hola CHECK")
            let radioOrnament = new RadioButton(status);
            //Main.notify("hola CHECK")
            this._ornament.add(radioOrnament.actor);
            let label = new St.Label();
            label.set_text("proba");
            //this._ornament.add(label);
            //Main.notify("hola RADIO")
            //this._ornament.set_text('\u2022');
            //this.actor.add_accessible_state(Atk.StateType.CHECKED);
        } else {
            //Main.notify("hola NONE")
            //this._ornament.set_text('');
            //this.actor.remove_accessible_state(Atk.StateType.CHECKED);
        }
        } catch(e) {Main.notify("error " + e.message);}
    }
};

// A class to hacked the cinnamon standar PopupSubMenuMenuItem
// to be displayed how a AppletPopupMenu.
function ConfigurableMenuApplet() {
    this._init.apply(this, arguments);
}

ConfigurableMenuApplet.prototype = {
    //__proto__: PopupMenu.PopupMenuBase.prototype,
    __proto__: PopupMenu.PopupMenu.prototype, // compatibility reasons

   _init: function(launcher, orientation, menuManager) {
      PopupMenu.PopupMenuBase.prototype._init.call(this, launcher.actor, 'applet-container-box');
      this._launcher = launcher;
      this._orientation = orientation;
      this._menuManager = menuManager;
      this.actor = new St.BoxLayout({ style_class: 'applet-container-box', reactive: false, track_hover: false });
      this.actor.vertical = false;
      this.actor.hide();
      this._launcher.actor.add(this.actor);
      this._launcher.actor.set_reactive(false);
      this._launcher.actor.set_track_hover(false);
      this.menu = new ConfigurableMenu(this._launcher, 0.0, this._orientation);
      let section = new PopupMenu.PopupMenuSection();
      this.menu.addMenuItem(section);
      this.menu._section = section;
      this._menuManager.addMenu(this.menu);
      this.menu.connect('open-state-changed', Lang.bind(this, this._onOpenStateChanged));
      this.default_displayed = true;
   },

   open: function() {
      this.isOpen = true;
      this.actor.show();
   },

   close: function() {
      this.isOpen = false;
      this.actor.hide();
   },

   addMenuItem: function(menuItem, position) {
      PopupMenu.PopupMenuBase.prototype.addMenuItem.call(this, menuItem, position);
      if(menuItem instanceof PopupMenu.PopupSubMenuMenuItem) {
           let position = this._getMenuItems().indexOf(menuItem);
           this._reparent_submenu_menuitem(menuItem, position);
      } else {
          global.log("Try to insert a no compatible item " + menuItem + " at the position " + position);
          throw TypeError('The ConfigurableMenuApplet only allow to have PopupSubMenuMenuItem as a children');
      }  
   },

   _reparent_submenu_menuitem: function(menuItem, position) {
       menuItem.actor.hide();
       //Extract the label from the table and remove the rest of items.
       let children = menuItem.actor.get_children();
       let table = children[0];
       table.remove_actor(menuItem.label);
       if(menuItem._triangle)
           menuItem._triangle.destroy();
       menuItem.label.set_style_class_name('applet-label');//'menu-application-button-label');
       menuItem.actor.destroy_all_children();
       menuItem.disconnect(menuItem._activateId);
       menuItem.menu.disconnect(menuItem._subMenuActivateId);
       menuItem._activateId = menuItem.connect('activate', Lang.bind(menuItem, function (menuItem, event, keepMenu) {
            menuItem.emit('activate', menuItem, keepMenu);
       }));
       /*menuItem._subMenuActivateId = menuItem.menu.connect('activate', Lang.bind(menuItem.menu, function(submenu, submenuItem, keepMenu) {
            Main.notify("holaaaaaaaaaa2222222")
            submenu.emit('activate');
       }));*/
       menuItem._subMenuActivateId = 0;

       let actor_applet = new St.BoxLayout({ style_class: 'applet-box', reactive: true, track_hover: true });
       actor_applet._delegate_item = menuItem;
       actor_applet.connect('button-press-event', Lang.bind(this, this._onButtonPressEvent));
       this.actor.add(actor_applet, { y_fill: true });
       actor_applet.add(menuItem.label, { y_fill: false });
       menuItem.label.realize();

       let parent = menuItem.menu.actor.get_parent();
       if(parent)
           parent.remove_actor(menuItem.menu.actor);
       if(menuItem.menu.set_parent_menu) {
           menuItem.menu.set_parent_menu(this.menu);
           menuItem.menu.set_launcher(this._launcher);
           let menuManager = new PopupMenu.PopupMenuManager(this._launcher);
           menuManager.addMenu(menuItem.menu);
       }
       menuItem.menu._arrow = null;
       menuItem.menu.actor.set_style_class_name('');
       menuItem.menu.actor.style = "-arrow-border-radius: 0px; \
                                    -arrow-background-color: rgba(80,80,80,0.0); \
                                    -arrow-border-width: 0px; \
                                    -arrow-border-color: #a5a5a5; \
                                    -arrow-base: 0px; \
                                    -arrow-rise: 0px;"
       menuItem.menu.open = function(animate) {};
       menuItem.menu.close = Lang.bind(this, function(animate) {
          if(this.menu.isOpen)
              this.menu.closeClean();
       });
       this.menu._section.actor.add(menuItem.menu.actor,
          {x_fill: true, y_fill: true, y_align: St.Align.START, expand: true});
       menuItem.menu.actor.hide();
   },
/*
   _onItemButtonReleaseEvent: function (actor, event) {
       this.menu.current.activate(event, false);
       return true;
   },
*/
   _onOpenStateChanged: function(menu, open) {
      this.menu.current.menu.emit('open-state-changed', open);
   },

   _onButtonPressEvent: function (actor, event) {
         let section_actor = this.menu._section.actor;
         this.menu.current = actor._delegate_item;
         let children = section_actor.get_children();
         for(let i = 0; i < children.length; i++) {
            children[i]._delegate.close();
            children[i].hide();
         }
         this.menu.current.menu.actor.show();
         this.menu.current.menu.isOpen = true;
         if(!this.menu.isOpen)
            this.menu.openClean();
         this.menu.repositionActor(actor);
   },

   destroy: function() {
      PopupMenu.PopupMenuBase.prototype.destroy.call(this);
      if(this.menu.isOpen)
         this.menu.closeClean();
      this.menu.destroy();
      this.actor.destroy();
   }
};
/*
function ConfigurableSubMenuMenuSwapper() {
    this._init.apply(this, arguments);
}

ConfigurableSubMenuMenuSwapper.prototype = {
    __proto__: ConfigurableMenu.prototype,

    _init: function(launcher, orientation, subMenu) {
        ConfigurableMenu.prototype._init.call(this, launcher, orientation, subMenu);
    },

    set_subMenu: function(menu) {
        this.menu.connect('open-state-changed', Lang.bind(this, this._subMenuOpenStateChanged));
    }
};

function ConfigurableMenuTextIconItem(icon, text) {
   this._init(icon, text);
}

ConfigurableMenuTextIconItem.prototype = {

   _init: function(icon, text) {
      this.actor = new St.BoxLayout();
      this.actorlabel = new St.Label({ style_class: 'applet-label', reactive: true, track_hover: true, text: app.get_name() });
      this.actorIcon = new St.BoxLayout({ style_class: 'applet-box', reactive: true, track_hover: true });
      this.actor.add(this.actorlabel, { y_align: St.Align.MIDDLE, y_fill: false });
      this.actor.add(this.actorIcon, { y_align: St.Align.MIDDLE, y_fill: false });
   },

   set_orientation: function(orientation) {
   }
};*/

/**
 * A MenuFactory to displayed an abstract dBus menu items inside clutter objects
 *
 * Processes events, creates the clutter actors and handles the action on a bidirectional way
 */
function MenuFactory() {
    this._init.apply(this, arguments);
}

MenuFactory.prototype = {

    _init: function(launcher, orientation, params) {
        this._launcher = launcher;
        this._orientation = orientation;
        this.set_popup_menu_base_class(params);
    },

    set_popup_menu_base_class: function(params) {
        params = Params.parse (params, { RootMenuClass: PopupMenu.PopupSubMenuMenuItem,
                                         MenuItemClass: PopupMenu.PopupMenuItem,
                                         SubMenuMenuItemClass: PopupMenu.PopupSubMenuMenuItem,
                                         MenuSectionMenuItemClass: PopupMenu.PopupMenuSection,
                                         SeparatorMenuItemClass: PopupMenu.PopupSeparatorMenuItem,
                                       });
        this.RootMenuClass = params.RootMenuClass;
        this.SubMenuMenuItemClass = params.SubMenuMenuItemClass;
        this.MenuSectionMenuItemClass = params.MenuSectionMenuItemClass;
        this.SeparatorMenuItemClass = params.SeparatorMenuItemClass;
        this.MenuItemClass = params.MenuItemClass;
    },

    build_shell_menu: function(dbus_menu, menuManager) {
        if(!menuManager)
            menuManager = new PopupMenu.PopupMenuManager(this._launcher);
     
        let shellItem = new this.RootMenuClass(this._launcher, this._orientation, menuManager); // the shell menu

        if(shellItem instanceof Applet.AppletPopupMenu) {
            menuManager.addMenu(shellItem);
        }

        let dbusItem = dbus_menu.get_root();

        shellItem._dbusItem = dbusItem;
        this._attachToMenu(shellItem);

        return shellItem;
    },

    // This will attach the root dbusItem to an already existing menu that will be used as the root menu.
    // it will also connect the dbusItem to be automatically destroyed when the menu dies.
    _attachToMenu: function(shellItem) {
        // cleanup: remove existing childs (just in case)
        shellItem.removeAll();

        // connect handlers
        shellItem._menuDisconnectHandlers = [];
        Utility.connectAndSaveId(shellItem, {
            'open-state-changed': Lang.bind(this, this._onShellMenuOpened),
            'destroy'           : Lang.bind(this, this._onDestroyShellMenu)
        }, shellItem._menuDisconnectHandlers);
        let dbusItem = shellItem._dbusItem;
        if(dbusItem) {
            Utility.connectAndSaveId(dbusItem, {
                'child-added'   : Lang.bind(this, this._onRootChildAdded, shellItem),
                'child-removed' : Lang.bind(this, this._onRootChildRemoved, shellItem),
                'child-moved'   : Lang.bind(this, this._onRootChildMoved, shellItem),
                'dropped'       : Lang.bind(this, this._onRootChildDropped, shellItem)
            }, dbusItem._signals_handlers);

            // fill the menu for the first time
            dbusItem.get_children().forEach(function(child) {
                shellItem.addMenuItem(this._createItem(child));
            }, this);
        }
    },

    _onRootChildDropped: function(dbusItem, shellItem) {
        if (shellItem) {
            this.emit("dropped", shellItem);
        }
    },

    _onRootChildAdded: function(dbusItem, child, position, shellItem) {
        if (shellItem) {
            shellItem.addMenuItem(this._createItem(child), position);
        }
    },

    _onRootChildRemoved: function(dbusItem, child, shellItem) {
        // children like to play hide and seek
        // but we know how to find it for sure!
        if (shellItem) {
            shellItem._getMenuItems().forEach(function(item) {
                if (item._dbusItem == child)
                    item.destroy();
            });
        }
    },

    _onRootChildMoved: function(dbusItem, child, oldpos, newpos, shellItem) {
        if (shellItem) {
            this._moveItemInMenu(shellItem, dbusItem, newpos);
        }
    },

    _onDestroyShellMenu: function(shellItem) {
        if (shellItem) {
            Utility.disconnectArray(shellItem, shellItem._menuDisconnectHandlers);

            let dbusItem = shellItem._dbusItem;
            if (dbusItem) {
                Utility.disconnectArray(dbusItem, dbusItem._signals_handlers);
                dbusItem.destroy();
            }
        }
    },

    _onShellMenuOpened: function(shellItem, state) {
        let dbusItem = shellItem._dbusItem;
        if (!dbusItem) return;

        if (state) {
            dbusItem.handle_event("opened");
        } else {
            dbusItem.handle_event("closed");
        }
    },

    _setOrnamentPolyfill: function(ornamentType) {
        if (ornamentType == OrnamentType.CHECK) {
            this._ornament.set_text('\u2713');
            this.actor.add_accessible_state(Atk.StateType.CHECKED);
        } else if (ornamentType == OrnamentType.DOT) {
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
    _allocateOrnament: function(actor, box, flags, shellItem) {
        if (!shellItem._ornament) return;

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

        let [minHeight, naturalHeight] = shellItem._ornament.get_preferred_height(dotBox.x2 - dotBox.x1);

        dotBox.y1 = Math.round(box.y1 + (height - naturalHeight) / 2);
        dotBox.y2 = dotBox.y1 + naturalHeight;

        shellItem._ornament.allocate(dotBox, flags);
    },

    _createItem: function(dbusItem) {
        // first, decide whether it's a submenu or not
        let shellItem;
        if (dbusItem.get_children_display() == "submenu")
            shellItem = new this.SubMenuMenuItemClass("FIXME");
        else if (dbusItem.get_children_display() == "section")
            shellItem = new this.MenuSectionMenuItemClass();
        else if (dbusItem.get_type() == "separator")
            shellItem = new this.SeparatorMenuItemClass('');
        else
            shellItem = new this.MenuItemClass("FIXME");

        shellItem._dbusItem = dbusItem;

        if (shellItem instanceof this.MenuItemClass) {
            // GS3.8: emulate the ornament stuff.
            // this is similar to how the setShowDot function works
            if (!shellItem.setOrnament) {
                shellItem._icon = new St.Icon({ style_class: 'popup-menu-icon', x_align: St.Align.END });
                if (shellItem.addActor) { //GS 3.8
                    shellItem.addActor(shellItem._icon, { align: St.Align.END });
                } else { //GS >= 3.10
                    shellItem.actor.add(shellItem._icon, { x_align: St.Align.END });
                    shellItem.label.get_parent().child_set(shellItem.label, { expand: true });
                }
                shellItem._ornament = new St.Label();
                shellItem.actor.add_actor(shellItem._ornament);
                shellItem.setOrnament = this._setOrnamentPolyfill;
                shellItem.actor.connect('allocate', Lang.bind(this, this._allocateOrnament, shellItem)); //GS doesn't disconnect that one, either
                //shellItem.actor.set_margin_left(6.0);
            }
        }

        // initialize our state
        this._updateLabel(shellItem);
        this._updateOrnament(shellItem);
        this._updateImage(shellItem);
        this._updateVisible(shellItem);
        this._updateSensitive(shellItem);

        // initially create children
        if (shellItem instanceof this.SubMenuMenuItemClass) {
            let children = dbusItem.get_children();
            for (let i = 0; i < children.length; ++i) {
                let ch_item = this._createItem(children[i]);
                ch_item._parent = shellItem;
                shellItem.menu.addMenuItem(ch_item);
            }
        } else if (shellItem instanceof this.MenuSectionMenuItemClass) {
            let children = dbusItem.get_children();
            for (let i = 0; i < children.length; ++i) {
                let ch_item = this._createItem(children[i]);
                ch_item._parent = shellItem;
                shellItem.addMenuItem(ch_item);
            }
        }
        // now, connect various events
        Utility.connectAndRemoveOnDestroy(dbusItem, {
            'property-changed':   Lang.bind(this, this._onPropertyChanged, shellItem),
            'child-added':        Lang.bind(this, this._onChildAdded, shellItem),
            'child-removed':      Lang.bind(this, this._onChildRemoved, shellItem),
            'child-moved':        Lang.bind(this, this._onChildMoved, shellItem)
        }, shellItem);

        Utility.connectAndRemoveOnDestroy(shellItem, {
            'activate':  Lang.bind(this, this._onActivate, shellItem)
        });

        if (shellItem.menu) {
            Utility.connectAndRemoveOnDestroy(shellItem.menu, {
                "open-state-changed": Lang.bind(this, this._onOpenStateChanged, shellItem)
            });
            shellItem.actor.connect("button-release-event", Lang.bind(this, this._onShellMenuPreOpened));
        }
        return shellItem;
    },

    _onOpenStateChanged: function(menu, open, shellItem) {
        if (open) {
            shellItem._dbusItem.handle_event("opened");
        } else {
            shellItem._dbusItem.handle_event("closed");
        }
    },

    _onActivate: function(shellItem) {
        let dbusItem = shellItem._dbusItem;
        if (dbusItem) {
            dbusItem.handle_event("clicked");
        }
    },

    _onShellMenuPreOpened: function(actor, event) {
        let shellItem = actor._delegate;
        if ((shellItem) || (shellItem.menu)) {
            let top_menu = this._getTopMenu(shellItem.menu);
            if ((top_menu) && (shellItem != top_menu._openedSubMenu)) {
                if (top_menu._openedSubMenu && top_menu._openedSubMenu.isOpen)
                    top_menu._openedSubMenu.close(true);
                top_menu._openedSubMenu = shellItem.menu;
            }
        }
    },

    _onPropertyChanged: function(dbusItem, prop, value, shellItem) {
        if (prop == "toggle-type" || prop == "toggle-state")
            this._updateOrnament(shellItem);
        else if (prop == "label")
            this._updateLabel(shellItem);
        else if (prop == "enabled")
            this._updateSensitive(shellItem);
        else if (prop == "visible")
            this._updateVisible(shellItem);
        else if (prop == "icon-name" || prop == "icon-data")
            this._updateImage(shellItem);
        else if (prop == "type" || prop == "children-display")
            this._replaceSelf(shellItem);
        /*else
            global.logWarning("Unhandled property change: "+prop);*/
    },

    _onChildAdded: function(dbusItem, child, position, shellItem) {
        if (shellItem instanceof this.SubMenuMenuItemClass) {
            shellItem.menu.addMenuItem(this._createItem(child), position);
        } else if (shellItem instanceof this.MenuSectionMenuItemClass) {
            shellItem.addMenuItem(this._createItem(child), position);
        } else {
            global.logWarning("Tried to add a child to non-submenu item. Better recreate it as whole");
            this._replaceSelf(shellItem, dbusItem);
        }
    },

    _onChildRemoved: function(dbusItem, child, shellItem) {
        if (shellItem instanceof this.SubMenuMenuItemClass) {
            // find it!
            shellItem.menu._getMenuItems().forEach(function(item) {
                if (item._dbusItem == child)
                    item.destroy();
            });
        } else if (shellItem instanceof this.MenuSectionMenuItemClass) {
            shellItem._getMenuItems().forEach(function(item) {
                if (item._dbusItem == child)
                    item.destroy();
            });
        } else {
            global.logWarning("Tried to remove a child from non-submenu item. Better recreate it as whole");
            this._replaceSelf(shellItem, dbusItem);
        }
    },

    _onChildMoved: function(dbusItem, child, oldpos, newpos, shellItem) {
        if (shellItem instanceof this.SubMenuMenuItemClass) {
            this._moveItemInMenu(shellItem.menu, child, newpos);
        } else if (shellItem instanceof this.MenuSectionMenuItemClass) {
            this._moveItemInMenu(shellItem, child, newpos);
        } else {
            global.logWarning("Tried to move a child in non-submenu item. Better recreate it as whole");
            this._replaceSelf(shellItem, dbusItem);
        }
    },

    _updateLabel: function(shellItem) {
        let label = shellItem._dbusItem.get_label();

        if (shellItem.label) // especially on GS3.8, the separator item might not even have a hidden label
            shellItem.label.set_text(label);
    },

    _updateOrnament: function(shellItem) {
        if (!shellItem.setOrnament) return; // separators and alike might not have gotten the polyfill
        if (shellItem._dbusItem.get_toggle_type() == "checkmark") {
            shellItem.setOrnament(OrnamentType.CHECK, shellItem._dbusItem.get_toggle_state());
        } else if (shellItem._dbusItem.get_toggle_type() == "radio") {
            shellItem.setOrnament(OrnamentType.DOT, shellItem._dbusItem.get_toggle_state());
        } else {
            shellItem.setOrnament(OrnamentType.NONE);
        }
    },

    _updateImage: function(shellItem) {
        if (!shellItem._icon) return; // might be missing on submenus / separators

        let iconName = shellItem._dbusItem.get_icon_name();
        if (iconName) {
            shellItem._icon.icon_name = iconName;
            shellItem._icon.show();
        } else {
            let gicon = shellItem._dbusItem.get_gdk_icon();
            if (gicon) {
                shellItem._icon.gicon = gicon;
                shellItem._icon.show();
            }
        }
    },

    _updateVisible: function(shellItem) {
        shellItem.actor.visible = shellItem._dbusItem.is_visible();
    },

    _updateSensitive: function(shellItem) {
        //Cinnamon PopupMenuSection have not setSensitive
        if (!(shellItem instanceof this.MenuSectionMenuItemClass))
            shellItem.setSensitive(shellItem._dbusItem.is_enabled());
    },

    _replaceSelf: function(shellItem, dbusItem) {
        // create our new self if needed
        if (!shellItem)
            shellItem = this._createItem(dbusItem);
        // first, we need to find our old position
        let pos = -1;
        if(shellItem._parent) {
            let family = shellItem._parent.menu._getMenuItems();
            for (let i = 0; i < family.length; ++i) {
                if (family[i] === shellItem)
                    pos = i;
            }
        }

        if (pos < 0) {
            //throw new Error("DBusMenu: can't replace non existing menu item");
        } else {
            // add our new self while we're still alive
            shellItem._parent.menu.addMenuItem(shellItem, pos);
            // now destroy our old self
            shellItem.destroy();
        }
    },

    _getTopMenu: function(shellItem) {
        let actor = shellItem.actor;
        while (actor) {
            if ((actor._delegate) && (actor._delegate instanceof PopupMenu.PopupMenu))
               return actor._delegate;
            actor = actor.get_parent();
       }
       return null;
   },

    _moveItemInMenu: function(menu, dbusItem, newpos) {
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
};
Signals.addSignalMethods(MenuFactory.prototype);
