import assert from "node:assert/strict";
import {
  SHELL_LAYOUT_DESKTOP_VIEWPORT,
  SHELL_LAYOUT_MOBILE_VIEWPORT,
  SHELL_LAYOUT_STORAGE_KEY,
  isShellLayoutMode
} from "../lib/shell-layout/constants";
import { SHELL_LAYOUT_BOOT_SCRIPT } from "../lib/shell-layout/boot-script";

assert.equal(SHELL_LAYOUT_STORAGE_KEY, "fitdog_shell_layout");
assert.equal(isShellLayoutMode("mobile"), true);
assert.equal(isShellLayoutMode("desktop"), true);
assert.equal(isShellLayoutMode("auto"), false);
assert.match(SHELL_LAYOUT_MOBILE_VIEWPORT, /width=390/);
assert.match(SHELL_LAYOUT_DESKTOP_VIEWPORT, /width=1280/);
assert.match(SHELL_LAYOUT_BOOT_SCRIPT, /fitdog_shell_layout/);
assert.match(SHELL_LAYOUT_BOOT_SCRIPT, /dataset\.shell/);
assert.match(SHELL_LAYOUT_BOOT_SCRIPT, /viewport/);

console.log("shell-layout ok");
