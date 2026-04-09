"use client";

import { Bell, LogOut, X } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

interface TopbarProps {
  title: string;
  user: { fullName: string; role: string };
}

export function Topbar({ title, user }: TopbarProps) {
  const router = useRouter();
  const [notifCount, setNotifCount] = useState(0);
  const [showNotifs, setShowNotifs] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loadingNotifs, setLoadingNotifs] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowNotifs(false);
      }
    }
    if (showNotifs) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showNotifs]);

  const fetchNotifications = useCallback(async () => {
    setLoadingNotifs(true);
    try {
      const res = await fetch("/api/notifications?unread=true");
      if (res.ok) {
        const data = await res.json();
        setNotifications(Array.isArray(data) ? data.slice(0, 10) : []);
      }
    } catch {} finally {
      setLoadingNotifs(false);
    }
  }, []);

  function toggleNotifs() {
    if (!showNotifs) {
      fetchNotifications();
    }
    setShowNotifs(!showNotifs);
  }

  async function markAllRead() {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      });
      setNotifCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {}
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 h-14 bg-card/80 backdrop-blur border-b border-border flex items-center justify-between px-6">
      <h1 className="text-lg font-semibold">{title}</h1>
      <div className="flex items-center gap-3">
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={toggleNotifs}
            className="relative p-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Bell className="w-5 h-5" />
            {notifCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
                {notifCount > 9 ? "9+" : notifCount}
              </span>
            )}
          </button>
          {showNotifs && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-xl shadow-lg overflow-hidden z-50">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h4 className="text-sm font-semibold">Notifications</h4>
                <div className="flex items-center gap-2">
                  {notifCount > 0 && (
                    <button onClick={markAllRead} className="text-xs text-primary hover:underline">
                      Mark all read
                    </button>
                  )}
                  <button onClick={() => setShowNotifs(false)} className="p-0.5 text-muted-foreground hover:text-foreground">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {loadingNotifs ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Loading...</p>
                ) : notifications.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No unread notifications</p>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`px-4 py-3 border-b border-border/50 last:border-0 hover:bg-muted/30 ${!n.isRead ? "bg-primary/5" : ""}`}
                    >
                      <p className="text-sm font-medium">{n.title || n.type}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                      {n.createdAt && (
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {new Date(n.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
              <div className="px-4 py-2 border-t border-border">
                <Link
                  href="/admin/audit"
                  onClick={() => setShowNotifs(false)}
                  className="text-xs text-primary hover:underline"
                >
                  View all activity
                </Link>
              </div>
            </div>
          )}
        </div>
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
