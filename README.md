Cinnamon Applet: Global Application Menu Version: v0.0-Beta

Last update: 20 april 2015

***
Special thanks to:

- rgcjonas             (https://github.com/rgcjonas)               Help providing the initial code.
- Canonical devs       (jpegrande@gmail.com)                       The protocols.
- Cinnamon devs        (https://github.com/linuxmint/Cinnamon)     Help providing support (specially: https://github.com/mtwebster).

--------------
Description
--------------
This extension integrates the Ubuntu AppMenu (Global Menu) support into Cinnamon Desktop.

It's based on the Gnome Shell extension made by rgcjonas: https://github.com/rgcjonas/gnome-shell-extension-appindicator

Known issues:
--------------
* The applet could takes ages to load and can freeze cinnamon forever. This is probably caused by the insane amount of embedded PNG icons. Try at your own risk.
* There are some unsupported application that can not be integrate into the applet, like evince, also Firefox drop the menu after some time.

https://bugs.launchpad.net/plasma-widget-menubar/+bug/878165

Change log
--------------
0.0-Beta
   - Not released.

This program is free software:
--------------
You can redistribute it and/or modify it under the terms of the GNU General Public License as published by the
Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied
warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with this program.
If not, see http://www.gnu.org/licenses/.

Guidelines for bug reports
--------------
Unfortunately, this applet is not completely bug free and will probably never be.
In order to successfully resolve the issues you need to provide some data:

* Your distribution, Shell version and extension version (something like "latest git" or "latest from spices" is sufficient).
* Instructions how to reproduce it. **This is the single most important point**. Bugs that [can't be reproduced](http://xkcd.com/583/) can't be fixed either.
* Bugs which don't provide the necessary information may be closed as "invalid" without prior notice.

To report bugs, request new features and make suggestions, please visit:
https://github.com/lestcape/Global-AppMenu/issues

You can also send us pull requests:
https://github.com/lestcape/Global-AppMenu/pulls

Installation Instructions:
--------------
1. Install the unity-gtk-module package.
2. Restart your computer.
3. Download this applet from their website : https://github.com/lestcape/Global-AppMenu
4. Unzip the downloaded file and copy the folder globalAppMenu@lestcape at ~/.local/share/cinnamon/applets/
5. Enable the applet in Cinnamon Settings.
6. Logout and login again.

To remove, disable the applet, reset the gsettings values:
gsettings reset org.cinnamon.settings-daemon.plugins.xsettings overrides
gsettings reset org.cinnamon.settings-daemon.plugins.xsettings enabled-gtk-modules

If you don't use unity desktop, remove the package, unity-gtk-module.
Restart your computer.

==============
Thank you very much for using this product.
Lester.
