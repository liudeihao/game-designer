import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { loadTheme, toggleTheme, type ThemeId } from "../theme";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

export function ThemeToggle() {
  const [theme, setThemeState] = useState<ThemeId>(loadTheme);
  const label = theme === "dark" ? "切换到浅色" : "切换到深色";

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={label}
            onClick={() => setThemeState(toggleTheme())}
          >
            {theme === "dark" ? <Sun /> : <Moon />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
