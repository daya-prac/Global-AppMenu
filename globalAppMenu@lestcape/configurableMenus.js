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

const PopupMenu = imports.ui.popupMenu;
const BoxPointer = imports.ui.boxpointer;
const Clutter = imports.gi.Clutter;
const Gtk = imports.gi.Gtk;
const Main = imports.ui.main;
const St = imports.gi.St;
const Tweener = imports.ui.tweener;
const Lang = imports.lang;

function PopupMenuSectionMenuItem() {
    this._init.apply(this, arguments);
}

PopupMenuSectionMenuItem.prototype = {
    __proto__: PopupMenu.PopupSubMenuMenuItem.prototype,

    _init: function() {
        PopupMenu.PopupBaseMenuItem.prototype._init.call(this);
        this.actor.add_style_class_name('popup-submenu-menu-item');
        this.actor.add_style_class_name('popup-section-menu-item');
        this.menu = new PopupMenu.PopupSubMenu(this.actor);
        this.menu.actor.show();
    },

    _onKeyPressEvent: function(actor, event) {
        return PopupMenu.PopupBaseMenuItem.prototype._onKeyPressEvent.call(this, actor, event);
    },

    activate: function(event) { },
    _onButtonReleaseEvent: function(actor) {}
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
            maxHeightBottom = 0;
            maxHeightTop = 0;
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
         if(actor._delegate && actor._delegate instanceof ConfigurableMenu)
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
         let m = this._getTopMenu(sourceActor);
         if(Main.panelManager) {
            if(((maxHeightBottom == 0)||(maxHeightTop==0))&&(m)&&(m._arrowSide == St.Side.TOP)) {
               resY = Math.min(resY, monitor.y + monitor.height - (natHeight));
            } else {
               resY = Math.min(resY, monitor.y + monitor.height - (maxPHV + natHeight));
            }
         } else {
            if((!Main.panel2)&&(m)&&(m._arrowSide == St.Side.TOP)) {
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

function ConfigurableMenu(launcher, orientation, subMenu) {
   this._init(launcher, orientation, subMenu);
}

ConfigurableMenu.prototype = {
     __proto__: PopupMenu.PopupMenu.prototype,

   _init: function(launcher, orientation, subMenu) {
      PopupMenu.PopupMenuBase.prototype._init.call (this, launcher.actor, 'popup-menu-content');
      try {
         this._arrowAlignment = 0.0;
         this._arrowSide = orientation;
         this.subMenu = subMenu;
         this.effectType = "none";
         this.effectTime = 0.4;

         this._boxPointer = new ConfigurablePointer(orientation,
                                                    { x_fill: true,
                                                      y_fill: true,
                                                      x_align: St.Align.START });
         this.actor = this._boxPointer.actor;
         Main.uiGroup.add_actor(this.actor);

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

   on_paint: function(actor) {
      if(Main.popup_rendering)
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
      Applet.AppletPopupMenu.prototype.open.call(this, animate);
   },

   closeClean: function(animate) {
      Applet.AppletPopupMenu.prototype.close.call(this, animate);
   },

   open: function(animate) {
      /*if(this.subMenu)
         this.subMenu.close();*/
      if(!this.isOpen) {
         this.openClean();
         this.repositionActor(this.sourceActor);
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
            Applet.AppletPopupMenu.prototype.close.call(this, false);
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
            
            Applet.AppletPopupMenu.prototype.close.call(this, false);
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
            Applet.AppletPopupMenu.prototype.close.call(this, false);
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
            Applet.AppletPopupMenu.prototype.close.call(this, false);
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
            Applet.AppletPopupMenu.prototype.close.call(this, false);
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
            Applet.AppletPopupMenu.prototype.close.call(this, false);
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
      Applet.AppletPopupMenu.prototype.destroy.call(this);
   }
};

function ConfigurablePopupMenu(parent, parentMenu, orientation) {
   this._init(parent, parentMenu, orientation);
};

ConfigurablePopupMenu.prototype = {
   __proto__: ConfigurableMenu.prototype,

   _init: function(parent, parentMenu, orientation) {
      ConfigurableMenu.prototype._init.call(this, parentMenu, orientation);
      this.parent = parent;
      this.parentMenu = parentMenu;
      this.fixScreen = false;
      if(this.parentMenu instanceof ConfigurableMenu)
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
         if(fixScreen) {
            this._boxPointer.fixToScreen(this.parent.menu.actor, fixScreen);
         } else {
            this._boxPointer.fixToScreen(this.parentMenu.actor, fixScreen);
         }
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
      if((this.parentMenu != this.parent)&&(!this.parentMenu.isOpen))
         return;
      //(Dalcde idea)Temporarily change source actor to Main.uiGroup to "trick"
      // the menu manager to think that right click submenus are part of it.
      this.parentMenu.sourceActor = Main.uiGroup;
      Applet.AppletPopupMenu.prototype.open.call(this, animate);
   },

   close: function(animate) {
      this.parentMenu.sourceActor = this.parent.actor;
      Applet.AppletPopupMenu.prototype.close.call(this, animate);
      if((this.parentMenu.isOpen)&&(this.parent.searchEntry))
         this.parent.searchEntry.grab_key_focus();
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

function ConfigurableMenuApplet(launcher, orientation) {
   this._init(launcher, orientation);
}

ConfigurableMenuApplet.prototype = {
    __proto__: PopupMenu.PopupMenuBase.prototype,

   _init: function(launcher, orientation) {
      PopupMenu.PopupMenuBase.prototype._init.call(this, launcher.actor, 'popup-menu-content');
      this.launcher = launcher;
      this.orientation = orientation;
      this.actor = this.box;
      this.actor.vertical = false;
   },

   open: function() {
      this.actor.show();
   },

   close: function() {
      this.actor.hide();
   },
};
/*
function ConfigurableSubMenuMenuItem() {
    this._init.apply(this, arguments);
}

ConfigurableSubMenuMenuItem.prototype = {
    __proto__: PopupSubMenuMenuItem.prototype,

    _init: function(text, hide_expander) {
        PopupSubMenuMenuItem.prototype._init.call(this);
    },

    set_subMenu: function(menu) {
        this.menu.destroy();
        this.menu = menu;
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
