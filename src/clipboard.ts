// Desktop writes through the narrow main-process API; browser preview uses Web API.
export async function copyText(text: string): Promise<void> {
  if (window.desktop) await window.desktop.copyText(text);
  else await navigator.clipboard.writeText(text);
}
