"""Give one X11 window a new WM_CLASS, so GNOME shows the icon of the desktop entry with that StartupWMClass.
Usage: python3 set_window_class.py <window id, e.g. 0x2e00eae> [class, default QuestsIDE]
Lasts until the window closes. Used to give the Firefox window running the quests UI the rainbow icon
(quests/system/quests-ide.desktop, linked into ~/.local/share/applications)."""
import ctypes, sys


class XClassHint(ctypes.Structure):
    _fields_ = [('res_name', ctypes.c_char_p), ('res_class', ctypes.c_char_p)]


x11 = ctypes.cdll.LoadLibrary('libX11.so.6')
x11.XOpenDisplay.restype = ctypes.c_void_p
x11.XSetClassHint.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.POINTER(XClassHint)]
x11.XFlush.argtypes = [ctypes.c_void_p]
x11.XCloseDisplay.argtypes = [ctypes.c_void_p]

display = x11.XOpenDisplay(None)
assert display, 'cannot open the X display'
name = (sys.argv[2] if len(sys.argv) > 2 else 'QuestsIDE').encode()
x11.XSetClassHint(display, int(sys.argv[1], 16), ctypes.byref(XClassHint(name, name)))
x11.XFlush(display)
x11.XCloseDisplay(display)
