/**
 * Centralized notification utility for Miro Board.
 * Standardizes message truncation and styling.
 */
export const notify = async (msg: string, type: 'info' | 'error' = 'info') => {
  if (!msg) return;
  
  // Miro notifications have a length limit and can be cut off.
  // Truncating to 80 chars ensures the core message is visible.
  const truncated = msg.length > 85 ? msg.substring(0, 82) + "..." : msg;
  
  try {
    if (type === 'error') {
      await miro.board.notifications.showError(truncated);
    } else {
      await miro.board.notifications.showInfo(truncated);
    }
  } catch (e) {
    console.warn("[uiUtils] Notification failed:", msg);
  }
};

/**
 * Utility to copy text to clipboard and notify user.
 */
export const copyAndNotify = async (text: string, label: string = "Data") => {
  try {
    // This requires a browser environment
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      await notify(`Copied ${label} to clipboard`);
      return true;
    }
    return false;
  } catch (e) {
    await notify(`Failed to copy ${label}`, 'error');
    return false;
  }
};
