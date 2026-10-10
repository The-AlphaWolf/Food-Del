/** Shared by the pre-paint script (server-rendered) and the theme store (browser). */
export const THEME_STORAGE_KEY = "fd-theme";
export const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * Runs in <head> before first paint so the page never flashes the wrong theme. Kept tiny and
 * dependency-free; mirrors `resolve()` in lib/theme.ts.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_STORAGE_KEY}");var d=p==="dark"||(p!=="light"&&matchMedia("${DARK_QUERY}").matches);document.documentElement.dataset.theme=d?"dark":"light"}catch(e){}})()`;
