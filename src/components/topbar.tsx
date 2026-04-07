"use client";

import { Bell } from "lucide-react";
import { useState } from "react";

interface TopbarProps {
  title: string;
  user: { fullName: string; role: string };
}

export function Topbar({ title, user }: TopbarProps) {
  const [notifCount] = useState(0);

  return (
    <header className="sticky top-0 z-30 h-14 bg-card/80 backdrop-blur border-b border-border flex items-center justify-between px-6">
      <h1 className="text-lg font-semibold">{title}</h1>
      <div className="flex items-center gap-4">
        <button className="relative p-2 text-muted-foreground hover:text-foreground transition-colors">
          <Bell className="w-5 h-5" />
          {notifCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
              {notifCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
