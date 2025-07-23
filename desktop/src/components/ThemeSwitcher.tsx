import { Monitor, Moon, Sun } from 'lucide-react';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useThemeStore } from '@/stores/theme-store';

const themes = [
  { value: 'light', label: '☀️ Light', icon: Sun },
  { value: 'dark', label: '🌙 Dark', icon: Moon },
  { value: 'system', label: '💻 System', icon: Monitor },
] as const;

export function ThemeSwitcher() {
  const { theme, setTheme } = useThemeStore();

  return (
    <Select value={theme} onValueChange={setTheme}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select theme" />
      </SelectTrigger>
      <SelectContent>
        {themes.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            <div className="flex items-center gap-2">
              <span>{item.label}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
