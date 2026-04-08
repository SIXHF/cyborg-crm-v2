"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Sends presence heartbeat every 30 seconds so the server knows we're online.
// Also sends on every page navigation.
export function PresenceHeartbeat() {
  const pathname = usePathname();

  useEffect(() => {
    function sendHeartbeat() {
      // Determine module/action from current path
      let module = "dashboard";
      let action = "viewing";
      if (pathname.startsWith("/leads/import")) { module = "import"; action = "importing"; }
      else if (pathname.startsWith("/leads/new")) { module = "leads"; action = "creating"; }
      else if (pathname.startsWith("/leads/call")) { module = "calls"; action = "calling"; }
      else if (pathname.match(/^\/leads\/\d+\/edit/)) { module = "leads"; action = "editing"; }
      else if (pathname.match(/^\/leads\/\d+/)) { module = "leads"; action = "viewing"; }
      else if (pathname.startsWith("/leads")) { module = "leads"; action = "browsing"; }
      else if (pathname.startsWith("/sms")) { module = "sms"; action = "messaging"; }
      else if (pathname.startsWith("/admin")) { module = "admin"; action = "managing"; }
      else if (pathname.startsWith("/profile")) { module = "profile"; action = "viewing"; }

      fetch("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module, action, pageUrl: pathname }),
      }).catch(() => {}); // silent fail
    }

    // Send immediately on page load / navigation
    sendHeartbeat();

    // Then every 30 seconds
    const interval = setInterval(sendHeartbeat, 30000);
    return () => clearInterval(interval);
  }, [pathname]);

  return null; // no UI
}
