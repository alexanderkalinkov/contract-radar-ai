// Help video and support: settings shared by the server and the browser.

/** Topics in the "Contact support" form. The value goes in the email subject. */
export const SUPPORT_TOPICS = [
  { value: "bug", label: "Something isn't working" },
  { value: "question", label: "How do I…?" },
  { value: "data", label: "A contract or term looks wrong" },
  { value: "billing", label: "Billing or my plan" },
  { value: "account", label: "My account or sign-in" },
  { value: "idea", label: "An idea or feature request" },
] as const;

export type SupportTopic = (typeof SUPPORT_TOPICS)[number]["value"];

export const topicLabel = (v: string) => SUPPORT_TOPICS.find((t) => t.value === v)?.label ?? "Other";

/** Files people can attach to a support message (a screenshot, usually). */
export const SUPPORT_ATTACHMENT_MAX = 3 * 1024 * 1024;
export const SUPPORT_ATTACHMENT_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf", "text/plain"];

/** Browser-side flag so the tour doesn't pop up again before the sign-in token refreshes. */
export const tourSeenKey = (userId: string | undefined) => `cr-tour-seen-${userId ?? "demo"}`;
