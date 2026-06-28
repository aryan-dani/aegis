// Prevents an additional console window on Windows for both debug and release builds.
#![cfg_attr(windows, windows_subsystem = "windows")]

fn main() {
    aegis_lib::run()
}
