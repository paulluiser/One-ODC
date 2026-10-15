"use client";
import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
const subscribeReady = () => () => {};
export function ThemeSelect() {
  const { setTheme, theme } = useTheme();
  const ready = useSyncExternalStore(
    subscribeReady,
    () => true,
    () => false,
  );
  return (
    <div role="group" className="theme-controls" aria-label="Appearance">
      <button
        aria-label="Use light theme"
        title="Light"
        aria-pressed={ready && theme === "light"}
        onClick={() => setTheme("light")}
      >
        <Sun size={16} />
      </button>
      <button
        aria-label="Use dark theme"
        title="Dark"
        aria-pressed={ready && theme === "dark"}
        onClick={() => setTheme("dark")}
      >
        <Moon size={16} />
      </button>
      <button
        aria-label="Follow system theme"
        title="System"
        aria-pressed={ready && theme === "system"}
        onClick={() => setTheme("system")}
      >
        <Monitor size={16} />
      </button>
    </div>
  );
}
