"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, UserPlus, Phone, MessageSquare,
  Upload, Database, Settings, Shield, BarChart3, Clock,
  FileText, ChevronDown, Moon, Sun, Menu, X, Zap,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";

interface SidebarProps {
  user: {
    fullName: string;
    role: string;
    username: string;
  };
}

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/leads/new", label: "Add New Lead", icon: UserPlus },
  { href: "/leads/call", label: "Call Queue", icon: Phone },
];

const adminItems = [
  { label: "SIP", icon: Phone, children: [
    { href: "/admin/settings/sip", label: "SIP Settings" },
    { href: "/admin/calls", label: "Call History" },
  ]},
  { label: "Analytics", icon: BarChart3, children: [
    { href: "/admin/analytics", label: "Reports" },
    { href: "/admin/analytics/live", label: "Live / Calls" },
  ]},
  { label: "Data", icon: Database, children: [
    { href: "/leads/import", label: "Bulk Upload" },
    { href: "/admin/data", label: "Data Manager" },
    { href: "/admin/fields", label: "Custom Fields" },
  ]},
  { label: "External APIs", icon: Zap, children: [
    { href: "/sms", label: "SMS" },
  ]},
  { label: "System", icon: Settings, children: [
    { href: "/admin/users", label: "Users" },
    { href: "/admin/settings", label: "Settings" },
    { href: "/admin/security", label: "Security" },
    { href: "/admin/audit", label: "Audit Log" },
    { href: "/admin/performance", label: "Performance" },
  ]},
];

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["Data", "System"]));

  const toggleSection = (label: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-4 border-b border-border">
        <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground font-bold text-sm">
          C
        </div>
        <span className="font-semibold text-lg">Cyborg CRM</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              isActive(item.href)
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </Link>
        ))}

        {/* Admin sections */}
        {(user.role === "admin" || user.role === "processor") && (
          <div className="pt-4">
            <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Admin
            </p>
            {adminItems.map((section) => (
              <div key={section.label}>
                <button
                  onClick={() => toggleSection(section.label)}
                  className="flex items-center justify-between w-full px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <span className="flex items-center gap-3">
                    <section.icon className="w-4 h-4" />
                    {section.label}
                  </span>
                  <ChevronDown
                    className={cn(
                      "w-3 h-3 transition-transform",
                      expandedSections.has(section.label) && "rotate-180"
                    )}
                  />
                </button>
                {expandedSections.has(section.label) && section.children && (
                  <div className="ml-7 space-y-0.5 mt-0.5">
                    {section.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={() => setMobileOpen(false)}
                        className={cn(
                          "block px-3 py-1.5 rounded-md text-sm transition-colors",
                          isActive(child.href)
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        )}
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="border-t border-border px-4 py-3 space-y-2">
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors"
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          {theme === "dark" ? "Light Mode" : "Dark Mode"}
        </button>
        <div className="flex items-center gap-2 px-2">
          <div className="w-7 h-7 bg-primary/20 rounded-full flex items-center justify-center text-xs font-medium text-primary">
            {user.fullName.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user.fullName}</p>
            <p className="text-xs text-muted-foreground capitalize">{user.role}</p>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-3 left-3 z-50 p-2 bg-background border border-border rounded-lg"
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed lg:sticky top-0 left-0 z-40 h-screen w-[240px] bg-card border-r border-border flex flex-col transition-transform lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
