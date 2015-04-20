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

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Main = imports.ui.main;

const AppletPath = imports.ui.appletManager.applets['globalAppMenu@lestcape'];
const AppletDir = imports.ui.appletManager.appletMeta['globalAppMenu@lestcape'].path;
const interfacesDir = Gio.file_new_for_path(AppletDir).get_child("interfaces-xml");

const DBusMenu = loadInterfaceXml("DBusMenu.xml");
const DBusRegistrar = loadInterfaceXml("DBusRegistrar.xml");
const DBusGtkMenu = loadInterfaceXml("DBusGtkMenu.xml");
const ActionsGtk = loadInterfaceXml("ActionsGtk.xml");

/**
 * loads a xml file into an in-memory string
 */
function loadInterfaceXml(filename) {

    let file = interfacesDir.get_child(filename);

    let [ result, contents ] = GLib.file_get_contents(file.get_path());

    if (result) {
        //HACK: The "" + trick is important as hell because file_get_contents returns
        // an object (WTF?) but Gio.makeProxyWrapper requires `typeof() == "string"`
        // Otherwise, it will try to check `instanceof XML` and fail miserably because there
        // is no `XML` on very recent SpiderMonkey releases (or, if SpiderMonkey is old enough,
        // will spit out a TypeError soon).
        return "<node>" + contents + "</node>";
    } else {
        throw new Error("AppIndicatorSupport: Could not load file: "+filename);
    }
};

/**
 * will take the given signals and handlers, connect them to the object
 * and push the id needed to disconnect it into the given array.
 * the id array is returned, too
 *
 * if you do not pass a predefined array, it will be created for you.
 */
const connectAndSaveId = function(target, handlers /* { "signal": handler } */, idArray) {
    idArray = typeof idArray != 'undefined' ? idArray : [];
    for (let signal in handlers) {
        idArray.push(target.connect(signal, handlers[signal]));
    }
    return idArray;
}

/**
 * will connect the given handlers to the object, and automatically disconnect them
 * when the 'destroy' signal is emitted
 */
const connectAndRemoveOnDestroy = function(target, handlers, /* optional */ destroyTarget, /* optional */ destroySignal) {
    var ids, destroyId;

    ids = connectAndSaveId(target, handlers);

    if (typeof destroyTarget == 'undefined') destroyTarget = target;
    if (typeof destroySignal == 'undefined') destroySignal = 'destroy';

//    if (!destroyTarget.connect)
//        return;

    destroyId = destroyTarget.connect(destroySignal, function() {
        disconnectArray(target, ids);
        destroyTarget.disconnect(destroyId);
    });
}

/**
 * disconnect an array of signal handler ids. The ids are then removed from the array.
 */
const disconnectArray = function(target, idArray) {
    for (let handler = idArray.shift(); handler !== undefined; handler = idArray.shift()) {
        target.disconnect(handler);
    }
}

/**
 * connects a handler and removes it after the first call, or if the source object is destroyed
 */
const connectOnce = function(target, signal, handler, /* optional */ destroyTarget, /* optional */ destroySignal) {
    var signalId, destroyId;

    if (typeof destroyTarget == 'undefined') destroyTarget = target;
    if (typeof destroySignal == 'undefined') destroySignal = 'destroy';

    signalId = target.connect(signal, function() {
        target.disconnect(signalId);
        handler.apply(this, arguments);
    })

    if (!destroyTarget.connect)
        return;

    destroyId = destroyTarget.connect(destroySignal, function() {
        target.disconnect(signalId);
    })
}

/**
 * Workaround for https://bugzilla.gnome.org/show_bug.cgi?id=734071
 *
 * Will append the given name with a number to distinguish code loaded later from the last loaded version
 */
const WORKAROUND_RELOAD_TYPE_REGISTER = function(name) {
    return 'Gjs_' + name + '__' + global['--appindicator-loaded-count'];
}

function TerminalReader(command, callback) {
   this._init(command, callback);
}

