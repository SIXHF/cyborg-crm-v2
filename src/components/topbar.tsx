"use client";

import { Bell, LogOut } from "lucide-react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface TopbarProps {
  title: string;
  user: { fullName: string; role: string };
}

export function Topbar({ title, user }: TopbarProps) {
  const router = useRouter();
  const [notifCount, setNotifCount] = useState(0);

  // Fetch unread notification count
  useEffect(() => {
    async function fetchCount() {
      try {
        const res = await fetch("/api/notifications?unread=true");
        if (res.ok) {
          const data = await res.json();
          setNotifCount(Array.isArray(data) ? data.length : 0);
        }
      } catch {}
    }
    fetchCount();
    const interval = setInterval(fetchCount, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 h-14 bg-card/80 backdrop-blur border-b border-border flex items-center justify-between px-6">
      <h1 className="text-lg font-semibold">{title}</h1>
      <div className="flex items-center gap-3">
        <button className="relative p-2 text-muted-foreground hover:text-foreground transition-colors">
          <Bell className="w-5 h-5" />
          {notifCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
              {notifCount > 9 ? "9+" : notifCount}
            </span>
          )}
        </button>
        <span className="text-sm text-muted-foreground hidden sm:inline">{user.fullName}</span>
        <button
          onClick={handleLogout}
          className="p-2 text-muted-foreground hover:text-foreground transition-colors"
          title="Sign Out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
