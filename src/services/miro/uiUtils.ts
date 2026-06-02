/**
 * Centralized notification utility for Miro Board.
 * Standardizes message truncation and styling.
 */
export const notify = async (msg: string, type: 'info' | 'error' = 'info'): Promise<void> => {
  if (!msg) return;
  
  // Miro notifications have a length limit and can be cut off.
  // Truncating to 80 chars ensures the core message is visible.
  const truncated = msg.length > 85 ? msg.substring(0, 82) + "..." : msg;
  
  try {
    if (typeof miro !== 'undefined' && miro.board && miro.board.notifications) {
      if (type === 'error') {
        await miro.board.notifications.showError(truncated);
      } else {
        await miro.board.notifications.showInfo(truncated);
      }
    }
  } catch (e: unknown) {
    console.warn("[uiUtils] Notification failed:", msg, e);
  }
};

/**
 * Utility to copy text to clipboard and notify user.
 */
export const copyAndNotify = async (text: string, label: string = "Data"): Promise<boolean> => {
  if (!text) {
    await notify(`Nothing to copy for ${label}`, 'error');
    return false;
  }

  try {
    // 1. Try modern Clipboard API
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(text);
        await notify(`Copied ${label} to clipboard`);
        return true;
      } catch (err: unknown) {
        console.warn("[uiUtils] navigator.clipboard failed, trying fallback", err);
      }
    }
    
    // 2. Fallback to legacy execCommand('copy')
    try {
      if (typeof document !== 'undefined') {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        
        // Ensure the textarea is not visible but part of the DOM
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        document.body.appendChild(textArea);
        
        textArea.focus();
        textArea.select();
        
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        
        if (successful) {
          await notify(`Copied ${label} to clipboard`);
          return true;
        }
      }
    } catch (err: unknown) {
      console.error("[uiUtils] Fallback copy failed", err);
    }
    
    await notify(`Failed to copy ${label}`, 'error');
    return false;
  } catch (e: unknown) {
    await notify(`Failed to copy ${label}`, 'error');
    return false;
  }
};
