export async function captureElement(element, options) {
  const mod = await import("html2canvas");
  const html2canvas = mod.default ?? mod;
  return html2canvas(element, options);
}
