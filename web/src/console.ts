/** Console admin (console.meetflowai.site) — nhận diện theo hostname, cùng bundle với web thường. */
export const IS_CONSOLE = typeof window !== "undefined" && /^console\./.test(window.location.hostname);
