"use client";

import { useEffect } from "react";

/**
 * If Supabase sends an invite or sign-in link to the Site URL instead of /auth/confirm
 * (for example when /auth/confirm isn't in the allowed redirect URLs), the tokens arrive
 * in the hash of whatever page loads. Forward them to /auth/confirm.
 */
export function AuthHashForwarder() {
  useEffect(() => {
    const { hash, pathname } = window.location;
    if (pathname !== "/auth/confirm" && /(^|[#&])(access_token|error_description)=/.test(hash)) {
      window.location.replace(`/auth/confirm${hash}`);
    }
  }, []);
  return null;
}