TerminalReader.prototype = {
   _init: function(command, callback) {
      this._callbackPipe = callback;
      this._commandPipe = command;
      this.idle = true;
      this._childWatch = null;
   },

   executeReader: function() {
      if(this.idle) {
         this.idle = false;
         try {
            let [success, argv] = GLib.shell_parse_argv("sh -c '" + this._commandPipe + "'");
            if(success) {
               let [exit, pid, stdin, stdout, stderr] =
                    GLib.spawn_async_with_pipes(null, /* cwd */
                                                argv, /* args */
                                                null, /* env */
                                                GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD, /*Use env path and no repet*/
                                                null /* child_setup */);

               this._childPid = pid;
               this._stdin = new Gio.UnixOutputStream({ fd: stdin, close_fd: true });
               this._stdout = new Gio.UnixInputStream({ fd: stdout, close_fd: true });
               this._stderr = new Gio.UnixInputStream({ fd: stderr, close_fd: true });
         
               // We need this one too, even if don't actually care of what the process
               // has to say on stderr, because otherwise the fd opened by g_spawn_async_with_pipes
               // is kept open indefinitely
               this._stderrStream = new Gio.DataInputStream({ base_stream: this._stderr });
               this._dataStdout = new Gio.DataInputStream({ base_stream: this._stdout });
               this._cancellableStderrStream = new Gio.Cancellable();
               this._cancellableStdout = new Gio.Cancellable();

               this.resOut = 1;
               this._readStdout();
               this.resErr = 1;
               this._readStderror();

               this._childWatch = GLib.child_watch_add(GLib.PRIORITY_DEFAULT, pid, Lang.bind(this, function(pid, status, requestObj) {
                  GLib.source_remove(this._childWatch);
                  this._childWatch = null;
                  this._stdin.close(null);
                  this.idle = true;
               }));
            }
            //throw
         } catch(err) {
            if (err.code == GLib.SpawnError.G_SPAWN_ERROR_NOENT) {
               err.message = _("Command not found.");
            } else {
               // The exception from gjs contains an error string like:
               //   Error invoking GLib.spawn_command_line_async: Failed to
               //   execute child process "foo" (No such file or directory)
               // We are only interested in the part in the parentheses. (And
               // we can't pattern match the text, since it gets localized.)
               err.message = err.message.replace(/.*\((.+)\)/, '$1');
            }
            throw err;
         }
      }
   },

   destroy: function() {
      try {
         if(this._childWatch) {
            GLib.source_remove(this._childWatch);
            this._childWatch = null;
         }
         if(!this._dataStdout.is_closed()) {
            this._cancellableStdout.cancel();
            this._stdout.close_async(0, null, Lang.bind(this, this.closeStdout));
         }
         if(!this._stderrStream.is_closed()) {
            this._cancellableStderrStream.cancel();
            this._stderrStream.close_async(0, null, Lang.bind(this, this.closeStderrStream));
         }
         this._stdin.close(null);
         this.idle = true;
      }
      catch(e) {
         Main.notify("Error on close" + this._dataStdout.is_closed(), e.message);
      }
   },

   closeStderrStream: function(std, result) {
      try {
        std.close_finish(result);
      } catch(e) {
         std.close_async(0, null, Lang.bind(this, this.closeStderrStream));
      }
   },

   closeStdout: function(std, result) {
      try {
        std.close_finish(result);
      } catch(e) {
         std.close_async(0, null, Lang.bind(this, this.closeStderrStream));
      }
   },

   _readStdout: function() {
      this._dataStdout.fill_async(-1, GLib.PRIORITY_DEFAULT, this._cancellableStdout, Lang.bind(this, function(stream, result) {
         try {
            if(!this._dataStdout.is_closed()) {
               if(this.resOut != -1)
                  this.resOut = this._dataStdout.fill_finish(result);// end of file
               if(this.resOut == 0) {
                  let val = stream.peek_buffer().toString();
                  if(val != "")
                     this._callbackPipe(this._commandPipe, true, val);
                  this._stdout.close(this._cancellableStdout);
               } else {
                  // Try to read more
                  this._dataStdout.set_buffer_size(2 * this._dataStdout.get_buffer_size());
                  this._readStdout();
               }
            }
         } catch(e) {
            global.log(e.toString());
         }
      }));
   },

   _readStderror: function() {
      this._stderrStream.fill_async(-1, GLib.PRIORITY_DEFAULT, this._cancellableStderrStream, Lang.bind(this, function(stream, result) {
         try {
            if(!this._stderrStream.is_closed()) {
               if(this.resErr != -1)
                  this.resErr = this._stderrStream.fill_finish(result);
               if(this.resErr == 0) { // end of file
                  let val = stream.peek_buffer().toString();
                  if(val != "")
                     this._callbackPipe(this._commandPipe, false, val);
                  this._stderr.close(null);
               } else {
                  this._stderrStream.set_buffer_size(2 * this._stderrStream.get_buffer_size());
                  this._readStderror();
               }
            }
         } catch(e) {
            global.log(e.toString());
         }
      }));
   }
};

function SystemProperties() {
    this._init.apply(this, arguments);
}

