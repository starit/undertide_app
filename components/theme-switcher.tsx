"use client";

import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const themes = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
        <Sun className="size-3.5" />
        Theme
      </span>
      <Select value={theme} onValueChange={setTheme}>
        <SelectTrigger aria-label="Select theme" className="w-[110px] min-w-0">
          <SelectValue placeholder="Theme" />
        </SelectTrigger>
        <SelectContent align="end" className="bg-card/95 backdrop-blur-none">
          <SelectGroup>
            <SelectLabel>Theme</SelectLabel>
            {themes.map(({ value, label, icon: Icon }) => (
              <SelectItem key={value} value={value}>
                <span className="flex items-center gap-2">
                  <Icon className="size-3.5" />
                  {label}
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}