SystemProperties.prototype = {

    _init: function() {
        this.xsetting = new Gio.Settings({ schema: 'org.cinnamon.settings-daemon.plugins.xsettings' });
    },

    set_shell_shows_appmenu: function(show) {
        this._override_bool_xsetting('Gtk/ShellShowsAppMenu', show);
    },

    set_shell_shows_menubar: function(show) {
        this._override_bool_xsetting('Gtk/ShellShowsMenubar', show);
    },

    active_unity_gtk_module: function(active) {
        let is_ready = false;
        let env_gtk = this._get_env_gtk_modules();
        let x_gtk = this._get_x_gtk_modules();
        if(active) {
            if(env_gtk) {
                if(env_gtk.indexOf("unity-gtk-module") == -1) {
                    env_gtk.push("unity-gtk-module");
                    this._set_env_gtk_modules(env_gtk);
                } else {
                    is_ready = true;
                }
            } else  {
                env_gtk = ["unity-gtk-module"];
                this._set_env_gtk_modules(env_gtk);
            }
            if(x_gtk) {
                if(x_gtk.indexOf("unity-gtk-module") == -1) {
                    x_gtk.push("unity-gtk-module");
                    this._set_x_gtk_modules(x_gtk);
                } else {
                    is_ready = true;
                }
            } else  {
                x_gtk = ["unity-gtk-module"];
                this._set_x_gtk_modules(x_gtk);
            }
        } else {
            if(env_gtk) {
                let pos = env_gtk.indexOf("unity-gtk-module")
                if(pos != -1) {
                    env_gtk.splice(pos, -1);
                    this._set_env_gtk_modules(env_gtk);
                } else {
                    is_ready = true;
                }
            } else if(x_gtk) {
                let pos = x_gtk.indexOf("unity-gtk-module")
                if(pos != -1) {
                    x_gtk.splice(pos, -1);
                    this._set_x_gtk_modules(x_gtk);
                } else {
                    is_ready = true;
                }
            } else  {
                is_ready = true;
            }
        }
        return is_ready;
    },

    active_unity_menu_proxy: function(active) {
        let env_ubu = GLib.getenv('UBUNTU_MENUPROXY');
        if(env_ubu != "1") {
            GLib.setenv('UBUNTU_MENUPROXY', "1", true);
            return false;
        }
        return true;
    },

    _override_bool_xsetting: function(xsetting, show) {
        let values = this.xsetting.get_value('overrides').deep_unpack();
        if(show) {
            if(xsetting in values) {
                let status = values[xsetting]
                if(status != 1) {
                    values[xsetting] = GLib.Variant.new('i', 1);
                    let return_value = GLib.Variant.new('a{sv}', values);
                    this.xsetting.set_value('overrides', return_value);
                }
            } else {
                values[xsetting] = GLib.Variant.new('i', 1);
                let return_value = GLib.Variant.new('a{sv}', values);
                this.xsetting.set_value('overrides', return_value);
            }
        } else if(xsetting in values) {
            let status = values[xsetting]
            if(status != 0) {
                values[xsetting] = GLib.Variant.new('i', 0); 
                let return_value = GLib.Variant.new('a{sv}', values);
                this.xsetting.set_value('overrides', return_value);
            }
        }
    },

    _get_env_gtk_modules: function() {
        let env_gtk = GLib.getenv('GTK_MODULES');
        if(env_gtk)
            return env_gtk.split(":");
        return null;
    },

    _set_env_gtk_modules: function(env_gtk_list) {
        let env_gtk = "";
        for(let i in env_gtk_list) {
            if(i == 0) {
                env_gtk += env_gtk_list[i];
            } else if(env_gtk.indexOf("unity-gtk-module" ) == -1) {
               env_gtk += ":" + env_gtk_list[i];
            }
        }
        GLib.setenv('GTK_MODULES', env_gtk, true);
    },

    _get_x_gtk_modules: function() {
        return this.xsetting.get_strv('enabled-gtk-modules');
    },

    _set_x_gtk_modules: function(env_gtk_list) {
        this.xsetting.set_strv('enabled-gtk-modules', env_gtk_list);
    },

    _is_cinnamon_session_start: function() {
        let string_file = this._readFile(GLib.get_home_dir() + "/.xsession-errors");
        return ((!string_file) || (string_file.indexOf("About to start Cinnamon") == string_file.lastIndexOf("About to start Cinnamon")));
    },

    _readFile: function(path) {
        try {
            let file = Gio.file_new_for_path(path);
            if(file.query_exists(null))
            {
                let fstream = file.read(null);
                let dstream = new Gio.DataInputStream({ base_stream: fstream });
                let data = dstream.read_until("", null);
                fstream.close(null);
                return data.toString();
            }
        } catch(e) {
            Main.notifyError(_("Error:"), e.message);
        }
        return null;
    }
};

const system = new SystemProperties();
